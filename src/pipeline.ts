import { getCV } from './cv.js';
import type { NormalizedOptions, DeskewOkResult } from './types.js';

export interface AngleEstimate {
  angle: number;
  confidence: number;
  orientation: DeskewOkResult['orientation'];
}

/**
 * Запускает OpenCV-пайплайн на рабочей копии изображения:
 *   grayscale raw → GaussianBlur → Canny → findContours → minAreaRect → угол.
 *
 * @param raw - буфер с 8-битными grayscale пикселями
 * @param width - ширина изображения
 * @param height - высота изображения
 * @param options - нормализованные опции
 * @returns угол, уверенность и ориентацию
 */
export async function estimateAngle(
  raw: Buffer,
  width: number,
  height: number,
  options: NormalizedOptions,
): Promise<AngleEstimate> {
  const cv = await getCV();

  // Создаём cv.Mat из grayscale буфера.
  // matFromArray принимает Buffer и Uint8Array напрямую — копирования в Array не нужно.
  const src = cv.matFromArray(height, width, cv.CV_8UC1, raw);

  try {
    // 1. Gaussian Blur — подавляем текст и шум внутри документа
    const blurred = new cv.Mat();
    cv.GaussianBlur(src, blurred, new cv.Size(5, 5), 0);

    // 2. Canny edge detector
    const edges = new cv.Mat();
    cv.Canny(blurred, edges, options.cannyLow, options.cannyHigh);
    blurred.delete();

    // 3. findContours — только внешние контуры
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    hierarchy.delete();
    edges.delete();

    const imageArea = width * height;
    const minArea = imageArea * options.minContourAreaRatio;

    // 4. Находим самый большой контур
    let largestContour: unknown = null;
    let largestArea = 0;
    let secondLargestArea = 0;

    for (let i = 0; i < contours.size(); i += 1) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);

      if (area > largestArea) {
        secondLargestArea = largestArea;
        largestArea = area;
        if (largestContour) {
          (largestContour as { delete?: () => void }).delete?.();
        }
        largestContour = contour;
      } else if (area > secondLargestArea) {
        secondLargestArea = area;
      }
    }

    // Очищаем остальные контуры (кроме largest)
    for (let i = 0; i < contours.size(); i += 1) {
      if (contours.get(i) !== largestContour) {
        contours.get(i).delete();
      }
    }

    if (largestContour === null || largestArea < minArea) {
      contours.delete();
      return { angle: 0, confidence: 0, orientation: detectOrientation(width, height) };
    }

    // 5. minAreaRect
    const rect = cv.minAreaRect(largestContour);
    (largestContour as { delete?: () => void }).delete?.();
    contours.delete();

    // rect = { center: {x, y}, size: {width, height}, angle: number }
    // angle в градусах, диапазон [-90, 0)
    const rectAngle: number = rect.angle;
    const rectWidth: number = rect.size.width;
    const rectHeight: number = rect.size.height;
    const rectArea = rectWidth * rectHeight;

    // 6. Нормализуем угол в диапазон [-45, +45]
    // minAreaRect: width >= height, angle — угол от горизонтали против часовой.
    // Для deskew нам нужен угол поворота для sharp.rotate().
    // Sharp: положительный = по часовой.
    const deskewAngle = normalizeDeskewAngle(rectAngle, rectWidth, rectHeight);

    // 7. Confidence
    const contourScore = clamp(largestArea / (imageArea * 0.3), 0, 1);
    const separationScore = secondLargestArea > 0
      ? clamp(1 - secondLargestArea / largestArea, 0, 1)
      : 1;
    const areaScore = clamp(rectArea / imageArea, 0, 1);
    const confidence = clamp(
      0.2 + 0.4 * contourScore + 0.2 * separationScore + 0.2 * areaScore,
      0,
      1,
    );

    return {
      angle: deskewAngle,
      confidence,
      orientation: detectOrientation(width, height),
    };
  } finally {
    src.delete();
  }
}

/**
 * Нормализует угол из minAreaRect в диапазон [-45, +45] для sharp.rotate().
 *
 * OpenCV minAreaRect:
 *   - width ≥ height (всегда)
 *   - angle ∈ [-90, 0) — угол от горизонтали против часовой стрелки
 *
 * Преобразование:
 *   Если width > height и angle близок к 0 → документ почти горизонтальный → корректирующий угол ≈ -angle (или +angle для sharp)
 *   Если angle близок к -90 → документ почти вертикальный → корректируем на (90 + angle) в нужном направлении
 */
function normalizeDeskewAngle(angle: number, width: number, height: number): number {
  // minAreaRect гарантирует width ≥ height
  let deskew = angle; // angle отрицательный или 0, ∈ [-90, 0)

  // Если ширина существенно больше высоты и угол < -45,
  // значит прямоугольник повёрнут почти на 90° относительно горизонтали
  if (width > height * 1.1 && angle < -45) {
    deskew = 90 + angle;
  }

  // Приводим к диапазону [-45, +45]
  if (deskew < -45) {
    deskew += 90;
  }
  if (deskew > 45) {
    deskew -= 90;
  }

  // Округляем почти-ноль
  if (Math.abs(deskew) < 0.01) {
    deskew = 0;
  }

  // Sharp: положительный = по часовой, OpenCV: положительный = против часовой
  // Инвертируем знак
  return -deskew;
}

function detectOrientation(width: number, height: number): 'portrait' | 'landscape' {
  return width > height ? 'landscape' : 'portrait';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

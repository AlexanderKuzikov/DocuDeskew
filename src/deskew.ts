import sharp from 'sharp';
import type {
  DeskewError,
  DeskewErrorCode,
  DeskewNoDocumentResult,
  DeskewResult,
  DeskewOptions,
  NormalizedOptions,
} from './types.js';
import { estimateAngle } from './pipeline.js';

const DEFAULT_OPTIONS: NormalizedOptions = {
  workSize: 2000,
  cannyLow: 50,
  cannyHigh: 150,
  minContourAreaRatio: 0.05,
  padding: 10,
  trimThreshold: 10,
  minConfidence: 0.75,
  maxPixels: 50_000_000,
};

/**
 * Исправляет перекос документа на изображении.
 *
 * @param imageBuffer - PNG или JPEG изображение
 * @param options - опциональные параметры алгоритма
 * @returns DeskewResult
 */
export async function deskew(imageBuffer: Buffer, options: DeskewOptions = {}): Promise<DeskewResult> {
  try {
    const opts = normalizeOptions(options);

    // --- Валидация и чтение оригинала ---
    const metadata = await validateAndGetMetadata(imageBuffer, opts);
    const originalBuffer = imageBuffer;

    // --- Создание рабочей копии ---
    const workBuffer = await createWorkCopy(originalBuffer, metadata.width, metadata.height, opts);
    const workMetadata = await sharp(workBuffer).metadata();
    const workWidth = workMetadata.width!;
    const workHeight = workMetadata.height!;

    // Читаем рабочую копию как grayscale raw
    const raw = await sharp(workBuffer).grayscale().raw().toBuffer();

    // --- OpenCV: оценка угла ---
    const estimate = await estimateAngle(raw, workWidth, workHeight, opts);

    if (estimate.confidence <= 0) {
      return {
        status: 'no_document',
        angle: 0,
        confidence: 0,
        orientation: null,
        deskewedImage: null,
        reason: 'no document contour found',
      } satisfies DeskewNoDocumentResult;
    }

    const { angle, confidence, orientation } = estimate;

    // --- Поворот оригинала + trim + padding ---
    let deskewedImage: Buffer;
    try {
      deskewedImage = await rotateTrimAndPad(originalBuffer, angle, opts);
    } catch {
      throw createDeskewError('PROCESSING_ERROR', 'failed to rotate or trim the image');
    }

    // --- Проверка confidence ---
    if (confidence < opts.minConfidence) {
      return {
        status: 'low_confidence',
        angle,
        confidence,
        orientation,
        deskewedImage: null,
        reason: `confidence ${confidence.toFixed(3)} below minConfidence ${opts.minConfidence}`,
      };
    }

    return {
      status: 'ok',
      angle,
      confidence,
      orientation,
      deskewedImage,
    };
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      throw error as DeskewError;
    }

    const message =
      typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: unknown }).message)
        : String(error);
    throw createDeskewError('PROCESSING_ERROR', message);
  }
}

// --- Внутренние функции ---

function normalizeOptions(options: DeskewOptions): NormalizedOptions {
  const merged: NormalizedOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  validateInteger(merged.workSize, 'workSize', 100, 10_000);
  validateInteger(merged.cannyLow, 'cannyLow', 0, 255);
  validateInteger(merged.cannyHigh, 'cannyHigh', merged.cannyLow, 255);
  validateNumber(merged.minContourAreaRatio, 'minContourAreaRatio', 0.001, 1);
  validateInteger(merged.padding, 'padding', 0, 10_000);
  validateInteger(merged.trimThreshold, 'trimThreshold', 0, 255);
  validateNumber(merged.minConfidence, 'minConfidence', 0, 1);
  validateNumber(merged.maxPixels, 'maxPixels', 1, Number.MAX_SAFE_INTEGER, true);

  return merged;
}

function validateNumber(value: number, name: string, min: number, max: number, integer = false): void {
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw createDeskewError(
      'INVALID_OPTIONS',
      `${name} must be ${integer ? 'an integer' : 'a finite number'} in [${min}, ${max}]`,
    );
  }
}

function validateInteger(value: number, name: string, min: number, max: number): void {
  validateNumber(value, name, min, max, true);
}

async function validateAndGetMetadata(imageBuffer: Buffer, options: NormalizedOptions): Promise<sharp.Metadata> {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw createDeskewError('INVALID_BUFFER', 'imageBuffer must be a non-empty Buffer');
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(imageBuffer, { failOn: 'none' }).metadata();
  } catch {
    throw createDeskewError('INVALID_IMAGE', 'imageBuffer is not a readable PNG/JPEG image');
  }

  if (metadata.format !== 'png' && metadata.format !== 'jpeg') {
    throw createDeskewError('INVALID_IMAGE', `unsupported format: ${metadata.format ?? 'unknown'}`);
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width === 0 || height === 0) {
    throw createDeskewError('INVALID_IMAGE', 'image dimensions missing');
  }

  const pixels = width * height;
  if (pixels > options.maxPixels) {
    throw createDeskewError('IMAGE_TOO_LARGE', `${pixels} pixels exceeds max ${options.maxPixels}`);
  }

  return metadata;
}

async function createWorkCopy(
  buffer: Buffer,
  origWidth: number,
  origHeight: number,
  options: NormalizedOptions,
): Promise<Buffer> {
  const maxSide = Math.max(origWidth, origHeight);
  if (maxSide <= options.workSize) {
    return buffer;
  }

  const scale = options.workSize / maxSide;
  const newWidth = Math.max(1, Math.round(origWidth * scale));
  const newHeight = Math.max(1, Math.round(origHeight * scale));

  return sharp(buffer)
    .resize(newWidth, newHeight, { fit: 'fill' })
    .png()
    .toBuffer();
}

async function rotateTrimAndPad(buffer: Buffer, angle: number, options: NormalizedOptions): Promise<Buffer> {
  const rotated = await sharp(buffer)
    .rotate(angle, { background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();

  return sharp(rotated)
    .trim({ threshold: options.trimThreshold })
    .extend({
      top: options.padding,
      bottom: options.padding,
      left: options.padding,
      right: options.padding,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .grayscale()
    .png()
    .toBuffer();
}

function createDeskewError(code: DeskewErrorCode, message: string): DeskewError {
  const error = new Error(message) as DeskewError;
  error.code = code;
  return error;
}

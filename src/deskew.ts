import sharp from 'sharp';
import type {
  DeskewError,
  DeskewErrorCode,
  DeskewNoDocumentResult,
  DeskewOkResult,
  DeskewOptions,
  DeskewResult,
  DeskewUnsupportedResult,
  NormalizedOptions,
} from './types.js';

type Point = { x: number; y: number };
type RawImage = { data: Buffer; width: number; height: number };
type AngleEstimate = { angle: number; confidence: number; edgeDensity: number; pointCount: number };

const DEFAULT_OPTIONS: NormalizedOptions = {
  edgeThreshold: 25,
  dilateIterations: 2,
  erodeIterations: 2,
  padding: 10,
  minConfidence: 0.75,
  maxPixels: 50_000_000,
};

const MAX_WORK_SIDE = 1400;
const MIN_EDGE_DENSITY = 0.0002;
const MAX_POINTS = 24_000;

export async function deskew(imageBuffer: Buffer, options: DeskewOptions = {}): Promise<DeskewResult> {
  try {
    const normalizedOptions = normalizeOptions(options);
    const original = await readGrayscale(imageBuffer, normalizedOptions);
    const work = await downscaleForEstimation(original, normalizedOptions);
    const estimate = estimateSkew(work, normalizedOptions);

    if (estimate.status === 'no_document') {
      return estimate.result;
    }

    const { angle, confidence, orientation } = estimate;
    const deskewedImage = await rotateTrimAndPad(original, angle, normalizedOptions.padding);

    if (confidence < normalizedOptions.minConfidence) {
      return {
        status: 'low_confidence',
        angle,
        confidence,
        orientation,
        deskewedImage: null,
        reason: `confidence ${confidence.toFixed(3)} is below minConfidence ${normalizedOptions.minConfidence}`,
      };
    }

    return {
      status: 'ok',
      angle,
      confidence,
      orientation,
      deskewedImage,
    } satisfies DeskewOkResult;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      throw error as DeskewError;
    }

    const message = typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message)
      : String(error);
    throw createDeskewError('PROCESSING_ERROR', message);
  }
}

function normalizeOptions(options: DeskewOptions): NormalizedOptions {
  const merged: NormalizedOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  validateNumber(merged.edgeThreshold, 'edgeThreshold', 0, 255, false);
  validateInteger(merged.dilateIterations, 'dilateIterations', 0, 10);
  validateInteger(merged.erodeIterations, 'erodeIterations', 0, 10);
  validateNumber(merged.padding, 'padding', 0, 10_000, false);
  validateNumber(merged.minConfidence, 'minConfidence', 0, 1, false);
  validateNumber(merged.maxPixels, 'maxPixels', 1, Number.MAX_SAFE_INTEGER, true);

  return merged;
}

function validateNumber(value: number, name: string, min: number, max: number, integer: boolean): void {
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw createDeskewError('INVALID_OPTIONS', `${name} must be ${integer ? 'an integer' : 'a finite number'} in range [${min}, ${max}]`);
  }
}

function validateInteger(value: number, name: string, min: number, max: number): void {
  validateNumber(value, name, min, max, true);
}

async function readGrayscale(imageBuffer: Buffer, options: NormalizedOptions): Promise<RawImage> {
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
    throw createDeskewError('INVALID_IMAGE', `unsupported image format: ${metadata.format ?? 'unknown'}`);
  }

  if (!metadata.width || !metadata.height) {
    throw createDeskewError('INVALID_IMAGE', 'image dimensions are missing');
  }

  const pixels = metadata.width * metadata.height;
  if (pixels > options.maxPixels) {
    throw createDeskewError('IMAGE_TOO_LARGE', `image has ${pixels} pixels, maxPixels is ${options.maxPixels}`);
  }

  const data = await sharp(imageBuffer).grayscale().raw().toBuffer();

  return {
    data: Buffer.from(data),
    width: metadata.width,
    height: metadata.height,
  };
}

async function downscaleForEstimation(image: RawImage, options: NormalizedOptions): Promise<RawImage> {
  const maxSide = Math.max(image.width, image.height);
  const scale = Math.min(1, MAX_WORK_SIDE / maxSide);

  if (scale >= 1) {
    return image;
  }

  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const data = await sharp(image.data, { raw: { width: image.width, height: image.height, channels: 1 } })
    .resize({ width, height, fit: 'fill' })
    .raw()
    .toBuffer();

  void options;
  return { data: Buffer.from(data), width, height };
}

function estimateSkew(image: RawImage, options: NormalizedOptions):
  | { status: 'no_document'; result: DeskewNoDocumentResult }
  | { status: 'estimated'; angle: number; confidence: number; orientation: DeskewOkResult['orientation'] } {
  const binary = sobelAndThreshold(image.data, image.width, image.height, options.edgeThreshold);
  const edgeCount = countOnes(binary);
  const edgeDensity = edgeCount / (image.width * image.height);

  if (edgeDensity < MIN_EDGE_DENSITY) {
    return {
      status: 'no_document',
      result: {
        status: 'no_document',
        angle: 0,
        confidence: 0,
        orientation: null,
        deskewedImage: null,
        reason: 'not enough edges to detect a document',
      },
    };
  }

  const dilated = morphology(binary, image.width, image.height, options.dilateIterations, 'dilate');
  const processed = morphology(dilated, image.width, image.height, options.erodeIterations, 'erode');
  const points = collectPoints(processed, image.width, image.height);

  if (points.length < 50) {
    return {
      status: 'no_document',
      result: {
        status: 'no_document',
        angle: 0,
        confidence: 0,
        orientation: null,
        deskewedImage: null,
        reason: 'not enough edge points to estimate skew',
      },
    };
  }

  const hull = convexHull(points);
  if (hull.length < 4) {
    return {
      status: 'no_document',
      result: {
        status: 'no_document',
        angle: 0,
        confidence: 0,
        orientation: null,
        deskewedImage: null,
        reason: 'edge points do not form a document-like contour',
      },
    };
  }

  const rect = minAreaRect(hull);
  if (!Number.isFinite(rect.area)) {
    return {
      status: 'no_document',
      result: {
        status: 'no_document',
        angle: 0,
        confidence: 0,
        orientation: null,
        deskewedImage: null,
        reason: 'failed to compute minAreaRect',
      },
    };
  }

  const angle = skewAngleFromRectAngleRadians(rect.angle);
  const confidence = calculateConfidence({
    edgeDensity,
    pointCount: points.length,
    bestArea: rect.area,
    secondBestArea: rect.secondBestArea,
  });

  return {
    status: 'estimated',
    angle,
    confidence,
    orientation: detectOrientation(image.width, image.height),
  };
}

function sobelAndThreshold(data: Buffer, width: number, height: number, threshold: number): Uint8Array {
  const binary = new Uint8Array(width * height);

  for (let y = 1; y < height - 1; y += 1) {
    const row = y * width;
    for (let x = 1; x < width - 1; x += 1) {
      const i = row + x;

      const p00 = data[i - width - 1];
      const p01 = data[i - width];
      const p02 = data[i - width + 1];
      const p10 = data[i - 1];
      const p12 = data[i + 1];
      const p20 = data[i + width - 1];
      const p21 = data[i + width];
      const p22 = data[i + width + 1];

      const gx = -p00 + p02 - 2 * p10 + 2 * p12 - p20 + p22;
      const gy = -p00 - 2 * p01 - p02 + p20 + 2 * p21 + p22;
      const magnitude = Math.abs(gx) + Math.abs(gy);

      binary[i] = magnitude >= threshold ? 1 : 0;
    }
  }

  return binary;
}

function morphology(input: Uint8Array, width: number, height: number, iterations: number, operation: 'dilate' | 'erode'): Uint8Array {
  let current = input;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const output = new Uint8Array(width * height);

    for (let y = 1; y < height - 1; y += 1) {
      const row = y * width;
      for (let x = 1; x < width - 1; x += 1) {
        const i = row + x;
        const hasOne = current[i - width - 1] === 1
          || current[i - width] === 1
          || current[i - width + 1] === 1
          || current[i - 1] === 1
          || current[i + 1] === 1
          || current[i + width - 1] === 1
          || current[i + width] === 1
          || current[i + width + 1] === 1;
        const allOnes = current[i - width - 1] === 1
          && current[i - width] === 1
          && current[i - width + 1] === 1
          && current[i - 1] === 1
          && current[i] === 1
          && current[i + 1] === 1
          && current[i + width - 1] === 1
          && current[i + width] === 1
          && current[i + width + 1] === 1;

        output[i] = operation === 'dilate' ? (hasOne ? 1 : 0) : (allOnes ? 1 : 0);
      }
    }

    current = output;
  }

  return current;
}

function collectPoints(binary: Uint8Array, width: number, height: number): Point[] {
  const stride = Math.max(1, Math.ceil(Math.sqrt((width * height) / MAX_POINTS)));
  const points: Point[] = [];

  for (let y = 1; y < height - 1; y += stride) {
    for (let x = 1; x < width - 1; x += stride) {
      if (binary[y * width + x] === 1) {
        points.push({ x, y });
      }
    }
  }

  return points;
}

function countOnes(input: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < input.length; i += 1) {
    if (input[i] === 1) {
      count += 1;
    }
  }
  return count;
}

function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const unique: Point[] = [];

  for (const point of sorted) {
    const previous = unique[unique.length - 1];
    if (!previous || previous.x !== point.x || previous.y !== point.y) {
      unique.push(point);
    }
  }

  if (unique.length <= 1) {
    return unique;
  }

  const lower: Point[] = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: Point[] = [];
  for (let i = unique.length - 1; i >= 0; i -= 1) {
    const point = unique[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function minAreaRect(hull: Point[]): { angle: number; area: number; secondBestArea: number } {
  let bestAngle = 0;
  let bestArea = Number.POSITIVE_INFINITY;
  let bestSkewAbs = Number.POSITIVE_INFINITY;
  let secondBestArea = Number.POSITIVE_INFINITY;
  let previousCanonicalAngle: number | null = null;
  const areaEpsilon = 1e-6;

  for (let i = 0; i < hull.length; i += 1) {
    const current = hull[i];
    const next = hull[(i + 1) % hull.length];
    const canonicalAngle = normalizeRadians(Math.atan2(next.y - current.y, next.x - current.x));

    if (previousCanonicalAngle !== null && Math.abs(canonicalAngle - previousCanonicalAngle) < 1e-6) {
      continue;
    }
    previousCanonicalAngle = canonicalAngle;

    const area = boundingBoxAreaAfterRotation(hull, canonicalAngle);
    const skewAbs = Math.abs(skewAngleFromRectAngleRadians(canonicalAngle));
    if (area < bestArea - areaEpsilon) {
      secondBestArea = bestArea;
      bestArea = area;
      bestAngle = canonicalAngle;
      bestSkewAbs = skewAbs;
    } else if (Math.abs(area - bestArea) <= areaEpsilon && skewAbs < bestSkewAbs) {
      bestArea = area;
      bestAngle = canonicalAngle;
      bestSkewAbs = skewAbs;
    } else if (area < secondBestArea) {
      secondBestArea = area;
    }
  }

  return { angle: bestAngle, area: bestArea, secondBestArea };
}

function normalizeRadians(angle: number): number {
  let normalized = angle % Math.PI;
  if (normalized > Math.PI / 2) {
    normalized -= Math.PI;
  }
  if (normalized < -Math.PI / 2) {
    normalized += Math.PI;
  }
  return normalized;
}

function normalizeSkewAngle(angle: number): number {
  let normalized = ((angle + 45) % 90) - 45;
  if (normalized < -45) {
    normalized += 90;
  }
  return normalized;
}

function skewAngleFromRectAngleRadians(angle: number): number {
  return normalizeSkewAngle((-angle * 180) / Math.PI);
}

function boundingBoxAreaAfterRotation(points: Point[], angle: number): number {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    const x = point.x * cos + point.y * sin;
    const y = -point.x * sin + point.y * cos;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  return (maxX - minX) * (maxY - minY);
}

function calculateConfidence(input: {
  edgeDensity: number;
  pointCount: number;
  bestArea: number;
  secondBestArea: number;
}): number {
  const edgeScore = clamp(input.edgeDensity / 0.003, 0, 1);
  const pointScore = clamp(input.pointCount / 8000, 0, 1);
  const angleScore = Number.isFinite(input.secondBestArea) && input.secondBestArea > 0
    ? clamp(1 - input.bestArea / input.secondBestArea, 0, 1)
    : 1;

  return clamp(0.3 + 0.45 * edgeScore + 0.15 * angleScore + 0.1 * pointScore, 0, 1);
}

function detectOrientation(width: number, height: number): DeskewOkResult['orientation'] {
  return width > height ? 'landscape' : 'portrait';
}

async function rotateTrimAndPad(image: RawImage, angle: number, padding: number): Promise<Buffer> {
  const rotated = await sharp(image.data, { raw: { width: image.width, height: image.height, channels: 1 } })
    .rotate(angle, { background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();

  const trimmed = await sharp(rotated)
    .trim({ threshold: 10 })
    .extend({
      top: padding,
      bottom: padding,
      left: padding,
      right: padding,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();

  return Buffer.from(trimmed);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createDeskewError(code: DeskewErrorCode, message: string): DeskewError {
  const error = new Error(message) as DeskewError;
  error.code = code;
  return error;
}

function isDeskewError(error: unknown): error is DeskewError {
  return typeof error === 'object' && error !== null && 'code' in error;
}

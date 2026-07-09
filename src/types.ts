export type DeskewStatus = 'ok' | 'low_confidence' | 'no_document' | 'unsupported_case';
export type DeskewOrientation = 'portrait' | 'landscape';
export type DeskewErrorCode =
  | 'INVALID_BUFFER'
  | 'INVALID_IMAGE'
  | 'IMAGE_TOO_LARGE'
  | 'INVALID_OPTIONS'
  | 'PROCESSING_ERROR';

export interface DeskewError extends Error {
  code: DeskewErrorCode;
}

export interface DeskewOptions {
  /** Сторона рабочей копии в px. По умолчанию 2000. */
  workSize?: number;
  /** Нижний порог Canny. По умолчанию 50. */
  cannyLow?: number;
  /** Верхний порог Canny. По умолчанию 150. */
  cannyHigh?: number;
  /** Минимальная доля площади контура от изображения. По умолчанию 0.05. */
  minContourAreaRatio?: number;
  /** Отступ после trim в px. По умолчанию 10. */
  padding?: number;
  /** Порог обрезки белого фона. По умолчанию 10. */
  trimThreshold?: number;
  /** Минимальная уверенность для статуса 'ok'. По умолчанию 0.75. */
  minConfidence?: number;
  /** Лимит пикселей исходного изображения. По умолчанию 50 000 000. */
  maxPixels?: number;
  /** Тип документа (для будущей совместимости). */
  docType?: string;
}

export interface NormalizedOptions {
  workSize: number;
  cannyLow: number;
  cannyHigh: number;
  minContourAreaRatio: number;
  padding: number;
  trimThreshold: number;
  minConfidence: number;
  maxPixels: number;
  docType?: string;
}

export interface DeskewOkResult {
  status: 'ok';
  /** Корректирующий угол в градусах. */
  angle: number;
  /** Уверенность 0–1. */
  confidence: number;
  /** Ориентация изображения. */
  orientation: DeskewOrientation;
  /** Выровненное изображение в формате PNG. */
  deskewedImage: Buffer;
}

export interface DeskewLowConfidenceResult {
  status: 'low_confidence';
  angle: number;
  confidence: number;
  orientation?: DeskewOrientation;
  deskewedImage: null;
  reason: string;
}

export interface DeskewNoDocumentResult {
  status: 'no_document';
  angle: 0;
  confidence: number;
  orientation: null;
  deskewedImage: null;
  reason: string;
}

export interface DeskewUnsupportedResult {
  status: 'unsupported_case';
  angle: 0;
  confidence: number;
  orientation: null;
  deskewedImage: null;
  reason: string;
}

export type DeskewResult =
  | DeskewOkResult
  | DeskewLowConfidenceResult
  | DeskewNoDocumentResult
  | DeskewUnsupportedResult;

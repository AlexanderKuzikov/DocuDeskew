export type DeskewStatus = 'ok' | 'low_confidence' | 'no_document' | 'unsupported_case';
export type DeskewOrientation = 'portrait' | 'landscape';

export type DeskewOptions = {
  edgeThreshold?: number;
  dilateIterations?: number;
  erodeIterations?: number;
  padding?: number;
  minConfidence?: number;
  maxPixels?: number;
};

export type DeskewOkResult = {
  status: 'ok';
  angle: number;
  confidence: number;
  orientation: DeskewOrientation;
  deskewedImage: Buffer;
};

export type DeskewLowConfidenceResult = {
  status: 'low_confidence';
  angle: number;
  confidence: number;
  orientation?: DeskewOrientation;
  deskewedImage: null;
  reason: string;
};

export type DeskewNoDocumentResult = {
  status: 'no_document';
  angle: 0;
  confidence: number;
  orientation: null;
  deskewedImage: null;
  reason: string;
};

export type DeskewUnsupportedResult = {
  status: 'unsupported_case';
  angle: 0;
  confidence: 0;
  orientation: null;
  deskewedImage: null;
  reason: string;
};

export type DeskewResult =
  | DeskewOkResult
  | DeskewLowConfidenceResult
  | DeskewNoDocumentResult
  | DeskewUnsupportedResult;

export type DeskewErrorCode =
  | 'INVALID_BUFFER'
  | 'INVALID_IMAGE'
  | 'IMAGE_TOO_LARGE'
  | 'INVALID_OPTIONS'
  | 'PROCESSING_ERROR';

export type DeskewError = Error & {
  code: DeskewErrorCode;
};

export type NormalizedOptions = Required<DeskewOptions>;

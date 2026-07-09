// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CV = any;

let _cv: CV | null = null;
let _initPromise: Promise<CV> | null = null;

/**
 * Возвращает инициализированный экземпляр OpenCV.
 * Инициализация происходит один раз при первом вызове.
 */
export async function getCV(): Promise<CV> {
  if (_cv !== null) {
    return _cv;
  }

  if (_initPromise === null) {
    _initPromise = (async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const cvModule = require('@techstark/opencv-js');
      // cvModule is a Promise<CV> — WASM loads asynchronously
      const cv: CV = await cvModule;
      _cv = cv;
      return cv;
    })();
  }

  return _initPromise;
}

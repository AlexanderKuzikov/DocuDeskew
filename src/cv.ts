// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CV = any;

let _cv: CV | null = null;
let _initPromise: Promise<CV> | null = null;

/**
 * Возвращает инициализированный экземпляр OpenCV.
 * Использует createRequire для совместимости с ESM, CJS и vitest.
 */
export async function getCV(): Promise<CV> {
  if (_cv !== null) {
    return _cv;
  }

  if (_initPromise === null) {
    _initPromise = (async () => {
      // createRequire надёжнее import() — не ломается в vitest/Vite.
      // В CJS-сборке tsup заменяет import('module') на require('module'),
      // но import.meta.url остаётся пустым. Поэтому:
      const { createRequire } = await import('module');

      // __filename доступен в CJS; import.meta.url — в ESM.
      // tsup при CJS-сборке оставляет import.meta.url пустым,
      // но require('url').pathToFileURL(__filename) работает.
      let fileUrl: string;
      try {
        // ESM путь (включая vitest)
        fileUrl = import.meta.url;
      } catch {
        // CJS fallback
        fileUrl = String(require('url').pathToFileURL(require('path').resolve(__filename)));
      }

      const req = createRequire(fileUrl);
      const cvPromise = req('@techstark/opencv-js');
      // cvPromise — Promise<CV>, ждём загрузки WASM
      _cv = await cvPromise;
      return _cv;
    })();
  }

  return _initPromise;
}

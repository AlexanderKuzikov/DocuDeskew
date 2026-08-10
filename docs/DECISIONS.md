# DocuDeskew — DECISIONS

<!-- Append-only. Формат фиксирован. -->

## 2026-06-01: OpenCV.js (WASM) вместо Python

**Контекст:** Нужна библиотека deskew для Node.js pipeline.

**Решение:** @techstark/opencv-js (WASM), Canny + minAreaRect.

**Альтернативы:** Python subprocess, pure JS Hough transform.

**Trade-off:** WASM ~8MB, но zero-dependency на Python и единый runtime.

## 2026-06-01: Dual build (ESM+CJS) через tsup

**Контекст:** Потребители — и ESM (DocuMind), и CJS (legacy).

**Решение:** tsup генерирует оба формата.

**Альтернативы:** Только ESM, только CJS.

**Trade-off:** Двойной build, но максимальная совместимость.

# DocuDeskew

[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-24_LTS-green?logo=node.js)](https://nodejs.org/)
[![OpenCV](https://img.shields.io/badge/OpenCV-5.0-red?logo=opencv)](https://opencv.org/)
[![Sharp](https://img.shields.io/badge/Sharp-0.35-99cc33?logo=sharp)](https://sharp.pixelplumbing.com/)
[![npm](https://img.shields.io/npm/v/docu-deskew?color=cb0000)](https://www.npmjs.com/package/docu-deskew)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Устранение перекоса сканированных документов (deskew).  
Часть платформы **[DocuMind](https://github.com/AlexanderKuzikov)** — интеллектуальной обработки юридических документов.

---

## Быстрый старт

```bash
npm install docu-deskew
```

```ts
import { deskew } from 'docu-deskew';
import { readFileSync, writeFileSync } from 'fs';

const input = readFileSync('scan.webp');
const result = await deskew(input);

if (result.status === 'ok') {
  console.log(`Угол: ${result.angle.toFixed(2)}°`);
  console.log(`Уверенность: ${(result.confidence * 100).toFixed(0)}%`);
  writeFileSync('straight.webp', result.deskewedImage);
}
```

---

## Что делает

Устраняет перекос (–45°…+45°) сканированных документов на белом фоне. Повороты с шагом 90° — следующий модуль DocuOrient.

**Контракт:**
- **Вход:** grayscale WebP/PNG/JPEG, ≤1536 px (подготовка — upstream)
- **Выход:** grayscale WebP 80, тот же размер минус обрезка фона

---

## API

### `deskew(imageBuffer, options?)`

Возвращает `DeskewResult` — discriminated union:

| Статус | `angle` | `deskewedImage` | Когда |
|--------|---------|-----------------|-------|
| `ok` | Корректирующий угол | WebP-буфер | Успешное выравнивание |
| `low_confidence` | Оценка угла | `null` + `reason` | Контур найден, но уверенность ниже порога |
| `no_document` | `0` | `null` + `reason` | Контур не найден |
| `unsupported_case` | `0` | `null` + `reason` | Зарезервирован |

Ошибки — `DeskewError` с полем `code`:
`INVALID_BUFFER` | `INVALID_IMAGE` | `IMAGE_TOO_LARGE` | `INVALID_OPTIONS` | `PROCESSING_ERROR`

### Опции

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|-------------|----------|
| `cannyLow` | `number` | `50` | Нижний порог Canny |
| `cannyHigh` | `number` | `150` | Верхний порог Canny |
| `minContourAreaRatio` | `number` | `0.05` | Минимальная доля контура от площади |
| `padding` | `number` | `10` | Отступ после обрезки фона, px |
| `trimThreshold` | `number` | `10` | Порог обрезки белого фона |
| `minConfidence` | `number` | `0.75` | Порог для статуса `ok` |
| `maxPixels` | `number` | `50 000 000` | Лимит пикселей |
| `docType` | `string` | — | Тип документа (для совместимости) |

---

## Алгоритм

```text
Входной буфер (grayscale, ≤1536px)
  → Валидация (Buffer, формат, maxPixels)
  → sharp.raw() → cv.Mat (0 копий)
  → GaussianBlur(5×5)
  → Canny(50, 150)
  → findContours(RETR_EXTERNAL)
  → filter: самый большой контур >5% площади
  → minAreaRect → угол
  → sharp.rotate(angle) на исходном буфере
  → trim + padding
  → grayscale WebP 80
```

---

## Стек

| Компонент | Технология | Назначение |
|-----------|------------|------------|
| **Язык** | TypeScript 6.0 | Static typing, discriminated unions |
| **Runtime** | Node.js ≥20 | ESM + CJS |
| **CV** | OpenCV 5.0 (WASM) | Canny, findContours, minAreaRect |
| **Изображения** | Sharp (libvips) | Rotate, trim, WebP encode |
| **Тесты** | Vitest | 8 unit-тестов, синтетические fixtures |
| **Сборка** | tsup | CJS + ESM + .d.ts |

---

## Разработка

```bash
npm install
npm run typecheck    # tsc --noEmit
npm test             # vitest run
npm run build        # tsup → dist/
```

### Тестирование на файлах

```bash
# Один файл:
node deskew.mjs input.webp output.webp

# Пакетная обработка (in/ → out/ + report.txt):
mkdir in
# копируешь файлы в in/
node batch.mjs
```

---

## Ограничения

- Вход: WebP/PNG/JPEG, уже grayscale и ≤1536 px
- Выход: WebP 80
- Белый фон документа
- Угол: –45°…+45°
- CLI: `deskew.mjs` (1 файл), `batch.mjs` (пакетно in/ → out/)
- `confidence` — эвристическая метрика (нужна калибровка на реальных данных)

---

## Связь с DocuMind

DocuDeskew — первый модуль конвейера обработки:
1. **DocuDeskew** (этот модуль) — выравнивание перекоса
2. **DocuOrient** — ориентация 0°/90°/180°/270°
3. VLM-распознавание (Qwen 3.6 35B A3B)

Все операции с персональными данными выполняются локально/on-prem.

---

## Лицензия

MIT

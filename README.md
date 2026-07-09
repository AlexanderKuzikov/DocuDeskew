# DocuDeskew

Устранение перекоса сканированных документов (deskew).  
Часть проекта **DocuMind** — интеллектуальной обработки юридических документов.

## Текущий статус

```text
Переход с sharp-based MVP на OpenCV (@techstark/opencv-js)
```

Активная разработка. Пайплайн: Canny → findContours → minAreaRect через OpenCV WASM.

## Что делает

`DocuDeskew` принимает `Buffer` с уже подготовленным изображением (grayscale, ≤1536px по большей стороне) и возвращает выровненный grayscale WebP 80.

Диапазон углов: **–45°…+45°**. Повороты с шагом 90° — следующий модуль `DocuOrient`.

**Контракт модуля:**
- Вход: grayscale WebP/PNG/JPEG, уже уменьшенный до VLM-окна (≤1536px). Ресайз и grayscale-конвертация — ответственность upstream.
- Выход: grayscale WebP 80, тот же размер минус trim-обрезка.

## Стек

| Компонент | Технология |
|-----------|------------|
| Язык | TypeScript |
| Runtime | Node.js ≥20 |
| Computer Vision | `@techstark/opencv-js` (OpenCV 5.0, WASM) |
| Обработка изображений | `sharp` (libvips) — rotate, trim, resize |
| Тесты | Vitest |
| Сборка | tsup (CJS + ESM) |

## Установка

```bash
npm install docu-deskew
```

Для разработки:

```bash
npm install
npm run build
npm test
npm run typecheck
```

## API

### ESM

```ts
import { deskew } from 'docu-deskew';

const result = await deskew(imageBuffer, options?);
```

### CJS

```js
const { deskew } = require('docu-deskew');

const result = await deskew(imageBuffer, options?);
```

## Результат

### `ok`

```ts
{
  status: 'ok',
  angle: number,
  confidence: number,
  orientation: 'portrait' | 'landscape',
  deskewedImage: Buffer
}
```

### `low_confidence`

```ts
{
  status: 'low_confidence',
  angle: number,
  confidence: number,
  orientation?: 'portrait' | 'landscape',
  deskewedImage: null,
  reason: string
}
```

### `no_document`

```ts
{
  status: 'no_document',
  angle: 0,
  confidence: number,
  orientation: null,
  deskewedImage: null,
  reason: string
}
```

### `unsupported_case`

Зарезервирован для случаев, которые нельзя безопасно обработать текущим алгоритмом. Пока не реализован.

## Параметры options

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `cannyLow` | `number` | `50` | Нижний порог Canny |
| `cannyHigh` | `number` | `150` | Верхний порог Canny |
| `minContourAreaRatio` | `number` | `0.05` | Минимальная доля площади контура от изображения |
| `padding` | `number` | `10` | Отступ после trim, px |
| `trimThreshold` | `number` | `10` | Порог обрезки белого фона |
| `minConfidence` | `number` | `0.75` | Минимальная уверенность для статуса `ok` |
| `maxPixels` | `number` | `50000000` | Лимит пикселей |
| `docType` | `string` | — | Тип документа (для будущей совместимости) |

## Ошибки

API бросает `Error` с полем `code`:

| Код | Когда |
|-----|-------|
| `INVALID_BUFFER` | Пустой буфер или передан не `Buffer` |
| `INVALID_IMAGE` | Нечитаемое изображение или неподдерживаемый формат |
| `IMAGE_TOO_LARGE` | Превышен `maxPixels` |
| `INVALID_OPTIONS` | Некорректные `options` |
| `PROCESSING_ERROR` | Внутренняя ошибка обработки |

## Алгоритм

1. Валидация входа: Buffer, формат PNG/JPEG/WebP, ≤ maxPixels.
2. Чтение grayscale raw через `sharp.raw()` → `cv.Mat` (без копирования).
3. `GaussianBlur(5×5)`.
4. `Canny(low=50, high=150)`.
5. `findContours` → самый большой контур >5% площади.
6. `minAreaRect` → угол поворота.
7. Если контур не найден → `no_document`.
8. Если confidence < порога → `low_confidence`.
9. Поворот через `sharp.rotate(angle)` на исходном буфере.
10. `trim` + `padding`.
11. Возврат grayscale WebP 80.

**Важно:** ресайз и grayscale-конвертация выполняются upstream-модулем, НЕ внутри DocuDeskew.

## Пример использования

```js
const fs = require('fs');
const { deskew } = require('docu-deskew');

(async () => {
  const input = fs.readFileSync('scan.png');
  const result = await deskew(input);

  if (result.status !== 'ok') {
    throw new Error(result.reason ?? result.status);
  }

  console.log(`Корректирующий угол: ${result.angle.toFixed(2)}°`);
  console.log(`Уверенность: ${result.confidence.toFixed(3)}`);
  fs.writeFileSync('straight.png', result.deskewedImage);
})();
```

## Проверки

```bash
npm run typecheck
npm test
npm run build
```

## Ограничения

- Вход: PNG/JPEG/WebP, уже grayscale и ≤1536px по большей стороне.
- Выход: grayscale WebP 80.
- Документ на белом фоне.
- Угол: –45°…+45°.
- Нет CLI.
- Нет golden set на реальных сканах.
- `confidence` — эвристическая оценка.

## Связь с DocuMind

DocuDeskew — модуль конвейера DocuMind. После выравнивания документ передаётся в `DocuOrient` для доворота до читаемой ориентации.

Обработка реальных юридических документов с персональными данными должна выполняться локально/on-prem.

## Лицензия

MIT

# DocuDeskew

Устранение перекоса сканированных документов (deskew).  
Часть проекта **DocuMind** — интеллектуальной обработки юридических документов.

## Текущий статус

```text
Переход с sharp-based MVP на OpenCV (@techstark/opencv-js)
```

Активная разработка. Пайплайн: Canny → findContours → minAreaRect через OpenCV WASM.

## Что делает

`DocuDeskew` принимает `Buffer` с PNG/JPEG-изображением страницы, находит контур документа, вычисляет корректирующий угол и возвращает выровненный grayscale PNG.

Диапазон углов: **–45°…+45°**. Повороты с шагом 90° — следующий модуль `DocuOrient`.

`angle` — корректирующий угол для поворота (положительный = по часовой). Если документ был повёрнут на +10°, API вернёт примерно –10°.

Не изменяет читаемую ориентацию верх/низ.

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
| `workSize` | `number` | `2000` | Сторона рабочей копии, px |
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

1. Валидация входа: Buffer, формат PNG/JPEG, ≤ maxPixels.
2. Рабочая копия: `sharp.resize(workSize)` — 2000px по большей стороне.
3. OpenCV на рабочей копии:
   - `cvtColor(RGB2GRAY)`
   - `GaussianBlur(5×5)`
   - `Canny(low=50, high=150)`
   - `findContours` → самый большой контур >5% площади
   - `minAreaRect` → угол поворота
4. Если контур не найден → `no_document`.
5. Если контур мал или угол нестабилен → `low_confidence`.
6. Поворот оригинала через `sharp.rotate(angle)`.
7. Обрезка белого фона + padding.
8. Возврат grayscale PNG-буфера и метаданных.

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

- Вход: только PNG/JPEG.
- Выход: grayscale PNG.
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

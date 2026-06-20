# DocuDeskew

Устранение перекоса сканированных документов.  
Часть проекта **DocuMind** — интеллектуальной обработки юридических документов.

## Текущий статус

```text
MVP foundation / demo-ready, не production-complete
```

Реализован минимальный Node.js/TypeScript API для выравнивания изображения документа на белом фоне.
Код проходит базовые проверки: typecheck, unit-тесты на синтетических документах, сборка CJS/ESM.

---

## Что делает

`DocuDeskew` принимает `Buffer` с PNG/JPEG-изображением страницы, находит контур документа, вычисляет корректирующий угол и возвращает выровненный grayscale PNG.

Важно: `angle` — это **корректирующий угол для `sharp.rotate()`**, а не исходный угол поворота изображения.
Если документ был повернут `sharp.rotate(10)`, API вернёт примерно `-10`.

Не изменяет читаемую ориентацию верх/низ — это следующий этап `DocuOrient`.

---

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

---

## API

### ESM

```js
import { deskew } from 'docu-deskew';

const result = await deskew(imageBuffer, options);
```

### CJS

```js
const { deskew } = require('docu-deskew');

const result = await deskew(imageBuffer, options);
```

---

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

Зарезервирован для случаев, которые нельзя безопасно обработать текущим алгоритмом.
В MVP пока не используется.

---

## Параметры options

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `edgeThreshold` | `number` | `25` | Порог бинаризации градиента Sobel, `0–255` |
| `dilateIterations` | `number` | `2` | Итерации дилатации морфологии |
| `erodeIterations` | `number` | `2` | Итерации эрозии морфологии |
| `padding` | `number` | `10` | Белый отступ после обрезки, px |
| `minConfidence` | `number` | `0.75` | Минимальная уверенность для возврата `ok` |
| `maxPixels` | `number` | `50000000` | Лимит пикселей исходного изображения |

---

## Ошибки

API бросает `Error` с полем `code`:

| Код | Когда |
|-----|-------|
| `INVALID_BUFFER` | Пустой буфер или передан не `Buffer` |
| `INVALID_IMAGE` | Нечитаемое изображение или неподдерживаемый формат |
| `IMAGE_TOO_LARGE` | Превышен `maxPixels` |
| `INVALID_OPTIONS` | Некорректные `options` |
| `PROCESSING_ERROR` | Внутренняя ошибка обработки |

---

## Алгоритм

1. Чтение PNG/JPEG через `sharp`.
2. Преобразование в 8-бит grayscale raw.
3. Детектор краёв Sobel + бинаризация.
4. Морфологическое усиление контура: dilation + erosion.
5. Сбор координат пикселей контура.
6. Convex hull.
7. Итеративный minAreaRect по рёбрам hull.
8. Выбор угла с минимальным ограничивающим прямоугольником и минимальным корректирующим углом.
9. Поворот через `sharp.rotate(angle)`.
10. Обрезка белого фона + padding.
11. Возврат PNG-буфера и метаданных.

---

## Ограничения MVP

- Поддерживаются только PNG/JPEG на входе.
- Выход — grayscale PNG.
- Алгоритм рассчитан на документ на белом фоне.
- Угол ограничен диапазоном примерно `–45°…+45°`.
- Нет CLI.
- Нет golden set на реальных сканах.
- `confidence` — эвристическая оценка, требует калибровки на реальных документах.
- Обрезка белого фона может удалить легитимные белые поля у сложных сканов.

---

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

---

## Проверки

```bash
npm run typecheck
npm test
npm run build
```

---

## Связь с проектом DocuMind

DocuDeskew — первый этап конвейера DocuMind. После выравнивания документ передаётся в `DocuOrient` для доворота до читаемой ориентации.

Обработка реальных юридических документов с персональными данными должна выполняться локально/on-prem. Не отправлять такие изображения во внешние LLM/облачные сервисы без явной политики обработки и обезличивания.

---

## Лицензия

MIT

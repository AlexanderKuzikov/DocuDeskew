# CONTEXT

Этот файл предназначен для быстрого погружения новой LLM/агента в проект.

## Проект

DocuDeskew — Node.js/TypeScript библиотека для устранения перекоса сканированных документов.

GitHub:

```text
https://github.com/AlexanderKuzikov/DocuDeskew
```

Текущий статус:

```text
MVP foundation / demo-ready, не production-complete
```

Это рабочая предварительная версия, но ещё не production-complete система.

---

## Текущий активный режим

Активный режим:

```text
imageBuffer
  → sharp metadata
  → grayscale raw
  → Sobel + threshold
  → morphology
  → convex hull
  → minAreaRect
  → sharp.rotate(angle)
  → trim white background
  → padding
  → DeskewResult
```

Публичный API:

```ts
import { deskew } from 'docu-deskew';

const result = await deskew(imageBuffer, options?);
```

`angle` — корректирующий угол для `sharp.rotate()`.  
Если документ был повернут `sharp.rotate(10)`, API вернёт примерно `-10`.

---

## Что уже сделано

На текущем этапе в репозитории есть:

- Node.js проект с `package.json` и `package-lock.json`;
- TypeScript source в `src/`;
- CJS/ESM build через `tsup`;
- типизированный API `deskew(imageBuffer, options?)`;
- статусы результата:
  - `ok`;
  - `low_confidence`;
  - `no_document`;
  - `unsupported_case` зарезервирован;
- ошибки с кодами:
  - `INVALID_BUFFER`;
  - `INVALID_IMAGE`;
  - `IMAGE_TOO_LARGE`;
  - `INVALID_OPTIONS`;
  - `PROCESSING_ERROR`;
- unit-тесты на синтетических документах;
- README;
- CONTEXT;
- BUG_REPORT.

---

## API contract

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

### Ошибки

```ts
Error & {
  code:
    | 'INVALID_BUFFER'
    | 'INVALID_IMAGE'
    | 'IMAGE_TOO_LARGE'
    | 'INVALID_OPTIONS'
    | 'PROCESSING_ERROR'
}
```

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

## Defaults

```ts
const DEFAULT_OPTIONS = {
  edgeThreshold: 25,
  dilateIterations: 2,
  erodeIterations: 2,
  padding: 10,
  minConfidence: 0.75,
  maxPixels: 50_000_000,
};
```

Рабочая область для оценки угла ограничивается стороной `1400px`.

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
- `unsupported_case` пока зарезервирован, но не имеет отдельной ветки обработки.

---

## Полезные команды

```bash
npm run typecheck
npm test
npm run build
```

Для локальной проверки ESM:

```bash
node --input-type=module -e "import { deskew } from './dist/index.js'; console.log(typeof deskew)"
```

Для локальной проверки CJS:

```bash
node -e "const { deskew } = require('./dist/index.cjs'); console.log(typeof deskew)"
```

---

## Связь с DocuMind

DocuDeskew — первый этап конвейера DocuMind. После выравнивания документ передаётся в `DocuOrient` для доворота до читаемой ориентации.

Обработка реальных юридических документов с персональными данными должна выполняться локально/on-prem. Не отправлять такие изображения во внешние LLM/облачные сервисы без явной политики обработки и обезличивания.

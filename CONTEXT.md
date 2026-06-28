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

## Место в конвейере DocuMind

DocuDeskew — один из модулей конвейера DocuMind. Архитектура построена на максимальной декомпозиции задач: каждый модуль получает уже подготовленный вход и возвращает результат с чёткими требованиями.

**Этот модуль:**
- Получает изображение документа, уже отобранного вышестоящим модулем (классификатор типов).
- На вход приходят **только те типы документов**, для которых требуется локализация и perspective correction (паспорт РФ, СТС, водительское удостоверение и др. — менее 10 типов).
- Разделение потоков (полностраничные vs. малые документы) выполняется **в другом модуле**, до передачи сюда.
- Модуль не принимает решений о маршрутизации — только обрабатывает то, что пришло.

**Контракт модуля:**
- Вход: изображение установленного формата/размера/разрешения + `docType` + `photoPosition` (опционально, из первого VLM-прогона).
- Выход: файл с чётко установленными требованиями к формату и содержимому.

Обработка реальных юридических документов с персональными данными должна выполняться локально/on-prem. Не отправлять такие изображения во внешние LLM/облачные сервисы без явной политики обработки и обезличивания.

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

### Входной контракт (расширенный)

```ts
type DocInput = {
  image: Buffer;
  docType: string;
  photoPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'none';
}
```

`photoPosition` — передаётся из первого VLM-прогона (определение типа документа).
Если присутствует — используется для определения ориентации без дополнительных запросов.
Если отсутствует или `none` — применяется template-проверка (fallback).

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

## Инфраструктура

**Сервер (on-prem):**
- CPU: топовый AMD
- RAM: 128 GB
- GPU: NVIDIA RTX 5070, 16 GB VRAM

**Требование:** все операции с юридическими документами выполняются локально. Внешние API не используются.

---

## Архитектурные решения

### 2026-06-28 — Целевой пайплайн обработки

Модуль получает уже отобранный тип документа. Задача — локализация документа на листе и perspective correction.

**Условия входа:**
- Белый или светло-серый фон (артефакт сканера — допустимо).
- `docType` передаётся от вышестоящего модуля (классификатор).
- Документ занимает значительную часть листа, фон контрастно отличается.

**Пайплайн рабочей копии:**

```text
рабочая копия (downscale)
  → grayscale
  → Gaussian blur          (подавить текстуру внутри документа)
  → Otsu threshold         (белый фон → стабильная бинаризация)
  → morphological close    (крупное ядро ~15-25px, залить дыры)
  → findContours
  → largest connected component
  → approxPolyDP           (epsilon ~2-5% периметра) → 4 угловые точки
```

**Применение к оригиналу:**

```text
4 угловые точки (из рабочей копии, пересчитанные в координаты оригинала)
  → getPerspectiveTransform(4 points → canonical rect)
  → warpPerspective на оригинальном изображении
```

Canonical rect определяется по **пропорциям** типа документа (не абсолютным размерам — документы могут быть увеличены/уменьшены).

---

### 2026-06-28 — Выбор: `@techstark/opencv-js`

**Статус:** Принято

#### Обоснование

- OpenCV 5.0.0 release, активная поддержка (еженедельные коммиты, 29 версий на npm).
- Zero native dependencies — работает на Windows 10/11 и Linux (включая серверные дистрибутивы) без компиляции и node-gyp.
- WASM-based: один бинарник для всех платформ.
- Реальное комьюнити (744★, 56 форков).

#### Отклонённые альтернативы

- `opencv-js-wasm` — alpha, фактически мёртвый проект (6 коммитов, CI падает, 1★). Отклонён.
- `@u4/opencv4nodejs` (нативные C++ биндинги) — требует системных либ и компиляции. Несовместим с требованием кросс-платформенности из коробки. Отклонён.

#### Критические замечания по интеграции в Node.js

Пакет создавался для браузера. В Node.js нет `fetch`, поэтому дефолтная загрузка WASM по URL не работает.

**Обязательный init-паттерн для Node.js:**

```typescript
import cv from '@techstark/opencv-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const wasmBinary = readFileSync(
  resolve('./node_modules/@techstark/opencv-js/dist/opencv_js.wasm')
);

await new Promise<void>(res => {
  // @ts-ignore
  cv.wasmBinary = wasmBinary;
  cv.onRuntimeInitialized = res;
});
```

- Путь к `.wasm` файлу зависит от структуры деплоя — проверять при сборке и упаковке.
- TypeScript типы (`mirada`) — отдельный пакет, периодически desync с реальным API. Проверять совместимость при обновлении версии пакета.

---

### 2026-06-28 — Определение ориентации документа (0°/90°/180°/270°)

**Статус:** Принято

#### Решение

Ориентация определяется в рамках **первого VLM-прогона** (определение типа документа) — одним запросом решаются две задачи одновременно:

1. `docType` — тип документа
2. `photoPosition` — позиция фотографии владельца (`top-left` / `top-right` / `bottom-left` / `bottom-right` / `none`)

Зная эталонную позицию фото для каждого `docType` (конфиг), модуль определяет угол поворота через lookup table.

**Пример:**
```text
Паспорт РФ (страница с фото): эталон = top-left
VLM вернул photoPosition = bottom-right → поворот 180°
VLM вернул photoPosition = top-right    → поворот 90° по часовой
VLM вернул photoPosition = bottom-left  → поворот 90° против часовой
```

**Поворот реализуется через `cv.rotate`:**
- `cv.ROTATE_90_CLOCKWISE`
- `cv.ROTATE_180`
- `cv.ROTATE_90_COUNTERCLOCKWISE`

Это специализированная операция — без интерполяции, без потери качества.

#### Fallback

Если `photoPosition` отсутствует или `none` (документ без фото) — применяется **template-проверка** (OpenCV):
- Измерение средней яркости и edge density характерных зон документа
- Скоринг 4 ориентаций, выбор лучшей
- Конфиг зон задаётся для каждого `docType` в нормализованных координатах (0.0–1.0)

#### Отклонённые альтернативы

- **Tesseract OSD** — исключён. Не различает 0°/180° (фундаментальное ограничение, не баг реализации). Дополнительная тяжёлая зависимость без достаточного преимущества.
- **VLM прямой вопрос про угол** — нестабилен. Маленькие модели плохо абстрагируют угол поворота. Вопрос про позицию объекта работает значительно надёжнее.
- **EXIF orientation** — исключён. Отсутствует в реальных входных данных проекта.

#### Основная VLM модель в пайплайне

**Qwen 3.6 35B A3B** (MoE, ~3B активных параметров на инференс).
Запускается локально через Ollama на сервере проекта.
Скорость на RTX 5070 16GB: ~200–500ms на запрос.

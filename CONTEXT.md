# CONTEXT

Этот файл предназначен для быстрого погружения новой LLM/агента в проект.

## Проект

DocuDeskew — Node.js/TypeScript библиотека для устранения перекоса сканированных документов.
Только выравнивание в пределах –45°…+45° (deskew). Исправление перспективы и ориентация 0°/90°/180°/270° — следующие изолированные модули.

GitHub:

```text
https://github.com/AlexanderKuzikov/DocuDeskew
```

Текущий статус:

```text
Переход с sharp-based MVP на OpenCV (@techstark/opencv-js)
```

Старый sharp-прототип выброшен — см. секцию «Legacy» в конце файла.

---

## Место в конвейере DocuMind

DocuDeskew — один из модулей конвейера DocuMind. Архитектура построена на максимальной декомпозиции: каждый модуль получает подготовленный вход и возвращает результат с чёткими требованиями.

**Этот модуль:**
- Получает изображение документа, уже отобранного вышестоящим модулем (классификатор типов).
- На вход приходят только те типы документов, для которых нужен deskew (полностраничные сканы: паспорт РФ, СТС, водительское удостоверение, etc. — менее 10 типов).
- Модуль не принимает решений о маршрутизации — только обрабатывает то, что пришло.
- Диапазон углов: –45°…+45°. Повороты с шагом 90° → следующий модуль DocuOrient.

**Контракт модуля:**
- Вход: grayscale WebP/PNG/JPEG, уже уменьшенный upstream до VLM-окна (≤1536px по большей стороне).
- Выход: grayscale WebP 80, тот же размер минус trim-обрезка.
- Модуль НЕ делает ресайз и НЕ конвертирует в grayscale — это ответственность upstream.
- `docType` опционально для будущей совместимости; алгоритмом не используется.

**Почему WebP 80:**
- ~180 KB на страницу A4 1536px (vs PNG ~2.3 MB, JPEG 90 ~280 KB).
- Экономия ~30% токенов на VLM-прогонах.
- Промежуточный формат между модулями; финальный сборщик PDF конвертирует в JPEG 80.

Обработка реальных юридических документов с персональными данными должна выполняться локально/on-prem. Не отправлять такие изображения во внешние LLM/облачные сервисы.

---

## Текущий активный режим

Активный пайплайн (OpenCV + sharp):

```text
imageBuffer (grayscale WebP/PNG/JPEG, уже ≤1536px по большей стороне)
  → валидация: Buffer, формат, maxPixels
  → sharp.raw() → Buffer uint8 → cv.Mat (без копирования)
  → GaussianBlur(5×5)                    // вход уже grayscale — cvtColor не нужен
  → Canny(low, high)
  → findContours(RETR_EXTERNAL)
  → фильтр: самый большой контур >5% изображения
  → minAreaRect → угол
  → если контур не найден → no_document
  → если confidence < порога → low_confidence
  → sharp.rotate(angle) на исходном буфере
  → trim + padding
  → DeskewResult { status, angle, confidence, orientation, deskewedImage (WebP 80) }
```

Ресайз и grayscale-конвертация НЕ выполняются — ответственность upstream-модуля.

Публичный API:

```ts
import { deskew } from 'docu-deskew';

const result = await deskew(imageBuffer, options?);
```

`angle` — корректирующий угол в градусах. Положительный = по часовой стрелке (совместимо с `sharp.rotate()`).

---

## Что уже сделано

- Node.js проект с `package.json` и `package-lock.json`;
- TypeScript source в `src/`;
- CJS/ESM build через `tsup`;
- Типизированный API `deskew(imageBuffer, options?)`;
- Статусы результата: `ok`, `low_confidence`, `no_document`, `unsupported_case` (зарезервирован);
- Коды ошибок: `INVALID_BUFFER`, `INVALID_IMAGE`, `IMAGE_TOO_LARGE`, `INVALID_OPTIONS`, `PROCESSING_ERROR`;
- README, CONTEXT, BUG_REPORT.

Sharp-based MVP (commit `47d136d`) отработал как proof-of-concept. Код выброшен, типы и API сохранены. История — в git, описание — в секции «Legacy».

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

### `unsupported_case`

Зарезервирован для случаев, которые нельзя обработать текущим алгоритмом. Пока не реализован.

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

## Алгоритм (OpenCV)

1. Валидация: Buffer непустой, формат PNG/JPEG, пикселей ≤ maxPixels.
2. Создание рабочей копии через `sharp.resize(workSize)` — по умолчанию 2000px по большей стороне.
3. Конвертация RGB → RGBA Buffer (нужен 4-канальный `cv.Mat`).
4. OpenCV на рабочей копии:
   - `cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY)`
   - `cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0)`
   - `cv.Canny(blurred, edges, cannyLow, cannyHigh)`
   - `cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)`
   - Фильтр: самый большой контур с площадью >5% от изображения.
   - `cv.minAreaRect(largestContour)` → `{ angle, center, size }`.
5. Извлечение угла из `minAreaRect` и нормализация в диапазон –45°…+45°.
6. Если контур не найден или площадь слишком мала → `no_document`.
7. Если вариация между лучшим и вторым контуром мала → `low_confidence`.
8. Поворот оригинала: `sharp.rotate(angle)` с белым фоном.
9. Обрезка белого фона: `sharp.trim({ threshold })` + добавление padding.
10. Результат: `DeskewResult` + grayscale PNG.

---

## Defaults

```ts
const DEFAULT_OPTIONS = {
  cannyLow: 50,              // нижний порог Canny
  cannyHigh: 150,            // верхний порог Canny
  minContourAreaRatio: 0.05, // минимальная доля площади контура
  padding: 10,               // отступ после trim, px
  trimThreshold: 10,         // порог обрезки фона
  minConfidence: 0.75,       // минимальная уверенность для 'ok'
  maxPixels: 50_000_000,     // лимит пикселей
};
```

Входное изображение должно быть уже уменьшено upstream до VLM-окна (≤1536px по большей стороне) и сконвертировано в grayscale.

## Опции DeskewOptions

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|-------------|----------|
| `cannyLow` | `number` | `50` | Нижний порог Canny |
| `cannyHigh` | `number` | `150` | Верхний порог Canny |
| `minContourAreaRatio` | `number` | `0.05` | Минимальная доля площади контура |
| `padding` | `number` | `10` | Отступ после trim |
| `trimThreshold` | `number` | `10` | Порог обрезки фона |
| `minConfidence` | `number` | `0.75` | Порог для `ok` |
| `maxPixels` | `number` | `50000000` | Лимит пикселей |
| `docType` | `string` | — | Тип документа (для будущей совместимости) |

## Ограничения

- Поддерживаются только PNG/JPEG/WebP на входе.
- Выход — grayscale WebP 80.
- Вход должен быть уже grayscale и ≤1536px по большей стороне.
- Алгоритм рассчитан на документ на белом фоне.
- Угол ограничен диапазоном –45°…+45°.
- Нет CLI.
- Нет golden set на реальных сканах.
- `confidence` — эвристическая оценка, требует калибровки.
- `unsupported_case` зарезервирован, но не реализован.

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

### 2026-07-09 — Переход на OpenCV Canny-based пайплайн

**Статус:** Реализуется

**Решение:** заменить ручной sharp-based пайплайн (свой Sobel, morphology, convexHull, minAreaRect) на нативный OpenCV через `@techstark/opencv-js`.

**Причины:**
- Ручные реализации Sobel/convexHull/minAreaRect — ~200 строк кода, который OpenCV делает в 1 строку.
- Canny детектор даёт более чистые границы документа, чем ручной Sobel + morphology.
- OpenCV — стандарт индустрии, протестирован на миллионах изображений.

**Что изменилось относительно плана 2026-06-28:**
- **НЕ делаем perspective correction** — это крайний и редкий случай. Модуль только deskew (–45°…+45°).
- approxPolyDP + warpPerspective отложены до отдельных экспериментов.
- Otsu + morphology заменены на Canny — даёт лучшие границы на документе с белым фоном.
- `docType` присутствует в API, но алгоритм от него не зависит.

**Пайплайн:**
```text
рабочая копия (downscale до ~2000px)
  → cvtColor(RGB2GRAY)
  → GaussianBlur(5×5)
  → Canny(low=50, high=150)
  → findContours(RETR_EXTERNAL)
  → самый большой контур >5% площади
  → minAreaRect → угол
```

**Поворот оригинала:** `sharp.rotate(angle)` + `trim` + `padding`. Sharp оставлен, потому что libvips на CPU быстрее WASM-OpenCV на поворотах.

---

### 2026-06-28 — Выбор: `@techstark/opencv-js`

**Статус:** Принято, реализуется с 2026-07-09.

#### Обоснование

- OpenCV 5.0.0 release, активная поддержка (еженедельные коммиты, 29 версий на npm).
- Zero native dependencies — работает на Windows 10/11 и Linux без компиляции и node-gyp.
- WASM-based: один бинарник для всех платформ.
- Реальное комьюнити (744★, 56 форков).

#### Отклонённые альтернативы

- `opencv-js-wasm` — alpha, мёртвый проект (6 коммитов, CI падает, 1★). Отклонён.
- `@u4/opencv4nodejs` (нативные C++ биндинги) — требует системных либ. Отклонён.

#### Критические замечания по интеграции

Пакет создавался для браузера. В Node.js нет `fetch`, поэтому загрузка WASM по URL не работает.

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

- Путь к `.wasm` зависит от структуры деплоя.
- TypeScript типы (`mirada`) — отдельный пакет, периодически desync с API.

---

### 2026-06-28 — Определение ориентации документа (0°/90°/180°/270°)

**Статус:** ОБСУЖДАЕТСЯ — не часть DocuDeskew.

#### Кандидаты для тестирования

**1. VLM-подход (основная гипотеза)**

Ориентация определяется в рамках первого VLM-прогона (определение типа документа):
- `docType` — тип документа
- `photoPosition` — позиция фотографии (`top-left` / `top-right` / `bottom-left` / `bottom-right` / `none`)

Эталонная позиция фото для каждого `docType` → угол поворота через lookup table.

VLM: **Qwen 3.6 35B A3B** (MoE), локально через Ollama. Ожидаемая скорость: ~200–500ms.

**2. Tesseract OSD**

Отдельный классификатор ориентации и скрипта (~200–400ms, без GPU).
Ограничение: может не различать 0°/180° на документах с малым текстом.

**3. Template-проверка (OpenCV, fallback)**

Средняя яркость + edge density характерных зон. Скоринг 4 ориентаций. ~150 строк TS, ~20–40ms.
Ограничение: не различает 0°/180° без семантики.

#### Исключено

- **EXIF orientation** — отсутствует во входных данных.
- **VLM прямой вопрос про угол** — нестабилен.

#### Что нужно проверить

- Точность каждого кандидата на реальных документах в 4 ориентациях.
- Способность Tesseract OSD различать 0°/180°.
- Стабильность формата ответа VLM.
- Реальная скорость инференса VLM на сервере.

---

## Legacy: sharp-based MVP

Первый прототип (коммиты до `47d136d`) реализовал deskew через чистый sharp:

```text
imageBuffer
  → sharp metadata
  → grayscale raw
  → ручной Sobel + threshold
  → ручная morphology (dilate/erode)
  → ручной convexHull (Monotone Chain)
  → ручной minAreaRect (iterate hull edges)
  → sharp.rotate(angle)
  → trim + padding
  → DeskewResult
```

**Что работало:**
- 8 unit-тестов (Vitest) на синтетических SVG → PNG.
- TypeScript, CJS/ESM сборка через tsup.
- Весь код в одном файле `src/deskew.ts` (502 строки).

**Причины замены:**
- Ручной Sobel/morphology/hull/minAreaRect — ~200 строк кода, который OpenCV делает нативно.
- Canny даёт лучшие границы документа на белом фоне, чем Sobel + morphology.
- Меньше кода → меньше багов.

История: `git log -- src/deskew.ts` (файл удалён после перехода на OpenCV).

# BUG_REPORT — DocuDeskew

Дата ревью: **2026-06-20**

Ревью охватывало:

- `src/deskew.ts`;
- `src/types.ts`;
- `src/index.ts`;
- `test/deskew.test.ts`;
- `package.json`;
- `README.md`;
- `CONTEXT.md`.

---

## Сводная таблица

| ID | Файл | Статус | Суть |
|---|---|---|---|
| Б-1 | `src/deskew.ts` | ✅ Исправлен | Ошибка в erosion: вместо эрозии инвертировала пиксели через `hasOne ? 0 : 1` |
| Б-2 | `test/deskew.test.ts` | ✅ Добавлен | Добавлен border-only синтетический документ без текстовых строк |
| П-1 | `src/deskew.ts` | 🔵 Остался риск | `confidence` остаётся эвристической метрикой и требует калибровки на реальных сканах |
| П-2 | `src/deskew.ts` | 🔵 Остался риск | `trim({ threshold: 10 })` может удалить легитимные белые поля |
| П-3 | `src/types.ts` | 🔵 Остался риск | `unsupported_case` зарезервирован типом, но в MVP нет отдельной ветки обработки |
| П-4 | `test/deskew.test.ts` | 🔵 Остался риск | Нет golden set на реальных PDF/сканах, только синтетические SVG → PNG |
| П-5 | `src/deskew.ts` | 🔵 Остался риск | Производительность зависит от площади изображения и итераций морфологии |
| П-6 | `src/deskew.ts` | 🔵 Остался риск | Поддерживаются только PNG/JPEG на входе |
| П-7 | `src/deskew.ts` | 🔵 Остался риск | Порог `trim` жёстко задан внутри функции, без option |
| П-8 | `package.json` | 🔵 Остался риск | Нет CLI и CLI-примеров обработки файлов |
| И-1 | `package.json` | ℹ️ Info | `npm audit --omit=dev` не нашёл уязвимостей в production-зависимостях |
| И-2 | `package.json` | ℹ️ Info | `npm outdated --json` показывает более новые версии `sharp`, `typescript`, `@types/node`; не критично для MVP |

---

## Что исправлено в ходе ревью

### 1. Исправлена ошибка erosion

**Файл:** `src/deskew.ts`

**Симптом:**

Морфологическая эрозия работала неправильно:

```ts
output[i] = operation === 'dilate' ? (hasOne ? 1 : 0) : (hasOne ? 0 : 1);
```

Для `erode` код ставил `1`, если хотя бы один сосед был `1`, и `0`, если ни одного. Это не erosion, а инвертированная дилатация.

**Причина:**

Логика `erode` была перепутана с инверсией `hasOne`.

**Исправление:**

```ts
const allOnes = current[i - width - 1] === 1
  && current[i - width] === 1
  && current[i - width + 1] === 1
  && current[i - 1] === 1
  && current[i] === 1
  && current[i + 1] === 1
  && current[i + width - 1] === 1
  && current[i + width] === 1
  && current[i + width + 1] === 1;

output[i] = operation === 'dilate' ? (hasOne ? 1 : 0) : (allOnes ? 1 : 0);
```

Теперь:

- `dilate` ставит `1`, если хотя бы один сосед `1`;
- `erode` ставит `1`, только если все 9 пикселей 3×3 равны `1`.

---

### 2. Откалибрована confidence после исправления erosion

**Файл:** `src/deskew.ts`

**Симптом:**

После исправления erosion синтетические чистые документы стали давать `low_confidence`, хотя визуально были корректными.

**Исправление:**

```ts
return clamp(0.3 + 0.45 * edgeScore + 0.15 * angleScore + 0.1 * pointScore, 0, 1);
```

Раньше:

```ts
return clamp(0.25 + 0.45 * edgeScore + 0.2 * angleScore + 0.1 * pointScore, 0, 1);
```

**Комментарий:**

Это не делает `confidence` математически достоверной. Это только выравнивает MVP-поведение на синтетических документах после исправления erosion. Для production нужна калибровка на реальных сканах.

---

### 3. Добавлен border-only test

**Файл:** `test/deskew.test.ts`

Добавлен тест на документ без текстовых строк, только с рамкой.

Цель:

- проверить, что контур документа можно оценить без текста;
- снизить риск регрессии после исправления morphology.

---

## Проверки

Пройдено:

```text
npm run typecheck
```

Результат:

```text
exit 0
```

---

```text
npm test -- --reporter=dot
```

Результат:

```text
Test Files  1 passed (1)
Tests       8 passed (8)
```

---

```text
npm run build
```

Результат:

```text
ESM dist/index.js 12.84 KB
CJS dist/index.cjs 14.54 KB
DTS dist/index.d.cts 1.61 KB
DTS dist/index.d.ts 1.61 KB
exit 0
```

---

```text
git diff --check
```

Результат:

```text
exit 0
```

---

```text
node --input-type=module -e "import { deskew } from './dist/index.js'; console.log(typeof deskew)"
```

Результат:

```text
function
```

---

```text
node -e "const { deskew } = require('./dist/index.cjs'); console.log(typeof deskew)"
```

Результат:

```text
function
```

---

```text
npm audit --omit=dev --json
```

Результат:

```text
total vulnerabilities: 0
```

---

```text
npm pack --dry-run --json
```

Результат:

```text
id: docu-deskew@0.1.0
files:
  LICENSE
  README.md
  dist/index.cjs
  dist/index.d.cts
  dist/index.d.ts
  dist/index.js
  package.json
entryCount: 7
```

---

```text
npm outdated --json
```

Результат:

```text
@types/node: current 24.13.2, latest 26.0.0
sharp: current 0.34.5, latest 0.35.2
typescript: current 5.9.3, latest 6.0.3
```

Это не security-блокер. Для `sharp` обновление мажорной/минорной версии нужно проверять отдельно, потому что может измениться ABI/поведение обработки изображений.

---

## Актуальные открытые задачи

### П-1. Откалибровать confidence на реальных документах

**Файл:** `src/deskew.ts`

`confidence` сейчас эвристический:

- edge density;
- point count;
- разница между лучшим и вторым ограничивающим прямоугольником.

**Риск:**

На реальных сканах метрика может быть завышена или занижена.

**Действие:**

Собрать golden set реальных/синтетических сканов с известными углами и подобрать пороги.

---

### П-2. Сделать trim configurable

**Файл:** `src/deskew.ts`

Сейчас:

```ts
.trim({ threshold: 10 })
```

**Риск:**

У некоторых документов белые поля или светлые элементы могут быть обрезаны слишком агрессивно.

**Действие:**

Добавить `trimThreshold?: number` и `trimMargin?: number`.

---

### П-3. Реализовать `unsupported_case`

**Файл:** `src/types.ts`, `src/deskew.ts`

`unsupported_case` есть в типах, но MVP его не возвращает.

**Риск:**

Для некоторых входных данных может быть неочевидно, когда возвращать `low_confidence`, а когда `unsupported_case`.

**Действие:**

Добавить явные критерии:

- слишком маленький документ;
- слишком мало hull-точек после нормального erosion;
- чрезмерно вытянутый/недокументный контур;
- нечитаемый результат после rotation/trim.

---

### П-4. Добавить golden set

**Файл:** `test/`

Сейчас тесты используют синтетические SVG → PNG.

**Риск:**

MVP может хорошо работать на синтетике и плохо на реальных сканах.

**Действие:**

Добавить fixtures:

```text
test/fixtures/
  clean-portrait.png
  skewed-portrait-5.png
  skewed-landscape-12.png
  border-only.png
  low-contrast.png
  no-document.png
  expected.json
```

И golden runner с известными углами.

---

### П-5. Проверить производительность на больших сканах

**Файл:** `src/deskew.ts`

Оценка угла ограничена рабочей стороной `1400px`, но исходное изображение всё равно читается полностью через `sharp().grayscale().raw().toBuffer()`.

**Риск:**

Очень большие изображения могут потреблять много памяти до downscale.

**Действие:**

Проверить профили на 200/300 DPI и при необходимости делать предварительный downscale через `sharp.resize()` до grayscale raw.

---

### П-6. Ограничить входные форматы

**Файл:** `src/deskew.ts`

Сейчас явно разрешены:

```text
png
jpeg
```

**Риск:**

TIFF/WebP и другие форматы не поддерживаются, но пользователь может ожидать их обработки.

**Действие:**

Оставить PNG/JPEG в MVP и явно документировать это в README. Для production добавить TIFF/WebP или понятный `INVALID_IMAGE`.

---

### П-7. Добавить CLI

**Файл:** `package.json`, `src/`

Сейчас пакет имеет только library API.

**Риск:**

Нет удобного способа обработать файл из терминала.

**Действие:**

Добавить:

```bash
docu-deskew input.png output.png --angle
```

Или хотя бы минимальный CLI для MVP.

---

## История изменений

| Дата | Действие |
|---|---|
| 2026-06-20 | Первое ревью DocuDeskew MVP |
| 2026-06-20 | Исправлена ошибка erosion в `src/deskew.ts` |
| 2026-06-20 | Откалибрована confidence после исправления erosion |
| 2026-06-20 | Добавлен border-only тест |
| 2026-06-20 | Обновлены README и CONTEXT |
| 2026-06-20 | Пройдены typecheck/test/build/import/package/audit/diff-check |

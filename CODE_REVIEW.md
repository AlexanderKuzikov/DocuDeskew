# 🔍 CODE REVIEW — DocuDeskew v0.1.0

> **Дата:** 2026-07-09
> **Ревизор:** DeepSeek v4 Pro (via OpenCode Go)
> **Репозиторий:** [AlexanderKuzikov/DocuDeskew](https://github.com/AlexanderKuzikov/DocuDeskew)
> **Последний коммит:** `68a986b` — Simplify contract: no resize, no cvtColor, output WebP 80
> **Языки:** TypeScript (6.0.3), Node.js (≥20)
> **LOC:** ~290 строк source + 106 строк тестов

---

## 📊 Общая оценка

| Критерий | Оценка | Комментарий |
|----------|--------|-------------|
| **Архитектура** | ⭐⭐⭐⭐½ 9/10 | Чистый контракт, модуль делает одно дело. API — discriminated union. |
| **Типизация** | ⭐⭐⭐⭐ 8/10 | Strict TS, `CV = any` для OpenCV без типов, не-null assertions безопасны. |
| **Безопасность** | ⭐⭐⭐⭐⭐ 10/10 | Нет секретов, нет внешних API, всё локально. |
| **Обработка ошибок** | ⭐⭐⭐⭐ 8/10 | Типизированные ошибки, `finally`-очистка ресурсов. |
| **Тестирование** | ⭐⭐⭐ 6/10 | 8 тестов, только синтетика, нет golden fixtures. |
| **Документация** | ⭐⭐⭐⭐ 8/10 | CONTEXT, README, BUG_REPORT. Не хватает JSDoc на внутренних функциях. |
| **Производительность** | ⭐⭐⭐⭐ 8/10 | WASM-OpenCV, Buffer→Mat без копирования, двойной WebP decode/encode. |

**Итого: 8.1/10** — чистый, качественный код. Основные пробелы: golden fixtures, калибровка confidence, CLI и неиспользуемый `unsupported_case`.

---

## 🔴 P0 — надо сделать до production

### P0-1. Нет golden fixtures на реальных сканах
**Файл:** `test/deskew.test.ts`
**Проблема:** Все 8 тестов используют синтетические SVG → PNG. Ни одного реального скана. Невозможно проверить точность алгоритма на юридических документах.
**Рекомендация:**
```
test/fixtures/
  passport-0deg.webp      — паспорт РФ, без перекоса
  passport-5deg.webp      — +5° перекос
  passport-12deg.webp     — +12° перекос
  sts-7deg.webp           — СТС, –7°
  low-contrast.webp       — слабый контраст
  expected.json           — { "passport-5deg": { "angle": -5, "tolerance": 1 } }
```

### P0-2. Confidence — эвристика, не калибрована
**Файл:** `src/pipeline.ts:106-115`
**Проблема:** Формула confidence использует веса (0.2 + 0.4×contour + 0.2×separation + 0.2×area), подобранные на синтетике. На реальных документах может давать false positive/negative.
**Рекомендация:** Собрать golden set → прогнать → подобрать веса логистической регрессией или хотя бы grid search по 3-4 параметрам.

---

## 🟡 P1 — важно, но не блокер

### P1-1. Двойной WebP encode/decode в rotateTrimAndPad
**Файл:** `src/deskew.ts:165-183`  
**Строки:** `sharp(buffer).rotate(...).webp(80).toBuffer()` → затем `sharp(rotated).trim().grayscale().webp(80).toBuffer()`
**Проблема:** Промежуточный WebP decode/encode — лишняя потеря качества и CPU. WebP→WebP особенно неэффективен для grayscale.
**Рекомендация:** Цепочка без промежуточного буфера:
```ts
return sharp(buffer)
  .rotate(angle, { background: { r: 255, g: 255, b: 255, alpha: 1 } })
  .trim({ threshold: options.trimThreshold })
  .extend({ ... })
  .grayscale()
  .webp({ quality: 80 })
  .toBuffer();
```
Один decode → одна цепочка → один encode. Экономия ~40% времени на rotate+trim.

### P1-2. `unsupported_case` в типах, но не в коде
**Файлы:** `src/types.ts:74-81`, `src/deskew.ts`  
**Проблема:** Тип `DeskewUnsupportedResult` экспортирован, но функция `deskew` никогда его не возвращает. Потребитель API может написать `if (result.status === 'unsupported_case')`, и эта ветка никогда не выполнится.
**Рекомендация:** Добавить явные критерии:
- Слишком маленький документ (<5% площади после порога Canny)
- Чрезмерно вытянутый контур (aspect ratio > 20)
- Множественные контуры сравнимого размера (ambiguous document)
- Или убрать тип до реализации.

### P1-3. Нет теста на WebP-вход
**Файл:** `test/deskew.test.ts:30`  
**Проблема:** `createSkewedDocument` всегда выдаёт PNG. Контракт модуля говорит «WebP/PNG/JPEG», но WebP-вход не тестируется.
**Рекомендация:** Добавить тест с `.webp({ quality: 80 })` вместо `.png()`.

### P1-4. CLI отсутствует
**Файл:** `package.json` (нет `bin` поля)  
**Проблема:** Нет способа прогнать deskew из терминала: `docu-deskew input.webp output.webp`. Для отладки на golden fixtures критично.
**Рекомендация:** Минимальный CLI на 20 строк:
```ts
#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { deskew } from './index.js';
const [,, input, output] = process.argv;
const result = await deskew(readFileSync(input));
if (result.status === 'ok') writeFileSync(output, result.deskewedImage);
else { console.error(result.status, result.reason); process.exit(1); }
```

---

## 🟢 P2 — мелкие улучшения

### P2-1. `CV = any` вместо минимального интерфейса
**Файл:** `src/cv.ts:1-2`  
**Проблема:** Весь модуль типизирован как `any`. Потеря автодополнения в IDE.
**Рекомендация:** Определить минимальный интерфейс:
```ts
interface CV {
  matFromArray(rows: number, cols: number, type: number, data: Buffer | Uint8Array): Mat;
  Mat: new () => Mat;
  MatVector: new () => MatVector;
  GaussianBlur(src: Mat, dst: Mat, size: Size, sigmaX: number): void;
  Canny(src: Mat, dst: Mat, low: number, high: number): void;
  // ...
}
```
Не обязательно покрывать весь API — только используемые функции.

### P2-2. Итерация по контурам — два прохода
**Файл:** `src/pipeline.ts:59-80`  
**Проблема:** Два цикла for по контурам: первый ищет largest, второй удаляет остальные. Можно объединить.
**Рекомендация:** Сохранять все контуры кроме largest в массив `toDelete`, удалять после цикла. Или хранить `largestIndex` вместо `largestContour`.

### P2-3. `detectOrientation` — тривиальная функция в pipeline.ts
**Файл:** `src/pipeline.ts:166-168`  
**Проблема:** `detectOrientation(width, height)` — одна строка `width > height ? 'landscape' : 'portrait'`. Дублируется в `deskew.ts` неявно.
**Рекомендация:** Вынести в `types.ts` как `getOrientation(width, height): DeskewOrientation` и переиспользовать.

### P2-4. Тесты: размер изображения 900×1200
**Файл:** `test/deskew.test.ts:6-7`  
**Проблема:** Контракт модуля: вход ≤1536px. Но тесты используют 900×1200. Это ок, но стоит добавить тест на точный максимум (1536×1536).
**Рекомендация:** Добавить тест с шириной/высотой 1536px.

### P2-5. `package.json` не включает `.wasm` файл OpenCV в `files`
**Файл:** `package.json:16-18`  
**Проблема:** `"files": ["dist"]` — но `@techstark/opencv-js` загружает WASM из `node_modules`. При `npm pack` или `npm install` с production-флагом WASM может быть недоступен.
**Текущий статус:** `@techstark/opencv-js` — это dependency (не devDependency), поэтому `node_modules/@techstark/opencv-js/dist/opencv.js` устанавливается. WASM встроен в JS-файл (не отдельный `.wasm`), так что `"files": ["dist"]` достаточно. **Не является проблемой** — пакет корректно работает через `require()` с встроенным WASM.

---

## 🏗 Архитектура: что хорошо

### Сильные стороны

1. **Чистый контракт.** Модуль делает ровно одно: deskew –45°…+45°. Ресайз и grayscale — ответственность upstream. Никакой неявной магии.

2. **Discriminated union для результата.** `DeskewResult = ok | low_confidence | no_document | unsupported_case`. TypeScript narrowing работает:
   ```ts
   if (result.status === 'ok') {
     result.deskewedImage; // Buffer — не null
   }
   ```

3. **Типизированные ошибки.** `DeskewError.code` — строка из union, а не `string`. Потребитель может:
   ```ts
   catch (e) { if (e.code === 'INVALID_BUFFER') { ... } }
   ```

4. **Правильное управление памятью OpenCV.** `cv.Mat.delete()` вызывается в `finally` для `src`, и явно для промежуточных `blurred`, `edges`, `hierarchy`, контуров. WASM-память не течёт.

5. **Синглтон OpenCV.** `getCV()` инициализирует WASM один раз. Последующие вызовы мгновенные. Promise кешируется — нет гонки при параллельных вызовах.

6. **Чёткая валидация входа.** `validateAndGetMetadata` проверяет: Buffer, формат, размерности, лимит пикселей. Всё на одном дыхании с понятными сообщениями.

7. **Модуль без состояния.** `deskew()` — чистая функция (насколько позволяет OpenCV WASM). Нет глобальных переменных кроме закешированного `cv`.

---

## 🧪 Тестирование: coverage gap analysis

| Приоритет | Что тестировать | Почему |
|-----------|----------------|--------|
| 🔴 P0 | Golden fixtures (реальные сканы) | Не знаем точность на реальных документах |
| 🔴 P0 | WebP-вход | Контракт говорит WebP, тесты — только PNG |
| 🟡 P1 | Пограничные углы (45°, -45°, 0°) | Края диапазона могут вести себя иначе |
| 🟡 P1 | Разные размеры (1536×1536, 100×1500) | Проверить на максимальном контрактном размере |
| 🟢 P2 | Тёмный фон | Алгоритм заявлен для белого фона — проверить поведение |
| 🟢 P2 | Очень плотный текст (весь лист заполнен) | Canny может дать слишком много рёбер |
| 🟢 P2 | Повреждённый WebP/JPEG | Проверить, что ошибка читаема |

---

## 🚀 Идеи (roadmap+)

1. **Perspective correction** — `approxPolyDP` → 4 угла → `warpPerspective`. Решение отложено до экспериментов. Код почти готов: `approxPolyDP` и `warpPerspective` уже доступны в OpenCV.

2. **Авто-rotate для orientation (0/90/180/270)** — следующий модуль DocuOrient. VLM-подход уже спроектирован в CONTEXT.md.

3. **Batch-режим** — `deskewMany(buffers[])` с однократной инициализацией OpenCV. Для пайплайна из 100+ документов экономит ~1s на повторной загрузке WASM.

4. **DEBUG-режим** — возвращать промежуточные изображения (Canny edges, контуры) для визуальной отладки. Полезно при калибровке параметров.

5. **Benchmark suite** — замер throughput на 100+ документах. Критично для понимания, укладываемся ли в бюджет времени общего пайплайна DocuMind.

---

## 📋 Чеклист

- [ ] **P0** — Добавить golden fixtures (реальные сканы)
- [ ] **P0** — Калибровка confidence на реальных документах
- [ ] **P1** — Убрать двойной WebP encode/decode (одна цепочка sharp)
- [ ] **P1** — Реализовать `unsupported_case` или удалить из экспорта
- [ ] **P1** — Добавить WebP-тест
- [ ] **P1** — Добавить CLI
- [ ] **P2** — Типизировать `CV` минимальным интерфейсом
- [ ] **P2** — Оптимизировать два прохода по контурам
- [ ] **P2** — Вынести `detectOrientation` в types.ts
- [ ] **P2** — Добавить тест на 1536×1536

---

*Ревизия проведена: 2026-07-09 | Модель: deepseek-v4-pro (opencode-go)*

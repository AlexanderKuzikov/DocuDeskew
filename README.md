<p align="center">
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript 6" src="https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white"></a>
  <a href="https://nodejs.org/"><img alt="Node 20" src="https://img.shields.io/badge/Node-20+-339933?logo=node.js&logoColor=white"></a>
  <a href="https://opencv.org/"><img alt="OpenCV" src="https://img.shields.io/badge/OpenCV-WASM-red?logo=opencv&logoColor=white"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/License-Apache_2.0-blue.svg"></a>
</p>

<h1 align="center">DocuDeskew</h1>
<p align="center">Библиотека выравнивания сканированных документов (-45..+45°)</p>

---

Определяет угол наклона через OpenCV Canny edge detection + minAreaRect, поворачивает изображение. Dual build (ESM+CJS) через tsup. Часть pipeline DocuMind. npm: `docu-deskew`.

- **OpenCV.js (WASM)** — Canny + minAreaRect для определения угла
- **Sharp** — I/O изображений, поворот
- **Dual build** — ESM + CJS через tsup
- **CLI** — deskew.mjs (один файл), batch.mjs (папка)
- **Vitest** — unit-тесты
- **Диапазон** — -45..+45 градусов

## Быстрый старт

```bash
git clone https://github.com/AlexanderKuzikov/DocuDeskew.git
cd DocuDeskew
npm install
npm run build
npm test

node scripts/deskew.mjs input.png output.png
node scripts/batch.mjs ./scans/
```

## Документация

- [`docs/CONTEXT.md`](docs/CONTEXT.md) — состояние проекта
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — архитектурные решения

## Статус

**Работает** — библиотека + CLI. Часть DocuMind pipeline.

## Лицензия

[Apache-2.0](LICENSE) © Alexander Kuzikov

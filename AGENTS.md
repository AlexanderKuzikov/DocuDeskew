# DocuDeskew — Instructions for AI Agents

## Commands
- build: `npm run build`
- typecheck: `npm run typecheck`
- test: `npm test`

## Conventions
- TypeScript 6, ESM+CJS dual build (tsup)
- OpenCV.js (WASM) — Canny + minAreaRect
- Sharp для I/O изображений
- Vitest для тестов
- Диапазон: -45..+45 градусов
- npm package: docu-deskew

## Structure
- `src/` — библиотека (deskew, detect, utils)
- `scripts/` — CLI (deskew.mjs, batch.mjs)
- `dist/` — build output

## Do NOT touch
- `node_modules/`
- `dist/` — генерируется

## Documentation rules
- После работы — обнови docs/CONTEXT.md
- Если принял архитектурное решение — запиши в docs/DECISIONS.md
- НЕ создавай новых файлов документации без разрешения

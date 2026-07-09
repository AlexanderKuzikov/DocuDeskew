/**
 * Batch deskew processor.
 * Usage: node batch.mjs [inputDir] [outputDir]
 * Default: ./in → ./out
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { extname, join, basename } from 'path';
import { deskew } from './dist/index.js';

const inDir = process.argv[2] ?? 'in';
const outDir = process.argv[3] ?? 'out';

if (!existsSync(inDir)) {
  console.error(`Папка "${inDir}" не найдена. Создай её и положи туда файлы.`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const exts = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const files = readdirSync(inDir).filter(f => exts.has(extname(f).toLowerCase()));

if (files.length === 0) {
  console.log('Нет файлов для обработки. Поддерживаются: PNG, JPEG, WebP.');
  process.exit(0);
}

const report = [`DocuDeskew batch — ${new Date().toISOString()}\n`];
let ok = 0;
let fail = 0;

for (const file of files) {
  const input = readFileSync(join(inDir, file));
  const result = await deskew(input);

  if (result.status === 'ok') {
    const outName = basename(file, extname(file)) + '-straight.webp';
    writeFileSync(join(outDir, outName), result.deskewedImage);
    report.push(`✅ ${file} → ${outName}  (${result.angle.toFixed(1)}°, ${(result.confidence * 100).toFixed(0)}%)`);
    ok += 1;
  } else {
    report.push(`❌ ${file}  ${result.status}${result.reason ? ': ' + result.reason : ''}`);
    fail += 1;
  }
}

report.push(`\nИтого: ${ok} ok, ${fail} ошибок`);

writeFileSync(join(outDir, 'report.txt'), report.join('\n'), 'utf-8');
console.log(report.join('\n'));

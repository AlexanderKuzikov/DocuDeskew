import { readFileSync, writeFileSync } from 'fs';
import { deskew } from './dist/index.js';

const input = process.argv[2];
const output = process.argv[3] ?? input.replace(/\.\w+$/, '-straight.webp');

if (!input) {
  console.error('Usage: node deskew.mjs <input.webp> [output.webp]');
  process.exit(1);
}

(async () => {
  const buf = readFileSync(input);
  const result = await deskew(buf);

  if (result.status === 'ok') {
    writeFileSync(output, result.deskewedImage);
    console.log(`OK — угол: ${result.angle.toFixed(2)}°, уверенность: ${(result.confidence * 100).toFixed(0)}%`);
    console.log(`Записан: ${output}`);
  } else {
    console.error(`${result.status} — ${result.reason ?? ''}`);
    process.exit(1);
  }
})();

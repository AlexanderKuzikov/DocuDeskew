import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { deskew } from '../src/deskew.js';
import type { DeskewError } from '../src/types.js';

async function createSkewedDocument(angleDeg: number, lineCount = 34): Promise<Buffer> {
  const width = 900;
  const height = 1200;
  const margin = 48;
  const defaultLineCount = 34;
  const lines = defaultLineCount > 0
    ? Array.from({ length: defaultLineCount }, (_, index) => {
        const y = margin + 70 + index * 24;
        const lineLength = 650 + (index % 3) * 45;
        return `<line x1="${margin + 45}" y1="${y}" x2="${margin + 45 + lineLength}" y2="${y}" stroke="#111" stroke-width="3"/>`;
      }).join('\n')
    : '';

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="#fff"/>
      <rect x="${margin}" y="${margin}" width="${width - margin * 2}" height="${height - margin * 2}" fill="none" stroke="#111" stroke-width="8"/>
      <line x1="${margin}" y1="${margin}" x2="${width - margin}" y2="${margin}" stroke="#111" stroke-width="8"/>
      <line x1="${width - margin}" y1="${margin}" x2="${width - margin}" y2="${height - margin}" stroke="#111" stroke-width="8"/>
      <line x1="${width - margin}" y1="${height - margin}" x2="${margin}" y2="${height - margin}" stroke="#111" stroke-width="8"/>
      <line x1="${margin}" y1="${height - margin}" x2="${margin}" y2="${margin}" stroke="#111" stroke-width="8"/>
      ${lines}
    </svg>
  `;

  return sharp(Buffer.from(svg)).grayscale().rotate(angleDeg, { background: { r: 255, g: 255, b: 255, alpha: 1 } }).png().toBuffer();
}

describe('deskew', () => {
  it('deskews a clean synthetic document within 0.5 degrees', async () => {
    const input = await createSkewedDocument(10);

    const result = await deskew(input);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') {
      throw new Error(`Expected ok, got ${result.status}`);
    }
    expect(Math.abs(result.angle - -10)).toBeLessThanOrEqual(0.5);
    expect(result.orientation).toBe('portrait');
    expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    expect(Buffer.isBuffer(result.deskewedImage)).toBe(true);
  });

  it('deskews a border-only synthetic document without text lines', async () => {
    const input = await createSkewedDocument(8, 0);

    const result = await deskew(input);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') {
      throw new Error(`Expected ok, got ${result.status}`);
    }
    expect(Math.abs(result.angle - -8)).toBeLessThanOrEqual(1);
  });

  it('returns no_document for an almost empty white image', async () => {
    const input = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="white"/></svg>')).grayscale().png().toBuffer();

    const result = await deskew(input);

    expect(result.status).toBe('no_document');
    expect(result.angle).toBe(0);
    expect(result.deskewedImage).toBeNull();
  });

  it('returns low_confidence when minConfidence is impossible', async () => {
    const input = await createSkewedDocument(-7);

    const result = await deskew(input, { minConfidence: 0.999 });

    expect(result.status).toBe('low_confidence');
    if (result.status !== 'low_confidence') {
      throw new Error(`Expected low_confidence, got ${result.status}`);
    }
    expect(typeof result.angle).toBe('number');
    expect(result.deskewedImage).toBeNull();
  });

  it('throws INVALID_BUFFER for missing or empty buffers', async () => {
    await expect(deskew(Buffer.alloc(0))).rejects.toMatchObject({ code: 'INVALID_BUFFER' });
    await expect(deskew('not-a-buffer' as unknown as Buffer)).rejects.toMatchObject({ code: 'INVALID_BUFFER' });
  });

  it('throws INVALID_IMAGE for corrupted image buffers', async () => {
    await expect(deskew(Buffer.from('not an image'))).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
  });

  it('throws INVALID_OPTIONS for invalid options', async () => {
    const input = await createSkewedDocument(0);

    await expect(deskew(input, { edgeThreshold: -1 })).rejects.toMatchObject({ code: 'INVALID_OPTIONS' });
    await expect(deskew(input, { dilateIterations: 1.5 })).rejects.toMatchObject({ code: 'INVALID_OPTIONS' });
  });

  it('throws IMAGE_TOO_LARGE when maxPixels is exceeded', async () => {
    const input = await createSkewedDocument(0);

    await expect(deskew(input, { maxPixels: 1 })).rejects.toMatchObject({ code: 'IMAGE_TOO_LARGE' });
  });
});

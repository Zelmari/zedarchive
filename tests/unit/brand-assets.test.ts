import { describe, it, expect } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

describe('brand and hero watermark optimized assets', () => {
  const publicDir = resolve(process.cwd(), 'public');

  it('public/wordmark-logo.webp exists, has 96x96 dimensions, webp format, and is < 20 KB', async () => {
    const filePath = resolve(publicDir, 'wordmark-logo.webp');
    expect(existsSync(filePath), 'public/wordmark-logo.webp must exist').toBe(true);

    const meta = await sharp(filePath).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(96);
    expect(meta.height).toBe(96);

    const stats = statSync(filePath);
    expect(stats.size).toBeLessThan(20_000);
  });

  it('public/hero-watermark.webp exists, has 640x640 dimensions, webp format, and is < 80 KB', async () => {
    const filePath = resolve(publicDir, 'hero-watermark.webp');
    expect(existsSync(filePath), 'public/hero-watermark.webp must exist').toBe(true);

    const meta = await sharp(filePath).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(640);
    expect(meta.height).toBe(640);

    const stats = statSync(filePath);
    expect(stats.size).toBeLessThan(80_000);
  });
});

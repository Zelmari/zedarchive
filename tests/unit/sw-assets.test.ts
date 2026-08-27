import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const publicDir = fileURLToPath(new URL('../../public', import.meta.url));

function extractStaticAssets(): string[] {
  const sw = readFileSync(resolve(publicDir, 'sw.js'), 'utf8');
  const match = sw.match(/STATIC_ASSETS\s*=\s*(\[[^\]]*\])/);
  if (!match) throw new Error('STATIC_ASSETS not found in sw.js');
  return [...(match[1] as string).matchAll(/'([^']+)'/g)].map((m) => String(m[1]));
}

describe('service worker precache list', () => {
  it('references only files that exist in public/', () => {
    const assets = extractStaticAssets();
    expect(assets.length).toBeGreaterThan(0);
    for (const asset of assets) {
      expect(
        existsSync(resolve(publicDir, asset.replace(/^\//, ''))),
        `${asset} is missing from public/ — cache.addAll would fail and abort SW installation`,
      ).toBe(true);
    }
  });

  it('includes the offline fallback page', () => {
    expect(extractStaticAssets()).toContain('/offline.html');
  });
});

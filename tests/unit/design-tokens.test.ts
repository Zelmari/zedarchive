import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const srcDir = fileURLToPath(new URL('../../src', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(name) ? [path] : [];
  });
}

const files = sourceFiles(srcDir).map((path) => ({
  path: relative(srcDir, path),
  text: readFileSync(path, 'utf8'),
}));

describe('design tokens', () => {
  it('only references --za-* custom properties that are defined', () => {
    const defined = new Set<string>();
    for (const { text } of files) {
      for (const m of text.matchAll(/(--za-[a-z0-9-]+)\s*:/g)) defined.add(String(m[1]));
    }

    const missing: string[] = [];
    for (const { path, text } of files) {
      for (const m of text.matchAll(/var\((--za-[a-z0-9-]+)/g)) {
        const token = String(m[1]);
        if (!defined.has(token)) missing.push(`${path}: ${token}`);
      }
    }

    expect(missing, 'undefined tokens resolve to nothing and silently drop styles').toEqual([]);
  });

  it('sets font families with family-name: so Tailwind does not emit font-weight', () => {
    const offenders = files
      .filter(({ text }) => /font-\[var\(--za-font-/.test(text))
      .map(({ path }) => path);

    expect(offenders, 'use font-[family-name:var(--za-font-*)] instead').toEqual([]);
  });
});

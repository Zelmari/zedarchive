import { describe, it, expect, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

vi.mock('next/font/google', () => ({
  Cinzel: () => ({ variable: '--font-cinzel' }),
  JetBrains_Mono: () => ({ variable: '--font-jetbrains-mono' }),
  Newsreader: () => ({ variable: '--font-newsreader' }),
  Playfair_Display: () => ({ variable: '--font-playfair' }),
}));

import { metadata } from '@/app/layout';
import robots from '@/app/robots';

describe('social link preview metadata (root layout)', () => {
  it('defines metadataBase pointing to valid URL', () => {
    expect(metadata.metadataBase).toBeInstanceOf(URL);
  });

  it('configures Open Graph metadata with 1200x630 preview image', () => {
    expect(metadata.openGraph).toBeDefined();
    expect(metadata.openGraph?.title).toBe('zedarchive — Quiet Media Archive');
    expect(metadata.openGraph?.siteName).toBe('zedarchive');
    expect(metadata.openGraph?.type).toBe('website');

    const images = metadata.openGraph?.images as Array<{
      url: string;
      width: number;
      height: number;
      alt?: string;
    }>;
    expect(Array.isArray(images)).toBe(true);
    expect(images.length).toBeGreaterThan(0);
    expect(images[0]?.url).toBe('/og.png');
    expect(images[0]?.width).toBe(1200);
    expect(images[0]?.height).toBe(630);
  });

  it('configures Twitter Card with summary_large_image', () => {
    expect(metadata.twitter).toBeDefined();
    expect(metadata.twitter?.card).toBe('summary_large_image');
    expect(metadata.twitter?.images).toContain('/og.png');
  });

  it('allows Twitterbot and other preview crawlers in robots.txt', () => {
    const { rules } = robots();
    const list = Array.isArray(rules) ? rules : [rules];
    const agents = list.map((rule) =>
      Array.isArray(rule.userAgent) ? rule.userAgent.join(' ') : rule.userAgent,
    );
    expect(agents).toContain('*');
    expect(agents).toContain('Twitterbot');
    expect(agents).toContain('facebookexternalhit');
    expect(agents).toContain('Applebot');
    for (const rule of list) {
      expect(rule.allow).toBe('/');
    }
  });
});

describe('social link preview assets', () => {
  const publicDir = resolve(process.cwd(), 'public');

  it('public/og.png exists and is a valid 1200x630 PNG', async () => {
    const ogPath = resolve(publicDir, 'og.png');
    expect(existsSync(ogPath), 'public/og.png must exist').toBe(true);

    const meta = await sharp(ogPath).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(630);
  });

  it('public/icons/og-square.png exists and is a valid 600x600 PNG', async () => {
    const squarePath = resolve(publicDir, 'icons/og-square.png');
    expect(existsSync(squarePath), 'public/icons/og-square.png must exist').toBe(true);

    const meta = await sharp(squarePath).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(600);
    expect(meta.height).toBe(600);
  });
});

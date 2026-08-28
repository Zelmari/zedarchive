import { describe, it, expect } from 'vitest';
import { parseSpoilers } from '@/lib/spoilers';
import { renderInlineMarkdown } from '@/lib/markdown';

describe('parseSpoilers', () => {
  it('parses Discord/Telegram-style ||spoiler|| syntax', () => {
    const parsed = parseSpoilers('Luke is ||Vader’s son||!');
    expect(parsed).not.toBe('Luke is ||Vader’s son||!');
  });

  it('parses Reddit-style >!spoiler!< syntax', () => {
    const parsed = parseSpoilers('Dumbledore >!dies on page 596!<');
    expect(parsed).not.toBe('Dumbledore >!dies on page 596!<');
  });

  it('leaves clean text untouched if no spoiler markers exist', () => {
    const plain = 'Just normal text';
    expect(parseSpoilers(plain)).toBe(plain);
  });
});

describe('renderInlineMarkdown with spoilers', () => {
  it('renders nested bold markdown inside spoiler tags', () => {
    const nodes = renderInlineMarkdown('The twist is ||**he was dead all along**||');
    expect(nodes.length).toBeGreaterThan(1);
  });
});

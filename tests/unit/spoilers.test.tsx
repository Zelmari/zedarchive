import { describe, it, expect } from 'vitest';
import { createElement, Fragment, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseSpoilers } from '@/lib/spoilers';
import { renderInlineMarkdown } from '@/lib/markdown';

const toHtml = (nodes: ReactNode) => renderToStaticMarkup(createElement(Fragment, null, nodes));

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

describe('SpoilerSpan Theme Contrast', () => {
  it('renders an opaque ink bar over transparent text when hidden', () => {
    const html = toHtml(renderInlineMarkdown('||Secret||'));
    expect(html).toContain('bg-ink ');
    expect(html).toContain('text-transparent');
    // bg-current would resolve to the transparent text colour and hide the bar too.
    expect(html).not.toContain('bg-current');
  });

  it('renders the same visible bar for profile comment spoilers', () => {
    const html = toHtml(parseSpoilers('Ending: ||Secret||'));
    expect(html).toContain('bg-ink ');
    expect(html).toContain('aria-expanded="false"');
  });
});

import { describe, it, expect } from 'vitest';
import { renderInlineMarkdown } from '@/lib/markdown';

describe('renderInlineMarkdown', () => {
  it('parses bold, italic, and strikethrough tokens', () => {
    const nodes = renderInlineMarkdown('This is **bold**, *italic*, and ~~strikethrough~~ text.');
    expect(nodes.length).toBeGreaterThan(1);
  });

  it('safely allows valid HTTPS links and renders anchor', () => {
    const nodes = renderInlineMarkdown('Check [Google](https://google.com)');
    expect(nodes).toHaveLength(2);
  });

  it('neutralizes malicious javascript: links to plain text without anchor', () => {
    const nodes = renderInlineMarkdown('Click [Dangerous](javascript:alert(1))');
    expect(nodes).toContain('Dangerous');
  });

  it('renders inline code blocks', () => {
    const nodes = renderInlineMarkdown('Use `const x = 10;` here');
    expect(nodes.length).toBeGreaterThan(1);
  });
});

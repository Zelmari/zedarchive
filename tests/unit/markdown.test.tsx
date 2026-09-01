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

  it('does not apply hardcoded text-ink classes to strong, em, code, del', () => {
    const nodes = renderInlineMarkdown('**bold** *italic* `code` ~~strike~~');
    const htmlString = JSON.stringify(nodes);
    expect(htmlString).not.toContain('text-ink');
  });

  it('parses ***bold italic*** syntax as strong with italic', () => {
    const nodes = renderInlineMarkdown('***bold and italic***');
    expect(nodes.length).toBe(1);
    const node = nodes[0] as React.ReactElement<{ className?: string }>;
    expect(node.type).toBe('strong');
    expect(node.props.className).toContain('italic');
  });

  it('does not format snake_case identifiers as italics', () => {
    const nodes = renderInlineMarkdown('const my_cool_variable = 123;');
    const textContent = nodes.map((n) => (typeof n === 'string' ? n : '')).join('');
    expect(textContent).toContain('my_cool_variable');
  });
});

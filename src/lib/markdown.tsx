'use client';

import React from 'react';
import { SpoilerSpan } from './spoilers';

/**
 * Validates URLs to prevent XSS via javascript: or data: schemes.
 */
function sanitizeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (/^(https?:\/\/|mailto:|\/)/i.test(trimmed)) {
    return trimmed;
  }
  return null;
}

/**
 * Parses inline markdown tokens (bold, italic, code, strikethrough, links, spoilers).
 */
export function renderInlineMarkdown(text: string): React.ReactNode[] {
  // Regex to match:
  // 1. Links: [text](url)
  // 2. Spoilers: ||text|| or >!text!<
  // 3. Bold: **text** or __text__
  // 4. Strikethrough: ~~text~~
  // 5. Italic: *text* or _text_
  // 6. Inline code: `code`
  const tokenRegex =
    /(\[([^\]]+)\]\(([^)]+)\)|\|\|([\s\S]+?)\|\||>!([\s\S]+?)!<|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|\*([^*]+)\*|_([^_]+)_|`([^`]+)`)/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    const [
      fullMatch,
      ,
      linkText,
      linkUrl,
      spoiler1,
      spoiler2,
      bold1,
      bold2,
      strike,
      italic1,
      italic2,
      code,
    ] = match;
    const startIndex = match.index;

    // Text before match
    if (startIndex > lastIndex) {
      parts.push(text.slice(lastIndex, startIndex));
    }

    const key = `inline-${startIndex}-${lastIndex}`;

    if (linkText && linkUrl) {
      const safeHref = sanitizeUrl(linkUrl);
      if (safeHref) {
        parts.push(
          <a
            key={key}
            href={safeHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline hover:text-ink transition-colors"
          >
            {renderInlineMarkdown(linkText)}
          </a>,
        );
      } else {
        parts.push(linkText);
      }
    } else if (spoiler1 || spoiler2) {
      const spoilerText = spoiler1 ?? spoiler2 ?? '';
      parts.push(<SpoilerSpan key={key}>{renderInlineMarkdown(spoilerText)}</SpoilerSpan>);
    } else if (bold1 || bold2) {
      const boldText = bold1 ?? bold2 ?? '';
      parts.push(
        <strong key={key} className="font-[var(--za-weight-emphasis)] text-ink">
          {renderInlineMarkdown(boldText)}
        </strong>,
      );
    } else if (strike) {
      parts.push(
        <del key={key} className="line-through text-ink-muted">
          {renderInlineMarkdown(strike)}
        </del>,
      );
    } else if (italic1 || italic2) {
      const italicText = italic1 ?? italic2 ?? '';
      parts.push(
        <em key={key} className="italic text-ink">
          {renderInlineMarkdown(italicText)}
        </em>,
      );
    } else if (code) {
      parts.push(
        <code
          key={key}
          className="rounded-xs bg-surface px-1 py-0.5 font-mono text-[0.85em] text-ink border border-decorative"
        >
          {code}
        </code>,
      );
    }

    lastIndex = startIndex + fullMatch.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

interface MarkdownNotesProps {
  content: string;
  className?: string;
}

/**
 * Editorial Markdown Component for personal notes, quotes, and reviews.
 */
export function MarkdownNotes({ content, className = '' }: MarkdownNotesProps) {
  if (!content || !content.trim()) return null;

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null;

  const flushList = (index: number) => {
    if (!currentList) return;
    if (currentList.type === 'ul') {
      elements.push(
        <ul key={`ul-${index}`} className="my-1.5 list-disc pl-5 space-y-0.5 text-ink">
          {currentList.items.map((item, i) => (
            <li key={i} className="leading-relaxed">
              {renderInlineMarkdown(item)}
            </li>
          ))}
        </ul>,
      );
    } else {
      elements.push(
        <ol key={`ol-${index}`} className="my-1.5 list-decimal pl-5 space-y-0.5 text-ink">
          {currentList.items.map((item, i) => (
            <li key={i} className="leading-relaxed">
              {renderInlineMarkdown(item)}
            </li>
          ))}
        </ol>,
      );
    }
    currentList = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (typeof rawLine !== 'string') continue;
    const trimmed = rawLine.trim();

    // Check Unordered List: - item or * item
    const ulMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (ulMatch && ulMatch[1]) {
      if (!currentList || currentList.type !== 'ul') {
        flushList(i);
        currentList = { type: 'ul', items: [] };
      }
      currentList.items.push(ulMatch[1]);
      continue;
    }

    // Check Ordered List: 1. item
    const olMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (olMatch && olMatch[1]) {
      if (!currentList || currentList.type !== 'ol') {
        flushList(i);
        currentList = { type: 'ol', items: [] };
      }
      currentList.items.push(olMatch[1]);
      continue;
    }

    // Not a list item, flush any existing list
    flushList(i);

    if (!trimmed) {
      // Empty line -> spacing
      elements.push(<div key={`blank-${i}`} className="h-1.5" />);
      continue;
    }

    // Blockquote: > text
    if (trimmed.startsWith('>')) {
      const quoteText = trimmed.replace(/^>\s*/, '');
      elements.push(
        <blockquote
          key={`quote-${i}`}
          className="my-2 border-l-2 border-accent pl-3 italic text-ink-muted leading-relaxed"
        >
          {renderInlineMarkdown(quoteText)}
        </blockquote>,
      );
      continue;
    }

    // Headers: ### or ####
    if (trimmed.startsWith('####')) {
      elements.push(
        <h5
          key={`h5-${i}`}
          className="mt-2 mb-1 text-xs font-[var(--za-weight-emphasis)] uppercase tracking-wider text-ink"
        >
          {renderInlineMarkdown(trimmed.replace(/^####\s*/, ''))}
        </h5>,
      );
      continue;
    }

    if (trimmed.startsWith('###')) {
      elements.push(
        <h4
          key={`h4-${i}`}
          className="mt-2.5 mb-1 text-sm font-[var(--za-weight-heading)] text-ink"
        >
          {renderInlineMarkdown(trimmed.replace(/^###\s*/, ''))}
        </h4>,
      );
      continue;
    }

    // Standard paragraph
    elements.push(
      <p key={`p-${i}`} className="leading-relaxed text-ink">
        {renderInlineMarkdown(rawLine)}
      </p>,
    );
  }

  flushList(lines.length);

  return <div className={`text-xs ${className}`}>{elements}</div>;
}

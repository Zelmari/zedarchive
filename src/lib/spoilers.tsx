'use client';

import React, { useState } from 'react';

interface SpoilerSpanProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Click-to-reveal spoiler blackout span with full keyboard accessibility.
 */
export function SpoilerSpan({ children, className = '' }: SpoilerSpanProps) {
  const [revealed, setRevealed] = useState(false);

  return (
    <span
      role="button"
      tabIndex={0}
      aria-expanded={revealed}
      aria-label={
        revealed ? 'Spoiler revealed. Click to hide.' : 'Spoiler hidden. Click to reveal.'
      }
      onClick={(e) => {
        e.stopPropagation();
        setRevealed((prev) => !prev);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          setRevealed((prev) => !prev);
        }
      }}
      className={`inline cursor-pointer rounded-xs px-1 py-0.5 transition-[background-color,opacity] duration-[var(--za-motion-fast)] ${
        revealed
          ? 'bg-current/15 text-inherit'
          : 'bg-current text-transparent select-none hover:opacity-90'
      } ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * Parses raw text containing ||spoiler|| or >!spoiler!< into React nodes with SpoilerSpans.
 */
export function parseSpoilers(text: string): React.ReactNode {
  if (!text) return text;
  const regex = /(\|\|([\s\S]+?)\|\||>!([\s\S]+?)!<)/g;
  if (!regex.test(text)) return text;
  regex.lastIndex = 0;

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      elements.push(text.substring(lastIndex, match.index));
    }
    const spoilerContent = match[2] || match[3] || '';
    elements.push(<SpoilerSpan key={`spoiler-${match.index}`}>{spoilerContent}</SpoilerSpan>);
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    elements.push(text.substring(lastIndex));
  }

  return elements.length > 0 ? <>{elements}</> : text;
}

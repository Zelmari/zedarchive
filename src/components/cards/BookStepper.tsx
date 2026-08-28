'use client';

import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { pageToPercent, percentToPage } from '@/lib/format';

interface BookStepperProps {
  value: string;
  canDecrement: boolean;
  canIncrement: boolean;
  total: number | null;
  disabled?: boolean;
  onValueChange: (value: string) => void;
  /** Commit an absolute numeric value (from blur/Enter). */
  onCommit: (value: string) => void;
  /** Step by delta from the authoritative current value (buttons). */
  onStep: (delta: number) => void;
}

const stepperBtn =
  'inline-flex h-[var(--za-control-min-block-size)] w-[var(--za-control-min-block-size)] shrink-0 cursor-pointer items-center justify-center rounded-control border border-required bg-surface font-[var(--za-weight-emphasis)] text-ink transition-[all] duration-[var(--za-motion-fast)] hover:border-accent hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40';

/** Chapter/page control row for books/manga with Page / % mode toggle */
export default function BookStepper({
  value,
  canDecrement,
  canIncrement,
  total,
  disabled = false,
  onValueChange,
  onCommit,
  onStep,
}: BookStepperProps) {
  const [mode, setMode] = useState<'page' | 'percent'>(() => {
    if (typeof window === 'undefined') return 'page';
    try {
      return localStorage.getItem('za-book-input-mode') === 'percent' ? 'percent' : 'page';
    } catch {
      return 'page';
    }
  });

  const toggleMode = () => {
    if (!total || total <= 0) return;
    const nextMode = mode === 'page' ? 'percent' : 'page';
    setMode(nextMode);
    try {
      localStorage.setItem('za-book-input-mode', nextMode);
    } catch {
      // Ignored
    }
  };

  const currentNum = parseInt(value, 10) || 0;
  const currentPercent = pageToPercent(currentNum, total);

  const displayVal = mode === 'percent' && total ? String(currentPercent) : value;

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  const handleInputChange = (raw: string) => {
    if (mode === 'percent' && total) {
      const parsedPct = parseInt(raw, 10);
      if (isNaN(parsedPct)) {
        onValueChange('');
        return;
      }
      const page = percentToPage(parsedPct, total);
      onValueChange(String(page));
    } else {
      onValueChange(raw);
    }
  };

  const handleInputBlur = (raw: string) => {
    if (mode === 'percent' && total) {
      const parsedPct = parseInt(raw, 10);
      const safePct = isNaN(parsedPct) ? 0 : Math.min(100, Math.max(0, parsedPct));
      const page = percentToPage(safePct, total);
      onCommit(String(page));
    } else {
      onCommit(raw);
    }
  };

  const handleStepPercent = (deltaPct: number) => {
    if (!total) return;
    const nextPct = Math.min(100, Math.max(0, currentPercent + deltaPct));
    const nextPg = percentToPage(nextPct, total);
    onCommit(String(nextPg));
  };

  const hasTotal = total !== null && total > 0;

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        className={stepperBtn}
        onClick={() => (mode === 'percent' && hasTotal ? handleStepPercent(-1) : onStep(-1))}
        disabled={!canDecrement || disabled}
        title={mode === 'percent' ? 'Step -1%' : 'Decrement chapter/page (-1)'}
        aria-label={mode === 'percent' ? 'Step -1%' : 'Decrement chapter/page'}
      >
        <Minus size={15} strokeWidth={2.2} />
      </button>

      <div className="relative flex-1">
        <input
          type="number"
          min="0"
          max={mode === 'percent' && hasTotal ? 100 : total || undefined}
          className="h-[var(--za-control-min-block-size)] min-h-[var(--za-control-min-block-size)] w-full rounded-control border border-required bg-surface px-2 text-center text-[length:var(--za-text-supporting)] font-[var(--za-weight-heading)] text-ink outline-none focus:border-accent"
          value={displayVal}
          onChange={(e) => handleInputChange(e.target.value)}
          onBlur={(e) => handleInputBlur(e.target.value)}
          onKeyDown={handleKeyDown}
          title={
            mode === 'percent'
              ? `Percentage: ${currentPercent}% (${currentNum} of ${total} pages)`
              : `Page ${currentNum}${total ? ` of ${total} (${currentPercent}%)` : ''}`
          }
          aria-label={mode === 'percent' ? 'Reading percentage' : 'Current chapter or page'}
        />
        {mode === 'percent' && hasTotal && (
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-muted">
            %
          </span>
        )}
      </div>

      <button
        type="button"
        className={stepperBtn}
        onClick={() => (mode === 'percent' && hasTotal ? handleStepPercent(1) : onStep(1))}
        disabled={!canIncrement || disabled}
        title={mode === 'percent' ? 'Step +1%' : 'Increment chapter/page (+1)'}
        aria-label={mode === 'percent' ? 'Step +1%' : 'Increment chapter/page'}
      >
        <Plus size={15} strokeWidth={2.2} />
      </button>

      {/* Mode Toggle [ p | % ] */}
      <button
        type="button"
        onClick={toggleMode}
        disabled={!hasTotal || disabled}
        title={
          hasTotal
            ? `Switch to ${mode === 'page' ? 'Percentage (%) mode' : 'Page (p.) mode'}`
            : 'Set total pages in edit modal to enable percentage mode'
        }
        aria-label="Toggle Page or Percentage Mode"
        className={`inline-flex h-[var(--za-control-min-block-size)] px-2 shrink-0 cursor-pointer items-center justify-center rounded-control border text-xs font-[var(--za-weight-emphasis)] transition-[all] duration-[var(--za-motion-fast)] ${
          !hasTotal
            ? 'border-decorative bg-surface-subtle text-ink-muted opacity-40 cursor-not-allowed'
            : mode === 'percent'
              ? 'border-accent bg-accent/15 text-accent'
              : 'border-decorative bg-surface text-ink-muted hover:border-required hover:text-ink'
        }`}
      >
        {mode === 'percent' ? '%' : 'p.'}
      </button>
    </div>
  );
}

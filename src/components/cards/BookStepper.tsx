'use client';

import { Minus, Plus } from 'lucide-react';
import type { KeyboardEvent } from 'react';

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
  'inline-flex h-[var(--za-control-min-block-size)] w-[var(--za-control-min-block-size)] cursor-pointer items-center justify-center rounded-control border border-required bg-surface font-[var(--za-weight-emphasis)] text-ink transition-[all] duration-[var(--za-motion-fast)] hover:border-accent hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40';

/** Chapter/page control row for books/manga: [−] [input] [+] */
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
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={stepperBtn}
        onClick={() => onStep(-1)}
        disabled={!canDecrement || disabled}
        title="Decrement chapter/page"
        aria-label="Decrement chapter/page"
      >
        <Minus size={15} strokeWidth={2.2} />
      </button>
      <input
        type="number"
        min="0"
        max={total || undefined}
        className="h-[var(--za-control-min-block-size)] min-h-[var(--za-control-min-block-size)] w-full flex-1 rounded-control border border-required bg-surface px-[var(--za-space-3)] text-center text-[length:var(--za-text-supporting)] font-[var(--za-weight-heading)] text-ink outline-none focus:border-accent"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onBlur={(e) => onCommit(e.target.value)}
        onKeyDown={handleKeyDown}
        title="Type number and press Enter or click outside"
        aria-label="Current chapter or page"
      />
      <button
        type="button"
        className={stepperBtn}
        onClick={() => onStep(1)}
        disabled={!canIncrement || disabled}
        title="Increment chapter/page"
        aria-label="Increment chapter/page"
      >
        <Plus size={15} strokeWidth={2.2} />
      </button>
    </div>
  );
}

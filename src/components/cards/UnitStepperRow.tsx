'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface UnitStepperRowProps {
  /** e.g. "Season" | "Volume" */
  unitLabel: string;
  current: number;
  total: number;
  disabled?: boolean;
  onChange: (delta: number) => void;
  prevTitle?: string;
  nextTitle?: string;
}

/** Dashed-top row with "Season X of Y" text and mini chevron steppers. */
export default function UnitStepperRow({
  unitLabel,
  current,
  total,
  disabled = false,
  onChange,
  prevTitle,
  nextTitle,
}: UnitStepperRowProps) {
  const miniBtn =
    'inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-small border border-required bg-surface text-ink transition-[all] duration-[var(--za-motion-fast)] hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="flex items-center justify-between border-t border-dashed border-decorative pt-2 text-[length:var(--za-text-fine)] text-ink-muted">
      <span>
        {unitLabel} {current} of {total}
      </span>
      <div className="flex items-center gap-[var(--za-space-1)]">
        <button
          type="button"
          className={miniBtn}
          onClick={() => onChange(-1)}
          disabled={current <= 1 || disabled}
          title={prevTitle ?? `Previous ${unitLabel.toLowerCase()}`}
          aria-label={prevTitle ?? `Previous ${unitLabel.toLowerCase()}`}
        >
          <ChevronLeft size={13} strokeWidth={2} />
        </button>
        <button
          type="button"
          className={miniBtn}
          onClick={() => onChange(1)}
          disabled={current >= total || disabled}
          title={nextTitle ?? `Next ${unitLabel.toLowerCase()}`}
          aria-label={nextTitle ?? `Next ${unitLabel.toLowerCase()}`}
        >
          <ChevronRight size={13} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface UnitStepperRowProps {
  /** e.g. "Season" | "Volume" */
  unitLabel: string;
  current: number;
  total: number;
  /** Structure-aware navigation flag; falls back to arithmetic bounds when omitted. */
  canPrev?: boolean;
  canNext?: boolean;
  disabled?: boolean;
  onChange: (delta: number) => void;
  prevTitle?: string;
  nextTitle?: string;
}

export const stepperBtn =
  'inline-flex min-h-[var(--za-control-min-block-size)] w-[var(--za-control-min-block-size)] shrink-0 self-stretch cursor-pointer items-center justify-center rounded-small border border-decorative bg-surface font-[family-name:var(--za-font-mono)] font-[var(--za-weight-emphasis)] text-ink transition-[all] duration-[var(--za-motion-fast)] hover:border-accent hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40';

/** Dashed-top row with "Season X of Y" text and mini chevron steppers. */
export default function UnitStepperRow({
  unitLabel,
  current,
  total,
  canPrev,
  canNext,
  disabled = false,
  onChange,
  prevTitle,
  nextTitle,
}: UnitStepperRowProps) {
  const miniBtn =
    'inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-small border border-required bg-surface text-ink transition-[all] duration-[var(--za-motion-fast)] hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40';

  const prevDisabled = disabled || (canPrev !== undefined ? !canPrev : current <= 1);
  const nextDisabled = disabled || (canNext !== undefined ? !canNext : current >= total);
  const unitText =
    unitLabel === 'Season'
      ? `S${current} · ${unitLabel} ${current} of ${total}`
      : `${unitLabel} ${current} of ${total}`;

  return (
    <div className="flex items-center justify-between border-t border-dashed border-decorative pt-2 text-[length:var(--za-text-fine)] text-ink-muted">
      <span className="font-[family-name:var(--za-font-mono)]">{unitText}</span>
      <div className="flex items-center gap-[var(--za-space-1)]">
        <button
          type="button"
          className={`${miniBtn} font-[family-name:var(--za-font-mono)]`}
          onClick={() => onChange(-1)}
          disabled={prevDisabled}
          title={prevTitle ?? `Previous ${unitLabel.toLowerCase()}`}
          aria-label={prevTitle ?? `Previous ${unitLabel.toLowerCase()}`}
        >
          <ChevronLeft size={13} strokeWidth={2} />
        </button>
        <button
          type="button"
          className={miniBtn}
          onClick={() => onChange(1)}
          disabled={nextDisabled}
          title={nextTitle ?? `Next ${unitLabel.toLowerCase()}`}
          aria-label={nextTitle ?? `Next ${unitLabel.toLowerCase()}`}
        >
          <ChevronRight size={13} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

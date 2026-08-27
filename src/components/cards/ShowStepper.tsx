'use client';

import { Minus, Plus } from 'lucide-react';

interface ShowStepperProps {
  current: number;
  total: number | null;
  hasNextUnit: boolean;
  disabled?: boolean;
  subtitle?: string | null;
  onStep: (delta: number) => void;
}

const stepperBtn =
  'inline-flex min-h-[var(--za-control-min-block-size)] w-[var(--za-control-min-block-size)] shrink-0 self-stretch cursor-pointer items-center justify-center rounded-control border border-required bg-surface font-[var(--za-weight-emphasis)] text-ink transition-[all] duration-[var(--za-motion-fast)] hover:border-accent hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40';

/** Episode control row for shows/anime: [−] Ep 01 / 12 [+] */
export default function ShowStepper({
  current,
  total,
  hasNextUnit,
  disabled = false,
  subtitle,
  onStep,
}: ShowStepperProps) {
  const formattedCurrent =
    total !== null && total >= 10 && current < 10 ? `0${current}` : `${current}`;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={stepperBtn}
        onClick={() => onStep(-1)}
        disabled={current <= 0 || disabled}
        title="Decrement episode"
        aria-label="Decrement episode"
      >
        <Minus size={15} strokeWidth={2.2} />
      </button>
      <div
        className={`flex ${subtitle ? 'min-h-[var(--za-control-min-block-size)] flex-col py-[0.25rem]' : 'h-[var(--za-control-min-block-size)] min-h-[var(--za-control-min-block-size)]'} flex-1 items-center justify-center rounded-control border border-decorative bg-surface-subtle px-[var(--za-space-3)] text-center`}
      >
        <span className="text-[length:var(--za-text-supporting)] font-[var(--za-weight-heading)] leading-tight text-ink">
          Ep {formattedCurrent}
          {total ? ` / ${total}` : ''}
        </span>
        {subtitle && (
          <span className="mt-0.5 text-[0.68rem] font-normal leading-tight text-ink-muted">
            {subtitle}
          </span>
        )}
      </div>
      <button
        type="button"
        className={stepperBtn}
        onClick={() => onStep(1)}
        disabled={disabled || (!hasNextUnit && (total === null || current >= total))}
        title={
          total !== null && current >= total && hasNextUnit
            ? 'Advance to next season (Ep 1)'
            : 'Increment episode'
        }
        aria-label="Increment episode"
      >
        <Plus size={15} strokeWidth={2.2} />
      </button>
    </div>
  );
}

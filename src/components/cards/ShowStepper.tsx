'use client';

import { Minus, Plus } from 'lucide-react';
import { stepperBtn } from '@/components/cards/UnitStepperRow';

interface ShowStepperProps {
  current: number;
  total: number | null;
  hasNextUnit: boolean;
  disabled?: boolean;
  onStep: (delta: number) => void;
}

/** Episode control row for shows/anime: [−] Ep 01 / 12 [+] */
export default function ShowStepper({
  current,
  total,
  hasNextUnit,
  disabled = false,
  onStep,
}: ShowStepperProps) {
  const formattedCurrent =
    total !== null && total >= 10 && current < 10 ? `0${current}` : `${current}`;

  return (
    <div className="flex items-center gap-[var(--za-space-2)]" data-testid="show-stepper">
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
      <div className="flex h-[var(--za-control-min-block-size)] min-h-[var(--za-control-min-block-size)] flex-1 items-center justify-center rounded-small border border-decorative bg-surface-sunken px-[var(--za-space-3)] text-center">
        <span
          className="font-[family-name:var(--za-font-mono)] text-[length:var(--za-text-supporting)] font-[var(--za-weight-emphasis)] leading-tight text-ink"
          aria-live="polite"
        >
          Ep {formattedCurrent}
          {total ? ` / ${total}` : ''}
        </span>
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

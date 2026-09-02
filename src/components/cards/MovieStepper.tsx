'use client';

import { Check, RotateCcw, Minus, Plus } from 'lucide-react';
import { stepperBtn } from '@/components/cards/UnitStepperRow';

interface MovieStepperProps {
  status: string;
  runtime: number | null;
  progressMinutes: number;
  rewatchCount: number;
  disabled?: boolean;
  onMarkWatched: () => void;
  onRewatch: () => void;
  onStepMinutes?: (delta: number) => void;
}

function formatRuntime(minutes: number | null): string {
  if (!minutes || minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m} min`;
}

export default function MovieStepper({
  status,
  runtime,
  progressMinutes,
  rewatchCount,
  disabled = false,
  onMarkWatched,
  onRewatch,
  onStepMinutes,
}: MovieStepperProps) {
  const isCompleted = status === 'completed';
  const runtimeDisplay = formatRuntime(runtime);

  if (isCompleted) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex h-[var(--za-control-min-block-size)] min-h-[var(--za-control-min-block-size)] flex-1 items-center justify-between rounded-control border border-success/30 bg-success/10 px-[var(--za-space-3)] text-success">
          <div className="flex items-center gap-1.5 text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)]">
            <Check size={14} strokeWidth={2.5} />
            <span>Watched {rewatchCount > 1 ? `(${rewatchCount}x)` : ''}</span>
          </div>
          {runtimeDisplay && (
            <span className="text-[length:var(--za-text-fine)] opacity-80">{runtimeDisplay}</span>
          )}
        </div>

        <button
          type="button"
          className="za-button za-button--secondary inline-flex h-[var(--za-control-min-block-size)] shrink-0 items-center gap-1 px-3 text-xs"
          onClick={onRewatch}
          disabled={disabled}
          title="Log a rewatch (+1 view)"
          aria-label="Log rewatch"
        >
          <RotateCcw size={13} strokeWidth={2} />
          <span>Rewatch</span>
        </button>
      </div>
    );
  }

  // If in progress or planning, show minutes stepper if runtime is known and user has progress, or 1-tap "Mark Watched"
  if (runtime && runtime > 0 && onStepMinutes && progressMinutes > 0) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={stepperBtn}
          onClick={() => onStepMinutes(-15)}
          disabled={progressMinutes <= 0 || disabled}
          title="Step back 15 mins"
          aria-label="Step back 15 mins"
        >
          <Minus size={15} strokeWidth={2.2} />
        </button>

        <div className="flex h-[var(--za-control-min-block-size)] min-h-[var(--za-control-min-block-size)] flex-1 items-center justify-center rounded-control border border-decorative bg-surface-subtle px-[var(--za-space-3)] text-center">
          <span className="text-[length:var(--za-text-supporting)] font-[var(--za-weight-heading)] leading-tight text-ink">
            {progressMinutes}m / {runtime}m
          </span>
        </div>

        <button
          type="button"
          className={stepperBtn}
          onClick={() => onStepMinutes(15)}
          disabled={disabled || progressMinutes >= runtime}
          title="Advance 15 mins"
          aria-label="Advance 15 mins"
        >
          <Plus size={15} strokeWidth={2.2} />
        </button>

        <button
          type="button"
          className="za-button za-button--primary inline-flex h-[var(--za-control-min-block-size)] shrink-0 items-center gap-1 px-3 text-xs"
          onClick={onMarkWatched}
          disabled={disabled}
          title="Mark movie as watched"
        >
          <Check size={14} strokeWidth={2.2} />
          <span>Finish</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {runtimeDisplay && (
        <div className="flex h-[var(--za-control-min-block-size)] min-h-[var(--za-control-min-block-size)] flex-1 items-center justify-center rounded-control border border-decorative bg-surface-subtle px-[var(--za-space-3)] text-center">
          <span className="text-[length:var(--za-text-supporting)] font-[var(--za-weight-emphasis)] text-ink-muted">
            {runtimeDisplay}
          </span>
        </div>
      )}

      <button
        type="button"
        className={`za-button za-button--primary ${runtimeDisplay ? '' : 'w-full'} inline-flex h-[var(--za-control-min-block-size)] flex-1 items-center justify-center gap-1.5 text-xs`}
        onClick={onMarkWatched}
        disabled={disabled}
        title="Mark movie as watched"
      >
        <Check size={14} strokeWidth={2.2} />
        <span>Mark Watched</span>
      </button>
    </div>
  );
}

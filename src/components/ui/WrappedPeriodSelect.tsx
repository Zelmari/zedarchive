'use client';

import { WRAPPED_PERIODS, type WrappedPeriod } from '@/lib/wrapped-period';
import { cn } from '@/lib/cn';

interface WrappedPeriodSelectProps {
  value: WrappedPeriod;
  onChange: (period: WrappedPeriod) => void;
  className?: string;
}

const SELECT_ID = 'wrapped-period';

export default function WrappedPeriodSelect({
  value,
  onChange,
  className,
}: WrappedPeriodSelectProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={SELECT_ID} className="za-kicker">
        Period
      </label>
      <select
        id={SELECT_ID}
        className="za-field h-[var(--za-control-min-block-size)] w-full cursor-pointer px-3 py-[0.45rem] font-[family-name:var(--za-font-mono)] text-[length:var(--za-text-fine)]"
        value={value}
        onChange={(event) => onChange(event.target.value as WrappedPeriod)}
        aria-label="Period"
      >
        {WRAPPED_PERIODS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

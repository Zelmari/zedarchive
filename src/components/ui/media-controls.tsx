'use client';

import { BookOpen, Film, Library, Sparkles, Tv } from 'lucide-react';
import type { KeyboardEvent, RefObject } from 'react';
import { cn } from '@/lib/cn';
import { MAX_DROP_REASON_LENGTH, PRESET_DROP_REASONS } from '@/lib/constants';
import type { MediaCategory } from '@/types/media';

export const CATEGORY_CHIPS: Array<{
  id: MediaCategory;
  label: string;
  Icon: typeof Tv;
}> = [
  { id: 'show', label: 'TV Show', Icon: Tv },
  { id: 'movie', label: 'Movie', Icon: Film },
  { id: 'anime', label: 'Anime', Icon: Sparkles },
  { id: 'book', label: 'Book', Icon: BookOpen },
  { id: 'manga', label: 'Manga', Icon: Library },
];

export function chipClass(active: boolean): string {
  return cn(
    'flex cursor-pointer items-center gap-1 rounded-small border border-decorative bg-surface px-[var(--za-space-3)] py-[var(--za-space-2)] font-[family-name:var(--za-font-display)] text-[length:var(--za-text-supporting)] font-[var(--za-weight-heading)] uppercase tracking-[0.05em] text-ink transition-[all] duration-[var(--za-motion-fast)] hover:border-required hover:text-ink',
    active &&
      'border-required bg-surface-subtle font-[var(--za-weight-heading)] text-accent shadow-[inset_0_-2px_0_var(--za-color-accent)]',
  );
}

export function pillClass(active: boolean): string {
  return cn(
    'inline-flex min-h-8 cursor-pointer items-center whitespace-nowrap rounded-small border border-decorative bg-transparent px-[0.65rem] py-[0.3rem] font-[family-name:var(--za-font-mono)] text-[length:var(--za-text-fine)] text-ink-muted transition-[all] duration-[var(--za-motion-fast)] hover:border-required hover:text-ink',
    active &&
      'border-accent bg-accent font-[var(--za-weight-emphasis)] text-on-accent shadow-[0_2px_6px_color-mix(in_srgb,var(--za-color-accent)_20%,transparent)]',
  );
}

export interface DropReasonPickerProps {
  value?: string | null;
  onChange: (value: string) => void;
  inputId: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  label: string;
  quickLabel?: string;
  placeholder?: string;
  className?: string;
  labelClassName?: string;
  counterClassName?: string;
  presetClassName?: string;
  activePresetClassName?: string;
  inputClassName?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}

const DEFAULT_INPUT_CLASS =
  'w-full rounded-control border border-required bg-surface px-[var(--za-space-3)] py-[var(--za-space-2)] text-[length:var(--za-text-body)] text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none';

const DEFAULT_PRESET_CLASS =
  'cursor-pointer rounded-small border border-decorative bg-surface px-2 py-0.5 text-xs text-ink-muted transition-[all] duration-[var(--za-motion-fast)] hover:border-required hover:text-ink';

const DEFAULT_ACTIVE_PRESET_CLASS =
  'border-required bg-surface-subtle font-[var(--za-weight-emphasis)] text-ink';

export function DropReasonPicker({
  value = '',
  onChange,
  inputId,
  inputRef,
  label,
  quickLabel,
  placeholder = 'e.g. Lost interest after season 2...',
  className,
  labelClassName,
  counterClassName,
  presetClassName,
  activePresetClassName,
  inputClassName,
  onKeyDown,
}: DropReasonPickerProps) {
  const currentValue = value ?? '';
  const labelRow = (
    <div className="mb-1 flex items-center justify-between">
      <label
        htmlFor={inputId}
        className={cn(
          'text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-ink-muted',
          labelClassName,
        )}
      >
        {label}
      </label>
      <span className={cn('text-[length:var(--za-text-fine)] text-ink-muted', counterClassName)}>
        {currentValue.length}/{MAX_DROP_REASON_LENGTH}
      </span>
    </div>
  );

  const presets = (
    <div className={cn(quickLabel ? 'mt-1.5' : 'mb-2', 'flex flex-wrap gap-1')}>
      {PRESET_DROP_REASONS.map((preset) => (
        <button
          key={preset}
          type="button"
          onClick={() => onChange(preset)}
          className={cn(
            DEFAULT_PRESET_CLASS,
            presetClassName,
            currentValue === preset && cn(DEFAULT_ACTIVE_PRESET_CLASS, activePresetClassName),
          )}
        >
          {preset}
        </button>
      ))}
    </div>
  );

  return (
    <div className={className}>
      {quickLabel ? (
        <div className="text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-ink-muted">
          {quickLabel}
        </div>
      ) : (
        labelRow
      )}
      {presets}
      {quickLabel && labelRow}
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        maxLength={MAX_DROP_REASON_LENGTH}
        placeholder={placeholder}
        value={currentValue}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        className={cn(DEFAULT_INPUT_CLASS, inputClassName)}
      />
    </div>
  );
}

'use client';

import { Tv, Film, Sparkles, BookOpen, Library, X, Upload } from 'lucide-react';
import { PRESET_DROP_REASONS, MAX_DROP_REASON_LENGTH } from '@/lib/constants';
import type { MediaCategory, StructureItem } from '@/types/media';

export interface MediaFormState {
  title: string;
  status: string;
  dropReason?: string;
  rating: number | null;
  primaryUnitTotal: string;
  primaryUnitCurrent: string;
  secondaryUnitTotal: string;
  secondaryUnitCurrent: string;
  structure: StructureItem[];
  sourceId: string;
  notes: string;
  coverImage: string | null;
}

interface MediaEditFormProps {
  isEditMode: boolean;
  category: MediaCategory;
  onCategoryChange: (category: MediaCategory) => void;
  form: MediaFormState;
  onFieldChange: <K extends keyof MediaFormState>(field: K, value: MediaFormState[K]) => void;
  /** Category-aware handler for the current-primary-unit field. */
  onPrimaryUnitCurrentChange: (value: string) => void;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onImageRemove: () => void;
  isCompressing: boolean;
  isSubmitting: boolean;
  error: string;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

const STATUS_OPTIONS = [
  { id: 'in_progress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'planning', label: 'Planning' },
  { id: 'on_hold', label: 'On Hold' },
  { id: 'dropped', label: 'Dropped' },
] as const;

const CHIPS: Array<{ id: MediaCategory; label: string; Icon: typeof Tv }> = [
  { id: 'show', label: 'TV Show', Icon: Tv },
  { id: 'movie', label: 'Movie', Icon: Film },
  { id: 'anime', label: 'Anime', Icon: Sparkles },
  { id: 'book', label: 'Book', Icon: BookOpen },
  { id: 'manga', label: 'Manga', Icon: Library },
];

const pillBtn =
  'cursor-pointer whitespace-nowrap rounded-control border border-decorative bg-surface px-[0.65rem] py-[0.3rem] text-[length:var(--za-text-fine)] text-ink-muted transition-[all] duration-[var(--za-motion-fast)]';

function pillActive(): string {
  return ' border-required bg-surface-subtle font-[var(--za-weight-emphasis)] text-ink';
}

/**
 * Full manual creation / edit form. Purely presentational — all state and
 * submission logic live in the parent orchestrator.
 */
export default function MediaEditForm({
  isEditMode,
  category,
  onCategoryChange,
  form,
  onFieldChange,
  onPrimaryUnitCurrentChange,
  onImageUpload,
  onImageRemove,
  isCompressing,
  isSubmitting,
  error,
  onSubmit,
  onCancel,
}: MediaEditFormProps) {
  const isMovie = category === 'movie';
  const isShowLike = category === 'show' || category === 'anime';
  const unitLabels = isMovie
    ? {
        primaryTotal: 'Target Views',
        primaryCurrent: 'Times Watched (Rewatches)',
        secondaryTotal: 'Runtime (Minutes)',
        secondaryCurrent: 'Minutes Watched',
      }
    : isShowLike
      ? {
          primaryTotal: 'Total Seasons',
          primaryCurrent: 'Current Season',
          secondaryTotal: `Episodes in Season ${form.primaryUnitCurrent}`,
          secondaryCurrent: 'Current Episode',
        }
      : {
          primaryTotal: 'Total Volumes',
          primaryCurrent: 'Current Volume',
          secondaryTotal: 'Total Chapters / Pages',
          secondaryCurrent: 'Current Chapter / Page',
        };

  const formInput =
    'w-full rounded-control border border-required bg-surface px-[var(--za-space-3)] py-[0.45rem] text-[length:var(--za-text-supporting)] text-ink focus:border-accent focus:outline-none';
  const chipClass = (active: boolean) =>
    `flex cursor-pointer items-center gap-1 rounded-control border border-required bg-surface px-[var(--za-space-3)] py-[var(--za-space-2)] text-[length:var(--za-text-supporting)] font-[var(--za-weight-emphasis)] text-ink transition-[all] duration-[var(--za-motion-fast)] hover:border-accent ${
      active
        ? 'border-accent bg-accent-soft font-[var(--za-weight-heading)] shadow-[inset_0_-2px_0_var(--za-color-accent)]'
        : ''
    }`;

  return (
    <form
      onSubmit={onSubmit}
      className="px-[var(--za-space-6)] pb-[var(--za-space-6)] pt-[var(--za-space-4)]"
    >
      {error && (
        <div className="mb-[var(--za-space-3)] rounded-small border border-danger bg-danger-surface px-[var(--za-space-3)] py-2 text-[length:var(--za-text-fine)] text-danger">
          {error}
        </div>
      )}

      {/* Category Selector */}
      <div className="mb-[var(--za-space-4)]">
        <label className="mb-1 block text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-ink-muted">
          Category
        </label>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Media Category">
          {CHIPS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={category === id}
              className={chipClass(category === id)}
              onClick={() => onCategoryChange(id)}
            >
              <Icon size={14} strokeWidth={2} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Title */}
      <div className="mb-[var(--za-space-4)]">
        <label
          htmlFor="media-title"
          className="mb-1 block text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-ink-muted"
        >
          Title <span className="text-danger">*</span>
        </label>
        <input
          id="media-title"
          type="text"
          className={formInput}
          placeholder="e.g. Frieren: Beyond Journey's End"
          value={form.title}
          onChange={(e) => onFieldChange('title', e.target.value)}
          required
        />
      </div>

      {/* Cover Art */}
      <div className="mb-[var(--za-space-4)]">
        <label className="mb-1 block text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-ink-muted">
          Cover Art
        </label>
        <div className="flex items-center gap-[var(--za-space-3)]">
          {form.coverImage ? (
            <div className="relative h-[4.8rem] w-16 overflow-hidden rounded-small border border-decorative">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URLs, unoptimized by design */}
              <img
                src={form.coverImage}
                alt="Cover preview"
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={onImageRemove}
                title="Remove cover"
                aria-label="Remove cover image"
                className="absolute right-0 top-0 flex cursor-pointer items-center justify-center rounded-bl-small bg-black/60 p-1 text-white"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => document.getElementById('cover-upload-input')?.click()}
              disabled={isCompressing}
              className="flex cursor-pointer items-center gap-2 rounded-control border border-dashed border-required bg-surface px-[var(--za-space-4)] py-[var(--za-space-3)] text-[length:var(--za-text-fine)] text-ink-muted hover:border-accent hover:text-ink"
            >
              <Upload size={18} strokeWidth={2} />
              <span>{isCompressing ? 'Compressing…' : 'Upload custom image'}</span>
            </button>
          )}
          <input
            id="cover-upload-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onImageUpload}
          />
        </div>
      </div>

      {/* Units */}
      {isMovie ? (
        <div className="mb-[var(--za-space-4)] grid grid-cols-2 gap-[var(--za-space-3)]">
          <div>
            <label
              htmlFor="secondary-unit-total"
              className="mb-1 block text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-ink-muted"
            >
              Runtime (Minutes)
            </label>
            <input
              id="secondary-unit-total"
              type="number"
              min="1"
              className={formInput}
              placeholder="e.g. 148"
              value={form.secondaryUnitTotal}
              onChange={(e) => onFieldChange('secondaryUnitTotal', e.target.value)}
            />
          </div>
          <div>
            <label
              htmlFor="primary-unit-current"
              className="mb-1 block text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-ink-muted"
            >
              Times Watched (Rewatches)
            </label>
            <input
              id="primary-unit-current"
              type="number"
              min="0"
              className={formInput}
              value={
                form.primaryUnitCurrent !== '' &&
                form.primaryUnitCurrent !== null &&
                form.primaryUnitCurrent !== undefined
                  ? form.primaryUnitCurrent
                  : '0'
              }
              onChange={(e) => onPrimaryUnitCurrentChange(e.target.value)}
            />
          </div>
        </div>
      ) : (
        <div className="mb-[var(--za-space-4)] grid grid-cols-2 gap-[var(--za-space-3)]">
          <div>
            <label
              htmlFor="primary-unit-total"
              className="mb-1 block text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-ink-muted"
            >
              {unitLabels.primaryTotal}
            </label>
            <input
              id="primary-unit-total"
              type="number"
              min="1"
              className={formInput}
              placeholder="1"
              value={form.primaryUnitTotal}
              onChange={(e) => onFieldChange('primaryUnitTotal', e.target.value)}
            />
          </div>
          <div>
            <label
              htmlFor="primary-unit-current"
              className="mb-1 block text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-ink-muted"
            >
              {unitLabels.primaryCurrent}
            </label>
            <input
              id="primary-unit-current"
              type="number"
              min="1"
              className={formInput}
              value={form.primaryUnitCurrent}
              onChange={(e) => onPrimaryUnitCurrentChange(e.target.value)}
            />
          </div>
          <div>
            <label
              htmlFor="secondary-unit-total"
              className="mb-1 block text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-ink-muted"
            >
              {unitLabels.secondaryTotal}
            </label>
            <input
              id="secondary-unit-total"
              type="number"
              min="1"
              className={formInput}
              placeholder={isShowLike ? 'e.g. 12' : 'e.g. 350'}
              value={form.secondaryUnitTotal}
              onChange={(e) => onFieldChange('secondaryUnitTotal', e.target.value)}
            />
          </div>
          <div>
            <label
              htmlFor="secondary-unit-current"
              className="mb-1 block text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-ink-muted"
            >
              {unitLabels.secondaryCurrent}
            </label>
            <input
              id="secondary-unit-current"
              type="number"
              min="0"
              className={formInput}
              value={form.secondaryUnitCurrent}
              onChange={(e) => onFieldChange('secondaryUnitCurrent', e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Status */}
      <div className="mb-[var(--za-space-4)]">
        <label className="mb-1 block text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-ink-muted">
          Status
        </label>
        <div
          className="flex flex-wrap gap-[var(--za-space-1)]"
          role="radiogroup"
          aria-label="Media Status"
        >
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={form.status === s.id}
              className={`${pillBtn} ${form.status === s.id ? pillActive() : ''}`}
              onClick={() => onFieldChange('status', s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Drop Reason (Only visible when status is 'dropped') */}
      {form.status === 'dropped' && (
        <div className="mb-[var(--za-space-4)] rounded-control border border-danger/25 bg-danger/5 p-[var(--za-space-3)]">
          <div className="mb-1.5 flex items-center justify-between">
            <label
              htmlFor="edit-drop-reason"
              className="text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-danger"
            >
              Drop Reason (Optional)
            </label>
            <span className="text-[length:var(--za-text-fine)] text-ink-muted">
              {(form.dropReason || '').length}/{MAX_DROP_REASON_LENGTH}
            </span>
          </div>

          <div className="mb-2 flex flex-wrap gap-1">
            {PRESET_DROP_REASONS.map((preset) => {
              const isSelected = form.dropReason === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onFieldChange('dropReason', preset)}
                  className={`cursor-pointer rounded-small border px-2 py-0.5 text-xs transition-[all] duration-[var(--za-motion-fast)] ${
                    isSelected
                      ? 'border-danger bg-danger/20 font-[var(--za-weight-emphasis)] text-ink'
                      : 'border-decorative bg-surface text-ink-muted hover:border-required hover:text-ink'
                  }`}
                >
                  {preset}
                </button>
              );
            })}
          </div>

          <input
            id="edit-drop-reason"
            type="text"
            maxLength={MAX_DROP_REASON_LENGTH}
            className={formInput}
            placeholder="e.g. Lost interest after season 2..."
            value={form.dropReason || ''}
            onChange={(e) => onFieldChange('dropReason', e.target.value)}
          />
        </div>
      )}

      {/* Rating */}
      <div className="mb-[var(--za-space-4)]">
        <div className="mb-1 flex items-center justify-between">
          <label className="text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-ink-muted">
            Personal Rating (1–10)
          </label>
          {form.rating != null && (
            <button
              type="button"
              className="cursor-pointer border-none bg-transparent p-0 text-[length:var(--za-text-fine)] text-ink-muted hover:text-ink"
              onClick={() => onFieldChange('rating', null)}
            >
              Clear Rating
            </button>
          )}
        </div>
        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(2.2rem,1fr))] gap-1"
          role="radiogroup"
          aria-label="Score"
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
            <button
              key={score}
              type="button"
              role="radio"
              aria-checked={form.rating === score}
              className={`h-8 cursor-pointer rounded-small border border-decorative bg-surface text-[length:var(--za-text-fine)] text-ink transition-[all] duration-[var(--za-motion-fast)] hover:border-accent ${
                form.rating === score
                  ? 'border-accent bg-accent-soft font-bold shadow-[inset_0_-2px_0_var(--za-color-accent)]'
                  : ''
              }`}
              onClick={() => onFieldChange('rating', form.rating === score ? null : score)}
            >
              {score}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="mb-[var(--za-space-5)]">
        <label
          htmlFor="media-notes"
          className="mb-1 block text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-ink-muted"
        >
          Personal Notes & Review
        </label>
        <textarea
          id="media-notes"
          rows={3}
          placeholder="Thoughts, quotes, or reminders..."
          value={form.notes}
          onChange={(e) => onFieldChange('notes', e.target.value)}
          style={{ resize: 'vertical', minHeight: '4.5rem' }}
          className={formInput}
        />
      </div>

      <div className="mt-2 flex justify-end gap-[var(--za-space-3)] border-t border-decorative pt-[var(--za-space-4)]">
        <button
          type="button"
          className="za-button za-button--secondary"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="za-button za-button--primary"
          disabled={isSubmitting || isCompressing}
        >
          {isSubmitting
            ? isEditMode
              ? 'Saving…'
              : 'Adding…'
            : isEditMode
              ? 'Save Changes'
              : 'Add to Archive'}
        </button>
      </div>
    </form>
  );
}

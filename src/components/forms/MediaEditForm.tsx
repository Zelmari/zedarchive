'use client';

import { useState } from 'react';
import type { RefObject } from 'react';
import { X, Upload } from 'lucide-react';
import { STATUS_OPTIONS } from '@/lib/constants';
import { MarkdownNotes } from '@/lib/markdown';
import type { MediaCategory, StructureItem } from '@/types/media';
import {
  CATEGORY_CHIPS,
  DropReasonPicker,
  chipClass,
  pillClass,
} from '@/components/ui/media-controls';

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
  /** Phase 3: hide this entry from public profile, Wrapped, and RSS feeds */
  isPrivate: boolean;
}

interface MediaEditFormProps {
  isEditMode: boolean;
  category: MediaCategory;
  onCategoryChange: (category: MediaCategory) => void;
  titleInputRef?: RefObject<HTMLInputElement | null>;
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

type UnitFieldName =
  'primaryUnitTotal' | 'primaryUnitCurrent' | 'secondaryUnitTotal' | 'secondaryUnitCurrent';

interface UnitField {
  field: UnitFieldName;
  label: string | ((form: MediaFormState) => string);
  min: number;
  placeholder?: string;
  fallback?: string;
  usePrimaryUnitHandler?: boolean;
}

const SHOW_UNIT_FIELDS: UnitField[] = [
  { field: 'primaryUnitTotal', label: 'Total Seasons', min: 1, placeholder: '1' },
  {
    field: 'primaryUnitCurrent',
    label: 'Current Season',
    min: 1,
    usePrimaryUnitHandler: true,
  },
  {
    field: 'secondaryUnitTotal',
    label: (form) => `Episodes in Season ${form.primaryUnitCurrent}`,
    min: 1,
    placeholder: 'e.g. 12',
  },
  {
    field: 'secondaryUnitCurrent',
    label: 'Current Episode',
    min: 0,
  },
];

const BOOK_UNIT_FIELDS: UnitField[] = [
  { field: 'primaryUnitTotal', label: 'Total Volumes', min: 1, placeholder: '1' },
  {
    field: 'primaryUnitCurrent',
    label: 'Current Volume',
    min: 1,
    usePrimaryUnitHandler: true,
  },
  {
    field: 'secondaryUnitTotal',
    label: 'Total Chapters / Pages',
    min: 1,
    placeholder: 'e.g. 350',
  },
  {
    field: 'secondaryUnitCurrent',
    label: 'Current Chapter / Page',
    min: 0,
  },
];

const UNIT_FIELDS: Record<MediaCategory, UnitField[]> = {
  show: SHOW_UNIT_FIELDS,
  anime: SHOW_UNIT_FIELDS,
  book: BOOK_UNIT_FIELDS,
  manga: BOOK_UNIT_FIELDS,
  movie: [
    {
      field: 'secondaryUnitTotal',
      label: 'Runtime (Minutes)',
      min: 1,
      placeholder: 'e.g. 148',
    },
    {
      field: 'primaryUnitCurrent',
      label: 'Times Watched (Rewatches)',
      min: 0,
      fallback: '0',
    },
  ],
};

/**
 * Full manual creation / edit form. Purely presentational — all state and
 * submission logic live in the parent orchestrator.
 */
export default function MediaEditForm({
  isEditMode,
  category,
  onCategoryChange,
  titleInputRef,
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
  const [notesTab, setNotesTab] = useState<'write' | 'preview'>('write');

  const formInput =
    'w-full rounded-control border border-required bg-surface px-[var(--za-space-3)] py-[0.45rem] text-[length:var(--za-text-supporting)] text-ink focus:border-accent focus:outline-none';

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
          {CATEGORY_CHIPS.map(({ id, label, Icon }) => (
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
          ref={titleInputRef}
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
      <div className="mb-[var(--za-space-4)] grid grid-cols-2 gap-[var(--za-space-3)]">
        {UNIT_FIELDS[category].map((unitField) => {
          const value = form[unitField.field] || unitField.fallback || '';
          const label =
            typeof unitField.label === 'function' ? unitField.label(form) : unitField.label;
          const inputId = unitField.field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

          return (
            <div key={unitField.field}>
              <label
                htmlFor={inputId}
                className="mb-1 block text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-ink-muted"
              >
                {label}
              </label>
              <input
                id={inputId}
                type="number"
                min={unitField.min}
                className={formInput}
                placeholder={unitField.placeholder}
                value={value}
                onChange={(e) =>
                  unitField.usePrimaryUnitHandler
                    ? onPrimaryUnitCurrentChange(e.target.value)
                    : onFieldChange(unitField.field, e.target.value)
                }
              />
            </div>
          );
        })}
      </div>

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
              className={pillClass(form.status === s.id)}
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
          <DropReasonPicker
            inputId="edit-drop-reason"
            label="Drop Reason (Optional)"
            value={form.dropReason}
            onChange={(value) => onFieldChange('dropReason', value)}
            inputClassName={formInput}
            labelClassName="text-danger"
            presetClassName="border-decorative bg-surface text-ink-muted hover:border-required hover:text-ink"
            activePresetClassName="border-danger bg-danger/20 font-[var(--za-weight-emphasis)] text-ink"
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

      {/* Privacy Control */}
      <div className="mb-[var(--za-space-4)] rounded-control border border-decorative bg-surface-subtle p-3">
        <label className="flex cursor-pointer items-center justify-between gap-2 text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-ink">
          <span>Private Title (Hide from public profile & RSS)</span>
          <input
            type="checkbox"
            checked={Boolean(form.isPrivate)}
            onChange={(e) => onFieldChange('isPrivate', e.target.checked)}
            className="h-4 w-4 rounded accent-accent"
          />
        </label>
        <p className="mt-1 text-[11px] text-ink-muted">
          When checked, this entry is only visible to you on your private dashboard and excluded
          from public showcases.
        </p>
      </div>

      {/* Notes */}
      <div className="mb-[var(--za-space-5)]">
        <div className="mb-1.5 flex items-center justify-between">
          <label
            htmlFor="media-notes"
            className="text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-ink-muted"
          >
            Personal Notes & Review
          </label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setNotesTab('write')}
              className={`rounded-small px-2 py-0.5 text-xs font-[var(--za-weight-emphasis)] transition-[all] ${
                notesTab === 'write'
                  ? 'border border-required bg-surface-subtle text-ink'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Write
            </button>
            <button
              type="button"
              onClick={() => setNotesTab('preview')}
              className={`rounded-small px-2 py-0.5 text-xs font-[var(--za-weight-emphasis)] transition-[all] ${
                notesTab === 'preview'
                  ? 'border border-accent bg-accent/15 text-accent'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Preview
            </button>
          </div>
        </div>

        {notesTab === 'write' ? (
          <textarea
            id="media-notes"
            rows={3}
            placeholder="Thoughts, quotes, or markdown notes (supports **bold**, *italic*, > quotes, - lists)..."
            value={form.notes}
            onChange={(e) => onFieldChange('notes', e.target.value)}
            style={{ resize: 'vertical', minHeight: '5rem' }}
            className={formInput}
          />
        ) : (
          <div className="min-h-[5rem] rounded-control border border-decorative bg-surface-subtle p-3 text-xs">
            {form.notes.trim() ? (
              <MarkdownNotes content={form.notes} />
            ) : (
              <span className="italic text-ink-muted">Nothing to preview yet.</span>
            )}
          </div>
        )}
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

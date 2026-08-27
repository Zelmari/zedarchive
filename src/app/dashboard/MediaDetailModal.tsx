'use client';

import { useState } from 'react';
import { Pencil, Star, RotateCcw, Tag, FileText, Tv, BookOpen } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { Badge, RatingBadge } from '@/components/ui/Badge';
import { getTileInitials } from '@/lib/format';
import type { MediaEntry } from '@/types/media';

interface MediaDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: MediaEntry | null;
  onUpdate: (
    id: string,
    updates: Record<string, unknown>,
    skipOptimistic?: boolean,
  ) => Promise<void>;
  onEdit?: (item: MediaEntry) => void;
}

const pillBtn =
  'cursor-pointer whitespace-nowrap rounded-control border border-decorative bg-surface px-[0.65rem] py-[0.3rem] text-[length:var(--za-text-fine)] text-ink-muted transition-[all] duration-[var(--za-motion-fast)]';

function pillActive(): string {
  return ' border-required bg-surface-subtle font-[var(--za-weight-emphasis)] text-ink';
}

export default function MediaDetailModal({
  isOpen,
  onClose,
  item,
  onUpdate,
  onEdit,
}: MediaDetailModalProps) {
  const [activeSeason, setActiveSeason] = useState(1);
  const [newTagInput, setNewTagInput] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  if (!isOpen || !item) return null;

  const legacy = item as unknown as Record<string, unknown>;
  const category =
    legacy.category ||
    (legacy.type === 'anime' ? 'anime' : legacy.type === 'book' ? 'book' : 'show');
  const isBookLike = category === 'book' || category === 'manga';
  const status = item.status || 'in_progress';
  const rating = item.rating;
  const tags = Array.isArray(item.tags) ? item.tags : [];

  const primaryCurrent = item.primaryUnitCurrent ?? 1;
  const primaryTotal = item.primaryUnitTotal ?? 1;
  const secondaryCurrent = item.secondaryUnitCurrent ?? 0;
  const secondaryTotal = item.secondaryUnitTotal ?? null;
  const structure = Array.isArray(item.structure) ? item.structure : [];

  const runUpdate = async (updates: Record<string, unknown>) => {
    try {
      setIsUpdating(true);
      await onUpdate(item.id, updates, true);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStartRewatch = async () => {
    await runUpdate({
      rewatchCount: (item.rewatchCount || 0) + 1,
      primaryUnitCurrent: 1,
      secondaryUnitCurrent: 0,
      status: 'in_progress',
      startedAt: new Date().toISOString(),
    });
  };

  const handleSetEpisode = async (epNumber: number, seasonNumber: number) => {
    const updates: Record<string, unknown> = {};
    if (seasonNumber && seasonNumber !== primaryCurrent) {
      updates.primaryUnitCurrent = seasonNumber;
      const seasonObj = structure.find((s) => s.number === seasonNumber);
      // Always reset the secondary total on season switches so a season
      // with an unknown total never inherits the previous season's count.
      updates.secondaryUnitTotal = seasonObj?.total ?? null;
    }
    updates.secondaryUnitCurrent = epNumber;
    await runUpdate(updates);
  };

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newTagInput.trim().toLowerCase();
    if (!clean || tags.includes(clean)) return;

    const nextTags = [...tags, clean];
    setNewTagInput('');
    await onUpdate(item.id, { tags: nextTags }, true);
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    const nextTags = tags.filter((t) => t !== tagToRemove);
    await onUpdate(item.id, { tags: nextTags }, true);
  };

  // Determine episodes for current selected season
  const currentSeasonObj = structure.find((s) => s.number === activeSeason);
  const totalUnitsInSeason =
    currentSeasonObj?.total || (activeSeason === primaryCurrent ? secondaryTotal : null) || 24;

  const sectionLabel =
    'mb-1 flex items-center gap-1 text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-ink-muted';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="media-detail-title"
      header={
        <div className="flex min-w-0 items-center gap-[0.6rem]">
          {isBookLike ? <BookOpen size={20} /> : <Tv size={20} />}
          <h2
            id="media-detail-title"
            className="truncate text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] text-ink"
          >
            {item.title}
          </h2>
        </div>
      }
      contentStyle={{ maxWidth: '44rem', maxHeight: '90vh', overflowY: 'auto' }}
    >
      <div className="px-[var(--za-space-6)] py-[var(--za-space-4)]">
        <div className="grid gap-[var(--za-space-5)] [grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))]">
          {/* Left Column */}
          <div>
            <div className="mx-auto aspect-[2/3] w-full max-w-[14rem] overflow-hidden rounded-control border border-required bg-surface-subtle">
              {item.coverImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- data URLs / remote covers, unoptimized by design
                <img
                  src={item.coverImage}
                  alt={item.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-bold text-[1.5rem]">
                  {getTileInitials(item.title)}
                </div>
              )}
            </div>

            {/* Status & Rating Pills */}
            <div className="mt-[var(--za-space-3)] flex flex-wrap justify-center gap-[0.4rem]">
              <Badge className="capitalize">{status.replace('_', ' ')}</Badge>
              {rating != null && (
                <span className="inline-flex items-center gap-[0.2rem] rounded-small border border-[rgba(234,179,8,0.4)] bg-[rgba(234,179,8,0.12)] px-[0.45rem] py-[0.12rem] text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-[#b45309]">
                  <Star size={11} fill="currentColor" /> {rating}/10
                </span>
              )}
              <Badge>
                {isBookLike
                  ? `Vol ${primaryCurrent}/${primaryTotal}`
                  : `Season ${primaryCurrent}/${primaryTotal}`}
              </Badge>
            </div>

            {/* Rewatch / Reread Tracker */}
            <div className="mt-[var(--za-space-4)] rounded-control bg-surface-subtle p-[var(--za-space-3)] text-center">
              <div className="text-[length:var(--za-text-fine)] text-ink-muted">
                {isBookLike ? 'Reread History' : 'Rewatch History'}
              </div>
              <div className="my-[0.2rem] text-[1.1rem] font-[var(--za-weight-heading)]">
                {item.rewatchCount || 0} {item.rewatchCount === 1 ? 'time' : 'times'}
              </div>
              <button
                type="button"
                className="za-button za-button--secondary mt-[0.4rem] w-full text-[length:var(--za-text-fine)]"
                onClick={handleStartRewatch}
                disabled={isUpdating}
              >
                <RotateCcw size={12} className="mr-1" />
                {isBookLike ? 'Start Reread' : 'Start Rewatch'}
              </button>
            </div>

            {/* Tags / Shelves */}
            <div className="mt-[var(--za-space-4)]">
              <div className={sectionLabel}>
                <Tag size={12} /> Tags & Shelves
              </div>
              <div className="mb-[0.4rem] flex flex-wrap gap-[0.3rem]">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-[3px] rounded-small border border-decorative bg-surface-subtle px-[0.4rem] py-[0.1rem] text-xs"
                  >
                    #{t}
                    <button
                      type="button"
                      className="cursor-pointer border-none bg-transparent p-0 text-ink-muted"
                      onClick={() => handleRemoveTag(t)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <form onSubmit={handleAddTag} className="flex gap-[0.3rem]">
                <input
                  type="text"
                  placeholder="Add tag (e.g. favorites)..."
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  className="flex-1 rounded-small border border-required bg-surface px-[0.4rem] py-[0.2rem] text-xs text-ink focus:border-accent focus:outline-none"
                />
                <button
                  type="submit"
                  className="za-button za-button--secondary px-[0.5rem] py-[0.2rem] text-xs"
                >
                  +
                </button>
              </form>
            </div>
          </div>

          {/* Right Column */}
          <div>
            {item.synopsis && (
              <div className="mb-[var(--za-space-4)]">
                <div className={sectionLabel}>SYNOPSIS</div>
                <p className="text-[length:var(--za-text-fine)] leading-[var(--za-leading-body)] text-ink">
                  {item.synopsis}
                </p>
              </div>
            )}

            {/* Progress Checklist */}
            <div>
              <div className={`${sectionLabel} mb-[var(--za-space-2)]`}>
                {isBookLike ? 'CHAPTER / PAGE QUICK JUMP' : 'EPISODE QUICK JUMP'}
              </div>

              {structure.length > 1 && (
                <div className="mb-2 flex gap-[0.3rem] overflow-x-auto pb-[0.4rem]">
                  {structure.map((s) => (
                    <button
                      key={s.number}
                      type="button"
                      className={`${pillBtn} ${activeSeason === s.number ? pillActive() : ''}`}
                      onClick={() => setActiveSeason(s.number)}
                    >
                      {s.name || `Season ${s.number}`}
                    </button>
                  ))}
                </div>
              )}

              <div className="max-h-48 overflow-y-auto rounded-control border border-decorative bg-surface-subtle p-2 [grid-template-columns:repeat(auto-fill,minmax(2.5rem,1fr))] grid gap-[0.35rem]">
                {Array.from({ length: Math.min(100, Math.max(1, totalUnitsInSeason)) }).map(
                  (_, i) => {
                    const unitNum = i + 1;
                    const isDone =
                      activeSeason < primaryCurrent ||
                      (activeSeason === primaryCurrent && unitNum <= secondaryCurrent);
                    const isCurrent =
                      activeSeason === primaryCurrent && unitNum === secondaryCurrent;

                    return (
                      <button
                        key={unitNum}
                        type="button"
                        onClick={() => handleSetEpisode(unitNum, activeSeason)}
                        disabled={isUpdating}
                        style={{
                          background: isCurrent
                            ? 'var(--za-color-accent)'
                            : isDone
                              ? 'rgba(46, 125, 50, 0.15)'
                              : 'var(--za-color-surface)',
                          color: isCurrent
                            ? 'var(--za-color-on-accent)'
                            : isDone
                              ? '#2e7d32'
                              : 'var(--za-color-text)',
                          borderColor: isCurrent
                            ? 'var(--za-color-accent)'
                            : isDone
                              ? 'rgba(46, 125, 50, 0.4)'
                              : 'var(--za-color-border-decorative)',
                          fontWeight: isCurrent ? 'bold' : 'normal',
                        }}
                        className="inline-flex h-[2.2rem] cursor-pointer items-center justify-center rounded-small border text-[length:var(--za-text-fine)]"
                      >
                        {unitNum}
                      </button>
                    );
                  },
                )}
              </div>
            </div>

            {/* Personal Notes */}
            {item.notes && (
              <div className="mt-[var(--za-space-4)]">
                <div className={sectionLabel}>
                  <FileText size={12} /> PERSONAL NOTES
                </div>
                <div className="whitespace-pre-wrap rounded-control border border-decorative bg-surface-subtle p-[var(--za-space-3)] text-[length:var(--za-text-fine)]">
                  {item.notes}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-[var(--za-space-5)] flex items-center justify-between border-t border-decorative pt-[var(--za-space-3)]">
          <button
            type="button"
            className="za-button za-button--secondary"
            onClick={() => {
              onClose();
              onEdit?.(item);
            }}
          >
            <Pencil size={14} className="mr-1.5" /> Edit All Details
          </button>

          <button type="button" className="za-button za-button--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}

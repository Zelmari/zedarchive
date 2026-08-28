'use client';

import { useState, useEffect } from 'react';
import {
  Pencil,
  Star,
  RotateCcw,
  Tag,
  FileText,
  Tv,
  BookOpen,
  BookmarkX,
  Plus,
  Trash2,
  Calendar,
  Check,
  ExternalLink,
} from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { Badge, RatingBadge } from '@/components/ui/Badge';
import DropReasonModal from '@/components/modals/DropReasonModal';
import { getTileInitials, pageToPercent, percentToPage } from '@/lib/format';
import type { MediaEntry, MediaCycle } from '@/types/media';
import type { WatchProvidersResult } from '@/lib/services/tmdb';

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

function formatDisplayDate(iso: string | null | undefined): string {
  if (!iso) return 'Present';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Present';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function toDateInputVal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
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
  const [isDropReasonOpen, setIsDropReasonOpen] = useState(false);

  // Cycle management state
  const [editingCycleId, setEditingCycleId] = useState<string | 'new' | null>(null);
  const [cycleForm, setCycleForm] = useState<{
    startedAt: string;
    completedAt: string;
    rating: number | null;
    notes: string;
  }>({
    startedAt: '',
    completedAt: '',
    rating: null,
    notes: '',
  });

  // Streaming availability state
  const [watchProviders, setWatchProviders] = useState<WatchProvidersResult | null>(null);
  const [providersCountry, setProvidersCountry] = useState<string>('US');
  const [providersLoading, setProvidersLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !item) return;
    const cat = item.category || 'movie';
    if (cat === 'book' || cat === 'manga') return;

    let isMounted = true;

    const params = new URLSearchParams({
      category: cat,
      title: item.title,
    });
    if (item.sourceId) params.set('sourceId', item.sourceId);

    fetch(`/api/media/providers?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        setWatchProviders(data.providers ?? null);
        if (data.country) setProvidersCountry(data.country);
      })
      .catch(() => {
        if (isMounted) setWatchProviders(null);
      })
      .finally(() => {
        if (isMounted) setProvidersLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const legacy = item as unknown as Record<string, unknown>;
  const category =
    legacy.category ||
    (legacy.type === 'anime' ? 'anime' : legacy.type === 'book' ? 'book' : 'show');
  const isBookLike = category === 'book' || category === 'manga';
  const status = item.status || 'in_progress';
  const rating = item.rating;
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const cycles: MediaCycle[] =
    Array.isArray(item.cycles) && item.cycles.length > 0
      ? item.cycles
      : [
          {
            id: 'initial',
            cycleNumber: 1,
            startedAt: item.startedAt,
            completedAt: item.completedAt,
            rating: item.rating,
            notes: null,
          },
        ];

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
      rewatch: true,
    });
  };

  const handleOpenAddCycle = () => {
    setEditingCycleId('new');
    setCycleForm({
      startedAt: toDateInputVal(new Date().toISOString()),
      completedAt: toDateInputVal(new Date().toISOString()),
      rating: null,
      notes: '',
    });
  };

  const handleOpenEditCycle = (cycle: MediaCycle) => {
    setEditingCycleId(cycle.id);
    setCycleForm({
      startedAt: toDateInputVal(cycle.startedAt),
      completedAt: toDateInputVal(cycle.completedAt),
      rating: cycle.rating ?? null,
      notes: cycle.notes || '',
    });
  };

  const handleSaveCycle = async () => {
    const startIso = cycleForm.startedAt ? new Date(cycleForm.startedAt).toISOString() : null;
    const endIso = cycleForm.completedAt ? new Date(cycleForm.completedAt).toISOString() : null;

    if (editingCycleId === 'new') {
      const nextCycleNumber = cycles.length + 1;
      const newCycle: MediaCycle = {
        id: crypto.randomUUID(),
        cycleNumber: nextCycleNumber,
        startedAt: startIso,
        completedAt: endIso,
        rating: cycleForm.rating,
        notes: cycleForm.notes.trim() || null,
      };
      const nextCycles = [...cycles, newCycle];
      await runUpdate({
        cycles: nextCycles,
        rewatchCount: Math.max(0, nextCycles.length - 1),
      });
    } else {
      const nextCycles = cycles.map((c) => {
        if (c.id !== editingCycleId) return c;
        return {
          ...c,
          startedAt: startIso,
          completedAt: endIso,
          rating: cycleForm.rating,
          notes: cycleForm.notes.trim() || null,
        };
      });
      await runUpdate({
        cycles: nextCycles,
      });
    }
    setEditingCycleId(null);
  };

  const handleDeleteCycle = async (cycleId: string) => {
    const filtered = cycles.filter((c) => c.id !== cycleId);
    const renumbered = (
      filtered.length > 0
        ? filtered
        : [
            {
              id: crypto.randomUUID(),
              cycleNumber: 1,
              startedAt: item.startedAt,
              completedAt: item.completedAt,
              rating: null,
              notes: null,
            },
          ]
    ).map((c, i) => ({ ...c, cycleNumber: i + 1 }));

    await runUpdate({
      cycles: renumbered,
      rewatchCount: Math.max(0, renumbered.length - 1),
    });
    if (editingCycleId === cycleId) {
      setEditingCycleId(null);
    }
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
              <button
                type="button"
                onClick={() =>
                  runUpdate({ priorityIndex: item.priorityIndex != null ? null : 9999 })
                }
                className={`cursor-pointer rounded-small border px-2 py-0.5 text-xs transition-[all] duration-[var(--za-motion-fast)] ${
                  item.priorityIndex != null
                    ? 'border-accent bg-accent/20 font-[var(--za-weight-emphasis)] text-accent'
                    : 'border-decorative bg-surface text-ink-muted hover:border-required hover:text-ink'
                }`}
                title={
                  item.priorityIndex != null
                    ? `Rank #${item.priorityIndex} in Up Next (Click to remove)`
                    : 'Pin to Up Next Queue'
                }
              >
                {item.priorityIndex != null
                  ? `⚡ Up Next #${item.priorityIndex}`
                  : '+ Add to Up Next'}
              </button>
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

            {/* Rewatch / Reread Tracker & Timeline */}
            <div className="mt-[var(--za-space-4)] rounded-control bg-surface-subtle p-[var(--za-space-3)]">
              <div className="flex items-center justify-between">
                <div className="text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-ink-muted">
                  {isBookLike ? 'REREAD HISTORY' : 'REWATCH HISTORY'}
                </div>
                <span className="text-xs font-[var(--za-weight-emphasis)] text-ink">
                  {cycles.length} {cycles.length === 1 ? 'cycle' : 'cycles'}
                </span>
              </div>

              {/* Cycle Timeline List */}
              <div className="mt-2 space-y-1.5 text-left">
                {cycles.map((c) => {
                  const isOriginal = c.cycleNumber === 1;

                  return (
                    <div
                      key={c.id}
                      className="rounded-small border border-decorative bg-surface p-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-[var(--za-weight-emphasis)] text-ink">
                          {isOriginal
                            ? 'Cycle 1 (Original)'
                            : `Cycle ${c.cycleNumber} (${isBookLike ? 'Reread' : 'Rewatch'} ${c.cycleNumber - 1})`}
                        </span>
                        <div className="flex items-center gap-1">
                          {c.rating != null && (
                            <span className="text-[10px] font-bold text-[#b45309]">
                              ★ {c.rating}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenEditCycle(c)}
                            title="Edit cycle"
                            className="cursor-pointer rounded p-0.5 text-ink-muted hover:text-ink"
                          >
                            <Pencil size={11} />
                          </button>
                          {cycles.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleDeleteCycle(c.id)}
                              title="Delete cycle"
                              className="cursor-pointer rounded p-0.5 text-danger/70 hover:text-danger"
                            >
                              <Trash2 size={11} />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="mt-0.5 text-[11px] text-ink-muted">
                        {formatDisplayDate(c.startedAt)} →{' '}
                        {c.completedAt ? (
                          formatDisplayDate(c.completedAt)
                        ) : (
                          <span className="font-[var(--za-weight-emphasis)] text-accent">
                            In Progress
                          </span>
                        )}
                      </div>

                      {c.notes && (
                        <p className="mt-1 text-[11px] text-ink-muted italic">
                          &ldquo;{c.notes}&rdquo;
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Inline Cycle Editor Form */}
              {editingCycleId && (
                <div className="mt-2 rounded-small border border-required bg-surface p-2 text-left text-xs">
                  <div className="mb-1.5 font-[var(--za-weight-emphasis)] text-ink">
                    {editingCycleId === 'new' ? 'Log Past Cycle' : 'Edit Cycle'}
                  </div>
                  <div className="space-y-1.5">
                    <div>
                      <label className="block text-[10px] text-ink-muted">Start Date</label>
                      <input
                        type="date"
                        className="w-full rounded-small border border-decorative bg-surface px-1.5 py-0.5 text-xs text-ink focus:border-required focus:outline-none"
                        value={cycleForm.startedAt}
                        onChange={(e) => setCycleForm((p) => ({ ...p, startedAt: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-ink-muted">
                        Finish Date (Optional)
                      </label>
                      <input
                        type="date"
                        className="w-full rounded-small border border-decorative bg-surface px-1.5 py-0.5 text-xs text-ink focus:border-required focus:outline-none"
                        value={cycleForm.completedAt}
                        onChange={(e) =>
                          setCycleForm((p) => ({ ...p, completedAt: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-ink-muted">
                        Rating (1–10, Optional)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        placeholder="e.g. 9"
                        className="w-full rounded-small border border-decorative bg-surface px-1.5 py-0.5 text-xs text-ink focus:border-required focus:outline-none"
                        value={cycleForm.rating ?? ''}
                        onChange={(e) => {
                          const val = e.target.value ? parseInt(e.target.value, 10) : null;
                          setCycleForm((p) => ({ ...p, rating: val }));
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-ink-muted">Notes (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. Rewatched with friends"
                        className="w-full rounded-small border border-decorative bg-surface px-1.5 py-0.5 text-xs text-ink focus:border-required focus:outline-none"
                        value={cycleForm.notes}
                        onChange={(e) => setCycleForm((p) => ({ ...p, notes: e.target.value }))}
                      />
                    </div>
                    <div className="flex justify-end gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setEditingCycleId(null)}
                        className="cursor-pointer rounded-small border border-decorative px-2 py-0.5 text-xs text-ink-muted hover:text-ink"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveCycle}
                        disabled={isUpdating}
                        className="cursor-pointer rounded-small border border-required bg-surface px-2 py-0.5 text-xs font-[var(--za-weight-emphasis)] text-ink hover:bg-surface-hover"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="mt-2.5 flex flex-col gap-1.5">
                <button
                  type="button"
                  className="za-button za-button--secondary w-full text-xs"
                  onClick={handleStartRewatch}
                  disabled={isUpdating}
                >
                  <RotateCcw size={12} className="mr-1" />
                  {isBookLike ? 'Start New Reread' : 'Start New Rewatch'}
                </button>
                {!editingCycleId && (
                  <button
                    type="button"
                    className="cursor-pointer rounded-small border border-decorative bg-surface py-1 text-xs text-ink-muted hover:border-required hover:text-ink"
                    onClick={handleOpenAddCycle}
                    disabled={isUpdating}
                  >
                    + Log Past Cycle Date
                  </button>
                )}
              </div>
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
            {status === 'dropped' && (
              <div className="mb-[var(--za-space-4)] rounded-control border border-danger/30 bg-danger/5 p-[var(--za-space-3)]">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <BookmarkX size={16} className="mt-0.5 shrink-0 text-danger" />
                    <div>
                      <div className="text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-danger">
                        Dropped
                        {item.droppedAt
                          ? ` on ${new Date(item.droppedAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}`
                          : ''}
                        {(() => {
                          const pri = item.droppedProgressPrimary ?? primaryCurrent;
                          const sec = item.droppedProgressSecondary ?? secondaryCurrent;
                          if (category === 'movie') return '';
                          if (isBookLike) {
                            return sec != null && sec > 0
                              ? ` at Vol ${pri}, Ch ${sec}`
                              : ` at Vol ${pri}`;
                          }
                          return sec != null && sec > 0
                            ? ` at Season ${pri}, Ep ${sec}`
                            : ` at Season ${pri}`;
                        })()}
                      </div>
                      {item.dropReason && (
                        <p className="mt-1 text-[length:var(--za-text-fine)] text-ink italic">
                          Reason: &ldquo;{item.dropReason}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIsDropReasonOpen(true)}
                      className="cursor-pointer rounded-small border border-decorative bg-surface px-2 py-0.5 text-xs text-ink-muted hover:border-required hover:text-ink"
                    >
                      Edit Reason
                    </button>
                    <button
                      type="button"
                      onClick={() => runUpdate({ status: 'in_progress' })}
                      className="cursor-pointer rounded-small border border-required bg-surface px-2 py-0.5 text-xs font-[var(--za-weight-emphasis)] text-ink hover:bg-surface-hover"
                    >
                      Resume
                    </button>
                  </div>
                </div>
              </div>
            )}

            {item.synopsis && (
              <div className="mb-[var(--za-space-4)]">
                <div className={sectionLabel}>SYNOPSIS</div>
                <p className="text-[length:var(--za-text-fine)] leading-[var(--za-leading-body)] text-ink">
                  {item.synopsis}
                </p>
              </div>
            )}

            {/* Where to Watch / Streaming Availability */}
            {!isBookLike && (
              <div className="mb-[var(--za-space-4)] rounded-control bg-surface-subtle p-[var(--za-space-3)]">
                <div className="flex items-center justify-between">
                  <div className={sectionLabel}>
                    STREAMING AVAILABILITY {providersCountry ? `(${providersCountry})` : ''}
                  </div>
                  {providersLoading && (
                    <span className="text-[10px] text-ink-muted">Checking providers…</span>
                  )}
                </div>

                {!providersLoading &&
                (!watchProviders ||
                  (!watchProviders.flatrate?.length &&
                    !watchProviders.free?.length &&
                    !watchProviders.rent?.length &&
                    !watchProviders.buy?.length)) ? (
                  <p className="mt-1 text-xs text-ink-muted">
                    No streaming providers detected for this title in {providersCountry}.
                  </p>
                ) : null}

                {/* Subscription Streaming (Flatrate) */}
                {watchProviders?.flatrate && watchProviders.flatrate.length > 0 && (
                  <div className="mt-2">
                    <div className="mb-1 text-[10px] font-[var(--za-weight-emphasis)] text-ink-muted">
                      STREAM ON SUBSCRIPTION:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {watchProviders.flatrate.map((prov) => (
                        <a
                          key={prov.id}
                          href={watchProviders.link || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Stream on ${prov.name}`}
                          className="inline-flex items-center gap-1.5 rounded-small border border-decorative bg-surface px-2 py-1 text-xs font-[var(--za-weight-emphasis)] text-ink transition-[border-color,transform] hover:border-required hover:scale-105"
                        >
                          {prov.logoPath && (
                            // eslint-disable-next-line @next/next/no-img-element -- external provider logos
                            <img
                              src={prov.logoPath}
                              alt=""
                              className="h-4 w-4 rounded-sm object-cover"
                            />
                          )}
                          <span>{prov.name}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Free / Ads Streaming */}
                {watchProviders?.free && watchProviders.free.length > 0 && (
                  <div className="mt-2">
                    <div className="mb-1 text-[10px] font-[var(--za-weight-emphasis)] text-ink-muted">
                      FREE / WITH ADS:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {watchProviders.free.map((prov) => (
                        <a
                          key={prov.id}
                          href={watchProviders.link || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Watch free on ${prov.name}`}
                          className="inline-flex items-center gap-1.5 rounded-small border border-decorative bg-surface px-1.5 py-0.5 text-xs text-ink"
                        >
                          {prov.logoPath && (
                            // eslint-disable-next-line @next/next/no-img-element -- external provider logos
                            <img
                              src={prov.logoPath}
                              alt=""
                              className="h-3.5 w-3.5 rounded-sm object-cover"
                            />
                          )}
                          <span>{prov.name}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* JustWatch attribution and deep link */}
                {watchProviders?.link && (
                  <div className="mt-2.5 flex items-center justify-between text-[10px] text-ink-muted">
                    <span>Powered by JustWatch</span>
                    <a
                      href={watchProviders.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="za-link inline-flex items-center gap-0.5"
                    >
                      View all rent & buy options <ExternalLink size={10} />
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Progress Checklist */}
            <div>
              <div className={`${sectionLabel} mb-[var(--za-space-2)]`}>
                {isBookLike ? 'READING PROGRESS & QUICK JUMP' : 'EPISODE QUICK JUMP'}
              </div>

              {/* Book / Manga percentage and slider controls */}
              {isBookLike && secondaryTotal !== null && secondaryTotal > 0 && (
                <div className="mb-3 rounded-control border border-decorative bg-surface-subtle p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-[var(--za-weight-emphasis)] text-ink">
                      Page {secondaryCurrent} of {secondaryTotal}
                    </span>
                    <span className="font-[var(--za-weight-emphasis)] text-accent">
                      {pageToPercent(secondaryCurrent, secondaryTotal)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={secondaryTotal}
                    value={secondaryCurrent}
                    disabled={isUpdating}
                    onChange={(e) => {
                      const newPg = parseInt(e.target.value, 10) || 0;
                      void runUpdate({ secondaryUnitCurrent: newPg });
                    }}
                    className="mt-2 w-full accent-accent cursor-pointer"
                  />
                  <div className="mt-1 flex justify-between text-[10px] text-ink-muted">
                    <span>0%</span>
                    <span>25%</span>
                    <span>50%</span>
                    <span>75%</span>
                    <span>100%</span>
                  </div>
                </div>
              )}

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

      <DropReasonModal
        isOpen={isDropReasonOpen}
        itemTitle={item.title}
        initialReason={item.dropReason}
        onConfirm={async (reason) => {
          setIsDropReasonOpen(false);
          await runUpdate({ dropReason: reason });
        }}
        onCancel={() => setIsDropReasonOpen(false)}
      />
    </Modal>
  );
}

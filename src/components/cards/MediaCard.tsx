'use client';

import { useState } from 'react';
import { Trash2, Pencil, FileText, Calendar, Bookmark, Lock, Eye } from 'lucide-react';
import { formatAirdate } from '@/lib/format';
import { getNextSeason, getPrevSeason, seasonTotal, sortedSeasonStructure } from '@/lib/season';
import { MarkdownNotes } from '@/lib/markdown';
import type { MediaEntry, NextAirInfo, UpdateMediaInput } from '@/types/media';
import { togglePriorityQueue } from '@/server/media';
import MediaCover from './MediaCover';
import MediaBadges from './MediaBadges';
import ShowStepper from './ShowStepper';
import BookStepper from './BookStepper';
import MovieStepper from './MovieStepper';
import UnitStepperRow from './UnitStepperRow';

export interface MediaCardHandlers {
  onUpdate: (id: string, updates: UpdateMediaInput) => Promise<void>;
  onDelete?: (id: string) => void;
  onEdit?: (item: MediaEntry) => void;
  onOpenDetail?: (item: MediaEntry) => void;
}

interface MediaCardProps extends MediaCardHandlers {
  item: MediaEntry;
  nextAir?: NextAirInfo | null;
}

function isBookFamily(category: string): boolean {
  return category === 'book' || category === 'manga';
}

function statusLabel(status: string, category: string): string {
  const bookish = isBookFamily(category);
  const isMovie = category === 'movie';
  switch (status) {
    case 'completed':
      return isMovie ? 'Watched' : 'Completed';
    case 'planning':
      return isMovie ? 'Plan to Watch' : bookish ? 'Plan to Read' : 'Planning';
    case 'on_hold':
      return 'On Hold';
    case 'dropped':
      return 'Dropped';
    default:
      return isMovie ? 'In Progress' : bookish ? 'Reading' : 'In Progress';
  }
}

function categoryLabel(category: string): string {
  switch (category) {
    case 'anime':
      return 'Anime';
    case 'manga':
      return 'Manga';
    case 'movie':
      return 'Film';
    case 'book':
      return 'Book';
    default:
      return 'Television';
  }
}

/**
 * Unified media card for all four categories. Renders a show/anime episode
 * stepper or a book/manga numeric chapter stepper based on the entry.
 */
export default function MediaCard({
  item,
  nextAir,
  onUpdate,
  onDelete,
  onEdit,
  onOpenDetail,
}: MediaCardProps) {
  const [showNotes, setShowNotes] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const rawCategory = item.category || 'show';
  const bookish = isBookFamily(rawCategory);
  const status = item.status || 'in_progress';
  const rating = item.rating;
  const tags = Array.isArray(item.tags) ? item.tags : [];

  const primaryUnitCurrent = item.primaryUnitCurrent ?? 1;
  const primaryUnitTotal = item.primaryUnitTotal ?? 1;
  const secondaryUnitCurrent = item.secondaryUnitCurrent ?? 0;
  const secondaryUnitTotal = item.secondaryUnitTotal ?? null;
  const structure = Array.isArray(item.structure) ? item.structure : [];

  // Season/volume navigation helpers: structure-aware when the entry ships
  // a non-contiguous breakdown, linear fallback otherwise.
  const sortedStructure = sortedSeasonStructure(structure);
  const nextSeason = (current: number) => getNextSeason(current, sortedStructure, primaryUnitTotal);
  const prevSeason = (current: number) => getPrevSeason(current, sortedStructure, primaryUnitTotal);
  // Stepper label total: reflect the highest real season number so a
  // non-contiguous structure never renders "Season 3 of 2".
  const seasonDisplayTotal =
    sortedStructure.length > 0
      ? (sortedStructure[sortedStructure.length - 1]?.number ?? primaryUnitTotal)
      : primaryUnitTotal;

  const hasNextSeason = nextSeason(primaryUnitCurrent) !== null;
  const hasPrevSeason = prevSeason(primaryUnitCurrent) !== null;

  const isAtFinalUnit =
    !hasNextSeason && secondaryUnitTotal !== null && secondaryUnitCurrent >= secondaryUnitTotal;

  async function runUpdate(updates: Record<string, unknown>) {
    try {
      setIsUpdating(true);
      await onUpdate(item.id, updates);
    } finally {
      setIsUpdating(false);
    }
  }

  const handleEpisodeStep = (delta: number) => {
    if (delta < 0) {
      if (secondaryUnitCurrent > 0)
        void runUpdate({ secondaryUnitCurrent: secondaryUnitCurrent - 1 });
      return;
    }

    const totalKnown = secondaryUnitTotal !== null;
    if (!totalKnown || secondaryUnitCurrent >= (secondaryUnitTotal as number)) {
      const next = nextSeason(primaryUnitCurrent);
      if (next !== null) {
        void runUpdate({
          primaryUnitCurrent: next,
          secondaryUnitCurrent: 1,
          secondaryUnitTotal: seasonTotal(structure, next),
        });
      }
      return;
    }

    void runUpdate({ secondaryUnitCurrent: secondaryUnitCurrent + 1 });
  };

  const handleSeasonChange = (delta: number) => {
    const next = delta > 0 ? nextSeason(primaryUnitCurrent) : prevSeason(primaryUnitCurrent);
    if (next === null) return;
    void runUpdate({
      primaryUnitCurrent: next,
      secondaryUnitCurrent: 1,
      secondaryUnitTotal: seasonTotal(structure, next),
    });
  };

  const handleChapterCommit = (next: number) => {
    if (next === secondaryUnitCurrent) return;
    void runUpdate({ secondaryUnitCurrent: next });
  };

  const handleChapterStep = (delta: number) => {
    const nextVal = Math.max(0, secondaryUnitCurrent + delta);
    if (secondaryUnitTotal !== null && nextVal > secondaryUnitTotal) return;
    handleChapterCommit(nextVal);
  };

  const handleVolumeChange = (delta: number) => {
    const nextVol = Math.max(1, Math.min(primaryUnitTotal, primaryUnitCurrent + delta));
    if (nextVol !== primaryUnitCurrent) {
      void runUpdate({ primaryUnitCurrent: nextVol, secondaryUnitCurrent: 0 });
    }
  };

  const progressPercentage = secondaryUnitTotal
    ? Math.min(100, Math.round((secondaryUnitCurrent / secondaryUnitTotal) * 100))
    : 0;
  const itemStatusLabel = statusLabel(status, rawCategory);
  const catalogueNumber = item.id.slice(-4).toUpperCase();

  const openDetailProps = onOpenDetail
    ? {
        role: 'button' as const,
        tabIndex: 0,
        'aria-label': `Open details for ${item.title}`,
        onClick: () => onOpenDetail(item),
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpenDetail(item);
          }
        },
      }
    : {};

  const miniActionBtn =
    'inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-small border border-decorative bg-surface opacity-75 transition-[all] duration-[var(--za-motion-fast)] hover:opacity-100';

  return (
    <article
      aria-label={`${item.title} card`}
      className="za-bookplate za-card za-card--raised group relative flex min-w-0 max-w-full flex-col gap-[var(--za-space-4)] overflow-hidden [overflow-wrap:anywhere] p-[var(--za-space-4)] shadow-raised transition-[box-shadow,transform] duration-[var(--za-motion-fast)] hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgb(36_35_33/12%),0_12px_24px_rgb(36_35_33/8%)]"
    >
      {item.priorityIndex != null && (
        <span
          className="za-ribbon-bookmark"
          title="Priority Up Next Queue"
          aria-label={`Up Next queue position ${item.priorityIndex}`}
        />
      )}

      {/* Ex-libris catalogue header */}
      <div className="-mx-[var(--za-space-4)] -mt-[var(--za-space-4)] flex items-center justify-between gap-3 border-b border-dashed border-decorative bg-surface-subtle/70 px-[var(--za-space-4)] py-[var(--za-space-2)]">
        <span className="min-w-0 truncate font-[family-name:var(--za-font-mono)] text-[length:var(--za-text-fine)] uppercase tracking-[0.1em] text-ink-faint">
          EX LIBRIS · ZA-{catalogueNumber}
        </span>
        <span className="shrink-0 font-[family-name:var(--za-font-mono)] text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] uppercase tracking-[0.08em] text-accent">
          {categoryLabel(rawCategory)}
        </span>
      </div>

      {/* 2:3 cover tile + catalogue details */}
      <div className="flex flex-col gap-[var(--za-space-4)]">
        <MediaCover
          title={item.title}
          coverImage={item.coverImage}
          category={rawCategory}
          variant="card"
          status={status}
          statusLabel={itemStatusLabel}
          rating={rating}
          onOpenDetail={onOpenDetail ? () => onOpenDetail(item) : undefined}
          openDetailProps={openDetailProps}
        />

        <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
          <div className="flex flex-col gap-1">
            {/* Top action buttons (anchored top-right) */}
            <div className="flex items-center justify-end gap-[var(--za-space-1)]">
              <button
                type="button"
                className={`${miniActionBtn} ${
                  item.priorityIndex != null
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'text-ink-muted hover:border-required hover:text-ink'
                }`}
                onClick={async () => {
                  try {
                    setIsUpdating(true);
                    const updated = await togglePriorityQueue(item.id);
                    await onUpdate(item.id, { priorityIndex: updated.priorityIndex });
                  } catch (err) {
                    console.error('Failed to toggle priority queue:', err);
                  } finally {
                    setIsUpdating(false);
                  }
                }}
                title={
                  item.priorityIndex != null
                    ? `Queued #${item.priorityIndex} (Click to remove from Up Next)`
                    : 'Add to Up Next Queue'
                }
                aria-label={
                  item.priorityIndex != null
                    ? `Remove ${item.title} from Up Next queue`
                    : `Add ${item.title} to Up Next queue`
                }
              >
                <Bookmark
                  size={13}
                  strokeWidth={1.75}
                  className={item.priorityIndex != null ? 'fill-accent' : ''}
                />
              </button>
              {onOpenDetail && (
                <button
                  type="button"
                  className={`${miniActionBtn} text-ink-muted hover:border-accent hover:bg-accent-soft hover:text-accent`}
                  onClick={() => onOpenDetail(item)}
                  title={`Inspect ${item.title}`}
                  aria-label={`Inspect ${item.title}`}
                >
                  <Eye size={13} strokeWidth={1.75} />
                </button>
              )}
              {onEdit && (
                <button
                  type="button"
                  className={`${miniActionBtn} text-ink-muted hover:border-[var(--za-color-border-focus)] hover:bg-surface-hover hover:text-ink`}
                  onClick={() => onEdit(item)}
                  title={`Edit ${item.title}`}
                  aria-label={`Edit ${item.title}`}
                >
                  <Pencil size={13} strokeWidth={1.75} />
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  className={`${miniActionBtn} text-danger hover:border-danger hover:bg-danger-surface`}
                  onClick={() => onDelete(item.id)}
                  title={`Remove ${item.title}`}
                  aria-label={`Remove ${item.title}`}
                >
                  <Trash2 size={14} strokeWidth={1.75} />
                </button>
              )}
            </div>

            {/* Title & Privacy Badge: full horizontal width */}
            <div className="min-w-0">
              <h3
                className={`[overflow-wrap:anywhere] font-[family-name:var(--za-font-editorial)] text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] leading-[var(--za-leading-compact)] text-ink ${onOpenDetail ? 'cursor-pointer' : ''}`}
                title={item.title}
                {...openDetailProps}
              >
                {item.title}
              </h3>
              {/* Phase 3: private entry lock badge — shown only on owner dashboard */}
              {item.isPrivate && (
                <span
                  className="mt-1 inline-flex items-center gap-[var(--za-space-1)] rounded-[var(--za-radius-small)] bg-surface-subtle px-[var(--za-space-2)] py-0.5 text-[10px] text-ink-muted"
                  title="Private — hidden from public profile and RSS"
                >
                  <Lock size={10} strokeWidth={2} aria-hidden="true" />
                  Private
                </span>
              )}
              <span className="mt-1 block truncate font-[family-name:var(--za-font-mono)] text-[length:var(--za-text-fine)] text-ink-faint">
                {item.sourceId || 'Local catalogue record'}
              </span>
            </div>
          </div>

          {/* Badges */}
          <MediaBadges
            status={status as import('@/types/media').MediaStatus}
            statusLabel={itemStatusLabel}
            rating={rating}
            category={rawCategory}
            primaryUnitCurrent={primaryUnitCurrent}
            primaryUnitTotal={primaryUnitTotal}
            tags={tags}
            dropReason={item.dropReason}
            droppedProgressPrimary={item.droppedProgressPrimary}
            droppedProgressSecondary={item.droppedProgressSecondary}
            priorityIndex={item.priorityIndex}
            showStatus={false}
            showRating={rating != null && rating < 9}
          />

          {/* Season / volume row */}
          {!bookish && rawCategory !== 'movie' && primaryUnitTotal > 1 && (
            <UnitStepperRow
              unitLabel="Season"
              current={primaryUnitCurrent}
              total={seasonDisplayTotal}
              canPrev={hasPrevSeason}
              canNext={hasNextSeason}
              disabled={isUpdating}
              onChange={handleSeasonChange}
            />
          )}
          {bookish && primaryUnitTotal > 1 && (
            <UnitStepperRow
              unitLabel="Volume"
              current={primaryUnitCurrent}
              total={primaryUnitTotal}
              disabled={isUpdating}
              onChange={handleVolumeChange}
            />
          )}

          {/* Notes toggle */}
          {item.notes && (
            <div>
              <button
                type="button"
                onClick={() => setShowNotes((p) => !p)}
                className="inline-flex cursor-pointer items-center gap-1 text-[length:var(--za-text-fine)] text-ink-muted hover:text-ink"
              >
                <FileText size={12} />
                <span>{showNotes ? 'Hide note' : 'View note'}</span>
              </button>
              {showNotes && (
                <div className="mt-2 rounded-control border border-decorative bg-surface-subtle px-[var(--za-space-3)] py-[var(--za-space-2)] text-[length:var(--za-text-fine)] leading-[var(--za-leading-body)] text-ink">
                  <MarkdownNotes content={item.notes} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Completion nudge */}
      {isAtFinalUnit && status !== 'completed' && rawCategory !== 'movie' && (
        <div className="mt-2 flex items-center justify-between rounded-small border border-success/25 bg-success-surface px-[var(--za-space-3)] py-[var(--za-space-2)] text-success">
          <span>{bookish ? 'Finished reading!' : 'Series completed!'}</span>
          <button
            type="button"
            className="za-button za-button--secondary cursor-pointer px-[0.6rem] py-[0.2rem] text-[length:var(--za-text-fine)] text-success hover:border-success"
            onClick={() =>
              runUpdate({ status: 'completed', completedAt: new Date().toISOString() })
            }
            disabled={isUpdating}
          >
            Mark Completed
          </button>
        </div>
      )}

      {/* Action zone */}
      <div className="flex flex-col gap-[var(--za-space-3)] border-t border-decorative pt-[var(--za-space-3)]">
        {rawCategory === 'movie' ? (
          <MovieStepper
            status={status}
            runtime={secondaryUnitTotal}
            progressMinutes={secondaryUnitCurrent}
            rewatchCount={primaryUnitCurrent}
            disabled={isUpdating}
            onMarkWatched={() =>
              runUpdate({
                status: 'completed',
                primaryUnitCurrent: Math.max(1, primaryUnitCurrent),
                secondaryUnitCurrent: secondaryUnitTotal || 1,
                completedAt: new Date().toISOString(),
              })
            }
            onRewatch={() =>
              runUpdate({
                primaryUnitCurrent: (primaryUnitCurrent > 0 ? primaryUnitCurrent : 1) + 1,
                status: 'completed',
                rewatch: true,
                completedAt: new Date().toISOString(),
              })
            }
            onStepMinutes={(delta) => {
              const nextMins = Math.max(
                0,
                Math.min(secondaryUnitTotal || 9999, secondaryUnitCurrent + delta),
              );
              const shouldComplete = secondaryUnitTotal !== null && nextMins >= secondaryUnitTotal;
              runUpdate({
                secondaryUnitCurrent: nextMins,
                primaryUnitCurrent: shouldComplete
                  ? Math.max(1, primaryUnitCurrent)
                  : primaryUnitCurrent,
                status: shouldComplete ? 'completed' : 'in_progress',
                completedAt: shouldComplete ? new Date().toISOString() : undefined,
              });
            }}
          />
        ) : bookish ? (
          <BookStepper
            current={secondaryUnitCurrent}
            total={secondaryUnitTotal}
            disabled={isUpdating}
            onCommit={handleChapterCommit}
            onStep={handleChapterStep}
          />
        ) : (
          <ShowStepper
            current={secondaryUnitCurrent}
            total={secondaryUnitTotal}
            hasNextUnit={hasNextSeason}
            disabled={isUpdating}
            onStep={handleEpisodeStep}
          />
        )}

        {secondaryUnitTotal ? (
          <div className="flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-sm bg-surface-subtle">
              <div
                className="h-full rounded-sm bg-accent transition-[width] duration-[var(--za-motion-fast)]"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            <span className="min-w-7 text-right font-[family-name:var(--za-font-mono)] text-[length:var(--za-text-fine)] text-ink-muted">
              {progressPercentage}%
            </span>
          </div>
        ) : null}

        {nextAir && (
          <div className="flex items-center justify-between gap-2 rounded-control border border-decorative bg-surface-subtle/70 px-[var(--za-space-3)] py-[var(--za-space-2)] text-[length:var(--za-text-fine)] leading-normal text-ink-muted">
            <span className="flex items-center gap-1.5 font-[var(--za-weight-emphasis)] text-ink">
              <Calendar size={13} className="shrink-0 text-ink-muted" />
              <span>
                {rawCategory === 'anime'
                  ? nextAir.season && nextAir.season > 1
                    ? `S${nextAir.season}E${nextAir.number}`
                    : `Ep ${nextAir.number}`
                  : `S${nextAir.season}E${nextAir.number}`}
              </span>
            </span>
            <span>airs {formatAirdate(nextAir.airdate)}</span>
          </div>
        )}
      </div>
    </article>
  );
}

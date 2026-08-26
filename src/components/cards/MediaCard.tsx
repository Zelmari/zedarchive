'use client';

import { useState } from 'react';
import { Trash2, Pencil, FileText } from 'lucide-react';
import { getInitials } from '@/lib/format';
import type { MediaEntry } from '@/types/media';
import { Badge, StatusBadge, RatingBadge, type MediaStatusBadge } from '@/components/ui/Badge';
import ShowStepper from './ShowStepper';
import BookStepper from './BookStepper';
import UnitStepperRow from './UnitStepperRow';

type CardItem = MediaEntry & Record<string, unknown>;

export interface MediaCardHandlers {
  onUpdate: (id: string, updates: Record<string, unknown>) => Promise<void>;
  onDelete?: (id: string) => void;
  onEdit?: (item: CardItem) => void;
  onOpenDetail?: (item: CardItem) => void;
}

interface MediaCardProps extends MediaCardHandlers {
  item: CardItem;
}

function isBookFamily(category: string): boolean {
  return category === 'book' || category === 'manga';
}

function statusLabel(status: string, bookish: boolean): string {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'planning':
      return bookish ? 'Plan to Read' : 'Planning';
    case 'on_hold':
      return 'On Hold';
    case 'dropped':
      return 'Dropped';
    default:
      return bookish ? 'Reading' : 'In Progress';
  }
}

const coverWrapperBase =
  'relative block w-28 min-w-28 flex-none basis-28 overflow-hidden rounded-small border border-decorative bg-[var(--za-color-title-tile)] [aspect-ratio:2/3]';

/**
 * Unified media card for all four categories. Renders a show/anime episode
 * stepper or a book/manga numeric chapter stepper based on the entry.
 */
export default function MediaCard({
  item,
  onUpdate,
  onDelete,
  onEdit,
  onOpenDetail,
}: MediaCardProps) {
  const [showNotes, setShowNotes] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const rawCategory = String(
    item.category ?? (item.type === 'manga' || item.type === 'book' ? item.type : 'show'),
  );
  const bookish = isBookFamily(rawCategory);
  const status = (item.status as string) || 'in_progress';
  const rating = item.rating;
  const tags = Array.isArray(item.tags) ? item.tags : [];

  const primaryUnitCurrent = Number(item.primaryUnitCurrent ?? 1);
  const primaryUnitTotal = Number(item.primaryUnitTotal ?? 1);
  const secondaryUnitCurrent =
    (item.secondaryUnitCurrent as number | undefined) ??
    (item.currentProgress as number | undefined) ??
    0;
  const secondaryUnitTotal =
    (item.secondaryUnitTotal as number | null | undefined) ??
    (item.totalUnits as number | null | undefined) ??
    null;
  const structure = Array.isArray(item.structure)
    ? (item.structure as Array<{ number: number; total: number | null }>)
    : [];

  // Book card keeps its numeric input in sync with external progress updates
  // (render-time derived-state sync, per React docs).
  const [prevProgress, setPrevProgress] = useState(secondaryUnitCurrent);
  const [inputValue, setInputValue] = useState(String(secondaryUnitCurrent));
  if (prevProgress !== secondaryUnitCurrent) {
    setPrevProgress(secondaryUnitCurrent);
    setInputValue(String(secondaryUnitCurrent));
  }

  const hasNextSeason =
    primaryUnitCurrent < primaryUnitTotal || structure.some((s) => s.number > primaryUnitCurrent);

  const isAtFinalUnit =
    primaryUnitCurrent >= primaryUnitTotal &&
    secondaryUnitTotal !== null &&
    secondaryUnitCurrent >= secondaryUnitTotal;

  const canDecrement = secondaryUnitCurrent > 0;
  const canIncrement =
    secondaryUnitTotal === null ||
    (!bookish && hasNextSeason) ||
    secondaryUnitCurrent < secondaryUnitTotal;

  async function runUpdate(updates: Record<string, unknown>) {
    try {
      setIsUpdating(true);
      await onUpdate(item.id, updates);
    } finally {
      setIsUpdating(false);
    }
  }

  function seasonTotalFor(seasonNumber: number): number | null {
    const match = structure.find((s) => s.number === seasonNumber);
    return match && match.total !== null && match.total !== undefined ? match.total : null;
  }

  const handleEpisodeStep = (delta: number) => {
    if (delta < 0) {
      if (secondaryUnitCurrent > 0)
        void runUpdate({ secondaryUnitCurrent: secondaryUnitCurrent - 1 });
      return;
    }

    const totalKnown = secondaryUnitTotal !== null;
    if (!totalKnown || secondaryUnitCurrent >= (secondaryUnitTotal as number)) {
      if (hasNextSeason) {
        const nextSeason = primaryUnitCurrent + 1;
        void runUpdate({
          primaryUnitCurrent: nextSeason,
          secondaryUnitCurrent: 1,
          secondaryUnitTotal: seasonTotalFor(nextSeason),
        });
      }
      return;
    }

    void runUpdate({ secondaryUnitCurrent: secondaryUnitCurrent + 1 });
  };

  const handleSeasonChange = (delta: number) => {
    const nextSeason = primaryUnitCurrent + delta;
    if (nextSeason < 1) return;
    if (primaryUnitTotal && nextSeason > primaryUnitTotal) return;
    void runUpdate({
      primaryUnitCurrent: nextSeason,
      secondaryUnitCurrent: 1,
      secondaryUnitTotal: seasonTotalFor(nextSeason),
    });
  };

  const commitChapterValue = (raw: string) => {
    let parsed = parseInt(raw, 10);
    if (isNaN(parsed) || parsed < 0) parsed = 0;
    if (secondaryUnitTotal !== null && parsed > secondaryUnitTotal) parsed = secondaryUnitTotal;
    setInputValue(String(parsed));
    if (parsed === secondaryUnitCurrent) return;
    void runUpdate({ secondaryUnitCurrent: parsed });
  };

  const handleChapterStep = (delta: number) => {
    const nextVal = Math.max(0, secondaryUnitCurrent + delta);
    if (secondaryUnitTotal !== null && nextVal > secondaryUnitTotal) return;
    commitChapterValue(String(nextVal));
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
    'inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-control border border-decorative bg-surface opacity-75 transition-[all] duration-[var(--za-motion-fast)] hover:opacity-100';

  return (
    <article
      aria-label={`${item.title} card`}
      className="za-card za-card--raised flex min-w-0 max-w-full flex-col gap-[var(--za-space-4)] [overflow-wrap:anywhere] rounded-control p-[var(--za-space-4)] shadow-raised transition-[box-shadow] duration-[var(--za-motion-fast)] hover:shadow-[0_4px_12px_rgb(36_35_33/12%),0_12px_24px_rgb(36_35_33/8%)]"
    >
      {/* Top: 2:3 cover tile + details */}
      <div className="flex items-start gap-[var(--za-space-4)]">
        <div
          className={`${coverWrapperBase} ${onOpenDetail ? 'cursor-pointer' : ''}`}
          {...openDetailProps}
          title={onOpenDetail ? `Open details for ${item.title}` : undefined}
        >
          {item.coverImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URLs / remote covers, unoptimized by design
            <img
              src={item.coverImage}
              alt={item.title}
              className="block h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="za-title-tile h-full w-full">
              <span>
                {getInitials(
                  item.title,
                  bookish
                    ? rawCategory === 'manga'
                      ? 'MG'
                      : 'BK'
                    : rawCategory === 'anime'
                      ? 'AN'
                      : 'TV',
                )}
              </span>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 basis-40 flex-col justify-between gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3
                className={`[overflow-wrap:anywhere] text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] leading-[var(--za-leading-compact)] text-ink ${onOpenDetail ? 'cursor-pointer' : ''}`}
                title={item.title}
                {...openDetailProps}
              >
                {item.title}
              </h3>
            </div>
            <div className="flex shrink-0 items-center gap-[var(--za-space-1)]">
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
          </div>

          {/* Badges */}
          <div className="flex flex-wrap items-center gap-[var(--za-space-1)]">
            <StatusBadge status={status as MediaStatusBadge} label={statusLabel(status, bookish)} />
            {rating != null && <RatingBadge rating={rating} />}
            {!bookish && (
              <Badge>
                S{primaryUnitCurrent}
                {primaryUnitTotal > 1 ? ` / ${primaryUnitTotal}` : ''}
              </Badge>
            )}
            <Badge>
              {rawCategory === 'anime'
                ? 'Anime'
                : rawCategory === 'manga'
                  ? 'Manga'
                  : rawCategory === 'book'
                    ? 'Book'
                    : 'TV Series'}
            </Badge>
            {tags.slice(0, 2).map((t) => (
              <Badge key={t} className="text-[0.68rem]">
                #{t}
              </Badge>
            ))}
          </div>

          {/* Season / volume row */}
          {!bookish && primaryUnitTotal > 1 && (
            <UnitStepperRow
              unitLabel="Season"
              current={primaryUnitCurrent}
              total={primaryUnitTotal}
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
                  {item.notes}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Completion nudge */}
      {isAtFinalUnit && status !== 'completed' && (
        <div className="mt-2 flex items-center justify-between rounded-control border border-[rgba(46,125,50,0.25)] bg-[rgba(46,125,50,0.08)] px-[var(--za-space-3)] py-[var(--za-space-2)]">
          <span>{bookish ? 'Finished reading!' : 'Series completed!'}</span>
          <button
            type="button"
            className="cursor-pointer rounded-control border-0 bg-[#2e7d32] px-[0.6rem] py-[0.2rem] text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-white hover:brightness-110"
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
        {bookish ? (
          <BookStepper
            value={inputValue}
            canDecrement={canDecrement}
            canIncrement={canIncrement}
            total={secondaryUnitTotal}
            disabled={isUpdating}
            onValueChange={setInputValue}
            onCommit={commitChapterValue}
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
            <span className="min-w-7 text-right text-[length:var(--za-text-fine)] text-ink-muted">
              {progressPercentage}%
            </span>
          </div>
        ) : null}
      </div>
    </article>
  );
}

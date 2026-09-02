import { Badge, StatusBadge, RatingBadge } from '@/components/ui/Badge';
import type { MediaStatus } from '@/types/media';

interface MediaBadgesProps {
  status: MediaStatus;
  statusLabel: string;
  rating?: number | null;
  category: string;
  primaryUnitCurrent: number;
  primaryUnitTotal: number;
  tags?: string[];
  dropReason?: string | null;
  droppedProgressPrimary?: number | null;
  droppedProgressSecondary?: number | null;
  priorityIndex?: number | null;
  showStatus?: boolean;
  showRating?: boolean;
}

export default function MediaBadges({
  status,
  statusLabel,
  rating,
  category,
  primaryUnitCurrent,
  primaryUnitTotal,
  tags = [],
  dropReason,
  droppedProgressPrimary,
  droppedProgressSecondary,
  priorityIndex,
  showStatus = true,
  showRating = true,
}: MediaBadgesProps) {
  const bookish = category === 'book' || category === 'manga';
  const isMovie = category === 'movie';

  const droppedMilestoneText = (() => {
    if (status !== 'dropped') return null;
    const pri = droppedProgressPrimary ?? primaryUnitCurrent;
    const sec = droppedProgressSecondary;
    if (isMovie) return null;
    if (bookish) {
      if (sec != null && sec > 0) return `Dropped at Vol ${pri}, Ch ${sec}`;
      return `Dropped at Vol ${pri}`;
    }
    if (sec != null && sec > 0) return `Dropped at S${pri}E${sec}`;
    return `Dropped at S${pri}`;
  })();

  return (
    <div className="flex flex-wrap items-center gap-[var(--za-space-1)]">
      {priorityIndex != null && (
        <span
          title={`Rank #${priorityIndex} in Up Next Queue`}
          className="inline-flex items-center gap-0.5 rounded-small border border-accent/40 bg-accent-soft px-1.5 py-0.5 font-[family-name:var(--za-font-mono)] text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-accent"
        >
          Up Next #{priorityIndex}
        </span>
      )}
      {showStatus && (
        <StatusBadge
          status={status}
          label={droppedMilestoneText || statusLabel}
          title={status === 'dropped' && dropReason ? `Reason: "${dropReason}"` : undefined}
        />
      )}
      {showRating && rating != null && <RatingBadge rating={rating} />}
      {!bookish && !isMovie && (
        <Badge>
          S{primaryUnitCurrent}
          {primaryUnitTotal > 1 ? ` / ${primaryUnitTotal}` : ''}
        </Badge>
      )}
      {isMovie && primaryUnitCurrent > 1 && <Badge>Watched ({primaryUnitCurrent}x)</Badge>}
      <Badge>
        {category === 'movie'
          ? 'Movie'
          : category === 'anime'
            ? 'Anime'
            : category === 'manga'
              ? 'Manga'
              : category === 'book'
                ? 'Book'
                : 'TV Series'}
      </Badge>
      {tags.length > 0 && (
        <div className="flex basis-full flex-wrap items-center gap-x-2 gap-y-1 pt-1">
          {tags.map((t) => (
            <span
              key={t}
              className="font-[family-name:var(--za-font-mono)] text-[length:var(--za-text-fine)] text-ink-faint"
            >
              #{t}
            </span>
          ))}
        </div>
      )}
      {status === 'dropped' && (
        <div className="basis-full border-l-2 border-danger bg-danger-surface px-[var(--za-space-3)] py-[var(--za-space-2)] font-[family-name:var(--za-font-serif-body)] text-[length:var(--za-text-fine)] italic leading-[var(--za-leading-body)] text-danger">
          <span className="font-[family-name:var(--za-font-mono)] font-[var(--za-weight-emphasis)] not-italic uppercase tracking-[0.08em]">
            DNF
          </span>
          <span className="ml-1.5">{dropReason || droppedMilestoneText || 'Dropped'}</span>
        </div>
      )}
    </div>
  );
}

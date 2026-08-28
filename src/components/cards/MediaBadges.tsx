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
      <StatusBadge
        status={status}
        label={droppedMilestoneText || statusLabel}
        title={status === 'dropped' && dropReason ? `Reason: "${dropReason}"` : undefined}
      />
      {rating != null && <RatingBadge rating={rating} />}
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
      {tags.slice(0, 2).map((t) => (
        <Badge key={t} className="text-[0.68rem]">
          #{t}
        </Badge>
      ))}
    </div>
  );
}

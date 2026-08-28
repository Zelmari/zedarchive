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
}

export default function MediaBadges({
  status,
  statusLabel,
  rating,
  category,
  primaryUnitCurrent,
  primaryUnitTotal,
  tags = [],
}: MediaBadgesProps) {
  const bookish = category === 'book' || category === 'manga';

  return (
    <div className="flex flex-wrap items-center gap-[var(--za-space-1)]">
      <StatusBadge status={status} label={statusLabel} />
      {rating != null && <RatingBadge rating={rating} />}
      {!bookish && (
        <Badge>
          S{primaryUnitCurrent}
          {primaryUnitTotal > 1 ? ` / ${primaryUnitTotal}` : ''}
        </Badge>
      )}
      <Badge>
        {category === 'anime'
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

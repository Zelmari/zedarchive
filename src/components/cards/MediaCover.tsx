import { Star } from 'lucide-react';
import { getInitials } from '@/lib/format';
import type { MediaStatus } from '@/types/media';

interface MediaCoverProps {
  title: string;
  coverImage?: string | null;
  category?: string;
  variant?: 'compact' | 'card';
  status?: MediaStatus;
  statusLabel?: string;
  rating?: number | null;
  onOpenDetail?: () => void;
  openDetailProps?: Record<string, unknown>;
}

const coverWrapperBase =
  'relative block overflow-hidden rounded-small border border-decorative bg-surface-sunken [aspect-ratio:2/3]';

const compactCoverClass = 'w-28 min-w-28 flex-none basis-28';
const cardCoverClass = 'w-full min-w-0';

const STATUS_OVERLAY_CLASSES: Record<MediaStatus, string> = {
  in_progress: 'border-success bg-success/90 text-on-accent',
  completed: 'border-ink bg-ink/90 text-on-accent',
  planning: 'border-ink-muted bg-ink-muted/90 text-on-accent',
  on_hold: 'border-warning bg-warning/90 text-ink',
  dropped: 'border-danger bg-danger/95 text-on-accent',
};

export default function MediaCover({
  title,
  coverImage,
  category = 'show',
  variant = 'compact',
  status,
  statusLabel,
  rating,
  onOpenDetail,
  openDetailProps = {},
}: MediaCoverProps) {
  const bookish = category === 'book' || category === 'manga';
  const isCard = variant === 'card';
  const isMasterwork = rating != null && rating >= 9;
  const categoryLabel =
    category === 'anime'
      ? 'Anime'
      : category === 'manga'
        ? 'Manga'
        : category === 'movie'
          ? 'Film'
          : category === 'book'
            ? 'Book'
            : 'Television';

  return (
    <div
      className={`${coverWrapperBase} ${isCard ? cardCoverClass : compactCoverClass} ${
        onOpenDetail ? 'cursor-pointer' : ''
      } ${isCard ? 'group/cover' : ''}`}
      {...openDetailProps}
      title={onOpenDetail ? `Open details for ${title}` : undefined}
    >
      {coverImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URLs / remote covers, unoptimized by design
        <img
          src={coverImage}
          alt={title}
          className="block h-full w-full object-cover transition-transform duration-300 group-hover/cover:scale-[1.03]"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-surface-subtle to-surface-sunken px-5 text-center">
          <span
            className={`font-[family-name:var(--za-font-display)] font-[var(--za-weight-heading)] uppercase tracking-[0.08em] text-ink ${
              isCard
                ? 'text-[length:var(--za-text-heading-md)]'
                : 'text-[length:var(--za-text-heading-lg)]'
            }`}
          >
            {isCard
              ? title
              : getInitials(
                  title,
                  bookish
                    ? category === 'manga'
                      ? 'MG'
                      : 'BK'
                    : category === 'anime'
                      ? 'AN'
                      : 'TV',
                )}
          </span>
          {isCard && (
            <span className="font-[family-name:var(--za-font-mono)] text-[length:var(--za-text-fine)] uppercase tracking-[0.16em] text-accent">
              {categoryLabel}
            </span>
          )}
        </div>
      )}
      {isCard && status && statusLabel && (
        <span
          className={`absolute left-3 top-3 z-[2] rounded-small border px-2 py-1 font-[family-name:var(--za-font-mono)] text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] uppercase tracking-[0.06em] shadow-raised backdrop-blur-sm ${STATUS_OVERLAY_CLASSES[status]}`}
        >
          {statusLabel}
        </span>
      )}
      {isCard && isMasterwork && (
        <span
          className="za-gold-stamp absolute right-3 top-3 z-[2] rounded-small border border-gold/60 bg-surface/95 px-2 py-1 font-[family-name:var(--za-font-mono)] text-[length:var(--za-text-fine)]"
          title={`Rated ${rating}/10`}
          aria-label={`Rated ${rating} out of 10`}
        >
          <Star size={11} fill="currentColor" aria-hidden="true" />
          <span>{rating}</span>
        </span>
      )}
    </div>
  );
}

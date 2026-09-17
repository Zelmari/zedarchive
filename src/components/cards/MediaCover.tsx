import { getInitials } from '@/lib/format';
import { cn } from '@/lib/cn';

interface MediaCoverProps {
  title: string;
  coverImage?: string | null;
  category?: string;
  variant?: 'compact' | 'card' | 'row';
  onOpenDetail?: () => void;
  openDetailProps?: Record<string, unknown>;
}

const coverWrapperBase =
  'relative block overflow-hidden rounded-small border border-decorative bg-surface-sunken [aspect-ratio:2/3]';

const compactCoverClass = 'w-28 min-w-28 flex-none basis-28';
const cardCoverClass = 'w-full min-w-0';
const rowCoverClass = 'w-28 min-w-28 flex-none basis-28 self-start';

export default function MediaCover({
  title,
  coverImage,
  category = 'show',
  variant = 'compact',
  onOpenDetail,
  openDetailProps = {},
}: MediaCoverProps) {
  const bookish = category === 'book' || category === 'manga';
  const isCard = variant === 'card';
  const isRow = variant === 'row';
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
      className={cn(
        coverWrapperBase,
        isCard ? cardCoverClass : isRow ? rowCoverClass : compactCoverClass,
        onOpenDetail && 'cursor-pointer',
        (isCard || isRow) && 'group/cover',
      )}
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
        <div
          className={`flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-surface-subtle to-surface-sunken text-center ${
            isRow ? 'gap-1 px-2' : 'gap-3 px-5'
          }`}
        >
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
    </div>
  );
}

import { getInitials } from '@/lib/format';

interface MediaCoverProps {
  title: string;
  coverImage?: string | null;
  category?: string;
  onOpenDetail?: () => void;
  openDetailProps?: Record<string, unknown>;
}

const coverWrapperBase =
  'relative block w-28 min-w-28 flex-none basis-28 overflow-hidden rounded-small border border-decorative bg-[var(--za-color-title-tile)] [aspect-ratio:2/3]';

export default function MediaCover({
  title,
  coverImage,
  category = 'show',
  onOpenDetail,
  openDetailProps = {},
}: MediaCoverProps) {
  const bookish = category === 'book' || category === 'manga';

  return (
    <div
      className={`${coverWrapperBase} ${onOpenDetail ? 'cursor-pointer' : ''}`}
      {...openDetailProps}
      title={onOpenDetail ? `Open details for ${title}` : undefined}
    >
      {coverImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URLs / remote covers, unoptimized by design
        <img
          src={coverImage}
          alt={title}
          className="block h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="za-title-tile h-full w-full">
          <span>
            {getInitials(
              title,
              bookish ? (category === 'manga' ? 'MG' : 'BK') : category === 'anime' ? 'AN' : 'TV',
            )}
          </span>
        </div>
      )}
    </div>
  );
}

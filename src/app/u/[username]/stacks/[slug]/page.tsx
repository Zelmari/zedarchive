import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPublicStack } from '@/server/stacks';
import { Layers, Star } from 'lucide-react';
import MediaCover from '@/components/cards/MediaCover';
import SubPageHeader from '@/components/navigation/SubPageHeader';
import type { MediaEntry } from '@/types/media';

interface PageProps {
  params: Promise<{ username: string; slug: string }>;
}

const CATEGORY_LABELS: Record<MediaEntry['category'], string> = {
  show: 'Television',
  movie: 'Film',
  book: 'Novel',
  anime: 'Anime',
  manga: 'Manga',
};

const STATUS_LABELS: Record<MediaEntry['status'], string> = {
  in_progress: 'In progress',
  completed: 'Completed',
  planning: 'Planning',
  on_hold: 'On hold',
  dropped: 'Dropped',
};

function getMediaMeta(media: MediaEntry): string {
  const progress =
    media.category === 'movie'
      ? media.secondaryUnitTotal
        ? `${media.secondaryUnitCurrent}/${media.secondaryUnitTotal} min`
        : `${media.secondaryUnitCurrent} min logged`
      : media.category === 'book' || media.category === 'manga'
        ? `Vol ${media.primaryUnitCurrent} · ${media.secondaryUnitCurrent}${media.secondaryUnitTotal ? `/${media.secondaryUnitTotal}` : ''} chapters`
        : `S${media.primaryUnitCurrent} · ${media.secondaryUnitCurrent}${media.secondaryUnitTotal ? `/${media.secondaryUnitTotal}` : ''} episodes`;

  return [CATEGORY_LABELS[media.category], STATUS_LABELS[media.status], progress].join(' · ');
}

export async function generateMetadata({ params }: PageProps) {
  const { username, slug } = await params;
  const data = await getPublicStack(username, slug);
  if (!data) return { title: 'Stack Not Found — zedarchive' };
  const curatorUsername = data.user.username || username;

  return {
    title: `${data.stack.title} — Curated by @${curatorUsername} | zedarchive`,
    description: data.stack.description || `A curated media anthology by @${curatorUsername}`,
  };
}

export default async function PublicStackPage({ params }: PageProps) {
  const { username, slug } = await params;
  const data = await getPublicStack(username, slug);

  if (!data) {
    notFound();
  }

  const { user, stack } = data;
  const curatorUsername = user.username || username;
  const visibleItems = stack.items.filter((item) => item.media !== null);

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <SubPageHeader
        backLink={{
          href: `/u/${curatorUsername}`,
          label: `@${curatorUsername}`,
        }}
        breadcrumbs={[{ label: stack.title }]}
        actions={
          <Link href="/signup" className="za-button za-button--primary text-xs">
            Create Archive
          </Link>
        }
      />
      <main id="main-content" className="flex-1 py-8">
        <div className="za-container max-w-5xl">
          <article className="za-bookplate border-2 border-required bg-surface p-5 shadow-raised sm:p-8">
            <header className="border-b border-decorative pb-6">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
                <Layers size={13} />
                <span>Published anthology</span>
                <span className="text-decorative">·</span>
                <span>Curated by @{curatorUsername}</span>
              </div>
              <h1 className="mt-3 font-[var(--za-font-display)] text-2xl font-semibold leading-tight tracking-[0.04em] text-ink sm:text-3xl">
                {stack.title}
              </h1>
              {stack.description && (
                <div className="mt-5 max-w-3xl border-l-2 border-required pl-4 font-[var(--za-font-editorial)] text-lg italic leading-relaxed text-ink sm:text-xl">
                  “{stack.description}”
                </div>
              )}
            </header>

            {visibleItems.length === 0 ? (
              <div className="border-b border-dashed border-decorative py-12 text-center text-xs text-ink-muted">
                <Layers size={28} className="mx-auto mb-3 text-accent opacity-60" />
                <p className="font-[var(--za-font-display)] text-sm font-semibold uppercase tracking-[0.05em] text-ink">
                  No public titles in this edition
                </p>
                <p className="mt-1">Only titles marked for public sharing appear here.</p>
              </div>
            ) : (
              <ol aria-label={`${stack.title} titles`} className="space-y-7 pt-7">
                {visibleItems.map((item, index) => {
                  const media = item.media;
                  if (!media) return null;

                  return (
                    <li
                      key={item.id}
                      className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 border-b border-dashed border-decorative pb-7 last:border-b-0 sm:grid-cols-[3rem_7rem_minmax(0,1fr)] sm:gap-6"
                    >
                      <div className="font-[var(--za-font-display)] text-2xl font-semibold leading-none text-[var(--za-color-border-required)] sm:text-3xl">
                        {String(index + 1).padStart(2, '0')}
                      </div>
                      <div className="col-start-2 row-start-1 w-28 sm:col-start-2">
                        <MediaCover
                          title={media.title}
                          coverImage={media.coverImage}
                          category={media.category}
                        />
                      </div>
                      <div className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-3 sm:row-start-1">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-muted sm:text-xs">
                          <span>{getMediaMeta(media)}</span>
                          {media.rating != null && (
                            <span className="inline-flex items-center gap-1 text-[var(--za-color-gold)]">
                              <Star size={12} fill="currentColor" />
                              {media.rating}/10
                            </span>
                          )}
                        </div>
                        <h2 className="mt-2 break-words font-[var(--za-font-display)] text-xl font-semibold leading-tight text-ink sm:text-2xl">
                          {media.title}
                        </h2>
                        {item.annotation && (
                          <p className="mt-4 max-w-3xl font-[var(--za-font-serif-body)] text-base leading-relaxed text-ink sm:text-lg">
                            “{item.annotation}”
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}

            <footer className="mt-7 border-t border-decorative pt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted">
              {visibleItems.length} {visibleItems.length === 1 ? 'title' : 'titles'} in the public
              folio · @{curatorUsername}
            </footer>
          </article>
        </div>
      </main>
    </div>
  );
}

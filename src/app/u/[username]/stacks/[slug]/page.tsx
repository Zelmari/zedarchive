import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPublicStack } from '@/server/stacks';
import { Layers, ArrowLeft, Star, BookOpen, Tv, Film, Sparkles, Library } from 'lucide-react';
import MediaCover from '@/components/cards/MediaCover';

interface PageProps {
  params: Promise<{ username: string; slug: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { username, slug } = await params;
  const data = await getPublicStack(username, slug);
  if (!data) return { title: 'Stack Not Found — zedarchive' };

  return {
    title: `${data.stack.title} — Curated by @${data.user.username} | zedarchive`,
    description: data.stack.description || `A curated media anthology by @${data.user.username}`,
  };
}

export default async function PublicStackPage({ params }: PageProps) {
  const { username, slug } = await params;
  const data = await getPublicStack(username, slug);

  if (!data) {
    notFound();
  }

  const { user, stack } = data;

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href={`/u/${user.username}`}
            className="flex items-center gap-1 text-xs text-ink-muted hover:text-ink"
          >
            <ArrowLeft size={14} /> Back to @{user.username}’s Archive
          </Link>
        </div>

        <div className="mb-8 border-b border-decorative pb-6">
          <div className="flex items-center gap-2 text-xs text-ink-muted">
            <Layers size={14} className="text-accent" />
            <span>Curated Anthology</span>
            <span>•</span>
            <span>By @{user.username}</span>
          </div>
          <h1 className="mt-2 text-3xl font-[var(--za-weight-heading)] text-ink">{stack.title}</h1>
          {stack.description && (
            <p className="mt-3 text-sm text-ink-muted leading-relaxed max-w-2xl">
              {stack.description}
            </p>
          )}
        </div>

        {stack.items.length === 0 ? (
          <div className="rounded-control border border-dashed border-decorative p-8 text-center text-xs text-ink-muted">
            No items in this stack yet.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {stack.items.map(({ id, annotation, media }) => {
              if (!media) return null;
              return (
                <div
                  key={id}
                  className="za-card flex gap-3.5 rounded-control border border-decorative bg-surface p-3.5 shadow-sm"
                >
                  <MediaCover
                    title={media.title}
                    coverImage={media.coverImage}
                    category={media.category}
                  />
                  <div className="flex flex-1 flex-col justify-between overflow-hidden">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-ink-muted">
                        {media.category}
                      </span>
                      <h3 className="truncate font-semibold text-sm text-ink">{media.title}</h3>
                      {media.rating && (
                        <div className="mt-1 flex items-center gap-1 text-xs text-accent">
                          <Star size={12} fill="currentColor" />
                          <span>{media.rating}/10</span>
                        </div>
                      )}
                      {annotation && (
                        <p className="mt-2 text-xs italic text-ink-muted leading-relaxed line-clamp-3">
                          &ldquo;{annotation}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

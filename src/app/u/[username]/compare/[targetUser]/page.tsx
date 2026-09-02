import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPublicUserProfile } from '@/server/queries/user';
import { calculateTasteMatch } from '@/lib/tasteMatch';
import { Sparkles } from 'lucide-react';
import MediaCover from '@/components/cards/MediaCover';
import SubPageHeader from '@/components/navigation/SubPageHeader';
import { Badge, RatingBadge } from '@/components/ui/Badge';

interface PageProps {
  params: Promise<{ username: string; targetUser: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { username, targetUser } = await params;
  return {
    title: `Taste Match: @${username} vs @${targetUser} — zedarchive`,
    description: `Compare media archives and taste correlation between @${username} and @${targetUser}.`,
  };
}

export default async function CompareUsersPage({ params }: PageProps) {
  const { username, targetUser } = await params;

  const [dataA, dataB] = await Promise.all([
    getPublicUserProfile(username),
    getPublicUserProfile(targetUser),
  ]);

  if (!dataA?.user || !dataB?.user) {
    notFound();
  }

  const match = calculateTasteMatch(dataA.entries, dataB.entries);

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <SubPageHeader
        backLink={{
          href: `/u/${dataA.user.username}`,
          label: `@${dataA.user.username}`,
        }}
        breadcrumbs={[{ label: 'Taste Match' }]}
        actions={
          <Link href="/signup" className="za-button za-button--primary text-xs">
            Create Archive
          </Link>
        }
      />
      <main id="main-content" className="flex-1 py-10">
        <div className="za-container max-w-5xl">
          {/* Header diptych */}
          <div className="za-bookplate relative mb-8 p-6 text-center sm:p-8">
            <span className="za-ribbon-bookmark" aria-hidden="true" />
            <p className="mb-5 font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] uppercase tracking-[0.18em] text-accent">
              Affinity report · two private catalogs
            </p>
            <div className="grid items-center gap-3 text-center sm:grid-cols-[1fr_auto_1fr]">
              <div className="min-w-0">
                <div className="font-[var(--za-font-display)] text-[length:var(--za-text-heading-md)] font-bold uppercase tracking-[0.06em] text-ink">
                  @{dataA.user.username}
                </div>
                <div className="mt-1 font-[var(--za-font-serif-body)] text-sm italic text-ink-muted">
                  {dataA.user.name}
                </div>
              </div>
              <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-gold bg-gold/10 font-[var(--za-font-display)] text-xs font-bold uppercase tracking-[0.08em] text-gold-dark">
                VS
              </span>
              <div className="min-w-0">
                <div className="font-[var(--za-font-display)] text-[length:var(--za-text-heading-md)] font-bold uppercase tracking-[0.06em] text-ink">
                  @{dataB.user.username}
                </div>
                <div className="mt-1 font-[var(--za-font-serif-body)] text-sm italic text-ink-muted">
                  {dataB.user.name}
                </div>
              </div>
            </div>

            <h1 className="mt-7 font-[var(--za-font-display)] text-[length:var(--za-text-heading-lg)] font-[var(--za-weight-heading)] uppercase tracking-[0.04em] text-ink">
              Archive Comparison
            </h1>
            <p className="mx-auto mt-2 max-w-2xl font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] italic leading-[var(--za-leading-body)] text-ink-muted">
              A quiet measure of shared titles, shared enthusiasms, and the places your ratings
              diverge.
            </p>

            <div className="mt-7 grid grid-cols-2 gap-px overflow-hidden border border-decorative bg-decorative sm:grid-cols-3">
              <div>
                <div className="bg-surface-subtle px-3 py-4 font-[var(--za-font-mono)] text-2xl text-ink">
                  {match.sharedCount}
                </div>
                <div className="bg-surface-subtle pb-4 font-[var(--za-font-display)] text-[length:var(--za-text-fine)] font-bold uppercase tracking-[0.05em] text-ink-muted">
                  Shared Titles
                </div>
              </div>
              <div>
                <div className="bg-surface-subtle px-3 py-4 font-[var(--za-font-display)] text-2xl text-accent">
                  {match.sharedPercentage}%
                </div>
                <div className="bg-surface-subtle pb-4 font-[var(--za-font-display)] text-[length:var(--za-text-fine)] font-bold uppercase tracking-[0.05em] text-ink-muted">
                  Catalog Overlap
                </div>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <div className="bg-surface-subtle px-3 py-4 font-[var(--za-font-display)] text-2xl text-gold-dark">
                  {match.ratingSimilarity !== null ? `${match.ratingSimilarity}%` : 'N/A'}
                </div>
                <div className="bg-surface-subtle pb-4 font-[var(--za-font-display)] text-[length:var(--za-text-fine)] font-bold uppercase tracking-[0.05em] text-ink-muted">
                  Rating Agreement
                </div>
              </div>
            </div>
          </div>

          {/* Shared Masterworks */}
          {match.sharedMasterworks.length > 0 && (
            <section className="mb-8">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-gold/40 pb-3">
                <h2 className="flex items-center gap-2 font-[var(--za-font-display)] text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] uppercase tracking-[0.04em] text-ink">
                  <Sparkles size={16} className="text-gold" />
                  Shared Masterworks
                </h2>
                <span className="font-[var(--za-font-serif-body)] text-sm italic text-ink-muted">
                  both rated 9–10★
                </span>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                {match.sharedMasterworks.map((item, i) => (
                  <div
                    key={i}
                    className="za-bookplate relative flex gap-3 border-gold/50 bg-surface p-4"
                  >
                    <span className="za-ribbon-bookmark" aria-hidden="true" />
                    <MediaCover
                      title={item.title}
                      coverImage={item.coverImage}
                      category={item.category}
                    />
                    <div className="flex flex-col justify-center overflow-hidden">
                      <Badge>{item.category}</Badge>
                      <h3 className="mt-2 truncate font-[var(--za-font-editorial)] text-lg text-ink">
                        {item.title}
                      </h3>
                      <div className="mt-2 grid gap-1 font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] text-ink-muted">
                        <span>
                          @{dataA.user.username}:{' '}
                          <span className="text-gold-dark">{item.ratingA}★</span>
                        </span>
                        <span>
                          @{dataB.user.username}:{' '}
                          <span className="text-gold-dark">{item.ratingB}★</span>
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {item.ratingA != null && <RatingBadge rating={item.ratingA} />}
                        {item.ratingB != null && <RatingBadge rating={item.ratingB} />}
                      </div>
                      <span className="mt-2 font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] uppercase tracking-[0.06em] text-ink-faint">
                        {item.category}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {match.topSharedGenres.length > 0 && (
            <section className="mb-8 border-y border-decorative py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-[var(--za-font-display)] text-[length:var(--za-text-fine)] font-bold uppercase tracking-[0.08em] text-ink-muted">
                  Shared motifs
                </span>
                {match.topSharedGenres.map(({ genre, count }) => (
                  <span
                    key={genre}
                    className="rounded-full border border-decorative bg-surface-subtle px-3 py-1 font-[var(--za-font-serif-body)] text-sm italic text-ink"
                  >
                    {genre} · {count}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* All Shared Titles */}
          <section className="mb-8">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-decorative pb-3">
              <h2 className="font-[var(--za-font-display)] text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] uppercase tracking-[0.04em] text-ink">
                All Shared Titles
              </h2>
              <span className="font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] text-ink-faint">
                {match.sharedTitles.length} records
              </span>
            </div>
            <p className="mb-4 font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] italic text-ink-muted">
              The complete overlap, with each archive&apos;s rating preserved side by side.
            </p>
            {match.sharedTitles.length === 0 ? (
              <div className="za-bookplate p-10 text-center font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] italic text-ink-muted">
                No overlapping titles found between these two public archives.
              </div>
            ) : (
              <div className="za-bookplate overflow-hidden p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[38rem] border-collapse text-left text-xs">
                    <caption className="sr-only">
                      Shared titles and ratings for @{dataA.user.username} and @
                      {dataB.user.username}
                    </caption>
                    <thead>
                      <tr className="border-b border-decorative bg-surface-sunken font-[var(--za-font-display)] text-[length:var(--za-text-fine)] uppercase tracking-[0.06em] text-ink-muted">
                        <th className="p-3 font-bold">Title</th>
                        <th className="p-3 font-bold">Category</th>
                        <th className="p-3 font-bold">@{dataA.user.username}</th>
                        <th className="p-3 font-bold">@{dataB.user.username}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-decorative/40">
                      {match.sharedTitles.map((item, i) => (
                        <tr key={i} className="transition-colors hover:bg-surface-subtle/60">
                          <td className="p-3 font-[var(--za-font-editorial)] text-base text-ink">
                            {item.title}
                          </td>
                          <td className="p-3">
                            <Badge>{item.category}</Badge>
                          </td>
                          <td className="p-3 font-[var(--za-font-mono)]">
                            {item.ratingA ? (
                              <span className="text-gold-dark">{item.ratingA}★</span>
                            ) : (
                              <span className="text-ink-faint">—</span>
                            )}
                          </td>
                          <td className="p-3 font-[var(--za-font-mono)]">
                            {item.ratingB ? (
                              <span className="text-gold-dark">{item.ratingB}★</span>
                            ) : (
                              <span className="text-ink-faint">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

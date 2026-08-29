import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPublicUserProfile } from '@/server/queries/user';
import { calculateTasteMatch } from '@/lib/tasteMatch';
import { ArrowLeft, Star, Heart, Check, Users, Sparkles } from 'lucide-react';
import MediaCover from '@/components/cards/MediaCover';

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
    <div className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href={`/u/${dataA.user.username}`}
            className="flex items-center gap-1 text-xs text-ink-muted hover:text-ink"
          >
            <ArrowLeft size={14} /> Back to @{dataA.user.username}’s Archive
          </Link>
        </div>

        {/* Header diptych */}
        <div className="mb-8 rounded-control border border-required bg-surface p-6 text-center shadow-sm">
          <div className="flex items-center justify-center gap-4 text-xs text-ink-muted">
            <span className="font-semibold text-ink text-sm">@{dataA.user.username}</span>
            <span className="rounded-full bg-surface-subtle px-2 py-0.5 font-mono text-[11px]">
              VS
            </span>
            <span className="font-semibold text-ink text-sm">@{dataB.user.username}</span>
          </div>

          <h1 className="mt-3 text-2xl font-[var(--za-weight-heading)] text-ink">
            Archive Comparison & Taste Match
          </h1>

          <div className="mt-6 grid grid-cols-2 gap-4 border-t border-decorative/50 pt-4 sm:grid-cols-3">
            <div>
              <div className="text-2xl font-bold text-accent">{match.sharedCount}</div>
              <div className="text-[11px] text-ink-muted">Shared Titles</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-accent">{match.sharedPercentage}%</div>
              <div className="text-[11px] text-ink-muted">Catalog Overlap</div>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <div className="text-2xl font-bold text-accent">
                {match.ratingSimilarity !== null ? `${match.ratingSimilarity}%` : 'N/A'}
              </div>
              <div className="text-[11px] text-ink-muted">Rating Agreement</div>
            </div>
          </div>
        </div>

        {/* Shared Masterworks */}
        {match.sharedMasterworks.length > 0 && (
          <div className="mb-8">
            <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Sparkles size={16} className="text-amber-500" />
              <span>Shared Masterworks (Both Rated 9–10★)</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {match.sharedMasterworks.map((item, i) => (
                <div
                  key={i}
                  className="za-card flex gap-3 rounded-control border border-amber-500/30 bg-surface p-3"
                >
                  <MediaCover
                    title={item.title}
                    coverImage={item.coverImage}
                    category={item.category}
                  />
                  <div className="flex flex-col justify-center overflow-hidden">
                    <span className="text-[10px] uppercase tracking-wider text-ink-muted">
                      {item.category}
                    </span>
                    <h3 className="truncate font-semibold text-xs text-ink">{item.title}</h3>
                    <div className="mt-1 flex items-center gap-2 text-xs">
                      <span className="text-accent">
                        @{dataA.user.username}: {item.ratingA}★
                      </span>
                      <span className="text-accent">
                        @{dataB.user.username}: {item.ratingB}★
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All Shared Titles */}
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-ink">
            All Shared Titles ({match.sharedTitles.length})
          </h2>
          {match.sharedTitles.length === 0 ? (
            <div className="rounded-control border border-dashed border-decorative p-8 text-center text-xs text-ink-muted">
              No overlapping titles found between these two public archives.
            </div>
          ) : (
            <div className="overflow-hidden rounded-control border border-decorative bg-surface">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-decorative bg-surface-subtle text-[11px] text-ink-muted">
                    <th className="p-3">Title</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">@{dataA.user.username}</th>
                    <th className="p-3">@{dataB.user.username}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-decorative/40">
                  {match.sharedTitles.map((item, i) => (
                    <tr key={i} className="hover:bg-surface-subtle/50">
                      <td className="p-3 font-medium text-ink">{item.title}</td>
                      <td className="p-3 text-[11px] uppercase text-ink-muted">{item.category}</td>
                      <td className="p-3">
                        {item.ratingA ? (
                          <span className="text-accent font-medium">{item.ratingA}★</span>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                      <td className="p-3">
                        {item.ratingB ? (
                          <span className="text-accent font-medium">{item.ratingB}★</span>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

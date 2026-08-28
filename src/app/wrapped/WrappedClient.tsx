'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Tv,
  Film,
  BookOpen,
  Star,
  Share2,
  Check,
  ArrowLeft,
  Calendar,
  Flame,
  Award,
} from 'lucide-react';
import type { YearlyStats } from '@/lib/stats';
import { RatingBadge } from '@/components/ui/Badge';
import { getTileInitials } from '@/lib/format';

interface WrappedClientProps {
  stats: YearlyStats;
  userName: string;
  userHandle?: string | null;
  isPublicView?: boolean;
  basePath: string; // e.g. "/wrapped" or "/u/johnsmith/wrapped"
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export default function WrappedClient({
  stats,
  userName,
  userHandle,
  isPublicView = false,
  basePath,
}: WrappedClientProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const maxMonthCompletions = Math.max(1, ...stats.completionsByMonth);

  const handleShare = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (!url) return;

    if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleYearChange = (newYear: number) => {
    router.push(`${basePath}/${newYear}`);
  };

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-required bg-surface shadow-raised">
        <div className="za-container flex h-14 items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href={isPublicView && userHandle ? `/u/${userHandle}` : '/dashboard'}
              className="za-button za-button--secondary p-2 text-xs font-[var(--za-weight-heading)]"
              title="Back"
            >
              <ArrowLeft size={14} className="mr-1" />
              <span>{isPublicView ? `@${userHandle}` : 'Dashboard'}</span>
            </Link>
            <div className="flex items-center gap-1.5 font-[var(--za-weight-heading)] tracking-[-0.02em] text-ink">
              <Sparkles size={16} className="text-accent" />
              <span>ZedArchive Wrapped</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShare}
              className="za-button za-button--primary text-xs"
              title="Copy share link to clipboard"
            >
              {copied ? (
                <>
                  <Check size={14} className="mr-1 text-accent" />
                  <span>Copied Link!</span>
                </>
              ) : (
                <>
                  <Share2 size={14} className="mr-1" />
                  <span>Share</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" className="pb-16 pt-8">
        <div className="za-container max-w-[48rem]">
          {/* Year selector tabs */}
          {stats.availableYears.length > 1 && (
            <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
              {stats.availableYears.map((yr) => (
                <button
                  key={yr}
                  type="button"
                  onClick={() => handleYearChange(yr)}
                  className={`rounded-control border px-3 py-1 text-xs font-[var(--za-weight-emphasis)] transition-colors ${
                    yr === stats.year
                      ? 'border-required bg-surface font-[var(--za-weight-heading)] text-ink shadow-sm'
                      : 'border-transparent text-ink-muted hover:border-decorative hover:text-ink'
                  }`}
                >
                  {yr}
                </button>
              ))}
            </div>
          )}

          {/* Hero Zine Banner */}
          <section className="mb-8 rounded-control border border-required bg-surface p-6 text-center shadow-raised sm:p-8">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-subtle text-accent">
              <Sparkles size={24} />
            </div>
            <p className="mb-1 text-xs font-[var(--za-weight-heading)] uppercase tracking-[0.1em] text-ink-muted">
              {userName}’s {stats.year} Year in Media
            </p>
            <h1 className="text-2xl font-[var(--za-weight-heading)] tracking-[-0.03em] text-ink sm:text-4xl">
              The {stats.year} Archive Report
            </h1>
            <p className="mx-auto mt-2 max-w-[32rem] text-sm text-ink-muted">
              {stats.totalCompleted > 0
                ? `You completed ${stats.totalCompleted} titles across shows, anime, and reading lists in ${stats.year}.`
                : `No titles recorded as completed for ${stats.year}.`}
            </p>
          </section>

          {/* Highlights Grid */}
          <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="flex flex-col items-center rounded-control border border-required bg-surface p-4 text-center shadow-raised">
              <div className="text-2xl font-[var(--za-weight-heading)] text-ink sm:text-3xl">
                {stats.totalCompleted}
              </div>
              <div className="mt-1 text-xs text-ink-muted">Titles Finished</div>
            </div>

            <div className="flex flex-col items-center rounded-control border border-required bg-surface p-4 text-center shadow-raised">
              <div className="text-2xl font-[var(--za-weight-heading)] text-ink sm:text-3xl">
                {stats.episodesWatched}
              </div>
              <div className="mt-1 text-xs text-ink-muted">Episodes Watched</div>
            </div>

            <div className="flex flex-col items-center rounded-control border border-required bg-surface p-4 text-center shadow-raised">
              <div className="text-2xl font-[var(--za-weight-heading)] text-ink sm:text-3xl">
                {stats.chaptersRead}
              </div>
              <div className="mt-1 text-xs text-ink-muted">Chapters / Pages</div>
            </div>

            <div className="flex flex-col items-center rounded-control border border-required bg-surface p-4 text-center shadow-raised">
              <div className="flex items-center gap-1 text-2xl font-[var(--za-weight-heading)] text-[#b45309] sm:text-3xl">
                <Star size={20} fill="currentColor" />
                <span>{stats.avgRating}</span>
              </div>
              <div className="mt-1 text-xs text-ink-muted">Avg Rating ({stats.ratedCount})</div>
            </div>
          </div>

          {/* Category Breakdown */}
          <section className="mb-8 rounded-control border border-required bg-surface p-6 shadow-raised">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-[var(--za-weight-heading)] uppercase tracking-[0.05em] text-ink-muted">
                Category Breakdown
              </h2>
              {stats.favoriteCategory && (
                <div className="flex items-center gap-1 rounded-control bg-surface-subtle px-2 py-0.5 text-xs font-[var(--za-weight-emphasis)] text-ink">
                  <Flame size={13} className="text-accent" />
                  <span>Top Focus: {stats.favoriteCategory}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div className="rounded-control border border-decorative bg-surface-subtle p-3 text-center">
                <div className="mb-1 flex items-center justify-center gap-1 text-ink-muted">
                  <Tv size={14} />
                  <span className="text-xs">Shows</span>
                </div>
                <div className="text-lg font-[var(--za-weight-heading)] text-ink">
                  {stats.completedShows}
                </div>
              </div>

              <div className="rounded-control border border-decorative bg-surface-subtle p-3 text-center">
                <div className="mb-1 flex items-center justify-center gap-1 text-ink-muted">
                  <Film size={14} />
                  <span className="text-xs">Movies</span>
                </div>
                <div className="text-lg font-[var(--za-weight-heading)] text-ink">
                  {stats.completedMovies}
                </div>
              </div>

              <div className="rounded-control border border-decorative bg-surface-subtle p-3 text-center">
                <div className="mb-1 flex items-center justify-center gap-1 text-ink-muted">
                  <Sparkles size={14} />
                  <span className="text-xs">Anime</span>
                </div>
                <div className="text-lg font-[var(--za-weight-heading)] text-ink">
                  {stats.completedAnime}
                </div>
              </div>

              <div className="rounded-control border border-decorative bg-surface-subtle p-3 text-center">
                <div className="mb-1 flex items-center justify-center gap-1 text-ink-muted">
                  <BookOpen size={14} />
                  <span className="text-xs">Books</span>
                </div>
                <div className="text-lg font-[var(--za-weight-heading)] text-ink">
                  {stats.completedBooks}
                </div>
              </div>

              <div className="rounded-control border border-decorative bg-surface-subtle p-3 text-center">
                <div className="mb-1 flex items-center justify-center gap-1 text-ink-muted">
                  <BookOpen size={14} />
                  <span className="text-xs">Manga</span>
                </div>
                <div className="text-lg font-[var(--za-weight-heading)] text-ink">
                  {stats.completedManga}
                </div>
              </div>
            </div>
          </section>

          {/* Month Activity Bar Chart */}
          <section className="mb-8 rounded-control border border-required bg-surface p-6 shadow-raised">
            <div className="mb-4 flex items-center gap-2">
              <Calendar size={16} className="text-ink-muted" />
              <h2 className="text-sm font-[var(--za-weight-heading)] uppercase tracking-[0.05em] text-ink-muted">
                Completions by Month ({stats.year})
              </h2>
            </div>

            <div className="flex h-36 items-end gap-1.5 pt-4 sm:gap-3">
              {stats.completionsByMonth.map((count, idx) => {
                const heightPct =
                  maxMonthCompletions > 0 ? Math.round((count / maxMonthCompletions) * 100) : 0;
                return (
                  <div key={idx} className="flex flex-1 flex-col items-center gap-1.5">
                    <span className="text-[10px] text-ink-muted">{count > 0 ? count : ''}</span>
                    <div className="h-20 w-full rounded-xs bg-surface-subtle">
                      <div
                        className="w-full rounded-xs bg-accent transition-[height] duration-300"
                        style={{ height: `${Math.max(count > 0 ? 15 : 0, heightPct)}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-[var(--za-weight-emphasis)] text-ink-muted">
                      {MONTH_NAMES[idx]}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Top Rated Titles */}
          {stats.topRated.length > 0 && (
            <section className="rounded-control border border-required bg-surface p-6 shadow-raised">
              <div className="mb-4 flex items-center gap-2">
                <Award size={16} className="text-accent" />
                <h2 className="text-sm font-[var(--za-weight-heading)] uppercase tracking-[0.05em] text-ink-muted">
                  Highest Rated of {stats.year}
                </h2>
              </div>

              <div className="grid gap-2">
                {stats.topRated.map((item, i) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-control border border-decorative bg-surface-subtle px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xs bg-surface text-xs font-[var(--za-weight-heading)] text-ink-muted">
                        #{i + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-xs font-[var(--za-weight-emphasis)] text-ink">
                          {item.title}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-ink-muted">
                          {item.category}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 pl-2">
                      <RatingBadge rating={item.rating ?? 0} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

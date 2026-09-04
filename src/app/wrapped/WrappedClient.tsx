'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Tv,
  Film,
  BookOpen,
  Star,
  Share2,
  Check,
  Calendar,
  Flame,
  Award,
} from 'lucide-react';
import type { YearlyStats } from '@/lib/stats';
import { RatingBadge } from '@/components/ui/Badge';
import SubPageHeader from '@/components/navigation/SubPageHeader';

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
  isPublicView,
  basePath,
}: WrappedClientProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const maxMonthCompletions = Math.max(1, ...stats.completionsByMonth);
  const categoryBreakdown = [
    { label: 'Shows', count: stats.completedShows, Icon: Tv, tone: 'bg-success' },
    { label: 'Movies', count: stats.completedMovies, Icon: Film, tone: 'bg-accent' },
    { label: 'Anime', count: stats.completedAnime, Icon: Sparkles, tone: 'bg-gold' },
    { label: 'Books', count: stats.completedBooks, Icon: BookOpen, tone: 'bg-success' },
    { label: 'Manga', count: stats.completedManga, Icon: BookOpen, tone: 'bg-accent' },
  ];
  const maxCategoryCount = Math.max(1, ...categoryBreakdown.map((category) => category.count));

  const handleShare = async () => {
    try {
      const url = window.location.href;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleYearChange = (newYear: number) => {
    router.push(`${basePath}/${newYear}`);
  };

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* Top Header */}
      <SubPageHeader
        variant="sticky"
        backLink={{
          href: isPublicView && userHandle ? `/u/${userHandle}` : '/dashboard',
          label: isPublicView ? `@${userHandle}` : 'Dashboard',
        }}
        actions={
          <button
            type="button"
            onClick={handleShare}
            className="za-button za-button--primary text-xs shrink-0"
            title="Copy share link to clipboard"
            aria-label="Copy share link"
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
        }
      >
        <div className="flex min-w-0 items-center gap-1.5 font-[var(--za-font-display)] text-xs font-bold uppercase tracking-[0.08em] text-ink">
          <Sparkles size={16} className="shrink-0 text-gold" />
          <span className="min-w-0 [overflow-wrap:anywhere]">ZedArchive Wrapped</span>
        </div>
      </SubPageHeader>

      {/* Main Content */}
      <main id="main-content" className="pb-16 pt-10">
        <div className="za-container max-w-5xl">
          {/* Year selector tabs */}
          {stats.availableYears.length > 1 && (
            <div className="mb-6 flex flex-wrap items-center justify-center gap-2 border-b border-decorative pb-4">
              <span className="mr-1 font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] uppercase tracking-[0.12em] text-ink-faint">
                Editions
              </span>
              {stats.availableYears.map((yr) => (
                <button
                  key={yr}
                  type="button"
                  onClick={() => handleYearChange(yr)}
                  className={`min-h-[var(--za-control-min-block-size)] rounded-full border px-3 py-1 font-[var(--za-font-display)] text-[length:var(--za-text-fine)] font-bold uppercase tracking-[0.06em] transition-colors ${
                    yr === stats.year
                      ? 'border-accent bg-accent text-on-accent shadow-sm'
                      : 'border-decorative bg-surface text-ink-muted hover:border-required hover:bg-surface-subtle hover:text-ink'
                  }`}
                >
                  {yr}
                </button>
              ))}
            </div>
          )}

          {/* Illuminated annual masthead */}
          <section className="za-bookplate relative mb-8 overflow-hidden p-6 text-center sm:p-10">
            <span className="za-ribbon-bookmark" aria-hidden="true" />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-3 -top-8 font-[var(--za-font-display)] text-[clamp(8rem,24vw,15rem)] font-bold leading-none text-gold/10"
            >
              {stats.year}
            </div>
            <p className="relative mb-3 font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] uppercase tracking-[0.18em] text-accent">
              Annual retrospective · {userName}
            </p>
            <div className="relative mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-gold bg-gold/10 text-gold">
              <Sparkles size={22} />
            </div>
            <p className="relative mb-1 font-[var(--za-font-display)] text-[length:var(--za-text-fine)] font-bold uppercase tracking-[0.1em] text-ink-muted">
              {userName}’s {stats.year} Year in Media
            </p>
            <h1 className="relative font-[var(--za-font-display)] text-[length:var(--za-text-heading-lg)] font-[var(--za-weight-heading)] uppercase tracking-[0.04em] text-ink sm:text-4xl">
              The {stats.year} Archive Report
            </h1>
            <p className="relative mx-auto mt-3 max-w-[36rem] font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] italic leading-[var(--za-leading-body)] text-ink-muted">
              {stats.totalCompleted > 0
                ? `You completed ${stats.totalCompleted} titles across shows, anime, and reading lists in ${stats.year}.`
                : `No titles recorded as completed for ${stats.year}.`}
            </p>
          </section>

          {/* Highlights Grid */}
          <div className="mb-8 grid grid-cols-2 gap-px overflow-hidden border border-decorative bg-decorative sm:grid-cols-4">
            <div className="flex flex-col items-center bg-surface-subtle p-4 text-center">
              <div className="font-[var(--za-font-mono)] text-2xl text-ink sm:text-3xl">
                {stats.totalCompleted}
              </div>
              <div className="mt-1 font-[var(--za-font-display)] text-[length:var(--za-text-fine)] font-bold uppercase tracking-[0.04em] text-ink-muted">
                Titles Finished
              </div>
            </div>

            <div className="flex flex-col items-center bg-surface-subtle p-4 text-center">
              <div className="font-[var(--za-font-mono)] text-2xl text-ink sm:text-3xl">
                {stats.episodesWatched}
              </div>
              <div className="mt-1 font-[var(--za-font-display)] text-[length:var(--za-text-fine)] font-bold uppercase tracking-[0.04em] text-ink-muted">
                Episodes Watched
              </div>
            </div>

            <div className="flex flex-col items-center bg-surface-subtle p-4 text-center">
              <div className="font-[var(--za-font-mono)] text-2xl text-ink sm:text-3xl">
                {stats.chaptersRead}
              </div>
              <div className="mt-1 font-[var(--za-font-display)] text-[length:var(--za-text-fine)] font-bold uppercase tracking-[0.04em] text-ink-muted">
                Chapters / Pages
              </div>
            </div>

            <div className="flex flex-col items-center bg-surface-subtle p-4 text-center">
              <div className="za-gold-stamp flex items-center gap-1 font-[var(--za-font-mono)] text-2xl sm:text-3xl">
                <Star size={20} fill="currentColor" />
                <span>{stats.avgRating}</span>
              </div>
              <div className="mt-1 font-[var(--za-font-display)] text-[length:var(--za-text-fine)] font-bold uppercase tracking-[0.04em] text-ink-muted">
                Avg Rating ({stats.ratedCount})
              </div>
            </div>
          </div>

          {/* Category Breakdown */}
          <section className="za-bookplate mb-8 p-6 sm:p-7">
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2 border-b border-decorative pb-3">
              <h2 className="font-[var(--za-font-display)] text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] uppercase tracking-[0.04em] text-ink">
                Category Breakdown
              </h2>
              {stats.favoriteCategory && (
                <div className="flex items-center gap-1 font-[var(--za-font-serif-body)] text-sm italic text-ink-muted">
                  <Flame size={13} className="text-accent" aria-hidden="true" />
                  <span>Top focus: {stats.favoriteCategory}</span>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {categoryBreakdown.map(({ label, count, Icon, tone }) => {
                const width = Math.round((count / maxCategoryCount) * 100);
                return (
                  <div key={label}>
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] text-ink">
                        <Icon size={14} className="text-ink-muted" aria-hidden="true" />
                        {label}
                      </span>
                      <span className="font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] text-ink-muted">
                        {count}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                      <div
                        className={`h-full rounded-full ${tone} transition-[width] duration-300`}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Month Activity Bar Chart */}
          <section className="za-bookplate mb-8 p-6 sm:p-7">
            <div className="mb-5 flex items-center gap-2 border-b border-decorative pb-3">
              <Calendar size={16} className="text-accent" aria-hidden="true" />
              <h2 className="font-[var(--za-font-display)] text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] uppercase tracking-[0.04em] text-ink">
                Completions by Month ({stats.year})
              </h2>
            </div>

            <div className="flex h-44 items-end gap-1.5 pt-4 sm:gap-3">
              {stats.completionsByMonth.map((count, idx) => {
                const heightPct =
                  maxMonthCompletions > 0 ? Math.round((count / maxMonthCompletions) * 100) : 0;
                return (
                  <div key={idx} className="flex flex-1 flex-col items-center gap-2">
                    <span className="font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] text-ink-muted">
                      {count > 0 ? count : ''}
                    </span>
                    <div className="h-24 w-full rounded-xs bg-surface-sunken">
                      <div
                        className={`w-full rounded-xs transition-[height] duration-300 ${
                          count === maxMonthCompletions && count > 0 ? 'bg-gold' : 'bg-accent'
                        }`}
                        style={{ height: `${Math.max(count > 0 ? 15 : 0, heightPct)}%` }}
                      />
                    </div>
                    <span className="font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] uppercase text-ink-muted">
                      {MONTH_NAMES[idx]}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Top Rated Titles */}
          {stats.topRated.length > 0 && (
            <section className="za-bookplate p-6 sm:p-7">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-gold/40 pb-3">
                <div className="flex items-center gap-2">
                  <Award size={16} className="text-gold" aria-hidden="true" />
                  <h2 className="font-[var(--za-font-display)] text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] uppercase tracking-[0.04em] text-ink">
                    Hall of Fame
                  </h2>
                </div>
                <span className="font-[var(--za-font-serif-body)] text-sm italic text-ink-muted">
                  Highest rated of {stats.year}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {stats.topRated.map((item, i) => (
                  <div
                    key={item.id}
                    className="relative flex items-center justify-between gap-3 border border-gold/40 bg-gold/10 px-3 py-3"
                  >
                    <span className="za-gold-stamp absolute -left-2 -top-2 h-6 w-6 items-center justify-center rounded-full border border-gold bg-surface font-[var(--za-font-mono)] text-[length:var(--za-text-fine)]">
                      {i + 1}
                    </span>
                    <div className="flex min-w-0 items-center gap-3 pl-2">
                      <div className="min-w-0">
                        <div className="truncate font-[var(--za-font-editorial)] text-lg text-ink">
                          {item.title}
                        </div>
                        <div className="mt-0.5 font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] uppercase tracking-[0.05em] text-ink-muted">
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

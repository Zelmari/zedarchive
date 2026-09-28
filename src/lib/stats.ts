import type { MediaEntry } from '@/types/media';
import type { ReadingGoalConfig } from '@/types/user';
import {
  describeWrappedRange,
  getWrappedPeriodOption,
  isWithinWrappedRange,
  resolveWrappedRange,
  tallyWrappedBuckets,
  type WrappedBuckets,
  type WrappedPeriod,
  type WrappedRange,
} from '@/lib/wrapped-period';

export interface ArchiveStats {
  totalEntries: number;
  completedCount: number;
  inProgressCount: number;
  planningCount: number;
  onHoldCount: number;
  droppedCount: number;
  showCount: number;
  movieCount: number;
  animeCount: number;
  bookCount: number;
  mangaCount: number;
  totalEpisodes: number;
  totalChapters: number;
  totalMovieMinutes: number;
  avgRating: string;
  completionRate: number;
  ratedCount: number;
  topRated: MediaEntry[];
}

export interface YearlyStats {
  year: number;
  totalCompleted: number;
  completedShows: number;
  completedMovies: number;
  completedAnime: number;
  completedBooks: number;
  completedManga: number;
  episodesWatched: number;
  chaptersRead: number;
  movieMinutesWatched: number;
  avgRating: string;
  ratedCount: number;
  topRated: MediaEntry[];
  completionsByMonth: number[]; // 12 numbers, 0-indexed (Jan = 0)
  availableYears: number[];
  favoriteCategory: string | null;
}

export interface WrappedStats {
  period: WrappedPeriod;
  year: number;
  periodLabel: string;
  rangeLabel: string;
  rangeStart: string;
  rangeEnd: string;
  totalCompleted: number;
  completedShows: number;
  completedMovies: number;
  completedAnime: number;
  completedBooks: number;
  completedManga: number;
  episodesWatched: number;
  chaptersRead: number;
  movieMinutesWatched: number;
  avgRating: string;
  ratedCount: number;
  topRated: MediaEntry[];
  buckets: WrappedBuckets;
  availableYears: number[];
  favoriteCategory: string | null;
}

interface RatingSummary {
  avgRating: string;
  ratedCount: number;
  topRated: MediaEntry[];
}

function ratingSummary(entries: MediaEntry[]): RatingSummary {
  const ratedEntries = entries.filter((e) => e.rating != null && e.rating > 0);
  const avgRating =
    ratedEntries.length > 0
      ? (ratedEntries.reduce((sum, e) => sum + (e.rating ?? 0), 0) / ratedEntries.length).toFixed(1)
      : '—';

  const topRated = [...ratedEntries].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 5);

  return { avgRating, ratedCount: ratedEntries.length, topRated };
}

export function calculateArchiveStats(entries: MediaEntry[]): ArchiveStats {
  const totalEntries = entries.length;
  const showEntries = entries.filter((e) => e.category === 'show');
  const movieEntries = entries.filter((e) => e.category === 'movie');
  const animeEntries = entries.filter((e) => e.category === 'anime');
  const bookEntries = entries.filter((e) => e.category === 'book');
  const mangaEntries = entries.filter((e) => e.category === 'manga');

  const completedEntries = entries.filter((e) => e.status === 'completed');
  const inProgressEntries = entries.filter((e) => !e.status || e.status === 'in_progress');
  const planningEntries = entries.filter((e) => e.status === 'planning');
  const onHoldEntries = entries.filter((e) => e.status === 'on_hold');
  const droppedEntries = entries.filter((e) => e.status === 'dropped');

  const totalEpisodes = entries
    .filter((e) => e.category === 'show' || e.category === 'anime')
    .reduce((sum, e) => sum + (e.secondaryUnitCurrent || 0), 0);

  const totalChapters = entries
    .filter((e) => e.category === 'book' || e.category === 'manga')
    .reduce((sum, e) => sum + (e.secondaryUnitCurrent || 0), 0);

  const totalMovieMinutes = movieEntries.reduce((sum, e) => sum + (e.secondaryUnitCurrent ?? 0), 0);

  const { avgRating, ratedCount, topRated } = ratingSummary(entries);

  const completionRate =
    totalEntries > 0 ? Math.round((completedEntries.length / totalEntries) * 100) : 0;

  return {
    totalEntries,
    completedCount: completedEntries.length,
    inProgressCount: inProgressEntries.length,
    planningCount: planningEntries.length,
    onHoldCount: onHoldEntries.length,
    droppedCount: droppedEntries.length,
    showCount: showEntries.length,
    movieCount: movieEntries.length,
    animeCount: animeEntries.length,
    bookCount: bookEntries.length,
    mangaCount: mangaEntries.length,
    totalEpisodes,
    totalChapters,
    totalMovieMinutes,
    avgRating,
    completionRate,
    ratedCount,
    topRated,
  };
}

export function extractEntryYear(entry: MediaEntry): number | null {
  const dateStr = entry.completedAt;
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const y = d.getFullYear();
  return isNaN(y) ? null : y;
}

function yearsForEntry(entry: MediaEntry): Set<number> {
  const years = new Set<number>();
  const add = (value: string | null | undefined) => {
    if (!value) return;
    const y = new Date(value).getFullYear();
    if (!isNaN(y) && y >= 2000) years.add(y);
  };
  add(entry.completedAt);
  for (const cycle of entry.cycles ?? []) {
    add(cycle.completedAt);
  }
  return years;
}

// The first completion inside `range` speaks for the entry, so a rewatched entry counts once.
function inRangeCompletionDate(entry: MediaEntry, range: WrappedRange): string | null {
  const dates = [entry.completedAt, ...(entry.cycles ?? []).map((cycle) => cycle.completedAt)];
  for (const dateStr of dates) {
    if (!dateStr) continue;
    const date = new Date(dateStr);
    if (date.getFullYear() < 2000) continue;
    if (isWithinWrappedRange(date, range)) return dateStr;
  }
  return null;
}

export function getAvailableYears(entries: MediaEntry[]): number[] {
  const yearsSet = new Set<number>();
  const currentYear = new Date().getFullYear();
  yearsSet.add(currentYear);

  for (const entry of entries) {
    for (const y of yearsForEntry(entry)) {
      if (y >= 2000 && y <= currentYear + 1) {
        yearsSet.add(y);
      }
    }
  }

  return Array.from(yearsSet).sort((a, b) => b - a);
}

type RangeAggregate = Omit<
  WrappedStats,
  'year' | 'period' | 'periodLabel' | 'rangeLabel' | 'rangeStart' | 'rangeEnd' | 'buckets'
> & {
  /** One representative completion date per in-scope entry, in entry order. */
  completionDates: string[];
};

function aggregate(
  entries: MediaEntry[],
  range: WrappedRange,
  availableYears: number[],
): RangeAggregate {
  const completionDates: string[] = [];
  const completedInRange: MediaEntry[] = [];

  let completedShows = 0;
  let completedMovies = 0;
  let completedAnime = 0;
  let completedBooks = 0;
  let completedManga = 0;

  let episodesWatched = 0;
  let chaptersRead = 0;
  let movieMinutesWatched = 0;

  for (const entry of entries) {
    const dateStr = inRangeCompletionDate(entry, range);
    if (!dateStr) continue;

    completedInRange.push(entry);
    completionDates.push(dateStr);

    if (entry.category === 'show') completedShows++;
    else if (entry.category === 'movie') {
      completedMovies++;
      movieMinutesWatched += entry.secondaryUnitCurrent ?? 0;
    } else if (entry.category === 'anime') completedAnime++;
    else if (entry.category === 'book') completedBooks++;
    else if (entry.category === 'manga') completedManga++;

    if (entry.category === 'show' || entry.category === 'anime') {
      episodesWatched += entry.secondaryUnitCurrent ?? 0;
    } else if (entry.category === 'book' || entry.category === 'manga') {
      chaptersRead += entry.secondaryUnitCurrent ?? 0;
    }
  }

  const { avgRating, ratedCount, topRated } = ratingSummary(completedInRange);

  const categoryTotals: Record<string, number> = {
    Shows: completedShows,
    Movies: completedMovies,
    Anime: completedAnime,
    Books: completedBooks,
    Manga: completedManga,
  };

  let maxCategory: string | null = null;
  let maxCount = 0;
  for (const [cat, count] of Object.entries(categoryTotals)) {
    if (count > maxCount) {
      maxCount = count;
      maxCategory = cat;
    }
  }

  return {
    totalCompleted: completedInRange.length,
    completedShows,
    completedMovies,
    completedAnime,
    completedBooks,
    completedManga,
    episodesWatched,
    chaptersRead,
    movieMinutesWatched,
    avgRating,
    ratedCount,
    topRated,
    completionDates,
    availableYears,
    favoriteCategory: maxCategory,
  };
}

function calendarYearRange(year: number): WrappedRange {
  return {
    start: new Date(year, 0, 1, 0, 0, 0, 0),
    end: new Date(year, 11, 31, 23, 59, 59, 999),
  };
}

export function calculateYearlyStats(entries: MediaEntry[], year: number): YearlyStats {
  const availableYears = getAvailableYears(entries);
  const { completionDates, ...totals } = aggregate(
    entries,
    calendarYearRange(year),
    availableYears,
  );

  // Not `tallyWrappedBuckets`: that axis trails the range start month, while this
  // shape is pinned to calendar months.
  const completionsByMonth = new Array<number>(12).fill(0);
  for (const dateStr of completionDates) {
    const month = new Date(dateStr).getMonth();
    if (month >= 0 && month < 12) {
      completionsByMonth[month] = (completionsByMonth[month] ?? 0) + 1;
    }
  }

  return {
    year,
    ...totals,
    completionsByMonth,
  };
}

export function calculateWrappedStats(
  entries: MediaEntry[],
  year: number,
  period: WrappedPeriod,
  now?: Date,
): WrappedStats {
  const availableYears = getAvailableYears(entries);
  const range = resolveWrappedRange(period, year, now);
  const { completionDates, ...totals } = aggregate(entries, range, availableYears);

  return {
    ...totals,
    year,
    period,
    periodLabel: getWrappedPeriodOption(period).label,
    rangeLabel: describeWrappedRange(range),
    rangeStart: range.start.toISOString(),
    rangeEnd: range.end.toISOString(),
    buckets: tallyWrappedBuckets(completionDates, range, period),
  };
}

export interface ReadingGoalProgress {
  year: number;
  annualTarget: number;
  completedCount: number;
  percentage: number;
  expectedCount: number;
  paceDiff: number;
  status: 'ahead' | 'on_track' | 'behind';
  daysRemainingInYear: number;
  projectedFinishCount: number;
}

export function calculateReadingGoalProgress(
  entries: MediaEntry[],
  goalConfig: ReadingGoalConfig,
  referenceDate = new Date(),
): ReadingGoalProgress {
  const currentYear = goalConfig.year;
  const startOfYear = new Date(currentYear, 0, 1).getTime();
  const startOfNextYear = new Date(currentYear + 1, 0, 1).getTime();
  const nowTime = Math.min(startOfNextYear - 1, Math.max(startOfYear, referenceDate.getTime()));

  // Completed books/manga in target year
  const completedBooks = entries.filter((e) => {
    if (e.category !== 'book' && e.category !== 'manga') return false;
    if (e.status !== 'completed') return false;
    const dateStr = e.completedAt || e.updatedAt || e.createdAt;
    if (!dateStr) return false;
    return new Date(dateStr).getFullYear() === currentYear;
  });

  const completedCount = completedBooks.length;
  const target = Math.max(1, goalConfig.annualTarget);
  const percentage = Math.round((completedCount / target) * 100);

  const yearLength = startOfNextYear - startOfYear;
  const yearFraction = (nowTime - startOfYear) / yearLength;
  const expectedCount = Math.round(yearFraction * target * 10) / 10;
  const paceDiff = Math.round((completedCount - expectedCount) * 10) / 10;

  const status: 'ahead' | 'on_track' | 'behind' =
    paceDiff >= 1 ? 'ahead' : paceDiff <= -1 ? 'behind' : 'on_track';
  const totalDaysInYear = yearLength / (1000 * 60 * 60 * 24);
  const daysPassed = (nowTime - startOfYear) / (1000 * 60 * 60 * 24);
  const daysRemainingInYear = Math.max(0, Math.ceil(totalDaysInYear - daysPassed));
  const projectedFinishCount =
    daysPassed > 0 ? Math.round((completedCount / daysPassed) * totalDaysInYear) : completedCount;

  return {
    year: currentYear,
    annualTarget: target,
    completedCount,
    percentage,
    expectedCount,
    paceDiff,
    status,
    daysRemainingInYear,
    projectedFinishCount,
  };
}

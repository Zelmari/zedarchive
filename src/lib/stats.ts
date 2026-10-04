import type { MediaEntry } from '@/types/media';
import type { ReadingGoalConfig } from '@/types/user';

interface ArchiveStats {
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

interface ReadingGoalProgress {
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

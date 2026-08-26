import type { MediaEntry } from '@/types/media';

export interface ArchiveStats {
  totalEntries: number;
  completedCount: number;
  inProgressCount: number;
  planningCount: number;
  onHoldCount: number;
  droppedCount: number;
  showCount: number;
  animeCount: number;
  bookCount: number;
  mangaCount: number;
  totalEpisodes: number;
  totalChapters: number;
  avgRating: string;
  completionRate: number;
  ratedCount: number;
  topRated: MediaEntry[];
}

export interface YearlyStats {
  year: number;
  totalCompleted: number;
  completedShows: number;
  completedAnime: number;
  completedBooks: number;
  completedManga: number;
  episodesWatched: number;
  chaptersRead: number;
  avgRating: string;
  ratedCount: number;
  topRated: MediaEntry[];
  completionsByMonth: number[]; // 12 numbers, 0-indexed (Jan = 0)
  availableYears: number[];
  favoriteCategory: string | null;
}

export function calculateArchiveStats(entries: MediaEntry[]): ArchiveStats {
  const totalEntries = entries.length;
  const showEntries = entries.filter((e) => e.category === 'show');
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

  const ratedEntries = entries.filter((e) => e.rating != null && e.rating > 0);
  const avgRating =
    ratedEntries.length > 0
      ? (ratedEntries.reduce((sum, e) => sum + (e.rating ?? 0), 0) / ratedEntries.length).toFixed(1)
      : '—';

  const completionRate =
    totalEntries > 0 ? Math.round((completedEntries.length / totalEntries) * 100) : 0;

  const topRated = [...ratedEntries].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 5);

  return {
    totalEntries,
    completedCount: completedEntries.length,
    inProgressCount: inProgressEntries.length,
    planningCount: planningEntries.length,
    onHoldCount: onHoldEntries.length,
    droppedCount: droppedEntries.length,
    showCount: showEntries.length,
    animeCount: animeEntries.length,
    bookCount: bookEntries.length,
    mangaCount: mangaEntries.length,
    totalEpisodes,
    totalChapters,
    avgRating,
    completionRate,
    ratedCount: ratedEntries.length,
    topRated,
  };
}

export function extractEntryYear(entry: MediaEntry): number | null {
  const dateStr = entry.completedAt || entry.updatedAt || entry.createdAt;
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const y = d.getFullYear();
  return isNaN(y) ? null : y;
}

export function getAvailableYears(entries: MediaEntry[]): number[] {
  const yearsSet = new Set<number>();
  const currentYear = new Date().getFullYear();
  yearsSet.add(currentYear);

  for (const entry of entries) {
    const y = extractEntryYear(entry);
    if (y && y >= 2000 && y <= currentYear + 1) {
      yearsSet.add(y);
    }
  }

  return Array.from(yearsSet).sort((a, b) => b - a);
}

export function calculateYearlyStats(entries: MediaEntry[], year: number): YearlyStats {
  const availableYears = getAvailableYears(entries);

  // Entries completed in this year
  const completedInYear = entries.filter((e) => {
    if (e.status !== 'completed') return false;
    const dateStr = e.completedAt || e.updatedAt || e.createdAt;
    if (!dateStr) return false;
    return new Date(dateStr).getFullYear() === year;
  });

  // Category counts
  let completedShows = 0;
  let completedAnime = 0;
  let completedBooks = 0;
  let completedManga = 0;

  let episodesWatched = 0;
  let chaptersRead = 0;

  const completionsByMonth = new Array<number>(12).fill(0);

  for (const entry of completedInYear) {
    if (entry.category === 'show') completedShows++;
    else if (entry.category === 'anime') completedAnime++;
    else if (entry.category === 'book') completedBooks++;
    else if (entry.category === 'manga') completedManga++;

    if (entry.category === 'show' || entry.category === 'anime') {
      episodesWatched += entry.secondaryUnitCurrent || entry.secondaryUnitTotal || 0;
    } else {
      chaptersRead += entry.secondaryUnitCurrent || entry.secondaryUnitTotal || 0;
    }

    const dateStr = entry.completedAt || entry.updatedAt || entry.createdAt;
    if (dateStr) {
      const month = new Date(dateStr).getMonth();
      if (month >= 0 && month < 12) {
        completionsByMonth[month] = (completionsByMonth[month] ?? 0) + 1;
      }
    }
  }

  const ratedInYear = completedInYear.filter((e) => e.rating != null && e.rating > 0);
  const avgRating =
    ratedInYear.length > 0
      ? (ratedInYear.reduce((sum, e) => sum + (e.rating ?? 0), 0) / ratedInYear.length).toFixed(1)
      : '—';

  const topRated = [...ratedInYear].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 5);

  const categoryTotals: Record<string, number> = {
    Shows: completedShows,
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
    year,
    totalCompleted: completedInYear.length,
    completedShows,
    completedAnime,
    completedBooks,
    completedManga,
    episodesWatched,
    chaptersRead,
    avgRating,
    ratedCount: ratedInYear.length,
    topRated,
    completionsByMonth,
    availableYears,
    favoriteCategory: maxCategory,
  };
}

import { describe, it, expect } from 'vitest';
import { calculateArchiveStats, calculateYearlyStats, getAvailableYears } from '@/lib/stats';
import type { MediaEntry } from '@/types/media';

const sampleEntries: MediaEntry[] = [
  {
    id: '1',
    userId: 'u1',
    title: "Frieren: Beyond Journey's End",
    category: 'anime',
    status: 'completed',
    primaryUnitCurrent: 1,
    primaryUnitTotal: 1,
    secondaryUnitCurrent: 28,
    secondaryUnitTotal: 28,
    structure: [],
    completedAt: '2026-03-15T12:00:00.000Z',
    startedAt: '2026-01-01T00:00:00.000Z',
    rewatchCount: 0,
    rating: 10,
    tags: ['fantasy'],
    genres: ['Adventure'],
    synopsis: null,
    coverImage: null,
    sourceId: null,
    notes: 'Masterpiece',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-03-15T12:00:00.000Z',
  },
  {
    id: '2',
    userId: 'u1',
    title: 'Severance',
    category: 'show',
    status: 'completed',
    primaryUnitCurrent: 1,
    primaryUnitTotal: 1,
    secondaryUnitCurrent: 9,
    secondaryUnitTotal: 9,
    structure: [],
    completedAt: '2026-04-10T12:00:00.000Z',
    startedAt: null,
    rewatchCount: 0,
    rating: 9,
    tags: [],
    genres: [],
    synopsis: null,
    coverImage: null,
    sourceId: null,
    notes: null,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-10T12:00:00.000Z',
  },
  {
    id: '3',
    userId: 'u1',
    title: 'Dune',
    category: 'book',
    status: 'in_progress',
    primaryUnitCurrent: 1,
    primaryUnitTotal: 1,
    secondaryUnitCurrent: 350,
    secondaryUnitTotal: 600,
    structure: [],
    completedAt: null,
    startedAt: '2026-05-01T00:00:00.000Z',
    rewatchCount: 0,
    rating: null,
    tags: [],
    genres: [],
    synopsis: null,
    coverImage: null,
    sourceId: null,
    notes: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-15T00:00:00.000Z',
  },
  {
    id: '4',
    userId: 'u1',
    title: 'Berserk',
    category: 'manga',
    status: 'completed',
    primaryUnitCurrent: 1,
    primaryUnitTotal: 1,
    secondaryUnitCurrent: 364,
    secondaryUnitTotal: 364,
    structure: [],
    completedAt: '2025-11-20T12:00:00.000Z',
    startedAt: null,
    rewatchCount: 0,
    rating: 10,
    tags: [],
    genres: [],
    synopsis: null,
    coverImage: null,
    sourceId: null,
    notes: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-11-20T12:00:00.000Z',
  },
];

describe('calculateArchiveStats', () => {
  it('aggregates total counts, category breakdowns, and ratings accurately', () => {
    const stats = calculateArchiveStats(sampleEntries);

    expect(stats.totalEntries).toBe(4);
    expect(stats.completedCount).toBe(3);
    expect(stats.inProgressCount).toBe(1);
    expect(stats.showCount).toBe(1);
    expect(stats.animeCount).toBe(1);
    expect(stats.bookCount).toBe(1);
    expect(stats.mangaCount).toBe(1);
    expect(stats.totalEpisodes).toBe(37); // 28 + 9
    expect(stats.totalChapters).toBe(714); // 350 + 364
    expect(stats.avgRating).toBe('9.7'); // (10 + 9 + 10) / 3 = 9.666... -> 9.7
    expect(stats.completionRate).toBe(75); // 3/4 = 75%
    expect(stats.topRated).toHaveLength(3);
  });
});

describe('calculateYearlyStats', () => {
  it('filters and computes annual report for 2026', () => {
    const yearly = calculateYearlyStats(sampleEntries, 2026);

    expect(yearly.year).toBe(2026);
    expect(yearly.totalCompleted).toBe(2);
    expect(yearly.completedAnime).toBe(1);
    expect(yearly.completedShows).toBe(1);
    expect(yearly.completedBooks).toBe(0);
    expect(yearly.episodesWatched).toBe(37); // 28 + 9
    expect(yearly.avgRating).toBe('9.5'); // (10 + 9) / 2
    expect(yearly.completionsByMonth[2]).toBe(1); // March
    expect(yearly.completionsByMonth[3]).toBe(1); // April
  });

  it('filters and computes annual report for 2025', () => {
    const yearly = calculateYearlyStats(sampleEntries, 2025);

    expect(yearly.year).toBe(2025);
    expect(yearly.totalCompleted).toBe(1);
    expect(yearly.completedManga).toBe(1);
    expect(yearly.chaptersRead).toBe(364);
    expect(yearly.avgRating).toBe('10.0');
    expect(yearly.completionsByMonth[10]).toBe(1); // November
  });

  it('computes available years list sorted descending', () => {
    const years = getAvailableYears(sampleEntries);
    expect(years).toContain(2026);
    expect(years).toContain(2025);
    expect(years[0]).toBeGreaterThanOrEqual(years[1] ?? 0);
  });
});

import { describe, it, expect } from 'vitest';
import {
  calculateArchiveStats,
  calculateYearlyStats,
  getAvailableYears,
  calculateReadingGoalProgress,
} from '@/lib/stats';
import type { MediaEntry } from '@/types/media';

function makeEntry(overrides: Partial<MediaEntry> = {}): MediaEntry {
  return {
    id: 'default',
    userId: 'u1',
    title: 'Untitled',
    category: 'book',
    status: 'planning',
    dropReason: null,
    droppedAt: null,
    droppedProgressPrimary: null,
    droppedProgressSecondary: null,
    priorityIndex: null,
    cycles: [],
    primaryUnitCurrent: 1,
    primaryUnitTotal: 1,
    secondaryUnitCurrent: 0,
    secondaryUnitTotal: 0,
    structure: [],
    completedAt: null,
    startedAt: null,
    rewatchCount: 0,
    rating: null,
    tags: [],
    genres: [],
    synopsis: null,
    coverImage: null,
    sourceId: null,
    notes: null,
    quotes: [],
    isPrivate: false,
    groupId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const sampleEntries: MediaEntry[] = [
  makeEntry({
    id: '1',
    title: "Frieren: Beyond Journey's End",
    category: 'anime',
    status: 'completed',
    secondaryUnitCurrent: 28,
    secondaryUnitTotal: 28,
    completedAt: '2026-03-15T12:00:00.000Z',
    startedAt: '2026-01-01T00:00:00.000Z',
    rating: 10,
    tags: ['fantasy'],
    genres: ['Adventure'],
    notes: 'Masterpiece',
  }),
  makeEntry({
    id: '2',
    title: 'Severance',
    category: 'show',
    status: 'completed',
    secondaryUnitCurrent: 9,
    secondaryUnitTotal: 9,
    completedAt: '2026-04-10T12:00:00.000Z',
    rating: 9,
    updatedAt: '2026-04-10T12:00:00.000Z',
  }),
  makeEntry({
    id: '3',
    title: 'Dune',
    category: 'book',
    status: 'in_progress',
    secondaryUnitCurrent: 350,
    secondaryUnitTotal: 600,
    startedAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-15T00:00:00.000Z',
  }),
  makeEntry({
    id: '4',
    title: 'Berserk',
    category: 'manga',
    status: 'completed',
    secondaryUnitCurrent: 364,
    secondaryUnitTotal: 364,
    completedAt: '2025-11-20T12:00:00.000Z',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-11-20T12:00:00.000Z',
    rating: 10,
  }),
  makeEntry({
    id: '5',
    title: 'Inception',
    category: 'movie',
    status: 'completed',
    primaryUnitCurrent: 2,
    secondaryUnitCurrent: 148,
    secondaryUnitTotal: 148,
    completedAt: '2026-06-15T12:00:00.000Z',
    rewatchCount: 1,
    rating: 9,
    tags: ['sci-fi'],
    genres: ['Action', 'Sci-Fi'],
    sourceId: 'tmdb-27205',
    updatedAt: '2026-06-15T12:00:00.000Z',
  }),
];

describe('calculateArchiveStats', () => {
  it('aggregates total counts, category breakdowns, and ratings accurately', () => {
    const stats = calculateArchiveStats(sampleEntries);

    expect(stats.totalEntries).toBe(5);
    expect(stats.completedCount).toBe(4);
    expect(stats.inProgressCount).toBe(1);
    expect(stats.showCount).toBe(1);
    expect(stats.movieCount).toBe(1);
    expect(stats.animeCount).toBe(1);
    expect(stats.bookCount).toBe(1);
    expect(stats.mangaCount).toBe(1);
    expect(stats.totalEpisodes).toBe(37); // 28 + 9
    expect(stats.totalChapters).toBe(714); // 350 + 364
    expect(stats.totalMovieMinutes).toBe(148);
    expect(stats.avgRating).toBe('9.5'); // (10 + 9 + 10 + 9) / 4 = 9.5
    expect(stats.completionRate).toBe(80); // 4/5 = 80%
    expect(stats.topRated).toHaveLength(4);
  });

  it('preserves progress units from dropped titles in cumulative consumption counts', () => {
    const withDropped: MediaEntry[] = [
      ...sampleEntries,
      makeEntry({
        id: '6',
        title: 'Dropped Show',
        category: 'show',
        status: 'dropped',
        dropReason: 'Lost interest after season 2',
        droppedAt: '2026-07-01T00:00:00.000Z',
        droppedProgressPrimary: 2,
        droppedProgressSecondary: 5,
        primaryUnitCurrent: 2,
        primaryUnitTotal: 5,
        secondaryUnitCurrent: 5,
        secondaryUnitTotal: 10,
        completedAt: null,
        startedAt: '2026-06-01T00:00:00.000Z',
        rating: 5,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      }),
    ];

    const stats = calculateArchiveStats(withDropped);
    expect(stats.totalEntries).toBe(6);
    expect(stats.droppedCount).toBe(1);
    expect(stats.totalEpisodes).toBe(42); // 37 + 5 episodes watched before drop
  });
});

describe('calculateYearlyStats', () => {
  it('filters and computes annual report for 2026', () => {
    const yearly = calculateYearlyStats(sampleEntries, 2026);

    expect(yearly.year).toBe(2026);
    expect(yearly.totalCompleted).toBe(3);
    expect(yearly.completedAnime).toBe(1);
    expect(yearly.completedShows).toBe(1);
    expect(yearly.completedMovies).toBe(1);
    expect(yearly.movieMinutesWatched).toBe(148);
    expect(yearly.completedBooks).toBe(0);
    expect(yearly.episodesWatched).toBe(37); // 28 + 9
    expect(yearly.avgRating).toBe('9.3'); // (10 + 9 + 9) / 3 = 9.333 -> 9.3
    expect(yearly.completionsByMonth[2]).toBe(1); // March
    expect(yearly.completionsByMonth[3]).toBe(1); // April
    expect(yearly.completionsByMonth[5]).toBe(1); // June
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

describe('calculateReadingGoalProgress', () => {
  const goalEntries: MediaEntry[] = [
    makeEntry({
      id: 'b1',
      title: 'Book 1',
      category: 'book',
      status: 'completed',
      secondaryUnitCurrent: 300,
      secondaryUnitTotal: 300,
      completedAt: '2026-01-15T12:00:00.000Z',
      rating: 8,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-15T12:00:00.000Z',
    }),
    makeEntry({
      id: 'b2',
      title: 'Book 2',
      category: 'book',
      status: 'completed',
      secondaryUnitCurrent: 400,
      secondaryUnitTotal: 400,
      completedAt: '2026-02-10T12:00:00.000Z',
      rating: 9,
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-10T12:00:00.000Z',
    }),
  ];

  it('calculates progress and ahead-of-schedule pacing accurately', () => {
    // 2 books completed by mid Feb when expected is ~1.5 books for target of 12
    const refDate = new Date('2026-02-15T00:00:00.000Z');
    const progress = calculateReadingGoalProgress(
      goalEntries,
      { year: 2026, annualTarget: 12, isPublic: true },
      refDate,
    );

    expect(progress.year).toBe(2026);
    expect(progress.annualTarget).toBe(12);
    expect(progress.completedCount).toBe(2);
    expect(progress.percentage).toBe(17); // 2/12 = 16.66% -> 17%
    expect(progress.status).toBe('on_track'); // 2 completed vs ~1.5 expected (diff = 0.5 < 1)
  });

  it('detects ahead of schedule when completed count exceeds expected by >= 1', () => {
    const refDate = new Date('2026-01-20T00:00:00.000Z');
    const progress = calculateReadingGoalProgress(
      goalEntries,
      { year: 2026, annualTarget: 12, isPublic: true },
      refDate,
    );

    expect(progress.completedCount).toBe(2);
    expect(progress.status).toBe('ahead');
  });

  it('detects behind schedule when completed count lags behind expected by <= -1', () => {
    const refDate = new Date('2026-08-01T00:00:00.000Z');
    const progress = calculateReadingGoalProgress(
      goalEntries,
      { year: 2026, annualTarget: 12, isPublic: true },
      refDate,
    );

    expect(progress.completedCount).toBe(2);
    expect(progress.status).toBe('behind');
  });
});

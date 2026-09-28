import { describe, it, expect } from 'vitest';
import {
  calculateArchiveStats,
  calculateWrappedStats,
  calculateYearlyStats,
  getAvailableYears,
  calculateReadingGoalProgress,
} from '@/lib/stats';
import { parseWrappedPeriod, resolveWrappedRange, type WrappedPeriod } from '@/lib/wrapped-period';
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

  it('does not count unwatched runtimes or episode totals as consumed', () => {
    const stats = calculateArchiveStats([
      makeEntry({
        id: 'plan-show',
        title: 'Queued Show',
        category: 'show',
        status: 'planning',
        secondaryUnitCurrent: 0,
        secondaryUnitTotal: 12,
      }),
      makeEntry({
        id: 'plan-movie',
        title: 'Queued Movie',
        category: 'movie',
        status: 'planning',
        secondaryUnitCurrent: 0,
        secondaryUnitTotal: 148,
      }),
    ]);

    expect(stats.totalEpisodes).toBe(0);
    expect(stats.totalMovieMinutes).toBe(0);

    const yearly = calculateYearlyStats(
      [
        makeEntry({
          id: 'done-show',
          title: 'Finished Show',
          category: 'show',
          status: 'completed',
          secondaryUnitCurrent: 0,
          secondaryUnitTotal: 12,
          completedAt: '2026-03-01T00:00:00.000Z',
        }),
      ],
      2026,
    );
    expect(yearly.episodesWatched).toBe(0);
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

describe('calculateWrappedStats', () => {
  // Fixed instant so every trailing window is deterministic: Monday 28 September 2026.
  const now = new Date(2026, 8, 28, 12, 0, 0);

  const iso = (date: Date): string => date.toISOString();
  const localIso = (year: number, month: number, day: number, hour = 0, minute = 0): string =>
    iso(new Date(year, month, day, hour, minute, 0, 0));
  const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

  const completedOn = (
    id: string,
    completedAt: string,
    overrides: Partial<MediaEntry> = {},
  ): MediaEntry =>
    makeEntry({
      id,
      title: id,
      status: 'completed',
      secondaryUnitCurrent: 10,
      secondaryUnitTotal: 10,
      completedAt,
      ...overrides,
    });

  const rewatch = (id: string, completedAt: string) => ({
    id,
    cycleNumber: 2,
    startedAt: null,
    completedAt,
  });

  it('reads a past edition as its closed calendar year', () => {
    const stats = calculateWrappedStats(sampleEntries, 2025, 'year', now);
    const yearly = calculateYearlyStats(sampleEntries, 2025);

    expect(stats.period).toBe('year');
    expect(stats.year).toBe(2025);
    expect(stats.periodLabel).toBe('Last year');
    expect(stats.rangeLabel).toBe('1 Jan 2025 – 31 Dec 2025');
    expect(stats.rangeStart).toBe(iso(new Date(2025, 0, 1)));
    expect(stats.rangeEnd).toBe(iso(new Date(2025, 11, 31, 23, 59, 59, 999)));

    expect(stats.totalCompleted).toBe(yearly.totalCompleted);
    expect(stats.completedShows).toBe(yearly.completedShows);
    expect(stats.completedMovies).toBe(yearly.completedMovies);
    expect(stats.completedAnime).toBe(yearly.completedAnime);
    expect(stats.completedBooks).toBe(yearly.completedBooks);
    expect(stats.completedManga).toBe(yearly.completedManga);
    expect(stats.episodesWatched).toBe(yearly.episodesWatched);
    expect(stats.chaptersRead).toBe(364);
    expect(stats.movieMinutesWatched).toBe(yearly.movieMinutesWatched);
    expect(stats.avgRating).toBe(yearly.avgRating);
    expect(stats.ratedCount).toBe(yearly.ratedCount);
    expect(stats.favoriteCategory).toBe(yearly.favoriteCategory);
    expect(stats.availableYears).toEqual(getAvailableYears(sampleEntries));

    // A past edition is a whole calendar year, so its axis is exactly Jan..Dec.
    expect(stats.buckets.chartTitle).toBe('Completions by Month');
    expect(stats.buckets.labels[0]).toBe('Jan');
    expect(stats.buckets.values).toHaveLength(12);
    expect(stats.buckets.values[10]).toBe(1);
    expect(stats.buckets.values).toEqual(yearly.completionsByMonth);
  });

  it('falls back to the year view when no period is supplied', () => {
    const omitted = parseWrappedPeriod(undefined);

    expect(omitted).toBe('year');
    expect(calculateWrappedStats(sampleEntries, 2025, omitted, now)).toEqual(
      calculateWrappedStats(sampleEntries, 2025, 'year', now),
    );
  });

  it('trails the calendar year for the edition that is still running', () => {
    const stats = calculateWrappedStats(sampleEntries, 2026, 'year', now);
    const yearly = calculateYearlyStats(sampleEntries, 2026);

    // November 2025 falls inside the trailing window but not inside calendar 2026.
    expect(yearly.totalCompleted).toBe(3);
    expect(stats.totalCompleted).toBe(4);
    expect(stats.avgRating).toBe('9.5');
    expect(stats.favoriteCategory).toBe('Shows');
    expect(stats.buckets.values).toHaveLength(13);
    expect(sum(stats.buckets.values)).toBe(4);
  });

  it('excludes quarter completions outside the inclusive window', () => {
    const range = resolveWrappedRange('quarter', 2026, now);
    const entries = [
      completedOn('before-start', iso(new Date(range.start.getTime() - 1)), {
        category: 'show',
        secondaryUnitCurrent: 12,
      }),
      completedOn('at-start', range.start.toISOString(), {
        category: 'show',
        secondaryUnitCurrent: 8,
      }),
      completedOn('mid-window', localIso(2026, 7, 5, 9), {
        category: 'movie',
        secondaryUnitCurrent: 148,
      }),
      completedOn('at-end', range.end.toISOString(), {
        category: 'book',
        secondaryUnitCurrent: 300,
      }),
      completedOn('after-end', iso(new Date(range.end.getTime() + 1)), {
        category: 'manga',
        secondaryUnitCurrent: 200,
      }),
    ];

    const stats = calculateWrappedStats(entries, 2026, 'quarter', now);

    expect(stats.periodLabel).toBe('Last quarter');
    expect(stats.totalCompleted).toBe(3);
    expect(stats.completedShows).toBe(1);
    expect(stats.completedMovies).toBe(1);
    expect(stats.completedBooks).toBe(1);
    expect(stats.completedManga).toBe(0);
    expect(stats.episodesWatched).toBe(8);
    expect(stats.chaptersRead).toBe(300);
    expect(stats.movieMinutesWatched).toBe(148);
    expect(stats.buckets.chartTitle).toBe('Completions by Week');
    expect(sum(stats.buckets.values)).toBe(3);
  });

  it('counts a rewatched entry once and includes entries only a cycle brings in', () => {
    const entries = [
      completedOn('original-and-rewatch', localIso(2026, 7, 10, 20), {
        category: 'show',
        secondaryUnitCurrent: 12,
        cycles: [rewatch('c1', localIso(2026, 7, 20, 18)), rewatch('c2', localIso(2026, 9, 5, 18))],
      }),
      completedOn('rewatch-only', localIso(2026, 4, 5, 20), {
        category: 'show',
        secondaryUnitCurrent: 6,
        cycles: [rewatch('c3', localIso(2026, 7, 20, 9))],
      }),
      completedOn('every-date-outside', localIso(2026, 4, 5, 20), {
        category: 'show',
        secondaryUnitCurrent: 99,
        cycles: [rewatch('c4', localIso(2026, 9, 5, 9))],
      }),
    ];

    const stats = calculateWrappedStats(entries, 2026, 'quarter', now);

    expect(stats.totalCompleted).toBe(2);
    expect(stats.completedShows).toBe(2);
    expect(stats.episodesWatched).toBe(18);

    // Each entry is bucketed by its first in-range date, not by its latest one.
    const firstWeek = stats.buckets.labels.indexOf('10 Aug');
    const secondWeek = stats.buckets.labels.indexOf('17 Aug');
    expect(firstWeek).toBeGreaterThanOrEqual(0);
    expect(secondWeek).toBeGreaterThan(firstWeek);
    expect(stats.buckets.values[firstWeek]).toBe(1);
    expect(stats.buckets.values[secondWeek]).toBe(1);
    expect(sum(stats.buckets.values)).toBe(2);
  });

  it('tallies one bucket per axis step and sums each period axis to the total', () => {
    const fixtures: Record<
      WrappedPeriod,
      { dates: string[]; axisLength: number; chartTitle: string; periodLabel: string }
    > = {
      year: {
        dates: [localIso(2025, 9, 14, 12), localIso(2026, 2, 15, 12)],
        axisLength: 13,
        chartTitle: 'Completions by Month',
        periodLabel: 'Last year',
      },
      quarter: {
        dates: [localIso(2026, 5, 28, 12), localIso(2026, 7, 5, 9), localIso(2026, 8, 28, 12)],
        axisLength: 15,
        chartTitle: 'Completions by Week',
        periodLabel: 'Last quarter',
      },
      month: {
        dates: [
          localIso(2026, 7, 28, 12),
          localIso(2026, 8, 1, 9),
          localIso(2026, 8, 15, 21),
          localIso(2026, 8, 28, 12),
        ],
        axisLength: 32,
        chartTitle: 'Completions by Day',
        periodLabel: 'Last month',
      },
      week: {
        dates: [
          localIso(2026, 8, 23, 12),
          localIso(2026, 8, 24, 9),
          localIso(2026, 8, 27, 23),
          localIso(2026, 8, 28, 12),
        ],
        axisLength: 7,
        chartTitle: 'Completions by Day of Week',
        periodLabel: 'Last week',
      },
    };

    for (const period of ['year', 'quarter', 'month', 'week'] as const) {
      const fixture = fixtures[period];
      const range = resolveWrappedRange(period, 2026, now);
      const entries = fixture.dates.map((date, index) => completedOn(`${period}-${index}`, date));

      const stats = calculateWrappedStats(entries, 2026, period, now);

      expect(stats.period).toBe(period);
      expect(stats.periodLabel).toBe(fixture.periodLabel);
      expect(stats.rangeStart).toBe(range.start.toISOString());
      expect(stats.rangeEnd).toBe(range.end.toISOString());
      expect(stats.buckets.chartTitle).toBe(fixture.chartTitle);
      expect(stats.buckets.values).toHaveLength(fixture.axisLength);
      expect(stats.buckets.values).toHaveLength(stats.buckets.labels.length);
      expect(stats.totalCompleted).toBe(fixture.dates.length);
      expect(sum(stats.buckets.values)).toBe(stats.totalCompleted);
    }
  });

  it('averages ratings and picks a favourite category inside a sub-year window', () => {
    const entries = [
      completedOn('show-a', localIso(2026, 8, 3, 20), {
        category: 'show',
        secondaryUnitCurrent: 10,
        rating: 10,
      }),
      completedOn('show-b', localIso(2026, 8, 20, 20), {
        category: 'show',
        secondaryUnitCurrent: 8,
        rating: 8,
      }),
      completedOn('book-a', localIso(2026, 8, 25, 20), {
        category: 'book',
        secondaryUnitCurrent: 300,
        rating: 9,
      }),
      completedOn('outside-window', localIso(2026, 7, 1, 20), {
        category: 'book',
        secondaryUnitCurrent: 999,
        rating: 2,
      }),
    ];

    const stats = calculateWrappedStats(entries, 2026, 'month', now);

    expect(stats.totalCompleted).toBe(3);
    expect(stats.avgRating).toBe('9.0');
    expect(stats.ratedCount).toBe(3);
    expect(stats.topRated.map((entry) => entry.id)).toEqual(['show-a', 'book-a', 'show-b']);
    expect(stats.favoriteCategory).toBe('Shows');
    expect(stats.episodesWatched).toBe(18);
    expect(stats.chaptersRead).toBe(300);
  });

  it('reports an empty window with no rating and no favourite category', () => {
    const entries = [completedOn('old', localIso(2025, 2, 3, 20), { rating: 7 })];

    const stats = calculateWrappedStats(entries, 2026, 'week', now);

    expect(stats.totalCompleted).toBe(0);
    expect(stats.avgRating).toBe('—');
    expect(stats.ratedCount).toBe(0);
    expect(stats.topRated).toEqual([]);
    expect(stats.favoriteCategory).toBeNull();
    expect(stats.buckets.values).toHaveLength(7);
    expect(sum(stats.buckets.values)).toBe(0);
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

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { useMediaFilters, STATUS_KEYS } from '@/hooks/use-media-filters';
import type { MediaEntry } from '@/types/media';

const makeEntry = (
  id: string,
  title: string,
  updatedAt: string,
  category: 'show' | 'movie' | 'book' = 'show',
): MediaEntry => ({
  id,
  userId: 'u1',
  title,
  category,
  status: 'in_progress',
  dropReason: null,
  droppedAt: null,
  droppedProgressPrimary: null,
  droppedProgressSecondary: null,
  priorityIndex: null,
  cycles: [],
  primaryUnitCurrent: 1,
  primaryUnitTotal: 1,
  secondaryUnitCurrent: 1,
  secondaryUnitTotal: 10,
  structure: [],
  completedAt: null,
  startedAt: null,
  rewatchCount: 0,
  rating: null,
  tags: [],
  genres: [],
  synopsis: null,
  coverImage: null,
  sourceId: `tvmaze-${id}`,
  notes: null,
  quotes: [],
  isPrivate: false,
  groupId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt,
});

function runHook(entries: MediaEntry[], tab: any = 'total') {
  let result: ReturnType<typeof useMediaFilters> | null = null;
  function Component() {
    result = useMediaFilters(entries, tab);
    return null;
  }
  renderToString(React.createElement(Component));
  return result!;
}

describe('useMediaFilters', () => {
  it('exports expected status keys', () => {
    expect(STATUS_KEYS).toEqual(['in_progress', 'completed', 'planning', 'on_hold', 'dropped']);
  });

  it('filters entries by tab correctly', () => {
    const entries: MediaEntry[] = [
      makeEntry('1', 'Show 1', '2026-08-01T00:00:00.000Z', 'show'),
      makeEntry('2', 'Movie 1', '2026-08-02T00:00:00.000Z', 'movie'),
      makeEntry('3', 'Book 1', '2026-08-03T00:00:00.000Z', 'book'),
    ];

    const totalRes = runHook(entries, 'total');
    expect(totalRes.displayedEntries).toHaveLength(3);

    const showsRes = runHook(entries, 'shows');
    expect(showsRes.displayedEntries).toHaveLength(1);
    expect(showsRes.displayedEntries[0]?.title).toBe('Show 1');

    const moviesRes = runHook(entries, 'movies');
    expect(moviesRes.displayedEntries).toHaveLength(1);
    expect(moviesRes.displayedEntries[0]?.title).toBe('Movie 1');

    const booksRes = runHook(entries, 'books');
    expect(booksRes.displayedEntries).toHaveLength(1);
    expect(booksRes.displayedEntries[0]?.title).toBe('Book 1');
  });

  it('sorts entries in descending updatedAt order on initial render', () => {
    const entries: MediaEntry[] = [
      makeEntry('1', 'Old Show', '2026-08-01T00:00:00.000Z'),
      makeEntry('2', 'New Show', '2026-08-03T00:00:00.000Z'),
      makeEntry('3', 'Mid Show', '2026-08-02T00:00:00.000Z'),
    ];

    const res = runHook(entries, 'total');
    expect(res.displayedEntries.map((e) => e.id)).toEqual(['2', '3', '1']);
  });
});

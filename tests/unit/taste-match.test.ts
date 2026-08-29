import { describe, it, expect } from 'vitest';
import { calculateTasteMatch } from '@/lib/tasteMatch';
import type { MediaEntry } from '@/types/media';

const makeEntry = (
  id: string,
  title: string,
  category: 'show' | 'movie' | 'book' | 'anime' | 'manga',
  rating: number | null,
  sourceId?: string,
): MediaEntry => ({
  id,
  userId: 'u1',
  title,
  category,
  status: 'completed',
  dropReason: null,
  droppedAt: null,
  droppedProgressPrimary: null,
  droppedProgressSecondary: null,
  priorityIndex: null,
  cycles: [],
  primaryUnitCurrent: 1,
  primaryUnitTotal: 1,
  secondaryUnitCurrent: 10,
  secondaryUnitTotal: 10,
  structure: [],
  completedAt: '2026-01-01T00:00:00.000Z',
  startedAt: null,
  rewatchCount: 0,
  rating,
  tags: ['favorite'],
  genres: ['Drama', 'Sci-Fi'],
  synopsis: null,
  coverImage: null,
  sourceId: sourceId || null,
  notes: null,
  quotes: [],
  isPrivate: false,
  groupId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

describe('calculateTasteMatch', () => {
  it('calculates 100% agreement when ratings are identical', () => {
    const listA = [
      makeEntry('1', 'Severance', 'show', 10, 'tvmaze-100'),
      makeEntry('2', 'Inception', 'movie', 9, 'tmdb-27205'),
    ];
    const listB = [
      makeEntry('3', 'Severance', 'show', 10, 'tvmaze-100'),
      makeEntry('4', 'Inception', 'movie', 9, 'tmdb-27205'),
    ];

    const result = calculateTasteMatch(listA, listB);
    expect(result.sharedCount).toBe(2);
    expect(result.sharedPercentage).toBe(100);
    expect(result.ratingSimilarity).toBe(100);
    expect(result.sharedMasterworks).toHaveLength(2);
  });

  it('calculates divergence when ratings differ', () => {
    const listA = [makeEntry('1', 'Severance', 'show', 10, 'tvmaze-100')];
    const listB = [makeEntry('2', 'Severance', 'show', 1, 'tvmaze-100')];

    const result = calculateTasteMatch(listA, listB);
    expect(result.sharedCount).toBe(1);
    expect(result.ratingSimilarity).toBe(0); // diff of 9 is 0% similarity
    expect(result.sharedMasterworks).toHaveLength(0);
  });

  it('handles zero overlap gracefully', () => {
    const listA = [makeEntry('1', 'Show A', 'show', 8)];
    const listB = [makeEntry('2', 'Show B', 'show', 8)];

    const result = calculateTasteMatch(listA, listB);
    expect(result.sharedCount).toBe(0);
    expect(result.sharedPercentage).toBe(0);
    expect(result.ratingSimilarity).toBeNull();
    expect(result.sharedMasterworks).toHaveLength(0);
  });
});

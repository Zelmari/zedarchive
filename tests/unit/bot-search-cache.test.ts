import { describe, it, expect, vi, afterEach } from 'vitest';
import { stashSearchHits, getSearchHits } from '../../bot/src/search-cache';
import type { SearchResult } from '@/types/search';

const sampleHit: SearchResult = {
  sourceId: 'tmdb:123',
  category: 'show',
  title: 'Test Show',
  coverUrl: 'https://example.com/cover.jpg',
  primaryUnitTotal: 3,
  structure: [{ season: 1, episodes: 10 }],
  secondaryUnitTotal: null,
  year: '2024',
};

describe('bot search hit cache', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stashes and retrieves search hits', () => {
    const { cacheId } = stashSearchHits('disc-456', 'show', [sampleHit]);
    expect(cacheId).toHaveLength(8);

    const cached = getSearchHits(cacheId);
    expect(cached).not.toBeNull();
    expect(cached?.discordUserId).toBe('disc-456');
    expect(cached?.category).toBe('show');
    expect(cached?.hits).toHaveLength(1);
    expect(cached?.hits[0]?.sourceId).toBe('tmdb:123');
  });

  it('returns null for unknown cache id', () => {
    expect(getSearchHits('deadbeef')).toBeNull();
  });

  it('returns null after expiry', () => {
    vi.useFakeTimers();
    const { cacheId } = stashSearchHits('disc-456', 'anime', [sampleHit]);

    vi.advanceTimersByTime(14 * 60 * 1000 + 1);
    expect(getSearchHits(cacheId)).toBeNull();
  });
});

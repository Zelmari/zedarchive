import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  stashSearchHits,
  getSearchHits,
  stashCustomTitle,
  getCustomTitle,
} from '../../bot/src/search-cache';
import type { SearchResult } from '@/types/search';

const sampleHit: SearchResult = {
  sourceId: 'tmdb:123',
  category: 'show',
  title: 'Test Show',
  coverUrl: 'https://example.com/cover.jpg',
  primaryUnitTotal: 3,
  structure: [{ number: 1, name: 'Season 1', total: 10 }],
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

describe('bot custom title stash', () => {
  it('stashes queries so Discord customIds stay under 100 characters', () => {
    const query = `${'映画'.repeat(50)}`;
    expect(query.length).toBe(100);
    const { stashId } = stashCustomTitle('disc-1', query, 'movie');
    const customId = `za:add:custom:${stashId}`;
    expect(customId.length).toBeLessThanOrEqual(100);

    const stored = getCustomTitle(stashId);
    expect(stored?.query).toBe(query);
    expect(stored?.category).toBe('movie');
    expect(stored?.discordUserId).toBe('disc-1');
  });
});

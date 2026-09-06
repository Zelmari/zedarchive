import { describe, it, expect } from 'vitest';
import { catalogDraftFieldsFromHit } from '../../bot/src/commands/add';
import type { SearchResult } from '@/types/search';

function makeHit(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    sourceId: 'tmdb:999',
    category: 'show',
    title: 'Sample Title',
    coverUrl: 'https://cdn.example.com/poster.jpg',
    primaryUnitTotal: 2,
    structure: [{ number: 1, name: 'Season 1', total: 8 }],
    secondaryUnitTotal: 24,
    authors: null,
    year: '2023',
    ...overrides,
  };
}

describe('catalogDraftFieldsFromHit', () => {
  it('copies sourceId, https cover, and structure', () => {
    const fields = catalogDraftFieldsFromHit(makeHit(), 'show');
    expect(fields.sourceId).toBe('tmdb:999');
    expect(fields.coverUrl).toBe('https://cdn.example.com/poster.jpg');
    expect(fields.structure).toEqual([{ number: 1, name: 'Season 1', total: 8 }]);
    expect(fields.title).toBe('Sample Title');
    expect(fields.secondaryUnitTotal).toBe(24);
  });

  it('sets movie primaryUnitCurrent to 0 and non-movie to 1', () => {
    const movie = catalogDraftFieldsFromHit(makeHit({ category: 'movie' }), 'movie');
    expect(movie.primaryUnitCurrent).toBe(0);

    const show = catalogDraftFieldsFromHit(makeHit(), 'anime');
    expect(show.primaryUnitCurrent).toBe(1);
  });

  it('strips non-https covers', () => {
    expect(
      catalogDraftFieldsFromHit(makeHit({ coverUrl: 'http://insecure.example/x.jpg' }), 'show')
        .coverUrl,
    ).toBeNull();
    expect(
      catalogDraftFieldsFromHit(makeHit({ coverUrl: 'data:image/png;base64,abc' }), 'show')
        .coverUrl,
    ).toBeNull();
    expect(catalogDraftFieldsFromHit(makeHit({ coverUrl: null }), 'show').coverUrl).toBeNull();
  });

  it('defaults primaryUnitTotal to at least 1', () => {
    expect(
      catalogDraftFieldsFromHit(makeHit({ primaryUnitTotal: 0 }), 'show').primaryUnitTotal,
    ).toBe(1);
    expect(
      catalogDraftFieldsFromHit(makeHit({ primaryUnitTotal: NaN as unknown as number }), 'show')
        .primaryUnitTotal,
    ).toBe(1);
    expect(
      catalogDraftFieldsFromHit(
        makeHit({ primaryUnitTotal: undefined as unknown as number }),
        'show',
      ).primaryUnitTotal,
    ).toBe(1);
  });

  it('uses empty structure when hit structure is not an array', () => {
    const fields = catalogDraftFieldsFromHit(makeHit({ structure: null as unknown as [] }), 'show');
    expect(fields.structure).toEqual([]);
  });
});

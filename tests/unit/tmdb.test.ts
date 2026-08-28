import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchTmdbMovies } from '@/lib/services/tmdb';

describe('searchTmdbMovies', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('returns null when TMDB token is not configured', async () => {
    delete process.env.TMDB_API_READ_TOKEN;
    delete process.env.TMDB_API_KEY;

    const results = await searchTmdbMovies('Inception');
    expect(results).toBeNull();
  });

  it('returns empty array when query is empty', async () => {
    process.env.TMDB_API_READ_TOKEN = 'test-token-1234567890123456789012345678901234567890';

    const results = await searchTmdbMovies('   ');
    expect(results).toEqual([]);
  });

  it('fetches and maps TMDB search results with runtime', async () => {
    process.env.TMDB_API_READ_TOKEN = 'mock-bearer-token-1234567890123456789012345678901234567890';

    const mockSearchResponse = {
      results: [
        {
          id: 27205,
          title: 'Inception',
          poster_path: '/edv5CZvWj09upOsy2Y6IwDhK8bt.jpg',
          release_date: '2010-07-15',
        },
      ],
    };

    const mockDetailsResponse = {
      id: 27205,
      title: 'Inception',
      runtime: 148,
    };

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/search/movie')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockSearchResponse,
        });
      }
      if (url.includes('/movie/27205')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockDetailsResponse,
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    vi.stubGlobal('fetch', mockFetch);

    const results = await searchTmdbMovies('Inception');
    expect(results).not.toBeNull();
    expect(results).toHaveLength(1);
    expect(results![0]).toEqual({
      sourceId: 'tmdb-27205',
      category: 'movie',
      title: 'Inception',
      coverUrl: 'https://image.tmdb.org/t/p/w500/edv5CZvWj09upOsy2Y6IwDhK8bt.jpg',
      primaryUnitTotal: 1,
      structure: [],
      secondaryUnitTotal: 148,
      year: '2010',
    });
  });
});

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

  it('uses the v3 API key query parameter for short tokens', async () => {
    delete process.env.TMDB_API_READ_TOKEN;
    process.env.TMDB_API_KEY = '0123456789abcdef0123456789abcdef';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [{ id: 1, title: 'Dune' }] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await searchTmdbMovies('Dune');

    expect(String(mockFetch.mock.calls[0]?.[0])).toContain(
      'api_key=0123456789abcdef0123456789abcdef',
    );
  });
});

describe('fetchWatchProviders & resolveTmdbId', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('fetches watch providers for a country code', async () => {
    process.env.TMDB_API_READ_TOKEN = 'mock-bearer-token-1234567890123456789012345678901234567890';

    const mockProvidersResponse = {
      results: {
        US: {
          link: 'https://www.themoviedb.org/movie/27205/watch?locale=US',
          flatrate: [
            {
              provider_id: 8,
              provider_name: 'Netflix',
              logo_path: '/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg',
            },
          ],
          rent: [
            {
              provider_id: 2,
              provider_name: 'Apple TV',
              logo_path: '/peURlLlr8jggOwK53fJ5wdQl05y.jpg',
            },
          ],
        },
      },
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockProvidersResponse,
    });
    vi.stubGlobal('fetch', mockFetch);

    const { fetchWatchProviders } = await import('@/lib/services/tmdb');
    const providers = await fetchWatchProviders(27205, 'movie', 'US');

    expect(providers).not.toBeNull();
    expect(providers?.flatrate).toHaveLength(1);
    expect(providers?.flatrate?.[0]?.name).toBe('Netflix');
    expect(providers?.rent).toHaveLength(1);
    expect(providers?.rent?.[0]?.name).toBe('Apple TV');
  });

  it('resolves TMDB IDs from sourceId or title search', async () => {
    process.env.TMDB_API_READ_TOKEN = 'mock-bearer-token-1234567890123456789012345678901234567890';

    const { resolveTmdbId } = await import('@/lib/services/tmdb');

    // 1. Direct TMDB ID
    const fromDirect = await resolveTmdbId('tmdb-27205');
    expect(fromDirect).toBe(27205);

    // 2. Title fallback search
    const mockSearchResponse = {
      results: [{ id: 9999, title: 'Severance' }],
    };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockSearchResponse,
    });
    vi.stubGlobal('fetch', mockFetch);

    const fromTitle = await resolveTmdbId(null, 'Severance', 'show');
    expect(fromTitle).toBe(9999);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/search/movies/route';

describe('GET /api/search/movies', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('returns empty array when query is missing or empty', async () => {
    const req = new Request('http://localhost:3000/api/search/movies?q=');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ results: [] });
  });

  it('returns 400 when query exceeds maximum length', async () => {
    const longQuery = 'a'.repeat(101);
    const req = new Request(`http://localhost:3000/api/search/movies?q=${longQuery}`);
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('Query too long');
  });

  it('returns configured: false when TMDB token is missing', async () => {
    delete process.env.TMDB_API_READ_TOKEN;
    delete process.env.TMDB_API_KEY;

    const req = new Request('http://localhost:3000/api/search/movies?q=Interstellar');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.configured).toBe(false);
    expect(body.results).toEqual([]);
  });

  it('returns results with cache headers when search succeeds', async () => {
    process.env.TMDB_API_READ_TOKEN = 'mock-bearer-token-1234567890123456789012345678901234567890';

    const mockSearchResponse = {
      results: [
        {
          id: 157336,
          title: 'Interstellar',
          poster_path: '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
          release_date: '2014-11-05',
        },
      ],
    };

    const mockDetailsResponse = {
      id: 157336,
      title: 'Interstellar',
      runtime: 169,
    };

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/search/movie')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockSearchResponse,
        });
      }
      if (url.includes('/movie/157336')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockDetailsResponse,
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    vi.stubGlobal('fetch', mockFetch);

    const req = new Request('http://localhost:3000/api/search/movies?q=Interstellar');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.configured).toBe(true);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].title).toBe('Interstellar');
    expect(body.results[0].secondaryUnitTotal).toBe(169);
    expect(res.headers.get('Cache-Control')).toContain('public');
  });
});

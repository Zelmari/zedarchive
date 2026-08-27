import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { getSessionMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: getSessionMock,
    },
  },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const fetchMock = vi.fn();

vi.stubGlobal('fetch', fetchMock);

import { GET } from '@/app/api/shows/airdate/route';

function makeRequest(ids: string): Request {
  return new Request(`http://localhost/api/shows/airdate?ids=${encodeURIComponent(ids)}`);
}

describe('GET /api/shows/airdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ user: { id: 'user-1' } });
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
  });

  afterEach(() => {
    fetchMock.mockReset();
  });

  it('rejects unauthenticated requests', async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(makeRequest('tvmaze-1'));
    expect(res.status).toBe(401);
  });

  it('resolves tvmaze sourceIds through the TVMaze API', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.startsWith('https://api.tvmaze.com/shows/82')) {
        return new Response(
          JSON.stringify({
            status: 'Running',
            _embedded: {
              nextepisode: {
                season: 2,
                number: 5,
                airdate: '2026-09-10',
                airstamp: '2026-09-10T20:00:00-04:00',
              },
            },
          }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 200 });
    });

    const res = await GET(makeRequest('tvmaze-82'));
    const body = await res.json();
    expect(body['tvmaze-82']).toMatchObject({ season: 2, number: 5, airdate: '2026-09-10' });
  });

  it('resolves anilist and mal sourceIds in one batched AniList request', async () => {
    const airingAt = 1788099360;

    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://graphql.anilist.co') {
        const { query } = JSON.parse(String(init?.body));
        expect(query).toContain('id: 21');
        expect(query).toContain('idMal: 52991');
        const data = {
          a0: { status: 'RELEASING', nextAiringEpisode: { episode: 1176, airingAt } },
          a1: { status: 'RELEASING', nextAiringEpisode: { episode: 28, airingAt } },
        };
        return new Response(JSON.stringify({ data }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });

    const res = await GET(makeRequest('anilist-21,mal-52991'));
    const body = await res.json();
    expect(body['anilist-21']).toEqual({
      season: 1,
      number: 1176,
      airdate: new Date(airingAt * 1000).toISOString().slice(0, 10),
      airstamp: null,
      status: 'RELEASING',
    });
    expect(body['mal-52991']).toEqual({
      season: 1,
      number: 28,
      airdate: new Date(airingAt * 1000).toISOString().slice(0, 10),
      airstamp: null,
      status: 'RELEASING',
    });
  });

  it('suppresses dormant AniList statuses and unknown sourceIds', async () => {
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://graphql.anilist.co') {
        const data = {
          a0: { status: 'FINISHED', nextAiringEpisode: null },
          a1: { status: 'RELEASING', nextAiringEpisode: null },
        };
        return new Response(JSON.stringify({ data }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });

    const res = await GET(makeRequest('anilist-1,mal-2,simkl-3'));
    const body = await res.json();
    expect(Object.keys(body)).toHaveLength(0);
    // simkl-* is not resolvable — no upstream fetch beyond providers is made.
    const tvmazeCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).startsWith('https://api.tvmaze.com/'),
    );
    expect(tvmazeCalls).toHaveLength(0);
  });

  it('returns empty results for an empty ids parameter', async () => {
    const res = await GET(makeRequest(''));
    const body = await res.json();
    expect(body).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

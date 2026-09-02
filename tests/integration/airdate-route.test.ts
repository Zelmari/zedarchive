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

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function makeRequest(ids: string, titles?: string[]): Request {
  const url = new URL('http://localhost/api/shows/airdate');
  url.searchParams.set('ids', ids);
  if (titles) {
    url.searchParams.set('titles', JSON.stringify(titles));
  }
  return new Request(url.toString());
}

/** A fake AnimeSchedule search response payload. */
function animeScheduleResponse(anime: Array<Record<string, unknown>>): Response {
  return new Response(JSON.stringify({ anime }), { status: 200 });
}

function scheduleAnime(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'Villainess',
    status: 'Ongoing',
    episodes: 11,
    premier: '2026-07-12T00:00:00Z',
    subTime: '2026-07-12T15:45:00Z',
    episodeOverride: { overrideDate: '0001-01-01T00:00:00Z', overrideEpisode: 0, episodesAired: 0 },
    delayedUntil: '0001-01-01T00:00:00Z',
    websites: {
      aniList: 'anilist.co/anime/188139/Example/',
      mal: 'myanimelist.net/anime/61240/Example',
    },
    ...overrides,
  };
}

describe('GET /api/shows/airdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ user: { id: 'user-1' } });
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-27T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
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
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=21600');
  });

  it.each(['Ended', 'In Development'])(
    'suppresses next episode line for %s shows',
    async (status) => {
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
            status,
            _embedded: {
              nextepisode: {
                season: 1,
                number: 10,
                airdate: '2026-08-30',
              },
            },
          }),
          { status: 200 },
        ),
      );

      const res = await GET(makeRequest('tvmaze-456'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body['tvmaze-456']).toBeUndefined();
    },
  );

  it('computes anime next-episode dates from AnimeSchedule with id cross-checking', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.startsWith('https://animeschedule.net/api/v3/anime')) {
        expect(url.toLowerCase()).toContain('inept%20villainess');
        return animeScheduleResponse([scheduleAnime()]);
      }
      return new Response('{}', { status: 200 });
    });

    const res = await GET(
      makeRequest('anilist-188139,mal-61240', [
        'Though I Am an Inept Villainess',
        'Though I Am an Inept Villainess',
      ]),
    );
    const body = await res.json();

    // Premier/sub anchor 2026-07-12 + 7 weekly steps from 2026-08-27 = ep 8, Aug 30.
    expect(body['anilist-188139']).toEqual({
      season: 1,
      number: 8,
      airdate: '2026-08-30',
      airstamp: null,
      status: 'RELEASING',
    });
    expect(body['mal-61240']).toMatchObject({ number: 8, airdate: '2026-08-30' });
  });

  it('rejects AnimeSchedule results whose external ids do not match', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.startsWith('https://animeschedule.net/api/v3/anime')) {
        // Different anilist id — must not be attributed to our entry.
        return animeScheduleResponse([
          scheduleAnime({
            websites: {
              aniList: 'anilist.co/anime/999999/Other/',
              mal: 'myanimelist.net/anime/999999/Other',
            },
          }),
        ]);
      }
      return new Response('{}', { status: 200 });
    });

    const res = await GET(makeRequest('anilist-188139', ['Villainess']));
    const body = await res.json();
    expect(Object.keys(body)).toHaveLength(0);
  });

  it('suppresses finished anime and unknown providers without upstream fetches', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.startsWith('https://animeschedule.net/api/v3/anime')) {
        return animeScheduleResponse([scheduleAnime({ status: 'Finished' })]);
      }
      return new Response('{}', { status: 200 });
    });

    const res = await GET(makeRequest('mal-61240,simkl-3', ['Villainess', 'Unmapped']));
    const body = await res.json();
    expect(Object.keys(body)).toHaveLength(0);
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).startsWith('https://api.tvmaze.com/')),
    ).toHaveLength(0);
  });

  it('respects a delayedUntil override', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.startsWith('https://animeschedule.net/api/v3/anime')) {
        return animeScheduleResponse([scheduleAnime({ delayedUntil: '2026-09-20T00:00:00Z' })]);
      }
      return new Response('{}', { status: 200 });
    });

    const res = await GET(makeRequest('anilist-188139', ['Villainess']));
    const body = await res.json();
    expect(body['anilist-188139']?.airdate).toBe('2026-09-20');
  });

  it('resolves ongoing anime sequels via AniList GraphQL traversal when earlier season is finished', async () => {
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('https://animeschedule.net/api/v3/anime')) {
        return animeScheduleResponse([scheduleAnime({ status: 'Finished' })]);
      }
      if (url === 'https://graphql.anilist.co') {
        return new Response(
          JSON.stringify({
            data: {
              Media: {
                id: 184951,
                status: 'FINISHED',
                title: { english: 'Polar Opposites S1' },
                nextAiringEpisode: null,
                relations: {
                  edges: [
                    {
                      relationType: 'SEQUEL',
                      node: {
                        id: 210031,
                        format: 'TV',
                        status: 'RELEASING',
                        title: { english: 'Polar Opposites Season 2' },
                        nextAiringEpisode: {
                          airingAt: 1788796800, // 2026-09-07T16:00:00.000Z
                          episode: 4,
                          timeUntilAiring: 86400,
                        },
                      },
                    },
                  ],
                },
              },
            },
          }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 200 });
    });

    const res = await GET(makeRequest('anilist-184951', ['Polar Opposites']));
    const body = await res.json();
    expect(body['anilist-184951']).toEqual({
      season: 2,
      number: 4,
      airdate: '2026-09-07',
      airstamp: '2026-09-07T16:00:00.000Z',
      status: 'RELEASING',
      sequelTitle: 'Polar Opposites Season 2',
    });
  });

  it('returns empty results for an empty ids parameter', async () => {
    const res = await GET(makeRequest(''));
    const body = await res.json();
    expect(body).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSessionMock = vi.hoisted(() => vi.fn());

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

import { GET } from '@/app/api/shows/airdate/route';

describe('airdate API route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects unauthenticated requests with 401', async () => {
    getSessionMock.mockResolvedValue(null);

    const req = new Request('http://localhost:3000/api/shows/airdate?ids=tvmaze-123');
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it('resolves next episode airdate for running shows', async () => {
    getSessionMock.mockResolvedValue({ user: { id: 'user-1' } });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 123,
          status: 'Running',
          _embedded: {
            nextepisode: {
              season: 2,
              number: 5,
              airdate: '2026-08-30',
              airstamp: '2026-08-30T21:00:00+00:00',
            },
          },
        }),
        { status: 200 },
      ),
    );

    const req = new Request('http://localhost:3000/api/shows/airdate?ids=tvmaze-123');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data['tvmaze-123']).toEqual({
      season: 2,
      number: 5,
      airdate: '2026-08-30',
      airstamp: '2026-08-30T21:00:00+00:00',
      status: 'Running',
    });
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=21600');
  });

  it('suppresses next episode line for Ended or In Development shows', async () => {
    getSessionMock.mockResolvedValue({ user: { id: 'user-1' } });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 456,
          status: 'Ended',
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

    const req = new Request('http://localhost:3000/api/shows/airdate?ids=tvmaze-456');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data['tvmaze-456']).toBeUndefined();
  });
});

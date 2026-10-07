import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbState = vi.hoisted(() => ({
  selectQueue: [] as Array<Array<Record<string, unknown>>>,
}));

import { createMockDb } from '../helpers/db-mock';

vi.mock('@/lib/db', () => ({
  db: createMockDb(dbState),
  withRequestDb: (fn: () => unknown) => fn(),
}));

const { getSessionUserMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
}));

vi.mock('@/server/internal', () => ({
  getSessionUser: getSessionUserMock,
}));

import { GET } from '@/app/api/covers/[id]/route';

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(id = 'entry-1') {
  return new Request(`http://localhost/api/covers/${id}`);
}

const DATA_COVER = `data:image/png;base64,${Buffer.from('cover-bytes').toString('base64')}`;

const PUBLIC_ROW = {
  coverImage: DATA_COVER,
  userId: 'user-1',
  isPrivate: false,
  ownerIsPublic: true,
};

describe('GET /api/covers/[id]', () => {
  beforeEach(() => {
    dbState.selectQueue.length = 0;
    vi.clearAllMocks();
    getSessionUserMock.mockResolvedValue(null);
  });

  it('returns 404 when the entry has no cover', async () => {
    dbState.selectQueue.push([{ ...PUBLIC_ROW, coverImage: null }]);
    const res = await GET(makeRequest(), makeContext('entry-1'));
    expect(res.status).toBe(404);
  });

  it('serves stored bytes anonymously for public profiles', async () => {
    dbState.selectQueue.push([PUBLIC_ROW]);
    const res = await GET(makeRequest(), makeContext('entry-1'));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toContain('public');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(bytes)).toBe('cover-bytes');
    expect(getSessionUserMock).not.toHaveBeenCalled();
  });

  it('redirects remote covers', async () => {
    dbState.selectQueue.push([{ ...PUBLIC_ROW, coverImage: 'https://example.com/c.png' }]);
    const res = await GET(makeRequest(), makeContext('entry-1'));

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://example.com/c.png');
  });

  it('hides covers of non-public profiles from anonymous visitors', async () => {
    dbState.selectQueue.push([{ ...PUBLIC_ROW, ownerIsPublic: false }]);
    const res = await GET(makeRequest(), makeContext('entry-1'));
    expect(res.status).toBe(404);
  });

  it('hides private covers from anonymous visitors', async () => {
    dbState.selectQueue.push([{ ...PUBLIC_ROW, isPrivate: true }]);
    const res = await GET(makeRequest(), makeContext('entry-1'));
    expect(res.status).toBe(404);
  });

  it('serves private covers to the owner with private caching', async () => {
    dbState.selectQueue.push([{ ...PUBLIC_ROW, isPrivate: true }]);
    getSessionUserMock.mockResolvedValue({ id: 'user-1' });
    const res = await GET(makeRequest(), makeContext('entry-1'));

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, max-age=3600');
  });

  it('hides private covers from other signed-in users', async () => {
    dbState.selectQueue.push([{ ...PUBLIC_ROW, isPrivate: true }]);
    getSessionUserMock.mockResolvedValue({ id: 'user-2' });
    const res = await GET(makeRequest(), makeContext('entry-1'));
    expect(res.status).toBe(404);
  });
});

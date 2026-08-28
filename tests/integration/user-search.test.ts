import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbState = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  selectQueue: [] as Array<Array<Record<string, unknown>>>,
}));

import { createMockDb } from '../helpers/db-mock';

vi.mock('@/lib/db', () => ({
  db: createMockDb(dbState),
}));

import { searchPublicProfiles } from '@/server/queries/user';
import { GET } from '@/app/api/search/users/route';

describe('searchPublicProfiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.rows.length = 0;
    dbState.selectQueue.length = 0;
  });

  it('returns empty array when query is empty or invalid', async () => {
    expect(await searchPublicProfiles('')).toEqual([]);
    expect(await searchPublicProfiles('   ')).toEqual([]);
    expect(await searchPublicProfiles(null)).toEqual([]);
  });

  it('queries database and returns public profile search results', async () => {
    const mockUserRow = {
      id: 'usr_1',
      name: 'Zelmari',
      username: 'zelmari',
      bio: 'Reading sci-fi',
      image: 'https://example.com/avatar.png',
      theme: 'parchment',
      createdAt: new Date('2026-01-01'),
      totalEntries: 12,
    };

    dbState.selectQueue.push([mockUserRow]);

    const results = await searchPublicProfiles('zelmari');
    expect(results).toHaveLength(1);
    expect(results[0]?.username).toBe('zelmari');
    expect(results[0]?.name).toBe('Zelmari');
    expect(results[0]?.totalEntries).toBe(12);
  });

  it('strips leading @ in handle searches', async () => {
    const mockUserRow = {
      id: 'usr_2',
      name: 'Alex Reader',
      username: 'alex',
      bio: null,
      image: null,
      theme: 'midnight',
      createdAt: new Date('2026-02-01'),
      totalEntries: 5,
    };

    dbState.selectQueue.push([mockUserRow]);

    const results = await searchPublicProfiles('@alex');
    expect(results).toHaveLength(1);
    expect(results[0]?.username).toBe('alex');
  });
});

describe('GET /api/search/users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.rows.length = 0;
    dbState.selectQueue.length = 0;
  });

  it('returns empty results array when query is missing', async () => {
    const req = new Request('http://localhost/api/search/users');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ results: [] });
  });

  it('returns 400 when query exceeds MAX_QUERY_LENGTH', async () => {
    const longQuery = 'a'.repeat(150);
    const req = new Request(`http://localhost/api/search/users?q=${longQuery}`);
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Query too long');
  });

  it('returns search results matching query', async () => {
    const mockUserRow = {
      id: 'usr_3',
      name: 'Sam',
      username: 'sam_reads',
      bio: 'Novel enthusiast',
      image: null,
      theme: 'sepia',
      createdAt: new Date('2026-03-01'),
      totalEntries: 20,
    };

    dbState.selectQueue.push([mockUserRow]);

    const req = new Request('http://localhost/api/search/users?q=sam');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results).toHaveLength(1);
    expect(data.results[0].username).toBe('sam_reads');
  });
});

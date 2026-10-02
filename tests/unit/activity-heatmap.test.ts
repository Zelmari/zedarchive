import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbCalls = vi.hoisted(() => ({ innerJoin: 0 }));

vi.mock('@/lib/db', () => {
  const rows = [{ day: '2026-01-02', count: 3 }];
  const makeChain = () => {
    const chain = Promise.resolve(rows) as Promise<typeof rows> & Record<string, unknown>;
    chain.innerJoin = () => {
      dbCalls.innerJoin++;
      return chain;
    };
    chain.where = () => chain;
    chain.groupBy = () => chain;
    return chain;
  };
  return {
    db: {
      select: () => ({
        from: () => makeChain(),
      }),
    },
  };
});

import { getYearlyActivityHeatmapForUser } from '@/server/queries/activity';

describe('getYearlyActivityHeatmapForUser privacy filtering', () => {
  beforeEach(() => {
    dbCalls.innerJoin = 0;
  });

  it('filters private entries for anonymous viewers', async () => {
    const map = await getYearlyActivityHeatmapForUser('user-1');
    expect(dbCalls.innerJoin).toBe(1);
    expect(map['2026-01-02']).toBe(3);
  });

  it('filters private entries for other logged-in viewers', async () => {
    await getYearlyActivityHeatmapForUser('user-1', 'viewer-2');
    expect(dbCalls.innerJoin).toBe(1);
  });

  it('does not filter private entries for the owner', async () => {
    await getYearlyActivityHeatmapForUser('user-1', 'user-1');
    expect(dbCalls.innerJoin).toBe(0);
  });
});

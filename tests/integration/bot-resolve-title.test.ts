import { describe, it, expect, beforeEach } from 'vitest';
import { resolvePersonalTitle } from '@/domain/media';
import { setDomainDb, type DbClient } from '@/domain/db-context';

describe('resolvePersonalTitle', () => {
  const userId = 'test-user-id';
  const testEntries = [
    {
      id: 'a0000000-0000-0000-0000-000000000001',
      userId,
      groupId: null,
      title: 'Attack on Titan',
      category: 'anime',
      status: 'completed',
    },
    {
      id: 'b0000000-0000-0000-0000-000000000002',
      userId,
      groupId: null,
      title: 'Attack on Titan: The Final Season',
      category: 'anime',
      status: 'in_progress',
    },
    {
      id: 'c0000000-0000-0000-0000-000000000003',
      userId,
      groupId: null,
      title: 'Steins;Gate',
      category: 'anime',
      status: 'completed',
    },
  ];

  beforeEach(() => {
    // Setup mock DB for domainDb()
    const mockDb = {
      select: () => ({
        from: () => {
          let filterFn: any = null;
          let limitCount = 100;

          const query: any = {
            where: (condition: any) => {
              filterFn = condition;
              return query;
            },
            limit: (n: number) => {
              limitCount = n;
              return query;
            },
            then: (onResolve: any) => {
              // Emulate query matching
              let results = [...testEntries];
              return Promise.resolve(onResolve(results.slice(0, limitCount)));
            },
          };

          return query;
        },
      }),
    };

    setDomainDb(mockDb as unknown as DbClient);
  });

  it('returns notFound when query is empty', async () => {
    const result = await resolvePersonalTitle(userId, '   ');
    expect(result.notFound).toBe(true);
  });

  it('resolves directly by UUID', async () => {
    const directMockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([testEntries[0]]),
          }),
        }),
      }),
    };
    setDomainDb(directMockDb as unknown as DbClient);

    const result = await resolvePersonalTitle(userId, 'a0000000-0000-0000-0000-000000000001');
    expect(result.entry?.id).toBe('a0000000-0000-0000-0000-000000000001');
    expect(result.entry?.title).toBe('Attack on Titan');
  });

  it('resolves by exact title match', async () => {
    let callCount = 0;
    const exactMockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: (n: number) => {
              callCount++;
              // Call 1 is exact match (limit 2)
              return Promise.resolve([testEntries[2]]);
            },
          }),
        }),
      }),
    };
    setDomainDb(exactMockDb as unknown as DbClient);

    const result = await resolvePersonalTitle(userId, 'Steins;Gate');
    expect(result.entry?.title).toBe('Steins;Gate');
  });

  it('returns ambiguous when multiple substring matches exist', async () => {
    const ambiguousMockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: (n: number) => {
              if (n === 2) {
                // Exact match finds nothing
                return Promise.resolve([]);
              }
              // Substring match finds two titles
              return Promise.resolve([testEntries[0], testEntries[1]]);
            },
          }),
        }),
      }),
    };
    setDomainDb(ambiguousMockDb as unknown as DbClient);

    const result = await resolvePersonalTitle(userId, 'Attack on Titan');
    expect(result.ambiguous).toHaveLength(2);
    expect(result.entry).toBeUndefined();
  });
});

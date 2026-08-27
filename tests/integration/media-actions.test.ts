import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration tests for media server actions with the database layer mocked.
 * The fake mirrors the slice of the Drizzle chain-builder API ZedArchive uses;
 * assertions focus on action-level behavior (sanitization, conflict
 * strategies, field fidelity) rather than SQL generation.
 */

type Row = Record<string, unknown>;

const dbState = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));

const { getAuthUserMock, logActivityMock, revalidatePathMock } = vi.hoisted(() => ({
  getAuthUserMock: vi.fn(),
  logActivityMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock('@/server/internal', () => ({
  getAuthUser: getAuthUserMock,
  getSessionUser: vi.fn(),
  logActivity: logActivityMock,
}));

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

vi.mock('@/lib/db', () => {
  type Row = Record<string, unknown>;

  function awaitable<T>(value: T) {
    const p = Promise.resolve(value) as Promise<T> & Record<string, unknown>;
    p.where = () => p;
    p.orderBy = () => p;
    p.limit = () => p;
    p.returning = () => p;
    return p;
  }

  function makeTx() {
    return {
      select: () => ({
        from: () => ({
          // Fixture-controlled: actions under test operate on the first row.
          where: () => awaitable(dbState.rows.length ? [dbState.rows[0]] : []),
        }),
      }),
      insert: () => ({
        values: (v: Row) => {
          const row = { createdAt: new Date(), updatedAt: new Date(), ...v };
          dbState.rows.push(row);
          return awaitable([row]);
        },
      }),
      update: () => ({
        set: (fields: Row) => ({
          // Fixture-controlled: single-row tables under test.
          where: () => {
            const target = dbState.rows[0];
            if (target) Object.assign(target, fields);
            return awaitable([target]);
          },
        }),
      }),
    };
  }

  return {
    db: {
      select: () => ({ from: () => awaitable(dbState.rows) }),
      insert: () => makeTx().insert(),
      update: () => makeTx().update(),
      delete: () => ({
        where: async () => {
          dbState.rows.length = 0;
        },
      }),
      transaction: async <T>(fn: (tx: ReturnType<typeof makeTx>) => Promise<T>) => fn(makeTx()),
    },
  };
});

import { createMediaEntry, updateMediaProgress, bulkImportMediaEntries } from '@/server/media';

describe('createMediaEntry', () => {
  beforeEach(() => {
    dbState.rows.length = 0;
    vi.clearAllMocks();
    getAuthUserMock.mockResolvedValue({ id: 'user-1' });
  });

  it('requires a title', async () => {
    await expect(createMediaEntry({ title: '   ' })).rejects.toThrow('Title is required');
  });

  it('clamps ratings into the 1–10 band', async () => {
    const high = await createMediaEntry({ title: 'Frieren', rating: 99 });
    expect(high.rating).toBe(10);

    dbState.rows.length = 0;
    const low = await createMediaEntry({ title: 'Frieren', rating: -3 });
    expect(low.rating).toBe(1);
  });

  it('maps blank ratings to null', async () => {
    const entry = await createMediaEntry({ title: 'Dune', rating: '' });
    expect(entry.rating).toBeNull();
  });

  it('sets completedAt only for completed status', async () => {
    const done = await createMediaEntry({ title: 'Monster', status: 'completed' });
    expect(done.status).toBe('completed');
    expect(typeof done.completedAt).toBe('string');

    dbState.rows.length = 0;
    const wip = await createMediaEntry({ title: 'Monster', status: 'in_progress' });
    expect(wip.completedAt).toBeNull();
  });

  it('writes an activity log alongside the entry', async () => {
    await createMediaEntry({ title: 'Steins;Gate' });
    expect(logActivityMock).toHaveBeenCalledTimes(1);
    expect(logActivityMock.mock.calls[0]?.[0]).toMatchObject({
      userId: 'user-1',
      actionType: 'created',
    });
  });
});

describe('updateMediaProgress', () => {
  beforeEach(() => {
    dbState.rows.length = 0;
    vi.clearAllMocks();
    getAuthUserMock.mockResolvedValue({ id: 'user-1' });
  });

  async function seedEntry(overrides: Row = {}) {
    return createMediaEntry({ title: 'Vinland Saga', ...overrides });
  }

  it('throws when the entry does not exist', async () => {
    await expect(updateMediaProgress('missing-id', { rating: 5 })).rejects.toThrow(
      'Entry not found',
    );
  });

  it('increments rewatchCount through the sanitizer floor', async () => {
    await seedEntry();
    const updated = await updateMediaProgress('whatever', { rewatchCount: -5 });
    // The fake applies the sanitized update fields onto the stored row.
    expect(updated.rewatchCount ?? (dbState.rows[0] as Row).rewatchCount).toBeGreaterThanOrEqual(0);
  });

  it('clears completedAt when leaving completed status', async () => {
    await seedEntry({ status: 'completed' });
    const updated = await updateMediaProgress('whatever', { status: 'on_hold' });
    expect(updated.completedAt).toBeNull();
  });

  it('logs a rating action with the entry snapshot', async () => {
    await seedEntry();
    await updateMediaProgress('whatever', { rating: 8 });
    expect(logActivityMock).toHaveBeenCalledTimes(2); // created + rating
    expect(logActivityMock.mock.calls[1]?.[0]?.actionType).toBe('rating');
    expect(logActivityMock.mock.calls[1]?.[0]?.details.rating).toBe(8);
  });

  it('clamps the stored current when lowering only the primary total', async () => {
    await seedEntry({ primaryUnitCurrent: 5, primaryUnitTotal: 10 });
    const updated = await updateMediaProgress('whatever', { primaryUnitTotal: 3 });
    expect(updated.primaryUnitCurrent).toBe(3);
    expect(updated.primaryUnitTotal).toBe(3);
  });

  it('clamps the stored current when lowering only the secondary total', async () => {
    await seedEntry({ secondaryUnitCurrent: 8, secondaryUnitTotal: 12 });
    const updated = await updateMediaProgress('whatever', { secondaryUnitTotal: 4 });
    expect(updated.secondaryUnitCurrent).toBe(4);
    expect(updated.secondaryUnitTotal).toBe(4);
  });

  it('clamps a raised current against the stored total', async () => {
    await seedEntry({ primaryUnitCurrent: 1, primaryUnitTotal: 3 });
    const updated = await updateMediaProgress('whatever', { primaryUnitCurrent: 10 });
    expect(updated.primaryUnitCurrent).toBe(3);
  });

  it('leaves progress unbounded when the total is null', async () => {
    await seedEntry({ primaryUnitCurrent: 5, primaryUnitTotal: null });
    const updated = await updateMediaProgress('whatever', { primaryUnitCurrent: 99 });
    expect(updated.primaryUnitCurrent).toBe(99);
  });

  it('clamps when current and total update simultaneously', async () => {
    await seedEntry({ primaryUnitCurrent: 2, primaryUnitTotal: 4 });
    const updated = await updateMediaProgress('whatever', {
      primaryUnitCurrent: 9,
      primaryUnitTotal: 3,
    });
    expect(updated.primaryUnitCurrent).toBe(3);
    expect(updated.primaryUnitTotal).toBe(3);
  });
});

describe('bulkImportMediaEntries', () => {
  beforeEach(() => {
    dbState.rows.length = 0;
    vi.clearAllMocks();
    getAuthUserMock.mockResolvedValue({ id: 'user-1' });
  });

  it('preserves full metadata fidelity (regression: dropped fields)', async () => {
    const result = await bulkImportMediaEntries([
      {
        title: 'Berserk',
        category: 'manga',
        rewatchCount: 3,
        startedAt: '2026-01-15T00:00:00.000Z',
        synopsis: 'The Golden Age arc.',
        genres: ['seinen', 'dark fantasy'],
      },
    ]);

    expect(result.added).toBe(1);
    const row = dbState.rows[0];
    expect(row?.rewatchCount).toBe(3);
    expect(
      row?.startedAt instanceof Date ? (row.startedAt as Date).toISOString() : row?.startedAt,
    ).toBe('2026-01-15T00:00:00.000Z');
    expect(row?.synopsis).toBe('The Golden Age arc.');
    expect(row?.genres).toEqual(['seinen', 'dark fantasy']);
  });

  it('skips intra-batch duplicates instead of inserting twice', async () => {
    const result = await bulkImportMediaEntries([
      { title: 'Severance', category: 'show' },
      { title: 'Severance', category: 'show' },
    ]);

    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);
    expect(dbState.rows).toHaveLength(1);
  });

  it('honors skip against pre-existing library entries', async () => {
    dbState.rows.push({
      id: 'existing-1',
      sourceId: null,
      category: 'show',
      title: 'Succession',
    });

    const result = await bulkImportMediaEntries([{ title: 'Succession', category: 'show' }]);
    expect(result.skipped).toBe(1);
    expect(result.added).toBe(0);
  });

  it('overwrites matching entries under the overwrite strategy', async () => {
    dbState.rows.push({
      id: 'existing-1',
      sourceId: 'tvmaze-1',
      category: 'show',
      title: 'Old Title',
      rating: null,
    });

    const result = await bulkImportMediaEntries(
      [{ title: 'New Title', category: 'show', sourceId: 'tvmaze-1', rating: 9 }],
      'overwrite',
    );

    expect(result.updated).toBe(1);
    const row = dbState.rows[0];
    expect(row?.title).toBe('New Title');
    expect(row?.rating).toBe(9);
  });

  it('clamps imported currents against their non-null totals', async () => {
    const result = await bulkImportMediaEntries([
      {
        title: 'Gap Show',
        category: 'show',
        primaryUnitCurrent: 7,
        primaryUnitTotal: 3,
        secondaryUnitCurrent: 50,
        secondaryUnitTotal: 12,
      },
    ]);

    expect(result.added).toBe(1);
    expect(dbState.rows[0]?.primaryUnitCurrent).toBe(3);
    expect(dbState.rows[0]?.secondaryUnitCurrent).toBe(12);
  });

  it('leaves imported progress unbounded when totals are absent', async () => {
    const result = await bulkImportMediaEntries([
      { title: 'Ongoing', category: 'show', primaryUnitCurrent: 7, secondaryUnitCurrent: 50 },
    ]);

    expect(result.added).toBe(1);
    expect(dbState.rows[0]?.primaryUnitCurrent).toBe(7);
    expect(dbState.rows[0]?.secondaryUnitCurrent).toBe(50);
  });

  it('normalizes mixed-case statuses and stamps completedAt for them', async () => {
    await bulkImportMediaEntries([
      { title: 'Loud Show', status: 'COMPLETED' },
      { title: 'Quiet Show', status: 'Completed' },
    ]);

    const first = dbState.rows[0];
    const second = dbState.rows[1];
    expect(first?.status).toBe('completed');
    expect(second?.status).toBe('completed');
    expect(first?.completedAt).toBeInstanceOf(Date);
    expect(second?.completedAt).toBeInstanceOf(Date);
  });

  it('clears completedAt on non-completed imported items even when a date is present', async () => {
    await bulkImportMediaEntries([
      { title: 'Not Done', status: 'in_progress', completedAt: '2026-01-01T00:00:00.000Z' },
      { title: 'Planning', status: 'planning', completedAt: '2026-01-01T00:00:00.000Z' },
    ]);

    expect(dbState.rows[0]?.completedAt).toBeNull();
    expect(dbState.rows[1]?.completedAt).toBeNull();
  });

  it('honors an explicit completion date over the fallback timestamp', async () => {
    await bulkImportMediaEntries([
      { title: 'Archived Long Ago', status: 'completed', completedAt: '2019-03-14T00:00:00.000Z' },
    ]);

    expect((dbState.rows[0]?.completedAt as Date).toISOString()).toBe('2019-03-14T00:00:00.000Z');
  });

  it('skips null, primitive, and title-less array elements instead of aborting', async () => {
    const result = await bulkImportMediaEntries([
      null,
      42,
      'nope',
      {},
      { title: '   ' },
      { title: 'Survivor' },
    ]);

    expect(result.added).toBe(1);
    expect(dbState.rows[0]?.title).toBe('Survivor');
  });

  it('caps imports at 1,000 items', async () => {
    const items = Array.from({ length: 1100 }, (_, i) => ({ title: `Show ${i}` }));
    const result = await bulkImportMediaEntries(items);
    expect(result.added).toBe(1000);
    expect(dbState.rows).toHaveLength(1000);
  });
});

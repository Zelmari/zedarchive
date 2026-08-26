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
      transaction: async <T,>(fn: (tx: ReturnType<typeof makeTx>) => Promise<T>) =>
        fn(makeTx()),
    },
  };
});

import {
  createMediaEntry,
  updateMediaProgress,
  bulkImportMediaEntries,
} from '@/server/media';

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
      'Entry not found'
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
    expect(row?.startedAt instanceof Date ? (row.startedAt as Date).toISOString() : row?.startedAt).toBe(
      '2026-01-15T00:00:00.000Z'
    );
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
      'overwrite'
    );

    expect(result.updated).toBe(1);
    const row = dbState.rows[0];
    expect(row?.title).toBe('New Title');
    expect(row?.rating).toBe(9);
  });
});

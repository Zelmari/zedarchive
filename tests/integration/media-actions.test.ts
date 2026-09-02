import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration tests for media server actions with the database layer mocked.
 * The fake mirrors the slice of the Drizzle chain-builder API ZedArchive uses;
 * assertions focus on action-level behavior (sanitization, conflict
 * strategies, field fidelity) rather than SQL generation.
 */

type Row = Record<string, unknown>;

const dbState = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  memberships: [] as Array<Record<string, unknown>>,
}));

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

import { createMockDb } from '../helpers/db-mock';

vi.mock('@/lib/db', () => ({
  db: createMockDb(dbState),
}));

import {
  createMediaEntry,
  updateMediaProgress,
  bulkImportMediaEntries,
  addMediaCycle,
  updateMediaCycle,
  deleteMediaCycle,
  addMediaQuote,
  updateMediaQuote,
  deleteMediaQuote,
  togglePriorityQueue,
  reorderPriorityQueue,
} from '@/server/media';

describe('createMediaEntry', () => {
  beforeEach(() => {
    dbState.rows.length = 0;
    dbState.memberships.length = 0;
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
    dbState.memberships.length = 0;
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

  it('rejects updates with validation errors', async () => {
    await seedEntry();
    await expect(updateMediaProgress('whatever', { title: 'a'.repeat(501) })).rejects.toThrow(
      /Validation failed/,
    );
  });

  it('rejects stale offline updates when entry has been updated since', async () => {
    const entry = await seedEntry();
    const staleDate = new Date(Date.now() - 60000).toISOString();
    await expect(
      updateMediaProgress(entry.id, {
        rating: 9,
        _offlineUpdatedAt: staleDate,
      }),
    ).rejects.toThrow('Entry was modified since offline mutation was created');
  });

  it('prevents associating personal entry with a group via update', async () => {
    const entry = await seedEntry();
    await expect(
      updateMediaProgress(entry.id, {
        groupId: 'group-hack',
      }),
    ).rejects.toThrow('Cannot move personal entry to group via update');
  });
});

describe('bulkImportMediaEntries', () => {
  beforeEach(() => {
    dbState.rows.length = 0;
    dbState.memberships.length = 0;
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

  it('supports movie category creation and progress updates', async () => {
    const movie = await createMediaEntry({
      title: 'Spirited Away',
      category: 'movie',
      status: 'in_progress',
      primaryUnitCurrent: 1,
      primaryUnitTotal: 1,
      secondaryUnitCurrent: 60,
      secondaryUnitTotal: 125,
      sourceId: 'tmdb-129',
    });

    expect(movie.category).toBe('movie');
    expect(movie.secondaryUnitCurrent).toBe(60);
    expect(movie.secondaryUnitTotal).toBe(125);

    const updated = await updateMediaProgress(movie.id, {
      secondaryUnitCurrent: 125,
      status: 'completed',
    });

    expect(updated.status).toBe('completed');
    expect(updated.secondaryUnitCurrent).toBe(125);
  });

  it('tracks dropped status, reason, and milestones during creation and updates', async () => {
    // 1. Create dropped item directly
    const dropped = await createMediaEntry({
      title: 'Dropped Manga',
      category: 'manga',
      status: 'dropped',
      dropReason: 'Pacing issues in arc 2',
      primaryUnitCurrent: 2,
      secondaryUnitCurrent: 15,
    });

    expect(dropped.status).toBe('dropped');
    expect(dropped.dropReason).toBe('Pacing issues in arc 2');
    expect(dropped.droppedProgressPrimary).toBe(2);
    expect(dropped.droppedProgressSecondary).toBe(15);
    expect(typeof dropped.droppedAt).toBe('string');

    // 2. Transition in_progress -> dropped
    dbState.rows.length = 0;
    const show = await createMediaEntry({
      title: 'Slow Anime',
      category: 'anime',
      status: 'in_progress',
      primaryUnitCurrent: 1,
      secondaryUnitCurrent: 6,
    });

    const markDropped = await updateMediaProgress(show.id, {
      status: 'dropped',
      dropReason: 'Lost interest / Bored',
    });

    expect(markDropped.status).toBe('dropped');
    expect(markDropped.dropReason).toBe('Lost interest / Bored');
    expect(markDropped.droppedProgressPrimary).toBe(1);
    expect(markDropped.droppedProgressSecondary).toBe(6);
    expect(typeof markDropped.droppedAt).toBe('string');
    expect(logActivityMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        actionType: 'status_change',
        details: expect.objectContaining({
          status: 'dropped',
          dropReason: 'Lost interest / Bored',
        }),
      }),
      expect.anything(),
    );

    // 3. Resume dropped -> in_progress (clears drop fields)
    const resumed = await updateMediaProgress(show.id, {
      status: 'in_progress',
    });

    expect(resumed.status).toBe('in_progress');
    expect(resumed.dropReason).toBeNull();
    expect(resumed.droppedAt).toBeNull();
    expect(resumed.droppedProgressPrimary).toBeNull();
    expect(resumed.droppedProgressSecondary).toBeNull();
  });

  it('imports dropped entries and preserves reason and dropped timestamps', async () => {
    const result = await bulkImportMediaEntries([
      {
        title: 'Legacy Dropped',
        category: 'show',
        status: 'dropped',
        dropReason: 'Disliked characters',
        droppedAt: '2026-05-01T00:00:00.000Z',
        primaryUnitCurrent: 3,
        secondaryUnitCurrent: 4,
      },
    ]);

    expect(result.added).toBe(1);
    expect(dbState.rows[0]?.dropReason).toBe('Disliked characters');
    expect(dbState.rows[0]?.droppedProgressPrimary).toBe(3);
    expect(dbState.rows[0]?.droppedProgressSecondary).toBe(4);
    expect((dbState.rows[0]?.droppedAt as Date).toISOString()).toBe('2026-05-01T00:00:00.000Z');
  });

  it('initializes cycle 1 on entry creation and supports rewatch cycles and CRUD', async () => {
    // 1. Creation automatically creates Cycle 1
    const entry = await createMediaEntry({
      title: 'Steins;Gate',
      category: 'anime',
      status: 'completed',
      primaryUnitCurrent: 1,
      secondaryUnitCurrent: 24,
      startedAt: '2023-01-01T00:00:00.000Z',
      completedAt: '2023-01-10T00:00:00.000Z',
      rating: 10,
    });

    expect(entry.cycles).toHaveLength(1);
    expect(entry.cycles[0]?.cycleNumber).toBe(1);
    expect(entry.cycles[0]?.startedAt).toBe('2023-01-01T00:00:00.000Z');
    expect(entry.cycles[0]?.completedAt).toBe('2023-01-10T00:00:00.000Z');

    // 2. Start a rewatch -> appends cycle 2, resets progress to 0, status to in_progress
    const rewatch = await updateMediaProgress(entry.id, {
      rewatch: true,
    });

    expect(rewatch.rewatchCount).toBe(1);
    expect(rewatch.status).toBe('in_progress');
    expect(rewatch.secondaryUnitCurrent).toBe(0);
    expect(rewatch.cycles).toHaveLength(2);
    expect(rewatch.cycles[1]?.cycleNumber).toBe(2);
    expect(rewatch.cycles[1]?.completedAt).toBeNull();

    // 3. Complete rewatch -> cycle 2 completedAt is recorded
    const completedRewatch = await updateMediaProgress(entry.id, {
      status: 'completed',
      completedAt: '2026-08-01T00:00:00.000Z',
    });

    expect(completedRewatch.cycles[1]?.completedAt).toBe('2026-08-01T00:00:00.000Z');

    // 4. Add a past cycle manually
    const withLoggedCycle = await addMediaCycle(entry.id, {
      startedAt: '2024-05-01T00:00:00.000Z',
      completedAt: '2024-05-15T00:00:00.000Z',
      rating: 9,
      notes: 'Summer rewatch',
    });

    expect(withLoggedCycle.cycles).toHaveLength(3);
    expect(withLoggedCycle.rewatchCount).toBe(2);
    expect(withLoggedCycle.cycles[2]?.notes).toBe('Summer rewatch');

    // 5. Update a cycle
    const cycleToUpdate = withLoggedCycle.cycles[2]!;
    const updatedCycle = await updateMediaCycle(entry.id, cycleToUpdate.id, {
      notes: 'Updated notes',
      rating: 10,
    });

    expect(updatedCycle.cycles[2]?.notes).toBe('Updated notes');
    expect(updatedCycle.cycles[2]?.rating).toBe(10);

    // 6. Delete a cycle
    const afterDelete = await deleteMediaCycle(entry.id, cycleToUpdate.id);
    expect(afterDelete.cycles).toHaveLength(2);
    expect(afterDelete.rewatchCount).toBe(1);
  });

  it('supports priority queue toggling, reordering, and retirement on completion', async () => {
    // 1. Create an entry not in queue
    const entry1 = await createMediaEntry({
      title: 'Chainsaw Man',
      category: 'anime',
      status: 'in_progress',
    });
    expect(entry1.priorityIndex).toBeNull();

    // 2. Toggle into queue -> assigned rank 1
    const queued1 = await togglePriorityQueue(entry1.id);
    expect(queued1.priorityIndex).toBe(1);

    // 3. Reorder queue
    await reorderPriorityQueue([entry1.id]);
    expect(dbState.rows[0]?.priorityIndex).toBe(1);

    // 4. Marking completed removes item from priority queue
    const completed = await updateMediaProgress(entry1.id, {
      status: 'completed',
    });
    expect(completed.priorityIndex).toBeNull();

    // 5. Toggle back into queue
    const requeued = await togglePriorityQueue(entry1.id);
    expect(requeued.priorityIndex).toBe(1);

    // 6. Toggle out of queue
    const unqueued = await togglePriorityQueue(entry1.id);
    expect(unqueued.priorityIndex).toBeNull();
  });
});

describe('group media authorization', () => {
  const groupEntryId = 'group-entry-1';

  beforeEach(() => {
    dbState.rows.length = 0;
    dbState.memberships.length = 0;
    vi.clearAllMocks();
    getAuthUserMock.mockResolvedValue({ id: 'user-1' });
    dbState.rows.push({
      id: groupEntryId,
      userId: 'group-owner',
      groupId: 'group-1',
      title: 'Shared Archive',
      category: 'show',
      status: 'in_progress',
      isPrivate: false,
      cycles: [],
      quotes: [],
      updatedAt: new Date('2026-08-25T00:00:00Z'),
      startedAt: null,
      completedAt: null,
      rewatchCount: 0,
      primaryUnitCurrent: 1,
      primaryUnitTotal: 1,
      secondaryUnitCurrent: 0,
      secondaryUnitTotal: null,
      priorityIndex: null,
    });
    dbState.memberships.push({
      id: 'membership-1',
      groupId: 'group-1',
      userId: 'user-1',
    });
  });

  it('lets a group member add, update, and delete a quote', async () => {
    const added = await addMediaQuote(groupEntryId, {
      text: 'The archive remembers.',
      speaker: 'Archivist',
    });
    const quoteId = added.quotes[0]!.id;

    const updated = await updateMediaQuote(groupEntryId, quoteId, {
      text: 'The archive remembers everything.',
    });
    expect(updated.quotes[0]?.text).toBe('The archive remembers everything.');

    const deleted = await deleteMediaQuote(groupEntryId, quoteId);
    expect(deleted.quotes).toHaveLength(0);
  });

  it('hides group entries from non-members', async () => {
    dbState.memberships.length = 0;

    await expect(addMediaQuote(groupEntryId, { text: 'A private group quote.' })).rejects.toThrow(
      'Entry not found',
    );
  });

  it('rejects group cycle writes through both cycle APIs', async () => {
    await expect(addMediaCycle(groupEntryId, {})).rejects.toThrow('Entry not found');
    await expect(
      updateMediaProgress(groupEntryId, {
        cycles: [{ startedAt: '2026-08-25T00:00:00.000Z' }],
      }),
    ).rejects.toThrow('Entry not found');
  });
});

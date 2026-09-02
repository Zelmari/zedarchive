import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, type MockRow } from '../helpers/db-mock';

/**
 * Integration tests for stack server actions with the database layer mocked.
 * The fake does not evaluate Drizzle predicates, so read results are supplied
 * through selectQueue and mutation payloads are inspected directly. This
 * still covers authorization, sanitization, validation, and revalidation.
 */

const { getAuthUserMock, revalidatePathMock } = vi.hoisted(() => ({
  getAuthUserMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

const dbState = vi.hoisted(() => ({
  rows: [] as MockRow[],
  selectQueue: [] as MockRow[][],
  inserted: [] as MockRow[],
  deletedTables: [] as string[],
  updates: [] as Array<{ table: string; fields: MockRow }>,
}));

vi.mock('@/server/internal', () => ({
  getAuthUser: getAuthUserMock,
  getSessionUser: vi.fn(),
  logActivity: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

vi.mock('@/lib/db', () => ({
  db: createMockDb(dbState),
}));

import {
  addStackItemAction,
  removeStackItemAction,
  reorderStackItemsAction,
  updateStackItemAnnotationAction,
  updateStackAction,
} from '@/server/stacks';

const stack = {
  id: 'stack-1',
  userId: 'user-1',
  title: 'Favorites',
  slug: 'favorites-abc',
  description: null,
  isPublic: true,
};

function queueOwnedStack() {
  dbState.selectQueue.push([stack]);
}

function expectPublicStackRevalidation() {
  expect(revalidatePathMock).toHaveBeenCalledWith('/stacks');
  expect(revalidatePathMock).toHaveBeenCalledWith('/u/tester/stacks/favorites-abc');
}

describe('addStackItemAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.rows.length = 0;
    dbState.selectQueue.length = 0;
    dbState.inserted.length = 0;
    dbState.deletedTables.length = 0;
    dbState.updates.length = 0;
    getAuthUserMock.mockResolvedValue({ id: 'user-1', username: 'tester' });
  });

  it('appends an item and trims/caps its annotation', async () => {
    const annotation = `  ${'A'.repeat(2_100)}  `;
    queueOwnedStack();
    dbState.selectQueue.push([{ id: 'media-1' }], [], [{ orderIndex: 4 }]);

    const added = await addStackItemAction({
      stackId: stack.id,
      mediaId: 'media-1',
      annotation,
    });

    expect(added.orderIndex).toBe(5);
    expect(added.annotation).toBe('A'.repeat(2_000));
    expect(dbState.inserted[0]).toMatchObject({
      stackId: stack.id,
      mediaId: 'media-1',
      orderIndex: 5,
      annotation: 'A'.repeat(2_000),
    });
    expectPublicStackRevalidation();
  });

  it('rejects a stack owned by another user', async () => {
    dbState.selectQueue.push([]);

    await expect(
      addStackItemAction({ stackId: 'someone-elses-stack', mediaId: 'media-1' }),
    ).rejects.toThrow('Stack not found');
    expect(dbState.inserted).toHaveLength(0);
  });

  it('rejects media owned by another user', async () => {
    queueOwnedStack();
    dbState.selectQueue.push([]);

    await expect(
      addStackItemAction({ stackId: stack.id, mediaId: 'someone-elses-media' }),
    ).rejects.toThrow('Media entry not found');
    expect(dbState.inserted).toHaveLength(0);
  });

  it('rejects duplicate media in a stack', async () => {
    queueOwnedStack();
    dbState.selectQueue.push([{ id: 'media-1' }], [{ id: 'existing-item' }]);

    await expect(addStackItemAction({ stackId: stack.id, mediaId: 'media-1' })).rejects.toThrow(
      'already in this stack',
    );
    expect(dbState.inserted).toHaveLength(0);
  });
});

describe('removeStackItemAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.rows.length = 0;
    dbState.selectQueue.length = 0;
    dbState.inserted.length = 0;
    dbState.deletedTables.length = 0;
    dbState.updates.length = 0;
    getAuthUserMock.mockResolvedValue({ id: 'user-1', username: 'tester' });
  });

  it('requires ownership before deleting an item', async () => {
    dbState.selectQueue.push([]);

    await expect(
      removeStackItemAction({ stackId: 'someone-elses-stack', itemId: 'item-1' }),
    ).rejects.toThrow('Stack not found');
    expect(dbState.deletedTables).toHaveLength(0);
  });

  it('deletes from the requested stack and revalidates its public page', async () => {
    queueOwnedStack();

    const result = await removeStackItemAction({
      stackId: stack.id,
      itemId: 'item-1',
    });

    expect(result).toEqual({ success: true });
    expect(dbState.deletedTables).toContain('stack_items');
    expectPublicStackRevalidation();
  });
});

describe('reorderStackItemsAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.rows.length = 0;
    dbState.selectQueue.length = 0;
    dbState.inserted.length = 0;
    dbState.deletedTables.length = 0;
    dbState.updates.length = 0;
    getAuthUserMock.mockResolvedValue({ id: 'user-1', username: 'tester' });
  });

  it('rejects ordered lists with missing or extra ids', async () => {
    queueOwnedStack();
    dbState.selectQueue.push([{ id: 'item-1' }, { id: 'item-2' }]);

    await expect(
      reorderStackItemsAction({
        stackId: stack.id,
        orderedIds: ['item-1', 'item-3'],
      }),
    ).rejects.toThrow('exactly the stack items');
    expect(dbState.updates).toHaveLength(0);
  });

  it('writes zero-based order indexes for the complete ordered list', async () => {
    queueOwnedStack();
    dbState.selectQueue.push([{ id: 'item-1' }, { id: 'item-2' }]);

    await expect(
      reorderStackItemsAction({
        stackId: stack.id,
        orderedIds: ['item-2', 'item-1'],
      }),
    ).resolves.toEqual({ success: true });

    expect(dbState.updates.map(({ fields }) => fields.orderIndex)).toEqual([0, 1]);
    expectPublicStackRevalidation();
  });
});

describe('updateStackItemAnnotationAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.rows.length = 0;
    dbState.selectQueue.length = 0;
    dbState.inserted.length = 0;
    dbState.deletedTables.length = 0;
    dbState.updates.length = 0;
    getAuthUserMock.mockResolvedValue({ id: 'user-1', username: 'tester' });
  });

  it('normalizes an empty annotation to null', async () => {
    queueOwnedStack();
    dbState.rows.push({
      id: 'item-1',
      stackId: stack.id,
      mediaId: 'media-1',
      annotation: 'old annotation',
    });

    const updated = await updateStackItemAnnotationAction({
      stackId: stack.id,
      itemId: 'item-1',
      annotation: '   ',
    });

    expect(updated.annotation).toBeNull();
    expect(dbState.updates[0]?.fields.annotation).toBeNull();
    expectPublicStackRevalidation();
  });
});

describe('updateStackAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.rows.length = 0;
    dbState.selectQueue.length = 0;
    dbState.inserted.length = 0;
    dbState.deletedTables.length = 0;
    dbState.updates.length = 0;
    getAuthUserMock.mockResolvedValue({ id: 'user-1', username: 'tester' });
  });

  it('requires a non-empty title when a title is provided', async () => {
    queueOwnedStack();
    dbState.rows.push({ ...stack });

    await expect(updateStackAction({ stackId: stack.id, title: '   ' })).rejects.toThrow(
      'Stack title is required',
    );
    expect(dbState.updates).toHaveLength(0);
  });

  it('updates metadata without changing the stable slug', async () => {
    queueOwnedStack();
    dbState.rows.push({ ...stack });

    const updated = await updateStackAction({
      stackId: stack.id,
      title: '  New Favorites  ',
      description: '  A refreshed introduction.  ',
      isPublic: false,
    });

    expect(updated.title).toBe('New Favorites');
    expect(updated.description).toBe('A refreshed introduction.');
    expect(updated.slug).toBe(stack.slug);
    expect(dbState.updates[0]?.fields).toMatchObject({
      title: 'New Favorites',
      description: 'A refreshed introduction.',
      isPublic: false,
    });
    // The old public route is invalidated when visibility changes to private.
    expectPublicStackRevalidation();
  });
});

describe('stack action authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.rows.length = 0;
    dbState.selectQueue.length = 0;
    dbState.inserted.length = 0;
    dbState.deletedTables.length = 0;
    dbState.updates.length = 0;
    getAuthUserMock.mockRejectedValue(new Error('Unauthorized'));
  });

  it('rejects unauthenticated mutations', async () => {
    await expect(addStackItemAction({ stackId: stack.id, mediaId: 'media-1' })).rejects.toThrow(
      'Unauthorized',
    );
    await expect(removeStackItemAction({ stackId: stack.id, itemId: 'item-1' })).rejects.toThrow(
      'Unauthorized',
    );
    await expect(reorderStackItemsAction({ stackId: stack.id, orderedIds: [] })).rejects.toThrow(
      'Unauthorized',
    );
    await expect(
      updateStackItemAnnotationAction({
        stackId: stack.id,
        itemId: 'item-1',
        annotation: null,
      }),
    ).rejects.toThrow('Unauthorized');
    await expect(updateStackAction({ stackId: stack.id, title: 'New title' })).rejects.toThrow(
      'Unauthorized',
    );
  });
});

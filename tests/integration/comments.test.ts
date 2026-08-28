import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '../helpers/db-mock';

const { getAuthUserMock, revalidatePathMock } = vi.hoisted(() => ({
  getAuthUserMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock('@/server/internal', () => ({
  getAuthUser: getAuthUserMock,
  getSessionUser: vi.fn(),
  logActivity: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

const dbState = vi.hoisted(() => ({
  selectQueue: [] as Array<Array<Record<string, unknown>>>,
  inserted: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/db', () => ({
  db: createMockDb(dbState),
}));

import { createProfileComment } from '@/server/comments';

describe('createProfileComment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.selectQueue.length = 0;
    dbState.inserted.length = 0;
    getAuthUserMock.mockResolvedValue({ id: 'user-1' });
  });

  it('rejects comments from authors whose archive is not public', async () => {
    dbState.selectQueue.push(
      [{ id: 'profile-1', username: 'other', isPublic: true }],
      [{ id: 'user-1', username: 'me-user', name: 'Me', image: null, isPublic: false }],
    );

    await expect(createProfileComment('profile-1', 'hello')).rejects.toThrow(
      'Your own archive must be public to comment',
    );
  });

  it('rejects comments from public authors without a username handle', async () => {
    dbState.selectQueue.push(
      [{ id: 'profile-1', username: 'other', isPublic: true }],
      [{ id: 'user-1', username: null, name: 'Me', image: null, isPublic: true }],
    );

    await expect(createProfileComment('profile-1', 'hello')).rejects.toThrow(
      'A username handle is required to comment',
    );
    expect(dbState.inserted).toHaveLength(0);
  });

  it('creates the comment and revalidates the target profile', async () => {
    dbState.selectQueue.push(
      [{ id: 'profile-1', username: 'other', isPublic: true }],
      [{ id: 'user-1', username: 'me-user', name: 'Me', image: null, isPublic: true }],
      [{ value: 0 }],
    );

    const saved = await createProfileComment('profile-1', 'hello');
    expect(saved.authorUsername).toBe('me-user');
    expect(dbState.inserted).toHaveLength(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/u/other');
  });

  it('never revalidates a /u/ path when the target lacks a handle', async () => {
    dbState.selectQueue.push(
      [{ id: 'profile-1', username: null, isPublic: true }],
      [{ id: 'user-1', username: 'me-user', name: 'Me', image: null, isPublic: true }],
      [{ value: 0 }],
    );

    await createProfileComment('profile-1', 'hello');
    const paths = revalidatePathMock.mock.calls.map(([p]) => String(p));
    expect(paths.some((p) => p.startsWith('/u/'))).toBe(false);
  });
});

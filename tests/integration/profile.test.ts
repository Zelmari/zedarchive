import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MAX_NAME_LENGTH } from '@/lib/constants';

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

const dbState = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));

vi.mock('@/lib/db', () => {
  type Row = Record<string, unknown>;

  function awaitable<T>(value: T) {
    const p = Promise.resolve(value) as Promise<T> & Record<string, unknown>;
    p.where = () => p;
    p.returning = () => p;
    return p;
  }

  return {
    db: {
      select: () => ({ from: () => ({ where: () => awaitable(dbState.rows) }) }),
      update: () => ({
        set: (fields: Row) => ({
          where: () => {
            const target = dbState.rows[0];
            if (target) Object.assign(target, fields);
            return awaitable([target]);
          },
        }),
      }),
    },
  };
});

import { updateUserProfile } from '@/server/profile';

describe('updateUserProfile display name', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.rows.length = 0;
    getAuthUserMock.mockResolvedValue({ id: 'user-1' });
    dbState.rows.push({
      id: 'user-1',
      name: 'Old Name',
      username: 'zelmari',
      isPublic: true,
      bio: null,
      theme: 'parchment',
    });
  });

  it('persists the display name', async () => {
    const updated = await updateUserProfile({ name: 'Zel' });
    expect(updated?.name).toBe('Zel');
    expect(dbState.rows[0]?.name).toBe('Zel');
  });

  it('rejects empty and whitespace-only names without writing', async () => {
    await expect(updateUserProfile({ name: '' })).rejects.toThrow('Display name cannot be empty');
    await expect(updateUserProfile({ name: '   ' })).rejects.toThrow(
      'Display name cannot be empty',
    );
    expect(dbState.rows[0]?.name).toBe('Old Name');
  });

  it('trims and caps names at MAX_NAME_LENGTH', async () => {
    const updated = await updateUserProfile({ name: `  ${'x'.repeat(MAX_NAME_LENGTH + 50)}  ` });
    expect(updated?.name).toBe('x'.repeat(MAX_NAME_LENGTH));
  });

  it('revalidates dashboard, settings, and the public profile', async () => {
    await updateUserProfile({ name: 'Zel' });
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard');
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings');
    expect(revalidatePathMock).toHaveBeenCalledWith('/u/zelmari');
  });

  it('never revalidates a /u/ path when the username is null', async () => {
    dbState.rows[0] = { ...(dbState.rows[0] as object), username: null };
    await updateUserProfile({ name: 'Zel' });
    const paths = revalidatePathMock.mock.calls.map(([p]) => String(p));
    expect(paths.some((p) => p.startsWith('/u/'))).toBe(false);
  });

  it('rejects going public without a handle', async () => {
    dbState.rows[0] = { ...(dbState.rows[0] as object), username: null, isPublic: false };
    await expect(updateUserProfile({ isPublic: true })).rejects.toThrow(
      'A username handle is required to make your archive public',
    );
  });

  it('rejects clearing the handle while the archive stays public', async () => {
    dbState.rows[0] = { ...(dbState.rows[0] as object), username: 'zelmari', isPublic: true };
    await expect(updateUserProfile({ username: '' })).rejects.toThrow(
      'A username handle is required to make your archive public',
    );
  });

  it('allows going public once a handle exists', async () => {
    dbState.rows[0] = { ...(dbState.rows[0] as object), username: 'zelmari', isPublic: false };
    const updated = await updateUserProfile({ isPublic: true });
    expect(updated?.isPublic).toBe(true);
  });

  it('allows clearing the handle while the archive is private', async () => {
    dbState.rows[0] = { ...(dbState.rows[0] as object), username: 'zelmari', isPublic: false };
    const updated = await updateUserProfile({ username: '' });
    expect(updated?.username).toBeNull();
  });
});

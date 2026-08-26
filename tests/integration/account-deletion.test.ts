import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getAuthUserMock, signInEmailMock } = vi.hoisted(() => ({
  getAuthUserMock: vi.fn(),
  signInEmailMock: vi.fn(),
}));

vi.mock('@/server/internal', () => ({
  getAuthUser: getAuthUserMock,
  getSessionUser: vi.fn(),
  logActivity: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      signInEmail: signInEmailMock,
    },
  },
}));

const dbState = vi.hoisted(() => ({
  accounts: [] as Array<Record<string, unknown>>,
  deletedTables: [] as string[],
}));

import { getTableName } from 'drizzle-orm';

vi.mock('@/lib/db', () => {
  function awaitable<T>(val: T) {
    const p = Promise.resolve(val) as Promise<T> & Record<string, unknown>;
    p.where = () => p;
    return p;
  }

  const makeTx = () => ({
    delete: (table: any) => {
      const name = getTableName(table) || 'unknown';
      dbState.deletedTables.push(name);
      return {
        where: () => Promise.resolve(),
      };
    },
  });

  return {
    db: {
      select: () => ({
        from: () => ({
          where: () => awaitable(dbState.accounts),
        }),
      }),
      transaction: async (fn: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) => fn(makeTx()),
    },
  };
});

import { deleteAccount } from '@/server/account';

describe('account self-deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.accounts = [];
    dbState.deletedTables = [];
    getAuthUserMock.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });
  });

  it('rejects credential account deletion when password is omitted or invalid', async () => {
    dbState.accounts = [{ providerId: 'credential', password: 'hashed_password' }];
    signInEmailMock.mockRejectedValue(new Error('Invalid password'));

    const resNoPass = await deleteAccount({});
    expect(resNoPass.success).toBe(false);
    expect(resNoPass.error).toContain('Password is required');

    const resWrongPass = await deleteAccount({ password: 'wrongpassword' });
    expect(resWrongPass.success).toBe(false);
    expect(resWrongPass.error).toContain('Incorrect password');
    expect(dbState.deletedTables).toHaveLength(0);
  });

  it('atomically cascades deletion across all tables when password is correct', async () => {
    dbState.accounts = [{ providerId: 'credential', password: 'hashed_password' }];
    signInEmailMock.mockResolvedValue({ user: { id: 'user-1' } });

    const res = await deleteAccount({ password: 'correctpassword' });
    expect(res.success).toBe(true);
    expect(dbState.deletedTables).toContain('profile_comments');
    expect(dbState.deletedTables).toContain('media_activity_logs');
    expect(dbState.deletedTables).toContain('media_entries');
    expect(dbState.deletedTables).toContain('account');
    expect(dbState.deletedTables).toContain('session');
    expect(dbState.deletedTables).toContain('user');
  });

  it('handles OAuth-only account with confirmation string', async () => {
    dbState.accounts = [{ providerId: 'google', password: null }];

    const resBadConfirm = await deleteAccount({ confirmation: 'no' });
    expect(resBadConfirm.success).toBe(false);
    expect(resBadConfirm.error).toContain('delete my account');
    expect(dbState.deletedTables).toHaveLength(0);

    const resGoodConfirm = await deleteAccount({ confirmation: 'delete my account' });
    expect(resGoodConfirm.success).toBe(true);
    expect(dbState.deletedTables).toHaveLength(6);
  });
});

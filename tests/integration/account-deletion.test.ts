import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '../helpers/db-mock';

const { getAuthUserMock, verifyPasswordMock } = vi.hoisted(() => ({
  getAuthUserMock: vi.fn(),
  verifyPasswordMock: vi.fn(),
}));

vi.mock('@/server/internal', () => ({
  getAuthUser: getAuthUserMock,
  getSessionUser: vi.fn(),
  logActivity: vi.fn(),
}));

vi.mock('better-auth/crypto', () => ({
  verifyPassword: verifyPasswordMock,
}));

const dbState = vi.hoisted(() => ({
  accounts: [] as Array<Record<string, unknown>>,
  deletedTables: [] as string[],
  ownedGroups: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/db', () => ({
  db: createMockDb(dbState),
}));

import { deleteAccount } from '@/server/account';

describe('account self-deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.accounts = [];
    dbState.deletedTables = [];
    dbState.ownedGroups = [];
    getAuthUserMock.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });
  });

  it('rejects credential account deletion when password is omitted or invalid', async () => {
    dbState.accounts = [{ providerId: 'credential', password: 'hashed_password' }];
    verifyPasswordMock.mockResolvedValue(false);

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
    verifyPasswordMock.mockResolvedValue(true);

    const res = await deleteAccount({ password: 'correctpassword' });
    expect(res.success).toBe(true);
    expect(dbState.deletedTables).toContain('profile_comments');
    expect(dbState.deletedTables).toContain('media_activity_logs');
    expect(dbState.deletedTables).toContain('media_entries');
    expect(dbState.deletedTables).toContain('discord_links');
    expect(dbState.deletedTables).toContain('discord_link_codes');
    expect(dbState.deletedTables).toContain('account');
    expect(dbState.deletedTables).toContain('session');
    expect(dbState.deletedTables).toContain('verification');
    expect(dbState.deletedTables).toContain('user');
  });

  it('blocks deletion while the user still owns a group', async () => {
    dbState.accounts = [{ providerId: 'credential', password: 'hashed_password' }];
    dbState.ownedGroups = [{ id: 'g1', name: 'Book Club' }];
    verifyPasswordMock.mockResolvedValue(true);

    const res = await deleteAccount({ password: 'correctpassword' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Book Club/);
    expect(dbState.deletedTables).toHaveLength(0);
  });
});

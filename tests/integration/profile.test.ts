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

import { createMockDb } from '../helpers/db-mock';

vi.mock('@/lib/db', () => ({
  db: createMockDb(dbState),
}));

import { updateUserProfile, getPublicUserProfile } from '@/server/profile';

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

  it('stores a valid data-URL avatar', async () => {
    const updated = await updateUserProfile({ image: 'data:image/png;base64,AAAA' });
    expect(updated?.image).toBe('data:image/png;base64,AAAA');
  });

  it('stores a valid HTTPS avatar URL', async () => {
    const updated = await updateUserProfile({ image: 'https://example.com/avatar.png' });
    expect(updated?.image).toBe('https://example.com/avatar.png');
  });

  it('clears the avatar with null or an empty string', async () => {
    dbState.rows[0] = { ...(dbState.rows[0] as object), image: 'data:image/png;base64,AAAA' };
    await updateUserProfile({ image: null });
    expect(dbState.rows[0]?.image).toBeNull();
    dbState.rows[0] = { ...(dbState.rows[0] as object), image: 'data:image/png;base64,AAAA' };
    await updateUserProfile({ image: '' });
    expect(dbState.rows[0]?.image).toBeNull();
  });

  it('rejects non-image avatar values', async () => {
    await expect(updateUserProfile({ image: 'javascript:alert(1)' })).rejects.toThrow(
      'Invalid avatar',
    );
    await expect(updateUserProfile({ image: 'https://' + 'x'.repeat(2_000_000) })).rejects.toThrow(
      'Invalid avatar',
    );
  });
});

describe('getPublicUserProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.rows.length = 0;
    getAuthUserMock.mockResolvedValue({ id: 'user-1' });
  });

  it('includes image and theme in the public profile result', async () => {
    dbState.rows.push({
      id: 'user-1',
      name: 'Zel',
      username: 'zelmari',
      bio: 'hello',
      image: 'data:image/png;base64,AAAA',
      theme: 'midnight',
      isPublic: true,
      createdAt: new Date('2026-01-02T00:00:00Z'),
    });

    const data = await getPublicUserProfile('Zelmari');
    expect(data?.user.image).toBe('data:image/png;base64,AAAA');
    expect(data?.user.theme).toBe('midnight');
    expect(data?.user.name).toBe('Zel');
  });

  it('returns null for private or missing profiles', async () => {
    dbState.rows.push({ id: 'user-1', name: 'Zel', username: 'zelmari', isPublic: false });
    expect(await getPublicUserProfile('zelmari')).toBeNull();

    dbState.rows.length = 0;
    expect(await getPublicUserProfile('nobody')).toBeNull();
  });
});

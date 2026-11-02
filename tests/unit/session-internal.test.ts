import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { getSessionMock, headersMock, redirectMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  headersMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    const err = new Error('NEXT_REDIRECT');
    (err as unknown as { digest: string }).digest = `NEXT_REDIRECT;replace;${url};307;`;
    throw err;
  }),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: getSessionMock,
    },
  },
}));

vi.mock('next/headers', () => ({
  headers: headersMock,
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

import {
  getSessionUser,
  getAuthUser,
  requireSession,
  redirectIfAuthenticated,
  toDashboardUser,
} from '@/server/internal';

describe('session-internal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSessionUser', () => {
    it('returns null when auth.api.getSession returns no session', async () => {
      headersMock.mockResolvedValue(new Headers());
      getSessionMock.mockResolvedValue(null);

      const user = await getSessionUser();

      expect(getSessionMock).toHaveBeenCalledTimes(1);
      expect(user).toBeNull();
    });

    it('returns the session user when auth.api.getSession returns an active session', async () => {
      const headers = new Headers();
      headers.set('cookie', 'better-auth.session_token=test-token');
      headersMock.mockResolvedValue(headers);
      getSessionMock.mockResolvedValue({
        user: { id: 'usr_1', name: 'Zelmari', email: 'zelmari@example.com' },
      });

      const user = await getSessionUser();

      expect(getSessionMock).toHaveBeenCalledWith({ headers });
      expect(user).toEqual({
        id: 'usr_1',
        name: 'Zelmari',
        email: 'zelmari@example.com',
      });
    });

    it('delegates to cachedLookupSessionUser when NODE_ENV is set to production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const headers = new Headers();
        headersMock.mockResolvedValue(headers);
        getSessionMock.mockResolvedValue({
          user: { id: 'prod_user', name: 'Production User' },
        });

        const user = await getSessionUser();

        expect(getSessionMock).toHaveBeenCalledWith({ headers });
        expect(user).toEqual({ id: 'prod_user', name: 'Production User' });
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe('redirectIfAuthenticated', () => {
    it('swallows errors thrown by getSessionUser without throwing and does not redirect', async () => {
      headersMock.mockResolvedValue(new Headers());
      getSessionMock.mockRejectedValue(new Error('Postgres connection pool exhausted'));

      await expect(redirectIfAuthenticated()).resolves.toBeUndefined();
      expect(redirectMock).not.toHaveBeenCalled();
    });

    it('does nothing when visitor is anonymous', async () => {
      headersMock.mockResolvedValue(new Headers());
      getSessionMock.mockResolvedValue(null);

      await expect(redirectIfAuthenticated()).resolves.toBeUndefined();
      expect(redirectMock).not.toHaveBeenCalled();
    });

    it('calls redirect("/dashboard") and re-throws NEXT_REDIRECT when user is authenticated', async () => {
      headersMock.mockResolvedValue(new Headers());
      getSessionMock.mockResolvedValue({
        user: { id: 'usr_123', name: 'Authenticated User' },
      });

      await expect(redirectIfAuthenticated()).rejects.toThrow('NEXT_REDIRECT');
      expect(redirectMock).toHaveBeenCalledWith('/dashboard');
    });
  });

  describe('requireSession and getAuthUser', () => {
    it('requireSession redirects unauthenticated user to /login by default', async () => {
      headersMock.mockResolvedValue(new Headers());
      getSessionMock.mockResolvedValue(null);

      await expect(requireSession()).rejects.toThrow('NEXT_REDIRECT');
      expect(redirectMock).toHaveBeenCalledWith('/login');
    });

    it('requireSession redirects unauthenticated user to a custom path', async () => {
      headersMock.mockResolvedValue(new Headers());
      getSessionMock.mockResolvedValue(null);

      await expect(requireSession('/custom-signin')).rejects.toThrow('NEXT_REDIRECT');
      expect(redirectMock).toHaveBeenCalledWith('/custom-signin');
    });

    it('requireSession returns session user when authenticated', async () => {
      headersMock.mockResolvedValue(new Headers());
      getSessionMock.mockResolvedValue({
        user: { id: 'usr_456', name: 'Signed In User' },
      });

      const user = await requireSession();
      expect(user).toEqual({ id: 'usr_456', name: 'Signed In User' });
      expect(redirectMock).not.toHaveBeenCalled();
    });

    it('getAuthUser returns session user when authenticated', async () => {
      headersMock.mockResolvedValue(new Headers());
      getSessionMock.mockResolvedValue({
        user: { id: 'usr_789', name: 'Signed In User' },
      });

      const user = await getAuthUser();
      expect(user).toEqual({ id: 'usr_789', name: 'Signed In User' });
    });

    it('getAuthUser throws Unauthorized when no user is signed in', async () => {
      headersMock.mockResolvedValue(new Headers());
      getSessionMock.mockResolvedValue(null);

      await expect(getAuthUser()).rejects.toThrow('Unauthorized');
    });
  });

  describe('toDashboardUser', () => {
    it('maps session user and db user to dashboard user format', () => {
      const session = { id: 'usr_1', name: 'Session Name', email: 's@ex.com' };
      const dbUser = {
        id: 'usr_1',
        name: 'DB Name',
        email: 's@ex.com',
        theme: 'midnight' as const,
        customTheme: null,
        username: 'dbuser',
        emailVerified: true,
        readingGoals: {},
        verificationDismissedAt: null,
      };

      const result = toDashboardUser(session, dbUser as any);
      expect(result).toEqual({
        name: 'DB Name',
        email: 's@ex.com',
        theme: 'midnight',
        customTheme: null,
        username: 'dbuser',
        emailVerified: true,
        readingGoals: {},
        verificationDismissedAt: null,
      });
    });
  });
});

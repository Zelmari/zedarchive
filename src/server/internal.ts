import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import type { UserProfile } from '@/types/user';

interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  username?: string | null;
  isPublic?: boolean;
  emailVerified?: boolean;
}

export async function getAuthUser(): Promise<SessionUser> {
  const sessionUser = await getSessionUser();
  if (!sessionUser?.id) {
    throw new Error('Unauthorized');
  }

  return sessionUser;
}

/**
 * Non-throwing session lookup for endpoints that serve anonymous visitors
 * (e.g. public profile pages). Returns null when nobody is signed in.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return (session?.user as SessionUser | undefined) ?? null;
}

export async function requireSession(loginPath = '/login'): Promise<SessionUser> {
  const sessionUser = await getSessionUser();

  if (!sessionUser?.id) {
    redirect(loginPath);
  }

  return sessionUser;
}

export async function redirectIfAuthenticated(): Promise<void> {
  const sessionUser = await getSessionUser();

  if (sessionUser?.id) {
    redirect('/dashboard');
  }
}

export function toDashboardUser(
  session: SessionUser,
  dbUser: UserProfile | null,
): {
  name?: string | null;
  email?: string | null;
  theme: string;
  customTheme: UserProfile['customTheme'];
  username?: string | null;
  emailVerified: boolean;
  readingGoals: UserProfile['readingGoals'];
  verificationDismissedAt?: string | null;
} {
  return {
    name: dbUser?.name || session.name,
    email: dbUser?.email || session.email,
    theme: dbUser?.theme || 'parchment',
    customTheme: dbUser?.customTheme || null,
    username: dbUser?.username || null,
    emailVerified: dbUser?.emailVerified ?? session.emailVerified ?? false,
    readingGoals: dbUser?.readingGoals || {},
    verificationDismissedAt: dbUser?.verificationDismissedAt || null,
  };
}

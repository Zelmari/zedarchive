import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { mediaActivityLogs } from '@/db/schema';
import type { UserProfile } from '@/types/user';

export interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  username?: string | null;
  isPublic?: boolean;
  emailVerified?: boolean;
}

type TransactionHandle = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbClient = typeof db | TransactionHandle;

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
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  theme: string;
  customTheme: UserProfile['customTheme'];
  username?: string | null;
  isPublic: boolean;
  bio?: string | null;
  emailVerified: boolean;
  readingGoals: UserProfile['readingGoals'];
  verificationDismissedAt?: string | null;
} {
  return {
    id: session.id,
    name: dbUser?.name || session.name,
    email: dbUser?.email || session.email,
    image: dbUser?.image || session.image,
    theme: dbUser?.theme || 'parchment',
    customTheme: dbUser?.customTheme || null,
    username: dbUser?.username || null,
    isPublic: Boolean(dbUser?.isPublic),
    bio: dbUser?.bio || null,
    emailVerified: dbUser?.emailVerified ?? session.emailVerified ?? false,
    readingGoals: dbUser?.readingGoals || {},
    verificationDismissedAt: dbUser?.verificationDismissedAt || null,
  };
}

interface ActivityLogInput {
  userId: string;
  mediaId: string;
  actionType: 'progress_update' | 'status_change' | 'created' | 'completed' | 'rating' | 'rewatch';
  details: Record<string, unknown>;
}

/**
 * Best-effort activity logging: never fails the calling action.
 * Pass a transaction handle as `tx` to tie the log write to the caller's
 * transaction connection (the try/catch still prevents log issues from
 * aborting the surrounding transaction).
 */
export async function logActivity(
  { userId, mediaId, actionType, details }: ActivityLogInput,
  tx: DbClient = db,
): Promise<void> {
  try {
    await tx.insert(mediaActivityLogs).values({
      id: crypto.randomUUID(),
      userId,
      mediaId,
      actionType,
      details,
    });
  } catch (err) {
    console.warn('Failed to write activity log:', err);
  }
}

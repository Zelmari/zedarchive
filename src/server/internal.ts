import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { mediaActivityLogs } from '@/db/schema';

export interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  username?: string | null;
  isPublic?: boolean;
}

type TransactionHandle = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbClient = typeof db | TransactionHandle;

export async function getAuthUser(): Promise<SessionUser> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  return session.user as SessionUser;
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
  tx: DbClient = db
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

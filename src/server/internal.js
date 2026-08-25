import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { mediaActivityLogs } from '@/db/schema';


export async function getAuthUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  return session.user;
}

/**
 * Non-throwing session lookup for endpoints that serve anonymous visitors
 * (e.g. public profile pages). Returns null when nobody is signed in.
 */
export async function getSessionUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user ?? null;
}

/**
 * Best-effort activity logging: never fails the calling action.
 * Pass a transaction handle as `tx` to tie the log write to the caller's
 * transaction connection (the try/catch still prevents log issues from
 * aborting the surrounding transaction).
 */
export async function logActivity({ userId, mediaId, actionType, details }, tx = db) {
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

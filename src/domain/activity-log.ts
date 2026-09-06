import { mediaActivityLogs } from '@/db/schema';
import { domainDb, type DbClient } from './db-context';

export interface ActivityLogInput {
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
  tx?: DbClient,
): Promise<void> {
  try {
    const client = tx ?? domainDb();
    await client.insert(mediaActivityLogs).values({
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

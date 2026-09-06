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

import { eq, sql, type SQL } from 'drizzle-orm';

export async function getActiveDaysForUser(userId: string, tx?: DbClient): Promise<string[]> {
  const client = tx ?? domainDb();
  const activeDayExpr: SQL = sql`DATE(${mediaActivityLogs.createdAt} AT TIME ZONE 'UTC')`;
  const rows = await client
    .select({ activeDay: activeDayExpr.as('active_day') })
    .from(mediaActivityLogs)
    .where(eq(mediaActivityLogs.userId, userId))
    .groupBy(sql`DATE(${mediaActivityLogs.createdAt} AT TIME ZONE 'UTC')`);

  return rows.map((row) => String(row.activeDay).slice(0, 10));
}

function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function getUserStreakForUser(
  userId: string,
  tx?: DbClient,
): Promise<{ streak: number }> {
  const days = await getActiveDaysForUser(userId, tx);
  const activeDays = new Set(days);
  if (activeDays.size === 0) {
    return { streak: 0 };
  }

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  let cursor: Date;
  if (activeDays.has(utcDayKey(today))) {
    cursor = today;
  } else if (activeDays.has(utcDayKey(yesterday))) {
    cursor = yesterday;
  } else {
    return { streak: 0 };
  }

  let streak = 0;
  while (activeDays.has(utcDayKey(cursor))) {
    streak++;
    cursor = new Date(cursor);
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return { streak };
}

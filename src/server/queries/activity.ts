import { db } from '@/lib/db';
import { mediaActivityLogs } from '@/db/schema';
import { eq, desc, sql, type SQL } from 'drizzle-orm';
import type { ActivityLog } from '@/types/activity';

export async function getActivityLogsByUserId(userId: string, limit = 40): Promise<ActivityLog[]> {
  const logs = await db
    .select()
    .from(mediaActivityLogs)
    .where(eq(mediaActivityLogs.userId, userId))
    .orderBy(desc(mediaActivityLogs.createdAt))
    .limit(limit);

  return logs.map((log) => ({
    ...log,
    createdAt: log.createdAt instanceof Date ? log.createdAt.toISOString() : String(log.createdAt),
  }));
}

export async function getActiveDaysForUser(userId: string): Promise<string[]> {
  const activeDayExpr: SQL = sql`DATE(created_at AT TIME ZONE 'UTC')`;
  const rows = await db
    .select({ activeDay: activeDayExpr.as('active_day') })
    .from(mediaActivityLogs)
    .where(eq(mediaActivityLogs.userId, userId))
    .groupBy(sql`active_day`);

  return rows.map((row) => String(row.activeDay).slice(0, 10));
}

function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function getUserStreakForUser(userId: string): Promise<{ streak: number }> {
  const days = await getActiveDaysForUser(userId);
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

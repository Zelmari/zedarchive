'use server';

import { db } from '@/lib/db';
import { mediaActivityLogs } from '@/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { getAuthUser } from './internal';

export async function getActivityLogs(limit = 40) {
  const user = await getAuthUser();

  const logs = await db
    .select()
    .from(mediaActivityLogs)
    .where(eq(mediaActivityLogs.userId, user.id))
    .orderBy(desc(mediaActivityLogs.createdAt))
    .limit(limit);

  return logs.map((log) => ({
    ...log,
    createdAt: log.createdAt instanceof Date ? log.createdAt.toISOString() : log.createdAt,
  }));
}

function utcDayKey(date) {
  return date.toISOString().slice(0, 10);
}

export async function getUserStreak() {
  const user = await getAuthUser();

  // Bucketed by UTC day so a streak never shifts with the DB session timezone.
  const rows = await db
    .select({
      activeDay: sql`DATE(created_at AT TIME ZONE 'UTC')`.as('active_day'),
    })
    .from(mediaActivityLogs)
    .where(eq(mediaActivityLogs.userId, user.id))
    .groupBy(sql`active_day`);

  const activeDays = new Set(rows.map((row) => String(row.activeDay).slice(0, 10)));
  if (activeDays.size === 0) {
    return { streak: 0 };
  }

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  let cursor;
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

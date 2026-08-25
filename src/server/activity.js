'use server';

import { db } from '@/lib/db';
import { mediaActivityLogs } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
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

import { db } from '@/lib/db';
import { mediaActivityLogs, mediaEntries } from '@/db/schema';
import { eq, desc, sql, and, gte, isNull, type SQL } from 'drizzle-orm';
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

export { getActiveDaysForUser, getUserStreakForUser } from '@/domain/activity-log';

/**
 * Returns a day → count map of activity for the trailing year.
 *
 * @param userId        The user whose activity is queried.
 * @param viewerUserId  Optional: the user viewing the data. When different from
 *                      `userId`, activity logs from private media entries are
 *                      excluded so private titles don't leak via the heatmap.
 */
export async function getYearlyActivityHeatmapForUser(
  userId: string,
  viewerUserId?: string,
): Promise<Record<string, number>> {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  oneYearAgo.setHours(0, 0, 0, 0);

  const dayExpr: SQL = sql`DATE(${mediaActivityLogs.createdAt} AT TIME ZONE 'UTC')`;
  const countExpr: SQL = sql`COUNT(*)::int`;

  // Phase 3: when the viewer is not the owner, join against media_entries and
  // filter out logs that originate from private or group entries.
  const isPublicView = viewerUserId !== userId;

  let rows: Array<{ day: unknown; count: unknown }>;

  if (isPublicView) {
    rows = await db
      .select({
        day: dayExpr.as('day'),
        count: countExpr.as('count'),
      })
      .from(mediaActivityLogs)
      .innerJoin(mediaEntries, eq(mediaActivityLogs.mediaId, mediaEntries.id))
      .where(
        and(
          eq(mediaActivityLogs.userId, userId),
          gte(mediaActivityLogs.createdAt, oneYearAgo),
          eq(mediaEntries.isPrivate, false),
          isNull(mediaEntries.groupId),
        ),
      )
      .groupBy(sql`DATE(${mediaActivityLogs.createdAt} AT TIME ZONE 'UTC')`);
  } else {
    rows = await db
      .select({
        day: dayExpr.as('day'),
        count: countExpr.as('count'),
      })
      .from(mediaActivityLogs)
      .where(
        and(eq(mediaActivityLogs.userId, userId), gte(mediaActivityLogs.createdAt, oneYearAgo)),
      )
      .groupBy(sql`DATE(${mediaActivityLogs.createdAt} AT TIME ZONE 'UTC')`);
  }

  const activityMap: Record<string, number> = {};
  for (const row of rows) {
    if (row.day) {
      activityMap[String(row.day).slice(0, 10)] = Number(row.count) || 0;
    }
  }

  return activityMap;
}

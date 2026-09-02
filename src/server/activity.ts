'use server';

import { getAuthUser } from './internal';
import {
  getActivityLogsByUserId,
  getUserStreakForUser,
  getYearlyActivityHeatmapForUser,
} from './queries/activity';
import type { ActivityLog } from '@/types/activity';

export async function getActivityLogs(limit = 40): Promise<ActivityLog[]> {
  const user = await getAuthUser();
  return getActivityLogsByUserId(user.id, limit);
}

export async function getUserStreak(): Promise<{ streak: number }> {
  const user = await getAuthUser();
  return getUserStreakForUser(user.id);
}

export async function getActivityHeatmap(): Promise<Record<string, number>> {
  const user = await getAuthUser();
  return getYearlyActivityHeatmapForUser(user.id);
}

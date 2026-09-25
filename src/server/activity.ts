'use server';

import { getAuthUser } from './internal';
import {
  getActivityLogsByUserId,
  getUserStreakForUser,
  getYearlyActivityHeatmapForUser,
} from './queries/activity';
import type { ActivityLog } from '@/types/activity';

const MAX_ACTIVITY_PAGE = 100;

export async function getActivityLogs(limit = 40, offset = 0): Promise<ActivityLog[]> {
  const user = await getAuthUser();
  const safeLimit = Math.min(MAX_ACTIVITY_PAGE, Math.max(1, Math.trunc(Number(limit)) || 40));
  const safeOffset = Math.max(0, Math.trunc(Number(offset)) || 0);
  return getActivityLogsByUserId(user.id, safeLimit, safeOffset);
}

export async function getUserStreak(): Promise<{ streak: number }> {
  const user = await getAuthUser();
  return getUserStreakForUser(user.id);
}

export async function getActivityHeatmap(): Promise<Record<string, number>> {
  const user = await getAuthUser();
  return getYearlyActivityHeatmapForUser(user.id, user.id);
}

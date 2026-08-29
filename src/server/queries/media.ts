import { db } from '@/lib/db';
import { mediaEntries, groupMembers } from '@/db/schema';
import { eq, desc, and, isNull } from 'drizzle-orm';
import { serializeEntry } from '@/lib/serialize';
import type { MediaEntry } from '@/types/media';

export async function getMediaEntriesByUserId(userId: string): Promise<MediaEntry[]> {
  const entries = await db
    .select()
    .from(mediaEntries)
    .where(and(eq(mediaEntries.userId, userId), isNull(mediaEntries.groupId)))
    .orderBy(desc(mediaEntries.updatedAt));

  return entries.map(serializeEntry).filter((entry): entry is MediaEntry => entry !== null);
}

export async function getMediaEntryById(id: string, userId?: string): Promise<MediaEntry | null> {
  const condition = userId
    ? and(eq(mediaEntries.id, id), eq(mediaEntries.userId, userId), isNull(mediaEntries.groupId))
    : and(eq(mediaEntries.id, id), isNull(mediaEntries.groupId));

  const [entry] = await db.select().from(mediaEntries).where(condition);

  if (!entry) return null;
  return serializeEntry(entry);
}

export async function getGroupMediaEntries(
  groupId: string,
  viewerUserId: string,
): Promise<MediaEntry[]> {
  // Verify membership
  const [member] = await db
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, viewerUserId)))
    .limit(1);
  if (!member) throw new Error('You are not a member of this group');

  const entries = await db
    .select()
    .from(mediaEntries)
    .where(eq(mediaEntries.groupId, groupId))
    .orderBy(desc(mediaEntries.updatedAt));

  return entries.map(serializeEntry).filter((e): e is MediaEntry => e !== null);
}

export async function getGroupMediaEntryById(
  id: string,
  groupId: string,
  viewerUserId: string,
): Promise<MediaEntry | null> {
  const [member] = await db
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, viewerUserId)))
    .limit(1);
  if (!member) throw new Error('You are not a member of this group');
  const [entry] = await db
    .select()
    .from(mediaEntries)
    .where(and(eq(mediaEntries.id, id), eq(mediaEntries.groupId, groupId)));
  if (!entry) return null;
  return serializeEntry(entry);
}

export interface GetPaginatedMediaParams {
  userId: string;
  limit?: number;
  offset?: number;
  status?: string;
  category?: string;
}

export interface PaginatedMediaResult {
  items: MediaEntry[];
  hasMore: boolean;
  nextOffset: number | null;
}

export async function getPaginatedMediaEntries(
  params: GetPaginatedMediaParams,
): Promise<PaginatedMediaResult> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);

  const query = db
    .select()
    .from(mediaEntries)
    .where(and(eq(mediaEntries.userId, params.userId), isNull(mediaEntries.groupId)))
    .orderBy(desc(mediaEntries.updatedAt))
    .limit(limit + 1)
    .offset(offset);

  const rows = await query;
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;

  return {
    items: slice.map(serializeEntry).filter((e): e is MediaEntry => e !== null),
    hasMore,
    nextOffset: hasMore ? offset + limit : null,
  };
}

import { db } from '@/lib/db';
import { mediaEntries, groupMembers } from '@/db/schema';
import { eq, desc, and, isNull } from 'drizzle-orm';
import { serializeEntry } from '@/lib/serialize';
import type { MediaEntry } from '@/types/media';

export async function getMediaEntriesByUserId(userId: string): Promise<MediaEntry[]> {
  try {
    const entries = await db
      .select()
      .from(mediaEntries)
      .where(and(eq(mediaEntries.userId, userId), isNull(mediaEntries.groupId)))
      .orderBy(desc(mediaEntries.updatedAt));
    return entries.map(serializeEntry).filter((entry): entry is MediaEntry => entry !== null);
  } catch (err: any) {
    // Fallback if group_id column not yet migrated (e.g. pending migration)
    if (
      String(err?.message || '').includes('group_id') ||
      String(err?.cause?.message || '').includes('group_id')
    ) {
      const entries = await db
        .select()
        .from(mediaEntries)
        .where(eq(mediaEntries.userId, userId))
        .orderBy(desc(mediaEntries.updatedAt));
      return entries.map(serializeEntry).filter((entry): entry is MediaEntry => entry !== null);
    }
    throw err;
  }
}

export async function getMediaEntryById(id: string, userId?: string): Promise<MediaEntry | null> {
  try {
    const condition = userId
      ? and(eq(mediaEntries.id, id), eq(mediaEntries.userId, userId), isNull(mediaEntries.groupId))
      : and(eq(mediaEntries.id, id), isNull(mediaEntries.groupId));
    const [entry] = await db.select().from(mediaEntries).where(condition);
    if (!entry) return null;
    return serializeEntry(entry);
  } catch (err: any) {
    if (
      String(err?.message || '').includes('group_id') ||
      String(err?.cause?.message || '').includes('group_id')
    ) {
      const condition = userId
        ? and(eq(mediaEntries.id, id), eq(mediaEntries.userId, userId))
        : eq(mediaEntries.id, id);
      const [entry] = await db.select().from(mediaEntries).where(condition);
      if (!entry) return null;
      return serializeEntry(entry);
    }
    throw err;
  }
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

  let rows: (typeof mediaEntries.$inferSelect)[];
  try {
    rows = await db
      .select()
      .from(mediaEntries)
      .where(and(eq(mediaEntries.userId, params.userId), isNull(mediaEntries.groupId)))
      .orderBy(desc(mediaEntries.updatedAt))
      .limit(limit + 1)
      .offset(offset);
  } catch (err: any) {
    if (
      String(err?.message || '').includes('group_id') ||
      String(err?.cause?.message || '').includes('group_id')
    ) {
      rows = await db
        .select()
        .from(mediaEntries)
        .where(eq(mediaEntries.userId, params.userId))
        .orderBy(desc(mediaEntries.updatedAt))
        .limit(limit + 1)
        .offset(offset);
    } else {
      throw err;
    }
  }
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;

  return {
    items: slice.map(serializeEntry).filter((e): e is MediaEntry => e !== null),
    hasMore,
    nextOffset: hasMore ? offset + limit : null,
  };
}

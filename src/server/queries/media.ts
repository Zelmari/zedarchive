import { db } from '@/lib/db';
import { mediaEntries } from '@/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { serializeEntry } from '@/lib/serialize';
import type { MediaEntry } from '@/types/media';

export async function getMediaEntriesByUserId(userId: string): Promise<MediaEntry[]> {
  const entries = await db
    .select()
    .from(mediaEntries)
    .where(eq(mediaEntries.userId, userId))
    .orderBy(desc(mediaEntries.updatedAt));

  return entries.map(serializeEntry).filter((entry): entry is MediaEntry => entry !== null);
}

export async function getMediaEntryById(id: string, userId?: string): Promise<MediaEntry | null> {
  const condition = userId
    ? and(eq(mediaEntries.id, id), eq(mediaEntries.userId, userId))
    : eq(mediaEntries.id, id);

  const [entry] = await db.select().from(mediaEntries).where(condition);

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
    .where(eq(mediaEntries.userId, params.userId))
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

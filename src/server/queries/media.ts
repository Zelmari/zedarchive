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

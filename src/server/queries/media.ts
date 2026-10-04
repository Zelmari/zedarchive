import { db } from '@/lib/db';
import { mediaEntries } from '@/db/schema';
import { eq, desc, getTableColumns, sql } from 'drizzle-orm';
import { serializeEntry } from '@/lib/serialize';
import { coverSrc } from '@/lib/covers';
import type { MediaEntry } from '@/types/media';

const { coverImage: _coverImage, ...entryColumns } = getTableColumns(mediaEntries);
void _coverImage;

/**
 * List projection that never loads cover blobs from Postgres. `hasCover`
 * carries only presence so client rows can point at /api/covers/[id].
 */
export const mediaEntryListSelection = {
  ...entryColumns,
  hasCover: sql<boolean>`(${mediaEntries.coverImage} is not null)`.as('has_cover'),
};

export function toMediaEntryListItem(row: Record<string, unknown>): MediaEntry | null {
  const { hasCover, ...entryRow } = row;
  const entry = serializeEntry(entryRow);
  if (!entry) return null;
  return {
    ...entry,
    coverImage: hasCover ? coverSrc(entry.id, entry.updatedAt) : null,
  };
}

export async function getMediaEntriesByUserId(userId: string): Promise<MediaEntry[]> {
  const entries = await db
    .select(mediaEntryListSelection)
    .from(mediaEntries)
    .where(eq(mediaEntries.userId, userId))
    .orderBy(desc(mediaEntries.updatedAt));
  return entries.map(toMediaEntryListItem).filter((entry): entry is MediaEntry => entry !== null);
}

/**
 * Full rows including stored cover blobs, for backups only. Never send these
 * to list UIs — use {@link getMediaEntriesByUserId} instead.
 */
export async function getRawMediaEntriesByUserId(userId: string): Promise<MediaEntry[]> {
  const entries = await db
    .select()
    .from(mediaEntries)
    .where(eq(mediaEntries.userId, userId))
    .orderBy(desc(mediaEntries.updatedAt));
  return entries.map(serializeEntry).filter((entry): entry is MediaEntry => entry !== null);
}

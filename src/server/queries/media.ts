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

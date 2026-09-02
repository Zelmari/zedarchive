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

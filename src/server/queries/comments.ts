import { db } from '@/lib/db';
import { user as userTable, profileComments } from '@/db/schema';
import { eq, and, asc, gt, lte } from 'drizzle-orm';
import type { ProfileComment } from '@/types/comments';

export async function getCommentsByProfileUserId(
  profileUserId: unknown,
  viewerUserId?: string | null,
): Promise<ProfileComment[]> {
  if (!profileUserId) return [];
  const now = new Date();

  // Privacy gate: verify target profile is public — or caller is the profile owner
  const [target] = await db
    .select({ id: userTable.id, isPublic: userTable.isPublic })
    .from(userTable)
    .where(eq(userTable.id, String(profileUserId)));

  if (!target) {
    return [];
  }

  if (!target.isPublic && viewerUserId !== target.id) {
    return [];
  }

  // Lazy cleanup: drop this profile's expired comments
  await db
    .delete(profileComments)
    .where(and(eq(profileComments.profileUserId, target.id), lte(profileComments.expiresAt, now)));

  const rows = await db
    .select({
      id: profileComments.id,
      profileUserId: profileComments.profileUserId,
      body: profileComments.body,
      createdAt: profileComments.createdAt,
      expiresAt: profileComments.expiresAt,
      authorId: userTable.id,
      authorUsername: userTable.username,
      authorName: userTable.name,
      authorImage: userTable.image,
    })
    .from(profileComments)
    .innerJoin(userTable, eq(profileComments.authorUserId, userTable.id))
    .where(
      and(
        eq(profileComments.profileUserId, target.id),
        gt(profileComments.expiresAt, now),
        eq(userTable.isPublic, true),
      ),
    )
    .orderBy(asc(profileComments.createdAt))
    .limit(200);

  return rows.map((row) => ({
    id: row.id,
    profileUserId: row.profileUserId,
    authorId: row.authorId,
    authorUsername: row.authorUsername,
    authorName: row.authorName,
    authorImage: row.authorImage || null,
    body: row.body,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    expiresAt: row.expiresAt instanceof Date ? row.expiresAt.toISOString() : String(row.expiresAt),
  }));
}

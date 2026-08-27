'use server';

import { db } from '@/lib/db';
import { user as userTable, profileComments } from '@/db/schema';
import { eq, and, asc, gt, lte, count } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import {
  MAX_COMMENT_LENGTH,
  COMMENT_TTL_MS,
  COMMENT_RATE_LIMIT,
  COMMENT_RATE_WINDOW_MS,
} from '@/lib/constants';
import type { ProfileComment } from '@/types/comments';
import { getAuthUser, getSessionUser } from './internal';

type CommentRow = typeof profileComments.$inferSelect;

interface AuthorInfo {
  id: string;
  username: string | null;
  name: string;
  image: string | null;
}

function serializeCommentFlat(row: CommentRow, author: AuthorInfo): ProfileComment {
  return {
    id: row.id,
    profileUserId: row.profileUserId,
    authorId: author.id,
    authorUsername: author.username,
    authorName: author.name,
    authorImage: author.image || null,
    body: row.body,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    expiresAt: row.expiresAt instanceof Date ? row.expiresAt.toISOString() : String(row.expiresAt),
  };
}

export async function getProfileComments(profileUserId: unknown): Promise<ProfileComment[]> {
  if (!profileUserId) return [];
  const now = new Date();

  // Privacy gate: this server action is publicly invocable, so verify the
  // target profile is public — or the caller is the profile owner (who may
  // always read their own guestbook). Anonymous visitors only pass for
  // public profiles, keeping the /u/[username] page working while signed out.
  const [target] = await db
    .select({ id: userTable.id, isPublic: userTable.isPublic })
    .from(userTable)
    .where(eq(userTable.id, String(profileUserId)));

  if (!target) {
    return [];
  }

  if (!target.isPublic) {
    const viewer = await getSessionUser();
    if (viewer?.id !== target.id) {
      return [];
    }
  }

  // Lazy cleanup: drop this profile's expired comments while we are here anyway.
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
        // Reciprocity rule, enforced retroactively: comments by users whose own
        // archive is no longer public stop rendering until they go public again.
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

export async function createProfileComment(
  profileUserId: unknown,
  body: unknown,
): Promise<ProfileComment> {
  const me = await getAuthUser();

  const [target] = await db
    .select({ id: userTable.id, username: userTable.username, isPublic: userTable.isPublic })
    .from(userTable)
    .where(eq(userTable.id, String(profileUserId)));

  if (!target || !target.isPublic) {
    throw new Error('This archive is not available for comments');
  }

  // Reciprocity gate: only members of the public archive community may comment.
  const [meRow] = await db
    .select({
      id: userTable.id,
      username: userTable.username,
      name: userTable.name,
      image: userTable.image,
      isPublic: userTable.isPublic,
    })
    .from(userTable)
    .where(eq(userTable.id, me.id));

  // Reciprocity gate: only members of the public archive community may
  // comment, and a public archive must have a handle to link back to.
  if (!meRow?.isPublic) {
    throw new Error('Your own archive must be public to comment');
  }
  if (!meRow.username) {
    throw new Error('A username handle is required to comment');
  }

  const clean = String(body || '')
    .trim()
    .slice(0, MAX_COMMENT_LENGTH);
  if (!clean) {
    throw new Error('Comment cannot be empty');
  }

  const windowStart = new Date(Date.now() - COMMENT_RATE_WINDOW_MS);
  const [rateRow] = await db
    .select({ value: count() })
    .from(profileComments)
    .where(
      and(eq(profileComments.authorUserId, me.id), gt(profileComments.createdAt, windowStart)),
    );

  if (Number(rateRow?.value ?? 0) >= COMMENT_RATE_LIMIT) {
    throw new Error('You are commenting too fast. Try again in a minute');
  }

  const now = new Date();
  const created = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(profileComments)
      .values({
        id: crypto.randomUUID(),
        profileUserId: target.id,
        authorUserId: meRow.id,
        body: clean,
        createdAt: now,
        expiresAt: new Date(now.getTime() + COMMENT_TTL_MS),
      })
      .returning();

    if (!inserted) throw new Error('Failed to create comment');
    return serializeCommentFlat(inserted, meRow);
  });

  if (target.username) {
    revalidatePath(`/u/${target.username}`);
  }

  return created;
}

export async function deleteProfileComment(commentId: unknown): Promise<{ ok: boolean }> {
  const me = await getAuthUser();

  const [comment] = await db
    .select({
      id: profileComments.id,
      profileUserId: profileComments.profileUserId,
      authorUserId: profileComments.authorUserId,
    })
    .from(profileComments)
    .where(eq(profileComments.id, String(commentId)));

  if (!comment) {
    throw new Error('Comment not found');
  }

  const isAuthor = comment.authorUserId === me.id;
  const isProfileOwner = comment.profileUserId === me.id;
  if (!isAuthor && !isProfileOwner) {
    throw new Error('You can only delete your own comments');
  }

  await db.delete(profileComments).where(eq(profileComments.id, comment.id));

  const [owner] = await db
    .select({ username: userTable.username })
    .from(userTable)
    .where(eq(userTable.id, comment.profileUserId));

  if (owner?.username) {
    revalidatePath(`/u/${owner.username}`);
  }

  return { ok: true };
}

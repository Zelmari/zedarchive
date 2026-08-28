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
import { createCommentSchema } from '@/lib/validations/comment';
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

import { getCommentsByProfileUserId } from './queries/comments';

export async function getProfileComments(profileUserId: unknown): Promise<ProfileComment[]> {
  const viewer = await getSessionUser();
  return getCommentsByProfileUserId(profileUserId, viewer?.id);
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

  const parsed = createCommentSchema.safeParse({
    profileUserId: String(profileUserId || ''),
    body,
  });
  if (!parsed.success) {
    const errorMsg = parsed.error.issues[0]?.message || 'Invalid comment data';
    throw new Error(errorMsg);
  }
  const clean = parsed.data.body;

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

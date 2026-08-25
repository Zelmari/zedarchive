'use server';

import { db } from '@/lib/db';
import { mediaEntries, user as userTable, mediaActivityLogs, profileComments } from '@/db/schema';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { eq, and, desc, asc, gt, lte, count } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import {
  VALID_CATEGORIES,
  VALID_STATUSES,
  VALID_THEMES,
  MAX_TITLE_LENGTH,
  MAX_NOTES_LENGTH,
  MAX_SYNOPSIS_LENGTH,
  MAX_SOURCE_ID_LENGTH,
  MAX_COVER_IMAGE_LENGTH,
  MAX_STRUCTURE_LENGTH,
  MAX_RATING,
  MAX_BIO_LENGTH,
  MAX_COMMENT_LENGTH,
  COMMENT_TTL_MS,
  COMMENT_RATE_LIMIT,
  COMMENT_RATE_WINDOW_MS,
} from '@/lib/constants';
import { normalizeHandle } from '@/lib/handles';
import { serializeEntry } from '@/lib/serialize';


function toInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeStructure(structure) {
  if (!Array.isArray(structure)) return [];
  return structure
    .slice(0, MAX_STRUCTURE_LENGTH)
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const number = toInt(item.number, null);
      const total = item.total === null || item.total === undefined || item.total === ''
        ? null
        : toInt(item.total, null);
      return number === null
        ? null
        : { number, name: String(item.name ?? `Season ${number}`).slice(0, 100), total };
    })
    .filter(Boolean);
}

function sanitizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .slice(0, 50)
    .map((t) => String(t || '').trim().toLowerCase().slice(0, 50))
    .filter(Boolean);
}

function sanitizeRating(rating) {
  if (rating === null || rating === undefined || rating === '') return null;
  const parsed = parseInt(rating, 10);
  if (isNaN(parsed)) return null;
  return Math.min(MAX_RATING, Math.max(1, parsed));
}

function sanitizeStatus(status) {
  if (typeof status === 'string' && VALID_STATUSES.includes(status)) {
    return status;
  }
  return 'in_progress';
}

async function getAuthUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  return session.user;
}

export async function getMediaEntries() {
  const user = await getAuthUser();

  const entries = await db
    .select()
    .from(mediaEntries)
    .where(eq(mediaEntries.userId, user.id))
    .orderBy(desc(mediaEntries.updatedAt));

  return entries.map(serializeEntry);
}

export async function createMediaEntry(data) {
  const user = await getAuthUser();

  const title = String(data.title || '').trim().slice(0, MAX_TITLE_LENGTH);
  if (!title) {
    throw new Error('Title is required');
  }

  const id = crypto.randomUUID();
  const category = VALID_CATEGORIES.includes(data.category)
    ? data.category
    : data.type === 'book'
    ? 'book'
    : 'show';

  const primaryUnitCurrent = Math.max(1, toInt(data.primaryUnitCurrent, 1));
  const primaryUnitTotal = data.primaryUnitTotal !== undefined && data.primaryUnitTotal !== null && data.primaryUnitTotal !== ''
    ? Math.max(1, toInt(data.primaryUnitTotal, 1))
    : null;

  const secondaryUnitCurrent = Math.max(0, toInt(data.secondaryUnitCurrent, 0));
  const secondaryUnitTotal = data.secondaryUnitTotal !== undefined && data.secondaryUnitTotal !== null && data.secondaryUnitTotal !== ''
    ? Math.max(0, toInt(data.secondaryUnitTotal, null))
    : null;

  const structure = sanitizeStructure(data.structure);
  const status = sanitizeStatus(data.status);
  const rating = sanitizeRating(data.rating);
  const tags = sanitizeTags(data.tags);
  const genres = Array.isArray(data.genres) ? data.genres.slice(0, 20) : [];
  const synopsis = data.synopsis ? String(data.synopsis).trim().slice(0, MAX_SYNOPSIS_LENGTH) : null;
  const startedAt = data.startedAt ? new Date(data.startedAt) : new Date();
  const completedAt = status === 'completed' ? (data.completedAt ? new Date(data.completedAt) : new Date()) : null;

  const coverImage = typeof data.coverImage === 'string' && data.coverImage.length <= MAX_COVER_IMAGE_LENGTH
    ? data.coverImage
    : null;
  const sourceId = typeof data.sourceId === 'string'
    ? data.sourceId.slice(0, MAX_SOURCE_ID_LENGTH)
    : null;
  const notes = data.notes ? String(data.notes).trim().slice(0, MAX_NOTES_LENGTH) : null;

  const [newEntry] = await db
    .insert(mediaEntries)
    .values({
      id,
      userId: user.id,
      title,
      category,
      status,
      completedAt,
      startedAt,
      rewatchCount: 0,
      rating,
      tags,
      genres,
      synopsis,
      primaryUnitCurrent: primaryUnitTotal !== null ? Math.min(primaryUnitCurrent, primaryUnitTotal) : primaryUnitCurrent,
      primaryUnitTotal,
      secondaryUnitCurrent: secondaryUnitTotal !== null ? Math.min(secondaryUnitCurrent, secondaryUnitTotal) : secondaryUnitCurrent,
      secondaryUnitTotal,
      structure,
      coverImage,
      sourceId,
      notes,
      updatedAt: new Date(),
    })
    .returning();

  // Log activity
  try {
    await db.insert(mediaActivityLogs).values({
      id: crypto.randomUUID(),
      userId: user.id,
      mediaId: id,
      actionType: 'created',
      details: { title, category, status },
    });
  } catch (logErr) {
    console.warn('Failed to write activity log:', logErr);
  }

  revalidatePath('/dashboard');
  return serializeEntry(newEntry);
}

export async function updateMediaProgress(id, updates) {
  const user = await getAuthUser();

  const updateFields = {
    updatedAt: new Date(),
  };

  if (updates.title !== undefined) {
    const title = String(updates.title).trim().slice(0, MAX_TITLE_LENGTH);
    if (!title) {
      throw new Error('Title is required');
    }
    updateFields.title = title;
  }

  if (updates.category !== undefined) {
    if (!VALID_CATEGORIES.includes(updates.category)) {
      throw new Error('Invalid category');
    }
    updateFields.category = updates.category;
  }

  if (updates.status !== undefined) {
    const status = sanitizeStatus(updates.status);
    updateFields.status = status;
    if (status === 'completed') {
      updateFields.completedAt = updates.completedAt ? new Date(updates.completedAt) : new Date();
    } else {
      updateFields.completedAt = null;
    }
  }

  if (updates.rating !== undefined) {
    updateFields.rating = sanitizeRating(updates.rating);
  }

  if (updates.tags !== undefined) {
    updateFields.tags = sanitizeTags(updates.tags);
  }
  if (updates.synopsis !== undefined) {
    updateFields.synopsis = updates.synopsis ? String(updates.synopsis).trim().slice(0, MAX_SYNOPSIS_LENGTH) : null;
  }
  if (updates.genres !== undefined) {
    updateFields.genres = Array.isArray(updates.genres) ? updates.genres.slice(0, 20) : [];
  }
  if (updates.startedAt !== undefined) {
    updateFields.startedAt = updates.startedAt ? new Date(updates.startedAt) : null;
  }
  if (updates.rewatchCount !== undefined) {
    updateFields.rewatchCount = Math.max(0, toInt(updates.rewatchCount, 0));
  }

  if (updates.primaryUnitCurrent !== undefined) {
    updateFields.primaryUnitCurrent = Math.max(1, toInt(updates.primaryUnitCurrent, 1));
  }
  if (updates.primaryUnitTotal !== undefined) {
    updateFields.primaryUnitTotal = updates.primaryUnitTotal !== null && updates.primaryUnitTotal !== ''
      ? Math.max(1, toInt(updates.primaryUnitTotal, 1))
      : null;
  }
  if (updates.secondaryUnitCurrent !== undefined) {
    updateFields.secondaryUnitCurrent = Math.max(0, toInt(updates.secondaryUnitCurrent, 0));
  }
  if (updates.secondaryUnitTotal !== undefined) {
    updateFields.secondaryUnitTotal = updates.secondaryUnitTotal !== null && updates.secondaryUnitTotal !== ''
      ? Math.max(0, toInt(updates.secondaryUnitTotal, null))
      : null;
  }

  if (updateFields.primaryUnitCurrent !== undefined && updateFields.primaryUnitTotal !== null && updateFields.primaryUnitTotal !== undefined) {
    updateFields.primaryUnitCurrent = Math.min(updateFields.primaryUnitCurrent, updateFields.primaryUnitTotal);
  }
  if (updateFields.secondaryUnitCurrent !== undefined && updateFields.secondaryUnitTotal !== null && updateFields.secondaryUnitTotal !== undefined) {
    updateFields.secondaryUnitCurrent = Math.min(updateFields.secondaryUnitCurrent, updateFields.secondaryUnitTotal);
  }

  if (updates.structure !== undefined) {
    updateFields.structure = sanitizeStructure(updates.structure);
  }
  if (updates.coverImage !== undefined) {
    updateFields.coverImage = typeof updates.coverImage === 'string' && updates.coverImage.length <= MAX_COVER_IMAGE_LENGTH
      ? updates.coverImage
      : null;
  }
  if (updates.sourceId !== undefined) {
    updateFields.sourceId = typeof updates.sourceId === 'string'
      ? updates.sourceId.slice(0, MAX_SOURCE_ID_LENGTH)
      : null;
  }
  if (updates.notes !== undefined) {
    updateFields.notes = updates.notes == null ? null : String(updates.notes).trim().slice(0, MAX_NOTES_LENGTH);
  }

  const [updated] = await db
    .update(mediaEntries)
    .set(updateFields)
    .where(
      and(
        eq(mediaEntries.id, id),
        eq(mediaEntries.userId, user.id)
      )
    )
    .returning();

  if (!updated) {
    throw new Error('Entry not found');
  }

  // Log progress or status activity
  try {
    let actionType = 'progress_update';
    if (updates.status === 'completed') actionType = 'completed';
    else if (updates.rewatchCount !== undefined) actionType = 'rewatch';
    else if (updates.rating !== undefined) actionType = 'rating';

    await db.insert(mediaActivityLogs).values({
      id: crypto.randomUUID(),
      userId: user.id,
      mediaId: id,
      actionType,
      details: {
        title: updated.title,
        category: updated.category,
        season: updated.primaryUnitCurrent,
        progress: updated.secondaryUnitCurrent,
        total: updated.secondaryUnitTotal,
        status: updated.status,
        rating: updated.rating,
      },
    });
  } catch (logErr) {
    console.warn('Failed to write activity log:', logErr);
  }

  revalidatePath('/dashboard');
  return serializeEntry(updated);
}

export async function bulkImportMediaEntries(items, conflictStrategy = 'skip') {
  const user = await getAuthUser();
  if (!Array.isArray(items) || items.length === 0) {
    return { added: 0, updated: 0, skipped: 0 };
  }

  const existing = await db
    .select()
    .from(mediaEntries)
    .where(eq(mediaEntries.userId, user.id));

  const existingBySourceOrTitle = new Map();
  existing.forEach((e) => {
    if (e.sourceId) existingBySourceOrTitle.set(e.sourceId.toLowerCase(), e);
    existingBySourceOrTitle.set(`${e.category}:${e.title.toLowerCase()}`, e);
  });

  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of items) {
    const title = String(item.title || '').trim().slice(0, MAX_TITLE_LENGTH);
    if (!title) continue;

    const category = VALID_CATEGORIES.includes(item.category) ? item.category : 'show';
    const sourceKey = item.sourceId ? item.sourceId.toLowerCase() : null;
    const titleKey = `${category}:${title.toLowerCase()}`;

    const match = (sourceKey && existingBySourceOrTitle.get(sourceKey)) || existingBySourceOrTitle.get(titleKey);

    if (match && conflictStrategy === 'skip') {
      skipped++;
      continue;
    }

    const payload = {
      title,
      category,
      status: sanitizeStatus(item.status),
      rating: sanitizeRating(item.rating),
      tags: sanitizeTags(item.tags),
      completedAt: item.completedAt ? new Date(item.completedAt) : item.status === 'completed' ? new Date() : null,
      primaryUnitCurrent: Math.max(1, toInt(item.primaryUnitCurrent, 1)),
      primaryUnitTotal: item.primaryUnitTotal != null ? Math.max(1, toInt(item.primaryUnitTotal, 1)) : null,
      secondaryUnitCurrent: Math.max(0, toInt(item.secondaryUnitCurrent, 0)),
      secondaryUnitTotal: item.secondaryUnitTotal != null ? Math.max(0, toInt(item.secondaryUnitTotal, null)) : null,
      structure: sanitizeStructure(item.structure),
      coverImage: typeof item.coverImage === 'string' && item.coverImage.length <= MAX_COVER_IMAGE_LENGTH ? item.coverImage : null,
      sourceId: typeof item.sourceId === 'string' ? item.sourceId.slice(0, MAX_SOURCE_ID_LENGTH) : null,
      notes: item.notes ? String(item.notes).trim().slice(0, MAX_NOTES_LENGTH) : null,
      updatedAt: new Date(),
    };

    if (match && conflictStrategy === 'overwrite') {
      await db
        .update(mediaEntries)
        .set(payload)
        .where(eq(mediaEntries.id, match.id));
      updated++;
    } else {
      await db.insert(mediaEntries).values({
        ...payload,
        id: crypto.randomUUID(),
        userId: user.id,
        createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
      });
      added++;
    }
  }

  revalidatePath('/dashboard');
  return { added, updated, skipped };
}

export async function deleteMediaEntry(id) {
  const user = await getAuthUser();

  await db
    .delete(mediaEntries)
    .where(
      and(
        eq(mediaEntries.id, id),
        eq(mediaEntries.userId, user.id)
      )
    );

  revalidatePath('/dashboard');
  return { success: true };
}

export async function updateUserTheme(theme) {
  const user = await getAuthUser();
  const safeTheme = VALID_THEMES.includes(theme) ? theme : 'parchment';

  await db
    .update(userTable)
    .set({ theme: safeTheme, updatedAt: new Date() })
    .where(eq(userTable.id, user.id));

  return { theme: safeTheme };
}

export async function getUserProfile() {
  const user = await getAuthUser();
  const [profile] = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      theme: userTable.theme,
      username: userTable.username,
      isPublic: userTable.isPublic,
      bio: userTable.bio,
    })
    .from(userTable)
    .where(eq(userTable.id, user.id));

  return profile;
}

export async function updateUserProfile(updates) {
  const user = await getAuthUser();
  const updateData = { updatedAt: new Date() };

  if (updates.username !== undefined) {
    const raw = normalizeHandle(updates.username);
    updateData.username = raw || null;
  }

  if (updates.isPublic !== undefined) {
    updateData.isPublic = Boolean(updates.isPublic);
  }

  if (updates.bio !== undefined) {
    updateData.bio = String(updates.bio || '').trim().slice(0, MAX_BIO_LENGTH) || null;
  }

  const [updated] = await db
    .update(userTable)
    .set(updateData)
    .where(eq(userTable.id, user.id))
    .returning({
      id: userTable.id,
      name: userTable.name,
      username: userTable.username,
      isPublic: userTable.isPublic,
      bio: userTable.bio,
      theme: userTable.theme,
    });

  revalidatePath('/dashboard');
  return updated;
}

export async function getPublicUserProfile(username) {
  if (!username) return null;
  const clean = String(username).trim().toLowerCase();

  const [foundUser] = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      username: userTable.username,
      bio: userTable.bio,
      isPublic: userTable.isPublic,
      createdAt: userTable.createdAt,
    })
    .from(userTable)
    .where(eq(userTable.username, clean));

  if (!foundUser || !foundUser.isPublic) {
    return null;
  }

  const entries = await db
    .select()
    .from(mediaEntries)
    .where(eq(mediaEntries.userId, foundUser.id))
    .orderBy(desc(mediaEntries.updatedAt));

  return {
    user: foundUser,
    entries: entries.map(serializeEntry),
  };
}

export async function getActivityLogs(limit = 40) {
  const user = await getAuthUser();

  const logs = await db
    .select()
    .from(mediaActivityLogs)
    .where(eq(mediaActivityLogs.userId, user.id))
    .orderBy(desc(mediaActivityLogs.createdAt))
    .limit(limit);

  return logs.map((log) => ({
    ...log,
    createdAt: log.createdAt instanceof Date ? log.createdAt.toISOString() : log.createdAt,
  }));
}

function serializeComment(row) {
  return {
    id: row.id,
    profileUserId: row.profileUserId,
    authorId: row.authorId,
    authorUsername: row.authorUsername,
    authorName: row.authorName,
    authorImage: row.authorImage || null,
    body: row.body,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    expiresAt: row.expiresAt instanceof Date ? row.expiresAt.toISOString() : row.expiresAt,
  };
}

export async function getProfileComments(profileUserId) {
  if (!profileUserId) return [];
  const now = new Date();

  // Lazy cleanup: drop this profile's expired comments while we are here anyway.
  await db
    .delete(profileComments)
    .where(and(
      eq(profileComments.profileUserId, profileUserId),
      lte(profileComments.expiresAt, now),
    ));

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
    .where(and(
      eq(profileComments.profileUserId, profileUserId),
      gt(profileComments.expiresAt, now),
      // Reciprocity rule, enforced retroactively: comments by users whose own
      // archive is no longer public stop rendering until they go public again.
      eq(userTable.isPublic, true),
    ))
    .orderBy(asc(profileComments.createdAt))
    .limit(200);

  return rows.map(serializeComment);
}

export async function createProfileComment(profileUserId, body) {
  const me = await getAuthUser();

  const [target] = await db
    .select({ id: userTable.id, username: userTable.username, isPublic: userTable.isPublic })
    .from(userTable)
    .where(eq(userTable.id, profileUserId));

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

  if (!meRow?.isPublic) {
    throw new Error('Your own archive must be public to comment');
  }

  const clean = String(body || '').trim().slice(0, MAX_COMMENT_LENGTH);
  if (!clean) {
    throw new Error('Comment cannot be empty');
  }

  const windowStart = new Date(Date.now() - COMMENT_RATE_WINDOW_MS);
  const [rateRow] = await db
    .select({ value: count() })
    .from(profileComments)
    .where(and(
      eq(profileComments.authorUserId, me.id),
      gt(profileComments.createdAt, windowStart),
    ));

  if (Number(rateRow?.value ?? 0) >= COMMENT_RATE_LIMIT) {
    throw new Error('You are commenting too fast. Try again in a minute');
  }

  const now = new Date();
  const [created] = await db
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

  revalidatePath(`/u/${target.username}`);

  return serializeComment({
    ...created,
    authorId: meRow.id,
    authorUsername: meRow.username,
    authorName: meRow.name,
    authorImage: meRow.image,
  });
}

export async function deleteProfileComment(commentId) {
  const me = await getAuthUser();

  const [comment] = await db
    .select({ id: profileComments.id, profileUserId: profileComments.profileUserId, authorUserId: profileComments.authorUserId })
    .from(profileComments)
    .where(eq(profileComments.id, commentId));

  if (!comment) {
    throw new Error('Comment not found');
  }

  const isAuthor = comment.authorUserId === me.id;
  const isProfileOwner = comment.profileUserId === me.id;
  if (!isAuthor && !isProfileOwner) {
    throw new Error('You can only delete your own comments');
  }

  await db.delete(profileComments).where(eq(profileComments.id, commentId));

  const [owner] = await db
    .select({ username: userTable.username })
    .from(userTable)
    .where(eq(userTable.id, comment.profileUserId));

  if (owner?.username) {
    revalidatePath(`/u/${owner.username}`);
  }

  return { ok: true };
}
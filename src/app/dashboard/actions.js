'use server';

import { db } from '@/lib/db';
import { mediaEntries } from '@/db/schema';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { eq, and, desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

const VALID_CATEGORIES = ['show', 'book', 'anime', 'manga'];
const MAX_TITLE_LENGTH = 500;
const MAX_NOTES_LENGTH = 5000;
const MAX_SOURCE_ID_LENGTH = 200;
const MAX_COVER_IMAGE_LENGTH = 2_000_000;
const MAX_STRUCTURE_LENGTH = 500;

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

  return await db
    .select()
    .from(mediaEntries)
    .where(eq(mediaEntries.userId, user.id))
    .orderBy(desc(mediaEntries.updatedAt));
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

  revalidatePath('/dashboard');
  return newEntry;
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

  revalidatePath('/dashboard');
  return updated;
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
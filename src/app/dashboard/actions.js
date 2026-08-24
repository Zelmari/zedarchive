'use server';

import { db } from '@/lib/db';
import { mediaEntries } from '@/db/schema';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { eq, and, desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

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

  const title = String(data.title || '').trim();
  if (!title) {
    throw new Error('Title is required');
  }

  const id = crypto.randomUUID();
  const validCategories = ['show', 'book', 'anime', 'manga'];
  const category = validCategories.includes(data.category)
    ? data.category
    : data.type === 'book'
    ? 'book'
    : 'show';

  const primaryUnitCurrent = data.primaryUnitCurrent !== undefined && data.primaryUnitCurrent !== null
    ? Math.max(1, parseInt(data.primaryUnitCurrent, 10) || 1)
    : 1;

  const primaryUnitTotal = data.primaryUnitTotal !== undefined && data.primaryUnitTotal !== null && data.primaryUnitTotal !== ''
    ? Math.max(1, parseInt(data.primaryUnitTotal, 10) || 1)
    : 1;

  const secondaryUnitCurrent = data.secondaryUnitCurrent !== undefined && data.secondaryUnitCurrent !== null
    ? Math.max(0, parseInt(data.secondaryUnitCurrent, 10) || 0)
    : 0;

  const secondaryUnitTotal = data.secondaryUnitTotal !== undefined && data.secondaryUnitTotal !== null && data.secondaryUnitTotal !== ''
    ? Math.max(0, parseInt(data.secondaryUnitTotal, 10))
    : null;

  const structure = Array.isArray(data.structure) ? data.structure : [];
  const coverImage = data.coverImage || null;
  const sourceId = data.sourceId || null;
  const notes = data.notes ? String(data.notes).trim() : null;

  const [newEntry] = await db
    .insert(mediaEntries)
    .values({
      id,
      userId: user.id,
      title,
      category,
      primaryUnitCurrent,
      primaryUnitTotal,
      secondaryUnitCurrent,
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

  if (updates.primaryUnitCurrent !== undefined) {
    updateFields.primaryUnitCurrent = Math.max(1, parseInt(updates.primaryUnitCurrent, 10) || 1);
  }
  if (updates.primaryUnitTotal !== undefined) {
    updateFields.primaryUnitTotal = updates.primaryUnitTotal !== null && updates.primaryUnitTotal !== ''
      ? Math.max(1, parseInt(updates.primaryUnitTotal, 10) || 1)
      : null;
  }
  if (updates.secondaryUnitCurrent !== undefined) {
    updateFields.secondaryUnitCurrent = Math.max(0, parseInt(updates.secondaryUnitCurrent, 10) || 0);
  }
  if (updates.secondaryUnitTotal !== undefined) {
    updateFields.secondaryUnitTotal = updates.secondaryUnitTotal !== null && updates.secondaryUnitTotal !== ''
      ? Math.max(0, parseInt(updates.secondaryUnitTotal, 10))
      : null;
  }
  if (updates.structure !== undefined) {
    updateFields.structure = Array.isArray(updates.structure) ? updates.structure : [];
  }
  if (updates.coverImage !== undefined) {
    updateFields.coverImage = updates.coverImage;
  }
  if (updates.sourceId !== undefined) {
    updateFields.sourceId = updates.sourceId;
  }
  if (updates.title !== undefined) {
    updateFields.title = String(updates.title).trim();
  }
  if (updates.category !== undefined) {
    updateFields.category = updates.category;
  }
  if (updates.notes !== undefined) {
    updateFields.notes = updates.notes;
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

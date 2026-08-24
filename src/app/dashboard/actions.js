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
  const type = data.type === 'book' ? 'book' : 'show';
  const currentSeason = data.currentSeason ? Math.max(1, parseInt(data.currentSeason, 10)) : 1;
  const totalSeasons = data.totalSeasons ? Math.max(1, parseInt(data.totalSeasons, 10)) : 1;
  const currentProgress = data.currentProgress ? Math.max(0, parseInt(data.currentProgress, 10)) : 0;
  const totalUnits = data.totalUnits !== undefined && data.totalUnits !== null && data.totalUnits !== ''
    ? Math.max(0, parseInt(data.totalUnits, 10))
    : null;
  const coverImage = data.coverImage || null;
  const status = data.status || 'in_progress';

  const [newEntry] = await db
    .insert(mediaEntries)
    .values({
      id,
      userId: user.id,
      title,
      type,
      status,
      currentSeason,
      totalSeasons,
      currentProgress,
      totalUnits,
      coverImage,
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

  if (updates.currentProgress !== undefined) {
    updateFields.currentProgress = Math.max(0, parseInt(updates.currentProgress, 10));
  }
  if (updates.currentSeason !== undefined) {
    updateFields.currentSeason = Math.max(1, parseInt(updates.currentSeason, 10));
  }
  if (updates.totalUnits !== undefined) {
    updateFields.totalUnits = updates.totalUnits !== null && updates.totalUnits !== ''
      ? Math.max(0, parseInt(updates.totalUnits, 10))
      : null;
  }
  if (updates.totalSeasons !== undefined) {
    updateFields.totalSeasons = updates.totalSeasons !== null && updates.totalSeasons !== ''
      ? Math.max(1, parseInt(updates.totalSeasons, 10))
      : null;
  }
  if (updates.status !== undefined) {
    updateFields.status = updates.status;
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

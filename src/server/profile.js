'use server';

import { db } from '@/lib/db';
import { user as userTable, mediaEntries } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { MAX_BIO_LENGTH } from '@/lib/constants';
import { normalizeHandle } from '@/lib/handles';
import { serializeEntry } from '@/lib/serialize';
import { getAuthUser } from './internal';

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

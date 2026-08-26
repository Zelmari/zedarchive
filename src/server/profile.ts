'use server';

import { db } from '@/lib/db';
import { user as userTable, mediaEntries } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { MAX_BIO_LENGTH, VALID_THEMES } from '@/lib/constants';
import type { MediaEntry } from '@/types/media';
import { normalizeHandle } from '@/lib/handles';
import { serializeEntry } from '@/lib/serialize';
import { getAuthUser } from './internal';

export async function updateUserTheme(theme: unknown): Promise<{ theme: string }> {
  const user = await getAuthUser();
  const safeTheme = VALID_THEMES.includes(theme as string) ? theme : 'parchment';

  await db
    .update(userTable)
    .set({ theme: safeTheme as never, updatedAt: new Date() })
    .where(eq(userTable.id, user.id));

  return { theme: safeTheme as string };
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

export async function updateUserProfile(updates: Record<string, unknown>) {
  const user = await getAuthUser();
  const updateData: Partial<typeof userTable.$inferInsert> = { updatedAt: new Date() };

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

interface PublicProfileResult {
  user: {
    id: string;
    name: string;
    username: string | null;
    bio: string | null;
    isPublic: boolean;
    createdAt: Date;
  };
  entries: MediaEntry[];
}

export async function getPublicUserProfile(username: unknown): Promise<PublicProfileResult | null> {
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
    entries: entries
      .map(serializeEntry)
      .filter((entry): entry is MediaEntry => entry !== null),
  };
}

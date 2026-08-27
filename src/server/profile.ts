'use server';

import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { user as userTable, mediaEntries } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { MAX_BIO_LENGTH, MAX_NAME_LENGTH, VALID_THEMES } from '@/lib/constants';
import type { MediaEntry } from '@/types/media';
import { normalizeHandle } from '@/lib/handles';
import { serializeEntry } from '@/lib/serialize';
import { getAuthUser } from './internal';

export async function resendVerificationEmailAction(): Promise<{ ok: boolean; error?: string }> {
  const user = await getAuthUser();
  if (!user.email) {
    return { ok: false, error: 'No email address found for this user.' };
  }

  const [dbUser] = await db
    .select({ emailVerified: userTable.emailVerified })
    .from(userTable)
    .where(eq(userTable.id, user.id));

  if (dbUser?.emailVerified) {
    return { ok: true };
  }

  try {
    await auth.api.sendVerificationEmail({
      body: { email: user.email, callbackURL: '/verified' },
      headers: await headers(),
    });
    return { ok: true };
  } catch (err) {
    console.error('Failed to resend verification email:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to send email' };
  }
}

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
      emailVerified: userTable.emailVerified,
      verificationDismissedAt: userTable.verificationDismissedAt,
    })
    .from(userTable)
    .where(eq(userTable.id, user.id));

  return profile;
}

export async function dismissVerificationNotice(): Promise<{ ok: boolean }> {
  const user = await getAuthUser();
  await db
    .update(userTable)
    .set({ verificationDismissedAt: new Date(), updatedAt: new Date() })
    .where(eq(userTable.id, user.id));

  revalidatePath('/dashboard');
  return { ok: true };
}

export async function updateUserProfile(updates: Record<string, unknown>) {
  const user = await getAuthUser();
  const updateData: Partial<typeof userTable.$inferInsert> = { updatedAt: new Date() };

  if (updates.name !== undefined) {
    const name = String(updates.name ?? '')
      .trim()
      .slice(0, MAX_NAME_LENGTH);
    if (!name) {
      throw new Error('Display name cannot be empty');
    }
    updateData.name = name;
  }

  if (updates.username !== undefined) {
    const raw = normalizeHandle(updates.username);
    updateData.username = raw || null;
  }

  if (updates.isPublic !== undefined) {
    updateData.isPublic = Boolean(updates.isPublic);
  }

  if (updates.bio !== undefined) {
    updateData.bio =
      String(updates.bio || '')
        .trim()
        .slice(0, MAX_BIO_LENGTH) || null;
  }

  // Public-archive invariant: a public archive must have a resolvable
  // handle, otherwise comment author links would point at /u/null.
  if (updateData.isPublic !== undefined || updateData.username !== undefined) {
    const [existing] = await db
      .select({ username: userTable.username, isPublic: userTable.isPublic })
      .from(userTable)
      .where(eq(userTable.id, user.id));
    const effectiveUsername =
      updateData.username !== undefined ? updateData.username : (existing?.username ?? null);
    const effectiveIsPublic =
      updateData.isPublic !== undefined ? updateData.isPublic : (existing?.isPublic ?? false);
    if (effectiveIsPublic && !effectiveUsername) {
      throw new Error('A username handle is required to make your archive public');
    }
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
  revalidatePath('/settings');
  if (updated?.username) {
    revalidatePath(`/u/${updated.username}`);
  }
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
    entries: entries.map(serializeEntry).filter((entry): entry is MediaEntry => entry !== null),
  };
}

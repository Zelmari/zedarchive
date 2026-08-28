'use server';

import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { user as userTable, mediaEntries } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import {
  MAX_BIO_LENGTH,
  MAX_NAME_LENGTH,
  MAX_COVER_IMAGE_LENGTH,
  VALID_THEMES,
} from '@/lib/constants';
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

import { updateProfileSchema, updateThemeSchema } from '@/lib/validations/profile';

export async function updateUserTheme(theme: unknown): Promise<{ theme: string }> {
  const user = await getAuthUser();
  const parsed = updateThemeSchema.safeParse({ theme });
  const safeTheme = parsed.success ? parsed.data.theme : 'parchment';

  await db
    .update(userTable)
    .set({ theme: safeTheme as never, updatedAt: new Date() })
    .where(eq(userTable.id, user.id));

  return { theme: safeTheme };
}

import { getUserProfileById } from './queries/user';

export async function getUserProfile() {
  const user = await getAuthUser();
  return getUserProfileById(user.id);
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
  const parsed = updateProfileSchema.safeParse(updates);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues[0]?.message || 'Invalid profile updates';
    throw new Error(errorMsg);
  }

  const validated = parsed.data;
  const updateData: Partial<typeof userTable.$inferInsert> = { updatedAt: new Date() };

  if (validated.name !== undefined) {
    updateData.name = validated.name;
  }

  if (updates.username !== undefined) {
    const raw = normalizeHandle(validated.username);
    updateData.username = raw || null;
  }

  if (validated.isPublic !== undefined) {
    updateData.isPublic = validated.isPublic;
  }

  if (updates.bio !== undefined) {
    updateData.bio = validated.bio || null;
  }

  if (updates.image !== undefined) {
    updateData.image = validated.image || null;
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
      image: userTable.image,
    });

  revalidatePath('/dashboard');
  revalidatePath('/settings');
  if (updated?.username) {
    revalidatePath(`/u/${updated.username}`);
  }
  return updated;
}

import {
  getPublicUserProfile,
  searchPublicProfiles,
  type PublicProfileResult,
  type PublicUserSearchResult,
} from './queries/user';
export { getPublicUserProfile, searchPublicProfiles };
export type { PublicProfileResult, PublicUserSearchResult };

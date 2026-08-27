import { headers } from 'next/headers';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { user as userTable, mediaEntries } from '@/db/schema';
import { serializeEntry } from '@/lib/serialize';
import type { MediaEntry } from '@/types/media';
import type { UserProfile } from '@/types/user';

export async function isAuthenticated(): Promise<boolean> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    return Boolean(session?.user?.id);
  } catch {
    return false;
  }
}

export async function getSessionTheme(): Promise<string> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return 'parchment';
    }
    const [row] = await db
      .select({ theme: userTable.theme })
      .from(userTable)
      .where(eq(userTable.id, session.user.id));
    return row?.theme || 'parchment';
  } catch {
    return 'parchment';
  }
}

export async function getUserById(id: string) {
  const [row] = await db.select().from(userTable).where(eq(userTable.id, id));
  return row ?? null;
}

export async function getUserByUsername(username: string) {
  const clean = username.trim().toLowerCase().replace(/^@/, '');
  const [row] = await db.select().from(userTable).where(eq(userTable.username, clean));
  return row ?? null;
}

export async function getUserProfileById(id: string): Promise<UserProfile | null> {
  const [row] = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      image: userTable.image,
      theme: userTable.theme,
      username: userTable.username,
      isPublic: userTable.isPublic,
      bio: userTable.bio,
      emailVerified: userTable.emailVerified,
      verificationDismissedAt: userTable.verificationDismissedAt,
    })
    .from(userTable)
    .where(eq(userTable.id, id));

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    image: row.image,
    theme: row.theme,
    username: row.username,
    isPublic: row.isPublic,
    bio: row.bio,
    emailVerified: row.emailVerified,
    verificationDismissedAt: row.verificationDismissedAt
      ? row.verificationDismissedAt.toISOString()
      : null,
  };
}

export interface PublicProfileResult {
  user: {
    id: string;
    name: string;
    username: string | null;
    bio: string | null;
    image: string | null;
    theme: string;
    isPublic: boolean;
    createdAt: Date;
  };
  entries: MediaEntry[];
}

export async function getPublicUserProfile(username: unknown): Promise<PublicProfileResult | null> {
  if (!username) return null;
  const clean = String(username).trim().toLowerCase().replace(/^@/, '');

  const [foundUser] = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      username: userTable.username,
      bio: userTable.bio,
      image: userTable.image,
      theme: userTable.theme,
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

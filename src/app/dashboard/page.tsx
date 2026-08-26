import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { mediaEntries, user as userTable } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { serializeEntry } from '@/lib/serialize';
import type { MediaEntry } from '@/types/media';
import DashboardClient from './DashboardClient';

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect('/login');
  }

  // Fetch user profile and preferences
  const [dbUser] = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      image: userTable.image,
      theme: userTable.theme,
      username: userTable.username,
      isPublic: userTable.isPublic,
      bio: userTable.bio,
    })
    .from(userTable)
    .where(eq(userTable.id, session.user.id));

  // Fetch initial media entries for authenticated user
  const rawEntries = await db
    .select()
    .from(mediaEntries)
    .where(eq(mediaEntries.userId, session.user.id))
    .orderBy(desc(mediaEntries.updatedAt));

  // Serialize Date objects for React Server Component -> Client Component boundary
  const initialEntries = rawEntries
    .map(serializeEntry)
    .filter((entry): entry is MediaEntry => entry !== null);

  return (
    <DashboardClient
      user={{
        id: session.user.id,
        name: dbUser?.name || session.user.name,
        email: dbUser?.email || session.user.email,
        image: dbUser?.image || session.user.image,
        theme: dbUser?.theme || 'parchment',
        username: dbUser?.username || null,
        isPublic: Boolean(dbUser?.isPublic),
        bio: dbUser?.bio || null,
      }}
      initialEntries={initialEntries}
    />
  );
}

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { mediaEntries } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import DashboardClient from './DashboardClient';

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect('/login');
  }

  // Fetch initial media entries for authenticated user
  const rawEntries = await db
    .select()
    .from(mediaEntries)
    .where(eq(mediaEntries.userId, session.user.id))
    .orderBy(desc(mediaEntries.updatedAt));

  // Serialize Date objects for React Server Component -> Client Component boundary
  const initialEntries = rawEntries.map((entry) => ({
    ...entry,
    createdAt: entry.createdAt instanceof Date ? entry.createdAt.toISOString() : entry.createdAt,
    updatedAt: entry.updatedAt instanceof Date ? entry.updatedAt.toISOString() : entry.updatedAt,
  }));

  return (
    <DashboardClient
      user={{
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
      }}
      initialEntries={initialEntries}
    />
  );
}

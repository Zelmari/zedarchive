import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq, desc } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { mediaEntries, user as userTable } from '@/db/schema';
import { serializeEntry } from '@/lib/serialize';
import { calculateYearlyStats } from '@/lib/stats';
import type { MediaEntry } from '@/types/media';
import WrappedClient from '@/app/wrapped/WrappedClient';

type PageParams = {
  params: Promise<{ year: string }>;
};

export async function generateMetadata({ params }: PageParams) {
  const { year } = await params;
  return {
    title: `${year} Year in Media — zedarchive Wrapped`,
    description: `Your ${year} entertainment and media summary on ZedArchive.`,
  };
}

export default async function AuthenticatedWrappedPage({ params }: PageParams) {
  const { year } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    redirect('/login');
  }

  const targetYear = parseInt(year, 10) || new Date().getFullYear();

  const [dbUser] = await db
    .select({
      name: userTable.name,
      username: userTable.username,
    })
    .from(userTable)
    .where(eq(userTable.id, session.user.id));

  const rawEntries = await db
    .select()
    .from(mediaEntries)
    .where(eq(mediaEntries.userId, session.user.id))
    .orderBy(desc(mediaEntries.updatedAt));

  const entries = rawEntries.map(serializeEntry).filter((e): e is MediaEntry => e !== null);

  const stats = calculateYearlyStats(entries, targetYear);

  return (
    <WrappedClient
      stats={stats}
      userName={dbUser?.name || session.user.name || 'You'}
      userHandle={dbUser?.username || null}
      isPublicView={false}
      basePath="/wrapped"
    />
  );
}

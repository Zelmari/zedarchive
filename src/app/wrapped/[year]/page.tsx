import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getUserProfileById } from '@/server/queries/user';
import { getMediaEntriesByUserId } from '@/server/queries/media';
import { calculateYearlyStats } from '@/lib/stats';
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

  const dbUser = await getUserProfileById(session.user.id);
  const entries = await getMediaEntriesByUserId(session.user.id);

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

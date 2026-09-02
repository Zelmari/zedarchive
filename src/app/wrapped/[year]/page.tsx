import { getUserProfileById } from '@/server/queries/user';
import { getMediaEntriesByUserId } from '@/server/queries/media';
import { requireSession } from '@/server/internal';
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
  const session = await requireSession();

  const targetYear = parseInt(year, 10) || new Date().getFullYear();

  const dbUser = await getUserProfileById(session.id);
  const entries = await getMediaEntriesByUserId(session.id);

  const stats = calculateYearlyStats(entries, targetYear);

  return (
    <WrappedClient
      stats={stats}
      userName={dbUser?.name || session.name || 'You'}
      userHandle={dbUser?.username || null}
      isPublicView={false}
      basePath="/wrapped"
    />
  );
}

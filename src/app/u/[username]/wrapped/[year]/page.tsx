import { getPublicUserProfile } from '@/server/queries/user';
import { calculateYearlyStats } from '@/lib/stats';
import ArchiveUnavailable from '@/components/ui/ArchiveUnavailable';
import WrappedClient from '@/app/wrapped/WrappedClient';

type PageParams = {
  params: Promise<{ username: string; year: string }>;
};

export async function generateMetadata({ params }: PageParams) {
  const { username, year } = await params;
  const data = await getPublicUserProfile(username);

  if (!data?.user || !data.user.isPublic) {
    return { title: 'Archive Unavailable — zedarchive' };
  }

  return {
    title: `@${data.user.username}’s ${year} Wrapped — zedarchive`,
    description: `Explore @${data.user.username}’s ${year} media and entertainment summary on zedarchive.`,
  };
}

export default async function PublicWrappedPage({ params }: PageParams) {
  const { username, year } = await params;
  const data = await getPublicUserProfile(username);

  if (!data?.user || !data.user.isPublic) {
    return <ArchiveUnavailable ctaLabel="Return Home" />;
  }

  const targetYear = parseInt(year, 10) || new Date().getFullYear();
  const stats = calculateYearlyStats(data.entries, targetYear);

  return (
    <WrappedClient
      stats={stats}
      userName={data.user.name}
      userHandle={data.user.username}
      isPublicView={true}
      basePath={`/u/${data.user.username}/wrapped`}
    />
  );
}

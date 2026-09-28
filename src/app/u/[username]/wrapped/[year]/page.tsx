import { getPublicUserProfile } from '@/server/queries/user';
import { calculateWrappedStats } from '@/lib/stats';
import { parseWrappedYear } from '@/lib/wrapped-year';
import { getWrappedPeriodOption, parseWrappedPeriod } from '@/lib/wrapped-period';
import { notFound } from 'next/navigation';
import ArchiveUnavailable from '@/components/ui/ArchiveUnavailable';
import WrappedClient from '@/app/wrapped/WrappedClient';

type PublicWrappedPageProps = {
  params: Promise<{ username: string; year: string }>;
  searchParams: Promise<{ range?: string | string[] }>;
};

export async function generateMetadata({ params, searchParams }: PublicWrappedPageProps) {
  const { username, year } = await params;
  const { range } = await searchParams;
  const data = await getPublicUserProfile(username);

  if (!data?.user || !data.user.isPublic) {
    return { title: 'Archive Unavailable — zedarchive' };
  }

  const option = getWrappedPeriodOption(parseWrappedPeriod(range));

  if (option.id === 'year') {
    return {
      title: `@${data.user.username}’s ${year} Wrapped — zedarchive`,
      description: `Explore @${data.user.username}’s ${year} media and entertainment summary on zedarchive.`,
    };
  }

  return {
    title: `@${data.user.username}’s ${option.label.toLowerCase()} — zedarchive`,
    description: `Explore @${data.user.username}’s ${option.label.toLowerCase()} of media and entertainment on zedarchive.`,
  };
}

export default async function PublicWrappedPage({ params, searchParams }: PublicWrappedPageProps) {
  const { username, year } = await params;
  const { range } = await searchParams;
  const data = await getPublicUserProfile(username);

  if (!data?.user || !data.user.isPublic) {
    return <ArchiveUnavailable ctaLabel="Return Home" />;
  }

  const targetYear = parseWrappedYear(year);
  if (targetYear == null) notFound();
  const period = parseWrappedPeriod(range);
  const stats = calculateWrappedStats(data.entries, targetYear, period);

  return (
    <WrappedClient
      stats={stats}
      userName={data.user.name}
      userHandle={data.user.username}
      isPublicView={true}
      basePath={`/u/${data.user.username}/wrapped`}
      period={period}
    />
  );
}

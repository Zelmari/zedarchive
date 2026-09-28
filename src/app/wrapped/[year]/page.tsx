import { getUserProfileById } from '@/server/queries/user';
import { getMediaEntriesByUserId } from '@/server/queries/media';
import { requireSession } from '@/server/internal';
import { calculateWrappedStats } from '@/lib/stats';
import { parseWrappedYear } from '@/lib/wrapped-year';
import { getWrappedPeriodOption, parseWrappedPeriod } from '@/lib/wrapped-period';
import { notFound } from 'next/navigation';
import WrappedClient from '@/app/wrapped/WrappedClient';

type WrappedPageProps = {
  params: Promise<{ year: string }>;
  searchParams: Promise<{ range?: string | string[] }>;
};

export async function generateMetadata({ params, searchParams }: WrappedPageProps) {
  const { year } = await params;
  const { range } = await searchParams;
  const option = getWrappedPeriodOption(parseWrappedPeriod(range));

  if (option.id === 'year') {
    return {
      title: `${year} Year in Media — zedarchive Wrapped`,
      description: `Your ${year} entertainment and media summary on ZedArchive.`,
    };
  }

  return {
    title: `${option.label} — zedarchive Wrapped`,
    description: `Your ${option.label.toLowerCase()} of entertainment and media on ZedArchive, as tallied in the ${year} edition.`,
  };
}

export default async function AuthenticatedWrappedPage({ params, searchParams }: WrappedPageProps) {
  const { year } = await params;
  const { range } = await searchParams;
  const session = await requireSession();

  const targetYear = parseWrappedYear(year);
  if (targetYear == null) notFound();

  const period = parseWrappedPeriod(range);

  const dbUser = await getUserProfileById(session.id);
  const entries = await getMediaEntriesByUserId(session.id);

  const stats = calculateWrappedStats(entries, targetYear, period);

  return (
    <WrappedClient
      stats={stats}
      userName={dbUser?.name || session.name || 'You'}
      userHandle={dbUser?.username || null}
      isPublicView={false}
      basePath="/wrapped"
      period={period}
    />
  );
}

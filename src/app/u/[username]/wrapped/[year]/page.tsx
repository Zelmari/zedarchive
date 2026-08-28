import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { getPublicUserProfile } from '@/server/queries/user';
import { calculateYearlyStats } from '@/lib/stats';
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
    return (
      <div
        className="flex min-h-screen flex-col bg-canvas text-ink"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          className="za-card col-span-full flex flex-col items-center justify-center rounded-control border border-dashed border-required px-[var(--za-space-6)] py-[var(--za-space-12)] text-center [box-shadow:none]"
          style={{ maxWidth: '28rem', textAlign: 'center' }}
        >
          <ShieldAlert
            size={36}
            style={{ margin: '0 auto var(--za-space-3)', color: 'var(--za-color-text-muted)' }}
          />
          <h1 className="mb-[var(--za-space-1)] text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] text-ink">
            Archive Unavailable
          </h1>
          <p className="mb-[var(--za-space-6)] max-w-[var(--za-measure-readable)] text-[length:var(--za-text-supporting)] leading-[var(--za-leading-body)] text-ink-muted">
            This archive is either private or does not exist.
          </p>
          <Link href="/" className="za-button za-button--primary">
            Return Home
          </Link>
        </div>
      </div>
    );
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

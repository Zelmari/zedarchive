import Link from 'next/link';
import type { Metadata } from 'next';
import { searchPublicProfiles } from '@/server/queries/user';
import SubPageHeader from '@/components/navigation/SubPageHeader';
import SearchResultsClient from './SearchResultsClient';
import { isAuthenticated } from '@/server/queries/user';

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Discover Public Archives',
  description:
    'Find and explore public media collections, anime tracking logs, and book lists on ZedArchive.',
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams;
  const query = q ? q.trim() : '';
  const results = query ? await searchPublicProfiles(query, { limit: 50 }) : [];
  const loggedIn = await isAuthenticated();

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <SubPageHeader
        actions={
          loggedIn ? (
            <Link href="/dashboard" className="za-button za-button--secondary">
              Dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="za-link">
                Sign in
              </Link>
              <Link href="/signup" className="za-button za-button--primary">
                Get started
              </Link>
            </>
          )
        }
      />
      <main id="main-content" className="flex-1 py-[var(--za-space-8)]">
        <div className="za-container max-w-5xl">
          <SearchResultsClient initialQuery={query} initialResults={results} />
        </div>
      </main>
    </div>
  );
}

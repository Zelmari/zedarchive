import type { Metadata } from 'next';
import { withRequestDb } from '@/lib/db';
import { searchPublicProfiles, isAuthenticated } from '@/server/queries/user';
import SubPageHeader from '@/components/navigation/SubPageHeader';
import AuthNavLink from '@/components/navigation/AuthNavLink';
import SearchResultsClient from './SearchResultsClient';

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
  return withRequestDb(async () => {
    const { q } = await searchParams;
    const query = q ? q.trim() : '';
    const [results, loggedIn] = await Promise.all([
      query ? searchPublicProfiles(query, { limit: 50 }) : [],
      isAuthenticated(),
    ]);

    return (
      <div className="flex min-h-screen flex-col bg-canvas text-ink">
        <SubPageHeader
          backLink={
            loggedIn ? { href: '/dashboard', label: 'Dashboard' } : { href: '/', label: 'Home' }
          }
          actions={
            loggedIn ? (
              <AuthNavLink href="/dashboard" className="za-button za-button--secondary">
                Dashboard
              </AuthNavLink>
            ) : (
              <>
                <AuthNavLink href="/login" className="za-link">
                  Sign in
                </AuthNavLink>
                <AuthNavLink href="/signup" className="za-button za-button--primary">
                  Get started
                </AuthNavLink>
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
  });
}

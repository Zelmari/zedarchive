import Link from 'next/link';
import type { Metadata } from 'next';
import { searchPublicProfiles } from '@/server/queries/user';
import BrandWordmark from '@/components/navigation/BrandWordmark';
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
      {/* Header */}
      <header className="za-site-header">
        <div className="za-container za-container--wide za-site-header__inner">
          <BrandWordmark />

          <nav aria-label="Account" className="za-site-header__nav">
            {loggedIn ? (
              <Link href="/dashboard" className="za-button za-button--secondary">
                Dashboard
              </Link>
            ) : (
              <div className="flex items-center gap-3">
                <Link href="/login" className="za-link text-xs">
                  Log in
                </Link>
                <Link href="/signup" className="za-button za-button--primary text-xs">
                  Create Archive
                </Link>
              </div>
            )}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" className="flex-1 py-8">
        <div className="za-container">
          <SearchResultsClient initialQuery={query} initialResults={results} />
        </div>
      </main>
    </div>
  );
}

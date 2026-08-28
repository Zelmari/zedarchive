'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, ArrowRight, BookOpen, Globe, User } from 'lucide-react';
import { getInitials, formatMonthYear } from '@/lib/format';
import type { PublicUserSearchResult } from '@/server/profile';
import UserSearchCombobox from '@/components/search/UserSearchCombobox';

interface SearchResultsClientProps {
  initialQuery: string;
  initialResults: PublicUserSearchResult[];
}

export default function SearchResultsClient({
  initialQuery,
  initialResults,
}: SearchResultsClientProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="za-card za-card--raised rounded-control border border-required bg-surface p-4 shadow-raised">
        <UserSearchCombobox
          placeholder="Search public archives by username or display name…"
          autoFocus={!initialQuery}
          onSelectUser={(username) => router.push(`/u/${username}`)}
          onFullSearch={(q) => router.push(`/search?q=${encodeURIComponent(q)}`)}
        />
      </div>

      {/* Results Header */}
      {initialQuery ? (
        <div className="flex items-baseline justify-between border-b border-decorative pb-2">
          <h1 className="text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] text-ink">
            Search Results for &ldquo;{initialQuery}&rdquo;
          </h1>
          <span className="text-[length:var(--za-text-fine)] text-ink-muted">
            {initialResults.length}{' '}
            {initialResults.length === 1 ? 'archive found' : 'archives found'}
          </span>
        </div>
      ) : (
        <div className="border-b border-decorative pb-2">
          <h1 className="text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] text-ink">
            Discover Public Archives
          </h1>
          <p className="mt-1 text-[length:var(--za-text-supporting)] text-ink-muted">
            Explore reading lists, anime logs, and media archives created by other members.
          </p>
        </div>
      )}

      {/* Results Grid / List */}
      {initialResults.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {initialResults.map((user) => (
            <article
              key={user.id}
              className="za-card za-card--raised flex flex-col justify-between rounded-control border border-required bg-surface p-5 shadow-raised transition-all hover:border-accent"
            >
              <div className="flex items-start gap-4">
                {user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.image}
                    alt={`${user.name}'s avatar`}
                    className="h-16 w-16 flex-none rounded-full border-2 border-accent object-cover shadow-raised"
                  />
                ) : (
                  <span
                    className="flex h-16 w-16 flex-none items-center justify-center rounded-full border-2 border-accent bg-[var(--za-color-title-tile)] text-lg font-[var(--za-weight-heading)] text-[var(--za-color-title-tile-text)] shadow-raised"
                    aria-hidden="true"
                  >
                    {getInitials(user.name)}
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h2 className="text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] text-ink">
                      {user.name}
                    </h2>
                    <span className="font-mono text-[length:var(--za-text-supporting)] text-ink-muted">
                      @{user.username}
                    </span>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-small border border-success/30 bg-success/10 px-2 py-0.5 text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-success">
                      <Globe size={11} /> Public Archive
                    </span>
                    <span className="rounded-small border border-decorative bg-surface-subtle px-2 py-0.5 text-[length:var(--za-text-fine)] text-ink-muted">
                      {user.totalEntries} {user.totalEntries === 1 ? 'title' : 'titles'} cataloged
                    </span>
                  </div>

                  {user.bio && (
                    <p className="mt-2 line-clamp-2 text-[length:var(--za-text-supporting)] text-ink-muted">
                      {user.bio}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-decorative pt-3">
                <span className="text-[length:var(--za-text-fine)] text-ink-muted">
                  Member since {formatMonthYear(user.createdAt)}
                </span>
                <Link
                  href={`/u/${user.username}`}
                  className="za-button za-button--primary inline-flex items-center gap-1.5 text-xs"
                >
                  <span>View Archive</span>
                  <ArrowRight size={13} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : initialQuery ? (
        <div className="za-card rounded-control border border-decorative bg-surface-subtle p-12 text-center">
          <User size={36} className="mx-auto mb-3 text-ink-muted opacity-40" />
          <h2 className="text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] text-ink">
            No public archives found
          </h2>
          <p className="mx-auto mt-2 max-w-md text-[length:var(--za-text-supporting)] text-ink-muted">
            We couldn&rsquo;t find any public members matching &ldquo;{initialQuery}&rdquo;. Check
            the spelling or search for another username.
          </p>
        </div>
      ) : (
        <div className="za-card rounded-control border border-decorative bg-surface-subtle p-12 text-center">
          <BookOpen size={36} className="mx-auto mb-3 text-ink-muted opacity-40" />
          <h2 className="text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] text-ink">
            Search Public Profiles
          </h2>
          <p className="mx-auto mt-2 max-w-md text-[length:var(--za-text-supporting)] text-ink-muted">
            Type a username or display name above to explore other members&rsquo; reading logs,
            anime lists, and media archives.
          </p>
        </div>
      )}
    </div>
  );
}

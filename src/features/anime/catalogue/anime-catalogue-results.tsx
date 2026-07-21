import { headers } from 'next/headers'
import { AnimeCatalogueCard } from '@/features/anime/catalogue/anime-catalogue-card'
import {
  getAnimeCatalogueArchivePresentation,
  type AnimeCatalogueArchiveAccess,
} from '@/features/anime/catalogue/anime-catalogue-archive-presentation'
import {
  AnimeCatalogueEmptyStateView,
  getAnimeCatalogueEmptyState,
} from '@/features/anime/catalogue/anime-catalogue-empty-state'
import type {
  AnimeCatalogueBrowsePageQuery,
  AnimeCatalogueSearchPageQuery,
} from '@/features/anime/catalogue/anime-catalogue-page-query'
import { AnimeCataloguePagination } from '@/features/anime/catalogue/anime-catalogue-pagination'
import {
  browseAnimeCatalogue,
  searchAnimeCatalogue,
} from '@/server/database/anime-catalogue-service'
import { database } from '@/server/database/client'
import { auth } from '@/server/auth/auth'
import { getAnimeEntryCatalogueMembership } from '@/server/database/anime-entry-service'

type AnimeCatalogueResultsProps = {
  pageQuery: AnimeCatalogueBrowsePageQuery | AnimeCatalogueSearchPageQuery
}

function formatBrowseSummary(totalItems: number): string {
  return `${totalItems} anime`
}

function formatSearchSummary(totalItems: number, query: string): string {
  if (totalItems === 1) {
    return `1 result for "${query}"`
  }

  return `${totalItems} results for "${query}"`
}

export async function AnimeCatalogueResults({
  pageQuery,
}: AnimeCatalogueResultsProps) {
  const cataloguePage =
    pageQuery.kind === 'browse'
      ? await browseAnimeCatalogue(database, {
          page: pageQuery.page,
          pageSize: pageQuery.pageSize,
        })
      : await searchAnimeCatalogue(database, {
          query: pageQuery.query,
          page: pageQuery.page,
          pageSize: pageQuery.pageSize,
        })

  const query = pageQuery.kind === 'search' ? pageQuery.query : undefined
  const emptyState = getAnimeCatalogueEmptyState({
    mode:
      pageQuery.kind === 'browse'
        ? { kind: 'browse' }
        : { kind: 'search', query: pageQuery.query },
    pagination: cataloguePage.pagination,
    itemCount: cataloguePage.items.length,
  })

  let archiveAccess: AnimeCatalogueArchiveAccess = { kind: 'signed-out' }

  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    })

    if (session?.user?.id) {
      try {
        const memberships = await getAnimeEntryCatalogueMembership(database, {
          userId: session.user.id,
          catalogueItemIds: cataloguePage.items.map(({ id }) => id),
        })

        archiveAccess = { kind: 'memberships', memberships }
      } catch {
        console.error('Anime catalogue archive controls lookup failed.')
        archiveAccess = { kind: 'controls-unavailable' }
      }
    }
  } catch {
    console.error('Anime catalogue session lookup failed.')
    archiveAccess = { kind: 'session-unavailable' }
  }

  const archivePresentation =
    getAnimeCatalogueArchivePresentation(archiveAccess)

  return (
    <>
      <p>
        {pageQuery.kind === 'browse'
          ? formatBrowseSummary(cataloguePage.pagination.totalItems)
          : formatSearchSummary(
              cataloguePage.pagination.totalItems,
              pageQuery.query,
            )}
      </p>
      {archivePresentation.notice === 'sign-in' ? (
        <p>
          <a
            className="rounded underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            href="/sign-in"
          >
            Sign in
          </a>{' '}
          to add anime to your archive.
        </p>
      ) : null}
      {archivePresentation.notice === 'controls-unavailable' ? (
        <p role="status">
          Archive controls are temporarily unavailable. Please try again.
        </p>
      ) : null}

      {emptyState === null ? (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cataloguePage.items.map((item) => (
            <li key={item.id}>
              <AnimeCatalogueCard
                archiveState={
                  archivePresentation.cardStateByCatalogueItemId.get(item.id) ??
                  archivePresentation.defaultCardState
                }
                item={item}
              />
            </li>
          ))}
        </ul>
      ) : (
        <AnimeCatalogueEmptyStateView state={emptyState} />
      )}

      <AnimeCataloguePagination
        pagination={cataloguePage.pagination}
        query={query}
      />
    </>
  )
}

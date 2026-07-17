import { AnimeCatalogueCard } from '@/features/anime/catalogue/anime-catalogue-card'
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

      {emptyState === null ? (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cataloguePage.items.map((item) => (
            <li key={item.id}>
              <AnimeCatalogueCard item={item} />
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

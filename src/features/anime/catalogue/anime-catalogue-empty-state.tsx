import { buildAnimeCataloguePageHref } from '@/features/anime/catalogue/anime-catalogue-page-query'
import type { AnimeCataloguePagination } from '@/features/anime/catalogue/anime-catalogue-query'

type AnimeCatalogueMode = { kind: 'browse' } | { kind: 'search'; query: string }

export type AnimeCatalogueEmptyState =
  | { kind: 'empty-catalogue' }
  | { kind: 'no-search-results'; query: string }
  | { kind: 'beyond-last-page'; query?: string }

export function getAnimeCatalogueEmptyState(options: {
  mode: AnimeCatalogueMode
  pagination: AnimeCataloguePagination
  itemCount: number
}): AnimeCatalogueEmptyState | null {
  const { mode, pagination, itemCount } = options

  if (itemCount > 0) {
    return null
  }

  if (pagination.totalItems === 0) {
    return mode.kind === 'browse'
      ? { kind: 'empty-catalogue' }
      : { kind: 'no-search-results', query: mode.query }
  }

  if (pagination.page > pagination.totalPages) {
    return {
      kind: 'beyond-last-page',
      ...(mode.kind === 'search' ? { query: mode.query } : {}),
    }
  }

  return null
}

const emptyStateClassName =
  'space-y-2 rounded border border-gray-300 bg-gray-50 p-4'

const emptyStateLinkClassName =
  'inline-block rounded underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'

export function AnimeCatalogueEmptyStateView({
  state,
}: {
  state: AnimeCatalogueEmptyState
}) {
  if (state.kind === 'empty-catalogue') {
    return (
      <section className={emptyStateClassName}>
        <h2 className="text-lg font-medium">No anime are available yet</h2>
        <p>The public catalogue is empty right now. Check back later.</p>
      </section>
    )
  }

  if (state.kind === 'no-search-results') {
    return (
      <section className={emptyStateClassName}>
        <h2 className="text-lg font-medium">No anime found</h2>
        <p>
          No results matched “{state.query}”. Try another title or browse all
          anime.
        </p>
      </section>
    )
  }

  return (
    <section className={emptyStateClassName}>
      <h2 className="text-lg font-medium">This page has no results</h2>
      <a
        className={emptyStateLinkClassName}
        href={buildAnimeCataloguePageHref({
          query: state.query,
          page: 1,
        })}
      >
        Return to the first page to continue browsing.
      </a>
    </section>
  )
}

import { buildAnimeCataloguePageHref } from '@/features/anime/catalogue/anime-catalogue-page-query'
import type { AnimeCataloguePagination } from '@/features/anime/catalogue/anime-catalogue-query'

type AnimeCataloguePaginationProps = {
  pagination: AnimeCataloguePagination
  query?: string
}

export function AnimeCataloguePagination({
  pagination,
  query,
}: AnimeCataloguePaginationProps) {
  if (pagination.totalPages <= 1) {
    return null
  }

  return (
    <nav
      aria-label="Anime catalogue pagination"
      className="za-card za-card--raised za-pagination grid gap-3 p-4 text-sm sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center"
    >
      {pagination.hasPreviousPage ? (
        <a
          className="za-link sm:justify-self-start"
          href={buildAnimeCataloguePageHref({
            query,
            page: pagination.page - 1,
          })}
        >
          Previous
        </a>
      ) : null}
      <p className="sm:col-start-2 sm:row-start-1 sm:justify-self-center">
        Page {pagination.page} of {pagination.totalPages}
      </p>
      {pagination.hasNextPage ? (
        <a
          className="za-link sm:col-start-3 sm:row-start-1 sm:justify-self-end"
          href={buildAnimeCataloguePageHref({
            query,
            page: pagination.page + 1,
          })}
        >
          Next
        </a>
      ) : null}
    </nav>
  )
}

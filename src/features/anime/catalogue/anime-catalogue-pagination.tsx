import { buildAnimeCataloguePageHref } from '@/features/anime/catalogue/anime-catalogue-page-query'
import type { AnimeCataloguePagination } from '@/features/anime/catalogue/anime-catalogue-query'

type AnimeCataloguePaginationProps = {
  pagination: AnimeCataloguePagination
  query?: string
}

const paginationLinkClassName =
  'rounded underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'

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
      className="flex flex-wrap items-center gap-4 text-sm"
    >
      {pagination.hasPreviousPage ? (
        <a
          className={paginationLinkClassName}
          href={buildAnimeCataloguePageHref({
            query,
            page: pagination.page - 1,
          })}
        >
          Previous
        </a>
      ) : null}
      <p>
        Page {pagination.page} of {pagination.totalPages}
      </p>
      {pagination.hasNextPage ? (
        <a
          className={paginationLinkClassName}
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

import { AnimeCatalogueCard } from '@/features/anime/catalogue/anime-catalogue-card'
import { AnimeCataloguePagination } from '@/features/anime/catalogue/anime-catalogue-pagination'
import {
  buildAnimeCataloguePageHref,
  parseAnimeCataloguePageQuery,
} from '@/features/anime/catalogue/anime-catalogue-page-query'
import {
  browseAnimeCatalogue,
  searchAnimeCatalogue,
} from '@/server/database/anime-catalogue-service'
import { database } from '@/server/database/client'

export const dynamic = 'force-dynamic'

const fieldClassName =
  'rounded border border-gray-300 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'

const buttonClassName =
  'rounded border border-gray-300 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'

const linkClassName =
  'rounded underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'

function formatBrowseSummary(totalItems: number): string {
  return `${totalItems} anime`
}

function formatSearchSummary(totalItems: number, query: string): string {
  if (totalItems === 1) {
    return `1 result for "${query}"`
  }

  return `${totalItems} results for "${query}"`
}

export default async function HomePage({ searchParams }: PageProps<'/'>) {
  const resolvedSearchParams = await searchParams
  const pageQuery = parseAnimeCataloguePageQuery(resolvedSearchParams)

  const isQueryFieldInvalid =
    pageQuery.kind === 'validation-error' && pageQuery.field === 'query'

  let searchDefaultValue = ''
  let showBrowseClearLink = false
  let activeQuery: string | undefined

  if (pageQuery.kind === 'validation-error') {
    searchDefaultValue = pageQuery.queryInput
  } else if (pageQuery.kind === 'search') {
    searchDefaultValue = pageQuery.query
    showBrowseClearLink = true
    activeQuery = pageQuery.query
  }

  const cataloguePage =
    pageQuery.kind === 'browse'
      ? await browseAnimeCatalogue(database, {
          page: pageQuery.page,
          pageSize: pageQuery.pageSize,
        })
      : pageQuery.kind === 'search'
        ? await searchAnimeCatalogue(database, {
            query: pageQuery.query,
            page: pageQuery.page,
            pageSize: pageQuery.pageSize,
          })
        : null

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <header className="space-y-4">
        <h1 className="text-2xl font-semibold">Anime catalogue</h1>
        <form
          className="flex flex-wrap items-end gap-3"
          method="get"
          role="search"
        >
          <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
            <label className="text-sm font-medium" htmlFor="anime-search-query">
              Search anime
            </label>
            <input
              aria-invalid={isQueryFieldInvalid ? true : undefined}
              className={fieldClassName}
              defaultValue={searchDefaultValue}
              id="anime-search-query"
              maxLength={200}
              name="q"
              type="search"
            />
          </div>
          <button className={buttonClassName} type="submit">
            Search
          </button>
          {showBrowseClearLink ? (
            <a className={linkClassName} href={buildAnimeCataloguePageHref({})}>
              Browse all anime
            </a>
          ) : null}
        </form>
        {pageQuery.kind === 'validation-error' ? (
          <p role="alert">{pageQuery.message}</p>
        ) : null}
      </header>

      {cataloguePage === null ? null : (
        <>
          {pageQuery.kind === 'browse' ? (
            <p>{formatBrowseSummary(cataloguePage.pagination.totalItems)}</p>
          ) : null}
          {pageQuery.kind === 'search' ? (
            <p>
              {formatSearchSummary(
                cataloguePage.pagination.totalItems,
                pageQuery.query,
              )}
            </p>
          ) : null}

          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cataloguePage.items.map((item) => (
              <li key={item.id}>
                <AnimeCatalogueCard item={item} />
              </li>
            ))}
          </ul>

          <AnimeCataloguePagination
            pagination={cataloguePage.pagination}
            query={activeQuery}
          />
        </>
      )}
    </main>
  )
}

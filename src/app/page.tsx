import { Suspense } from 'react'
import { AnimeCatalogueResults } from '@/features/anime/catalogue/anime-catalogue-results'
import {
  buildAnimeCataloguePageHref,
  parseAnimeCataloguePageQuery,
  type AnimeCataloguePageQueryInput,
} from '@/features/anime/catalogue/anime-catalogue-page-query'

export const dynamic = 'force-dynamic'

const fieldClassName =
  'rounded border border-gray-300 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'

const buttonClassName =
  'rounded border border-gray-300 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'

const linkClassName =
  'rounded underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'

type HomePageProps = {
  searchParams: Promise<AnimeCataloguePageQueryInput>
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolvedSearchParams = await searchParams
  const pageQuery = parseAnimeCataloguePageQuery(resolvedSearchParams)

  const isQueryFieldInvalid =
    pageQuery.kind === 'validation-error' && pageQuery.field === 'query'

  let searchDefaultValue = ''
  let showBrowseClearLink = false

  if (pageQuery.kind === 'validation-error') {
    searchDefaultValue = pageQuery.queryInput
  } else if (pageQuery.kind === 'search') {
    searchDefaultValue = pageQuery.query
    showBrowseClearLink = true
  }

  const resultsKey =
    pageQuery.kind === 'browse'
      ? `browse:${pageQuery.page}`
      : pageQuery.kind === 'search'
        ? `search:${pageQuery.query}:${pageQuery.page}`
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

      {pageQuery.kind === 'validation-error' ? null : (
        <Suspense
          fallback={<p role="status">Loading anime catalogue…</p>}
          key={resultsKey}
        >
          <AnimeCatalogueResults pageQuery={pageQuery} />
        </Suspense>
      )}
    </main>
  )
}

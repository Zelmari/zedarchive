import { Suspense } from 'react'
import { AnimeCatalogueResults } from '@/features/anime/catalogue/anime-catalogue-results'
import {
  buildAnimeCataloguePageHref,
  parseAnimeCataloguePageQuery,
  type AnimeCataloguePageQueryInput,
} from '@/features/anime/catalogue/anime-catalogue-page-query'

export const dynamic = 'force-dynamic'

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
    <main
      id="main-content"
      tabIndex={-1}
      className="za-container za-container--wide space-y-6 py-6 sm:space-y-8 sm:py-8"
    >
      <header className="za-card za-card--raised space-y-4 p-4 sm:p-6">
        <h1 className="wrap-anywhere text-[length:var(--za-text-heading-xl)] leading-[var(--za-leading-compact)] font-semibold">
          Anime catalogue
        </h1>
        <form
          className="flex flex-wrap items-end gap-3"
          method="get"
          role="search"
        >
          <div className="flex w-full min-w-0 flex-none flex-col gap-1 sm:w-auto sm:min-w-[12rem] sm:flex-1">
            <label className="text-sm font-medium" htmlFor="anime-search-query">
              Search anime
            </label>
            <input
              aria-invalid={isQueryFieldInvalid ? true : undefined}
              className="za-field"
              defaultValue={searchDefaultValue}
              id="anime-search-query"
              maxLength={200}
              name="q"
              type="search"
            />
          </div>
          <button className="za-button za-button--primary" type="submit">
            Search
          </button>
          {showBrowseClearLink ? (
            <a className="za-link" href={buildAnimeCataloguePageHref({})}>
              Browse all anime
            </a>
          ) : null}
        </form>
        {pageQuery.kind === 'validation-error' ? (
          <p className="za-notice za-notice--error" role="alert">
            {pageQuery.message}
          </p>
        ) : null}
      </header>

      {pageQuery.kind === 'validation-error' ? null : (
        <Suspense
          fallback={
            <p className="za-notice za-notice--information" role="status">
              Loading anime catalogue…
            </p>
          }
          key={resultsKey}
        >
          <AnimeCatalogueResults pageQuery={pageQuery} />
        </Suspense>
      )}
    </main>
  )
}

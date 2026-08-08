import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const { AnimeCatalogueResults } = vi.hoisted(() => ({
  AnimeCatalogueResults: vi.fn(({ pageQuery }) =>
    createElement(
      'section',
      { 'data-catalogue-results': pageQuery.kind },
      'Complete catalogue results',
    ),
  ),
}))

vi.mock('@/features/anime/catalogue/anime-catalogue-results', () => ({
  AnimeCatalogueResults,
}))

import HomePage from '@/app/page'

describe('HomePage catalogue rendering', () => {
  it('renders complete valid results directly rather than a Suspense loading fallback', async () => {
    const markup = renderToStaticMarkup(
      await HomePage({ searchParams: Promise.resolve({ page: '2' }) }),
    )

    expect(markup).toContain('data-catalogue-results="browse"')
    expect(markup).toContain('Complete catalogue results')
    expect(markup).not.toContain('Loading anime catalogue')
    expect(markup).toContain('Anime catalogue')
    expect(markup).toContain('Every anime you’ve ever loved, filed in ink.')
    expect(markup).toContain(
      'Thousands of series and films, catalogued with care. Search the shelves, keep track of what you’re watching, and stamp your own archive.',
    )
    expect(markup).toContain('za-page-masthead')
    expect(markup).toContain('za-catalogue-search')
  })

  it('associates invalid search feedback with the search input and skips results', async () => {
    const markup = renderToStaticMarkup(
      await HomePage({
        searchParams: Promise.resolve({ q: ['Cowboy Bebop', 'Bebop'] }),
      }),
    )

    expect(markup).toContain('aria-invalid="true"')
    expect(markup).toContain('aria-describedby="anime-search-query-error"')
    expect(markup).toContain('id="anime-search-query-error"')
    expect(markup).toContain('role="alert"')
    expect(markup).not.toContain('data-catalogue-results')
  })
})

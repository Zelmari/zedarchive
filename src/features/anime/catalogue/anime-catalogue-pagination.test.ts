import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AnimeCataloguePagination } from '@/features/anime/catalogue/anime-catalogue-pagination'
import type { AnimeCataloguePagination as AnimeCataloguePaginationModel } from '@/features/anime/catalogue/anime-catalogue-query'

function createPagination(
  overrides: Partial<AnimeCataloguePaginationModel> = {},
): AnimeCataloguePaginationModel {
  return {
    page: 2,
    pageSize: 24,
    totalItems: 72,
    totalPages: 3,
    hasPreviousPage: true,
    hasNextPage: true,
    ...overrides,
  }
}

function renderPagination(
  pagination: AnimeCataloguePaginationModel,
  query?: string,
) {
  return renderToStaticMarkup(
    createElement(AnimeCataloguePagination, { pagination, query }),
  )
}

describe('AnimeCataloguePagination', () => {
  it('renders nothing when there is only one page', () => {
    const markup = renderPagination(
      createPagination({
        page: 1,
        totalItems: 1,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      }),
    )

    expect(markup).toBe('')
  })

  it('keeps the accessible landmark, source order, canonical browse links, and stable wide placement', () => {
    const markup = renderPagination(createPagination())
    const previousIndex = markup.indexOf('>Previous</a>')
    const summaryIndex = markup.indexOf('>Page 2 of 3</p>')
    const nextIndex = markup.indexOf('>Next</a>')

    expect(markup).toContain('aria-label="Anime catalogue pagination"')
    expect(markup).toContain('za-pagination')
    expect(markup).toMatch(
      /<nav[^>]*class="[^"]*\bza-card--raised\b[^"]*\bp-4\b[^"]*"/,
    )
    expect(previousIndex).toBeGreaterThanOrEqual(0)
    expect(summaryIndex).toBeGreaterThan(previousIndex)
    expect(nextIndex).toBeGreaterThan(summaryIndex)
    expect(markup).toContain('href="/"')
    expect(markup).toContain('href="/?page=3"')
    expect(markup).toContain('sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]')
    expect(markup).toContain('sm:col-start-2')
    expect(markup).toContain('sm:col-start-3')
  })

  it('keeps search-query links canonical, including the page-one omission', () => {
    const markup = renderPagination(createPagination(), 'Cowboy Bebop')

    expect(markup).toContain('href="/?q=Cowboy+Bebop"')
    expect(markup).toContain('href="/?q=Cowboy+Bebop&amp;page=3"')
  })

  it.each([
    createPagination({ page: 1, hasPreviousPage: false }),
    createPagination({ page: 3, hasNextPage: false }),
  ])(
    'keeps the summary explicitly in the middle when an edge link is absent',
    (pagination) => {
      const markup = renderPagination(pagination)

      expect(markup).toContain(`>Page ${pagination.page} of 3</p>`)
      expect(markup).toContain('sm:col-start-2')
      expect(markup).toContain('sm:row-start-1')
      if (!pagination.hasPreviousPage) {
        expect(markup).not.toContain('>Previous</a>')
      }

      if (!pagination.hasNextPage) {
        expect(markup).not.toContain('>Next</a>')
      }
    },
  )
})

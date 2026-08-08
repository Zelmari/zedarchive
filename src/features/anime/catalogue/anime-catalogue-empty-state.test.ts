import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  AnimeCatalogueEmptyStateView,
  getAnimeCatalogueEmptyState,
} from '@/features/anime/catalogue/anime-catalogue-empty-state'
import type { AnimeCataloguePagination } from '@/features/anime/catalogue/anime-catalogue-query'

function createPagination(
  overrides: Partial<AnimeCataloguePagination> = {},
): AnimeCataloguePagination {
  return {
    page: 1,
    pageSize: 24,
    totalItems: 0,
    totalPages: 0,
    hasPreviousPage: false,
    hasNextPage: false,
    ...overrides,
  }
}

describe('getAnimeCatalogueEmptyState', () => {
  it('selects the empty-catalogue state for an empty browse', () => {
    expect(
      getAnimeCatalogueEmptyState({
        mode: { kind: 'browse' },
        pagination: createPagination(),
        itemCount: 0,
      }),
    ).toEqual({ kind: 'empty-catalogue' })
  })

  it('selects the no-results state and preserves the normalized search query', () => {
    expect(
      getAnimeCatalogueEmptyState({
        mode: { kind: 'search', query: 'Cowboy Bebop' },
        pagination: createPagination(),
        itemCount: 0,
      }),
    ).toEqual({ kind: 'no-search-results', query: 'Cowboy Bebop' })
  })

  it('selects a beyond-last-page browse state', () => {
    expect(
      getAnimeCatalogueEmptyState({
        mode: { kind: 'browse' },
        pagination: createPagination({
          page: 3,
          totalItems: 25,
          totalPages: 2,
          hasPreviousPage: true,
        }),
        itemCount: 0,
      }),
    ).toEqual({ kind: 'beyond-last-page' })
  })

  it('preserves the query in a beyond-last-page search state', () => {
    expect(
      getAnimeCatalogueEmptyState({
        mode: { kind: 'search', query: 'FLCL' },
        pagination: createPagination({
          page: 2,
          totalItems: 1,
          totalPages: 1,
          hasPreviousPage: true,
        }),
        itemCount: 0,
      }),
    ).toEqual({ kind: 'beyond-last-page', query: 'FLCL' })
  })

  it('does not select an empty state for a populated page', () => {
    expect(
      getAnimeCatalogueEmptyState({
        mode: { kind: 'browse' },
        pagination: createPagination({
          totalItems: 1,
          totalPages: 1,
        }),
        itemCount: 1,
      }),
    ).toBeNull()
  })
})

describe('AnimeCatalogueEmptyStateView', () => {
  it.each([
    [
      { kind: 'empty-catalogue' } as const,
      'No anime are available yet',
      'The public catalogue is empty right now. Check back later.',
    ],
    [
      { kind: 'no-search-results', query: 'Cowboy Bebop' } as const,
      'No anime found',
      'No results matched “Cowboy Bebop”. Try another title or browse all anime.',
    ],
  ])(
    'uses the shared raised in-flow card recipe for %o',
    (state, heading, copy) => {
      const markup = renderToStaticMarkup(
        createElement(AnimeCatalogueEmptyStateView, { state }),
      )

      expect(markup).toContain('<section')
      expect(markup).toMatch(
        /class="[^"]*\bza-card\b[^"]*\bza-card--raised\b[^"]*"/,
      )
      expect(markup).toContain(`<h2`)
      expect(markup).toContain('za-empty-state')
      expect(markup).toContain('za-card-title')
      expect(markup).toContain(`>${heading}</h2>`)
      expect(markup).toContain(copy)
    },
  )

  it('keeps the beyond-final recovery link semantic and canonical', () => {
    const markup = renderToStaticMarkup(
      createElement(AnimeCatalogueEmptyStateView, {
        state: { kind: 'beyond-last-page', query: 'Cowboy Bebop' },
      }),
    )

    expect(markup).toContain('This page has no results')
    expect(markup).toMatch(/class="[^"]*\bza-card--raised\b[^"]*"/)
    expect(markup).toContain('class="za-link"')
    expect(markup).toContain('href="/?q=Cowboy+Bebop"')
    expect(markup).toContain('Return to the first page to continue browsing.')
  })
})

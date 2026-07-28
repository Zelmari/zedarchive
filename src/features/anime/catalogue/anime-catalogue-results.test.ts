import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { getAnimeCatalogueArchivePresentation } from '@/features/anime/catalogue/anime-catalogue-archive-presentation'
import type { AnimeCataloguePageItem } from '@/features/anime/catalogue/anime-catalogue-query'

const { readAnimeCatalogueForViewer, resolvePublicPersonalizationSession } =
  vi.hoisted(() => ({
    readAnimeCatalogueForViewer: vi.fn(),
    resolvePublicPersonalizationSession: vi.fn(),
  }))

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}))

vi.mock('server-only', () => ({}))

vi.mock('@/server/database/client', () => ({ database: {} }))

vi.mock('@/server/database/anime-catalogue-service', () => ({
  readAnimeCatalogueForViewer,
}))

vi.mock('@/features/auth/server/account-access-composition', () => ({
  resolvePublicPersonalizationSession,
}))

vi.mock('@/features/anime/catalogue/anime-catalogue-card', () => ({
  AnimeCatalogueCard: ({ item }: { item: AnimeCataloguePageItem }) =>
    createElement(
      'article',
      { 'data-catalogue-card': item.id },
      item.displayTitle,
    ),
}))

vi.mock('@/features/anime/catalogue/anime-catalogue-pagination', () => ({
  AnimeCataloguePagination: () =>
    createElement('nav', { 'aria-label': 'Anime catalogue pagination' }),
}))

import { AnimeCatalogueResults } from '@/features/anime/catalogue/anime-catalogue-results'

vi.spyOn(console, 'error').mockImplementation(() => undefined)

const item: AnimeCataloguePageItem = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  titles: {
    english: 'Cowboy Bebop',
    romaji: null,
    original: null,
    alternatives: [],
  },
  format: 'tv',
  releaseStatus: 'finished',
  releaseYear: 1998,
  episodeCount: 26,
  maturity: 'safe',
  displayTitle: 'Cowboy Bebop',
}

function mockCataloguePage() {
  readAnimeCatalogueForViewer.mockResolvedValue({
    cataloguePage: {
      items: [item],
      pagination: {
        page: 1,
        pageSize: 24,
        totalItems: 1,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      },
    },
    memberships: null,
  })
}

describe('getAnimeCatalogueArchivePresentation', () => {
  it('represents signed-out state as a non-mutating public view', () => {
    const presentation = getAnimeCatalogueArchivePresentation({
      kind: 'signed-out',
    })

    expect(presentation.notice).toBe('sign-in')
    expect(presentation.defaultCardState).toEqual({ kind: 'signed-out' })
    expect(presentation.cardStateByCatalogueItemId.size).toBe(0)
  })

  it('makes signed-in cards add-capable when membership is empty', () => {
    const presentation = getAnimeCatalogueArchivePresentation({
      kind: 'memberships',
      memberships: [],
    })

    expect(presentation.notice).toBeNull()
    expect(presentation.defaultCardState).toEqual({ kind: 'can-add' })
    expect(presentation.cardStateByCatalogueItemId.size).toBe(0)
  })

  it('maps owner memberships to saved card states and leaves other cards add-capable', () => {
    const presentation = getAnimeCatalogueArchivePresentation({
      kind: 'memberships',
      memberships: [
        {
          catalogueItemId: '550e8400-e29b-41d4-a716-446655440000',
          status: 'completed',
        },
      ],
    })

    expect(presentation.defaultCardState).toEqual({ kind: 'can-add' })
    expect(
      presentation.cardStateByCatalogueItemId.get(
        '550e8400-e29b-41d4-a716-446655440000',
      ),
    ).toEqual({ kind: 'saved', status: 'completed' })
  })

  it.each(['controls-unavailable', 'session-unavailable'] as const)(
    'fails closed for mutation controls when %s',
    (kind) => {
      const presentation = getAnimeCatalogueArchivePresentation({ kind })

      expect(presentation.notice).toBe('controls-unavailable')
      expect(presentation.defaultCardState).toEqual({
        kind: 'controls-unavailable',
      })
      expect(presentation.cardStateByCatalogueItemId.size).toBe(0)
    },
  )
})

describe('AnimeCatalogueResults presentation', () => {
  it('keeps the result summary contextual and uses the approved signed-out notice and grid recipes', async () => {
    resolvePublicPersonalizationSession.mockResolvedValue(null)
    mockCataloguePage()

    const markup = renderToStaticMarkup(
      await AnimeCatalogueResults({
        pageQuery: { kind: 'browse', page: 1, pageSize: 24 },
      }),
    )

    expect(markup).toContain('>1 anime</p>')
    expect(markup).toContain('za-notice za-notice--information')
    expect(markup).toContain('href="/sign-in"')
    expect(markup).toContain('Sign in</a> to add anime to your archive.')
    expect(markup).toContain('grid-cols-1')
    expect(markup).toContain('sm:grid-cols-2')
    expect(markup).toContain('lg:grid-cols-3')
    expect(markup).toContain('gap-6')
    expect(markup).toContain('data-catalogue-card')
    expect(markup).toContain('aria-label="Anime catalogue pagination"')
  })

  it('renders controls-unavailable as a distinct warning notice', async () => {
    resolvePublicPersonalizationSession.mockRejectedValue(
      new Error('session unavailable'),
    )
    mockCataloguePage()

    const markup = renderToStaticMarkup(
      await AnimeCatalogueResults({
        pageQuery: {
          kind: 'search',
          query: 'Cowboy Bebop',
          page: 1,
          pageSize: 24,
        },
      }),
    )

    expect(markup).toContain('1 result for &quot;Cowboy Bebop&quot;')
    expect(markup).toContain('za-notice za-notice--warning')
    expect(markup).toContain('role="status"')
    expect(markup).toContain(
      'Archive controls are temporarily unavailable. Please try again.',
    )
    expect(markup).not.toContain('Sign in</a> to add anime to your archive.')
  })
})

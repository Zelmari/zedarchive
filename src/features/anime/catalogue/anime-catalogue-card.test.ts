import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { AnimeCataloguePageItem } from '@/features/anime/catalogue/anime-catalogue-query'

vi.mock('@/features/archive/components/add-anime-entry-form', () => ({
  AddAnimeEntryForm: ({
    catalogueItemId,
    animeTitle,
  }: {
    catalogueItemId: string
    animeTitle: string
  }) => createElement('p', null, `add:${catalogueItemId}:${animeTitle}`),
}))

import { AnimeCatalogueCard } from '@/features/anime/catalogue/anime-catalogue-card'

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

describe('AnimeCatalogueCard archive state', () => {
  it('renders an add form only when the authenticated viewer can add the item', () => {
    const markup = renderToStaticMarkup(
      createElement(AnimeCatalogueCard, {
        archiveState: { kind: 'can-add' },
        item,
      }),
    )

    expect(markup).toContain(`add:${item.id}:Cowboy Bebop`)
  })

  it.each([
    { kind: 'signed-out' } as const,
    { kind: 'controls-unavailable' } as const,
  ])('does not render a mutation control for %o', (archiveState) => {
    const markup = renderToStaticMarkup(
      createElement(AnimeCatalogueCard, { archiveState, item }),
    )

    expect(markup).not.toContain('add:')
  })

  it('renders an existing entry as static, non-editable status text', () => {
    const markup = renderToStaticMarkup(
      createElement(AnimeCatalogueCard, {
        archiveState: { kind: 'saved', status: 'in_progress' },
        item,
      }),
    )

    expect(markup).toContain('In your archive — In progress')
    expect(markup).not.toContain('add:')
    expect(markup).not.toContain('<select')
  })

  it('uses the resolved display title for initials, headings, and Add context', () => {
    const markup = renderToStaticMarkup(
      createElement(AnimeCatalogueCard, {
        archiveState: { kind: 'can-add' },
        item: {
          ...item,
          displayTitle: 'Furi Kuri',
        },
      }),
    )

    expect(markup).toContain('>FK<')
    expect(markup).toContain('<h2 class="text-lg font-medium">Furi Kuri</h2>')
    expect(markup).toContain(`add:${item.id}:Furi Kuri`)
  })

  it('labels intentionally visible adult cards factually', () => {
    const markup = renderToStaticMarkup(
      createElement(AnimeCatalogueCard, {
        archiveState: { kind: 'can-add' },
        item: {
          ...item,
          maturity: 'adult',
        },
      }),
    )

    expect(markup).toContain('Adult content')
  })
})

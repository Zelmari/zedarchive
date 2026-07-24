import { describe, expect, it } from 'vitest'
import { getAnimeCatalogueArchivePresentation } from '@/features/anime/catalogue/anime-catalogue-archive-presentation'

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

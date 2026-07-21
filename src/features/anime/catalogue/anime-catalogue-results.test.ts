import { describe, expect, it } from 'vitest'
import { getAnimeCatalogueArchivePresentation } from '@/features/anime/catalogue/anime-catalogue-archive-presentation'

describe('getAnimeCatalogueArchivePresentation', () => {
  it.each(['signed-out', 'session-unavailable'] as const)(
    'represents %s as a signed-out, non-mutating public view',
    (kind) => {
      const presentation = getAnimeCatalogueArchivePresentation({ kind })

      expect(presentation.notice).toBe('sign-in')
      expect(presentation.defaultCardState).toEqual({ kind: 'signed-out' })
      expect(presentation.cardStateByCatalogueItemId.size).toBe(0)
    },
  )

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

  it('fails closed for mutation controls when membership is unavailable', () => {
    const presentation = getAnimeCatalogueArchivePresentation({
      kind: 'controls-unavailable',
    })

    expect(presentation.notice).toBe('controls-unavailable')
    expect(presentation.defaultCardState).toEqual({
      kind: 'controls-unavailable',
    })
    expect(presentation.cardStateByCatalogueItemId.size).toBe(0)
  })
})

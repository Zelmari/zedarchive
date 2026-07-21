import { describe, expect, it } from 'vitest'
import { entryStatusValues } from '@/features/archive/domain/entry-status'
import {
  addAnimeEntryInputSchema,
  parseAddAnimeEntryFormData,
} from '@/features/archive/domain/add-anime-entry'

const validCatalogueItemId = '11111111-1111-4111-8111-111111111111'

function createFormData(values: Record<string, string | string[]>) {
  const formData = new FormData()

  for (const [name, value] of Object.entries(values)) {
    for (const entry of Array.isArray(value) ? value : [value]) {
      formData.append(name, entry)
    }
  }

  return formData
}

describe('add anime entry input', () => {
  it.each(entryStatusValues)('accepts the canonical %s status', (status) => {
    expect(
      parseAddAnimeEntryFormData(
        createFormData({ catalogueItemId: validCatalogueItemId, status }),
      ),
    ).toEqual({
      kind: 'valid',
      input: { catalogueItemId: validCatalogueItemId, status },
    })
  })

  it.each([
    ['missing', {}],
    ['blank', { status: '' }],
    ['unknown', { status: 'watching' }],
    ['wrong case', { status: 'PLANNED' }],
    ['multiple values', { status: ['planned', 'completed'] }],
  ])('rejects a %s status', (_, values) => {
    expect(
      parseAddAnimeEntryFormData(
        createFormData({ catalogueItemId: validCatalogueItemId, ...values }),
      ),
    ).toEqual({ kind: 'invalid_status' })
  })

  it('rejects a File-valued status', () => {
    const formData = createFormData({
      catalogueItemId: validCatalogueItemId,
    })
    formData.set('status', new File(['planned'], 'status.txt'))

    expect(parseAddAnimeEntryFormData(formData)).toEqual({
      kind: 'invalid_status',
    })
  })

  it.each([
    ['missing', undefined],
    ['malformed', 'not-a-uuid'],
    ['non-v4', '11111111-1111-5111-8111-111111111111'],
    ['multiple values', [validCatalogueItemId, validCatalogueItemId]],
  ])('maps a %s catalogue item ID to the unavailable outcome', (_, id) => {
    const formData = new FormData()
    formData.set('status', 'planned')

    if (typeof id === 'string') {
      formData.set('catalogueItemId', id)
    } else if (Array.isArray(id)) {
      for (const value of id) {
        formData.append('catalogueItemId', value)
      }
    }

    expect(parseAddAnimeEntryFormData(formData)).toEqual({
      kind: 'unavailable',
    })
  })

  it('maps a File-valued catalogue item ID to the unavailable outcome', () => {
    const formData = createFormData({ status: 'planned' })
    formData.set(
      'catalogueItemId',
      new File([validCatalogueItemId], 'catalogue-item-id.txt'),
    )

    expect(parseAddAnimeEntryFormData(formData)).toEqual({
      kind: 'unavailable',
    })
  })

  it('does not allow extra identity fields in the typed input contract', () => {
    expect(
      addAnimeEntryInputSchema.safeParse({
        catalogueItemId: validCatalogueItemId,
        status: 'planned',
        userId: '22222222-2222-4222-8222-222222222222',
      }).success,
    ).toBe(false)
  })
})

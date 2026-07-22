import { describe, expect, it } from 'vitest'
import { parseUpdateAnimeEntryFavouriteFormData } from '@/features/archive/domain/update-anime-entry-favourite'

const entryId = '11111111-1111-4111-8111-111111111111'

function form(): FormData {
  const data = new FormData()
  data.set('entryId', entryId)
  data.set('expectedFavourite', 'false')
  data.set('requestedFavourite', 'true')
  return data
}

describe('favourite command parser', () => {
  it.each([
    ['false', 'true', false, true],
    ['true', 'false', true, false],
  ])(
    'parses an absolute boolean target %#',
    (expected, requested, expectedFavourite, requestedFavourite) => {
      const data = form()
      data.set('expectedFavourite', expected)
      data.set('requestedFavourite', requested)
      expect(parseUpdateAnimeEntryFavouriteFormData(data)).toEqual({
        kind: 'valid',
        input: { entryId, expectedFavourite, requestedFavourite },
      })
    },
  )

  it.each([
    ['missing entry ID', (data: FormData) => data.delete('entryId')],
    ['duplicate entry ID', (data: FormData) => data.append('entryId', entryId)],
    [
      'File entry ID',
      (data: FormData) => data.set('entryId', new File(['id'], 'id.txt')),
    ],
    ['invalid UUID', (data: FormData) => data.set('entryId', 'not-a-uuid')],
    ['extra user ID', (data: FormData) => data.set('userId', 'forged')],
    [
      'missing expected boolean',
      (data: FormData) => data.delete('expectedFavourite'),
    ],
    [
      'duplicate expected boolean',
      (data: FormData) => data.append('expectedFavourite', 'false'),
    ],
    [
      'File expected boolean',
      (data: FormData) =>
        data.set('expectedFavourite', new File(['true'], 'state.txt')),
    ],
    [
      'uppercase expected boolean',
      (data: FormData) => data.set('expectedFavourite', 'True'),
    ],
    [
      'numeric expected boolean',
      (data: FormData) => data.set('expectedFavourite', '1'),
    ],
    [
      'truthy requested boolean',
      (data: FormData) => data.set('requestedFavourite', 'on'),
    ],
    [
      'whitespace requested boolean',
      (data: FormData) => data.set('requestedFavourite', ' true'),
    ],
    [
      'missing requested boolean',
      (data: FormData) => data.delete('requestedFavourite'),
    ],
    [
      'duplicate requested boolean',
      (data: FormData) => data.append('requestedFavourite', 'true'),
    ],
    [
      'File requested boolean',
      (data: FormData) =>
        data.set('requestedFavourite', new File(['true'], 'state.txt')),
    ],
  ])('fails closed for %s', (_, alter) => {
    const data = form()
    alter(data)
    expect(parseUpdateAnimeEntryFavouriteFormData(data)).toEqual({
      kind: 'unavailable',
    })
  })
})

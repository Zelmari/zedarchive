import { describe, expect, it } from 'vitest'
import { ratingNoneSentinel } from '@/features/archive/domain/rating'
import {
  parseUpdateAnimeEntryRatingFormData,
  ratingOperationValues,
} from '@/features/archive/domain/update-anime-entry-rating'

const entryId = '11111111-1111-4111-8111-111111111111'

function form() {
  const data = new FormData()
  data.set('entryId', entryId)
  data.set('ratingOperation', 'save')
  data.set('expectedRating', ratingNoneSentinel)
  data.set('requestedRating', '7.5')
  return data
}

describe('rating command parser', () => {
  it('exports the fixed operation values', () => {
    expect(ratingOperationValues).toEqual(['save', 'remove'])
  })

  it.each([
    ['1', 1],
    ['1.0', 1],
    ['7', 7],
    ['7.5', 7.5],
    ['10', 10],
    ['10.0', 10],
  ])('parses a strict save value %s', (requestedRating, expectedRating) => {
    const data = form()
    data.set('requestedRating', requestedRating)
    expect(parseUpdateAnimeEntryRatingFormData(data)).toEqual({
      kind: 'valid',
      input: {
        entryId,
        ratingOperation: 'save',
        expectedRating: null,
        requestedRating: expectedRating,
      },
    })
  })

  it('parses a remove command with a present expected rating', () => {
    const data = form()
    data.set('ratingOperation', 'remove')
    data.set('expectedRating', '7.5')
    data.set('requestedRating', ratingNoneSentinel)
    expect(parseUpdateAnimeEntryRatingFormData(data)).toEqual({
      kind: 'valid',
      input: {
        entryId,
        ratingOperation: 'remove',
        expectedRating: 7.5,
        requestedRating: null,
      },
    })
  })

  it.each([
    '',
    ' 7.5',
    '7.5 ',
    '+7.5',
    '-7.5',
    '07.5',
    '.5',
    '7.50',
    '7.55',
    '1e1',
    '0.9',
    '10.1',
    ratingNoneSentinel,
  ])('reports malformed save rating %s as user-correctable', (value) => {
    const data = form()
    data.set('requestedRating', value)
    expect(parseUpdateAnimeEntryRatingFormData(data)).toEqual({
      kind: 'invalid_rating',
    })
  })

  it.each([
    [
      'missing requested save rating',
      (data: FormData) => data.delete('requestedRating'),
    ],
    [
      'repeated requested save rating',
      (data: FormData) => data.append('requestedRating', '7.5'),
    ],
    [
      'file requested save rating',
      (data: FormData) =>
        data.set('requestedRating', new File(['7.5'], 'rating.txt')),
    ],
  ])('reports %s as user-correctable', (_, alter) => {
    const data = form()
    alter(data)
    expect(parseUpdateAnimeEntryRatingFormData(data)).toEqual({
      kind: 'invalid_rating',
    })
  })

  it.each([
    ['extra field', (data: FormData) => data.set('userId', 'attacker')],
    ['missing entry ID', (data: FormData) => data.delete('entryId')],
    [
      'malformed entry ID',
      (data: FormData) => data.set('entryId', 'not-a-uuid'),
    ],
    ['repeated entry ID', (data: FormData) => data.append('entryId', entryId)],
    [
      'file entry ID',
      (data: FormData) => data.set('entryId', new File(['id'], 'entry.txt')),
    ],
    ['missing operation', (data: FormData) => data.delete('ratingOperation')],
    [
      'unknown operation',
      (data: FormData) => data.set('ratingOperation', 'clear'),
    ],
    [
      'repeated operation',
      (data: FormData) => data.append('ratingOperation', 'save'),
    ],
    [
      'file operation',
      (data: FormData) =>
        data.set('ratingOperation', new File(['save'], 'operation.txt')),
    ],
    [
      'missing expected rating',
      (data: FormData) => data.delete('expectedRating'),
    ],
    [
      'malformed expected rating',
      (data: FormData) => data.set('expectedRating', '7.50'),
    ],
    [
      'repeated expected rating',
      (data: FormData) => data.append('expectedRating', ratingNoneSentinel),
    ],
    [
      'file expected rating',
      (data: FormData) =>
        data.set('expectedRating', new File(['7.5'], 'rating.txt')),
    ],
    [
      'remove with absent expected rating',
      (data: FormData) => {
        data.set('ratingOperation', 'remove')
        data.set('requestedRating', ratingNoneSentinel)
      },
    ],
    [
      'remove with a present requested rating',
      (data: FormData) => {
        data.set('ratingOperation', 'remove')
        data.set('expectedRating', '7.5')
      },
    ],
  ])('collapses malformed target or operation correlation %s', (_, alter) => {
    const data = form()
    alter(data)
    expect(parseUpdateAnimeEntryRatingFormData(data)).toEqual({
      kind: 'unavailable',
    })
  })

  it('prioritizes malformed target integrity over a malformed save value', () => {
    const data = form()
    data.set('entryId', 'not-a-uuid')
    data.set('requestedRating', '7.50')
    expect(parseUpdateAnimeEntryRatingFormData(data)).toEqual({
      kind: 'unavailable',
    })
  })
})

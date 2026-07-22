import { describe, expect, it } from 'vitest'
import {
  entryDateNoneSentinel,
  parseUpdateAnimeEntryDateRangeFormData,
} from '@/features/archive/domain/update-anime-entry-date-range'

const entryId = '11111111-1111-4111-8111-111111111111'

function form(): FormData {
  const data = new FormData()
  data.set('entryId', entryId)
  data.set('expectedStartDate', entryDateNoneSentinel)
  data.set('expectedFinishDate', entryDateNoneSentinel)
  data.set('requestedStartDate', '')
  data.set('requestedFinishDate', '')
  return data
}

describe('date range command parser', () => {
  it.each([
    ['both absent', '', '', null, null],
    ['start only', '2024-01-01', '', '2024-01-01', null],
    ['finish only', '', '2024-01-01', null, '2024-01-01'],
    ['same day', '2024-02-29', '2024-02-29', '2024-02-29', '2024-02-29'],
    ['later finish', '2024-12-31', '2025-01-01', '2024-12-31', '2025-01-01'],
  ])(
    'maps deliberate blank form syntax for %s',
    (_, requestedStartDate, requestedFinishDate, startDate, finishDate) => {
      const data = form()
      data.set('requestedStartDate', requestedStartDate)
      data.set('requestedFinishDate', requestedFinishDate)
      expect(parseUpdateAnimeEntryDateRangeFormData(data)).toEqual({
        kind: 'valid',
        input: {
          entryId,
          expectedStartDate: null,
          expectedFinishDate: null,
          requestedStartDate: startDate,
          requestedFinishDate: finishDate,
        },
      })
    },
  )

  it('parses canonical expected state separately from requested state', () => {
    const data = form()
    data.set('expectedStartDate', '2024-01-01')
    data.set('expectedFinishDate', '2024-01-02')
    data.set('requestedStartDate', '2024-02-29')
    data.set('requestedFinishDate', '2024-03-01')
    expect(parseUpdateAnimeEntryDateRangeFormData(data)).toEqual({
      kind: 'valid',
      input: {
        entryId,
        expectedStartDate: '2024-01-01',
        expectedFinishDate: '2024-01-02',
        requestedStartDate: '2024-02-29',
        requestedFinishDate: '2024-03-01',
      },
    })
  })

  it.each([
    ['impossible requested date', 'requestedStartDate', '2023-02-29'],
    ['timestamp requested date', 'requestedStartDate', '2024-01-01T00:00:00Z'],
    ['whitespace requested date', 'requestedStartDate', ' 2024-01-01'],
    ['non-padded requested date', 'requestedStartDate', '2024-1-01'],
    ['infinite requested date', 'requestedStartDate', 'infinity'],
  ])('reports %s as inline validation', (_, field, value) => {
    const data = form()
    data.set(field, value)
    expect(parseUpdateAnimeEntryDateRangeFormData(data)).toEqual({
      kind: 'invalid_dates',
    })
  })

  it('reports a reversed requested range as inline validation', () => {
    const data = form()
    data.set('requestedStartDate', '2024-01-02')
    data.set('requestedFinishDate', '2024-01-01')
    expect(parseUpdateAnimeEntryDateRangeFormData(data)).toEqual({
      kind: 'invalid_dates',
    })
  })

  it.each([
    ['extra field', (data: FormData) => data.set('userId', 'forged')],
    ['missing entry ID', (data: FormData) => data.delete('entryId')],
    ['invalid entry ID', (data: FormData) => data.set('entryId', 'not-a-uuid')],
    ['duplicate entry ID', (data: FormData) => data.append('entryId', entryId)],
    [
      'File entry ID',
      (data: FormData) => data.set('entryId', new File(['id'], 'id.txt')),
    ],
    [
      'missing expected date',
      (data: FormData) => data.delete('expectedStartDate'),
    ],
    [
      'duplicate expected date',
      (data: FormData) =>
        data.append('expectedStartDate', entryDateNoneSentinel),
    ],
    [
      'File expected date',
      (data: FormData) =>
        data.set('expectedStartDate', new File(['x'], 'date.txt')),
    ],
    [
      'timestamp expected date',
      (data: FormData) => data.set('expectedStartDate', '2024-01-01T00:00:00Z'),
    ],
    [
      'reversed expected range',
      (data: FormData) => {
        data.set('expectedStartDate', '2024-01-02')
        data.set('expectedFinishDate', '2024-01-01')
      },
    ],
    [
      'missing requested field',
      (data: FormData) => data.delete('requestedStartDate'),
    ],
    [
      'duplicate requested field',
      (data: FormData) => data.append('requestedStartDate', ''),
    ],
    [
      'File requested field',
      (data: FormData) =>
        data.set('requestedStartDate', new File(['x'], 'date.txt')),
    ],
  ])(
    'collapses malformed target, expected state, or request structure for %s',
    (_, alter) => {
      const data = form()
      alter(data)
      expect(parseUpdateAnimeEntryDateRangeFormData(data)).toEqual({
        kind: 'unavailable',
      })
    },
  )
})

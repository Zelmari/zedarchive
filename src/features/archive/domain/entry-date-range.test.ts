import { describe, expect, it } from 'vitest'
import {
  calendarDateSchema,
  entryDateRangeSchema,
} from '@/features/archive/domain/entry-date-range'

describe('calendarDateSchema', () => {
  it.each(['2000-01-01', '2024-02-29', '2026-07-16', '2099-12-31'])(
    'accepts the canonical calendar date %s without transformation',
    (date) => {
      expect(calendarDateSchema.parse(date)).toBe(date)
    },
  )

  it.each([
    ['impossible leap day', '2023-02-29'],
    ['invalid month', '2024-13-01'],
    ['invalid day', '2024-01-32'],
    ['non-zero-padded month', '2024-2-09'],
    ['non-zero-padded day', '2024-02-9'],
    ['timestamp', '2024-01-01T00:00:00Z'],
    ['locale-formatted date', '16/07/2026'],
    ['leading whitespace', ' 2024-01-01'],
    ['trailing whitespace', '2024-01-01 '],
    ['empty string', ''],
    ['Date object', new Date('2024-01-01T00:00:00Z')],
    ['undefined', undefined],
    ['null', null],
    ['number', 20240101],
  ])('rejects an %s', (_, date) => {
    expect(calendarDateSchema.safeParse(date).success).toBe(false)
  })
})

describe('entryDateRangeSchema', () => {
  it.each([
    {},
    { startDate: '2024-01-01' },
    { finishDate: '2024-01-02' },
    { startDate: '2024-01-01', finishDate: '2024-01-02' },
    { startDate: undefined },
    { finishDate: undefined },
  ])('accepts the optional date range %#', (dateRange) => {
    expect(entryDateRangeSchema.safeParse(dateRange).success).toBe(true)
  })

  it.each([
    ['later finish date', '2024-01-01', '2024-01-02'],
    ['same-day finish date', '2024-01-01', '2024-01-01'],
    ['month boundary', '2024-01-31', '2024-02-01'],
    ['year boundary', '2024-12-31', '2025-01-01'],
    ['leap-day range', '2024-02-29', '2024-03-01'],
  ])('accepts a %s', (_, startDate, finishDate) => {
    expect(
      entryDateRangeSchema.safeParse({ startDate, finishDate }).success,
    ).toBe(true)
  })

  it.each([
    ['one day', '2024-01-02', '2024-01-01'],
    ['a month boundary', '2024-02-01', '2024-01-31'],
    ['a year boundary', '2025-01-01', '2024-12-31'],
    ['a leap-day boundary', '2024-03-01', '2024-02-29'],
  ])(
    'rejects a finish date before the start date across %s',
    (_, startDate, finishDate) => {
      expect(
        entryDateRangeSchema.safeParse({ startDate, finishDate }).success,
      ).toBe(false)
    },
  )

  it('associates a date-ordering issue with the finish date', () => {
    const result = entryDateRangeSchema.safeParse({
      startDate: '2024-01-02',
      finishDate: '2024-01-01',
    })

    expect(result.success).toBe(false)

    if (result.success) {
      throw new Error('Expected the invalid date range to be rejected')
    }

    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['finishDate'] }),
      ]),
    )
  })

  it.each([
    { startDate: '' },
    { finishDate: '' },
    { startDate: null },
    { finishDate: null },
  ])('rejects a noncanonical optional date value %#', (dateRange) => {
    expect(entryDateRangeSchema.safeParse(dateRange).success).toBe(false)
  })
})

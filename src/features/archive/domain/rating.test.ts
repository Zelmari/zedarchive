import { describe, expect, it } from 'vitest'
import {
  ratingIncrement,
  ratingMaximum,
  ratingMinimum,
  ratingSchema,
} from '@/features/archive/domain/rating'

const validRatings = Array.from({ length: 91 }, (_, index) => (index + 10) / 10)

describe('ratingSchema', () => {
  it('uses the confirmed rating boundaries and increment', () => {
    expect(ratingMinimum).toBe(1)
    expect(ratingMaximum).toBe(10)
    expect(ratingIncrement).toBe(0.1)
  })

  it.each(validRatings)('accepts the valid rating %s', (rating) => {
    expect(ratingSchema.safeParse(rating).success).toBe(true)
  })

  it.each([1, 1.1, 5, 7.5, 9.9, 10])(
    'returns the valid rating %s without transformation',
    (rating) => {
      expect(ratingSchema.parse(rating)).toBe(rating)
    },
  )

  it.each([0.9, 0, -1, 10.1, 11])(
    'rejects the out-of-range rating %s',
    (rating) => {
      expect(ratingSchema.safeParse(rating).success).toBe(false)
    },
  )

  it.each([1.01, 1.05, 7.55, 9.99])(
    'rejects the rating %s with unsupported precision',
    (rating) => {
      expect(ratingSchema.safeParse(rating).success).toBe(false)
    },
  )

  it.each([NaN, Infinity, -Infinity])(
    'rejects the non-finite number %s',
    (rating) => {
      expect(ratingSchema.safeParse(rating).success).toBe(false)
    },
  )

  it.each([
    ['numeric string', '1'],
    ['decimal string', '7.5'],
    ['formatted maximum string', '10.0'],
    ['empty string', ''],
    ['undefined', undefined],
    ['null', null],
    ['boolean', true],
    ['array', [7.5]],
    ['object', { rating: 7.5 }],
  ])('rejects a %s value', (_, rating) => {
    expect(ratingSchema.safeParse(rating).success).toBe(false)
  })
})

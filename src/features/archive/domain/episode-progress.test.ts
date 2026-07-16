import { describe, expect, it } from 'vitest'
import {
  episodeProgressMinimum,
  episodeProgressSchema,
} from '@/features/archive/domain/episode-progress'

describe('episodeProgressSchema', () => {
  it('uses zero as the confirmed minimum', () => {
    expect(episodeProgressMinimum).toBe(0)
  })

  it.each([0, 1, 12, 24, 100, Number.MAX_SAFE_INTEGER])(
    'accepts the non-negative safe integer %s without transformation',
    (progress) => {
      expect(episodeProgressSchema.parse(progress)).toBe(progress)
    },
  )

  it.each([
    -1,
    -100,
    Number.MIN_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER + 1,
    Number.MIN_SAFE_INTEGER - 1,
  ])('rejects the out-of-range integer %s', (progress) => {
    expect(episodeProgressSchema.safeParse(progress).success).toBe(false)
  })

  it.each([0.1, 0.5, 1.5, 12.25])(
    'rejects the fractional progress %s',
    (progress) => {
      expect(episodeProgressSchema.safeParse(progress).success).toBe(false)
    },
  )

  it.each([NaN, Infinity, -Infinity])(
    'rejects the non-finite number %s',
    (progress) => {
      expect(episodeProgressSchema.safeParse(progress).success).toBe(false)
    },
  )

  it.each([
    ['zero string', '0'],
    ['numeric string', '12'],
    ['empty string', ''],
    ['undefined', undefined],
    ['null', null],
    ['boolean', true],
    ['array', [12]],
    ['object', { progress: 12 }],
  ])('rejects a %s value', (_, progress) => {
    expect(episodeProgressSchema.safeParse(progress).success).toBe(false)
  })
})

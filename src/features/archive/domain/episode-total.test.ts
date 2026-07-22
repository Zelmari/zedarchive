import { describe, expect, it } from 'vitest'
import {
  episodeTotalSchema,
  getEffectiveEpisodeTotal,
} from '@/features/archive/domain/episode-total'
import { episodeProgressMaximum } from '@/features/archive/domain/episode-progress'
describe('episode total', () => {
  it.each([1, 12, episodeProgressMaximum])(
    'accepts positive safe totals',
    (value) => expect(episodeTotalSchema.parse(value)).toBe(value),
  )
  it.each([0, -1, 1.5, Infinity, episodeProgressMaximum + 1])(
    'rejects invalid total %s',
    (value) => expect(episodeTotalSchema.safeParse(value).success).toBe(false),
  )
  it('prefers a personal total', () =>
    expect(getEffectiveEpisodeTotal(12, 13)).toBe(13))
})

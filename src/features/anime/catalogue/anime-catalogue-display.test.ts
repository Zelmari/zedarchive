import { describe, expect, it } from 'vitest'
import {
  formatAnimeEpisodeTotal,
  formatAnimeReleaseStatus,
  formatAnimeReleaseYear,
} from '@/features/anime/catalogue/anime-catalogue-display'
import { animeReleaseStatusValues } from '@/features/anime/domain/anime-catalogue-item'

describe('formatAnimeReleaseYear', () => {
  it('returns the year as text when it is known', () => {
    expect(formatAnimeReleaseYear(1998)).toBe('1998')
  })

  it('returns Year unknown when the year is missing', () => {
    expect(formatAnimeReleaseYear(null)).toBe('Year unknown')
  })
})

describe('formatAnimeEpisodeTotal', () => {
  it('returns null when the episode total is missing', () => {
    expect(formatAnimeEpisodeTotal(null)).toBeNull()
  })

  it('uses singular wording for one episode', () => {
    expect(formatAnimeEpisodeTotal(1)).toBe('1 episode')
  })

  it('uses plural wording for multiple episodes', () => {
    expect(formatAnimeEpisodeTotal(26)).toBe('26 episodes')
  })
})

describe('formatAnimeReleaseStatus', () => {
  it.each([
    ['upcoming', 'Upcoming'],
    ['airing', 'Airing'],
    ['finished', 'Finished'],
    ['unknown', 'Status unknown'],
  ] as const)('maps %s to %s', (status, label) => {
    expect(formatAnimeReleaseStatus(status)).toBe(label)
  })

  it('covers every release status value', () => {
    for (const status of animeReleaseStatusValues) {
      expect(formatAnimeReleaseStatus(status)).toBeTypeOf('string')
      expect(formatAnimeReleaseStatus(status).length).toBeGreaterThan(0)
    }
  })
})

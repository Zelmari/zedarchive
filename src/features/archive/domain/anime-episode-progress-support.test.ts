import { describe, expect, it } from 'vitest'
import { getAnimeEpisodeProgressSupport } from '@/features/archive/domain/anime-episode-progress-support'
describe('anime episode progress support', () => {
  it.each(['tv', 'ova', 'ona', 'special'])('tracks %s', (format) =>
    expect(getAnimeEpisodeProgressSupport(format)).toBe('trackable'),
  )
  it('classifies movies and unknown format', () => {
    expect(getAnimeEpisodeProgressSupport('movie')).toBe('not_applicable')
    expect(getAnimeEpisodeProgressSupport('unknown')).toBe('format_unknown')
  })
})

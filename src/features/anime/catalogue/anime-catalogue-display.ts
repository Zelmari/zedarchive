import type { AnimeReleaseStatus } from '@/features/anime/domain/anime-catalogue-item'

const animeReleaseStatusLabels = {
  upcoming: 'Upcoming',
  airing: 'Airing',
  finished: 'Finished',
  unknown: 'Status unknown',
} satisfies Record<AnimeReleaseStatus, string>

export function formatAnimeReleaseYear(year: number | null): string {
  if (year === null) {
    return 'Year unknown'
  }

  return String(year)
}

export function formatAnimeEpisodeTotal(count: number | null): string | null {
  if (count === null) {
    return null
  }

  if (count === 1) {
    return '1 episode'
  }

  return `${count} episodes`
}

export function formatAnimeReleaseStatus(status: AnimeReleaseStatus): string {
  return animeReleaseStatusLabels[status]
}

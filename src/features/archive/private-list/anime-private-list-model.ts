import type { AnimeReleaseStatus } from '@/features/anime/domain/anime-catalogue-item'
import type { EntryStatus } from '@/features/archive/domain/entry-status'
import type { EpisodeProgress } from '@/features/archive/domain/episode-progress'
import type { EpisodeTotal } from '@/features/archive/domain/episode-total'
import type { Rating } from '@/features/archive/domain/rating'

export const ANIME_PRIVATE_LIST_PAGE_SIZE = 24 as const
export const ANIME_PRIVATE_LIST_MAX_PAGE = 10_000 as const

export type AnimeEpisodeProgressState =
  | {
      kind: 'trackable'
      progress: EpisodeProgress
      catalogueTotal: EpisodeTotal | null
      personalTotal: EpisodeTotal | null
    }
  | { kind: 'not_applicable' }
  | { kind: 'format_unknown' }

export type AnimePrivateListVisibleEntry = {
  kind: 'displayable' | 'unavailable_in_catalogue'
  entryId: string
  title: string
  releaseYear: number | null
  episodeCount: number | null
  releaseStatus: AnimeReleaseStatus
  archiveStatus: EntryStatus
  rating: Rating | null
  progressState: AnimeEpisodeProgressState
}

export type AnimePrivateListRestrictedEntry = {
  kind: 'restricted'
  archiveStatus: EntryStatus
}

export type AnimePrivateListEntry =
  AnimePrivateListVisibleEntry | AnimePrivateListRestrictedEntry

export type AnimePrivateListPagination = {
  page: number
  pageSize: typeof ANIME_PRIVATE_LIST_PAGE_SIZE
  totalItems: number
  totalPages: number
  hasPreviousPage: boolean
  hasNextPage: boolean
}

export type AnimePrivateListPage = {
  entries: AnimePrivateListEntry[]
  pagination: AnimePrivateListPagination
}

export function buildAnimePrivateListPagination(
  page: number,
  totalItems: number,
): AnimePrivateListPagination {
  const totalPages =
    totalItems === 0 ? 0 : Math.ceil(totalItems / ANIME_PRIVATE_LIST_PAGE_SIZE)

  return {
    page,
    pageSize: ANIME_PRIVATE_LIST_PAGE_SIZE,
    totalItems,
    totalPages,
    hasPreviousPage: page > 1 && totalPages > 0,
    hasNextPage: page < totalPages,
  }
}

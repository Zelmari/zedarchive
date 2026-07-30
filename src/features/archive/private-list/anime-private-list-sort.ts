import { z } from '@/config/zod'

export const animePrivateListSorts = [
  'alphabetical',
  'recently-updated',
  'recently-added',
  'highest-rated',
] as const

export type AnimePrivateListSort = (typeof animePrivateListSorts)[number]

export const animePrivateListSortSchema = z.enum(animePrivateListSorts)

export const defaultAnimePrivateListSort = 'alphabetical' as const

export const animePrivateListSortLabels: Readonly<
  Record<AnimePrivateListSort, string>
> = {
  alphabetical: 'Alphabetical',
  'recently-updated': 'Recently updated',
  'recently-added': 'Recently added',
  'highest-rated': 'Highest rated',
}

export const ANIME_PRIVATE_LIST_SORT_STORAGE_KEY =
  'zedarchive:archive-sort:v1:anime'

export function isAnimePrivateListSort(
  value: unknown,
): value is AnimePrivateListSort {
  return animePrivateListSortSchema.safeParse(value).success
}

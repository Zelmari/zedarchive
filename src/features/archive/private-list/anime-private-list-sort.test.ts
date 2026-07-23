import { describe, expect, it } from 'vitest'
import {
  ANIME_PRIVATE_LIST_SORT_STORAGE_KEY,
  animePrivateListSortLabels,
  animePrivateListSortSchema,
  animePrivateListSorts,
  defaultAnimePrivateListSort,
  isAnimePrivateListSort,
} from '@/features/archive/private-list/anime-private-list-sort'

describe('anime private-list sort vocabulary', () => {
  it('defines the shared exact sort values, labels, default, and storage key', () => {
    expect(animePrivateListSorts).toEqual([
      'alphabetical',
      'recently-updated',
      'recently-added',
      'highest-rated',
    ])
    expect(animePrivateListSortLabels).toEqual({
      alphabetical: 'Alphabetical',
      'recently-updated': 'Recently updated',
      'recently-added': 'Recently added',
      'highest-rated': 'Highest rated',
    })
    expect(defaultAnimePrivateListSort).toBe('alphabetical')
    expect(ANIME_PRIVATE_LIST_SORT_STORAGE_KEY).toBe(
      'zedarchive:archive-sort:v1:anime',
    )
  })

  it.each([
    'alphabetical',
    'recently-updated',
    'recently-added',
    'highest-rated',
  ])('accepts the exact %s value', (sort) => {
    expect(animePrivateListSortSchema.parse(sort)).toBe(sort)
    expect(isAnimePrivateListSort(sort)).toBe(true)
  })

  it.each([
    undefined,
    null,
    '',
    ' alphabetical',
    'alphabetical ',
    'ALPHABETICAL',
    'recently_updated',
    'rating',
    1,
    { sort: 'alphabetical' },
  ])('rejects unsupported sort value %j', (sort) => {
    expect(animePrivateListSortSchema.safeParse(sort).success).toBe(false)
    expect(isAnimePrivateListSort(sort)).toBe(false)
  })
})

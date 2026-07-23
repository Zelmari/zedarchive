import {
  ANIME_PRIVATE_LIST_MAX_PAGE,
  ANIME_PRIVATE_LIST_PAGE_SIZE,
} from '@/features/archive/private-list/anime-private-list-model'
import {
  defaultAnimePrivateListSort,
  isAnimePrivateListSort,
  type AnimePrivateListSort,
} from '@/features/archive/private-list/anime-private-list-sort'

export const ANIME_PRIVATE_LIST_INVALID_PAGE_MESSAGE =
  'Page must be a whole number from 1 to 10000'

export const ANIME_PRIVATE_LIST_REPEATED_PAGE_MESSAGE =
  'Page must be provided only once'

export const ANIME_PRIVATE_LIST_INVALID_SORT_MESSAGE =
  'Sort must be alphabetical, recently-updated, recently-added, or highest-rated'

export const ANIME_PRIVATE_LIST_REPEATED_SORT_MESSAGE =
  'Sort must be provided only once'

export type AnimePrivateListPageQueryInput = Readonly<
  Record<string, string | string[] | undefined>
>

export type AnimePrivateListPageQuery =
  | {
      kind: 'valid'
      page: number
      pageSize: typeof ANIME_PRIVATE_LIST_PAGE_SIZE
      sort: AnimePrivateListSort
      isSortExplicit: boolean
    }
  | {
      kind: 'validation-error'
      message: string
    }

const PAGE_NUMBER_PATTERN = /^(?:[1-9]\d{0,3}|10000)$/

type SingleQueryParameter =
  { kind: 'absent' } | { kind: 'value'; value: string } | { kind: 'repeated' }

function getSingleQueryParameter(
  value: string | string[] | undefined,
): SingleQueryParameter {
  if (value === undefined || (Array.isArray(value) && value.length === 0)) {
    return { kind: 'absent' }
  }

  if (Array.isArray(value)) {
    return value.length === 1
      ? { kind: 'value', value: value[0]! }
      : { kind: 'repeated' }
  }

  return { kind: 'value', value }
}

export function parseAnimePrivateListPageQuery(
  input: AnimePrivateListPageQueryInput,
): AnimePrivateListPageQuery {
  const pageParameter = getSingleQueryParameter(input.page)
  const sortParameter = getSingleQueryParameter(input.sort)

  if (pageParameter.kind === 'repeated') {
    return {
      kind: 'validation-error',
      message: ANIME_PRIVATE_LIST_REPEATED_PAGE_MESSAGE,
    }
  }

  if (
    pageParameter.kind === 'value' &&
    !PAGE_NUMBER_PATTERN.test(pageParameter.value)
  ) {
    return {
      kind: 'validation-error',
      message: ANIME_PRIVATE_LIST_INVALID_PAGE_MESSAGE,
    }
  }

  if (sortParameter.kind === 'repeated') {
    return {
      kind: 'validation-error',
      message: ANIME_PRIVATE_LIST_REPEATED_SORT_MESSAGE,
    }
  }

  const page = pageParameter.kind === 'value' ? Number(pageParameter.value) : 1
  let sort: AnimePrivateListSort = defaultAnimePrivateListSort

  if (sortParameter.kind === 'value') {
    const sortValue = sortParameter.value
    if (!isAnimePrivateListSort(sortValue)) {
      return {
        kind: 'validation-error',
        message: ANIME_PRIVATE_LIST_INVALID_SORT_MESSAGE,
      }
    }
    sort = sortValue
  }

  return {
    kind: 'valid',
    page,
    pageSize: ANIME_PRIVATE_LIST_PAGE_SIZE,
    sort,
    isSortExplicit: sortParameter.kind === 'value',
  }
}

export function buildAnimePrivateListPageHref({
  page,
  sort,
}: {
  page: number
  sort: AnimePrivateListSort
}): string {
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > ANIME_PRIVATE_LIST_MAX_PAGE
  ) {
    throw new RangeError(ANIME_PRIVATE_LIST_INVALID_PAGE_MESSAGE)
  }

  if (!isAnimePrivateListSort(sort)) {
    throw new RangeError(ANIME_PRIVATE_LIST_INVALID_SORT_MESSAGE)
  }

  const searchParameters = new URLSearchParams({ sort })
  if (page !== 1) {
    searchParameters.set('page', String(page))
  }

  return `/archive/anime?${searchParameters.toString()}`
}

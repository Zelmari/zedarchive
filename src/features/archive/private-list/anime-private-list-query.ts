import {
  ANIME_PRIVATE_LIST_MAX_PAGE,
  ANIME_PRIVATE_LIST_PAGE_SIZE,
} from '@/features/archive/private-list/anime-private-list-model'

export const ANIME_PRIVATE_LIST_INVALID_PAGE_MESSAGE =
  'Page must be a whole number from 1 to 10000'

export const ANIME_PRIVATE_LIST_REPEATED_PAGE_MESSAGE =
  'Page must be provided only once'

export type AnimePrivateListPageQueryInput = Readonly<
  Record<string, string | string[] | undefined>
>

export type AnimePrivateListPageQuery =
  | {
      kind: 'valid'
      page: number
      pageSize: typeof ANIME_PRIVATE_LIST_PAGE_SIZE
    }
  | {
      kind: 'validation-error'
      message: string
    }

const PAGE_NUMBER_PATTERN = /^(?:[1-9]\d{0,3}|10000)$/

export function parseAnimePrivateListPageQuery(
  input: AnimePrivateListPageQueryInput,
): AnimePrivateListPageQuery {
  const rawPage = input.page

  if (
    rawPage === undefined ||
    (Array.isArray(rawPage) && rawPage.length === 0)
  ) {
    return {
      kind: 'valid',
      page: 1,
      pageSize: ANIME_PRIVATE_LIST_PAGE_SIZE,
    }
  }

  if (Array.isArray(rawPage)) {
    if (rawPage.length > 1) {
      return {
        kind: 'validation-error',
        message: ANIME_PRIVATE_LIST_REPEATED_PAGE_MESSAGE,
      }
    }

    return parseAnimePrivateListPageQuery({ page: rawPage[0] })
  }

  if (!PAGE_NUMBER_PATTERN.test(rawPage)) {
    return {
      kind: 'validation-error',
      message: ANIME_PRIVATE_LIST_INVALID_PAGE_MESSAGE,
    }
  }

  return {
    kind: 'valid',
    page: Number(rawPage),
    pageSize: ANIME_PRIVATE_LIST_PAGE_SIZE,
  }
}

export function buildAnimePrivateListPageHref(page: number): string {
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > ANIME_PRIVATE_LIST_MAX_PAGE
  ) {
    throw new RangeError(ANIME_PRIVATE_LIST_INVALID_PAGE_MESSAGE)
  }

  return page === 1 ? '/archive/anime' : `/archive/anime?page=${page}`
}

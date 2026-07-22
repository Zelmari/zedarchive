import { describe, expect, it } from 'vitest'
import {
  ANIME_PRIVATE_LIST_INVALID_PAGE_MESSAGE,
  ANIME_PRIVATE_LIST_REPEATED_PAGE_MESSAGE,
  buildAnimePrivateListPageHref,
  parseAnimePrivateListPageQuery,
  type AnimePrivateListPageQueryInput,
} from '@/features/archive/private-list/anime-private-list-query'

describe('parseAnimePrivateListPageQuery', () => {
  it.each<[AnimePrivateListPageQueryInput, number]>([
    [{}, 1],
    [{ unrelated: 'ignored' }, 1],
    [{ page: [] }, 1],
    [{ page: '1' }, 1],
    [{ page: ['24'] }, 24],
    [{ page: '10000' }, 10000],
  ])('parses %j as page %i', (input, page) => {
    expect(parseAnimePrivateListPageQuery(input)).toEqual({
      kind: 'valid',
      page,
      pageSize: 24,
    })
  })

  it.each([
    '',
    '0',
    '-1',
    '+1',
    ' 1',
    '1 ',
    '1.0',
    '1.5',
    '01',
    '1e2',
    '10001',
    '999999999999999999999',
    'anime',
  ])('rejects malformed page %j', (page) => {
    expect(parseAnimePrivateListPageQuery({ page })).toEqual({
      kind: 'validation-error',
      message: ANIME_PRIVATE_LIST_INVALID_PAGE_MESSAGE,
    })
  })

  it('rejects repeated page parameters even when their values agree', () => {
    expect(parseAnimePrivateListPageQuery({ page: ['2', '2'] })).toEqual({
      kind: 'validation-error',
      message: ANIME_PRIVATE_LIST_REPEATED_PAGE_MESSAGE,
    })
  })

  it('ignores owner-like parameters', () => {
    expect(
      parseAnimePrivateListPageQuery({
        page: '2',
        userId: 'forged-owner',
        owner: 'another-owner',
      }),
    ).toEqual({ kind: 'valid', page: 2, pageSize: 24 })
  })
})

describe('buildAnimePrivateListPageHref', () => {
  it('omits the default page and builds later page links', () => {
    expect(buildAnimePrivateListPageHref(1)).toBe('/archive/anime')
    expect(buildAnimePrivateListPageHref(2)).toBe('/archive/anime?page=2')
    expect(buildAnimePrivateListPageHref(10000)).toBe(
      '/archive/anime?page=10000',
    )
  })

  it.each([0, -1, 1.5, 10001, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid page %s',
    (page) => {
      expect(() => buildAnimePrivateListPageHref(page)).toThrow(
        ANIME_PRIVATE_LIST_INVALID_PAGE_MESSAGE,
      )
    },
  )
})

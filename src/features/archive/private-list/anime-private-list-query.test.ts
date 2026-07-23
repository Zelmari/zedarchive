import { describe, expect, it } from 'vitest'
import {
  ANIME_PRIVATE_LIST_INVALID_PAGE_MESSAGE,
  ANIME_PRIVATE_LIST_INVALID_SORT_MESSAGE,
  ANIME_PRIVATE_LIST_REPEATED_PAGE_MESSAGE,
  ANIME_PRIVATE_LIST_REPEATED_SORT_MESSAGE,
  buildAnimePrivateListPageHref,
  parseAnimePrivateListPageQuery,
  type AnimePrivateListPageQueryInput,
} from '@/features/archive/private-list/anime-private-list-query'

describe('parseAnimePrivateListPageQuery', () => {
  it.each<[AnimePrivateListPageQueryInput, number, boolean]>([
    [{}, 1, false],
    [{ unrelated: 'ignored' }, 1, false],
    [{ page: [], sort: [] }, 1, false],
    [{ page: '1' }, 1, false],
    [{ page: ['24'] }, 24, false],
    [{ page: '10000', sort: ['highest-rated'] }, 10000, true],
  ])('parses %j as page %i', (input, page, isSortExplicit) => {
    expect(parseAnimePrivateListPageQuery(input)).toEqual({
      kind: 'valid',
      page,
      pageSize: 24,
      sort: isSortExplicit ? 'highest-rated' : 'alphabetical',
      isSortExplicit,
    })
  })

  it.each([
    'alphabetical',
    'recently-updated',
    'recently-added',
    'highest-rated',
  ] as const)('accepts explicit %s sort', (sort) => {
    expect(parseAnimePrivateListPageQuery({ page: '2', sort })).toEqual({
      kind: 'valid',
      page: 2,
      pageSize: 24,
      sort,
      isSortExplicit: true,
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
  ])('rejects malformed page %j before sort', (page) => {
    expect(
      parseAnimePrivateListPageQuery({ page, sort: 'not-a-sort' }),
    ).toEqual({
      kind: 'validation-error',
      message: ANIME_PRIVATE_LIST_INVALID_PAGE_MESSAGE,
    })
  })

  it.each([
    '',
    ' alphabetical',
    'alphabetical ',
    'ALPHABETICAL',
    'recently_updated',
    'rating',
    '1',
    '{"sort":"alphabetical"}',
  ])('rejects malformed sort %j', (sort) => {
    expect(parseAnimePrivateListPageQuery({ sort })).toEqual({
      kind: 'validation-error',
      message: ANIME_PRIVATE_LIST_INVALID_SORT_MESSAGE,
    })
  })

  it('rejects repeated parameters even when values agree', () => {
    expect(parseAnimePrivateListPageQuery({ page: ['2', '2'] })).toEqual({
      kind: 'validation-error',
      message: ANIME_PRIVATE_LIST_REPEATED_PAGE_MESSAGE,
    })
    expect(
      parseAnimePrivateListPageQuery({
        sort: ['alphabetical', 'alphabetical'],
      }),
    ).toEqual({
      kind: 'validation-error',
      message: ANIME_PRIVATE_LIST_REPEATED_SORT_MESSAGE,
    })
  })

  it('preserves singleton sibling values instead of recursively discarding them', () => {
    expect(
      parseAnimePrivateListPageQuery({
        page: ['2'],
        sort: ['recently-updated'],
      }),
    ).toEqual({
      kind: 'valid',
      page: 2,
      pageSize: 24,
      sort: 'recently-updated',
      isSortExplicit: true,
    })
    expect(
      parseAnimePrivateListPageQuery({ page: ['2'], sort: 'not-a-sort' }),
    ).toEqual({
      kind: 'validation-error',
      message: ANIME_PRIVATE_LIST_INVALID_SORT_MESSAGE,
    })
    expect(
      parseAnimePrivateListPageQuery({
        page: 'not-a-page',
        sort: ['alphabetical', 'highest-rated'],
      }),
    ).toEqual({
      kind: 'validation-error',
      message: ANIME_PRIVATE_LIST_INVALID_PAGE_MESSAGE,
    })
  })

  it('ignores owner-like parameters', () => {
    expect(
      parseAnimePrivateListPageQuery({
        page: '2',
        sort: 'alphabetical',
        userId: 'forged-owner',
        owner: 'another-owner',
      }),
    ).toEqual({
      kind: 'valid',
      page: 2,
      pageSize: 24,
      sort: 'alphabetical',
      isSortExplicit: true,
    })
  })
})

describe('buildAnimePrivateListPageHref', () => {
  it('always includes an explicit sort and omits only the default page', () => {
    expect(
      buildAnimePrivateListPageHref({ page: 1, sort: 'alphabetical' }),
    ).toBe('/archive/anime?sort=alphabetical')
    expect(
      buildAnimePrivateListPageHref({ page: 1, sort: 'highest-rated' }),
    ).toBe('/archive/anime?sort=highest-rated')
    expect(
      buildAnimePrivateListPageHref({ page: 2, sort: 'highest-rated' }),
    ).toBe('/archive/anime?sort=highest-rated&page=2')
  })

  it.each([0, -1, 1.5, 10001, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid page %s',
    (page) => {
      expect(() =>
        buildAnimePrivateListPageHref({ page, sort: 'alphabetical' }),
      ).toThrow(ANIME_PRIVATE_LIST_INVALID_PAGE_MESSAGE)
    },
  )

  it('rejects a forged sort value', () => {
    expect(() =>
      buildAnimePrivateListPageHref({
        page: 1,
        sort: 'forged' as 'alphabetical',
      }),
    ).toThrow(ANIME_PRIVATE_LIST_INVALID_SORT_MESSAGE)
  })
})

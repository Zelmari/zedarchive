import { describe, expect, it } from 'vitest'
import {
  ANIME_CATALOGUE_INVALID_PAGE_MESSAGE,
  ANIME_CATALOGUE_PAGE_SIZE,
  ANIME_CATALOGUE_QUERY_TOO_LONG_MESSAGE,
  ANIME_CATALOGUE_REPEATED_PAGE_MESSAGE,
  ANIME_CATALOGUE_REPEATED_QUERY_MESSAGE,
  buildAnimeCataloguePageHref,
  normalizeAnimeCatalogueSearchQuery,
  parseAnimeCataloguePageQuery,
} from '@/features/anime/catalogue/anime-catalogue-page-query'

describe('normalizeAnimeCatalogueSearchQuery', () => {
  it.each([
    ['leading and trailing whitespace', '  piece  ', 'piece'],
    ['internal whitespace collapse', 'one   piece', 'one piece'],
    ['mixed Unicode whitespace', '\u00A0one\u2003piece\u202F', 'one piece'],
    ['empty string', '', ''],
    ['whitespace only', '   ', ''],
    ['whitespace that collapses to blank', '\u00A0\u2003', ''],
  ])('normalizes %s', (_, input, expected) => {
    expect(normalizeAnimeCatalogueSearchQuery(input)).toBe(expected)
  })
})

describe('parseAnimeCataloguePageQuery', () => {
  it('returns browse defaults when q and page are absent', () => {
    expect(parseAnimeCataloguePageQuery({})).toEqual({
      kind: 'browse',
      page: 1,
      pageSize: ANIME_CATALOGUE_PAGE_SIZE,
    })
  })

  it('returns browse with an explicit valid page', () => {
    expect(parseAnimeCataloguePageQuery({ page: '2' })).toEqual({
      kind: 'browse',
      page: 2,
      pageSize: ANIME_CATALOGUE_PAGE_SIZE,
    })
  })

  it.each([
    ['absent q', {}],
    ['empty q', { q: '' }],
    ['whitespace-only q', { q: '   ' }],
    ['whitespace-only q after normalization', { q: '\u00A0\u2003' }],
  ])('treats %s as browse mode', (_, input) => {
    expect(parseAnimeCataloguePageQuery(input)).toEqual({
      kind: 'browse',
      page: 1,
      pageSize: ANIME_CATALOGUE_PAGE_SIZE,
    })
  })

  it('detects search mode after normalization', () => {
    expect(parseAnimeCataloguePageQuery({ q: '  one   piece  ' })).toEqual({
      kind: 'search',
      query: 'one piece',
      page: 1,
      pageSize: ANIME_CATALOGUE_PAGE_SIZE,
    })
  })

  it('accepts search with pagination', () => {
    expect(parseAnimeCataloguePageQuery({ q: 'piece', page: '3' })).toEqual({
      kind: 'search',
      query: 'piece',
      page: 3,
      pageSize: ANIME_CATALOGUE_PAGE_SIZE,
    })
  })

  it('accepts a single-element q array', () => {
    expect(parseAnimeCataloguePageQuery({ q: ['piece'] })).toEqual({
      kind: 'search',
      query: 'piece',
      page: 1,
      pageSize: ANIME_CATALOGUE_PAGE_SIZE,
    })
  })

  it('accepts a single-element page array', () => {
    expect(parseAnimeCataloguePageQuery({ page: ['4'] })).toEqual({
      kind: 'browse',
      page: 4,
      pageSize: ANIME_CATALOGUE_PAGE_SIZE,
    })
  })

  it('accepts boundary page values', () => {
    expect(parseAnimeCataloguePageQuery({ page: '1' })).toEqual({
      kind: 'browse',
      page: 1,
      pageSize: ANIME_CATALOGUE_PAGE_SIZE,
    })

    expect(parseAnimeCataloguePageQuery({ page: '10000' })).toEqual({
      kind: 'browse',
      page: 10_000,
      pageSize: ANIME_CATALOGUE_PAGE_SIZE,
    })
  })

  it('accepts a maximum-length normalized query', () => {
    const query = 'a'.repeat(200)

    expect(parseAnimeCataloguePageQuery({ q: query })).toEqual({
      kind: 'search',
      query,
      page: 1,
      pageSize: ANIME_CATALOGUE_PAGE_SIZE,
    })
  })

  it('ignores unknown parameters including pageSize', () => {
    expect(
      parseAnimeCataloguePageQuery({
        q: 'piece',
        page: '2',
        pageSize: '48',
        utm_source: 'newsletter',
      }),
    ).toEqual({
      kind: 'search',
      query: 'piece',
      page: 2,
      pageSize: ANIME_CATALOGUE_PAGE_SIZE,
    })
  })

  it('returns a repeated page validation error', () => {
    expect(parseAnimeCataloguePageQuery({ page: ['1', '2'] })).toEqual({
      kind: 'validation-error',
      field: 'page',
      message: ANIME_CATALOGUE_REPEATED_PAGE_MESSAGE,
      queryInput: '',
    })
  })

  it('preserves a valid normalized query on repeated page errors', () => {
    expect(
      parseAnimeCataloguePageQuery({ q: '  piece  ', page: ['1', '2'] }),
    ).toEqual({
      kind: 'validation-error',
      field: 'page',
      message: ANIME_CATALOGUE_REPEATED_PAGE_MESSAGE,
      queryInput: 'piece',
    })
  })

  it('returns a repeated query validation error', () => {
    expect(parseAnimeCataloguePageQuery({ q: ['piece', 'beacon'] })).toEqual({
      kind: 'validation-error',
      field: 'query',
      message: ANIME_CATALOGUE_REPEATED_QUERY_MESSAGE,
      queryInput: 'piece',
    })
  })

  it('normalizes the first repeated query value for queryInput', () => {
    expect(
      parseAnimeCataloguePageQuery({ q: ['  one   piece  ', 'beacon'] }),
    ).toEqual({
      kind: 'validation-error',
      field: 'query',
      message: ANIME_CATALOGUE_REPEATED_QUERY_MESSAGE,
      queryInput: 'one piece',
    })
  })

  it('prefers repeated page errors over repeated query errors', () => {
    expect(
      parseAnimeCataloguePageQuery({
        q: ['piece', 'beacon'],
        page: ['1', '2'],
      }),
    ).toEqual({
      kind: 'validation-error',
      field: 'page',
      message: ANIME_CATALOGUE_REPEATED_PAGE_MESSAGE,
      queryInput: 'piece',
    })
  })

  it('returns an overlong query validation error with query metadata', () => {
    const query = 'a'.repeat(201)

    expect(parseAnimeCataloguePageQuery({ q: query })).toEqual({
      kind: 'validation-error',
      field: 'query',
      message: ANIME_CATALOGUE_QUERY_TOO_LONG_MESSAGE,
      queryInput: query,
    })
  })

  it('counts overlong queries after normalization', () => {
    const query = `  ${'a'.repeat(201)}  `

    expect(parseAnimeCataloguePageQuery({ q: query })).toEqual({
      kind: 'validation-error',
      field: 'query',
      message: ANIME_CATALOGUE_QUERY_TOO_LONG_MESSAGE,
      queryInput: 'a'.repeat(201),
    })
  })

  it('prefers overlong query errors over invalid page errors', () => {
    const query = 'a'.repeat(201)

    expect(parseAnimeCataloguePageQuery({ q: query, page: '0' })).toEqual({
      kind: 'validation-error',
      field: 'query',
      message: ANIME_CATALOGUE_QUERY_TOO_LONG_MESSAGE,
      queryInput: query,
    })
  })

  it.each([
    ['zero', '0'],
    ['negative', '-1'],
    ['fractional', '1.5'],
    ['above maximum', '10001'],
    ['leading zero', '01'],
    ['plus sign', '+2'],
    ['scientific notation', '2e3'],
    ['empty string', ''],
    ['whitespace', ' 2 '],
    ['non-numeric', 'two'],
    ['NaN text', 'NaN'],
  ])('rejects invalid page value %s', (_, page) => {
    expect(parseAnimeCataloguePageQuery({ page })).toEqual({
      kind: 'validation-error',
      field: 'page',
      message: ANIME_CATALOGUE_INVALID_PAGE_MESSAGE,
      queryInput: '',
    })
  })

  it('preserves a valid normalized query on invalid page errors', () => {
    expect(parseAnimeCataloguePageQuery({ q: '  piece  ', page: '0' })).toEqual(
      {
        kind: 'validation-error',
        field: 'page',
        message: ANIME_CATALOGUE_INVALID_PAGE_MESSAGE,
        queryInput: 'piece',
      },
    )
  })

  it('keeps queryInput as plain text without HTML encoding', () => {
    const query = '<script>alert("xss")</script>'

    expect(parseAnimeCataloguePageQuery({ q: query })).toEqual({
      kind: 'search',
      query,
      page: 1,
      pageSize: ANIME_CATALOGUE_PAGE_SIZE,
    })

    const invalidPageResult = parseAnimeCataloguePageQuery({
      q: query,
      page: '0',
    })

    expect(invalidPageResult).toMatchObject({ kind: 'validation-error' })

    if (invalidPageResult.kind !== 'validation-error') {
      throw new Error('Expected an invalid page validation result')
    }

    expect(invalidPageResult.queryInput).toBe(query)
  })
})

describe('buildAnimeCataloguePageHref', () => {
  it('returns the browse base path by default', () => {
    expect(buildAnimeCataloguePageHref({})).toBe('/')
  })

  it('omits page=1 from browse links', () => {
    expect(buildAnimeCataloguePageHref({ page: 1 })).toBe('/')
  })

  it('includes page only when greater than 1 for browse pagination', () => {
    expect(buildAnimeCataloguePageHref({ page: 2 })).toBe('/?page=2')
  })

  it('includes normalized non-blank query text only', () => {
    expect(buildAnimeCataloguePageHref({ query: '  one   piece  ' })).toBe(
      '/?q=one+piece',
    )
  })

  it('omits blank query text', () => {
    expect(buildAnimeCataloguePageHref({ query: '' })).toBe('/')
  })

  it('omits page=1 from search links', () => {
    expect(buildAnimeCataloguePageHref({ query: 'piece', page: 1 })).toBe(
      '/?q=piece',
    )
  })

  it('preserves normalized query text in search pagination links', () => {
    expect(buildAnimeCataloguePageHref({ query: 'one piece', page: 2 })).toBe(
      '/?q=one+piece&page=2',
    )
  })

  it('URL-encodes query values', () => {
    expect(buildAnimeCataloguePageHref({ query: 'a&b=c' })).toBe(
      '/?q=a%26b%3Dc',
    )
  })

  it('supports browse-clear links for active search', () => {
    expect(buildAnimeCataloguePageHref({ query: 'piece' })).toBe('/?q=piece')
    expect(buildAnimeCataloguePageHref({})).toBe('/')
  })
})

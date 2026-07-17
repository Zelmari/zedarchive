import { describe, expect, it } from 'vitest'
import {
  animeCatalogueBrowseRequestSchema,
  animeCataloguePageSchema,
  animeCataloguePaginationSchema,
  animeCatalogueSearchRequestSchema,
} from '@/features/anime/catalogue/anime-catalogue-query'

function createCompleteAnimeCatalogueItem() {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    titles: {
      english: 'Cowboy Bebop',
      romaji: 'Cowboy Bebop',
      original: 'カウボーイビバップ',
      alternatives: ['COWBOY BEBOP'],
    },
    format: 'tv' as const,
    releaseStatus: 'finished' as const,
    releaseYear: 1998,
    episodeCount: 26,
    maturity: 'safe' as const,
  }
}

function createCompletePagination() {
  return {
    page: 1,
    pageSize: 24,
    totalItems: 5,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  }
}

describe('animeCatalogueBrowseRequestSchema', () => {
  it('applies default page and pageSize when fields are omitted', () => {
    expect(animeCatalogueBrowseRequestSchema.parse({})).toEqual({
      page: 1,
      pageSize: 24,
    })
  })

  it.each([
    ['minimum page', { page: 1, pageSize: 24 }],
    ['maximum page', { page: 10_000, pageSize: 48 }],
    ['minimum pageSize', { page: 1, pageSize: 1 }],
    ['maximum pageSize', { page: 1, pageSize: 48 }],
  ])('accepts %s values', (_, request) => {
    expect(animeCatalogueBrowseRequestSchema.parse(request)).toEqual(request)
  })

  it.each([
    ['page below minimum', { page: 0 }],
    ['page above maximum', { page: 10_001 }],
    ['pageSize below minimum', { pageSize: 0 }],
    ['pageSize above maximum', { pageSize: 49 }],
    ['fractional page', { page: 1.5 }],
    ['fractional pageSize', { pageSize: 24.5 }],
    ['negative page', { page: -1 }],
    ['negative pageSize', { pageSize: -1 }],
    ['NaN page', { page: Number.NaN }],
    ['NaN pageSize', { pageSize: Number.NaN }],
    ['infinite page', { page: Number.POSITIVE_INFINITY }],
    ['infinite pageSize', { pageSize: Number.POSITIVE_INFINITY }],
  ])('rejects %s', (_, request) => {
    expect(animeCatalogueBrowseRequestSchema.safeParse(request).success).toBe(
      false,
    )
  })

  it('rejects unknown fields', () => {
    expect(
      animeCatalogueBrowseRequestSchema.safeParse({
        page: 1,
        pageSize: 24,
        includeAdult: true,
      }).success,
    ).toBe(false)
  })
})

describe('animeCatalogueSearchRequestSchema', () => {
  it('applies default page and pageSize when only query is provided', () => {
    expect(
      animeCatalogueSearchRequestSchema.parse({
        query: 'piece',
      }),
    ).toEqual({
      query: 'piece',
      page: 1,
      pageSize: 24,
    })
  })

  it.each([
    ['leading and trailing whitespace', '  piece  ', 'piece'],
    ['internal whitespace collapse', 'one   piece', 'one piece'],
    ['mixed Unicode whitespace', '\u00A0one\u2003piece\u202F', 'one piece'],
    ['minimum length query', 'a', 'a'],
    ['maximum length query', 'a'.repeat(200), 'a'.repeat(200)],
  ])('normalizes %s', (_, query, expected) => {
    expect(
      animeCatalogueSearchRequestSchema.parse({
        query,
      }).query,
    ).toBe(expected)
  })

  it.each([
    ['blank string', ''],
    ['whitespace only', '   '],
    ['whitespace that collapses to blank', '\u00A0\u2003'],
    ['query above maximum length', 'a'.repeat(201)],
  ])('rejects %s', (_, query) => {
    expect(
      animeCatalogueSearchRequestSchema.safeParse({
        query,
      }).success,
    ).toBe(false)
  })

  it('rejects a missing query', () => {
    expect(animeCatalogueSearchRequestSchema.safeParse({}).success).toBe(false)
  })

  it('rejects unknown fields', () => {
    expect(
      animeCatalogueSearchRequestSchema.safeParse({
        query: 'piece',
        sort: 'title',
      }).success,
    ).toBe(false)
  })

  it.each([
    ['page below minimum', { query: 'piece', page: 0 }],
    ['page above maximum', { query: 'piece', page: 10_001 }],
    ['pageSize below minimum', { query: 'piece', pageSize: 0 }],
    ['pageSize above maximum', { query: 'piece', pageSize: 49 }],
    ['fractional page', { query: 'piece', page: 1.5 }],
    ['fractional pageSize', { query: 'piece', pageSize: 24.5 }],
    ['NaN page', { query: 'piece', page: Number.NaN }],
    [
      'infinite pageSize',
      { query: 'piece', pageSize: Number.POSITIVE_INFINITY },
    ],
  ])('rejects %s', (_, request) => {
    expect(animeCatalogueSearchRequestSchema.safeParse(request).success).toBe(
      false,
    )
  })
})

describe('animeCataloguePaginationSchema', () => {
  it('accepts valid pagination metadata', () => {
    expect(
      animeCataloguePaginationSchema.parse(createCompletePagination()),
    ).toEqual(createCompletePagination())
  })

  it('accepts zero-result pagination metadata', () => {
    expect(
      animeCataloguePaginationSchema.parse({
        page: 1,
        pageSize: 24,
        totalItems: 0,
        totalPages: 0,
        hasPreviousPage: false,
        hasNextPage: false,
      }),
    ).toEqual({
      page: 1,
      pageSize: 24,
      totalItems: 0,
      totalPages: 0,
      hasPreviousPage: false,
      hasNextPage: false,
    })
  })

  it.each([
    ['page below minimum', { page: 0 }],
    ['page above maximum', { page: 10_001 }],
    ['pageSize below minimum', { pageSize: 0 }],
    ['pageSize above maximum', { pageSize: 49 }],
    ['negative totalItems', { totalItems: -1 }],
    ['negative totalPages', { totalPages: -1 }],
    ['fractional totalItems', { totalItems: 1.5 }],
    ['fractional totalPages', { totalPages: 1.5 }],
    ['non-boolean hasPreviousPage', { hasPreviousPage: 'false' }],
    ['non-boolean hasNextPage', { hasNextPage: 1 }],
  ])('rejects %s', (_, pagination) => {
    expect(
      animeCataloguePaginationSchema.safeParse({
        ...createCompletePagination(),
        ...pagination,
      }).success,
    ).toBe(false)
  })

  it('rejects unknown fields', () => {
    expect(
      animeCataloguePaginationSchema.safeParse({
        ...createCompletePagination(),
        offset: 0,
      }).success,
    ).toBe(false)
  })

  it.each([
    ['total pages', { totalPages: 2 }],
    ['previous-page flag', { hasPreviousPage: true }],
    ['next-page flag', { hasNextPage: true }],
  ])('rejects inconsistent %s metadata', (_, inconsistentField) => {
    expect(
      animeCataloguePaginationSchema.safeParse({
        ...createCompletePagination(),
        ...inconsistentField,
      }).success,
    ).toBe(false)
  })
})

describe('animeCataloguePageSchema', () => {
  it('accepts a valid page of catalogue items', () => {
    expect(
      animeCataloguePageSchema.parse({
        items: [createCompleteAnimeCatalogueItem()],
        pagination: createCompletePagination(),
      }),
    ).toEqual({
      items: [createCompleteAnimeCatalogueItem()],
      pagination: createCompletePagination(),
    })
  })

  it('rejects malformed catalogue items', () => {
    expect(
      animeCataloguePageSchema.safeParse({
        items: [
          {
            ...createCompleteAnimeCatalogueItem(),
            id: 'not-a-uuid',
          },
        ],
        pagination: createCompletePagination(),
      }).success,
    ).toBe(false)
  })

  it('rejects malformed pagination metadata', () => {
    expect(
      animeCataloguePageSchema.safeParse({
        items: [createCompleteAnimeCatalogueItem()],
        pagination: {
          ...createCompletePagination(),
          totalItems: -1,
        },
      }).success,
    ).toBe(false)
  })

  it('rejects unknown fields', () => {
    expect(
      animeCataloguePageSchema.safeParse({
        items: [createCompleteAnimeCatalogueItem()],
        pagination: createCompletePagination(),
        query: 'piece',
      }).success,
    ).toBe(false)
  })
})

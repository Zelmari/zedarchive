export const ANIME_CATALOGUE_PAGE_SIZE = 24 as const

export const ANIME_CATALOGUE_INVALID_PAGE_MESSAGE =
  'Page must be a whole number from 1 to 10000'

export const ANIME_CATALOGUE_QUERY_TOO_LONG_MESSAGE =
  'Search must be 200 characters or fewer'

export const ANIME_CATALOGUE_REPEATED_PAGE_MESSAGE =
  'Page must be provided only once'

export const ANIME_CATALOGUE_REPEATED_QUERY_MESSAGE =
  'Search must be provided only once'

export type AnimeCataloguePageQueryInput = Readonly<
  Record<string, string | string[] | undefined>
>

export type AnimeCataloguePageQueryValidationError = {
  kind: 'validation-error'
  message: string
  field: 'query' | 'page'
  queryInput: string
}

export type AnimeCatalogueBrowsePageQuery = {
  kind: 'browse'
  page: number
  pageSize: typeof ANIME_CATALOGUE_PAGE_SIZE
}

export type AnimeCatalogueSearchPageQuery = {
  kind: 'search'
  query: string
  page: number
  pageSize: typeof ANIME_CATALOGUE_PAGE_SIZE
}

export type AnimeCataloguePageQueryResult =
  | AnimeCataloguePageQueryValidationError
  | AnimeCatalogueBrowsePageQuery
  | AnimeCatalogueSearchPageQuery

const PAGE_NUMBER_PATTERN = /^(?:[1-9]\d{0,3}|10000)$/

type ScalarParamResult =
  { kind: 'absent' } | { kind: 'value'; value: string } | { kind: 'repeated' }

function getScalarParam(
  input: AnimeCataloguePageQueryInput,
  key: string,
): ScalarParamResult {
  const raw = input[key]

  if (raw === undefined) {
    return { kind: 'absent' }
  }

  if (Array.isArray(raw)) {
    if (raw.length === 0) {
      return { kind: 'absent' }
    }

    if (raw.length > 1) {
      return { kind: 'repeated' }
    }

    return { kind: 'value', value: raw[0]! }
  }

  return { kind: 'value', value: raw }
}

export function normalizeAnimeCatalogueSearchQuery(value: string): string {
  return value.trim().replace(/\s+/gu, ' ')
}

function parsePageNumberText(value: string): number | null {
  if (!PAGE_NUMBER_PATTERN.test(value)) {
    return null
  }

  return Number(value)
}

function createValidationError(
  field: AnimeCataloguePageQueryValidationError['field'],
  message: string,
  queryInput: string,
): AnimeCataloguePageQueryValidationError {
  return {
    kind: 'validation-error',
    field,
    message,
    queryInput,
  }
}

export function parseAnimeCataloguePageQuery(
  input: AnimeCataloguePageQueryInput,
): AnimeCataloguePageQueryResult {
  const pageParam = getScalarParam(input, 'page')
  const queryParam = getScalarParam(input, 'q')

  if (pageParam.kind === 'repeated') {
    let queryInput = ''

    if (queryParam.kind === 'value') {
      queryInput = normalizeAnimeCatalogueSearchQuery(queryParam.value)
    } else if (queryParam.kind === 'repeated') {
      const rawValues = input.q
      const firstValue = Array.isArray(rawValues) ? (rawValues[0] ?? '') : ''
      queryInput = normalizeAnimeCatalogueSearchQuery(firstValue)
    }

    return createValidationError(
      'page',
      ANIME_CATALOGUE_REPEATED_PAGE_MESSAGE,
      queryInput,
    )
  }

  if (queryParam.kind === 'repeated') {
    const rawValues = input.q
    const firstValue = Array.isArray(rawValues) ? (rawValues[0] ?? '') : ''
    const queryInput = normalizeAnimeCatalogueSearchQuery(firstValue)

    return createValidationError(
      'query',
      ANIME_CATALOGUE_REPEATED_QUERY_MESSAGE,
      queryInput,
    )
  }

  const normalizedQuery =
    queryParam.kind === 'value'
      ? normalizeAnimeCatalogueSearchQuery(queryParam.value)
      : ''

  if (normalizedQuery.length > 200) {
    return createValidationError(
      'query',
      ANIME_CATALOGUE_QUERY_TOO_LONG_MESSAGE,
      normalizedQuery,
    )
  }

  let page = 1

  if (pageParam.kind === 'value') {
    const parsedPage = parsePageNumberText(pageParam.value)

    if (parsedPage === null) {
      return createValidationError(
        'page',
        ANIME_CATALOGUE_INVALID_PAGE_MESSAGE,
        normalizedQuery,
      )
    }

    page = parsedPage
  }

  if (normalizedQuery.length === 0) {
    return {
      kind: 'browse',
      page,
      pageSize: ANIME_CATALOGUE_PAGE_SIZE,
    }
  }

  return {
    kind: 'search',
    query: normalizedQuery,
    page,
    pageSize: ANIME_CATALOGUE_PAGE_SIZE,
  }
}

export function buildAnimeCataloguePageHref(options: {
  query?: string
  page?: number
}): string {
  const params = new URLSearchParams()
  const normalizedQuery =
    options.query === undefined
      ? ''
      : normalizeAnimeCatalogueSearchQuery(options.query)

  if (normalizedQuery.length > 0) {
    params.set('q', normalizedQuery)
  }

  if (options.page !== undefined && options.page > 1) {
    params.set('page', String(options.page))
  }

  const search = params.toString()

  return search.length === 0 ? '/' : `/?${search}`
}

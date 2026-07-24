import {
  and,
  asc,
  count,
  eq,
  exists,
  inArray,
  or,
  type SQL,
  sql,
} from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { z } from 'zod'
import {
  animeCatalogueBrowseRequestSchema,
  animeCataloguePageItemSchema,
  animeCataloguePageSchema,
  animeCatalogueSearchRequestSchema,
  type AnimeCataloguePage,
  type AnimeCataloguePagination,
} from '@/features/anime/catalogue/anime-catalogue-query'
import { getPreferredAnimeTitle } from '@/features/anime/catalogue/anime-title-fallback'
import { animeCatalogueItemSchema } from '@/features/anime/domain/anime-catalogue-item'
import type { EntryStatus } from '@/features/archive/domain/entry-status'
import {
  defaultUserCataloguePreferences,
  type AnimeTitleLanguage,
} from '@/features/settings/domain/catalogue-preferences'
import {
  animeAlternativeTitles,
  animeCatalogueItems,
  animeEntries,
} from '@/server/database/schema'
import { buildPreferredAnimeTitleExpression } from '@/server/database/anime-catalogue-title-expression'
import { buildPublishedAnimeCatalogueVisibility } from '@/server/database/anime-catalogue-visibility'
import { readUserCataloguePreferences } from '@/server/database/user-catalogue-preferences-service'

type StoredCatalogueItem = typeof animeCatalogueItems.$inferSelect

export class StoredAnimeCatalogueTitleIntegrityError extends Error {
  constructor() {
    super(
      'Stored anime catalogue title failed application-domain integrity checks',
    )
    this.name = 'StoredAnimeCatalogueTitleIntegrityError'
  }
}

export class StoredAnimeCatalogueVisibilityError extends Error {
  constructor() {
    super('Stored anime catalogue item failed public visibility checks')
    this.name = 'StoredAnimeCatalogueVisibilityError'
  }
}

function escapeIlikeLiteral(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

function toContainsPattern(normalizedQuery: string): string {
  return `%${escapeIlikeLiteral(normalizedQuery)}%`
}

function toPrefixPattern(normalizedQuery: string): string {
  return `${escapeIlikeLiteral(normalizedQuery)}%`
}

function primaryTitleExactMatch(
  column:
    | typeof animeCatalogueItems.englishTitle
    | typeof animeCatalogueItems.romajiTitle
    | typeof animeCatalogueItems.originalTitle,
  normalizedQuery: string,
): SQL {
  return sql`${column} is not null and lower(${column}) = lower(${normalizedQuery})`
}

function primaryTitleIlikeMatch(
  column:
    | typeof animeCatalogueItems.englishTitle
    | typeof animeCatalogueItems.romajiTitle
    | typeof animeCatalogueItems.originalTitle,
  pattern: string,
): SQL {
  return sql`${column} is not null and ${column} ilike ${pattern} escape '\\'`
}

function alternativeTitleExists(condition: SQL): SQL {
  return exists(
    sql`(
      select 1
      from ${animeAlternativeTitles}
      where ${animeAlternativeTitles.catalogueItemId} = ${animeCatalogueItems.id}
        and ${condition}
    )`,
  )
}

function buildTitleMatchCondition(
  normalizedQuery: string,
  matchKind: 'exact' | 'prefix' | 'contains',
): SQL {
  const pattern =
    matchKind === 'contains'
      ? toContainsPattern(normalizedQuery)
      : toPrefixPattern(normalizedQuery)

  const primaryMatches =
    matchKind === 'exact'
      ? or(
          primaryTitleExactMatch(
            animeCatalogueItems.englishTitle,
            normalizedQuery,
          ),
          primaryTitleExactMatch(
            animeCatalogueItems.romajiTitle,
            normalizedQuery,
          ),
          primaryTitleExactMatch(
            animeCatalogueItems.originalTitle,
            normalizedQuery,
          ),
        )
      : or(
          primaryTitleIlikeMatch(animeCatalogueItems.englishTitle, pattern),
          primaryTitleIlikeMatch(animeCatalogueItems.romajiTitle, pattern),
          primaryTitleIlikeMatch(animeCatalogueItems.originalTitle, pattern),
        )

  const alternativeMatch =
    matchKind === 'exact'
      ? alternativeTitleExists(
          sql`lower(${animeAlternativeTitles.title}) = lower(${normalizedQuery})`,
        )
      : alternativeTitleExists(
          sql`${animeAlternativeTitles.title} ilike ${pattern} escape '\\'`,
        )

  return or(primaryMatches, alternativeMatch)!
}

function buildSearchRankExpression(normalizedQuery: string): SQL {
  return sql`case
    when ${buildTitleMatchCondition(normalizedQuery, 'exact')} then 1
    when ${buildTitleMatchCondition(normalizedQuery, 'prefix')} then 2
    when ${buildTitleMatchCondition(normalizedQuery, 'contains')} then 3
  end`
}

function assertTrimmedStoredTitle(value: string | null): void {
  if (value !== null && value !== value.trim()) {
    throw new StoredAnimeCatalogueTitleIntegrityError()
  }
}

function mapStoredItemToDomain(
  item: StoredCatalogueItem,
  alternatives: readonly string[],
  options: {
    titleLanguage: AnimeTitleLanguage
    canViewAdult: boolean
  },
) {
  if (
    item.catalogueState !== 'published' ||
    (item.maturity === 'adult' && !options.canViewAdult)
  ) {
    throw new StoredAnimeCatalogueVisibilityError()
  }

  assertTrimmedStoredTitle(item.englishTitle)
  assertTrimmedStoredTitle(item.romajiTitle)
  assertTrimmedStoredTitle(item.originalTitle)

  for (const alternative of alternatives) {
    assertTrimmedStoredTitle(alternative)
  }

  const domainItem = animeCatalogueItemSchema.parse({
    id: item.id,
    titles: {
      english: item.englishTitle,
      romaji: item.romajiTitle,
      original: item.originalTitle,
      alternatives: [...alternatives],
    },
    format: item.format,
    releaseStatus: item.releaseStatus,
    releaseYear: item.releaseYear,
    episodeCount: item.episodeCount,
    maturity: item.maturity,
  })

  return animeCataloguePageItemSchema.parse({
    ...domainItem,
    displayTitle: getPreferredAnimeTitle(
      domainItem.titles,
      options.titleLanguage,
    ),
  })
}

function buildPagination(
  page: number,
  pageSize: number,
  totalItems: number,
): AnimeCataloguePagination {
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize)

  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    hasPreviousPage: page > 1 && totalPages > 0,
    hasNextPage: page < totalPages,
  }
}

async function readPublicAnimeCataloguePage(
  database: NodePgDatabase,
  options: {
    page: number
    pageSize: number
    normalizedQuery?: string
    userId: string | null
  },
): Promise<AnimeCatalogueViewerPage> {
  const { page, pageSize, normalizedQuery, userId } = options
  const offset = (page - 1) * pageSize

  return database.transaction(
    async (transaction) => {
      const preferences =
        userId === null
          ? defaultUserCataloguePreferences
          : await readUserCataloguePreferences(transaction, { userId })
      const visibility = buildPublishedAnimeCatalogueVisibility(
        preferences.adultContentEnabled,
      )
      const whereClause =
        normalizedQuery === undefined
          ? visibility
          : and(
              visibility,
              buildTitleMatchCondition(normalizedQuery, 'contains'),
            )
      const preferredTitleExpression = buildPreferredAnimeTitleExpression(
        preferences.titleLanguage,
      )
      const preferredTitleLowerExpression = sql`lower(${preferredTitleExpression})`

      const [countRow] = await transaction
        .select({ totalItems: count() })
        .from(animeCatalogueItems)
        .where(whereClause)

      const totalItems = Number(countRow?.totalItems ?? 0)

      const parentQuery = transaction
        .select()
        .from(animeCatalogueItems)
        .where(whereClause)
        .limit(pageSize)
        .offset(offset)

      const orderedParents =
        normalizedQuery === undefined
          ? await parentQuery.orderBy(
              asc(preferredTitleLowerExpression),
              asc(preferredTitleExpression),
              asc(animeCatalogueItems.id),
            )
          : await parentQuery.orderBy(
              asc(buildSearchRankExpression(normalizedQuery)),
              asc(preferredTitleLowerExpression),
              asc(preferredTitleExpression),
              asc(animeCatalogueItems.id),
            )

      if (orderedParents.length === 0) {
        return {
          cataloguePage: animeCataloguePageSchema.parse({
            items: [],
            pagination: buildPagination(page, pageSize, totalItems),
          }),
          memberships: userId === null ? null : [],
        }
      }

      const itemIds = orderedParents.map(({ id }) => id)
      const alternativeRows = await transaction
        .select({
          catalogueItemId: animeAlternativeTitles.catalogueItemId,
          title: animeAlternativeTitles.title,
        })
        .from(animeAlternativeTitles)
        .where(inArray(animeAlternativeTitles.catalogueItemId, itemIds))
        .orderBy(
          asc(animeAlternativeTitles.catalogueItemId),
          asc(animeAlternativeTitles.position),
        )

      const alternativesByItemId = new Map<string, string[]>()

      for (const alternative of alternativeRows) {
        const itemAlternatives =
          alternativesByItemId.get(alternative.catalogueItemId) ?? []
        itemAlternatives.push(alternative.title)
        alternativesByItemId.set(alternative.catalogueItemId, itemAlternatives)
      }

      const items = orderedParents.map((item) =>
        mapStoredItemToDomain(item, alternativesByItemId.get(item.id) ?? [], {
          titleLanguage: preferences.titleLanguage,
          canViewAdult: preferences.adultContentEnabled,
        }),
      )

      const memberships =
        userId === null
          ? null
          : await transaction
              .select({
                catalogueItemId: animeEntries.catalogueItemId,
                status: animeEntries.status,
              })
              .from(animeEntries)
              .where(
                and(
                  eq(animeEntries.userId, userId),
                  inArray(animeEntries.catalogueItemId, itemIds),
                ),
              )

      return {
        cataloguePage: animeCataloguePageSchema.parse({
          items,
          pagination: buildPagination(page, pageSize, totalItems),
        }),
        memberships,
      }
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  )
}

export type AnimeCatalogueViewerMembership = {
  catalogueItemId: string
  status: EntryStatus
}

export type AnimeCatalogueViewerPage = {
  cataloguePage: AnimeCataloguePage
  memberships: AnimeCatalogueViewerMembership[] | null
}

export type ReadAnimeCatalogueForViewerRequest =
  | {
      kind: 'browse'
      userId: string | null
      page: number
      pageSize: number
    }
  | {
      kind: 'search'
      userId: string | null
      query: string
      page: number
      pageSize: number
    }

export async function readAnimeCatalogueForViewer(
  database: NodePgDatabase,
  request: ReadAnimeCatalogueForViewerRequest,
): Promise<AnimeCatalogueViewerPage> {
  const userId =
    request.userId === null ? null : z.uuidv4().parse(request.userId)

  if (request.kind === 'browse') {
    const { page, pageSize } = animeCatalogueBrowseRequestSchema.parse({
      page: request.page,
      pageSize: request.pageSize,
    })

    return readPublicAnimeCataloguePage(database, {
      page,
      pageSize,
      userId,
    })
  }

  const { page, pageSize, query } = animeCatalogueSearchRequestSchema.parse({
    query: request.query,
    page: request.page,
    pageSize: request.pageSize,
  })

  return readPublicAnimeCataloguePage(database, {
    page,
    pageSize,
    normalizedQuery: query,
    userId,
  })
}

type AnimeCatalogueBrowseRequestInput = z.input<
  typeof animeCatalogueBrowseRequestSchema
>

type AnimeCatalogueSearchRequestInput = z.input<
  typeof animeCatalogueSearchRequestSchema
>

export async function browseAnimeCatalogue(
  database: NodePgDatabase,
  request?: AnimeCatalogueBrowseRequestInput,
): Promise<AnimeCataloguePage> {
  const { page, pageSize } = animeCatalogueBrowseRequestSchema.parse(
    request ?? {},
  )

  return (
    await readPublicAnimeCataloguePage(database, {
      page,
      pageSize,
      userId: null,
    })
  ).cataloguePage
}

export async function searchAnimeCatalogue(
  database: NodePgDatabase,
  request: AnimeCatalogueSearchRequestInput,
): Promise<AnimeCataloguePage> {
  const { page, pageSize, query } =
    animeCatalogueSearchRequestSchema.parse(request)

  return (
    await readPublicAnimeCataloguePage(database, {
      page,
      pageSize,
      normalizedQuery: query,
      userId: null,
    })
  ).cataloguePage
}

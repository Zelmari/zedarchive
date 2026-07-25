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
  userCataloguePreferences,
} from '@/server/database/schema'
import { establishActiveAccount } from '@/server/database/active-account-transaction'
import { buildPreferredAnimeTitleExpression } from '@/server/database/anime-catalogue-title-expression'
import { buildPublishedAnimeCatalogueVisibility } from '@/server/database/anime-catalogue-visibility'

type StoredCatalogueItem = typeof animeCatalogueItems.$inferSelect
type StoredCatalogueDomainItem = Pick<
  StoredCatalogueItem,
  | 'id'
  | 'englishTitle'
  | 'romajiTitle'
  | 'originalTitle'
  | 'format'
  | 'releaseStatus'
  | 'releaseYear'
  | 'episodeCount'
  | 'maturity'
  | 'catalogueState'
>

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
  item: StoredCatalogueDomainItem,
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

async function readPersonalizedAnimeCataloguePage(
  database: NodePgDatabase,
  options: {
    page: number
    pageSize: number
    normalizedQuery?: string
    userId: string
  },
): Promise<AnimeCatalogueViewerPage> {
  const { page, pageSize, normalizedQuery, userId } = options
  const offset = (page - 1) * pageSize

  return database.transaction(
    async (transaction) => {
      if (!(await establishActiveAccount(transaction, userId))) {
        throw new Error('Personalized anime catalogue account is unavailable')
      }

      const preferredTitle = sql<string>`case "preference"."title_language"
        when 'romaji' then coalesce(${animeCatalogueItems.romajiTitle}, ${animeCatalogueItems.englishTitle}, ${animeCatalogueItems.originalTitle})
        when 'original' then coalesce(${animeCatalogueItems.originalTitle}, ${animeCatalogueItems.romajiTitle}, ${animeCatalogueItems.englishTitle})
        else coalesce(${animeCatalogueItems.englishTitle}, ${animeCatalogueItems.romajiTitle}, ${animeCatalogueItems.originalTitle})
      end`
      const visibility = and(
        eq(animeCatalogueItems.catalogueState, 'published'),
        sql`("preference"."adult_content_enabled"
          or ${animeCatalogueItems.maturity} <> 'adult')`,
      )!
      const whereClause =
        normalizedQuery === undefined
          ? visibility
          : and(
              visibility,
              buildTitleMatchCondition(normalizedQuery, 'contains'),
            )!
      const titleOrder = sql`lower(${preferredTitle}) asc,
        ${preferredTitle} asc,
        ${animeCatalogueItems.id} asc`
      const pageOrder =
        normalizedQuery === undefined
          ? titleOrder
          : sql`${buildSearchRankExpression(normalizedQuery)} asc, ${titleOrder}`

      const payload = await transaction.execute<{
        totalItems: number
        id: string | null
        englishTitle: string | null
        romajiTitle: string | null
        originalTitle: string | null
        format: StoredCatalogueItem['format'] | null
        releaseStatus: StoredCatalogueItem['releaseStatus'] | null
        releaseYear: number | null
        episodeCount: number | null
        maturity: StoredCatalogueItem['maturity'] | null
        catalogueState: StoredCatalogueItem['catalogueState'] | null
        titleLanguage: AnimeTitleLanguage | null
        adultContentEnabled: boolean | null
        alternatives: string[]
        membershipCatalogueItemId: string | null
        membershipStatus: EntryStatus | null
      }>(sql`
        with "preference" as materialized (
          select
            coalesce(
              (
                select ${userCataloguePreferences.titleLanguage}
                from ${userCataloguePreferences}
                where ${userCataloguePreferences.userId} = ${userId}
              ),
              'english'
            ) as "title_language",
            coalesce(
              (
                select ${userCataloguePreferences.adultContentEnabled}
                from ${userCataloguePreferences}
                where ${userCataloguePreferences.userId} = ${userId}
              ),
              false
            ) as "adult_content_enabled"
        ),
        "total" as (
          select count(*)::integer as "totalItems"
          from ${animeCatalogueItems}
          cross join "preference"
          where ${whereClause}
        ),
        "page" as (
          select
            ${animeCatalogueItems.id} as "id",
            ${animeCatalogueItems.englishTitle} as "englishTitle",
            ${animeCatalogueItems.romajiTitle} as "romajiTitle",
            ${animeCatalogueItems.originalTitle} as "originalTitle",
            ${animeCatalogueItems.format} as "format",
            ${animeCatalogueItems.releaseStatus} as "releaseStatus",
            ${animeCatalogueItems.releaseYear} as "releaseYear",
            ${animeCatalogueItems.episodeCount} as "episodeCount",
            ${animeCatalogueItems.maturity} as "maturity",
            ${animeCatalogueItems.catalogueState} as "catalogueState",
            "preference"."title_language" as "titleLanguage",
            "preference"."adult_content_enabled" as "adultContentEnabled",
            row_number() over (order by ${pageOrder}) as "rowPosition"
          from ${animeCatalogueItems}
          cross join "preference"
          where ${whereClause}
          order by ${pageOrder}
          limit ${pageSize}
          offset ${offset}
        )
        select
          "total"."totalItems",
          "page"."id",
          "page"."englishTitle",
          "page"."romajiTitle",
          "page"."originalTitle",
          "page"."format",
          "page"."releaseStatus",
          "page"."releaseYear",
          "page"."episodeCount",
          "page"."maturity",
          "page"."catalogueState",
          "page"."titleLanguage",
          "page"."adultContentEnabled",
          coalesce(
            (
              select array_agg(
                ${animeAlternativeTitles.title}
                order by ${animeAlternativeTitles.position}
              )
              from ${animeAlternativeTitles}
              where ${animeAlternativeTitles.catalogueItemId} = "page"."id"
            ),
            array[]::text[]
          ) as "alternatives",
          ${animeEntries.catalogueItemId} as "membershipCatalogueItemId",
          ${animeEntries.status} as "membershipStatus"
        from "total"
        left join "page" on true
        left join ${animeEntries}
          on ${animeEntries.userId} = ${userId}
          and ${animeEntries.catalogueItemId} = "page"."id"
        order by "page"."rowPosition" nulls last
      `)

      const rows = payload.rows
      const totalItems = Number(rows[0]?.totalItems ?? 0)
      const itemRows = rows.filter(
        (
          row,
        ): row is typeof row & {
          id: string
          format: StoredCatalogueItem['format']
          releaseStatus: StoredCatalogueItem['releaseStatus']
          maturity: StoredCatalogueItem['maturity']
          catalogueState: StoredCatalogueItem['catalogueState']
          titleLanguage: AnimeTitleLanguage
          adultContentEnabled: boolean
        } =>
          row.id !== null &&
          row.format !== null &&
          row.releaseStatus !== null &&
          row.maturity !== null &&
          row.catalogueState !== null &&
          row.titleLanguage !== null &&
          row.adultContentEnabled !== null,
      )
      const items = itemRows.map((row) =>
        mapStoredItemToDomain(row, row.alternatives, {
          titleLanguage: row.titleLanguage,
          canViewAdult: row.adultContentEnabled,
        }),
      )
      const memberships = itemRows.flatMap((row) =>
        row.membershipCatalogueItemId === null || row.membershipStatus === null
          ? []
          : [
              {
                catalogueItemId: row.membershipCatalogueItemId,
                status: row.membershipStatus,
              },
            ],
      )

      return {
        cataloguePage: animeCataloguePageSchema.parse({
          items,
          pagination: buildPagination(page, pageSize, totalItems),
        }),
        memberships,
      }
    },
    { isolationLevel: 'read committed' },
  )
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

  if (userId !== null) {
    return readPersonalizedAnimeCataloguePage(database, {
      page,
      pageSize,
      normalizedQuery,
      userId,
    })
  }

  return database.transaction(
    async (transaction) => {
      const preferences = defaultUserCataloguePreferences
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
          memberships: null,
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

      return {
        cataloguePage: animeCataloguePageSchema.parse({
          items,
          pagination: buildPagination(page, pageSize, totalItems),
        }),
        memberships: null,
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

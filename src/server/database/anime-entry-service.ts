import 'server-only'

import { and, asc, count, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { z } from 'zod'
import type { AddAnimeEntryInput } from '@/features/archive/domain/add-anime-entry'
import type { EntryStatus } from '@/features/archive/domain/entry-status'
import { getAnimeEpisodeProgressSupport } from '@/features/archive/domain/anime-episode-progress-support'
import { episodeProgressSchema } from '@/features/archive/domain/episode-progress'
import { episodeTotalSchema } from '@/features/archive/domain/episode-total'
import { ratingSchema } from '@/features/archive/domain/rating'
import { calendarDateSchema } from '@/features/archive/domain/entry-date-range'
import type { UpdateAnimeEntryStatusInput } from '@/features/archive/domain/update-anime-entry-status'
import {
  ANIME_PRIVATE_LIST_MAX_PAGE,
  ANIME_PRIVATE_LIST_PAGE_SIZE,
  buildAnimePrivateListPagination,
  type AnimePrivateListEntry,
  type AnimePrivateListPage,
} from '@/features/archive/private-list/anime-private-list-model'
import {
  animePrivateListSortSchema,
  type AnimePrivateListSort,
} from '@/features/archive/private-list/anime-private-list-sort'
import type { AnimeReleaseStatus } from '@/features/anime/domain/anime-catalogue-item'
import type { AnimeTitleLanguage } from '@/features/settings/domain/catalogue-preferences'
import { buildPreferredAnimeTitleExpression } from '@/server/database/anime-catalogue-title-expression'
import { animeCatalogueItems, animeEntries } from '@/server/database/schema'
import {
  lockAdultContentPreferenceForShare,
  readUserCataloguePreferences,
} from '@/server/database/user-catalogue-preferences-service'

export type CreateAnimeEntryRequest = AddAnimeEntryInput & {
  userId: string
}

export type CreateAnimeEntryResult =
  | { kind: 'created'; status: EntryStatus }
  | { kind: 'already_exists'; status: EntryStatus }
  | { kind: 'unavailable' }

export type UpdateAnimeEntryStatusRequest = UpdateAnimeEntryStatusInput & {
  userId: string
}

export type UpdateAnimeEntryStatusResult =
  | { kind: 'updated'; status: EntryStatus }
  | { kind: 'unchanged'; status: EntryStatus }
  | { kind: 'conflict'; currentStatus: EntryStatus }
  | { kind: 'unavailable' }

export type AnimeEntryCatalogueMembership = {
  catalogueItemId: string
  status: EntryStatus
}

const animeArchivePageRequestSchema = z.strictObject({
  userId: z.uuidv4(),
  page: z.number().int().min(1).max(ANIME_PRIVATE_LIST_MAX_PAGE),
  pageSize: z.literal(ANIME_PRIVATE_LIST_PAGE_SIZE),
  sort: animePrivateListSortSchema,
})

export type ReadAnimeArchivePageRequest = z.input<
  typeof animeArchivePageRequestSchema
>

function buildAnimeArchiveExpressions({
  canViewAdult,
  titleLanguage,
}: {
  canViewAdult: boolean
  titleLanguage: AnimeTitleLanguage
}) {
  const resolvedTitle = buildPreferredAnimeTitleExpression(titleLanguage)
  const restrictedCondition: SQL = canViewAdult
    ? sql`false`
    : sql`${animeCatalogueItems.maturity} = 'adult'`
  const restrictedOrder = sql<number>`case when ${restrictedCondition} then 1 else 0 end`
  const visibleTitleLower = sql<
    string | null
  >`case when ${restrictedCondition} then null else lower(${resolvedTitle}) end`
  const visibleTitle = sql<
    string | null
  >`case when ${restrictedCondition} then null else ${resolvedTitle} end`
  const ordinaryFavourite = sql<number | null>`case
    when ${restrictedCondition} then null
    when ${animeEntries.isFavourite} then 0
    else 1
  end`
  const visibleUpdatedAt = sql<Date | null>`case
    when ${restrictedCondition} then null
    else ${animeEntries.updatedAt}
  end`
  const visibleCreatedAt = sql<Date | null>`case
    when ${restrictedCondition} then null
    else ${animeEntries.createdAt}
  end`
  const visibleUnrated = sql<number | null>`case
    when ${restrictedCondition} then null
    when ${animeEntries.rating} is null then 1
    else 0
  end`
  const visibleRating = sql<number | null>`case
    when ${restrictedCondition} then null
    else ${animeEntries.rating}
  end`
  const availability = sql<AnimePrivateListEntry['kind']>`case
    when ${restrictedCondition} then 'restricted'
    when ${animeCatalogueItems.catalogueState} = 'published' then 'displayable'
    else 'unavailable_in_catalogue'
  end`

  return {
    availability,
    ordinaryFavourite,
    resolvedTitle,
    restrictedCondition,
    restrictedOrder,
    visibleCreatedAt,
    visibleRating,
    visibleTitle,
    visibleTitleLower,
    visibleUnrated,
    visibleUpdatedAt,
  }
}

type AnimeArchiveExpressions = ReturnType<typeof buildAnimeArchiveExpressions>

function buildAnimeArchiveOrder(
  sort: AnimePrivateListSort,
  expressions: AnimeArchiveExpressions,
) {
  const sharedOrder = [
    asc(expressions.restrictedOrder),
    asc(expressions.ordinaryFavourite),
  ] as const
  const titleOrder = [
    asc(expressions.visibleTitleLower),
    asc(expressions.visibleTitle),
    asc(animeCatalogueItems.id),
  ] as const

  switch (sort) {
    case 'alphabetical':
      return [...sharedOrder, ...titleOrder]
    case 'recently-updated':
      return [...sharedOrder, desc(expressions.visibleUpdatedAt), ...titleOrder]
    case 'recently-added':
      return [...sharedOrder, desc(expressions.visibleCreatedAt), ...titleOrder]
    case 'highest-rated':
      return [
        ...sharedOrder,
        asc(expressions.visibleUnrated),
        desc(expressions.visibleRating),
        ...titleOrder,
      ]
  }
}

function mapStoredAnimeArchiveEntry(row: {
  kind: AnimePrivateListEntry['kind']
  entryId: string | null
  title: string | null
  isAdult: boolean | null
  releaseYear: number | null
  episodeCount: number | null
  format: string | null
  episodeProgress: number | null
  episodeTotalOverride: number | null
  rating: number | null
  isFavourite: boolean | null
  startDate: string | null
  finishDate: string | null
  releaseStatus: AnimeReleaseStatus | null
  archiveStatus: EntryStatus
}): AnimePrivateListEntry {
  if (row.kind === 'restricted') {
    return { kind: 'restricted', archiveStatus: row.archiveStatus }
  }

  if (
    row.entryId === null ||
    row.title === null ||
    row.title !== row.title.trim() ||
    row.releaseStatus === null
  ) {
    throw new Error('Stored private anime archive item failed integrity checks')
  }

  const rating = ratingSchema.nullable().safeParse(row.rating)
  if (!rating.success) {
    throw new Error(
      'Stored private anime archive rating failed integrity checks',
    )
  }

  const isFavourite = z.boolean().safeParse(row.isFavourite)
  const isAdult = z.boolean().safeParse(row.isAdult)
  if (!isFavourite.success || !isAdult.success) {
    throw new Error(
      'Stored private anime archive visibility failed integrity checks',
    )
  }

  const startDate = calendarDateSchema.nullable().safeParse(row.startDate)
  const finishDate = calendarDateSchema.nullable().safeParse(row.finishDate)
  if (!startDate.success || !finishDate.success) {
    throw new Error(
      'Stored private anime archive dates failed integrity checks',
    )
  }

  return {
    kind: row.kind,
    entryId: row.entryId,
    title: row.title,
    isAdult: isAdult.data,
    releaseYear: row.releaseYear,
    episodeCount: row.episodeCount,
    releaseStatus: row.releaseStatus,
    archiveStatus: row.archiveStatus,
    rating: rating.data,
    isFavourite: isFavourite.data,
    startDate: startDate.data,
    finishDate: finishDate.data,
    progressState: (() => {
      const support = getAnimeEpisodeProgressSupport(row.format ?? 'unknown')

      if (support === 'not_applicable') {
        return { kind: 'not_applicable' }
      }

      if (support === 'format_unknown') {
        return { kind: 'format_unknown' }
      }

      if (row.episodeProgress === null) {
        throw new Error(
          'Stored private anime archive progress failed integrity checks',
        )
      }

      return {
        kind: 'trackable',
        progress: episodeProgressSchema.parse(row.episodeProgress),
        catalogueTotal: episodeTotalSchema.nullable().parse(row.episodeCount),
        personalTotal: episodeTotalSchema
          .nullable()
          .parse(row.episodeTotalOverride),
      }
    })(),
  }
}

export async function createAnimeEntry(
  database: NodePgDatabase,
  request: CreateAnimeEntryRequest,
): Promise<CreateAnimeEntryResult> {
  return database.transaction(async (transaction) => {
    const [catalogueItem] = await transaction
      .select({
        catalogueState: animeCatalogueItems.catalogueState,
        maturity: animeCatalogueItems.maturity,
      })
      .from(animeCatalogueItems)
      .where(eq(animeCatalogueItems.id, request.catalogueItemId))
      .for('share')
      .limit(1)

    if (
      catalogueItem === undefined ||
      catalogueItem.catalogueState !== 'published'
    ) {
      return { kind: 'unavailable' }
    }

    if (
      catalogueItem.maturity === 'adult' &&
      !(await lockAdultContentPreferenceForShare(transaction, request.userId))
    ) {
      return { kind: 'unavailable' }
    }

    const [createdEntry] = await transaction
      .insert(animeEntries)
      .values(request)
      .onConflictDoNothing({
        target: [animeEntries.userId, animeEntries.catalogueItemId],
      })
      .returning({ status: animeEntries.status })

    if (createdEntry) {
      return { kind: 'created', status: createdEntry.status }
    }

    const [existingEntry] = await transaction
      .select({ status: animeEntries.status })
      .from(animeEntries)
      .where(
        and(
          eq(animeEntries.userId, request.userId),
          eq(animeEntries.catalogueItemId, request.catalogueItemId),
        ),
      )
      .limit(1)

    return existingEntry
      ? { kind: 'already_exists', status: existingEntry.status }
      : { kind: 'unavailable' }
  })
}

export async function getAnimeEntryCatalogueMembership(
  database: NodePgDatabase,
  request: {
    userId: string
    catalogueItemIds: readonly string[]
  },
): Promise<AnimeEntryCatalogueMembership[]> {
  const catalogueItemIds = [...new Set(request.catalogueItemIds)]

  if (catalogueItemIds.length === 0) {
    return []
  }

  return database
    .select({
      catalogueItemId: animeEntries.catalogueItemId,
      status: animeEntries.status,
    })
    .from(animeEntries)
    .where(
      and(
        eq(animeEntries.userId, request.userId),
        inArray(animeEntries.catalogueItemId, catalogueItemIds),
      ),
    )
}

export async function updateAnimeEntryStatus(
  database: NodePgDatabase,
  request: UpdateAnimeEntryStatusRequest,
): Promise<UpdateAnimeEntryStatusResult> {
  return database.transaction(async (transaction) => {
    const [entry] = await transaction
      .select({
        id: animeEntries.id,
        catalogueItemId: animeEntries.catalogueItemId,
        status: animeEntries.status,
      })
      .from(animeEntries)
      .where(
        and(
          eq(animeEntries.id, request.entryId),
          eq(animeEntries.userId, request.userId),
        ),
      )
      .for('update')
      .limit(1)

    if (entry === undefined) {
      return { kind: 'unavailable' }
    }

    const [catalogueItem] = await transaction
      .select({ maturity: animeCatalogueItems.maturity })
      .from(animeCatalogueItems)
      .where(eq(animeCatalogueItems.id, entry.catalogueItemId))
      .for('share')
      .limit(1)

    if (catalogueItem === undefined) {
      return { kind: 'unavailable' }
    }

    if (
      catalogueItem.maturity === 'adult' &&
      !(await lockAdultContentPreferenceForShare(transaction, request.userId))
    ) {
      return { kind: 'unavailable' }
    }

    if (entry.status === request.requestedStatus) {
      return request.expectedStatus === request.requestedStatus
        ? { kind: 'unchanged', status: entry.status }
        : { kind: 'updated', status: entry.status }
    }

    if (entry.status !== request.expectedStatus) {
      return { kind: 'conflict', currentStatus: entry.status }
    }

    const [updatedEntry] = await transaction
      .update(animeEntries)
      .set({
        status: request.requestedStatus,
        updatedAt: sql`current_timestamp`,
      })
      .where(
        and(
          eq(animeEntries.id, entry.id),
          eq(animeEntries.userId, request.userId),
          eq(animeEntries.status, request.expectedStatus),
        ),
      )
      .returning({ status: animeEntries.status })

    if (updatedEntry === undefined) {
      return { kind: 'conflict', currentStatus: entry.status }
    }

    return { kind: 'updated', status: updatedEntry.status }
  })
}

export async function readAnimeArchivePage(
  database: NodePgDatabase,
  request: ReadAnimeArchivePageRequest,
): Promise<AnimePrivateListPage> {
  const { userId, page, pageSize, sort } =
    animeArchivePageRequestSchema.parse(request)
  const offset = (page - 1) * pageSize

  return database.transaction(
    async (transaction) => {
      const preferences = await readUserCataloguePreferences(transaction, {
        userId,
      })
      const expressions = buildAnimeArchiveExpressions({
        canViewAdult: preferences.adultContentEnabled,
        titleLanguage: preferences.titleLanguage,
      })
      const [countRow] = await transaction
        .select({ totalItems: count() })
        .from(animeEntries)
        .where(eq(animeEntries.userId, userId))

      const totalItems = Number(countRow?.totalItems ?? 0)
      const rows = await transaction
        .select({
          kind: expressions.availability,
          entryId: sql<
            string | null
          >`case when ${expressions.restrictedCondition} then null else ${animeEntries.id} end`,
          title: sql<
            string | null
          >`case when ${expressions.restrictedCondition} then null else ${expressions.resolvedTitle} end`,
          isAdult: sql<
            boolean | null
          >`case when ${expressions.restrictedCondition} then null else ${animeCatalogueItems.maturity} = 'adult' end`.mapWith(
            Boolean,
          ),
          releaseYear: sql<
            number | null
          >`case when ${expressions.restrictedCondition} then null else ${animeCatalogueItems.releaseYear} end`,
          episodeCount: sql<
            number | null
          >`case when ${expressions.restrictedCondition} then null else ${animeCatalogueItems.episodeCount} end`,
          format: sql<
            string | null
          >`case when ${expressions.restrictedCondition} then null else ${animeCatalogueItems.format} end`,
          episodeProgress: sql<
            number | null
          >`case when ${expressions.restrictedCondition} then null else ${animeEntries.episodeProgress} end`.mapWith(
            animeEntries.episodeProgress,
          ),
          episodeTotalOverride: sql<
            number | null
          >`case when ${expressions.restrictedCondition} then null else ${animeEntries.episodeTotalOverride} end`.mapWith(
            animeEntries.episodeTotalOverride,
          ),
          rating: sql<
            number | null
          >`case when ${expressions.restrictedCondition} then null else ${animeEntries.rating} end`.mapWith(
            animeEntries.rating,
          ),
          isFavourite: sql<
            boolean | null
          >`case when ${expressions.restrictedCondition} then null else ${animeEntries.isFavourite} end`.mapWith(
            animeEntries.isFavourite,
          ),
          startDate: sql<
            string | null
          >`case when ${expressions.restrictedCondition} then null else ${animeEntries.startDate} end`.mapWith(
            animeEntries.startDate,
          ),
          finishDate: sql<
            string | null
          >`case when ${expressions.restrictedCondition} then null else ${animeEntries.finishDate} end`.mapWith(
            animeEntries.finishDate,
          ),
          releaseStatus: sql<AnimeReleaseStatus | null>`case when ${expressions.restrictedCondition} then null else ${animeCatalogueItems.releaseStatus} end`,
          archiveStatus: animeEntries.status,
        })
        .from(animeEntries)
        .innerJoin(
          animeCatalogueItems,
          eq(animeCatalogueItems.id, animeEntries.catalogueItemId),
        )
        .where(eq(animeEntries.userId, userId))
        .orderBy(...buildAnimeArchiveOrder(sort, expressions))
        .limit(pageSize)
        .offset(offset)

      return {
        entries: rows.map(mapStoredAnimeArchiveEntry),
        pagination: buildAnimePrivateListPagination(page, totalItems),
      }
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  )
}

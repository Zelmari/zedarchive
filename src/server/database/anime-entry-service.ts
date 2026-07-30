import 'server-only'

import { and, eq, inArray, sql } from 'drizzle-orm'
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
import {
  animeCatalogueItems,
  animeEntries,
  userCataloguePreferences,
} from '@/server/database/schema'
import { establishActiveAccount } from '@/server/database/active-account-transaction'
import { monotonicAnimeEntryUpdatedAt } from '@/server/database/anime-entry-timestamp'
import { lockAdultContentPreferenceForShare } from '@/server/database/user-catalogue-preferences-service'

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

function buildAnimeArchivePayloadOrder(sort: AnimePrivateListSort) {
  const shared = sql`"restrictedOrder" asc, "ordinaryFavourite" asc`
  const title = sql`"visibleTitleLower" asc, "visibleTitle" asc, "catalogueItemId" asc`

  switch (sort) {
    case 'alphabetical':
      return sql`${shared}, ${title}`
    case 'recently-updated':
      return sql`${shared}, "visibleUpdatedAt" desc, ${title}`
    case 'recently-added':
      return sql`${shared}, "visibleCreatedAt" desc, ${title}`
    case 'highest-rated':
      return sql`${shared}, "visibleUnrated" asc, "visibleRating" desc, ${title}`
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

function nullableDatabaseNumber(value: number | string | null): number | null {
  return value === null ? null : Number(value)
}

export async function createAnimeEntry(
  database: NodePgDatabase,
  request: CreateAnimeEntryRequest,
): Promise<CreateAnimeEntryResult> {
  return database.transaction(
    async (transaction) => {
      if (!(await establishActiveAccount(transaction, request.userId))) {
        return { kind: 'unavailable' }
      }

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
    },
    { isolationLevel: 'read committed' },
  )
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

  return database.transaction(
    async (transaction) => {
      if (!(await establishActiveAccount(transaction, request.userId))) {
        return []
      }

      return transaction
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
    },
    { isolationLevel: 'read committed' },
  )
}

export async function updateAnimeEntryStatus(
  database: NodePgDatabase,
  request: UpdateAnimeEntryStatusRequest,
): Promise<UpdateAnimeEntryStatusResult> {
  return database.transaction(
    async (transaction) => {
      if (!(await establishActiveAccount(transaction, request.userId))) {
        return { kind: 'unavailable' }
      }

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
          updatedAt: monotonicAnimeEntryUpdatedAt,
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
    },
    { isolationLevel: 'read committed' },
  )
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
      if (!(await establishActiveAccount(transaction, userId))) {
        throw new Error('Anime archive account is unavailable')
      }

      const preferredTitle = sql<string>`case "preference"."title_language"
        when 'romaji' then coalesce(${animeCatalogueItems.romajiTitle}, ${animeCatalogueItems.englishTitle}, ${animeCatalogueItems.originalTitle})
        when 'original' then coalesce(${animeCatalogueItems.originalTitle}, ${animeCatalogueItems.romajiTitle}, ${animeCatalogueItems.englishTitle})
        else coalesce(${animeCatalogueItems.englishTitle}, ${animeCatalogueItems.romajiTitle}, ${animeCatalogueItems.originalTitle})
      end`
      const restricted = sql`not "preference"."adult_content_enabled"
        and ${animeCatalogueItems.maturity} = 'adult'`
      const payloadOrder = buildAnimeArchivePayloadOrder(sort)
      const payload = await transaction.execute<{
        totalItems: number
        kind: AnimePrivateListEntry['kind'] | null
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
        archiveStatus: EntryStatus | null
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
        "base" as materialized (
          select
            case
              when ${restricted} then 'restricted'
              when ${animeCatalogueItems.catalogueState} = 'published'
                then 'displayable'
              else 'unavailable_in_catalogue'
            end as "kind",
            case when ${restricted} then null else ${animeEntries.id} end
              as "entryId",
            case when ${restricted} then null else ${preferredTitle} end
              as "title",
            case when ${restricted} then null
              else ${animeCatalogueItems.maturity} = 'adult' end as "isAdult",
            case when ${restricted} then null
              else ${animeCatalogueItems.releaseYear} end as "releaseYear",
            case when ${restricted} then null
              else ${animeCatalogueItems.episodeCount} end as "episodeCount",
            case when ${restricted} then null
              else ${animeCatalogueItems.format} end as "format",
            case when ${restricted} then null
              else ${animeEntries.episodeProgress} end as "episodeProgress",
            case when ${restricted} then null
              else ${animeEntries.episodeTotalOverride} end
              as "episodeTotalOverride",
            case when ${restricted} then null
              else ${animeEntries.rating} end as "rating",
            case when ${restricted} then null
              else ${animeEntries.isFavourite} end as "isFavourite",
            case when ${restricted} then null
              else ${animeEntries.startDate} end as "startDate",
            case when ${restricted} then null
              else ${animeEntries.finishDate} end as "finishDate",
            case when ${restricted} then null
              else ${animeCatalogueItems.releaseStatus} end as "releaseStatus",
            ${animeEntries.status} as "archiveStatus",
            ${animeCatalogueItems.id} as "catalogueItemId",
            case when ${restricted} then 1 else 0 end as "restrictedOrder",
            case
              when ${restricted} then null
              when ${animeEntries.isFavourite} then 0
              else 1
            end as "ordinaryFavourite",
            case when ${restricted} then null
              else lower(${preferredTitle}) end as "visibleTitleLower",
            case when ${restricted} then null
              else ${preferredTitle} end as "visibleTitle",
            case when ${restricted} then null
              else ${animeEntries.updatedAt} end as "visibleUpdatedAt",
            case when ${restricted} then null
              else ${animeEntries.createdAt} end as "visibleCreatedAt",
            case
              when ${restricted} then null
              when ${animeEntries.rating} is null then 1
              else 0
            end as "visibleUnrated",
            case when ${restricted} then null
              else ${animeEntries.rating} end as "visibleRating"
          from ${animeEntries}
          inner join ${animeCatalogueItems}
            on ${animeCatalogueItems.id} = ${animeEntries.catalogueItemId}
          cross join "preference"
          where ${animeEntries.userId} = ${userId}
        ),
        "total" as (
          select count(*)::integer as "totalItems" from "base"
        ),
        "page" as (
          select
            "base".*,
            row_number() over (order by ${payloadOrder}) as "rowPosition"
          from "base"
          order by ${payloadOrder}
          limit ${pageSize}
          offset ${offset}
        )
        select
          "total"."totalItems",
          "page"."kind",
          "page"."entryId",
          "page"."title",
          "page"."isAdult",
          "page"."releaseYear",
          "page"."episodeCount",
          "page"."format",
          "page"."episodeProgress",
          "page"."episodeTotalOverride",
          "page"."rating",
          "page"."isFavourite",
          "page"."startDate",
          "page"."finishDate",
          "page"."releaseStatus",
          "page"."archiveStatus"
        from "total"
        left join "page" on true
        order by "page"."rowPosition" nulls last
      `)

      const rows = payload.rows
      const totalItems = Number(rows[0]?.totalItems ?? 0)

      return {
        entries: rows
          .filter(
            (
              row,
            ): row is typeof row & {
              kind: AnimePrivateListEntry['kind']
              archiveStatus: EntryStatus
            } => row.kind !== null && row.archiveStatus !== null,
          )
          .map((row) =>
            mapStoredAnimeArchiveEntry({
              ...row,
              episodeCount: nullableDatabaseNumber(row.episodeCount),
              episodeProgress: nullableDatabaseNumber(row.episodeProgress),
              episodeTotalOverride: nullableDatabaseNumber(
                row.episodeTotalOverride,
              ),
              rating: nullableDatabaseNumber(row.rating),
            }),
          ),
        pagination: buildAnimePrivateListPagination(page, totalItems),
      }
    },
    { isolationLevel: 'read committed' },
  )
}

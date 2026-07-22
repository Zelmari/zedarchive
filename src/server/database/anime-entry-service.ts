import 'server-only'

import { and, asc, count, eq, inArray, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { z } from 'zod'
import type { AddAnimeEntryInput } from '@/features/archive/domain/add-anime-entry'
import type { EntryStatus } from '@/features/archive/domain/entry-status'
import {
  ANIME_PRIVATE_LIST_MAX_PAGE,
  ANIME_PRIVATE_LIST_PAGE_SIZE,
  buildAnimePrivateListPagination,
  type AnimePrivateListEntry,
  type AnimePrivateListPage,
} from '@/features/archive/private-list/anime-private-list-model'
import type { AnimeReleaseStatus } from '@/features/anime/domain/anime-catalogue-item'
import { publishedNonAdultAnimeCatalogueVisibility } from '@/server/database/anime-catalogue-visibility'
import { animeCatalogueItems, animeEntries } from '@/server/database/schema'

export type CreateAnimeEntryRequest = AddAnimeEntryInput & {
  userId: string
}

export type CreateAnimeEntryResult =
  | { kind: 'created'; status: EntryStatus }
  | { kind: 'already_exists'; status: EntryStatus }
  | { kind: 'unavailable' }

export type AnimeEntryCatalogueMembership = {
  catalogueItemId: string
  status: EntryStatus
}

const animeArchivePageRequestSchema = z.strictObject({
  userId: z.uuidv4(),
  page: z.number().int().min(1).max(ANIME_PRIVATE_LIST_MAX_PAGE),
  pageSize: z.literal(ANIME_PRIVATE_LIST_PAGE_SIZE),
})

export type ReadAnimeArchivePageRequest = z.input<
  typeof animeArchivePageRequestSchema
>

const resolvedTitleExpression = sql<string>`coalesce(${animeCatalogueItems.englishTitle}, ${animeCatalogueItems.romajiTitle}, ${animeCatalogueItems.originalTitle})`
const restrictedOrderExpression = sql<number>`case when ${animeCatalogueItems.maturity} = 'adult' then 1 else 0 end`
const visibleTitleLowerOrderExpression = sql<
  string | null
>`case when ${animeCatalogueItems.maturity} = 'adult' then null else lower(${resolvedTitleExpression}) end`
const visibleTitleOrderExpression = sql<
  string | null
>`case when ${animeCatalogueItems.maturity} = 'adult' then null else ${resolvedTitleExpression} end`

const archiveAvailabilityExpression = sql<AnimePrivateListEntry['kind']>`case
  when ${animeCatalogueItems.maturity} = 'adult' then 'restricted'
  when ${animeCatalogueItems.catalogueState} = 'published' then 'displayable'
  else 'unavailable_in_catalogue'
end`

function mapStoredAnimeArchiveEntry(row: {
  kind: AnimePrivateListEntry['kind']
  title: string | null
  releaseYear: number | null
  episodeCount: number | null
  releaseStatus: AnimeReleaseStatus | null
  archiveStatus: EntryStatus
}): AnimePrivateListEntry {
  if (row.kind === 'restricted') {
    return { kind: 'restricted', archiveStatus: row.archiveStatus }
  }

  if (
    row.title === null ||
    row.title !== row.title.trim() ||
    row.releaseStatus === null
  ) {
    throw new Error('Stored private anime archive item failed integrity checks')
  }

  return {
    kind: row.kind,
    title: row.title,
    releaseYear: row.releaseYear,
    episodeCount: row.episodeCount,
    releaseStatus: row.releaseStatus,
    archiveStatus: row.archiveStatus,
  }
}

export async function createAnimeEntry(
  database: NodePgDatabase,
  request: CreateAnimeEntryRequest,
): Promise<CreateAnimeEntryResult> {
  const [createdEntry] = await database
    .execute<{ status: EntryStatus }>(
      sql`
      insert into ${animeEntries} (
        "user_id",
        "catalogue_item_id",
        "status"
      )
      select
        ${request.userId}::uuid,
        ${animeCatalogueItems.id},
        ${request.status}
      from ${animeCatalogueItems}
      where ${and(
        eq(animeCatalogueItems.id, request.catalogueItemId),
        publishedNonAdultAnimeCatalogueVisibility,
      )}
      on conflict ("user_id", "catalogue_item_id") do nothing
      returning ${animeEntries.status}
    `,
    )
    .then(({ rows }) => rows)

  if (createdEntry) {
    return { kind: 'created', status: createdEntry.status }
  }

  const [existingEntry] = await database
    .select({ status: animeEntries.status })
    .from(animeEntries)
    .where(
      and(
        eq(animeEntries.userId, request.userId),
        eq(animeEntries.catalogueItemId, request.catalogueItemId),
      ),
    )
    .limit(1)

  if (existingEntry) {
    return { kind: 'already_exists', status: existingEntry.status }
  }

  return { kind: 'unavailable' }
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

export async function readAnimeArchivePage(
  database: NodePgDatabase,
  request: ReadAnimeArchivePageRequest,
): Promise<AnimePrivateListPage> {
  const { userId, page, pageSize } =
    animeArchivePageRequestSchema.parse(request)
  const offset = (page - 1) * pageSize

  return database.transaction(
    async (transaction) => {
      const [countRow] = await transaction
        .select({ totalItems: count() })
        .from(animeEntries)
        .where(eq(animeEntries.userId, userId))

      const totalItems = Number(countRow?.totalItems ?? 0)
      const rows = await transaction
        .select({
          kind: archiveAvailabilityExpression,
          title: sql<
            string | null
          >`case when ${animeCatalogueItems.maturity} = 'adult' then null else ${resolvedTitleExpression} end`,
          releaseYear: sql<
            number | null
          >`case when ${animeCatalogueItems.maturity} = 'adult' then null else ${animeCatalogueItems.releaseYear} end`,
          episodeCount: sql<
            number | null
          >`case when ${animeCatalogueItems.maturity} = 'adult' then null else ${animeCatalogueItems.episodeCount} end`,
          releaseStatus: sql<AnimeReleaseStatus | null>`case when ${animeCatalogueItems.maturity} = 'adult' then null else ${animeCatalogueItems.releaseStatus} end`,
          archiveStatus: animeEntries.status,
        })
        .from(animeEntries)
        .innerJoin(
          animeCatalogueItems,
          eq(animeCatalogueItems.id, animeEntries.catalogueItemId),
        )
        .where(eq(animeEntries.userId, userId))
        .orderBy(
          asc(restrictedOrderExpression),
          asc(visibleTitleLowerOrderExpression),
          asc(visibleTitleOrderExpression),
          asc(animeCatalogueItems.id),
        )
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

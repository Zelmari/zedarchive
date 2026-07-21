import 'server-only'

import { and, eq, inArray, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { AddAnimeEntryInput } from '@/features/archive/domain/add-anime-entry'
import type { EntryStatus } from '@/features/archive/domain/entry-status'
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

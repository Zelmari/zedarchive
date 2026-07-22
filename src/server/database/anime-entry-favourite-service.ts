import 'server-only'

import { and, eq, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { z } from 'zod'
import type {
  FavouriteMutationResult,
  UpdateAnimeEntryFavouriteInput,
} from '@/features/archive/domain/update-anime-entry-favourite'
import { animeCatalogueItems, animeEntries } from '@/server/database/schema'

export type UpdateAnimeEntryFavouriteRequest =
  UpdateAnimeEntryFavouriteInput & { userId: string }

export type UpdateAnimeEntryFavouriteResult = FavouriteMutationResult

type LockedEntry = {
  id: string
  catalogueItemId: string
  isFavourite: boolean
}

function parseLockedEntry(row: {
  id: string
  catalogueItemId: string
  isFavourite: boolean
}): LockedEntry {
  return {
    id: row.id,
    catalogueItemId: row.catalogueItemId,
    isFavourite: z.boolean().parse(row.isFavourite),
  }
}

/**
 * Applies an absolute favourite state rather than a toggle. The compare-and-set
 * intentionally has the same bounded ABA limitation as the existing entry
 * mutations: an intervening change that returns to the expected value cannot
 * be distinguished without a separate row version.
 */
export async function updateAnimeEntryFavourite(
  database: NodePgDatabase,
  request: UpdateAnimeEntryFavouriteRequest,
): Promise<UpdateAnimeEntryFavouriteResult> {
  return database.transaction(async (transaction) => {
    const [storedEntry] = await transaction
      .select({
        id: animeEntries.id,
        catalogueItemId: animeEntries.catalogueItemId,
        isFavourite: animeEntries.isFavourite,
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

    if (storedEntry === undefined) return { kind: 'unavailable' }

    const entry = parseLockedEntry(storedEntry)
    const [catalogueItem] = await transaction
      .select({ maturity: animeCatalogueItems.maturity })
      .from(animeCatalogueItems)
      .where(eq(animeCatalogueItems.id, entry.catalogueItemId))
      .for('share')
      .limit(1)

    if (catalogueItem === undefined || catalogueItem.maturity === 'adult') {
      return { kind: 'unavailable' }
    }

    if (entry.isFavourite === request.requestedFavourite) {
      return {
        kind:
          request.expectedFavourite === request.requestedFavourite
            ? 'unchanged'
            : 'updated',
        isFavourite: entry.isFavourite,
      }
    }

    if (entry.isFavourite !== request.expectedFavourite) {
      return { kind: 'conflict', currentFavourite: entry.isFavourite }
    }

    const [updatedEntry] = await transaction
      .update(animeEntries)
      .set({
        isFavourite: request.requestedFavourite,
        updatedAt: sql`current_timestamp`,
      })
      .where(
        and(
          eq(animeEntries.id, entry.id),
          eq(animeEntries.userId, request.userId),
          eq(animeEntries.isFavourite, request.expectedFavourite),
        ),
      )
      .returning({ isFavourite: animeEntries.isFavourite })

    if (updatedEntry === undefined) {
      return { kind: 'conflict', currentFavourite: entry.isFavourite }
    }

    return {
      kind: 'updated',
      isFavourite: z.boolean().parse(updatedEntry.isFavourite),
    }
  })
}

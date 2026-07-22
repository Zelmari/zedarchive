import 'server-only'

import { and, eq, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { ratingSchema, type Rating } from '@/features/archive/domain/rating'
import type {
  RatingMutationResult,
  UpdateAnimeEntryRatingInput,
} from '@/features/archive/domain/update-anime-entry-rating'
import { animeCatalogueItems, animeEntries } from '@/server/database/schema'

export type UpdateAnimeEntryRatingRequest = UpdateAnimeEntryRatingInput & {
  userId: string
}

export type UpdateAnimeEntryRatingResult = RatingMutationResult

type LockedEntry = {
  id: string
  catalogueItemId: string
  rating: Rating | null
}

function parseLockedEntry(row: {
  id: string
  catalogueItemId: string
  rating: number | null
}): LockedEntry {
  return {
    id: row.id,
    catalogueItemId: row.catalogueItemId,
    rating: ratingSchema.nullable().parse(row.rating),
  }
}

export async function updateAnimeEntryRating(
  database: NodePgDatabase,
  request: UpdateAnimeEntryRatingRequest,
): Promise<UpdateAnimeEntryRatingResult> {
  return database.transaction(async (transaction) => {
    const [storedEntry] = await transaction
      .select({
        id: animeEntries.id,
        catalogueItemId: animeEntries.catalogueItemId,
        rating: animeEntries.rating,
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

    if (storedEntry === undefined) {
      return { kind: 'unavailable' }
    }

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

    if (entry.rating === request.requestedRating) {
      return {
        kind:
          request.expectedRating === request.requestedRating
            ? 'unchanged'
            : 'updated',
        rating: entry.rating,
      }
    }

    if (entry.rating !== request.expectedRating) {
      return { kind: 'conflict', currentRating: entry.rating }
    }

    const [updatedEntry] = await transaction
      .update(animeEntries)
      .set({
        rating: request.requestedRating,
        updatedAt: sql`current_timestamp`,
      })
      .where(
        and(
          eq(animeEntries.id, entry.id),
          eq(animeEntries.userId, request.userId),
          sql`${animeEntries.rating} is not distinct from ${request.expectedRating}`,
        ),
      )
      .returning({ rating: animeEntries.rating })

    if (updatedEntry === undefined) {
      return { kind: 'conflict', currentRating: entry.rating }
    }

    return {
      kind: 'updated',
      rating: ratingSchema.nullable().parse(updatedEntry.rating),
    }
  })
}

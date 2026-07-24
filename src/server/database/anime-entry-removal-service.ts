import 'server-only'

import { and, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type {
  RemoveAnimeEntryInput,
  RemoveAnimeEntryResult,
} from '@/features/archive/domain/remove-anime-entry'
import { animeCatalogueItems, animeEntries } from '@/server/database/schema'
import { lockAdultContentPreferenceForShare } from '@/server/database/user-catalogue-preferences-service'

export type RemoveAnimeEntryRequest = RemoveAnimeEntryInput & {
  userId: string
}

export async function removeAnimeEntry(
  database: NodePgDatabase,
  request: RemoveAnimeEntryRequest,
): Promise<RemoveAnimeEntryResult> {
  return database.transaction(async (transaction) => {
    const [entry] = await transaction
      .select({
        id: animeEntries.id,
        catalogueItemId: animeEntries.catalogueItemId,
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

    if (entry === undefined) return { kind: 'unavailable' }

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

    const removedEntries = await transaction
      .delete(animeEntries)
      .where(
        and(
          eq(animeEntries.id, entry.id),
          eq(animeEntries.userId, request.userId),
        ),
      )
      .returning({ id: animeEntries.id })

    if (removedEntries.length !== 1) {
      throw new Error('Eligible anime entry removal did not delete one row')
    }

    return { kind: 'removed' }
  })
}

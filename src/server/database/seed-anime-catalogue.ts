import { and, asc, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { AnimeCatalogueSeed } from '@/features/anime/catalogue/anime-catalogue-seed'
import {
  animeAlternativeTitles,
  animeCatalogueItems,
  animeCatalogueSources,
} from '@/server/database/schema'

type SeedItem = AnimeCatalogueSeed['items'][number]
type SeedSource = SeedItem['sources'][number]
type StoredCatalogueItem = typeof animeCatalogueItems.$inferSelect
type StoredAlternativeTitle = typeof animeAlternativeTitles.$inferSelect
type StoredSource = typeof animeCatalogueSources.$inferSelect

export type AnimeCatalogueSeedSyncResult = {
  inserted: number
  updated: number
  unchanged: number
}

export type SynchronizeAnimeCatalogueSeedOptions = {
  mutationTime?: Date
}

export class AnimeCatalogueSeedSourceConflictError extends Error {
  constructor(
    readonly sourceKey: string,
    readonly sourceItemId: string,
  ) {
    super(
      `Cannot seed source "${sourceKey}:${sourceItemId}" because it belongs to another catalogue item`,
    )
    this.name = 'AnimeCatalogueSeedSourceConflictError'
  }
}

function parentMatchesSeed(
  stored: StoredCatalogueItem,
  seed: SeedItem,
): boolean {
  return (
    stored.englishTitle === seed.titles.english &&
    stored.romajiTitle === seed.titles.romaji &&
    stored.originalTitle === seed.titles.original &&
    stored.format === seed.format &&
    stored.releaseStatus === seed.releaseStatus &&
    stored.releaseYear === seed.releaseYear &&
    stored.episodeCount === seed.episodeCount &&
    stored.maturity === seed.maturity &&
    stored.catalogueState === seed.catalogueState
  )
}

function alternativesMatchSeed(
  stored: readonly StoredAlternativeTitle[],
  seed: SeedItem,
): boolean {
  return (
    stored.length === seed.titles.alternatives.length &&
    stored.every(
      ({ title, position }, index) =>
        position === index && title === seed.titles.alternatives[index],
    )
  )
}

function sourceMatches(
  stored: Pick<StoredSource, 'sourceKey' | 'sourceItemId'>,
  seed: SeedSource,
): boolean {
  return (
    stored.sourceKey === seed.sourceKey &&
    stored.sourceItemId === seed.sourceItemId
  )
}

function sourcesMatchSeed(
  stored: readonly StoredSource[],
  seed: SeedItem,
): boolean {
  return (
    stored.length === seed.sources.length &&
    stored.every((storedSource) =>
      seed.sources.some((seedSource) =>
        sourceMatches(storedSource, seedSource),
      ),
    )
  )
}

function isUniqueViolation(error: unknown): boolean {
  const postgresError =
    error instanceof Error && error.cause !== undefined ? error.cause : error

  return (
    typeof postgresError === 'object' &&
    postgresError !== null &&
    'code' in postgresError &&
    postgresError.code === '23505'
  )
}

function parentValues(seed: SeedItem) {
  return {
    englishTitle: seed.titles.english,
    romajiTitle: seed.titles.romaji,
    originalTitle: seed.titles.original,
    format: seed.format,
    releaseStatus: seed.releaseStatus,
    releaseYear: seed.releaseYear,
    episodeCount: seed.episodeCount,
    maturity: seed.maturity,
    catalogueState: seed.catalogueState,
  }
}

/**
 * Converges only the fixed catalogue IDs present in a validated seed. Records
 * absent from the seed are deliberately outside this function's ownership.
 */
export async function synchronizeAnimeCatalogueSeed(
  database: NodePgDatabase,
  seed: AnimeCatalogueSeed,
  options: SynchronizeAnimeCatalogueSeedOptions = {},
): Promise<AnimeCatalogueSeedSyncResult> {
  const mutationTime = options.mutationTime ?? new Date()

  return database.transaction(async (transaction) => {
    const result: AnimeCatalogueSeedSyncResult = {
      inserted: 0,
      updated: 0,
      unchanged: 0,
    }

    // Check ownership before mutation so a source cannot silently move between
    // two catalogue items merely because of seed item ordering.
    for (const seedItem of seed.items) {
      for (const seedSource of seedItem.sources) {
        const [storedSource] = await transaction
          .select({ catalogueItemId: animeCatalogueSources.catalogueItemId })
          .from(animeCatalogueSources)
          .where(
            and(
              eq(animeCatalogueSources.sourceKey, seedSource.sourceKey),
              eq(animeCatalogueSources.sourceItemId, seedSource.sourceItemId),
            ),
          )
          .for('update')
          .limit(1)

        if (
          storedSource !== undefined &&
          storedSource.catalogueItemId !== seedItem.id
        ) {
          throw new AnimeCatalogueSeedSourceConflictError(
            seedSource.sourceKey,
            seedSource.sourceItemId,
          )
        }
      }
    }

    for (const seedItem of seed.items) {
      const [storedParent] = await transaction
        .select()
        .from(animeCatalogueItems)
        .where(eq(animeCatalogueItems.id, seedItem.id))
        .for('update')
        .limit(1)

      if (storedParent === undefined) {
        await transaction.insert(animeCatalogueItems).values({
          id: seedItem.id,
          ...parentValues(seedItem),
          createdAt: mutationTime,
          updatedAt: mutationTime,
        })

        if (seedItem.titles.alternatives.length > 0) {
          await transaction.insert(animeAlternativeTitles).values(
            seedItem.titles.alternatives.map((title, position) => ({
              catalogueItemId: seedItem.id,
              title,
              position,
            })),
          )
        }

        for (const seedSource of seedItem.sources) {
          try {
            await transaction.insert(animeCatalogueSources).values({
              catalogueItemId: seedItem.id,
              sourceKey: seedSource.sourceKey,
              sourceItemId: seedSource.sourceItemId,
              firstSeenAt: mutationTime,
              lastSeenAt: mutationTime,
            })
          } catch (error) {
            if (isUniqueViolation(error)) {
              throw new AnimeCatalogueSeedSourceConflictError(
                seedSource.sourceKey,
                seedSource.sourceItemId,
              )
            }

            throw error
          }
        }

        result.inserted += 1
        continue
      }

      const [storedAlternatives, storedSources] = await Promise.all([
        transaction
          .select()
          .from(animeAlternativeTitles)
          .where(eq(animeAlternativeTitles.catalogueItemId, seedItem.id))
          .orderBy(asc(animeAlternativeTitles.position)),
        transaction
          .select()
          .from(animeCatalogueSources)
          .where(eq(animeCatalogueSources.catalogueItemId, seedItem.id)),
      ])

      const parentChanged = !parentMatchesSeed(storedParent, seedItem)
      const alternativesChanged = !alternativesMatchSeed(
        storedAlternatives,
        seedItem,
      )
      const sourcesChanged = !sourcesMatchSeed(storedSources, seedItem)

      if (!parentChanged && !alternativesChanged && !sourcesChanged) {
        result.unchanged += 1
        continue
      }

      if (parentChanged) {
        await transaction
          .update(animeCatalogueItems)
          .set({
            ...parentValues(seedItem),
            updatedAt: mutationTime,
          })
          .where(eq(animeCatalogueItems.id, seedItem.id))
      }

      if (alternativesChanged) {
        await transaction
          .delete(animeAlternativeTitles)
          .where(eq(animeAlternativeTitles.catalogueItemId, seedItem.id))

        if (seedItem.titles.alternatives.length > 0) {
          await transaction.insert(animeAlternativeTitles).values(
            seedItem.titles.alternatives.map((title, position) => ({
              catalogueItemId: seedItem.id,
              title,
              position,
            })),
          )
        }
      }

      if (sourcesChanged) {
        const obsoleteSources = storedSources.filter(
          (storedSource) =>
            !seedItem.sources.some((seedSource) =>
              sourceMatches(storedSource, seedSource),
            ),
        )
        const newSources = seedItem.sources.filter(
          (seedSource) =>
            !storedSources.some((storedSource) =>
              sourceMatches(storedSource, seedSource),
            ),
        )

        for (const obsoleteSource of obsoleteSources) {
          await transaction
            .delete(animeCatalogueSources)
            .where(
              and(
                eq(animeCatalogueSources.catalogueItemId, seedItem.id),
                eq(animeCatalogueSources.sourceKey, obsoleteSource.sourceKey),
                eq(
                  animeCatalogueSources.sourceItemId,
                  obsoleteSource.sourceItemId,
                ),
              ),
            )
        }

        for (const newSource of newSources) {
          try {
            await transaction.insert(animeCatalogueSources).values({
              catalogueItemId: seedItem.id,
              sourceKey: newSource.sourceKey,
              sourceItemId: newSource.sourceItemId,
              firstSeenAt: mutationTime,
              lastSeenAt: mutationTime,
            })
          } catch (error) {
            if (isUniqueViolation(error)) {
              throw new AnimeCatalogueSeedSourceConflictError(
                newSource.sourceKey,
                newSource.sourceItemId,
              )
            }

            throw error
          }
        }
      }

      result.updated += 1
    }

    return result
  })
}

import 'server-only'

import { and, eq, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { getAnimeEpisodeProgressSupport } from '@/features/archive/domain/anime-episode-progress-support'
import {
  episodeProgressSchema,
  type EpisodeProgress,
} from '@/features/archive/domain/episode-progress'
import {
  episodeTotalSchema,
  type EpisodeTotal,
} from '@/features/archive/domain/episode-total'
import type {
  EpisodeProgressMutationResult,
  UpdateAnimeEntryEpisodeProgressInput,
} from '@/features/archive/domain/update-anime-entry-episode-progress'
import type {
  EpisodeTotalMutationResult,
  UpdateAnimeEntryEpisodeTotalInput,
} from '@/features/archive/domain/update-anime-entry-episode-total'
import type { EntryStatus } from '@/features/archive/domain/entry-status'
import { animeCatalogueItems, animeEntries } from '@/server/database/schema'

export type UpdateAnimeEntryEpisodeProgressRequest =
  UpdateAnimeEntryEpisodeProgressInput & {
    userId: string
  }

export type UpdateAnimeEntryEpisodeProgressResult =
  EpisodeProgressMutationResult

export type UpdateAnimeEntryEpisodeTotalOverrideRequest =
  UpdateAnimeEntryEpisodeTotalInput & {
    userId: string
  }

export type UpdateAnimeEntryEpisodeTotalOverrideResult =
  EpisodeTotalMutationResult

type LockedEntry = {
  id: string
  catalogueItemId: string
  status: EntryStatus
  episodeProgress: EpisodeProgress
  episodeTotalOverride: EpisodeTotal | null
}

type LockedCatalogueItem = {
  format: string
  maturity: string
  episodeCount: EpisodeTotal | null
}

function parseLockedEntry(row: {
  id: string
  catalogueItemId: string
  status: EntryStatus
  episodeProgress: number
  episodeTotalOverride: number | null
}): LockedEntry {
  return {
    id: row.id,
    catalogueItemId: row.catalogueItemId,
    status: row.status,
    episodeProgress: episodeProgressSchema.parse(row.episodeProgress),
    episodeTotalOverride: episodeTotalSchema
      .nullable()
      .parse(row.episodeTotalOverride),
  }
}

function parseLockedCatalogueItem(row: {
  format: string
  maturity: string
  episodeCount: number | null
}): LockedCatalogueItem {
  return {
    format: row.format,
    maturity: row.maturity,
    episodeCount: episodeTotalSchema.nullable().parse(row.episodeCount),
  }
}

function progressResult(
  kind: 'updated' | 'unchanged',
  entry: LockedEntry,
  catalogueItem: LockedCatalogueItem,
): Extract<
  UpdateAnimeEntryEpisodeProgressResult,
  { kind: 'updated' | 'unchanged' }
> {
  return {
    kind,
    progress: entry.episodeProgress,
    personalTotal: entry.episodeTotalOverride,
    catalogueTotal: catalogueItem.episodeCount,
    status: entry.status,
  }
}

function totalResult(
  kind: 'updated' | 'unchanged',
  entry: LockedEntry,
  catalogueItem: LockedCatalogueItem,
): Extract<
  UpdateAnimeEntryEpisodeTotalOverrideResult,
  { kind: 'updated' | 'unchanged' }
> {
  return {
    kind,
    personalTotal: entry.episodeTotalOverride,
    progress: entry.episodeProgress,
    catalogueTotal: catalogueItem.episodeCount,
    status: entry.status,
  }
}

export async function updateAnimeEntryEpisodeProgress(
  database: NodePgDatabase,
  request: UpdateAnimeEntryEpisodeProgressRequest,
): Promise<UpdateAnimeEntryEpisodeProgressResult> {
  return database.transaction(async (transaction) => {
    const [storedEntry] = await transaction
      .select({
        id: animeEntries.id,
        catalogueItemId: animeEntries.catalogueItemId,
        status: animeEntries.status,
        episodeProgress: animeEntries.episodeProgress,
        episodeTotalOverride: animeEntries.episodeTotalOverride,
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
    const [storedCatalogueItem] = await transaction
      .select({
        format: animeCatalogueItems.format,
        maturity: animeCatalogueItems.maturity,
        episodeCount: animeCatalogueItems.episodeCount,
      })
      .from(animeCatalogueItems)
      .where(eq(animeCatalogueItems.id, entry.catalogueItemId))
      .for('share')
      .limit(1)

    if (storedCatalogueItem === undefined) {
      return { kind: 'unavailable' }
    }

    const catalogueItem = parseLockedCatalogueItem(storedCatalogueItem)
    if (
      catalogueItem.maturity === 'adult' ||
      getAnimeEpisodeProgressSupport(catalogueItem.format) !== 'trackable'
    ) {
      return { kind: 'unavailable' }
    }

    if (entry.episodeProgress === request.requestedEpisodeProgress) {
      return progressResult(
        request.expectedEpisodeProgress === request.requestedEpisodeProgress
          ? 'unchanged'
          : 'updated',
        entry,
        catalogueItem,
      )
    }

    if (entry.episodeProgress !== request.expectedEpisodeProgress) {
      return { kind: 'conflict', currentProgress: entry.episodeProgress }
    }

    const [updatedEntry] = await transaction
      .update(animeEntries)
      .set({
        episodeProgress: request.requestedEpisodeProgress,
        updatedAt: sql`current_timestamp`,
      })
      .where(
        and(
          eq(animeEntries.id, entry.id),
          eq(animeEntries.userId, request.userId),
          eq(animeEntries.episodeProgress, request.expectedEpisodeProgress),
        ),
      )
      .returning({
        id: animeEntries.id,
        catalogueItemId: animeEntries.catalogueItemId,
        status: animeEntries.status,
        episodeProgress: animeEntries.episodeProgress,
        episodeTotalOverride: animeEntries.episodeTotalOverride,
      })

    if (updatedEntry === undefined) {
      return { kind: 'conflict', currentProgress: entry.episodeProgress }
    }

    return progressResult(
      'updated',
      parseLockedEntry(updatedEntry),
      catalogueItem,
    )
  })
}

export async function updateAnimeEntryEpisodeTotalOverride(
  database: NodePgDatabase,
  request: UpdateAnimeEntryEpisodeTotalOverrideRequest,
): Promise<UpdateAnimeEntryEpisodeTotalOverrideResult> {
  return database.transaction(async (transaction) => {
    const [storedEntry] = await transaction
      .select({
        id: animeEntries.id,
        catalogueItemId: animeEntries.catalogueItemId,
        status: animeEntries.status,
        episodeProgress: animeEntries.episodeProgress,
        episodeTotalOverride: animeEntries.episodeTotalOverride,
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
    const [storedCatalogueItem] = await transaction
      .select({
        format: animeCatalogueItems.format,
        maturity: animeCatalogueItems.maturity,
        episodeCount: animeCatalogueItems.episodeCount,
      })
      .from(animeCatalogueItems)
      .where(eq(animeCatalogueItems.id, entry.catalogueItemId))
      .for('share')
      .limit(1)

    if (storedCatalogueItem === undefined) {
      return { kind: 'unavailable' }
    }

    const catalogueItem = parseLockedCatalogueItem(storedCatalogueItem)
    if (
      catalogueItem.maturity === 'adult' ||
      getAnimeEpisodeProgressSupport(catalogueItem.format) !== 'trackable'
    ) {
      return { kind: 'unavailable' }
    }

    if (entry.episodeTotalOverride === request.requestedEpisodeTotalOverride) {
      return totalResult(
        request.expectedEpisodeTotalOverride ===
          request.requestedEpisodeTotalOverride
          ? 'unchanged'
          : 'updated',
        entry,
        catalogueItem,
      )
    }

    if (entry.episodeTotalOverride !== request.expectedEpisodeTotalOverride) {
      return {
        kind: 'conflict',
        currentPersonalTotal: entry.episodeTotalOverride,
      }
    }

    const [updatedEntry] = await transaction
      .update(animeEntries)
      .set({
        episodeTotalOverride: request.requestedEpisodeTotalOverride,
        updatedAt: sql`current_timestamp`,
      })
      .where(
        and(
          eq(animeEntries.id, entry.id),
          eq(animeEntries.userId, request.userId),
          sql`${animeEntries.episodeTotalOverride} is not distinct from ${request.expectedEpisodeTotalOverride}`,
        ),
      )
      .returning({
        id: animeEntries.id,
        catalogueItemId: animeEntries.catalogueItemId,
        status: animeEntries.status,
        episodeProgress: animeEntries.episodeProgress,
        episodeTotalOverride: animeEntries.episodeTotalOverride,
      })

    if (updatedEntry === undefined) {
      return {
        kind: 'conflict',
        currentPersonalTotal: entry.episodeTotalOverride,
      }
    }

    return totalResult('updated', parseLockedEntry(updatedEntry), catalogueItem)
  })
}

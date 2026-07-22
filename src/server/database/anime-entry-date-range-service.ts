import 'server-only'

import { and, eq, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import {
  entryDateRangeSchema,
  type CalendarDate,
} from '@/features/archive/domain/entry-date-range'
import type {
  DateRangeMutationResult,
  UpdateAnimeEntryDateRangeInput,
} from '@/features/archive/domain/update-anime-entry-date-range'
import { animeCatalogueItems, animeEntries } from '@/server/database/schema'

export type UpdateAnimeEntryDateRangeRequest =
  UpdateAnimeEntryDateRangeInput & { userId: string }

export type UpdateAnimeEntryDateRangeResult = DateRangeMutationResult

type DateRange = {
  startDate: CalendarDate | null
  finishDate: CalendarDate | null
}

type LockedEntry = DateRange & {
  id: string
  catalogueItemId: string
}

function parseDateRange(row: {
  startDate: string | null
  finishDate: string | null
}): DateRange {
  const parsed = entryDateRangeSchema.parse({
    startDate: row.startDate ?? undefined,
    finishDate: row.finishDate ?? undefined,
  })

  return {
    startDate: parsed.startDate ?? null,
    finishDate: parsed.finishDate ?? null,
  }
}

function parseLockedEntry(row: {
  id: string
  catalogueItemId: string
  startDate: string | null
  finishDate: string | null
}): LockedEntry {
  return {
    id: row.id,
    catalogueItemId: row.catalogueItemId,
    ...parseDateRange(row),
  }
}

function hasSameDateRange(left: DateRange, right: DateRange): boolean {
  return (
    left.startDate === right.startDate && left.finishDate === right.finishDate
  )
}

function result(
  kind: 'updated' | 'unchanged',
  dateRange: DateRange,
): Extract<UpdateAnimeEntryDateRangeResult, { kind: 'updated' | 'unchanged' }> {
  return {
    kind,
    startDate: dateRange.startDate,
    finishDate: dateRange.finishDate,
  }
}

/**
 * Compares both dates as one logical range. As with other field CAS writes,
 * this intentionally accepts the bounded ABA limitation rather than claiming
 * to provide row versioning.
 */
export async function updateAnimeEntryDateRange(
  database: NodePgDatabase,
  request: UpdateAnimeEntryDateRangeRequest,
): Promise<UpdateAnimeEntryDateRangeResult> {
  return database.transaction(async (transaction) => {
    const [storedEntry] = await transaction
      .select({
        id: animeEntries.id,
        catalogueItemId: animeEntries.catalogueItemId,
        startDate: animeEntries.startDate,
        finishDate: animeEntries.finishDate,
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

    const requestedDateRange = {
      startDate: request.requestedStartDate,
      finishDate: request.requestedFinishDate,
    }
    const expectedDateRange = {
      startDate: request.expectedStartDate,
      finishDate: request.expectedFinishDate,
    }

    if (hasSameDateRange(entry, requestedDateRange)) {
      return result(
        hasSameDateRange(expectedDateRange, requestedDateRange)
          ? 'unchanged'
          : 'updated',
        entry,
      )
    }

    if (!hasSameDateRange(entry, expectedDateRange)) {
      return {
        kind: 'conflict',
        currentStartDate: entry.startDate,
        currentFinishDate: entry.finishDate,
      }
    }

    const [updatedEntry] = await transaction
      .update(animeEntries)
      .set({
        startDate: request.requestedStartDate,
        finishDate: request.requestedFinishDate,
        updatedAt: sql`current_timestamp`,
      })
      .where(
        and(
          eq(animeEntries.id, entry.id),
          eq(animeEntries.userId, request.userId),
          sql`${animeEntries.startDate} is not distinct from ${request.expectedStartDate}`,
          sql`${animeEntries.finishDate} is not distinct from ${request.expectedFinishDate}`,
        ),
      )
      .returning({
        startDate: animeEntries.startDate,
        finishDate: animeEntries.finishDate,
      })

    if (updatedEntry === undefined) {
      return {
        kind: 'conflict',
        currentStartDate: entry.startDate,
        currentFinishDate: entry.finishDate,
      }
    }

    return result('updated', parseDateRange(updatedEntry))
  })
}

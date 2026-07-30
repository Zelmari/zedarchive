import 'server-only'

import { sql } from 'drizzle-orm'
import { animeEntries } from '@/server/database/schema'

/**
 * Database-owned timestamp assignment for real anime-entry mutations.
 *
 * `current_timestamp` is fixed when a transaction starts, so a transaction
 * that waits behind a newer sibling mutation can otherwise move `updated_at`
 * backwards when it finally writes. `clock_timestamp()` is evaluated for the
 * statement, while `greatest` also preserves an already later stored value.
 */
export const monotonicAnimeEntryUpdatedAt = sql`greatest(${animeEntries.updatedAt}, clock_timestamp())`

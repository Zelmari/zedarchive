import 'server-only'

import { eq, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { accountDeletionRequests, users } from '@/server/database/schema'

export type AccountDeletionState =
  | { kind: 'active' }
  | { kind: 'deletion_recoverable'; purgeAfter: Date }
  | { kind: 'deletion_due'; purgeAfter: Date }
  | { kind: 'unavailable' }

/**
 * Reads database-owned lifecycle authority for an already-authenticated user.
 * Provider/session failures are composed by the caller; database uncertainty
 * is caught here and never degrades to active.
 */
export async function readAccountDeletionState(
  database: NodePgDatabase,
  userId: string,
): Promise<AccountDeletionState> {
  try {
    const [row] = await database
      .select({
        userId: users.id,
        purgeAfter: accountDeletionRequests.purgeAfter,
        databaseNow: sql<Date>`clock_timestamp()`,
      })
      .from(users)
      .leftJoin(
        accountDeletionRequests,
        eq(accountDeletionRequests.userId, users.id),
      )
      .where(eq(users.id, userId))
      .limit(1)

    if (row === undefined) return { kind: 'unavailable' }
    if (row.purgeAfter === null) return { kind: 'active' }

    const purgeAfter = new Date(row.purgeAfter)
    const databaseNow = new Date(row.databaseNow)
    return databaseNow < purgeAfter
      ? { kind: 'deletion_recoverable', purgeAfter }
      : { kind: 'deletion_due', purgeAfter }
  } catch {
    return { kind: 'unavailable' }
  }
}

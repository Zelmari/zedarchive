import 'server-only'

import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { accountDeletionRequests, users } from '@/server/database/schema'

export type ActiveAccountDatabase = NodePgDatabase

/**
 * Establishes transaction-time active authority.
 *
 * The statements must remain separate. `FOR KEY SHARE` conflicts with the
 * lifecycle `FOR UPDATE` lock, and the following READ COMMITTED statement gets
 * a fresh snapshot that observes any deletion request committed while waiting.
 */
export async function establishActiveAccount(
  transaction: ActiveAccountDatabase,
  userId: string,
): Promise<boolean> {
  const [user] = await transaction
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .for('key share')
    .limit(1)
  if (user === undefined) return false

  const [deletionRequest] = await transaction
    .select({ userId: accountDeletionRequests.userId })
    .from(accountDeletionRequests)
    .where(eq(accountDeletionRequests.userId, userId))
    .limit(1)

  return deletionRequest === undefined
}

export type ActiveAccountTransactionResult<T> =
  { kind: 'active'; value: T } | { kind: 'account_unavailable' }

export async function runInActiveAccountTransaction<T>(
  database: ActiveAccountDatabase,
  userId: string,
  operation: (transaction: ActiveAccountDatabase) => Promise<T>,
): Promise<ActiveAccountTransactionResult<T>> {
  return database.transaction(
    async (transaction) => {
      if (!(await establishActiveAccount(transaction, userId))) {
        return { kind: 'account_unavailable' }
      }

      return { kind: 'active', value: await operation(transaction) }
    },
    { isolationLevel: 'read committed' },
  )
}

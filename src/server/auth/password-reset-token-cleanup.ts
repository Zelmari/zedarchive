import { and, eq, like } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { verifications } from '@/server/database/schema'

type VerificationDatabase = Pick<NodePgDatabase, 'delete'>

export async function deleteOutstandingPasswordResetTokens(
  database: VerificationDatabase,
  userId: string,
): Promise<void> {
  await database
    .delete(verifications)
    .where(
      and(
        eq(verifications.value, userId),
        like(verifications.identifier, 'reset-password:%'),
      ),
    )
}

import { and, eq, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { UsernameAvailability } from '@/features/identity/domain/username-availability'
import {
  normalizeUsernameForIdentity,
  usernameSchema,
} from '@/features/identity/domain/username'
import { usernameChangeRecords, users } from '@/server/database/schema'

export const usernameAvailabilityInputMaximumCodeUnits = 256

export async function checkUsernameAvailability(
  database: NodePgDatabase,
  candidate: unknown,
): Promise<UsernameAvailability> {
  if (
    typeof candidate !== 'string' ||
    candidate.length > usernameAvailabilityInputMaximumCodeUnits
  ) {
    return { status: 'invalid' }
  }

  const parsedUsername = usernameSchema.safeParse(candidate.trim())

  if (!parsedUsername.success) {
    return { status: 'invalid' }
  }

  const usernameIdentityKey = normalizeUsernameForIdentity(parsedUsername.data)

  const [activeUsers, reservations] = await Promise.all([
    database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.usernameIdentityKey, usernameIdentityKey))
      .limit(1),
    database
      .select({ userId: usernameChangeRecords.userId })
      .from(usernameChangeRecords)
      .where(
        and(
          eq(
            usernameChangeRecords.previousUsernameIdentityKey,
            usernameIdentityKey,
          ),
          sql`${usernameChangeRecords.previousUsernameReservedUntil} > clock_timestamp()`,
        ),
      )
      .limit(1),
  ])

  return activeUsers.length > 0 || reservations.length > 0
    ? { status: 'unavailable' }
    : { status: 'available' }
}

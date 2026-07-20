import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { UsernameAvailability } from '@/features/identity/domain/username-availability'
import {
  normalizeUsernameForIdentity,
  usernameSchema,
} from '@/features/identity/domain/username'
import { users } from '@/server/database/schema'

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

  const matches = await database
    .select({ id: users.id })
    .from(users)
    .where(eq(users.usernameIdentityKey, usernameIdentityKey))
    .limit(1)

  return matches.length > 0
    ? { status: 'unavailable' }
    : { status: 'available' }
}

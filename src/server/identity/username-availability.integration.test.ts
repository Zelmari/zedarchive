import { randomUUID } from 'node:crypto'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readDatabaseTestEnvironment } from '@/config/database-environment'
import { users } from '@/server/database/schema'
import {
  checkUsernameAvailability,
  usernameAvailabilityInputMaximumCodeUnits,
} from '@/server/identity/username-availability'
import { assertSafeTestDatabaseName } from '@/test/database/global-setup'

const uniqueViolation = '23505'

const { databaseTestUrl } = readDatabaseTestEnvironment()
const pool = new Pool({ connectionString: databaseTestUrl })
const database = drizzle({ client: pool })

type NewUser = typeof users.$inferInsert

async function insertUser(overrides: Partial<NewUser> = {}) {
  const [user] = await database
    .insert(users)
    .values({
      username: 'MediaFan',
      usernameIdentityKey: 'mediafan',
      email: `${randomUUID()}@example.com`,
      ...overrides,
    })
    .returning()

  if (!user) {
    throw new Error('Expected the inserted user to be returned')
  }

  return user
}

beforeAll(async () => {
  const result = await pool.query<{ databaseName: string }>(
    'select current_database() as "databaseName"',
  )

  assertSafeTestDatabaseName(result.rows[0]?.databaseName)
})

beforeEach(async () => {
  await pool.query(`
    truncate table
      rate_limits,
      verifications,
      sessions,
      accounts,
      users
    restart identity cascade
  `)
})

afterAll(async () => {
  await pool.end()
})

describe('checkUsernameAvailability', () => {
  it('reports a free valid username as available', async () => {
    await expect(
      checkUsernameAvailability(database, 'FreeName'),
    ).resolves.toEqual({ status: 'available' })
  })

  it('reports a stored username as unavailable', async () => {
    await insertUser()

    await expect(
      checkUsernameAvailability(database, 'MediaFan'),
    ).resolves.toEqual({ status: 'unavailable' })
  })

  it('treats capitalization variants as one identity', async () => {
    await insertUser({
      username: 'MediaFan',
      usernameIdentityKey: 'mediafan',
    })

    await expect(
      checkUsernameAvailability(database, 'mediafan'),
    ).resolves.toEqual({ status: 'unavailable' })
    await expect(
      checkUsernameAvailability(database, 'MEDIAFAN'),
    ).resolves.toEqual({ status: 'unavailable' })
    await expect(
      checkUsernameAvailability(database, 'MediaFan'),
    ).resolves.toEqual({ status: 'unavailable' })
  })

  it('keeps hyphen and underscore identities distinct', async () => {
    await insertUser({
      username: 'user-name',
      usernameIdentityKey: 'user-name',
    })

    await expect(
      checkUsernameAvailability(database, 'user-name'),
    ).resolves.toEqual({ status: 'unavailable' })
    await expect(
      checkUsernameAvailability(database, 'user_name'),
    ).resolves.toEqual({ status: 'available' })
  })

  it('applies the same form-boundary trim as registration', async () => {
    await insertUser()

    await expect(
      checkUsernameAvailability(database, '  MediaFan  '),
    ).resolves.toEqual({ status: 'unavailable' })
    await expect(
      checkUsernameAvailability(database, '  FreeName  '),
    ).resolves.toEqual({ status: 'available' })
  })

  it.each([
    ['non-string', 123],
    ['empty', ''],
    ['whitespace only', '   '],
    ['too short', 'ab'],
    ['too long', 'a'.repeat(21)],
    ['invalid characters', 'user.name'],
    ['leading separator', '-username'],
    ['restricted term', 'admin'],
    [
      'exact prebound overflow',
      'a'.repeat(usernameAvailabilityInputMaximumCodeUnits + 1),
    ],
  ])(
    'returns invalid for %s without exposing a reason',
    async (_, candidate) => {
      await expect(
        checkUsernameAvailability(database, candidate),
      ).resolves.toEqual({ status: 'invalid' })
    },
  )

  it('returns only the allowlisted availability status', async () => {
    await insertUser()

    const result = await checkUsernameAvailability(database, 'MediaFan')

    expect(Object.keys(result)).toEqual(['status'])
    expect(result).toEqual({ status: 'unavailable' })
    expect(result).not.toHaveProperty('id')
    expect(result).not.toHaveProperty('username')
    expect(result).not.toHaveProperty('usernameIdentityKey')
    expect(result).not.toHaveProperty('email')
  })

  it('keeps the unique index authoritative after a later insert', async () => {
    await expect(
      checkUsernameAvailability(database, 'RaceName'),
    ).resolves.toEqual({ status: 'available' })

    await insertUser({
      username: 'RaceName',
      usernameIdentityKey: 'racename',
    })

    await expect(
      database.insert(users).values({
        username: 'racename',
        usernameIdentityKey: 'racename',
        email: `${randomUUID()}@example.com`,
      }),
    ).rejects.toMatchObject({
      cause: {
        code: uniqueViolation,
        constraint: 'users_username_identity_key_key',
      },
    })

    await expect(
      checkUsernameAvailability(database, 'RaceName'),
    ).resolves.toEqual({ status: 'unavailable' })
  })
})

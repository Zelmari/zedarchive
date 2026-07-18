import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readDatabaseTestEnvironment } from '@/config/database-environment'
import {
  accounts,
  rateLimits,
  sessions,
  users,
  verifications,
} from '@/server/database/schema'
import { assertSafeTestDatabaseName } from '@/test/database/global-setup'

const checkViolation = '23514'
const foreignKeyViolation = '23503'
const uniqueViolation = '23505'

const authTableNames = [
  'accounts',
  'rate_limits',
  'sessions',
  'users',
  'verifications',
] as const

const { databaseTestUrl } = readDatabaseTestEnvironment()
const pool = new Pool({ connectionString: databaseTestUrl })
const database = drizzle({ client: pool })

type NewUser = typeof users.$inferInsert

const defaultUser = {
  username: 'Zelmari',
  usernameIdentityKey: 'zelmari',
  email: 'zel@example.com',
} satisfies NewUser

async function insertUser(overrides: Partial<NewUser> = {}) {
  const [user] = await database
    .insert(users)
    .values({ ...defaultUser, ...overrides })
    .returning()

  if (!user) {
    throw new Error('Expected the inserted user to be returned')
  }

  return user
}

async function expectConstraintViolation(
  operation: () => PromiseLike<unknown>,
  code: string,
  constraint?: string,
): Promise<void> {
  let error: unknown

  try {
    await operation()
  } catch (caughtError) {
    error = caughtError
  }

  const postgresError =
    error instanceof Error && error.cause !== undefined ? error.cause : error

  expect(postgresError).toMatchObject(
    constraint === undefined ? { code } : { code, constraint },
  )
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

describe('auth schema integration safety', () => {
  it('contains the five approved auth tables in the public schema', async () => {
    const result = await pool.query<{ tableName: string }>(
      `
        select tablename as "tableName"
        from pg_catalog.pg_tables
        where schemaname = 'public'
          and tablename = any($1::text[])
        order by tablename
      `,
      [authTableNames],
    )

    expect(result.rows.map(({ tableName }) => tableName)).toEqual([
      ...authTableNames,
    ])
  })

  it('creates the planned named constraints and lookup indexes', async () => {
    const constraintResult = await pool.query<{ constraintName: string }>(`
      select conname as "constraintName"
      from pg_catalog.pg_constraint
      where conrelid in (
        'users'::regclass,
        'sessions'::regclass,
        'accounts'::regclass,
        'verifications'::regclass,
        'rate_limits'::regclass
      )
    `)
    const indexResult = await pool.query<{ indexName: string }>(
      `
      select indexname as "indexName"
      from pg_catalog.pg_indexes
      where schemaname = 'public'
        and tablename = any($1::text[])
    `,
      [authTableNames],
    )

    expect(
      constraintResult.rows.map(({ constraintName }) => constraintName),
    ).toEqual(
      expect.arrayContaining([
        'users_pkey',
        'users_username_identity_key_key',
        'users_username_non_blank_check',
        'users_username_length_check',
        'users_username_identity_key_non_blank_check',
        'users_username_identity_key_length_check',
        'users_username_identity_key_matches_username_check',
        'users_email_non_blank_check',
        'users_timestamp_order_check',
        'sessions_pkey',
        'sessions_user_id_fkey',
        'sessions_token_key',
        'sessions_token_non_blank_check',
        'sessions_timestamp_order_check',
        'accounts_pkey',
        'accounts_user_id_fkey',
        'accounts_provider_id_account_id_key',
        'accounts_account_id_non_blank_check',
        'accounts_provider_id_non_blank_check',
        'accounts_timestamp_order_check',
        'verifications_pkey',
        'verifications_identifier_non_blank_check',
        'verifications_value_non_blank_check',
        'verifications_timestamp_order_check',
        'rate_limits_pkey',
        'rate_limits_key_key',
        'rate_limits_key_non_blank_check',
        'rate_limits_count_non_negative_check',
      ]),
    )
    expect(indexResult.rows.map(({ indexName }) => indexName)).toEqual(
      expect.arrayContaining([
        'users_email_lower_uidx',
        'sessions_user_id_idx',
        'sessions_expires_at_idx',
        'accounts_user_id_idx',
        'verifications_identifier_idx',
        'verifications_expires_at_idx',
      ]),
    )
  })
})

describe('users', () => {
  it('generates a UUID identity and safe database defaults', async () => {
    const user = await insertUser()

    expect(user.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
    expect(user.emailVerified).toBe(false)
    expect(user.image).toBeNull()
    expect(user.createdAt).toBeInstanceOf(Date)
    expect(user.updatedAt).toBeInstanceOf(Date)
    expect(user.username).toBe('Zelmari')
    expect(user.usernameIdentityKey).toBe('zelmari')
  })

  it('rejects a username identity key that does not match lower(username)', async () => {
    await expectConstraintViolation(
      () =>
        insertUser({
          username: 'Zelmari',
          usernameIdentityKey: 'Zelmari',
        }),
      checkViolation,
      'users_username_identity_key_matches_username_check',
    )
  })

  it('rejects case-variant username identity collisions', async () => {
    await insertUser({
      username: 'Zelmari',
      usernameIdentityKey: 'zelmari',
      email: 'first@example.com',
    })

    await expectConstraintViolation(
      () =>
        insertUser({
          username: 'zelmari',
          usernameIdentityKey: 'zelmari',
          email: 'second@example.com',
        }),
      uniqueViolation,
      'users_username_identity_key_key',
    )
  })

  it('rejects case-variant email collisions through the lower(email) unique index', async () => {
    await insertUser({
      email: 'Person@Example.com',
    })

    await expectConstraintViolation(
      () =>
        insertUser({
          username: 'OtherUser',
          usernameIdentityKey: 'otheruser',
          email: 'person@example.com',
        }),
      uniqueViolation,
      'users_email_lower_uidx',
    )
  })

  it('rejects blank usernames and emails', async () => {
    await expectConstraintViolation(
      () =>
        insertUser({
          username: ' \n\t ',
          usernameIdentityKey: 'zelmari',
        }),
      checkViolation,
    )
    await expectConstraintViolation(
      () =>
        insertUser({
          email: ' \n\t ',
        }),
      checkViolation,
      'users_email_non_blank_check',
    )
  })

  it('rejects usernames outside the 3-20 character boundary', async () => {
    await expectConstraintViolation(
      () =>
        insertUser({
          username: 'ab',
          usernameIdentityKey: 'ab',
        }),
      checkViolation,
    )
    await expectConstraintViolation(
      () =>
        insertUser({
          username: 'a'.repeat(21),
          usernameIdentityKey: 'a'.repeat(21),
        }),
      checkViolation,
    )
  })

  it('rejects an updated timestamp before the created timestamp', async () => {
    await expectConstraintViolation(
      () =>
        insertUser({
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      checkViolation,
      'users_timestamp_order_check',
    )
  })
})

describe('sessions', () => {
  it('stores a session for a user and enforces unique tokens', async () => {
    const user = await insertUser()
    const expiresAt = new Date('2026-08-01T00:00:00.000Z')

    await database.insert(sessions).values({
      userId: user.id,
      token: 'session-token-1',
      expiresAt,
    })

    await expectConstraintViolation(
      () =>
        database
          .insert(sessions)
          .values({
            userId: user.id,
            token: 'session-token-1',
            expiresAt,
          })
          .execute(),
      uniqueViolation,
      'sessions_token_key',
    )
  })

  it('rejects a missing parent and cascades user deletion', async () => {
    await expectConstraintViolation(
      () =>
        database
          .insert(sessions)
          .values({
            userId: randomUUID(),
            token: 'orphan-session',
            expiresAt: new Date('2026-08-01T00:00:00.000Z'),
          })
          .execute(),
      foreignKeyViolation,
      'sessions_user_id_fkey',
    )

    const user = await insertUser()
    await database.insert(sessions).values({
      userId: user.id,
      token: 'cascade-session',
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
    })
    await database.delete(users).where(eq(users.id, user.id))

    await expect(database.select().from(sessions)).resolves.toEqual([])
  })
})

describe('accounts', () => {
  it('stores a credential account and enforces the provider/account pair', async () => {
    const user = await insertUser()

    await database.insert(accounts).values({
      userId: user.id,
      providerId: 'credential',
      accountId: user.id,
      password: 'hashed-password-placeholder',
    })

    await expectConstraintViolation(
      () =>
        database
          .insert(accounts)
          .values({
            userId: user.id,
            providerId: 'credential',
            accountId: user.id,
          })
          .execute(),
      uniqueViolation,
      'accounts_provider_id_account_id_key',
    )
  })

  it('rejects a missing parent and cascades user deletion', async () => {
    await expectConstraintViolation(
      () =>
        database
          .insert(accounts)
          .values({
            userId: randomUUID(),
            providerId: 'credential',
            accountId: 'missing-user',
          })
          .execute(),
      foreignKeyViolation,
      'accounts_user_id_fkey',
    )

    const user = await insertUser()
    await database.insert(accounts).values({
      userId: user.id,
      providerId: 'credential',
      accountId: user.id,
    })
    await database.delete(users).where(eq(users.id, user.id))

    await expect(database.select().from(accounts)).resolves.toEqual([])
  })
})

describe('verifications and rate limits', () => {
  it('stores verification records independently of users', async () => {
    const user = await insertUser()
    const expiresAt = new Date('2026-08-01T00:00:00.000Z')

    await database.insert(verifications).values({
      identifier: 'person@example.com',
      value: 'verification-token',
      expiresAt,
    })

    await database.delete(users).where(eq(users.id, user.id))

    const rows = await database.select().from(verifications)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      identifier: 'person@example.com',
      value: 'verification-token',
    })
  })

  it('stores rate-limit counters independently of users', async () => {
    const user = await insertUser()

    await database.insert(rateLimits).values({
      key: 'sign-in:127.0.0.1',
      count: 1,
      lastRequest: Date.now(),
    })

    await database.delete(users).where(eq(users.id, user.id))

    const rows = await database.select().from(rateLimits)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      key: 'sign-in:127.0.0.1',
      count: 1,
    })
  })

  it('rejects duplicate rate-limit keys and negative counts', async () => {
    await database.insert(rateLimits).values({
      key: 'sign-in:127.0.0.1',
      count: 1,
      lastRequest: Date.now(),
    })

    await expectConstraintViolation(
      () =>
        database
          .insert(rateLimits)
          .values({
            key: 'sign-in:127.0.0.1',
            count: 2,
            lastRequest: Date.now(),
          })
          .execute(),
      uniqueViolation,
      'rate_limits_key_key',
    )
    await expectConstraintViolation(
      () =>
        database
          .insert(rateLimits)
          .values({
            key: 'sign-in:127.0.0.2',
            count: -1,
            lastRequest: Date.now(),
          })
          .execute(),
      checkViolation,
      'rate_limits_count_non_negative_check',
    )
  })
})

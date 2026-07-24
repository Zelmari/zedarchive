import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

vi.mock('server-only', () => ({}))

import { readDatabaseTestEnvironment } from '@/config/database-environment'
import { userCataloguePreferences, users } from '@/server/database/schema'
import {
  disableUserAdultContent,
  enableUserAdultContent,
  lockAdultContentPreferenceForShare,
  readUserCataloguePreferences,
  setUserAnimeTitleLanguage,
} from '@/server/database/user-catalogue-preferences-service'
import { assertSafeTestDatabaseName } from '@/test/database/global-setup'

const { databaseTestUrl } = readDatabaseTestEnvironment()
const pool = new Pool({ connectionString: databaseTestUrl })
const database = drizzle({ client: pool })

async function insertUser() {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const [user] = await database
    .insert(users)
    .values({
      username: `User${suffix}`,
      usernameIdentityKey: `user${suffix}`,
      email: `${randomUUID()}@example.test`,
    })
    .returning()

  if (user === undefined) throw new Error('Expected user fixture')
  return user
}

async function readStoredPreferences(userId: string) {
  const [preferences] = await database
    .select()
    .from(userCataloguePreferences)
    .where(eq(userCataloguePreferences.userId, userId))
  return preferences
}

async function expectConstraintViolation(
  operation: () => PromiseLike<unknown>,
  code: string,
  constraint: string,
) {
  let error: unknown

  try {
    await operation()
  } catch (caughtError) {
    error = caughtError
  }

  const postgresError =
    error instanceof Error && error.cause !== undefined ? error.cause : error

  expect(postgresError).toMatchObject({ code, constraint })
}

async function waitForDatabaseLock(pid: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await pool.query<{ waiting: boolean }>(
      `select coalesce(
        (select wait_event_type = 'Lock' from pg_stat_activity where pid = $1),
        false
      ) as waiting`,
      [pid],
    )

    if (result.rows[0]?.waiting === true) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }

  throw new Error('Expected preference upsert to wait on the first insert')
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
      user_catalogue_preferences,
      anime_entries,
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

describe('user catalogue preference schema and service', () => {
  it('maps a missing row to the safe default without provisioning one', async () => {
    const user = await insertUser()

    await expect(
      readUserCataloguePreferences(database, { userId: user.id }),
    ).resolves.toEqual({
      titleLanguage: 'english',
      adultContentEnabled: false,
    })
    expect(await readStoredPreferences(user.id)).toBeUndefined()
  })

  it('creates a row lazily with database defaults and reads every preference', async () => {
    const user = await insertUser()

    await expect(
      setUserAnimeTitleLanguage(database, {
        userId: user.id,
        titleLanguage: 'romaji',
      }),
    ).resolves.toEqual({ kind: 'updated' })

    const stored = await readStoredPreferences(user.id)
    expect(stored).toMatchObject({
      userId: user.id,
      titleLanguage: 'romaji',
      adultContentEnabled: false,
    })
    expect(stored?.createdAt).toBeInstanceOf(Date)
    expect(stored?.updatedAt).toBeInstanceOf(Date)
    await expect(
      readUserCataloguePreferences(database, { userId: user.id }),
    ).resolves.toEqual({
      titleLanguage: 'romaji',
      adultContentEnabled: false,
    })
  })

  it('changes only the targeted field and preserves timestamps on no-ops', async () => {
    const user = await insertUser()
    await setUserAnimeTitleLanguage(database, {
      userId: user.id,
      titleLanguage: 'original',
    })
    const afterTitle = await readStoredPreferences(user.id)

    await expect(
      setUserAnimeTitleLanguage(database, {
        userId: user.id,
        titleLanguage: 'original',
      }),
    ).resolves.toEqual({ kind: 'unchanged' })
    expect(await readStoredPreferences(user.id)).toEqual(afterTitle)

    await expect(
      enableUserAdultContent(database, { userId: user.id }),
    ).resolves.toEqual({ kind: 'updated' })
    const afterEnable = await readStoredPreferences(user.id)
    expect(afterEnable).toMatchObject({
      titleLanguage: 'original',
      adultContentEnabled: true,
      createdAt: afterTitle?.createdAt,
    })
    expect(afterEnable!.updatedAt.getTime()).toBeGreaterThanOrEqual(
      afterTitle!.updatedAt.getTime(),
    )

    await expect(
      enableUserAdultContent(database, { userId: user.id }),
    ).resolves.toEqual({ kind: 'unchanged' })
    expect(await readStoredPreferences(user.id)).toEqual(afterEnable)

    await expect(
      disableUserAdultContent(database, { userId: user.id }),
    ).resolves.toEqual({ kind: 'updated' })
    expect(await readStoredPreferences(user.id)).toMatchObject({
      titleLanguage: 'original',
      adultContentEnabled: false,
      createdAt: afterTitle?.createdAt,
    })
  })

  it('treats disable with no row or an already-disabled row as unchanged', async () => {
    const user = await insertUser()

    await expect(
      disableUserAdultContent(database, { userId: user.id }),
    ).resolves.toEqual({ kind: 'unchanged' })
    expect(await readStoredPreferences(user.id)).toBeUndefined()

    await setUserAnimeTitleLanguage(database, {
      userId: user.id,
      titleLanguage: 'english',
    })
    const before = await readStoredPreferences(user.id)
    await expect(
      disableUserAdultContent(database, { userId: user.id }),
    ).resolves.toEqual({ kind: 'unchanged' })
    expect(await readStoredPreferences(user.id)).toEqual(before)
  })

  it('preserves both fields during concurrent first writes', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const user = await insertUser()

      const [titleResult, adultResult] = await Promise.all([
        setUserAnimeTitleLanguage(database, {
          userId: user.id,
          titleLanguage: 'romaji',
        }),
        enableUserAdultContent(database, { userId: user.id }),
      ])

      expect(titleResult).toEqual({ kind: 'updated' })
      expect(adultResult).toEqual({ kind: 'updated' })
      await expect(
        readUserCataloguePreferences(database, { userId: user.id }),
      ).resolves.toEqual({
        titleLanguage: 'romaji',
        adultContentEnabled: true,
      })
    }
  })

  it('keeps updated_at monotonic when an older transaction waits on a newer first insert', async () => {
    const user = await insertUser()
    const olderClient = await pool.connect()
    const newerClient = await pool.connect()
    const olderDatabase = drizzle({ client: olderClient })
    const newerDatabase = drizzle({ client: newerClient })

    try {
      await olderClient.query('begin')
      const olderTimeResult = await olderClient.query<{
        startedAt: Date
        backendPid: number
      }>(
        'select current_timestamp as "startedAt", pg_backend_pid() as "backendPid"',
      )
      const olderStartedAt = olderTimeResult.rows[0]?.startedAt
      const olderBackendPid = olderTimeResult.rows[0]?.backendPid

      if (olderStartedAt === undefined || olderBackendPid === undefined) {
        throw new Error('Expected older transaction identity and timestamp')
      }

      await new Promise((resolve) => setTimeout(resolve, 10))
      await newerClient.query('begin')
      await newerDatabase.insert(userCataloguePreferences).values({
        userId: user.id,
        adultContentEnabled: true,
      })

      const waitingUpsert = setUserAnimeTitleLanguage(olderDatabase, {
        userId: user.id,
        titleLanguage: 'romaji',
      })

      await waitForDatabaseLock(olderBackendPid)
      await newerClient.query('commit')
      await expect(waitingUpsert).resolves.toEqual({ kind: 'updated' })
      await olderClient.query('commit')

      const stored = await readStoredPreferences(user.id)
      expect(stored).toMatchObject({
        titleLanguage: 'romaji',
        adultContentEnabled: true,
      })
      expect(stored!.createdAt.getTime()).toBeGreaterThan(
        olderStartedAt.getTime(),
      )
      expect(stored!.updatedAt.getTime()).toBeGreaterThanOrEqual(
        stored!.createdAt.getTime(),
      )
    } finally {
      await olderClient.query('rollback').catch(() => undefined)
      await newerClient.query('rollback').catch(() => undefined)
      olderClient.release()
      newerClient.release()
    }
  })

  it('allows the composable reader and FOR SHARE helper inside a transaction', async () => {
    const user = await insertUser()
    await enableUserAdultContent(database, { userId: user.id })

    await database.transaction(
      async (transaction) => {
        await expect(
          readUserCataloguePreferences(transaction, { userId: user.id }),
        ).resolves.toEqual({
          titleLanguage: 'english',
          adultContentEnabled: true,
        })
        await expect(
          lockAdultContentPreferenceForShare(transaction, user.id),
        ).resolves.toBe(true)
      },
      { isolationLevel: 'repeatable read' },
    )

    const userWithoutPreferences = await insertUser()
    await database.transaction(async (transaction) => {
      await expect(
        lockAdultContentPreferenceForShare(
          transaction,
          userWithoutPreferences.id,
        ),
      ).resolves.toBe(false)
    })
  })

  it('enforces its enum, timestamp, one-row, foreign-key, and cascade constraints', async () => {
    const user = await insertUser()

    await expectConstraintViolation(
      () =>
        pool.query(
          "insert into user_catalogue_preferences (user_id, title_language) values ($1, 'japanese')",
          [user.id],
        ),
      '23514',
      'user_catalogue_preferences_title_language_check',
    )
    await expectConstraintViolation(
      () =>
        database.insert(userCataloguePreferences).values({
          userId: user.id,
          createdAt: new Date('2025-01-02T00:00:00.000Z'),
          updatedAt: new Date('2025-01-01T00:00:00.000Z'),
        }),
      '23514',
      'user_catalogue_preferences_timestamp_order_check',
    )
    await expectConstraintViolation(
      () =>
        database
          .insert(userCataloguePreferences)
          .values({ userId: randomUUID() }),
      '23503',
      'user_catalogue_preferences_user_id_fkey',
    )

    await database.insert(userCataloguePreferences).values({ userId: user.id })
    await expectConstraintViolation(
      () =>
        database.insert(userCataloguePreferences).values({ userId: user.id }),
      '23505',
      'user_catalogue_preferences_pkey',
    )

    await database.delete(users).where(eq(users.id, user.id))
    expect(await readStoredPreferences(user.id)).toBeUndefined()
  })
})

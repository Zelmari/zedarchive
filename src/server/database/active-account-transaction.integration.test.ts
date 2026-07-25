import { randomUUID } from 'node:crypto'
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
import { establishActiveAccount } from '@/server/database/active-account-transaction'
import { users } from '@/server/database/schema'
import { assertSafeTestDatabaseName } from '@/test/database/global-setup'

const { databaseTestUrl } = readDatabaseTestEnvironment()
const pool = new Pool({ connectionString: databaseTestUrl })
const database = drizzle({ client: pool })

async function insertUser() {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const [user] = await database
    .insert(users)
    .values({
      username: `Barrier${suffix}`,
      usernameIdentityKey: `barrier${suffix}`,
      email: `${randomUUID()}@example.test`,
    })
    .returning()
  if (user === undefined) throw new Error('Expected active barrier user')
  return user
}

async function waitForLock(pid: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await pool.query<{ waiting: boolean }>(
      `select coalesce(
        (
          select wait_event_type = 'Lock'
          from pg_stat_activity
          where pid = $1
        ),
        false
      ) as waiting`,
      [pid],
    )
    if (result.rows[0]?.waiting) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('Expected account lifecycle lock wait')
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

describe('active account transaction barrier', () => {
  it('waits behind lifecycle FOR UPDATE and observes the committed request in its fresh second statement', async () => {
    const user = await insertUser()
    const lifecycleClient = await pool.connect()
    const activeClient = await pool.connect()
    try {
      await lifecycleClient.query('begin')
      await lifecycleClient.query(
        'select id from users where id = $1 for update',
        [user.id],
      )
      const activePid = await activeClient.query<{ pid: number }>(
        'select pg_backend_pid() as pid',
      )
      await activeClient.query('begin isolation level read committed')
      const activeDatabase = drizzle({ client: activeClient })
      const activeResult = establishActiveAccount(activeDatabase, user.id)
      await waitForLock(activePid.rows[0]!.pid)

      await lifecycleClient.query(
        `with lifecycle_clock as (
          select clock_timestamp() as requested_at
        )
        insert into account_deletion_requests
          (user_id, requested_at, purge_after)
        select $1, requested_at, requested_at + interval '14 days'
        from lifecycle_clock`,
        [user.id],
      )
      await lifecycleClient.query('commit')

      await expect(activeResult).resolves.toBe(false)
      await activeClient.query('commit')
    } finally {
      await lifecycleClient.query('rollback').catch(() => undefined)
      await activeClient.query('rollback').catch(() => undefined)
      lifecycleClient.release()
      activeClient.release()
    }
  })

  it('allows an already-authorized operation to finish before a lifecycle request acquires FOR UPDATE', async () => {
    const user = await insertUser()
    const activeClient = await pool.connect()
    const lifecycleClient = await pool.connect()
    try {
      await activeClient.query('begin isolation level read committed')
      const activeDatabase = drizzle({ client: activeClient })
      await expect(
        establishActiveAccount(activeDatabase, user.id),
      ).resolves.toBe(true)

      const lifecyclePid = await lifecycleClient.query<{ pid: number }>(
        'select pg_backend_pid() as pid',
      )
      await lifecycleClient.query('begin')
      const lifecycleLock = lifecycleClient.query(
        'select id from users where id = $1 for update',
        [user.id],
      )
      await waitForLock(lifecyclePid.rows[0]!.pid)

      await activeClient.query('commit')
      await lifecycleLock
      await lifecycleClient.query('rollback')
    } finally {
      await activeClient.query('rollback').catch(() => undefined)
      await lifecycleClient.query('rollback').catch(() => undefined)
      activeClient.release()
      lifecycleClient.release()
    }
  })
})

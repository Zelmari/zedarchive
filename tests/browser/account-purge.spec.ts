import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import 'dotenv/config'
import { Pool } from 'pg'
import { readDatabaseRuntimeEnvironment } from '../../src/config/database-environment'

test.use({ screenshot: 'off', trace: 'off' })
test.describe.configure({ mode: 'serial' })

const fixturePrefix = `m34-browser-${randomUUID()}`
const purgeSecret = 'm34-browser-disposable-cron-secret-32chars'
const { databaseUrl } = readDatabaseRuntimeEnvironment()
const pool = new Pool({ connectionString: databaseUrl })
let dueUserId = ''
let controlUserId = ''
let catalogueItemId = ''
let heartbeatBefore: Record<string, unknown> | undefined

test.skip(
  process.env.CI !== 'true',
  'Account purge browser verification requires the isolated CI test database',
)

function assertAllowedFixtureDatabase(name: string | undefined): void {
  if (name !== 'zedarchive_test') {
    throw new Error('Account-purge browser fixtures require zedarchive_test')
  }
}

async function fixtureCounts() {
  const result = await pool.query<{
    dueUsers: number
    controlUsers: number
    entries: number
    catalogue: number
    rateLimits: number
  }>(
    `select
       (select count(*)::int from users where id = $1) as "dueUsers",
       (select count(*)::int from users where id = $2) as "controlUsers",
       (select count(*)::int from anime_entries where user_id in ($1, $2)) as entries,
       (select count(*)::int from anime_catalogue_items where id = $3) as catalogue,
       (select count(*)::int from rate_limits where key = $4) as "rateLimits"`,
    [dueUserId, controlUserId, catalogueItemId, `${fixturePrefix}-rate-limit`],
  )
  return result.rows[0]
}

test.beforeAll(async () => {
  const target = await pool.query<{ name: string }>(
    'select current_database() as name',
  )
  assertAllowedFixtureDatabase(target.rows[0]?.name)
  const heartbeat = await pool.query<Record<string, unknown>>(
    'select * from account_purge_run_heartbeats where singleton = true',
  )
  heartbeatBefore = heartbeat.rows[0]
  if (heartbeatBefore === undefined) throw new Error('Missing purge heartbeat')
  dueUserId = randomUUID()
  controlUserId = randomUUID()
  catalogueItemId = randomUUID()
  const requestedAt = new Date(Date.now() - 336 * 60 * 60 * 1_000 - 1_000)
  const purgeAfter = new Date(requestedAt.getTime() + 336 * 60 * 60 * 1_000)
  await pool.query(
    `insert into users (id, username, username_identity_key, email)
     values
       ($1, $2, lower($2), $3),
       ($4, $5, lower($5), $6)`,
    [
      dueUserId,
      `M34D${randomUUID().replaceAll('-', '').slice(0, 12)}`,
      `${fixturePrefix}-due@example.test`,
      controlUserId,
      `M34C${randomUUID().replaceAll('-', '').slice(0, 12)}`,
      `${fixturePrefix}-control@example.test`,
    ],
  )
  await pool.query(
    `insert into account_deletion_requests (user_id, requested_at, purge_after)
     values ($1, $2, $3)`,
    [dueUserId, requestedAt, purgeAfter],
  )
  await pool.query(
    `insert into anime_catalogue_items
       (id, english_title, format, release_status, maturity, catalogue_state)
     values ($1, 'M34 Browser Catalogue', 'tv', 'finished', 'safe', 'published')`,
    [catalogueItemId],
  )
  await pool.query(
    `insert into anime_entries (id, user_id, catalogue_item_id, status)
     values ($1, $2, $3, 'planned'), ($4, $5, $3, 'planned')`,
    [randomUUID(), dueUserId, catalogueItemId, randomUUID(), controlUserId],
  )
  await pool.query(
    `insert into rate_limits (id, key, count, last_request)
     values ($1, $2, 1, 1)`,
    [randomUUID(), `${fixturePrefix}-rate-limit`],
  )
})

test.afterAll(async () => {
  try {
    const target = await pool.query<{ name: string }>(
      'select current_database() as name',
    )
    assertAllowedFixtureDatabase(target.rows[0]?.name)
    await pool.query('delete from users where id = any($1::uuid[])', [
      [dueUserId, controlUserId],
    ])
    await pool.query('delete from anime_catalogue_items where id = $1', [
      catalogueItemId,
    ])
    await pool.query('delete from rate_limits where key = $1', [
      `${fixturePrefix}-rate-limit`,
    ])
    if (heartbeatBefore !== undefined) {
      await pool.query(
        `update account_purge_run_heartbeats
           set run_id = $1::uuid,
               revision = $2::bigint,
               started_at = $3::timestamptz,
               completed_at = $4::timestamptz,
               result_category = $5,
               examined_count = $6,
               purged_count = $7,
               skipped_count = $8,
               failed_count = $9
         where singleton = true`,
        [
          heartbeatBefore.run_id,
          heartbeatBefore.revision,
          heartbeatBefore.started_at,
          heartbeatBefore.completed_at,
          heartbeatBefore.result_category,
          heartbeatBefore.examined_count,
          heartbeatBefore.purged_count,
          heartbeatBefore.skipped_count,
          heartbeatBefore.failed_count,
        ],
      )
    }
    expect(await fixtureCounts()).toEqual({
      dueUsers: 0,
      controlUsers: 0,
      entries: 0,
      catalogue: 0,
      rateLimits: 0,
    })
  } finally {
    await pool.end()
  }
})

test('purges only the due fixture through the production route and returns aggregates only', async ({
  request,
}) => {
  const unauthorized = await request.get('/api/internal/account-purge')
  expect(unauthorized.status()).toBe(401)

  const response = await request.get('/api/internal/account-purge', {
    headers: { authorization: `Bearer ${purgeSecret}` },
  })
  const body = await response.json()
  expect(response.status()).toBe(200)
  expect(response.headers()['cache-control']).toBe(
    'private, no-store, max-age=0',
  )
  expect(response.headers()['x-content-type-options']).toBe('nosniff')
  expect(body).toEqual({
    result: 'completed',
    examinedCount: 1,
    purgedCount: 1,
    skippedCount: 0,
    failedCount: 0,
  })
  expect(JSON.stringify(body)).not.toMatch(/user|email|username|secret|error/iu)
  expect(await fixtureCounts()).toEqual({
    dueUsers: 0,
    controlUsers: 1,
    entries: 1,
    catalogue: 1,
    rateLimits: 1,
  })
})

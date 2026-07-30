import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import 'dotenv/config'
import { Pool } from 'pg'
import {
  invokeAccountPurge,
  invokeUnauthorizedAccountPurge,
} from './purge-response-auditor'

const databaseUrl = exactTestDatabaseUrl()
const pool = new Pool({ connectionString: databaseUrl })
const marker = randomUUID().replaceAll('-', '')
const fixture = {
  catalogueItemId: randomUUID(),
  dueUserId: randomUUID(),
  rateLimitKey: `m42-account-purge-${marker}`,
  controlUserId: randomUUID(),
} as const
let heartbeatBefore: Heartbeat | undefined
let heartbeatMayHaveChanged = false

type Heartbeat = Readonly<{
  completedAt: string | null
  examinedCount: number
  failedCount: number
  purgedCount: number
  resultCategory: string
  revision: string
  runId: string
  skippedCount: number
  startedAt: string | null
}>

function exactTestDatabaseUrl() {
  const value = process.env.DATABASE_TEST_URL
  if (value === undefined || value.trim() === '' || value !== value.trim()) {
    throw new TypeError('M42 account-purge operational URL is unavailable')
  }
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new TypeError('M42 account-purge operational target is not allowed')
  }
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    parsed.pathname.slice(1) !== 'zedarchive_test' ||
    process.env.ACCOUNT_PURGE_ENABLED !== 'true'
  ) {
    throw new TypeError('M42 account-purge operational target is not allowed')
  }
  return value
}

async function guardDatabase() {
  const result = await pool.query<{ name: string }>(
    'select current_database() as name',
  )
  if (result.rows[0]?.name !== 'zedarchive_test') {
    throw new TypeError('M42 account-purge database is not allowed')
  }
}

async function fixtureCounts() {
  const result = await pool.query<{
    catalogue: number
    controlUsers: number
    dueUsers: number
    entries: number
    rateLimits: number
  }>(
    `select
      (select count(*)::int from users where id = $1::uuid) as "dueUsers",
      (select count(*)::int from users where id = $2::uuid) as "controlUsers",
      (select count(*)::int from anime_entries where user_id in ($1::uuid, $2::uuid)) as entries,
      (select count(*)::int from anime_catalogue_items where id = $3::uuid) as catalogue,
      (select count(*)::int from rate_limits where key = $4) as "rateLimits"`,
    [
      fixture.dueUserId,
      fixture.controlUserId,
      fixture.catalogueItemId,
      fixture.rateLimitKey,
    ],
  )
  return result.rows[0]
}

async function readHeartbeat(): Promise<Heartbeat> {
  const result = await pool.query<Heartbeat>(
    `select run_id::text as "runId", revision::text as revision,
            started_at::text as "startedAt", completed_at::text as "completedAt",
            result_category as "resultCategory", examined_count as "examinedCount",
            purged_count as "purgedCount", skipped_count as "skippedCount",
            failed_count as "failedCount"
       from account_purge_run_heartbeats where singleton = true`,
  )
  const heartbeat = result.rows[0]
  if (heartbeat === undefined)
    throw new TypeError('M42 account-purge heartbeat missing')
  return heartbeat
}

test.beforeAll(async () => {
  await guardDatabase()
  heartbeatBefore = await readHeartbeat()
  await pool.query(
    `insert into users (id, username, username_identity_key, email)
     values ($1::uuid, $2, lower($2), $3), ($4::uuid, $5, lower($5), $6)`,
    [
      fixture.dueUserId,
      `M42PD${marker.slice(0, 12)}`,
      `m42-purge-${marker}-due@example.test`,
      fixture.controlUserId,
      `M42PC${marker.slice(0, 12)}`,
      `m42-purge-${marker}-control@example.test`,
    ],
  )
  await pool.query(
    `insert into account_deletion_requests (user_id, requested_at, purge_after)
     values ($1::uuid, clock_timestamp() - interval '336 hours 1 second', clock_timestamp() - interval '1 second')`,
    [fixture.dueUserId],
  )
  await pool.query(
    `insert into anime_catalogue_items
      (id, english_title, format, release_status, maturity, catalogue_state)
     values ($1::uuid, $2, 'tv', 'finished', 'safe', 'published')`,
    [fixture.catalogueItemId, `M42 purge ${marker}`],
  )
  await pool.query(
    `insert into anime_entries (id, user_id, catalogue_item_id, status)
     values ($1::uuid, $2::uuid, $4::uuid, 'planned'), ($3::uuid, $5::uuid, $4::uuid, 'planned')`,
    [
      randomUUID(),
      fixture.dueUserId,
      randomUUID(),
      fixture.catalogueItemId,
      fixture.controlUserId,
    ],
  )
  await pool.query(
    `insert into rate_limits (id, key, count, last_request)
     values ($1::uuid, $2, 1, 1)`,
    [randomUUID(), fixture.rateLimitKey],
  )
})

test.afterAll(async () => {
  try {
    await guardDatabase()
    await pool.query('delete from users where id = any($1::uuid[])', [
      [fixture.dueUserId, fixture.controlUserId],
    ])
    await pool.query('delete from anime_catalogue_items where id = $1::uuid', [
      fixture.catalogueItemId,
    ])
    await pool.query('delete from rate_limits where key = $1', [
      fixture.rateLimitKey,
    ])
    if (heartbeatMayHaveChanged) {
      const heartbeatCurrent = await readHeartbeat()
      if (heartbeatBefore === undefined)
        throw new TypeError('M42 heartbeat snapshot missing')
      const restored = await pool.query(
        `update account_purge_run_heartbeats
          set run_id = $1::uuid, revision = $2::bigint,
              started_at = $3::timestamptz, completed_at = $4::timestamptz,
              result_category = $5, examined_count = $6, purged_count = $7,
              skipped_count = $8, failed_count = $9
        where singleton = true and run_id::text = $10 and revision::text = $11
        returning singleton`,
        [
          heartbeatBefore.runId,
          heartbeatBefore.revision,
          heartbeatBefore.startedAt,
          heartbeatBefore.completedAt,
          heartbeatBefore.resultCategory,
          heartbeatBefore.examinedCount,
          heartbeatBefore.purgedCount,
          heartbeatBefore.skippedCount,
          heartbeatBefore.failedCount,
          heartbeatCurrent.runId,
          heartbeatCurrent.revision,
        ],
      )
      if (restored.rowCount !== 1)
        throw new TypeError('M42 heartbeat restore conflict')
    }
    expect(await fixtureCounts()).toEqual({
      catalogue: 0,
      controlUsers: 0,
      dueUsers: 0,
      entries: 0,
      rateLimits: 0,
    })
  } finally {
    await pool.end()
  }
})

test('account purge operational', async () => {
  const origin = 'http://127.0.0.1:3106'
  expect(await invokeUnauthorizedAccountPurge(origin)).toEqual({ status: 401 })

  heartbeatMayHaveChanged = true
  const first = await invokeAccountPurge(origin)
  expect(first).toEqual({
    aggregate: {
      examinedCount: 1,
      failedCount: 0,
      purgedCount: 1,
      result: 'completed',
      skippedCount: 0,
    },
    cachePrivateNoStore: true,
    commonSecurityPolicy: true,
    dynamicContentSecurityPolicy: true,
    jsonContentType: true,
    nosniff: true,
    status: 200,
  })
  expect(await fixtureCounts()).toEqual({
    catalogue: 1,
    controlUsers: 1,
    dueUsers: 0,
    entries: 1,
    rateLimits: 1,
  })

  const second = await invokeAccountPurge(origin)
  expect(second.aggregate).toEqual({
    examinedCount: 0,
    failedCount: 0,
    purgedCount: 0,
    result: 'completed',
    skippedCount: 0,
  })
})

import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readDatabaseTestEnvironment } from '@/config/database-environment'
import {
  accountDeletionRequests,
  deletionChallenges,
  sessions,
  users,
} from '@/server/database/schema'
import { assertSafeTestDatabaseName } from '@/test/database/global-setup'

const { databaseTestUrl } = readDatabaseTestEnvironment()
const pool = new Pool({ connectionString: databaseTestUrl })
const database = drizzle({ client: pool })

async function insertUser() {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const [user] = await database
    .insert(users)
    .values({
      username: `Life${suffix}`,
      usernameIdentityKey: `life${suffix}`,
      email: `${randomUUID()}@example.test`,
    })
    .returning()
  if (user === undefined) throw new Error('Expected lifecycle schema user')
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

describe('account lifecycle schema', () => {
  it('installs the exact constraints, generated expression, and indexes', async () => {
    const constraints = await pool.query<{ name: string }>(`
      select conname as name
      from pg_constraint
      where conrelid in (
        'account_deletion_requests'::regclass,
        'deletion_challenges'::regclass,
        'verifications'::regclass
      )
      order by conname
    `)
    const indexes = await pool.query<{
      name: string
      predicate: string | null
    }>(`
      select
        index_class.relname as name,
        pg_get_expr(index_info.indpred, index_info.indrelid) as predicate
      from pg_index as index_info
      join pg_class as index_class
        on index_class.oid = index_info.indexrelid
      where index_class.relname = any(array[
        'account_deletion_requests_purge_after_user_id_idx',
        'deletion_challenges_session_id_idx',
        'verifications_reset_owner_user_id_idx'
      ])
      order by index_class.relname
    `)
    const generated = await pool.query<{
      generated: string
      expression: string
    }>(`
      select
        information_schema.columns.is_generated as generated,
        pg_get_expr(pg_attrdef.adbin, pg_attrdef.adrelid) as expression
      from information_schema.columns
      join pg_attribute
        on pg_attribute.attrelid = 'verifications'::regclass
       and pg_attribute.attname = information_schema.columns.column_name
      join pg_attrdef
        on pg_attrdef.adrelid = pg_attribute.attrelid
       and pg_attrdef.adnum = pg_attribute.attnum
      where information_schema.columns.table_schema = 'public'
        and information_schema.columns.table_name = 'verifications'
        and information_schema.columns.column_name = 'reset_owner_user_id'
    `)

    expect(constraints.rows.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'account_deletion_requests_pkey',
        'account_deletion_requests_user_id_fkey',
        'account_deletion_requests_recovery_interval_check',
        'deletion_challenges_pkey',
        'deletion_challenges_challenge_id_key',
        'deletion_challenges_user_id_fkey',
        'deletion_challenges_session_id_fkey',
        'deletion_challenges_digest_check',
        'deletion_challenges_failed_attempts_check',
        'deletion_challenges_send_count_check',
        'deletion_challenges_expiry_check',
        'deletion_challenges_timestamp_order_check',
        'verifications_reset_owner_user_id_fkey',
      ]),
    )
    expect(indexes.rows.map(({ name }) => name)).toEqual([
      'account_deletion_requests_purge_after_user_id_idx',
      'deletion_challenges_session_id_idx',
      'verifications_reset_owner_user_id_idx',
    ])
    expect(indexes.rows.at(-1)?.predicate).toContain(
      'reset_owner_user_id IS NOT NULL',
    )
    expect(generated.rows).toHaveLength(1)
    expect(generated.rows[0]).toMatchObject({ generated: 'ALWAYS' })
    expect(generated.rows[0]?.expression).toContain('reset-password:%')
  })

  it('enforces the exact 336-hour recovery interval across daylight-saving time and cascades or detaches lifecycle rows', async () => {
    const user = await insertUser()
    const sessionId = randomUUID()
    await database.insert(sessions).values({
      id: sessionId,
      userId: user.id,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })
    const invalidIntervalUser = await insertUser()
    const requestedAt = new Date('2026-03-15T12:00:00.000Z')
    const client = await pool.connect()
    let transactionStarted = false
    try {
      await client.query('begin')
      transactionStarted = true
      await client.query("set local time zone 'Europe/London'")
      await client.query(
        `
          insert into account_deletion_requests (
            user_id,
            requested_at,
            purge_after
          )
          values (
            $1,
            $2::timestamptz,
            $2::timestamptz + interval '336 hours'
          )
        `,
        [user.id, requestedAt.toISOString()],
      )
      await client.query('savepoint invalid_recovery_interval')
      await expect(
        client.query(
          `
            insert into account_deletion_requests (
              user_id,
              requested_at,
              purge_after
            )
            values (
              $1,
              $2::timestamptz,
              $2::timestamptz + interval '14 days'
            )
          `,
          [invalidIntervalUser.id, requestedAt.toISOString()],
        ),
      ).rejects.toThrow('account_deletion_requests_recovery_interval_check')
      await client.query('rollback to savepoint invalid_recovery_interval')
      await client.query('commit')
      transactionStarted = false
    } finally {
      if (transactionStarted) await client.query('rollback')
      client.release()
    }
    await database.insert(deletionChallenges).values({
      userId: user.id,
      sessionId,
      codeDigest: 'a'.repeat(64),
      codeExpiresAt: new Date(requestedAt.getTime() + 10 * 60 * 1000),
      reauthenticatedUntil: new Date(requestedAt.getTime() + 15 * 60 * 1000),
      sendWindowStartedAt: requestedAt,
      lastSentAt: requestedAt,
    })

    await database.delete(sessions).where(eq(sessions.id, sessionId))
    const [detached] = await database.select().from(deletionChallenges)
    expect(detached?.sessionId).toBeNull()

    await database.delete(users).where(eq(users.id, user.id))
    await expect(
      database.select().from(accountDeletionRequests),
    ).resolves.toEqual([])
    await expect(database.select().from(deletionChallenges)).resolves.toEqual(
      [],
    )
    await expect(
      database
        .delete(users)
        .where(eq(users.id, invalidIntervalUser.id))
        .returning({ id: users.id }),
    ).resolves.toEqual([{ id: invalidIntervalUser.id }])
  })
})

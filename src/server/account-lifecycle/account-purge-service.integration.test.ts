import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

vi.mock('server-only', () => ({}))

import { readDatabaseTestEnvironment } from '@/config/database-environment'
import {
  accountDeletionRequests,
  accountPurgeRunHeartbeats,
  users,
} from '@/server/database/schema'
import { cancelAccountDeletion } from '@/server/account-lifecycle/account-deletion-service'
import { assertSafeTestDatabaseName } from '@/test/database/global-setup'

const { databaseTestUrl } = readDatabaseTestEnvironment()
vi.stubEnv('DATABASE_URL', databaseTestUrl)

const { accountPurgeAdvisoryLockKey, runAccountPurgeSweep } =
  await import('@/server/account-lifecycle/account-purge-service')

const pool = new Pool({ connectionString: databaseTestUrl })
const database = drizzle({ client: pool })
const dueRequestIndexPlannerContractTimeoutMilliseconds = 45_000

async function createDueUser(index: number) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const [user] = await database
    .insert(users)
    .values({
      username: `Purge${index}${suffix}`,
      usernameIdentityKey: `purge${index}${suffix}`,
      email: `purge-${index}-${suffix}@example.test`,
    })
    .returning()
  if (user === undefined) throw new Error('Expected purge fixture user')
  const purgeAfter = new Date(Date.now() - 1_000)
  await database.insert(accountDeletionRequests).values({
    userId: user.id,
    requestedAt: new Date(purgeAfter.getTime() - 336 * 60 * 60 * 1_000),
    purgeAfter,
  })
  return user
}

async function createDueUserWithSession(index: number) {
  const user = await createDueUser(index)
  const sessionId = randomUUID()
  await pool.query(
    `insert into sessions (id, user_id, token, expires_at)
     values ($1, $2::uuid, $3, clock_timestamp() + interval '1 hour')`,
    [sessionId, user.id, randomUUID()],
  )
  return { user, session: { userId: user.id, sessionId } }
}

async function insertResetVerification(userId: string): Promise<void> {
  await pool.query(
    `insert into verifications (id, identifier, value, expires_at)
     values ($1::uuid, $2, $3::uuid::text, clock_timestamp() + interval '1 hour')`,
    [randomUUID(), `reset-password:${randomUUID()}`, userId],
  )
}

function errorCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined
  if ('code' in error) return String((error as { code?: unknown }).code)
  const cause = (error as { cause?: unknown }).cause
  return cause instanceof Error && 'code' in cause
    ? String((cause as { code?: unknown }).code)
    : undefined
}

async function populateOwnedCascadeFixture(userId: string): Promise<string> {
  const sessionId = randomUUID()
  const catalogueItemId = randomUUID()
  const now = new Date()
  await pool.query(
    `insert into accounts (id, user_id, account_id, provider_id, password)
     values ($1, $2::uuid, $3, 'credential', 'fixture-password')`,
    [randomUUID(), userId, userId],
  )
  await pool.query(
    `insert into sessions (id, user_id, token, expires_at)
     values ($1, $2, $3, $4)`,
    [sessionId, userId, randomUUID(), new Date(now.getTime() + 60_000)],
  )
  await pool.query(
    `insert into verifications (id, identifier, value, expires_at)
     values ($1, $2, $3, $4)`,
    [
      randomUUID(),
      `reset-password:${randomUUID()}`,
      userId,
      new Date(now.getTime() + 60_000),
    ],
  )
  await pool.query(
    `insert into deletion_challenges
       (user_id, session_id, code_digest, code_expires_at,
        reauthenticated_until, send_window_started_at, last_sent_at)
     values ($1, $2, $3, $4, $5, $6, $6)`,
    [
      userId,
      sessionId,
      'a'.repeat(64),
      new Date(now.getTime() + 60_000),
      new Date(now.getTime() + 120_000),
      now,
    ],
  )
  await pool.query(
    `insert into username_change_records
       (user_id, changed_at, previous_username_identity_key,
        previous_username_reserved_until)
     values ($1, $2::timestamptz, 'formerfixture', $2::timestamptz + interval '14 days')`,
    [userId, now],
  )
  await pool.query(
    `insert into username_change_challenges
       (user_id, session_id, proposed_username, proposed_username_identity_key,
        code_digest, code_expires_at, reauthenticated_until,
        send_window_started_at, last_sent_at)
     values ($1, $2, 'FutureFixture', 'futurefixture', $3, $4, $5, $6, $6)`,
    [
      userId,
      sessionId,
      'b'.repeat(64),
      new Date(now.getTime() + 60_000),
      new Date(now.getTime() + 120_000),
      now,
    ],
  )
  await pool.query(
    `insert into user_catalogue_preferences
       (user_id, title_language, adult_content_enabled)
     values ($1, 'romaji', true)`,
    [userId],
  )
  await pool.query(
    `insert into anime_catalogue_items
       (id, english_title, format, release_status, maturity, catalogue_state)
     values ($1, 'Purge Cascade Catalogue', 'tv', 'finished', 'safe', 'published')`,
    [catalogueItemId],
  )
  await pool.query(
    `insert into anime_alternative_titles (catalogue_item_id, title, position)
     values ($1, 'Purge Cascade Alternative', 0)`,
    [catalogueItemId],
  )
  await pool.query(
    `insert into anime_catalogue_sources
       (catalogue_item_id, source_key, source_item_id)
     values ($1, 'fixture', 'purge-cascade-source')`,
    [catalogueItemId],
  )
  await pool.query(
    `insert into anime_entries (id, user_id, catalogue_item_id, status)
     values ($1, $2, $3, 'in_progress')`,
    [randomUUID(), userId, catalogueItemId],
  )
  await pool.query(
    `insert into rate_limits (id, key, count, last_request)
     values ($1, 'm34-independent-rate-limit', 1, 1)`,
    [randomUUID()],
  )
  return catalogueItemId
}

beforeAll(async () => {
  const result = await pool.query<{ databaseName: string }>(
    'select current_database() as "databaseName"',
  )
  assertSafeTestDatabaseName(result.rows[0]?.databaseName)
})

async function resetPurgeFixtures(): Promise<void> {
  await pool.query(`
    truncate table
      anime_entries,
      anime_catalogue_sources,
      anime_alternative_titles,
      anime_catalogue_items,
      rate_limits,
      verifications,
      sessions,
      accounts,
      users
    restart identity cascade
  `)
  await pool.query(`
    update account_purge_run_heartbeats
       set run_id = null,
           revision = 0,
           started_at = null,
           completed_at = null,
           result_category = 'never_started',
           examined_count = 0,
           purged_count = 0,
           skipped_count = 0,
           failed_count = 0
     where singleton = true
  `)
}

beforeEach(resetPurgeFixtures)
afterEach(resetPurgeFixtures)

afterAll(async () => {
  await pool.end()
})

describe('account purge sweep', () => {
  it('deletes every owned cascade while preserving shared catalogue and independent rate limits', async () => {
    const user = await createDueUser(1)
    const catalogueItemId = await populateOwnedCascadeFixture(user.id)
    const [controlUser] = await database
      .insert(users)
      .values({
        username: 'PurgeControl',
        usernameIdentityKey: 'purgecontrol',
        email: 'purge-control@example.test',
      })
      .returning()
    if (controlUser === undefined) throw new Error('Expected control user')
    const controlNow = new Date()
    await pool.query(
      `insert into verifications (id, identifier, value, expires_at)
       values ($1, 'unrelated-verification', 'control-value', $2)`,
      [randomUUID(), new Date(controlNow.getTime() + 60_000)],
    )
    await pool.query(
      `insert into username_change_records
         (user_id, changed_at, previous_username_identity_key,
          previous_username_reserved_until)
       values ($1, $2::timestamptz, 'liveformer', $2::timestamptz + interval '14 days')`,
      [controlUser.id, controlNow],
    )
    await pool.query(
      `insert into anime_entries (id, user_id, catalogue_item_id, status)
       values ($1, $2, $3, 'planned')`,
      [randomUUID(), controlUser.id, catalogueItemId],
    )
    const result = await runAccountPurgeSweep()
    expect(result).toMatchObject({ result: 'completed', purgedCount: 1 })

    const absentOwnedRows = await pool.query<{ count: number }>(
      `select count(*)::int as count from (
         select user_id from accounts where user_id = $1
         union all select user_id from sessions where user_id = $1
         union all select value::uuid from verifications
           where identifier like 'reset-password:%' and value = $1::text
         union all select user_id from account_deletion_requests where user_id = $1
         union all select user_id from deletion_challenges where user_id = $1
         union all select user_id from username_change_records where user_id = $1
         union all select user_id from username_change_challenges where user_id = $1
         union all select user_id from user_catalogue_preferences where user_id = $1
         union all select user_id from anime_entries where user_id = $1
       ) as owned_rows`,
      [user.id],
    )
    expect(absentOwnedRows.rows[0]?.count).toBe(0)
    await expect(
      pool.query(
        `select id from anime_catalogue_items where id = $1
         union all select catalogue_item_id from anime_alternative_titles where catalogue_item_id = $1
         union all select catalogue_item_id from anime_catalogue_sources where catalogue_item_id = $1`,
        [catalogueItemId],
      ),
    ).resolves.toMatchObject({ rowCount: 3 })
    await expect(
      pool.query(`select count(*)::int as count from rate_limits`),
    ).resolves.toMatchObject({ rows: [{ count: 1 }] })
    await expect(
      pool.query(
        `select
           (select count(*)::int from users where id = $1) as users,
           (select count(*)::int from anime_entries where user_id = $1) as entries,
           (select count(*)::int from verifications where identifier = 'unrelated-verification') as verifications,
           (select count(*)::int from username_change_records where user_id = $1 and previous_username_identity_key = 'liveformer') as reservations`,
        [controlUser.id],
      ),
    ).resolves.toMatchObject({
      rows: [{ users: 1, entries: 1, verifications: 1, reservations: 1 }],
    })

    await expect(
      database
        .insert(users)
        .values({
          username: user.username,
          usernameIdentityKey: user.usernameIdentityKey,
          email: user.email,
        })
        .returning(),
    ).resolves.toHaveLength(1)
  })

  it('uses the 26th candidate only as backlog evidence and purges the first 25 atomically', async () => {
    const dueUsers = await Promise.all(
      Array.from({ length: 26 }, (_, index) => createDueUser(index)),
    )

    const result = await runAccountPurgeSweep()
    expect(result).toEqual({
      result: 'completed_backlog',
      examinedCount: 25,
      purgedCount: 25,
      skippedCount: 0,
      failedCount: 0,
    })
    await expect(database.select().from(users)).resolves.toHaveLength(1)
    await expect(
      database.select().from(accountDeletionRequests),
    ).resolves.toHaveLength(1)
    await expect(
      database.select().from(accountPurgeRunHeartbeats),
    ).resolves.toEqual([
      expect.objectContaining({
        resultCategory: 'completed_backlog',
        examinedCount: 25,
        purgedCount: 25,
        skippedCount: 0,
        failedCount: 0,
        revision: 1,
      }),
    ])
    expect(dueUsers).toHaveLength(26)
  })

  it('does not read candidates or overwrite heartbeat when another session owns the sweep lock', async () => {
    await createDueUser(1)
    const lockHolder = await pool.connect()
    try {
      await lockHolder.query('select pg_advisory_lock($1)', [
        accountPurgeAdvisoryLockKey,
      ])
      await expect(runAccountPurgeSweep()).resolves.toEqual({
        result: 'overlap_skipped',
      })
    } finally {
      await lockHolder.query('select pg_advisory_unlock($1)', [
        accountPurgeAdvisoryLockKey,
      ])
      lockHolder.release()
    }
    await expect(
      database.select().from(accountPurgeRunHeartbeats),
    ).resolves.toEqual([
      expect.objectContaining({
        resultCategory: 'never_started',
        revision: 0,
      }),
    ])
    await expect(database.select().from(users)).resolves.toHaveLength(1)
  })

  it('uses a monotonic deadline to leave unprocessed candidates retryable', async () => {
    await createDueUser(1)
    const monotonicValues = [0, 45_000]
    const result = await runAccountPurgeSweep({
      monotonicNow: () => monotonicValues.shift() ?? 45_000,
    })
    expect(result).toEqual({
      result: 'time_budget_exhausted',
      examinedCount: 0,
      purgedCount: 0,
      skippedCount: 0,
      failedCount: 0,
    })
    await expect(database.select().from(users)).resolves.toHaveLength(1)
    await expect(
      database.select().from(accountDeletionRequests),
    ).resolves.toHaveLength(1)
  })

  it('uses the locked recheck when a discovered request disappears, becomes future-due, or lands exactly at its deadline', async () => {
    const removedRequest = await createDueUser(1)
    const futureRequest = await createDueUser(2)
    const exactDeadline = await createDueUser(3)

    const result = await runAccountPurgeSweep({
      afterCandidateDiscovery: async () => {
        await pool.query(
          'delete from account_deletion_requests where user_id = $1::uuid',
          [removedRequest.id],
        )
        const futureDeadline = new Date(Date.now() + 60 * 60 * 1_000)
        await pool.query(
          `update account_deletion_requests
              set requested_at = $2::timestamptz - interval '336 hours',
                  purge_after = $2::timestamptz
            where user_id = $1::uuid`,
          [futureRequest.id, futureDeadline],
        )
        const deadline = new Date()
        await pool.query(
          `update account_deletion_requests
              set requested_at = $2::timestamptz - interval '336 hours',
                  purge_after = $2::timestamptz
            where user_id = $1::uuid`,
          [exactDeadline.id, deadline],
        )
      },
    })

    expect(result).toEqual({
      result: 'completed',
      examinedCount: 3,
      purgedCount: 1,
      skippedCount: 2,
      failedCount: 0,
    })
    await expect(
      database.select().from(users).where(eq(users.id, removedRequest.id)),
    ).resolves.toHaveLength(1)
    await expect(
      database
        .select()
        .from(accountDeletionRequests)
        .where(eq(accountDeletionRequests.userId, futureRequest.id)),
    ).resolves.toHaveLength(1)
    await expect(
      database.select().from(users).where(eq(users.id, exactDeadline.id)),
    ).resolves.toEqual([])
  })

  it('does not let a stale heartbeat owner complete a newer heartbeat revision', async () => {
    const newerRunId = randomUUID()

    await expect(
      runAccountPurgeSweep({
        afterCandidateDiscovery: async () => {
          await pool.query(
            `update account_purge_run_heartbeats
                set run_id = $1::uuid,
                    revision = revision + 1,
                    started_at = clock_timestamp(),
                    completed_at = null,
                    result_category = 'running',
                    examined_count = 0,
                    purged_count = 0,
                    skipped_count = 0,
                    failed_count = 0
              where singleton = true`,
            [newerRunId],
          )
        },
      }),
    ).resolves.toEqual({ result: 'service_unavailable' })

    await expect(
      database.select().from(accountPurgeRunHeartbeats),
    ).resolves.toEqual([
      expect.objectContaining({
        runId: newerRunId,
        revision: 2,
        resultCategory: 'running',
        completedAt: null,
      }),
    ])
  })

  it('supersedes an unlocked stale running heartbeat with a fresh completed revision', async () => {
    const staleRunId = randomUUID()
    await pool.query(
      `update account_purge_run_heartbeats
          set run_id = $1::uuid,
              revision = 1,
              started_at = clock_timestamp() - interval '1 hour',
              completed_at = null,
              result_category = 'running',
              examined_count = 0,
              purged_count = 0,
              skipped_count = 0,
              failed_count = 0
        where singleton = true`,
      [staleRunId],
    )
    await createDueUser(1)

    await expect(runAccountPurgeSweep()).resolves.toEqual({
      result: 'completed',
      examinedCount: 1,
      purgedCount: 1,
      skippedCount: 0,
      failedCount: 0,
    })

    await expect(
      database.select().from(accountPurgeRunHeartbeats),
    ).resolves.toEqual([
      expect.objectContaining({
        revision: 2,
        resultCategory: 'completed',
        purgedCount: 1,
        skippedCount: 0,
        failedCount: 0,
        completedAt: expect.any(Date),
      }),
    ])
    const [heartbeat] = await database.select().from(accountPurgeRunHeartbeats)
    expect(heartbeat?.runId).not.toBe(staleRunId)
  })

  it('lets a cancellation committed after discovery remove a no-longer-due request before purge rechecks it', async () => {
    const { user, session } = await createDueUserWithSession(1)
    let cancellation:
      Awaited<ReturnType<typeof cancelAccountDeletion>> | undefined

    await expect(
      runAccountPurgeSweep({
        afterCandidateDiscovery: async () => {
          const futureDeadline = new Date(Date.now() + 60 * 60 * 1_000)
          await pool.query(
            `update account_deletion_requests
                set requested_at = $2::timestamptz - interval '336 hours',
                    purge_after = $2::timestamptz
              where user_id = $1::uuid`,
            [user.id, futureDeadline],
          )
          cancellation = await cancelAccountDeletion(database, session)
        },
      }),
    ).resolves.toEqual({
      result: 'completed',
      examinedCount: 1,
      purgedCount: 0,
      skippedCount: 1,
      failedCount: 0,
    })

    expect(cancellation).toMatchObject({ kind: 'deletion_cancelled' })
    await expect(
      database.select().from(users).where(eq(users.id, user.id)),
    ).resolves.toHaveLength(1)
    await expect(
      database
        .select()
        .from(accountDeletionRequests)
        .where(eq(accountDeletionRequests.userId, user.id)),
    ).resolves.toEqual([])
  })

  it('makes a cancellation begun before purge commit observe the permanently deleted account', async () => {
    const { user, session } = await createDueUserWithSession(1)
    let cancellation: ReturnType<typeof cancelAccountDeletion> | undefined

    await expect(
      runAccountPurgeSweep({
        afterCandidateDeleted: () => {
          cancellation = cancelAccountDeletion(database, session)
        },
      }),
    ).resolves.toMatchObject({ result: 'completed', purgedCount: 1 })

    if (cancellation === undefined) {
      throw new Error('Expected cancellation race to begin before purge commit')
    }
    await expect(cancellation).resolves.toEqual({ kind: 'account_unavailable' })
    await expect(
      database.select().from(users).where(eq(users.id, user.id)),
    ).resolves.toEqual([])
  })

  it('cascades a reset verification committed before purge', async () => {
    const user = await createDueUser(1)

    await expect(
      runAccountPurgeSweep({
        afterCandidateDiscovery: async () => {
          await insertResetVerification(user.id)
        },
      }),
    ).resolves.toMatchObject({ result: 'completed', purgedCount: 1 })

    await expect(
      pool.query(
        `select count(*)::int as count
           from verifications
          where identifier like 'reset-password:%' and value = $1::uuid::text`,
        [user.id],
      ),
    ).resolves.toMatchObject({ rows: [{ count: 0 }] })
  })

  it('rejects reset verification issuance begun before purge commits without leaving an orphan', async () => {
    const user = await createDueUser(1)
    let resetIssuanceError: Promise<string | undefined> | undefined

    await expect(
      runAccountPurgeSweep({
        afterCandidateDeleted: () => {
          resetIssuanceError = insertResetVerification(user.id).then(
            () => undefined,
            (error: unknown) => errorCode(error),
          )
        },
      }),
    ).resolves.toMatchObject({ result: 'completed', purgedCount: 1 })

    if (resetIssuanceError === undefined) {
      throw new Error(
        'Expected reset issuance race to begin before purge commit',
      )
    }
    await expect(resetIssuanceError).resolves.toBe('23503')
    await expect(
      pool.query(
        `select count(*)::int as count
           from verifications
          where identifier like 'reset-password:%' and value = $1::uuid::text`,
        [user.id],
      ),
    ).resolves.toMatchObject({ rows: [{ count: 0 }] })
  })

  it('rejects identifier reuse committed before purge, then permits it only after purge commits', async () => {
    const user = await createDueUser(1)
    let duplicateError: unknown

    await expect(
      runAccountPurgeSweep({
        afterCandidateDiscovery: async () => {
          try {
            await database.insert(users).values({
              username: user.username,
              usernameIdentityKey: user.usernameIdentityKey,
              email: user.email,
            })
          } catch (error) {
            duplicateError = error
          }
        },
      }),
    ).resolves.toMatchObject({ result: 'completed', purgedCount: 1 })

    expect(errorCode(duplicateError)).toBe('23505')
    await expect(
      database
        .insert(users)
        .values({
          username: user.username,
          usernameIdentityKey: user.usernameIdentityKey,
          email: user.email,
        })
        .returning({ id: users.id }),
    ).resolves.toHaveLength(1)
  })

  it('permits an identifier registration begun before purge commit only after the deleted user is gone', async () => {
    const user = await createDueUser(1)
    let registration: Promise<{ id: string }[]> | undefined
    let registrationIssued = false

    await expect(
      runAccountPurgeSweep({
        afterCandidateDeleted: () => {
          registration = (async () => {
            registrationIssued = true
            return await database
              .insert(users)
              .values({
                username: user.username,
                usernameIdentityKey: user.usernameIdentityKey,
                email: user.email,
              })
              .returning({ id: users.id })
          })()
        },
      }),
    ).resolves.toMatchObject({ result: 'completed', purgedCount: 1 })

    expect(registrationIssued).toBe(true)
    if (registration === undefined) {
      throw new Error('Expected registration race to begin before purge commit')
    }
    await expect(registration).resolves.toHaveLength(1)
    await expect(
      database.select().from(users).where(eq(users.id, user.id)),
    ).resolves.toEqual([])
  })

  it('rolls back one failed account and continues safely to later candidates', async () => {
    const blocked = await createDueUser(1)
    const later = await createDueUser(2)
    await pool.query(`
      create function m34_reject_one_purge() returns trigger language plpgsql as $$
      begin
        if old.id = '${blocked.id}'::uuid then
          raise exception 'm34 injected purge failure';
        end if;
        return old;
      end
      $$
    `)
    await pool.query(`
      create trigger m34_reject_one_purge_trigger
      before delete on users
      for each row execute function m34_reject_one_purge()
    `)
    try {
      await expect(runAccountPurgeSweep()).resolves.toEqual({
        result: 'completed_with_failures',
        examinedCount: 2,
        purgedCount: 1,
        skippedCount: 0,
        failedCount: 1,
      })
    } finally {
      await pool.query(
        'drop trigger if exists m34_reject_one_purge_trigger on users',
      )
      await pool.query('drop function if exists m34_reject_one_purge()')
    }
    await expect(
      database.select().from(users).where(eq(users.id, blocked.id)),
    ).resolves.toHaveLength(1)
    await expect(
      database
        .select()
        .from(accountDeletionRequests)
        .where(eq(accountDeletionRequests.userId, blocked.id)),
    ).resolves.toHaveLength(1)
    await expect(
      database.select().from(users).where(eq(users.id, later.id)),
    ).resolves.toEqual([])
  })

  it('rolls back a real user-lock timeout and continues to a later candidate', async () => {
    const blocked = await createDueUser(1)
    const later = await createDueUser(2)
    const lockHolder = await pool.connect()
    try {
      await lockHolder.query('begin')
      await lockHolder.query(
        'select id from users where id = $1::uuid for update',
        [blocked.id],
      )

      await expect(runAccountPurgeSweep()).resolves.toEqual({
        result: 'completed_with_failures',
        examinedCount: 2,
        purgedCount: 1,
        skippedCount: 0,
        failedCount: 1,
      })
    } finally {
      await lockHolder.query('rollback')
      lockHolder.release()
    }

    await expect(
      database.select().from(users).where(eq(users.id, blocked.id)),
    ).resolves.toHaveLength(1)
    await expect(
      database
        .select()
        .from(accountDeletionRequests)
        .where(eq(accountDeletionRequests.userId, blocked.id)),
    ).resolves.toHaveLength(1)
    await expect(
      database.select().from(users).where(eq(users.id, later.id)),
    ).resolves.toEqual([])
  })

  it('rolls back a deterministic statement-timeout SQLSTATE and continues to a later candidate', async () => {
    const blocked = await createDueUser(1)
    const later = await createDueUser(2)
    await pool.query(`
      create function m34_statement_timeout() returns trigger language plpgsql as $$
      begin
        if old.id = '${blocked.id}'::uuid then
          raise sqlstate '57014';
        end if;
        return old;
      end
      $$
    `)
    await pool.query(`
      create trigger m34_statement_timeout_trigger
      before delete on users
      for each row execute function m34_statement_timeout()
    `)
    try {
      await expect(runAccountPurgeSweep()).resolves.toEqual({
        result: 'completed_with_failures',
        examinedCount: 2,
        purgedCount: 1,
        skippedCount: 0,
        failedCount: 1,
      })
    } finally {
      await pool.query(
        'drop trigger if exists m34_statement_timeout_trigger on users',
      )
      await pool.query('drop function if exists m34_statement_timeout()')
    }

    await expect(
      database.select().from(users).where(eq(users.id, blocked.id)),
    ).resolves.toHaveLength(1)
    await expect(
      database
        .select()
        .from(accountDeletionRequests)
        .where(eq(accountDeletionRequests.userId, blocked.id)),
    ).resolves.toHaveLength(1)
    await expect(
      database.select().from(users).where(eq(users.id, later.id)),
    ).resolves.toEqual([])
  })

  it(
    'uses the due-request index for deterministic cutoff-bound discovery',
    async () => {
      const prefix = `m34p${randomUUID().replaceAll('-', '').slice(0, 6)}`
      const baseline = await pool.query<{ users: number; requests: number }>(`
      select
        (select count(*)::int from users) as users,
        (select count(*)::int from account_deletion_requests) as requests
    `)
      await expect(
        pool.query(
          `select count(*)::int as count from users where username like $1`,
          [`${prefix}%`],
        ),
      ).resolves.toMatchObject({ rows: [{ count: 0 }] })
      try {
        // A single rolled-back 100k statement exceeded this local PostgreSQL
        // instance's shared-memory limit. Bounded committed chunks stay inside
        // one exact test-only namespace and are cleaned in finally.
        for (let offset = 0; offset < 100_000; offset += 10_000) {
          await pool.query(
            `insert into users (id, username, username_identity_key, email)
           select
             gen_random_uuid(),
             $1 || series,
             $1 || series,
             $1 || series || '@example.test'
           from generate_series($2::integer, $3::integer) as series`,
            [prefix, offset + 1, offset + 10_000],
          )
        }
        await pool.query(
          `insert into account_deletion_requests (user_id, requested_at, purge_after)
         select id, purge_after - interval '336 hours', purge_after
         from (
           select
             id,
             transaction_timestamp() + case
               when substring(username from char_length($1) + 1)::integer <= 100 then interval '-1 second'
               else interval '1 hour'
             end as purge_after
           from users
           where username like $1 || '%'
         ) as planned_requests`,
          [prefix],
        )
        await pool.query('analyze account_deletion_requests')
        const cutoff = await pool.query<{ cutoff: Date }>(
          'select clock_timestamp() as cutoff',
        )
        const plan = await pool.query<Record<'QUERY PLAN', unknown>>(
          `explain (analyze, buffers, format json)
         select user_id
           from account_deletion_requests
          where purge_after <= $1::timestamptz
          order by purge_after, user_id
          limit 26`,
          [cutoff.rows[0]?.cutoff],
        )
        expect(JSON.stringify(plan.rows[0]?.['QUERY PLAN'])).toContain(
          'account_deletion_requests_purge_after_user_id_idx',
        )
      } finally {
        await pool.query('delete from users where username like $1', [
          `${prefix}%`,
        ])
      }
      // ANALYZE statistics are not transactional, so restore the baseline after
      // the namespace cleanup has completed.
      await pool.query('analyze account_deletion_requests')
      await expect(
        pool.query(
          `select count(*)::int as count from users where username like $1`,
          [`${prefix}%`],
        ),
      ).resolves.toMatchObject({ rows: [{ count: 0 }] })
      await expect(
        pool.query<{ users: number; requests: number }>(`
        select
          (select count(*)::int from users) as users,
          (select count(*)::int from account_deletion_requests) as requests
      `),
      ).resolves.toMatchObject({ rows: baseline.rows })
    },
    dueRequestIndexPlannerContractTimeoutMilliseconds,
  )
})

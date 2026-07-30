import { randomUUID } from 'node:crypto'
import { hashPassword } from 'better-auth/crypto'
import { Pool, type PoolClient } from 'pg'
import {
  accountLifecycleRateLimitKeys,
  assertAccountLifecycleRateLimitTransition,
  assertExactRateLimitState,
  type AccountLifecycleRateLimitOperation,
  type AccountLifecycleRateLimitRow,
} from './account-lifecycle-rate-limit'
import { LoopbackAuthCollectors } from './loopback-auth-collectors'

type OwnerKey = 'a' | 'b'

type LifecycleCounts = Readonly<{
  challenges: number
  requests: number
  sessions: number
}>

const exactRateLimitKeys = Object.values(accountLifecycleRateLimitKeys)

function explicitTestDatabaseUrl() {
  const value = process.env.DATABASE_TEST_URL
  if (value === undefined || value.trim() === '' || value !== value.trim()) {
    throw new TypeError('M42 requires an explicit DATABASE_TEST_URL')
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new TypeError('M42 requires a valid DATABASE_TEST_URL')
  }
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    parsed.pathname.slice(1) !== 'zedarchive_test'
  ) {
    throw new TypeError('M42 requires the exact zedarchive_test database URL')
  }
  return value
}

async function requireExactTestDatabase(
  queryable: Pick<Pool, 'query'> | Pick<PoolClient, 'query'>,
) {
  const result = await queryable.query<{ name: string }>(
    'select current_database() as name',
  )
  if (result.rows[0]?.name !== 'zedarchive_test') {
    throw new TypeError('M42 database target is not allowed')
  }
}

function createIdentity(prefix: string) {
  const marker = randomUUID().replaceAll('-', '')
  return {
    email: `m42-${prefix}-${marker}@example.test`,
    username: `M42${prefix.toUpperCase()}${marker.slice(0, 12)}`,
    usernameIdentityKey: `m42${prefix}${marker.slice(0, 12)}`,
  } as const
}

export class AccountLifecycleFixture {
  readonly owners = {
    a: createIdentity('a'),
    b: createIdentity('b'),
  } as const
  readonly unknownRecoveryEmail = `m42-unknown-${randomUUID().replaceAll('-', '')}@example.test`
  readonly originalPassword = `M42-original-${randomUUID()}-${randomUUID()}`
  readonly replacementPassword = `M42-replacement-${randomUUID()}-${randomUUID()}`
  readonly catalogueItemId = randomUUID()
  readonly catalogueTitle = `M42 Account Lifecycle ${randomUUID()}`
  readonly catalogueOriginalTitle = `M42 Original ${randomUUID()}`
  readonly pool = new Pool({
    connectionString: explicitTestDatabaseUrl(),
    connectionTimeoutMillis: 5_000,
    query_timeout: 15_000,
    statement_timeout: 15_000,
  })
  readonly collectors: LoopbackAuthCollectors

  #ownerIds = new Map<OwnerKey, string>()
  #entryIds = new Map<OwnerKey, string>()
  #archiveFingerprint: string | undefined
  #rateLimitBefore: AccountLifecycleRateLimitRow[] | undefined
  #rateLimitExpected: AccountLifecycleRateLimitRow[] | undefined
  #pendingRateLimitRequests = new Map<
    AccountLifecycleRateLimitOperation,
    Readonly<{
      before: AccountLifecycleRateLimitRow | undefined
      minimumTimestamp: number
    }>
  >()
  #setupComplete = false

  constructor() {
    const fromAddress = process.env.AUTH_EMAIL_FROM
    const replyToAddress = process.env.AUTH_EMAIL_REPLY_TO
    if (!fromAddress || !replyToAddress) {
      throw new TypeError('M42 email sender environment is unavailable')
    }
    this.collectors = new LoopbackAuthCollectors({
      recipient: this.owners.a.email,
      fromAddress,
      replyToAddress,
      lifecycleRecipients: [this.owners.a.email],
      lifecycleMessageLimits: {
        password_reset: 1,
        account_deletion_code: 1,
        account_deletion_requested: 1,
        account_deletion_cancelled: 1,
      },
    })
  }

  async setup() {
    await requireExactTestDatabase(this.pool)
    if (this.#setupComplete) {
      throw new TypeError('M42 account lifecycle fixture already exists')
    }
    const conflict = await this.pool.query<{ count: number }>(
      `select
        (select count(*)::int from users
          where lower(email) = any($1::text[])
             or username_identity_key = any($2::text[]))
        + (select count(*)::int from anime_catalogue_items
          where id = $3::uuid or english_title = $4) as count`,
      [
        [this.owners.a.email, this.owners.b.email],
        [this.owners.a.usernameIdentityKey, this.owners.b.usernameIdentityKey],
        this.catalogueItemId,
        this.catalogueTitle,
      ],
    )
    if (conflict.rows[0]?.count !== 0) {
      throw new TypeError('M42 account lifecycle fixture identity is not clean')
    }

    await this.snapshotRateLimits()
    const passwordHash = await hashPassword(this.originalPassword)
    const client = await this.pool.connect()
    try {
      await client.query('begin')
      await client.query(`set local lock_timeout = '5s'`)
      await client.query(`set local statement_timeout = '15s'`)
      await requireExactTestDatabase(client)
      await client.query(
        `insert into anime_catalogue_items (
           id, english_title, original_title, format, release_status,
           release_year, episode_count, maturity, catalogue_state
         ) values ($1::uuid, $2, $3, 'tv', 'finished', 2026, 12, 'safe', 'published')`,
        [
          this.catalogueItemId,
          this.catalogueTitle,
          this.catalogueOriginalTitle,
        ],
      )

      for (const ownerKey of ['a', 'b'] as const) {
        const owner = this.owners[ownerKey]
        const ownerId = randomUUID()
        const entryId = randomUUID()
        this.#ownerIds.set(ownerKey, ownerId)
        this.#entryIds.set(ownerKey, entryId)
        await client.query(
          `insert into users (
             id, username, username_identity_key, email, email_verified
           ) values ($1::uuid, $2, $3, $4, true)`,
          [ownerId, owner.username, owner.usernameIdentityKey, owner.email],
        )
        await client.query(
          `insert into accounts (
             id, user_id, account_id, provider_id, password
           ) values ($1::uuid, $2::uuid, $2::text, 'credential', $3)`,
          [randomUUID(), ownerId, passwordHash],
        )
        await client.query(
          `insert into anime_entries (
             id, user_id, catalogue_item_id, status, episode_progress,
             rating, is_favourite
           ) values ($1::uuid, $2::uuid, $3::uuid, 'in_progress', 3, 7.5, false)`,
          [entryId, ownerId, this.catalogueItemId],
        )
      }
      await client.query(
        `insert into user_catalogue_preferences (
           user_id, title_language, adult_content_enabled
         ) values ($1::uuid, 'original', false)`,
        [this.ownerId('a')],
      )
      await client.query('commit')
      this.#setupComplete = true
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  }

  ownerId(owner: OwnerKey) {
    const ownerId = this.#ownerIds.get(owner)
    if (ownerId === undefined) {
      throw new TypeError('M42 owner is not tracked')
    }
    return ownerId
  }

  async captureArchiveFingerprint() {
    await requireExactTestDatabase(this.pool)
    const result = await this.pool.query<{ fingerprint: string }>(
      `select md5(jsonb_build_object(
         'preference', (
           select to_jsonb(p) - 'user_id'
           from user_catalogue_preferences p
           where p.user_id = $1::uuid
         ),
         'entries', (
           select coalesce(jsonb_agg(to_jsonb(e) - 'user_id' order by e.id), '[]'::jsonb)
           from anime_entries e
           where e.user_id = $1::uuid
         )
       )::text) as fingerprint`,
      [this.ownerId('a')],
    )
    const fingerprint = result.rows[0]?.fingerprint
    if (fingerprint === undefined) {
      throw new TypeError('M42 archive fingerprint is unavailable')
    }
    this.#archiveFingerprint = fingerprint
  }

  async archiveFingerprintUnchanged() {
    const expected = this.#archiveFingerprint
    if (expected === undefined) {
      throw new TypeError('M42 archive fingerprint was not captured')
    }
    const result = await this.pool.query<{ unchanged: boolean }>(
      `select md5(jsonb_build_object(
         'preference', (
           select to_jsonb(p) - 'user_id'
           from user_catalogue_preferences p
           where p.user_id = $1::uuid
         ),
         'entries', (
           select coalesce(jsonb_agg(to_jsonb(e) - 'user_id' order by e.id), '[]'::jsonb)
           from anime_entries e
           where e.user_id = $1::uuid
         )
       )::text) = $2 as unchanged`,
      [this.ownerId('a'), expected],
    )
    return result.rows[0]?.unchanged === true
  }

  async lifecycleCounts(owner: OwnerKey): Promise<LifecycleCounts> {
    const result = await this.pool.query<LifecycleCounts>(
      `select
        (select count(*)::int from deletion_challenges where user_id = $1::uuid) as challenges,
        (select count(*)::int from account_deletion_requests where user_id = $1::uuid) as requests,
        (select count(*)::int from sessions where user_id = $1::uuid) as sessions`,
      [this.ownerId(owner)],
    )
    return result.rows[0] ?? { challenges: 0, requests: 0, sessions: 0 }
  }

  async deletionRequestEvidence(owner: OwnerKey) {
    const result = await this.pool.query<{
      count: number
      exactHours: boolean
    }>(
      `select
        count(*)::int as count,
        coalesce(bool_and(
          purge_after = requested_at + interval '336 hours'
        ), false) as "exactHours"
       from account_deletion_requests
       where user_id = $1::uuid`,
      [this.ownerId(owner)],
    )
    return result.rows[0] ?? { count: 0, exactHours: false }
  }

  async snapshotRateLimits() {
    if (this.#rateLimitBefore !== undefined) {
      throw new TypeError('M42 rate limits were already snapshotted')
    }
    this.#rateLimitBefore = await this.#readRateLimits()
    this.#rateLimitExpected = this.#rateLimitBefore
  }

  async prepareRateLimitRequest(operation: AccountLifecycleRateLimitOperation) {
    if (this.#rateLimitExpected === undefined) {
      throw new TypeError('M42 rate limits were not snapshotted')
    }
    if (this.#pendingRateLimitRequests.has(operation)) {
      throw new TypeError('M42 rate-limit request is already pending')
    }
    const current = await this.#readRateLimits()
    assertExactRateLimitState(current, this.#rateLimitExpected)
    const key = accountLifecycleRateLimitKeys[operation]
    this.#pendingRateLimitRequests.set(operation, {
      before: current.find((row) => row.key === key),
      minimumTimestamp: Date.now(),
    })
  }

  async recordRateLimitRequest(operation: AccountLifecycleRateLimitOperation) {
    const pending = this.#pendingRateLimitRequests.get(operation)
    if (pending === undefined || this.#rateLimitExpected === undefined) {
      throw new TypeError('M42 rate-limit request was not prepared')
    }
    const current = await this.#readRateLimits()
    const key = accountLifecycleRateLimitKeys[operation]
    const unchangedExpected = this.#rateLimitExpected.filter(
      (row) => row.key !== key,
    )
    assertExactRateLimitState(
      current.filter((row) => row.key !== key),
      unchangedExpected,
    )
    const after = current.find((row) => row.key === key)
    assertAccountLifecycleRateLimitTransition({
      after,
      before: pending.before,
      key,
      minimumTimestamp: pending.minimumTimestamp,
    })
    this.#rateLimitExpected = [
      ...unchangedExpected,
      ...(after === undefined ? [] : [after]),
    ].sort((left, right) => left.key.localeCompare(right.key))
    this.#pendingRateLimitRequests.delete(operation)
  }

  async ageTestOwnedSignInRateLimit() {
    if (this.#rateLimitExpected === undefined) {
      throw new TypeError('M42 rate limits were not snapshotted')
    }
    if (this.#pendingRateLimitRequests.size !== 0) {
      throw new TypeError('M42 cannot age a pending rate-limit request')
    }
    const current = await this.#readRateLimits()
    assertExactRateLimitState(current, this.#rateLimitExpected)
    if (
      this.#rateLimitBefore?.some(
        (row) => row.key === '127.0.0.1|/sign-in/email',
      )
    ) {
      throw new TypeError('M42 sign-in rate-limit row was not test-created')
    }
    const expected = this.#rateLimitExpected?.find(
      (row) => row.key === '127.0.0.1|/sign-in/email',
    )
    if (expected === undefined) {
      throw new TypeError('M42 sign-in rate-limit row is unavailable')
    }
    const aged = await this.pool.query<AccountLifecycleRateLimitRow>(
      `update rate_limits
       set last_request = last_request - 61_000
       where id = $1::uuid
         and key = $2
         and count = $3
         and last_request = $4::bigint
       returning id, key, count, last_request::text as "lastRequest"`,
      [expected.id, expected.key, expected.count, expected.lastRequest],
    )
    if (aged.rows.length !== 1) {
      throw new TypeError('M42 sign-in rate-limit row changed before aging')
    }
    this.#rateLimitExpected = (this.#rateLimitExpected ?? []).map((row) =>
      row.key === expected.key ? aged.rows[0]! : row,
    )
  }

  async cleanup() {
    let cleanupError: unknown
    let restoreRateLimits = true
    try {
      await this.#settlePendingRateLimitRequests()
    } catch (error) {
      cleanupError = error
      restoreRateLimits = false
      this.#pendingRateLimitRequests.clear()
    }
    try {
      await this.#cleanupDatabase(restoreRateLimits)
    } catch (error) {
      cleanupError ??= error
    }
    try {
      await this.collectors.stop()
    } catch (error) {
      cleanupError ??= error
    }
    try {
      await this.pool.end()
    } catch (error) {
      cleanupError ??= error
    }
    if (cleanupError !== undefined) throw cleanupError
  }

  async #settlePendingRateLimitRequests() {
    for (const operation of [...this.#pendingRateLimitRequests.keys()]) {
      const current = await this.#readRateLimits()
      try {
        assertExactRateLimitState(current, this.#rateLimitExpected ?? [])
        this.#pendingRateLimitRequests.delete(operation)
      } catch {
        await this.recordRateLimitRequest(operation)
      }
    }
  }

  async #readRateLimits(
    queryable: Pick<Pool, 'query'> | Pick<PoolClient, 'query'> = this.pool,
  ) {
    const result = await queryable.query<AccountLifecycleRateLimitRow>(
      `select id, key, count, last_request::text as "lastRequest"
       from rate_limits
       where key = any($1::text[])
       order by key`,
      [[...exactRateLimitKeys]],
    )
    return result.rows
  }

  async #restoreRateLimits(client: PoolClient) {
    if (
      this.#rateLimitBefore === undefined ||
      this.#rateLimitExpected === undefined
    ) {
      return
    }
    const current = await this.#readRateLimits(client)
    if (this.#pendingRateLimitRequests.size !== 0) {
      throw new TypeError('M42 rate-limit request remained pending')
    }
    assertExactRateLimitState(current, this.#rateLimitExpected)
    const beforeByKey = new Map(
      this.#rateLimitBefore.map((row) => [row.key, row]),
    )
    for (const expected of this.#rateLimitExpected) {
      const before = beforeByKey.get(expected.key)
      if (before === undefined) {
        const deleted = await client.query<{ id: string }>(
          `delete from rate_limits
           where id = $1::uuid and key = $2 and count = $3
             and last_request = $4::bigint
           returning id`,
          [expected.id, expected.key, expected.count, expected.lastRequest],
        )
        if (deleted.rows.length !== 1) {
          throw new TypeError('M42 could not remove an exact rate-limit row')
        }
      } else {
        const restored = await client.query<{ id: string }>(
          `update rate_limits
           set id = $1::uuid, count = $2, last_request = $3::bigint
           where id = $4::uuid and key = $5 and count = $6
             and last_request = $7::bigint
           returning id`,
          [
            before.id,
            before.count,
            before.lastRequest,
            expected.id,
            expected.key,
            expected.count,
            expected.lastRequest,
          ],
        )
        if (restored.rows.length !== 1) {
          throw new TypeError('M42 could not restore an exact rate-limit row')
        }
      }
    }
    const restored = await this.#readRateLimits(client)
    assertExactRateLimitState(restored, this.#rateLimitBefore)
  }

  async #cleanupDatabase(restoreRateLimits: boolean) {
    await requireExactTestDatabase(this.pool)
    const client = await this.pool.connect()
    try {
      await client.query('begin')
      await client.query(`set local lock_timeout = '5s'`)
      await client.query(`set local statement_timeout = '15s'`)
      await requireExactTestDatabase(client)
      const ownerIds = [...this.#ownerIds.values()]
      if (ownerIds.length > 0) {
        const exactUsers = await client.query<{
          id: string
          email: string
          usernameIdentityKey: string
        }>(
          `select id, email, username_identity_key as "usernameIdentityKey"
           from users
           where id = any($1::uuid[])
           order by id
           for update`,
          [ownerIds],
        )
        if (exactUsers.rows.length !== 2) {
          throw new TypeError('M42 cleanup requires both exact owners')
        }
        for (const ownerKey of ['a', 'b'] as const) {
          const matches = exactUsers.rows.filter(
            (row) =>
              row.id === this.#ownerIds.get(ownerKey) &&
              row.email === this.owners[ownerKey].email &&
              row.usernameIdentityKey ===
                this.owners[ownerKey].usernameIdentityKey,
          )
          if (matches.length !== 1) {
            throw new TypeError('M42 cleanup found an inexact user identity')
          }
        }
        const deletedUsers = await client.query<{ id: string }>(
          `delete from users
           where id = any($1::uuid[])
             and lower(email) = any($2::text[])
             and username_identity_key = any($3::text[])
           returning id`,
          [
            ownerIds,
            [this.owners.a.email, this.owners.b.email],
            [
              this.owners.a.usernameIdentityKey,
              this.owners.b.usernameIdentityKey,
            ],
          ],
        )
        if (deletedUsers.rows.length !== 2) {
          throw new TypeError('M42 cleanup could not remove exact users')
        }
      }
      await client.query(
        `delete from verifications
         where identifier = any($1::text[])`,
        [
          [
            this.owners.a.email,
            this.owners.b.email,
            this.unknownRecoveryEmail,
            `email-verification:${this.owners.a.email}`,
            `email-verification:${this.owners.b.email}`,
          ],
        ],
      )
      const deletedCatalogue = await client.query<{ id: string }>(
        `delete from anime_catalogue_items
         where id = $1::uuid and english_title = $2
         returning id`,
        [this.catalogueItemId, this.catalogueTitle],
      )
      if (this.#setupComplete && deletedCatalogue.rows.length !== 1) {
        throw new TypeError('M42 cleanup could not remove catalogue fixture')
      }
      if (restoreRateLimits) {
        await this.#restoreRateLimits(client)
      }
      await this.#assertZeroResidue(client)
      await client.query('commit')
      this.#setupComplete = false
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  }

  async #assertZeroResidue(client: PoolClient) {
    const ownerIds = [...this.#ownerIds.values()]
    const entryIds = [...this.#entryIds.values()]
    const result = await client.query<Record<string, number>>(
      `select
        (select count(*)::int from users where id = any($1::uuid[])) as users,
        (select count(*)::int from accounts where user_id = any($1::uuid[])) as accounts,
        (select count(*)::int from sessions where user_id = any($1::uuid[])) as sessions,
        (select count(*)::int from verifications
          where reset_owner_user_id = any($1::uuid[])
             or identifier = any($2::text[])) as verifications,
        (select count(*)::int from user_catalogue_preferences
          where user_id = any($1::uuid[])) as preferences,
        (select count(*)::int from anime_entries
          where id = any($3::uuid[]) or user_id = any($1::uuid[])
             or catalogue_item_id = $4::uuid) as entries,
        (select count(*)::int from account_deletion_requests
          where user_id = any($1::uuid[])) as deletion_requests,
        (select count(*)::int from deletion_challenges
          where user_id = any($1::uuid[])) as deletion_challenges,
        (select count(*)::int from username_change_challenges
          where user_id = any($1::uuid[])) as username_challenges,
        (select count(*)::int from username_change_records
          where user_id = any($1::uuid[])) as username_records,
        (select count(*)::int from anime_alternative_titles
          where catalogue_item_id = $4::uuid) as alternative_titles,
        (select count(*)::int from anime_catalogue_sources
          where catalogue_item_id = $4::uuid) as catalogue_sources,
        (select count(*)::int from anime_catalogue_items
          where id = $4::uuid or english_title = $5) as catalogue_items`,
      [
        ownerIds,
        [
          this.owners.a.email,
          this.owners.b.email,
          this.unknownRecoveryEmail,
          `email-verification:${this.owners.a.email}`,
          `email-verification:${this.owners.b.email}`,
        ],
        entryIds,
        this.catalogueItemId,
        this.catalogueTitle,
      ],
    )
    const row = result.rows[0]
    if (row === undefined || Object.values(row).some((count) => count !== 0)) {
      throw new TypeError('M42 account lifecycle fixture residue remains')
    }
  }
}

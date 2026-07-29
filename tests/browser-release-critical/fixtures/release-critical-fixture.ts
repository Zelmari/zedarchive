import { randomUUID } from 'node:crypto'
import { Pool, type PoolClient } from 'pg'
import { LoopbackAuthCollectors } from './loopback-auth-collectors'
import {
  releaseCriticalCatalogueItemId,
  releaseCriticalCatalogueTitle,
} from './release-critical-constants'

type RateLimitSnapshot = Readonly<{
  id: string
  key: string
  count: number
  lastRequest: string
}>

type EntryCorroboration = Readonly<{
  count: number
  status: string | null
}>

const exactAuthRateLimitKeys = [
  '127.0.0.1|/sign-up/email',
  '127.0.0.1|/sign-in/email',
  '127.0.0.1|/verify-email',
  '127.0.0.1|/sign-out',
] as const

function explicitTestDatabaseUrl() {
  const value = process.env.DATABASE_TEST_URL
  if (value === undefined || value.trim() === '' || value !== value.trim()) {
    throw new TypeError('M41 requires an explicit DATABASE_TEST_URL')
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new TypeError('M41 requires a valid DATABASE_TEST_URL')
  }
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    parsed.pathname.slice(1) !== 'zedarchive_test'
  ) {
    throw new TypeError('M41 requires the exact zedarchive_test database URL')
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
    throw new TypeError('M41 database target is not allowed')
  }
}

function createFixtureIdentity() {
  const marker = randomUUID().replaceAll('-', '')
  return {
    email: `m41-${marker}@example.test`,
    username: `M41${marker.slice(0, 14)}`,
    usernameIdentityKey: `m41${marker.slice(0, 14)}`,
    password: `M41-${randomUUID()}-${randomUUID()}`,
  } as const
}

export class ReleaseCriticalFixture {
  readonly identity = createFixtureIdentity()
  readonly catalogueItemId = releaseCriticalCatalogueItemId
  readonly catalogueTitle = releaseCriticalCatalogueTitle
  readonly pool = new Pool({ connectionString: explicitTestDatabaseUrl() })
  readonly collectors: LoopbackAuthCollectors

  #catalogueInserted = false
  #userIds = new Set<string>()
  #rateLimitSnapshot: RateLimitSnapshot[] | undefined

  constructor() {
    const fromAddress = process.env.AUTH_EMAIL_FROM
    const replyToAddress = process.env.AUTH_EMAIL_REPLY_TO
    if (!fromAddress || !replyToAddress) {
      throw new TypeError('M41 email sender environment is unavailable')
    }

    this.collectors = new LoopbackAuthCollectors({
      recipient: this.identity.email,
      fromAddress,
      replyToAddress,
    })
  }

  async guardDatabase() {
    await requireExactTestDatabase(this.pool)
  }

  async setupCatalogue() {
    await this.guardDatabase()
    const conflict = await this.pool.query<{ count: number }>(
      `select count(*)::int as count
       from anime_catalogue_items
       where id = $1::uuid or english_title = $2`,
      [this.catalogueItemId, this.catalogueTitle],
    )
    if (conflict.rows[0]?.count !== 0) {
      throw new TypeError('M41 catalogue fixture identity is not clean')
    }

    await this.pool.query(
      `insert into anime_catalogue_items (
         id, english_title, original_title, format, release_status,
         release_year, episode_count, maturity, catalogue_state
       ) values ($1::uuid, $2, $3, 'tv', 'finished', 2026, 12, 'safe', 'published')`,
      [
        this.catalogueItemId,
        this.catalogueTitle,
        'M41 Release Critical Original',
      ],
    )
    this.#catalogueInserted = true
  }

  async snapshotRateLimits() {
    await this.guardDatabase()
    if (this.#rateLimitSnapshot !== undefined) {
      throw new TypeError('M41 rate limits were already snapshotted')
    }
    this.#rateLimitSnapshot = await this.#readRateLimits()
  }

  async discoverRegisteredUser(): Promise<string> {
    await this.guardDatabase()
    const result = await this.pool.query<{
      id: string
      email: string
      usernameIdentityKey: string
    }>(
      `select id, email, username_identity_key as "usernameIdentityKey"
       from users
       where lower(email) = lower($1)
          or username_identity_key = $2
       order by id`,
      [this.identity.email, this.identity.usernameIdentityKey],
    )

    if (
      result.rows.length !== 1 ||
      result.rows[0]?.email !== this.identity.email ||
      result.rows[0]?.usernameIdentityKey !== this.identity.usernameIdentityKey
    ) {
      throw new TypeError('M41 registered user identity is not exact')
    }

    this.#userIds.add(result.rows[0].id)
    return result.rows[0].id
  }

  async corroborateEntry(userId: string): Promise<EntryCorroboration> {
    await this.guardDatabase()
    if (!this.#userIds.has(userId)) {
      throw new TypeError('M41 entry corroboration owner is not tracked')
    }
    const result = await this.pool.query<{
      count: number
      status: string | null
    }>(
      `select count(*)::int as count, min(status) as status
       from anime_entries
       where user_id = $1::uuid and catalogue_item_id = $2::uuid`,
      [userId, this.catalogueItemId],
    )
    return result.rows[0] ?? { count: 0, status: null }
  }

  async cleanup(): Promise<void> {
    let cleanupError: unknown
    try {
      await this.#cleanupDatabase()
    } catch (error) {
      cleanupError = error
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

    if (cleanupError !== undefined) {
      throw cleanupError
    }
  }

  async #cleanupDatabase() {
    await this.guardDatabase()
    const client = await this.pool.connect()
    try {
      await client.query('begin')
      await requireExactTestDatabase(client)

      const users = await client.query<{
        id: string
        email: string
        usernameIdentityKey: string
      }>(
        `select id, email, username_identity_key as "usernameIdentityKey"
         from users
         where lower(email) = lower($1)
            or username_identity_key = $2
         order by id
         for update`,
        [this.identity.email, this.identity.usernameIdentityKey],
      )
      for (const user of users.rows) {
        if (
          user.email !== this.identity.email ||
          user.usernameIdentityKey !== this.identity.usernameIdentityKey
        ) {
          throw new TypeError('M41 cleanup found an inexact user identity')
        }
        this.#userIds.add(user.id)
      }

      const trackedUserIds = [...this.#userIds]
      if (trackedUserIds.length > 0) {
        await client.query(
          `delete from anime_entries
           where user_id = any($1::uuid[])
             and catalogue_item_id = $2::uuid`,
          [trackedUserIds, this.catalogueItemId],
        )
        const deletedUsers = await client.query<{ id: string }>(
          `delete from users
           where id = any($1::uuid[])
             and lower(email) = lower($2)
             and username_identity_key = $3
           returning id`,
          [
            trackedUserIds,
            this.identity.email,
            this.identity.usernameIdentityKey,
          ],
        )
        if (deletedUsers.rows.length !== trackedUserIds.length) {
          throw new TypeError('M41 cleanup could not remove exact users')
        }
      }

      await client.query(
        `delete from verifications
         where identifier = any($1::text[])`,
        [[this.identity.email, `email-verification:${this.identity.email}`]],
      )

      if (this.#catalogueInserted) {
        const deleted = await client.query<{ id: string }>(
          `delete from anime_catalogue_items
           where id = $1::uuid and english_title = $2
           returning id`,
          [this.catalogueItemId, this.catalogueTitle],
        )
        if (deleted.rows.length !== 1) {
          throw new TypeError('M41 cleanup could not remove catalogue fixture')
        }
        this.#catalogueInserted = false
      }

      await this.#restoreRateLimits(client)
      await this.#assertZeroResidue(client, trackedUserIds)
      await client.query('commit')
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  }

  async #readRateLimits(
    queryable: Pick<Pool, 'query'> | Pick<PoolClient, 'query'> = this.pool,
  ) {
    const result = await queryable.query<RateLimitSnapshot>(
      `select id, key, count, last_request::text as "lastRequest"
       from rate_limits
       where key = any($1::text[])
       order by key`,
      [[...exactAuthRateLimitKeys]],
    )
    return result.rows
  }

  async #restoreRateLimits(client: PoolClient) {
    if (this.#rateLimitSnapshot === undefined) {
      return
    }

    const desired = new Map(
      this.#rateLimitSnapshot.map((row) => [row.key, row]),
    )
    const current = await this.#readRateLimits(client)

    for (const row of current) {
      if (!desired.has(row.key)) {
        const deleted = await client.query<{ id: string }>(
          `delete from rate_limits
           where id = $1::uuid and key = $2
           returning id`,
          [row.id, row.key],
        )
        if (deleted.rows.length !== 1) {
          throw new TypeError('M41 could not remove an exact rate-limit row')
        }
      }
    }

    for (const row of this.#rateLimitSnapshot) {
      await client.query(
        `insert into rate_limits (id, key, count, last_request)
         values ($1::uuid, $2, $3, $4::bigint)
         on conflict (key) do update
         set id = excluded.id,
             count = excluded.count,
             last_request = excluded.last_request`,
        [row.id, row.key, row.count, row.lastRequest],
      )
    }

    const restored = await this.#readRateLimits(client)
    if (JSON.stringify(restored) !== JSON.stringify(this.#rateLimitSnapshot)) {
      throw new TypeError('M41 rate-limit restoration was not exact')
    }
  }

  async #assertZeroResidue(client: PoolClient, trackedUserIds: string[]) {
    const result = await client.query<{
      accounts: number
      accountDeletionRequests: number
      alternativeTitles: number
      catalogueItems: number
      catalogueSources: number
      deletionChallenges: number
      entries: number
      preferences: number
      sessions: number
      users: number
      verifications: number
      usernameChangeChallenges: number
      usernameChangeRecords: number
    }>(
      `select
        (select count(*)::int from users
          where lower(email) = lower($1) or username_identity_key = $2) as users,
        (select count(*)::int from accounts
          where user_id = any($3::uuid[])) as accounts,
        (select count(*)::int from sessions
          where user_id = any($3::uuid[])) as sessions,
        (select count(*)::int from user_catalogue_preferences
          where user_id = any($3::uuid[])) as preferences,
        (select count(*)::int from username_change_records
          where user_id = any($3::uuid[])) as "usernameChangeRecords",
        (select count(*)::int from username_change_challenges
          where user_id = any($3::uuid[])) as "usernameChangeChallenges",
        (select count(*)::int from account_deletion_requests
          where user_id = any($3::uuid[])) as "accountDeletionRequests",
        (select count(*)::int from deletion_challenges
          where user_id = any($3::uuid[])) as "deletionChallenges",
        (select count(*)::int from anime_entries
          where user_id = any($3::uuid[])
             or catalogue_item_id = $4::uuid) as entries,
        (select count(*)::int from verifications
          where identifier = any($5::text[])) as verifications,
        (select count(*)::int from anime_alternative_titles
          where catalogue_item_id = $4::uuid) as "alternativeTitles",
        (select count(*)::int from anime_catalogue_sources
          where catalogue_item_id = $4::uuid) as "catalogueSources",
        (select count(*)::int from anime_catalogue_items
          where id = $4::uuid or english_title = $6) as "catalogueItems"`,
      [
        this.identity.email,
        this.identity.usernameIdentityKey,
        trackedUserIds,
        this.catalogueItemId,
        [this.identity.email, `email-verification:${this.identity.email}`],
        this.catalogueTitle,
      ],
    )

    const row = result.rows[0]
    if (row === undefined || Object.values(row).some((count) => count !== 0)) {
      throw new TypeError('M41 fixture residue remains')
    }
  }
}

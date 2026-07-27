import { randomUUID } from 'node:crypto'
import { CasingCache } from 'drizzle-orm/casing'
import { drizzle } from 'drizzle-orm/node-postgres'
import { PgDialect } from 'drizzle-orm/pg-core'
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
  archiveBackupMaximumAlternativeTitles,
  archiveBackupMaximumBytes,
  archiveBackupMaximumEntries,
  archiveBackupMaximumTitleBytes,
} from '@/features/archive-backup/domain/archive-backup'
import { readArchiveBackup } from '@/server/database/archive-backup-service'
import {
  animeAlternativeTitles,
  animeCatalogueItems,
  animeCatalogueSources,
  animeEntries,
  userCataloguePreferences,
  users,
} from '@/server/database/schema'
import { assertSafeTestDatabaseName } from '@/test/database/global-setup'

const { databaseTestUrl } = readDatabaseTestEnvironment()
const pool = new Pool({ connectionString: databaseTestUrl })
const database = drizzle({ client: pool })
const queryDialect = new PgDialect()
const queryCasing = new CasingCache()

beforeAll(async () => {
  const result = await pool.query<{ databaseName: string }>(
    'select current_database() as "databaseName"',
  )
  assertSafeTestDatabaseName(result.rows[0]?.databaseName)
})

async function resetArchiveBackupFixtures() {
  await pool.query(
    `truncate table anime_entries, anime_alternative_titles, anime_catalogue_items, rate_limits, verifications, sessions, accounts, users restart identity cascade`,
  )
}

async function createArchiveBackupUser(prefix = 'Backup') {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const username = `${prefix.slice(0, 8)}${suffix}`
  const [user] = await database
    .insert(users)
    .values({
      username,
      usernameIdentityKey: username.toLowerCase(),
      email: `${suffix}@example.test`,
      emailVerified: true,
    })
    .returning()
  if (user === undefined) throw new Error('Expected user fixture')
  return user
}

async function addArchiveEntries(userId: string, count: number, title: string) {
  const chunkSize = 250
  for (let remaining = count; remaining > 0; remaining -= chunkSize) {
    const batchSize = Math.min(remaining, chunkSize)
    await pool.query(
      `
        with inserted_items as (
          insert into anime_catalogue_items
            (english_title, format, release_status, maturity, catalogue_state)
          select $2, 'tv', 'finished', 'safe', 'published'
            from generate_series(1, $3)
          returning id
        )
        insert into anime_entries (user_id, catalogue_item_id, status)
        select $1::uuid, id, 'planned' from inserted_items
      `,
      [userId, title, batchSize],
    )
  }
}

function deferred() {
  let resolve: (() => void) | undefined
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve: () => resolve?.() }
}

async function waitForLock(pid: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await pool.query<{ waiting: boolean }>(
      `select coalesce(
        (select wait_event_type = 'Lock' from pg_stat_activity where pid = $1),
        false
      ) as waiting`,
      [pid],
    )
    if (result.rows[0]?.waiting) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('Expected lifecycle operation to wait on the export lock')
}

async function waitForAdvisoryLockWait(lockKey: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await pool.query<{ waiting: boolean }>(
      `select exists (
         select 1
           from pg_locks
          where locktype = 'advisory'
            and objid = $1::oid
            and granted = false
       ) as waiting`,
      [lockKey],
    )
    if (result.rows[0]?.waiting) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('Expected payload statement to wait on the snapshot barrier')
}

function collectPropertyNames(value: unknown, names = new Set<string>()) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectPropertyNames(item, names))
    return names
  }
  if (value === null || typeof value !== 'object') return names
  Object.entries(value).forEach(([name, child]) => {
    names.add(name)
    collectPropertyNames(child, names)
  })
  return names
}

beforeEach(resetArchiveBackupFixtures)
afterEach(resetArchiveBackupFixtures)

afterAll(async () => {
  await pool.end()
})

describe('readArchiveBackup', () => {
  it('returns no bytes for unavailable accounts', async () => {
    await expect(
      readArchiveBackup(database, { userId: randomUUID() }),
    ).resolves.toEqual({ kind: 'account_unavailable' })
  })

  it('returns the exact canonical empty archive and established preference defaults', async () => {
    const user = await createArchiveBackupUser('Defaults')

    const result = await readArchiveBackup(database, { userId: user.id })
    expect(result.kind).toBe('backup_ready')
    if (result.kind !== 'backup_ready') return

    const text = new TextDecoder().decode(result.bytes)
    expect(text).toMatch(
      /^\{"schema":"zedarchive\.archive-backup","version":1,"exportedAt":"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z","settings":\{"anime":\{"titleLanguage":"english","adultContentEnabled":false\}\},"archive":\{"anime":\{"entries":\[\]\}\}\}$/u,
    )
    expect(JSON.parse(text)).toMatchObject({
      settings: {
        anime: { titleLanguage: 'english', adultContentEnabled: false },
      },
      archive: { anime: { entries: [] } },
    })
  })

  it('rejects an oversized stored title before a payload can be returned', async () => {
    const user = await createArchiveBackupUser('Oversize')
    const [item] = await database
      .insert(animeCatalogueItems)
      .values({
        englishTitle: 'x'.repeat(4097),
        format: 'tv',
        releaseStatus: 'finished',
        maturity: 'safe',
        catalogueState: 'published',
      })
      .returning()
    if (item === undefined) throw new Error('Expected catalogue fixture')
    await database
      .insert(animeEntries)
      .values({ userId: user.id, catalogueItemId: item.id, status: 'planned' })

    await expect(
      readArchiveBackup(database, { userId: user.id }),
    ).resolves.toEqual({
      kind: 'too_large',
    })
  })

  it('does not issue the payload aggregation statement when preflight rejects an extreme title', async () => {
    const user = await createArchiveBackupUser('Shape')
    const [item] = await database
      .insert(animeCatalogueItems)
      .values({
        englishTitle: 'x'.repeat(archiveBackupMaximumTitleBytes + 1),
        format: 'tv',
        releaseStatus: 'finished',
        maturity: 'safe',
        catalogueState: 'published',
      })
      .returning()
    if (item === undefined) throw new Error('Expected catalogue fixture')
    await database
      .insert(animeEntries)
      .values({ userId: user.id, catalogueItemId: item.id, status: 'planned' })

    const executedStatements: string[] = []
    const tracedDatabase = {
      transaction: async (
        callback: (transaction: never) => Promise<unknown>,
        options: { isolationLevel: 'read committed' },
      ) =>
        database.transaction(async (transaction) => {
          const execute = transaction.execute.bind(transaction)
          const mutableTransaction = transaction as unknown as {
            execute: (
              ...arguments_: Parameters<typeof transaction.execute>
            ) => ReturnType<typeof transaction.execute>
          }
          mutableTransaction.execute = (...arguments_) => {
            const [statement] = arguments_
            if (
              statement !== undefined &&
              typeof statement === 'object' &&
              'getSQL' in statement &&
              typeof statement.getSQL === 'function'
            ) {
              executedStatements.push(
                statement.getSQL().toQuery({
                  casing: queryCasing,
                  escapeName: queryDialect.escapeName,
                  escapeParam: queryDialect.escapeParam,
                  escapeString: queryDialect.escapeString,
                }).sql,
              )
            }
            return execute(...arguments_)
          }
          return callback(transaction as never)
        }, options),
    }

    await expect(
      readArchiveBackup(tracedDatabase as never, { userId: user.id }),
    ).resolves.toEqual({ kind: 'too_large' })
    expect(
      executedStatements.some((statement) =>
        statement.includes('with owner_entries as materialized'),
      ),
    ).toBe(true)
    expect(
      executedStatements.some((statement) => statement.includes('string_agg')),
    ).toBe(false)
  })

  it('rejects a title bound introduced after preflight before payload aggregation', async () => {
    const user = await createArchiveBackupUser('Race')
    const [item] = await database
      .insert(animeCatalogueItems)
      .values({
        englishTitle: 'M35 post-preflight title',
        format: 'tv',
        releaseStatus: 'finished',
        maturity: 'safe',
        catalogueState: 'published',
      })
      .returning()
    if (item === undefined) throw new Error('Expected catalogue fixture')
    await database
      .insert(animeEntries)
      .values({ userId: user.id, catalogueItemId: item.id, status: 'planned' })

    await expect(
      readArchiveBackup(
        database,
        { userId: user.id },
        {
          afterPreflight: async () => {
            await pool.query(
              `update anime_catalogue_items
                  set english_title = repeat('x', $2)
                where id = $1::uuid`,
              [item.id, archiveBackupMaximumTitleBytes + 1],
            )
          },
        },
      ),
    ).resolves.toEqual({ kind: 'too_large' })
  })

  it('returns one wholly old statement snapshot when preferences and entries change while payload aggregation waits', async () => {
    const user = await createArchiveBackupUser('Snapshot')
    const [item] = await database
      .insert(animeCatalogueItems)
      .values({
        englishTitle: 'M35 old snapshot title',
        format: 'tv',
        releaseStatus: 'finished',
        maturity: 'safe',
        catalogueState: 'published',
      })
      .returning()
    if (item === undefined) throw new Error('Expected catalogue fixture')
    await database.insert(userCataloguePreferences).values({
      userId: user.id,
      titleLanguage: 'english',
      adultContentEnabled: false,
    })
    const [entry] = await database
      .insert(animeEntries)
      .values({ userId: user.id, catalogueItemId: item.id, status: 'planned' })
      .returning()
    if (entry === undefined) throw new Error('Expected entry fixture')

    const lockKey = 35_035
    const lockHolder = await pool.connect()
    const mutationClient = await pool.connect()
    try {
      await lockHolder.query('select pg_advisory_lock($1::bigint)', [lockKey])
      const exportPromise = readArchiveBackup(
        database,
        { userId: user.id },
        { payloadStatementBarrierKey: lockKey },
      )
      await waitForAdvisoryLockWait(lockKey)

      await mutationClient.query('begin')
      await mutationClient.query(
        `update user_catalogue_preferences
            set title_language = 'romaji', adult_content_enabled = true
          where user_id = $1::uuid`,
        [user.id],
      )
      await mutationClient.query(
        `update anime_entries set status = 'completed' where id = $1::uuid`,
        [entry.id],
      )
      await mutationClient.query('commit')

      await lockHolder.query('select pg_advisory_unlock($1::bigint)', [lockKey])
      const result = await exportPromise
      expect(result.kind).toBe('backup_ready')
      if (result.kind !== 'backup_ready') return
      const document = JSON.parse(new TextDecoder().decode(result.bytes))
      expect(document.settings.anime).toEqual({
        titleLanguage: 'english',
        adultContentEnabled: false,
      })
      expect(document.archive.anime.entries[0].tracking.status).toBe('planned')
    } finally {
      await lockHolder
        .query('select pg_advisory_unlock($1::bigint)', [lockKey])
        .catch(() => undefined)
      await mutationClient.query('rollback').catch(() => undefined)
      lockHolder.release()
      mutationClient.release()
    }
  })

  it('allows an in-flight export to finish before a deletion request takes the user lock', async () => {
    const user = await createArchiveBackupUser('Lock')
    const preflightStarted = deferred()
    const releaseExport = deferred()
    const exportPromise = readArchiveBackup(
      database,
      { userId: user.id },
      {
        afterPreflight: async () => {
          preflightStarted.resolve()
          await releaseExport.promise
        },
      },
    )
    await preflightStarted.promise

    const lifecycleClient = await pool.connect()
    try {
      await lifecycleClient.query('begin')
      const lifecyclePid = await lifecycleClient.query<{ pid: number }>(
        'select pg_backend_pid() as pid',
      )
      const lifecycleLock = lifecycleClient.query(
        'select id from users where id = $1::uuid for update',
        [user.id],
      )
      await waitForLock(lifecyclePid.rows[0]!.pid)

      releaseExport.resolve()
      await expect(exportPromise).resolves.toMatchObject({
        kind: 'backup_ready',
      })
      await lifecycleLock
      await lifecycleClient.query(
        `with lifecycle_clock as (select clock_timestamp() as requested_at)
         insert into account_deletion_requests (user_id, requested_at, purge_after)
         select $1::uuid, requested_at, requested_at + interval '336 hours'
           from lifecycle_clock`,
        [user.id],
      )
      await lifecycleClient.query('commit')

      await expect(
        readArchiveBackup(database, { userId: user.id }),
      ).resolves.toEqual({
        kind: 'account_unavailable',
      })
    } finally {
      releaseExport.resolve()
      await lifecycleClient.query('rollback').catch(() => undefined)
      lifecycleClient.release()
    }
  })

  it('allows an in-flight export to finish before a purge delete takes the user lock', async () => {
    const user = await createArchiveBackupUser('PurgeLock')
    const preflightStarted = deferred()
    const releaseExport = deferred()
    const exportPromise = readArchiveBackup(
      database,
      { userId: user.id },
      {
        afterPreflight: async () => {
          preflightStarted.resolve()
          await releaseExport.promise
        },
      },
    )
    await preflightStarted.promise

    const purgeClient = await pool.connect()
    try {
      await purgeClient.query('begin')
      const purgePid = await purgeClient.query<{ pid: number }>(
        'select pg_backend_pid() as pid',
      )
      const purgeDelete = purgeClient.query(
        'delete from users where id = $1::uuid',
        [user.id],
      )
      await waitForLock(purgePid.rows[0]!.pid)

      releaseExport.resolve()
      await expect(exportPromise).resolves.toMatchObject({
        kind: 'backup_ready',
      })
      await purgeDelete
      await purgeClient.query('commit')
      await expect(
        readArchiveBackup(database, { userId: user.id }),
      ).resolves.toEqual({
        kind: 'account_unavailable',
      })
    } finally {
      releaseExport.resolve()
      await purgeClient.query('rollback').catch(() => undefined)
      purgeClient.release()
    }
  })

  it('accepts exactly bounded titles and alternatives, then rejects 101 alternatives without bytes', async () => {
    const user = await createArchiveBackupUser('Alternatives')
    const [item] = await database
      .insert(animeCatalogueItems)
      .values({
        englishTitle: 'x'.repeat(archiveBackupMaximumTitleBytes),
        format: 'tv',
        releaseStatus: 'finished',
        maturity: 'safe',
        catalogueState: 'published',
      })
      .returning()
    if (item === undefined) throw new Error('Expected catalogue fixture')
    await database.insert(animeEntries).values({
      userId: user.id,
      catalogueItemId: item.id,
      status: 'planned',
    })
    await database.insert(animeAlternativeTitles).values(
      Array.from(
        { length: archiveBackupMaximumAlternativeTitles },
        (_, index) => ({
          catalogueItemId: item.id,
          title: `Alternative ${index}`,
          position: index,
        }),
      ),
    )

    await expect(
      readArchiveBackup(database, { userId: user.id }),
    ).resolves.toMatchObject({
      kind: 'backup_ready',
    })

    await database.insert(animeAlternativeTitles).values({
      catalogueItemId: item.id,
      title: 'Alternative 100',
      position: archiveBackupMaximumAlternativeTitles,
    })
    await expect(
      readArchiveBackup(database, { userId: user.id }),
    ).resolves.toEqual({
      kind: 'too_large',
    })
  })

  it('excludes another owner and rejects the 10,001st entry before returning bytes', async () => {
    const owner = await createArchiveBackupUser('Count')
    const otherOwner = await createArchiveBackupUser('Other')
    await addArchiveEntries(owner.id, archiveBackupMaximumEntries, 'M35 count')
    await addArchiveEntries(otherOwner.id, 1, 'M35 other owner sentinel')

    await expect(
      readArchiveBackup(database, { userId: owner.id }),
    ).resolves.toMatchObject({ kind: 'backup_ready' })
    await addArchiveEntries(owner.id, 1, 'M35 10001st entry')

    await expect(
      readArchiveBackup(database, { userId: owner.id }),
    ).resolves.toEqual({
      kind: 'too_large',
    })
    const otherResult = await readArchiveBackup(database, {
      userId: otherOwner.id,
    })
    expect(otherResult.kind).toBe('backup_ready')
    if (otherResult.kind !== 'backup_ready') return
    expect(new TextDecoder().decode(otherResult.bytes)).toContain(
      'M35 other owner sentinel',
    )
  })

  it('permits an exactly 10 MiB document and rejects the next UTF-8 byte', async () => {
    const user = await createArchiveBackupUser('Bytes')
    const entryCount = 2500
    const baseTitleLength = 2000
    await addArchiveEntries(user.id, entryCount, 'x'.repeat(baseTitleLength))

    const baseline = await readArchiveBackup(database, { userId: user.id })
    expect(baseline.kind).toBe('backup_ready')
    if (baseline.kind !== 'backup_ready') return
    const additionalBytes =
      archiveBackupMaximumBytes - baseline.bytes.byteLength
    expect(additionalBytes).toBeGreaterThan(0)
    const perTitleBytes = Math.floor(additionalBytes / entryCount)
    const remainder = additionalBytes % entryCount
    expect(baseTitleLength + perTitleBytes + 1).toBeLessThanOrEqual(
      archiveBackupMaximumTitleBytes,
    )

    await pool.query(
      `
        with ordered_items as (
          select c.id, row_number() over (order by c.id) as position
            from anime_catalogue_items c
            join anime_entries e on e.catalogue_item_id = c.id
           where e.user_id = $1::uuid
        )
        update anime_catalogue_items c
           set english_title = repeat(
             'x',
             $2::integer + $3::integer + case when ordered_items.position <= $4::bigint then 1 else 0 end
           )
          from ordered_items
         where c.id = ordered_items.id
      `,
      [user.id, baseTitleLength, perTitleBytes, remainder],
    )

    const exact = await readArchiveBackup(database, { userId: user.id })
    expect(exact.kind).toBe('backup_ready')
    if (exact.kind !== 'backup_ready') return
    expect(exact.bytes.byteLength).toBe(archiveBackupMaximumBytes)

    await pool.query(
      `
        update anime_catalogue_items
           set english_title = english_title || 'x'
         where id = (
           select c.id
             from anime_catalogue_items c
             join anime_entries e on e.catalogue_item_id = c.id
            where e.user_id = $1::uuid
            order by c.id
            limit 1
         )
      `,
      [user.id],
    )
    await expect(
      readArchiveBackup(database, { userId: user.id }),
    ).resolves.toEqual({
      kind: 'too_large',
    })
  })

  it('maps every tracking status and varied catalogue enum values in deterministic entry order', async () => {
    const user = await createArchiveBackupUser('Shapes')
    const shapes = [
      {
        status: 'planned' as const,
        format: 'tv' as const,
        releaseStatus: 'upcoming' as const,
        maturity: 'safe' as const,
      },
      {
        status: 'in_progress' as const,
        format: 'movie' as const,
        releaseStatus: 'airing' as const,
        maturity: 'sensitive' as const,
      },
      {
        status: 'on_hold' as const,
        format: 'ova' as const,
        releaseStatus: 'finished' as const,
        maturity: 'adult' as const,
      },
      {
        status: 'dropped' as const,
        format: 'ona' as const,
        releaseStatus: 'unknown' as const,
        maturity: 'unknown' as const,
      },
      {
        status: 'completed' as const,
        format: 'special' as const,
        releaseStatus: 'finished' as const,
        maturity: 'safe' as const,
      },
    ]
    for (const [index, shape] of shapes.entries()) {
      const [item] = await database
        .insert(animeCatalogueItems)
        .values({
          englishTitle: `M35 shape ${index}`,
          format: shape.format,
          releaseStatus: shape.releaseStatus,
          releaseYear: 2000 + index,
          episodeCount: index + 1,
          maturity: shape.maturity,
          catalogueState: 'published',
        })
        .returning()
      if (item === undefined) throw new Error('Expected catalogue fixture')
      await database.insert(animeEntries).values({
        userId: user.id,
        catalogueItemId: item.id,
        status: shape.status,
        episodeProgress: index,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
        updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
      })
    }

    const result = await readArchiveBackup(database, { userId: user.id })
    expect(result.kind).toBe('backup_ready')
    if (result.kind !== 'backup_ready') return
    const entries = JSON.parse(new TextDecoder().decode(result.bytes)).archive
      .anime.entries
    expect(entries).toHaveLength(shapes.length)
    expect(
      entries.map(
        (entry: { tracking: { status: string } }) => entry.tracking.status,
      ),
    ).toEqual(shapes.map((shape) => shape.status))
    expect(
      entries.map(
        (entry: { catalogue: { format: string; maturity: string } }) => [
          entry.catalogue.format,
          entry.catalogue.maturity,
        ],
      ),
    ).toEqual(shapes.map((shape) => [shape.format, shape.maturity]))
  })

  it('includes an owned adult entry when adult content is enabled', async () => {
    const user = await createArchiveBackupUser('AdultOn')
    const [item] = await database
      .insert(animeCatalogueItems)
      .values({
        englishTitle: 'M35 adult-on complete backup',
        format: 'movie',
        releaseStatus: 'finished',
        maturity: 'adult',
        catalogueState: 'published',
      })
      .returning()
    if (item === undefined) throw new Error('Expected catalogue fixture')
    await database.insert(userCataloguePreferences).values({
      userId: user.id,
      adultContentEnabled: true,
    })
    await database.insert(animeEntries).values({
      userId: user.id,
      catalogueItemId: item.id,
      status: 'completed',
    })

    const result = await readArchiveBackup(database, { userId: user.id })
    expect(result.kind).toBe('backup_ready')
    if (result.kind !== 'backup_ready') return
    const document = JSON.parse(new TextDecoder().decode(result.bytes))
    expect(document.settings.anime.adultContentEnabled).toBe(true)
    expect(document.archive.anime.entries).toEqual([
      expect.objectContaining({
        catalogue: expect.objectContaining({
          maturity: 'adult',
          titles: expect.objectContaining({
            english: 'M35 adult-on complete backup',
          }),
        }),
      }),
    ])
  })

  it('uses entry UUID as the deterministic tie-breaker for equal creation timestamps', async () => {
    const user = await createArchiveBackupUser('TieBreak')
    const [laterTitleItem, earlierTitleItem] = await database
      .insert(animeCatalogueItems)
      .values([
        {
          englishTitle: 'M35 UUID second',
          format: 'tv',
          releaseStatus: 'finished',
          maturity: 'safe',
          catalogueState: 'published',
        },
        {
          englishTitle: 'M35 UUID first',
          format: 'tv',
          releaseStatus: 'finished',
          maturity: 'safe',
          catalogueState: 'published',
        },
      ])
      .returning()
    if (laterTitleItem === undefined || earlierTitleItem === undefined) {
      throw new Error('Expected catalogue fixtures')
    }
    const createdAt = new Date('2026-01-01T00:00:00.000Z')
    await database.insert(animeEntries).values([
      {
        id: '00000000-0000-4000-8000-000000000002',
        userId: user.id,
        catalogueItemId: laterTitleItem.id,
        status: 'planned',
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: '00000000-0000-4000-8000-000000000001',
        userId: user.id,
        catalogueItemId: earlierTitleItem.id,
        status: 'planned',
        createdAt,
        updatedAt: createdAt,
      },
    ])

    const result = await readArchiveBackup(database, { userId: user.id })
    expect(result.kind).toBe('backup_ready')
    if (result.kind !== 'backup_ready') return
    const entries = JSON.parse(new TextDecoder().decode(result.bytes)).archive
      .anime.entries
    expect(
      entries.map(
        (entry: { catalogue: { titles: { english: string } } }) =>
          entry.catalogue.titles.english,
      ),
    ).toEqual(['M35 UUID first', 'M35 UUID second'])
  })

  it('excludes the complete prohibited identity, auth, lifecycle, operational, and catalogue-source inventory', async () => {
    const user = await createArchiveBackupUser('Exclude')
    const otherUser = await createArchiveBackupUser('ExcludedOther')
    const [item] = await database
      .insert(animeCatalogueItems)
      .values({
        englishTitle: 'M35 portable catalogue context',
        format: 'tv',
        releaseStatus: 'finished',
        maturity: 'safe',
        catalogueState: 'hidden',
      })
      .returning()
    if (item === undefined) throw new Error('Expected catalogue fixture')
    const [entry] = await database
      .insert(animeEntries)
      .values({ userId: user.id, catalogueItemId: item.id, status: 'planned' })
      .returning()
    if (entry === undefined) throw new Error('Expected entry fixture')
    await database.insert(animeCatalogueSources).values({
      catalogueItemId: item.id,
      sourceKey: 'wikidata',
      sourceItemId: 'SYNTHETIC_SOURCE_ITEM_EXCLUDED',
    })

    const sessionId = randomUUID()
    const accountId = randomUUID()
    const verificationId = randomUUID()
    const now = new Date('2026-07-26T12:00:00.000Z')
    await pool.query(
      `insert into sessions
         (id, user_id, token, expires_at, ip_address, user_agent)
       values ($1, $2::uuid, 'SYNTHETIC_SESSION_TOKEN_EXCLUDED',
               $3::timestamptz + interval '1 hour', '192.0.2.1',
               'SYNTHETIC_USER_AGENT_EXCLUDED')`,
      [sessionId, user.id, now],
    )
    await pool.query(
      `insert into accounts
         (id, user_id, account_id, provider_id, access_token, refresh_token,
          id_token, scope, password)
       values ($1, $2::uuid, 'SYNTHETIC_ACCOUNT_ID_EXCLUDED',
               'SYNTHETIC_PROVIDER_EXCLUDED', 'SYNTHETIC_ACCESS_TOKEN_EXCLUDED',
               'SYNTHETIC_REFRESH_TOKEN_EXCLUDED', 'SYNTHETIC_ID_TOKEN_EXCLUDED',
               'SYNTHETIC_SCOPE_EXCLUDED', 'SYNTHETIC_PASSWORD_EXCLUDED')`,
      [accountId, user.id],
    )
    await pool.query(
      `insert into verifications (id, identifier, value, expires_at)
       values ($1, 'SYNTHETIC_VERIFICATION_OWNER_EXCLUDED',
               'SYNTHETIC_VERIFICATION_VALUE_EXCLUDED',
               $2::timestamptz + interval '1 hour')`,
      [verificationId, now],
    )
    await pool.query(
      `insert into deletion_challenges
         (user_id, session_id, code_digest, code_expires_at,
          reauthenticated_until, send_window_started_at, last_sent_at)
       values ($1::uuid, $2::uuid, $3,
               $4::timestamptz + interval '1 minute',
               $4::timestamptz + interval '2 minutes', $4, $4)`,
      [user.id, sessionId, 'a'.repeat(64), now],
    )
    await pool.query(
      `insert into username_change_records
         (user_id, changed_at, previous_username_identity_key,
          previous_username_reserved_until)
       values ($1::uuid, $2::timestamptz, 'syntheticformer',
               $2::timestamptz + interval '14 days')`,
      [user.id, now],
    )
    await pool.query(
      `insert into username_change_challenges
         (user_id, session_id, proposed_username, proposed_username_identity_key,
          code_digest, code_expires_at, reauthenticated_until,
          send_window_started_at, last_sent_at)
       values ($1::uuid, $2::uuid, 'SyntheticNext', 'syntheticnext', $3,
               $4::timestamptz + interval '1 minute',
               $4::timestamptz + interval '2 minutes', $4, $4)`,
      [user.id, sessionId, 'b'.repeat(64), now],
    )
    await pool.query(
      `insert into account_deletion_requests (user_id, requested_at, purge_after)
       values ($1::uuid, $2::timestamptz,
               $2::timestamptz + interval '336 hours')`,
      [otherUser.id, now],
    )
    await pool.query(
      `insert into rate_limits (id, key, count, last_request)
       values ($1::uuid, 'SYNTHETIC_RATE_LIMIT_EXCLUDED', 1, 1)`,
      [randomUUID()],
    )

    const inventory = await pool.query(
      `select
         (select count(*)::int from users where id in ($1::uuid, $2::uuid)) as users,
         (select count(*)::int from accounts where user_id = $1::uuid) as accounts,
         (select count(*)::int from sessions where user_id = $1::uuid) as sessions,
         (select count(*)::int from verifications where id = $3::uuid) as verifications,
         (select count(*)::int from deletion_challenges where user_id = $1::uuid) as deletion_challenges,
         (select count(*)::int from account_deletion_requests where user_id = $2::uuid) as deletion_requests,
         (select count(*)::int from username_change_records where user_id = $1::uuid) as username_records,
         (select count(*)::int from username_change_challenges where user_id = $1::uuid) as username_challenges,
         (select count(*)::int from account_purge_run_heartbeats where singleton) as purge_heartbeats,
         (select count(*)::int from rate_limits where key = 'SYNTHETIC_RATE_LIMIT_EXCLUDED') as rate_limits,
         (select count(*)::int from anime_catalogue_sources where catalogue_item_id = $4::uuid) as catalogue_sources`,
      [user.id, otherUser.id, verificationId, item.id],
    )
    expect(inventory.rows).toEqual([
      {
        users: 2,
        accounts: 1,
        sessions: 1,
        verifications: 1,
        deletion_challenges: 1,
        deletion_requests: 1,
        username_records: 1,
        username_challenges: 1,
        purge_heartbeats: 1,
        rate_limits: 1,
        catalogue_sources: 1,
      },
    ])

    const result = await readArchiveBackup(database, { userId: user.id })
    expect(result.kind).toBe('backup_ready')
    if (result.kind !== 'backup_ready') return
    const text = new TextDecoder().decode(result.bytes)
    const document = JSON.parse(text)
    const propertyNames = collectPropertyNames(document)
    const prohibitedPropertyNames = [
      'id',
      'userId',
      'username',
      'usernameIdentityKey',
      'email',
      'emailVerified',
      'image',
      'phoneNumber',
      'accountId',
      'providerId',
      'accessToken',
      'refreshToken',
      'idToken',
      'password',
      'sessionId',
      'token',
      'cookie',
      'secret',
      'verification',
      'resetOwnerUserId',
      'ipAddress',
      'userAgent',
      'challengeId',
      'codeDigest',
      'purgeAfter',
      'resultCategory',
      'catalogueItemId',
      'entryId',
      'sourceKey',
      'sourceItemId',
      'catalogueState',
      'createdAt',
      'updatedAt',
      'databaseUrl',
      'environment',
      'url',
      'sql',
      'error',
      'serverPath',
    ]
    expect(
      prohibitedPropertyNames.filter((name) => propertyNames.has(name)),
    ).toEqual([])
    const prohibitedSyntheticValues = [
      user.id,
      otherUser.id,
      entry.id,
      item.id,
      sessionId,
      accountId,
      verificationId,
      user.username,
      user.email,
      'SYNTHETIC_SOURCE_ITEM_EXCLUDED',
      'SYNTHETIC_SESSION_TOKEN_EXCLUDED',
      'SYNTHETIC_USER_AGENT_EXCLUDED',
      'SYNTHETIC_ACCOUNT_ID_EXCLUDED',
      'SYNTHETIC_PROVIDER_EXCLUDED',
      'SYNTHETIC_ACCESS_TOKEN_EXCLUDED',
      'SYNTHETIC_REFRESH_TOKEN_EXCLUDED',
      'SYNTHETIC_ID_TOKEN_EXCLUDED',
      'SYNTHETIC_SCOPE_EXCLUDED',
      'SYNTHETIC_PASSWORD_EXCLUDED',
      'SYNTHETIC_VERIFICATION_OWNER_EXCLUDED',
      'SYNTHETIC_VERIFICATION_VALUE_EXCLUDED',
      'SYNTHETIC_RATE_LIMIT_EXCLUDED',
      'syntheticformer',
      'SyntheticNext',
    ]
    prohibitedSyntheticValues.forEach((value) =>
      expect(text).not.toContain(value),
    )
    expect(text).not.toMatch(
      /(?:postgres(?:ql)?:\/\/|https?:\/\/|\b(?:select|insert|update|delete)\b)/iu,
    )
  })

  it('returns compact exact owner bytes including adult entries and excludes IDs', async () => {
    const user = await createArchiveBackupUser()
    const [item] = await database
      .insert(animeCatalogueItems)
      .values({
        englishTitle: 'M35 Adult "private"\n😀 title',
        romajiTitle: 'M35 Romaji',
        format: 'tv',
        releaseStatus: 'finished',
        releaseYear: null,
        episodeCount: null,
        maturity: 'adult',
        catalogueState: 'hidden',
      })
      .returning()
    if (item === undefined) throw new Error('Expected catalogue fixture')
    await database.insert(animeAlternativeTitles).values([
      { catalogueItemId: item.id, title: 'M35 Alternative two', position: 1 },
      { catalogueItemId: item.id, title: 'M35 Alternative one', position: 0 },
    ])
    await database.insert(animeCatalogueSources).values({
      catalogueItemId: item.id,
      sourceKey: 'wikidata',
      sourceItemId: 'M35-SOURCE-QID-MUST-NOT-EXPORT',
    })
    await database.insert(userCataloguePreferences).values({
      userId: user.id,
      titleLanguage: 'romaji',
      adultContentEnabled: false,
    })
    await database.insert(animeEntries).values({
      userId: user.id,
      catalogueItemId: item.id,
      status: 'completed',
      episodeProgress: 12,
      episodeTotalOverride: 12,
      rating: 8.5,
      isFavourite: true,
      startDate: '2026-01-01',
      finishDate: '2026-01-20',
    })

    const beforeRead = await pool.query(
      `select
        (select md5(coalesce(string_agg(to_jsonb(e)::text, '|' order by e.id), ''))
           from anime_entries e where e.user_id = $1::uuid) as entry_fingerprint,
        (select md5(coalesce(string_agg(to_jsonb(p)::text, '|' order by p.user_id), ''))
           from user_catalogue_preferences p where p.user_id = $1::uuid) as preference_fingerprint,
        (select md5(coalesce(string_agg(to_jsonb(s)::text, '|' order by s.source_key, s.source_item_id), ''))
           from anime_catalogue_sources s where s.catalogue_item_id = $2::uuid) as source_fingerprint`,
      [user.id, item.id],
    )
    const result = await readArchiveBackup(database, { userId: user.id })
    expect(result.kind).toBe('backup_ready')
    if (result.kind !== 'backup_ready') return
    const text = new TextDecoder().decode(result.bytes)
    const backup = JSON.parse(text)
    expect(text).toBe(JSON.stringify(backup))
    expect(backup.settings.anime).toEqual({
      titleLanguage: 'romaji',
      adultContentEnabled: false,
    })
    expect(
      backup.archive.anime.entries[0].catalogue.titles.alternatives,
    ).toEqual(['M35 Alternative one', 'M35 Alternative two'])
    expect(backup.archive.anime.entries[0].catalogue.maturity).toBe('adult')
    expect(backup.archive.anime.entries[0].tracking).toEqual({
      status: 'completed',
      episodeProgress: 12,
      episodeTotalOverride: 12,
      rating: 8.5,
      isFavourite: true,
      startDate: '2026-01-01',
      finishDate: '2026-01-20',
    })
    expect(text).not.toContain(user.id)
    expect(text).not.toContain(item.id)
    expect(text).not.toContain(user.username)
    expect(text).not.toContain(user.email)
    expect(text).not.toContain('M35-SOURCE-QID-MUST-NOT-EXPORT')
    await expect(
      pool.query(
        `select
          (select md5(coalesce(string_agg(to_jsonb(e)::text, '|' order by e.id), ''))
             from anime_entries e where e.user_id = $1::uuid) as entry_fingerprint,
          (select md5(coalesce(string_agg(to_jsonb(p)::text, '|' order by p.user_id), ''))
             from user_catalogue_preferences p where p.user_id = $1::uuid) as preference_fingerprint,
          (select md5(coalesce(string_agg(to_jsonb(s)::text, '|' order by s.source_key, s.source_item_id), ''))
             from anime_catalogue_sources s where s.catalogue_item_id = $2::uuid) as source_fingerprint`,
        [user.id, item.id],
      ),
    ).resolves.toEqual(beforeRead)
  })
})

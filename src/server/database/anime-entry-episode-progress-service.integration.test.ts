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
import { episodeProgressMaximum } from '@/features/archive/domain/episode-progress'
import {
  updateAnimeEntryEpisodeProgress,
  updateAnimeEntryEpisodeTotalOverride,
} from '@/server/database/anime-entry-episode-progress-service'
import {
  animeCatalogueItems,
  animeEntries,
  users,
} from '@/server/database/schema'
import { assertSafeTestDatabaseName } from '@/test/database/global-setup'

const { databaseTestUrl } = readDatabaseTestEnvironment()
const pool = new Pool({ connectionString: databaseTestUrl })
const database = drizzle({ client: pool })
const baselineCreatedAt = new Date('2020-01-01T00:00:00.000Z')
const baselineUpdatedAt = new Date('2020-01-02T00:00:00.000Z')

async function insertUser() {
  const username = `User${randomUUID().replaceAll('-', '').slice(0, 12)}`
  const [user] = await database
    .insert(users)
    .values({
      username,
      usernameIdentityKey: username.toLowerCase(),
      email: `${randomUUID()}@example.com`,
    })
    .returning()

  if (user === undefined) throw new Error('Expected user fixture')
  return user
}

async function insertCatalogueItem(
  overrides: Partial<typeof animeCatalogueItems.$inferInsert> = {},
) {
  const [item] = await database
    .insert(animeCatalogueItems)
    .values({
      englishTitle: `Progress fixture ${randomUUID()}`,
      format: 'tv',
      releaseStatus: 'finished',
      maturity: 'safe',
      catalogueState: 'published',
      episodeCount: 12,
      ...overrides,
    })
    .returning()

  if (item === undefined) throw new Error('Expected catalogue fixture')
  return item
}

async function insertEntry(
  userId: string,
  catalogueItemId: string,
  overrides: Partial<typeof animeEntries.$inferInsert> = {},
) {
  const [entry] = await database
    .insert(animeEntries)
    .values({
      userId,
      catalogueItemId,
      status: 'planned',
      createdAt: baselineCreatedAt,
      updatedAt: baselineUpdatedAt,
      ...overrides,
    })
    .returning()

  if (entry === undefined) throw new Error('Expected entry fixture')
  return entry
}

async function readEntry(entryId: string) {
  const [entry] = await database
    .select()
    .from(animeEntries)
    .where(eq(animeEntries.id, entryId))
  return entry
}

async function waitForEntryUpdateLock(entryId: string): Promise<void> {
  const probe = await pool.connect()

  try {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        await probe.query('begin')
        await probe.query(
          'select id from anime_entries where id = $1 for update nowait',
          [entryId],
        )
        await probe.query('rollback')
      } catch (error) {
        await probe.query('rollback').catch(() => undefined)
        if ((error as { code?: string }).code === '55P03') return
        throw error
      }

      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  } finally {
    probe.release()
  }

  throw new Error('Mutation did not acquire the entry lock')
}

async function waitForDatabaseWait(
  predicate: { pid: number } | { waitEvent: string; queryPrefix: string },
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result =
      'pid' in predicate
        ? await pool.query<{ waiting: boolean }>(
            `select coalesce(
              (select wait_event_type = 'Lock' from pg_stat_activity where pid = $1),
              false
            ) as waiting`,
            [predicate.pid],
          )
        : await pool.query<{ waiting: boolean }>(
            `select exists (
              select 1 from pg_stat_activity
              where datname = current_database()
                and wait_event = $1
                and query like $2
            ) as waiting`,
            [predicate.waitEvent, `${predicate.queryPrefix}%`],
          )

    if (result.rows[0]?.waiting === true) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }

  throw new Error('Expected database lock wait was not observed')
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
})

afterAll(async () => {
  await pool.end()
})

describe('episode progress and total services', () => {
  it.each(['tv', 'ova', 'ona', 'special'] as const)(
    'updates an owned non-adult %s entry, including hidden and draft catalogue rows',
    async (format) => {
      const owner = await insertUser()
      const item = await insertCatalogueItem({
        format,
        catalogueState:
          format === 'ova'
            ? 'hidden'
            : format === 'ona'
              ? 'draft'
              : 'published',
        episodeCount: null,
      })
      const entry = await insertEntry(owner.id, item.id)

      await expect(
        updateAnimeEntryEpisodeProgress(database, {
          userId: owner.id,
          entryId: entry.id,
          expectedEpisodeProgress: 0,
          requestedEpisodeProgress: episodeProgressMaximum,
        }),
      ).resolves.toEqual({
        kind: 'updated',
        progress: episodeProgressMaximum,
        personalTotal: null,
        catalogueTotal: null,
        status: 'planned',
      })
      expect((await readEntry(entry.id))?.episodeProgress).toBe(
        episodeProgressMaximum,
      )
    },
  )

  it.each([
    ['adult', { maturity: 'adult' }],
    ['movie', { format: 'movie' }],
    ['unknown format', { format: 'unknown' }],
  ] as const)(
    'collapses an ineligible %s target to unavailable',
    async (_, overrides) => {
      const owner = await insertUser()
      const item = await insertCatalogueItem(overrides)
      const entry = await insertEntry(owner.id, item.id)
      const before = await readEntry(entry.id)

      await expect(
        updateAnimeEntryEpisodeProgress(database, {
          userId: owner.id,
          entryId: entry.id,
          expectedEpisodeProgress: 0,
          requestedEpisodeProgress: 1,
        }),
      ).resolves.toEqual({ kind: 'unavailable' })
      await expect(
        updateAnimeEntryEpisodeTotalOverride(database, {
          userId: owner.id,
          entryId: entry.id,
          expectedEpisodeTotalOverride: null,
          requestedEpisodeTotalOverride: 1,
        }),
      ).resolves.toEqual({ kind: 'unavailable' })
      await expect(readEntry(entry.id)).resolves.toEqual(before)
    },
  )

  it('preserves unrelated fields across real changes, no-ops, replay, reset, and clear', async () => {
    const owner = await insertUser()
    const item = await insertCatalogueItem({ episodeCount: 12 })
    const entry = await insertEntry(owner.id, item.id, {
      status: 'on_hold',
      isFavourite: true,
      startDate: '2024-01-02',
      finishDate: '2024-01-03',
    })

    await expect(
      updateAnimeEntryEpisodeTotalOverride(database, {
        userId: owner.id,
        entryId: entry.id,
        expectedEpisodeTotalOverride: null,
        requestedEpisodeTotalOverride: 5,
      }),
    ).resolves.toMatchObject({ kind: 'updated', personalTotal: 5, progress: 0 })
    const afterTotal = await readEntry(entry.id)

    await expect(
      updateAnimeEntryEpisodeProgress(database, {
        userId: owner.id,
        entryId: entry.id,
        expectedEpisodeProgress: 0,
        requestedEpisodeProgress: 8,
      }),
    ).resolves.toMatchObject({ kind: 'updated', progress: 8, personalTotal: 5 })
    const afterProgress = await readEntry(entry.id)
    expect(afterProgress).toMatchObject({
      status: 'on_hold',
      episodeProgress: 8,
      episodeTotalOverride: 5,
      isFavourite: true,
      startDate: '2024-01-02',
      finishDate: '2024-01-03',
      createdAt: baselineCreatedAt,
    })
    expect(afterProgress?.updatedAt.getTime()).toBeGreaterThan(
      afterTotal!.updatedAt.getTime(),
    )

    const replay = {
      userId: owner.id,
      entryId: entry.id,
      expectedEpisodeProgress: 0,
      requestedEpisodeProgress: 8,
    }
    await expect(
      updateAnimeEntryEpisodeProgress(database, replay),
    ).resolves.toMatchObject({
      kind: 'updated',
      progress: 8,
    })
    await expect(readEntry(entry.id)).resolves.toEqual(afterProgress)

    await expect(
      updateAnimeEntryEpisodeProgress(database, {
        userId: owner.id,
        entryId: entry.id,
        expectedEpisodeProgress: 8,
        requestedEpisodeProgress: 8,
      }),
    ).resolves.toMatchObject({ kind: 'unchanged', progress: 8 })
    await expect(readEntry(entry.id)).resolves.toEqual(afterProgress)

    await expect(
      updateAnimeEntryEpisodeProgress(database, {
        userId: owner.id,
        entryId: entry.id,
        expectedEpisodeProgress: 8,
        requestedEpisodeProgress: 0,
      }),
    ).resolves.toMatchObject({ kind: 'updated', progress: 0, personalTotal: 5 })
    await expect(
      updateAnimeEntryEpisodeTotalOverride(database, {
        userId: owner.id,
        entryId: entry.id,
        expectedEpisodeTotalOverride: 5,
        requestedEpisodeTotalOverride: null,
      }),
    ).resolves.toMatchObject({
      kind: 'updated',
      personalTotal: null,
      catalogueTotal: 12,
    })
    expect(await readEntry(entry.id)).toMatchObject({
      status: 'on_hold',
      episodeProgress: 0,
      episodeTotalOverride: null,
      isFavourite: true,
      startDate: '2024-01-02',
      finishDate: '2024-01-03',
    })
  })

  it('returns privacy-safe conflicts and protects cross-owner entries', async () => {
    const [owner, otherOwner] = await Promise.all([insertUser(), insertUser()])
    const item = await insertCatalogueItem()
    const entry = await insertEntry(owner.id, item.id, { episodeProgress: 4 })
    const before = await readEntry(entry.id)

    await expect(
      updateAnimeEntryEpisodeProgress(database, {
        userId: owner.id,
        entryId: entry.id,
        expectedEpisodeProgress: 0,
        requestedEpisodeProgress: 6,
      }),
    ).resolves.toEqual({ kind: 'conflict', currentProgress: 4 })
    await expect(
      updateAnimeEntryEpisodeTotalOverride(database, {
        userId: owner.id,
        entryId: entry.id,
        expectedEpisodeTotalOverride: 3,
        requestedEpisodeTotalOverride: 6,
      }),
    ).resolves.toEqual({ kind: 'conflict', currentPersonalTotal: null })
    await expect(
      updateAnimeEntryEpisodeProgress(database, {
        userId: otherOwner.id,
        entryId: entry.id,
        expectedEpisodeProgress: 4,
        requestedEpisodeProgress: 6,
      }),
    ).resolves.toEqual({ kind: 'unavailable' })
    await expect(
      updateAnimeEntryEpisodeProgress(database, {
        userId: otherOwner.id,
        entryId: randomUUID(),
        expectedEpisodeProgress: 4,
        requestedEpisodeProgress: 6,
      }),
    ).resolves.toEqual({ kind: 'unavailable' })
    await expect(readEntry(entry.id)).resolves.toEqual(before)
  })

  it('serializes concurrent same-field CAS while allowing independent field changes', async () => {
    const owner = await insertUser()
    const item = await insertCatalogueItem()
    const entry = await insertEntry(owner.id, item.id)
    const [first, second] = await Promise.all([
      updateAnimeEntryEpisodeProgress(database, {
        userId: owner.id,
        entryId: entry.id,
        expectedEpisodeProgress: 0,
        requestedEpisodeProgress: 3,
      }),
      updateAnimeEntryEpisodeProgress(database, {
        userId: owner.id,
        entryId: entry.id,
        expectedEpisodeProgress: 0,
        requestedEpisodeProgress: 5,
      }),
    ])
    const outcomes = [first, second]
    expect(
      outcomes.filter((outcome) => outcome.kind === 'updated'),
    ).toHaveLength(1)
    expect(
      outcomes.filter((outcome) => outcome.kind === 'conflict'),
    ).toHaveLength(1)

    const currentProgress = (await readEntry(entry.id))?.episodeProgress
    await expect(
      updateAnimeEntryEpisodeTotalOverride(database, {
        userId: owner.id,
        entryId: entry.id,
        expectedEpisodeTotalOverride: null,
        requestedEpisodeTotalOverride: 2,
      }),
    ).resolves.toMatchObject({ kind: 'updated', progress: currentProgress })
    expect(await readEntry(entry.id)).toMatchObject({
      episodeProgress: currentProgress,
      episodeTotalOverride: 2,
    })
  })

  it('rechecks adult maturity after waiting on a curation update before progress writes', async () => {
    const owner = await insertUser()
    const item = await insertCatalogueItem()
    const entry = await insertEntry(owner.id, item.id)
    const before = await readEntry(entry.id)
    const curator = await pool.connect()

    try {
      await curator.query('begin')
      await curator.query(
        "update anime_catalogue_items set maturity = 'adult' where id = $1",
        [item.id],
      )
      const mutation = updateAnimeEntryEpisodeProgress(database, {
        userId: owner.id,
        entryId: entry.id,
        expectedEpisodeProgress: 0,
        requestedEpisodeProgress: 1,
      })
      await waitForEntryUpdateLock(entry.id)
      await curator.query('commit')

      await expect(mutation).resolves.toEqual({ kind: 'unavailable' })
      await expect(readEntry(entry.id)).resolves.toEqual(before)
    } finally {
      await curator.query('rollback').catch(() => undefined)
      curator.release()
    }
  })

  it('rechecks adult maturity after waiting on a curation update before total writes', async () => {
    const owner = await insertUser()
    const item = await insertCatalogueItem()
    const entry = await insertEntry(owner.id, item.id)
    const before = await readEntry(entry.id)
    const curator = await pool.connect()

    try {
      await curator.query('begin')
      await curator.query(
        "update anime_catalogue_items set maturity = 'adult' where id = $1",
        [item.id],
      )
      const mutation = updateAnimeEntryEpisodeTotalOverride(database, {
        userId: owner.id,
        entryId: entry.id,
        expectedEpisodeTotalOverride: null,
        requestedEpisodeTotalOverride: 13,
      })
      await waitForEntryUpdateLock(entry.id)
      await curator.query('commit')

      await expect(mutation).resolves.toEqual({ kind: 'unavailable' })
      await expect(readEntry(entry.id)).resolves.toEqual(before)
    } finally {
      await curator.query('rollback').catch(() => undefined)
      curator.release()
    }
  })

  it('rechecks a winning trackable-to-movie reclassification before progress writes', async () => {
    const owner = await insertUser()
    const item = await insertCatalogueItem({ format: 'tv' })
    const entry = await insertEntry(owner.id, item.id)
    const before = await readEntry(entry.id)
    const curator = await pool.connect()

    try {
      await curator.query('begin')
      await curator.query(
        "update anime_catalogue_items set format = 'movie' where id = $1",
        [item.id],
      )
      const mutation = updateAnimeEntryEpisodeProgress(database, {
        userId: owner.id,
        entryId: entry.id,
        expectedEpisodeProgress: 0,
        requestedEpisodeProgress: 1,
      })
      await waitForEntryUpdateLock(entry.id)
      await curator.query('commit')

      await expect(mutation).resolves.toEqual({ kind: 'unavailable' })
      await expect(readEntry(entry.id)).resolves.toEqual(before)
    } finally {
      await curator.query('rollback').catch(() => undefined)
      curator.release()
    }
  })

  it('rechecks a winning trackable-to-unknown reclassification before total writes', async () => {
    const owner = await insertUser()
    const item = await insertCatalogueItem({ format: 'tv' })
    const entry = await insertEntry(owner.id, item.id, {
      status: 'on_hold',
      episodeProgress: 4,
      episodeTotalOverride: 12,
    })
    const before = await readEntry(entry.id)
    const curator = await pool.connect()

    try {
      await curator.query('begin')
      await curator.query(
        "update anime_catalogue_items set format = 'unknown' where id = $1",
        [item.id],
      )
      const mutation = updateAnimeEntryEpisodeTotalOverride(database, {
        userId: owner.id,
        entryId: entry.id,
        expectedEpisodeTotalOverride: 12,
        requestedEpisodeTotalOverride: 13,
      })
      await waitForEntryUpdateLock(entry.id)
      await curator.query('commit')

      await expect(mutation).resolves.toEqual({ kind: 'unavailable' })
      await expect(readEntry(entry.id)).resolves.toEqual(before)
    } finally {
      await curator.query('rollback').catch(() => undefined)
      curator.release()
    }
  })

  it('lets curation wait behind a service-first entry-to-catalogue lock sequence without deadlock', async () => {
    const advisoryLockKey = 260026
    const triggerName = 'm26_test_pause_entry_update'
    const owner = await insertUser()
    const item = await insertCatalogueItem({ format: 'tv' })
    const entry = await insertEntry(owner.id, item.id, {
      status: 'on_hold',
      episodeProgress: 4,
      episodeTotalOverride: 12,
    })
    const gate = await pool.connect()
    const curator = await pool.connect()
    let curationPromise: Promise<unknown> | undefined

    try {
      await pool.query(`
        create function ${triggerName}() returns trigger language plpgsql as $$
        begin
          perform pg_advisory_xact_lock(${advisoryLockKey});
          return new;
        end
        $$
      `)
      await pool.query(`
        create trigger ${triggerName}
        before update on anime_entries
        for each row execute function ${triggerName}()
      `)
      await gate.query('select pg_advisory_lock($1)', [advisoryLockKey])

      const mutation = updateAnimeEntryEpisodeProgress(database, {
        userId: owner.id,
        entryId: entry.id,
        expectedEpisodeProgress: 4,
        requestedEpisodeProgress: 5,
      })
      await waitForEntryUpdateLock(entry.id)
      await waitForDatabaseWait({
        waitEvent: 'advisory',
        queryPrefix: 'update "anime_entries"',
      })

      await curator.query('begin')
      const curationBackend = await curator.query<{ pid: number }>(
        'select pg_backend_pid() as pid',
      )
      curationPromise = curator.query(
        "update anime_catalogue_items set format = 'movie' where id = $1",
        [item.id],
      )
      await waitForDatabaseWait({ pid: curationBackend.rows[0]!.pid })

      await gate.query('select pg_advisory_unlock($1)', [advisoryLockKey])
      await expect(mutation).resolves.toMatchObject({
        kind: 'updated',
        progress: 5,
        personalTotal: 12,
        status: 'on_hold',
      })
      await curationPromise
      await curator.query('commit')

      const storedEntry = await readEntry(entry.id)
      expect(storedEntry).toMatchObject({
        status: 'on_hold',
        episodeProgress: 5,
        episodeTotalOverride: 12,
        createdAt: baselineCreatedAt,
      })
      expect(storedEntry?.updatedAt.getTime()).toBeGreaterThan(
        baselineUpdatedAt.getTime(),
      )
      const [storedItem] = await database
        .select({ format: animeCatalogueItems.format })
        .from(animeCatalogueItems)
        .where(eq(animeCatalogueItems.id, item.id))
      expect(storedItem?.format).toBe('movie')
    } finally {
      await gate
        .query('select pg_advisory_unlock($1)', [advisoryLockKey])
        .catch(() => undefined)
      if (curationPromise !== undefined) {
        await curationPromise.catch(() => undefined)
      }
      await curator.query('rollback').catch(() => undefined)
      curator.release()
      gate.release()
      await pool
        .query(`drop trigger if exists ${triggerName} on anime_entries`)
        .catch(() => undefined)
      await pool
        .query(`drop function if exists ${triggerName}()`)
        .catch(() => undefined)
    }
  })
})

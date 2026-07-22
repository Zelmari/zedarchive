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
import { updateAnimeEntryRating } from '@/server/database/anime-entry-rating-service'
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
      englishTitle: `Rating fixture ${randomUUID()}`,
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

describe('anime entry rating service', () => {
  it('sets, changes, and removes an owned rating while preserving sibling fields', async () => {
    const owner = await insertUser()
    const item = await insertCatalogueItem()
    const entry = await insertEntry(owner.id, item.id, {
      status: 'on_hold',
      episodeProgress: 4,
      episodeTotalOverride: 12,
      isFavourite: true,
      startDate: '2024-01-02',
      finishDate: '2024-01-03',
    })

    await expect(
      updateAnimeEntryRating(database, {
        userId: owner.id,
        entryId: entry.id,
        ratingOperation: 'save',
        expectedRating: null,
        requestedRating: 7.5,
      }),
    ).resolves.toEqual({ kind: 'updated', rating: 7.5 })
    const afterSet = await readEntry(entry.id)
    expect(afterSet).toMatchObject({
      rating: 7.5,
      status: 'on_hold',
      episodeProgress: 4,
      episodeTotalOverride: 12,
      isFavourite: true,
      startDate: '2024-01-02',
      finishDate: '2024-01-03',
      createdAt: baselineCreatedAt,
    })
    expect(afterSet?.updatedAt.getTime()).toBeGreaterThan(
      baselineUpdatedAt.getTime(),
    )

    await expect(
      updateAnimeEntryRating(database, {
        userId: owner.id,
        entryId: entry.id,
        ratingOperation: 'save',
        expectedRating: 7.5,
        requestedRating: 8,
      }),
    ).resolves.toEqual({ kind: 'updated', rating: 8 })
    const afterChange = await readEntry(entry.id)
    expect(afterChange).toMatchObject({
      rating: 8,
      status: 'on_hold',
      episodeProgress: 4,
      episodeTotalOverride: 12,
      isFavourite: true,
      startDate: '2024-01-02',
      finishDate: '2024-01-03',
      createdAt: baselineCreatedAt,
    })
    expect(afterChange?.updatedAt.getTime()).toBeGreaterThan(
      afterSet!.updatedAt.getTime(),
    )

    await expect(
      updateAnimeEntryRating(database, {
        userId: owner.id,
        entryId: entry.id,
        ratingOperation: 'remove',
        expectedRating: 8,
        requestedRating: null,
      }),
    ).resolves.toEqual({ kind: 'updated', rating: null })
    const afterRemove = await readEntry(entry.id)
    expect(afterRemove).toMatchObject({
      rating: null,
      status: 'on_hold',
      episodeProgress: 4,
      episodeTotalOverride: 12,
      isFavourite: true,
      startDate: '2024-01-02',
      finishDate: '2024-01-03',
      createdAt: baselineCreatedAt,
    })
    expect(afterRemove?.updatedAt.getTime()).toBeGreaterThan(
      afterChange!.updatedAt.getTime(),
    )
  })

  it('permits ratings for every status and format, including hidden and draft entries', async () => {
    const owner = await insertUser()

    for (const [status, format, catalogueState] of [
      ['planned', 'tv', 'published'],
      ['in_progress', 'movie', 'published'],
      ['on_hold', 'ova', 'hidden'],
      ['dropped', 'ona', 'draft'],
      ['completed', 'special', 'published'],
      ['planned', 'unknown', 'published'],
    ] as const) {
      const item = await insertCatalogueItem({ format, catalogueState })
      const entry = await insertEntry(owner.id, item.id, { status })

      await expect(
        updateAnimeEntryRating(database, {
          userId: owner.id,
          entryId: entry.id,
          ratingOperation: 'save',
          expectedRating: null,
          requestedRating: 6.5,
        }),
      ).resolves.toEqual({ kind: 'updated', rating: 6.5 })
    }
  })

  it('collapses missing, foreign, and adult targets to unavailable without writes', async () => {
    const [owner, otherOwner] = await Promise.all([insertUser(), insertUser()])
    const safeItem = await insertCatalogueItem()
    const adultItem = await insertCatalogueItem({ maturity: 'adult' })
    const entry = await insertEntry(owner.id, safeItem.id, { rating: 4 })
    const adultEntry = await insertEntry(owner.id, adultItem.id, { rating: 9 })
    const before = await readEntry(entry.id)
    const adultBefore = await readEntry(adultEntry.id)

    await expect(
      updateAnimeEntryRating(database, {
        userId: otherOwner.id,
        entryId: entry.id,
        ratingOperation: 'save',
        expectedRating: 4,
        requestedRating: 6,
      }),
    ).resolves.toEqual({ kind: 'unavailable' })
    await expect(
      updateAnimeEntryRating(database, {
        userId: owner.id,
        entryId: randomUUID(),
        ratingOperation: 'save',
        expectedRating: null,
        requestedRating: 6,
      }),
    ).resolves.toEqual({ kind: 'unavailable' })
    await expect(
      updateAnimeEntryRating(database, {
        userId: owner.id,
        entryId: adultEntry.id,
        ratingOperation: 'save',
        expectedRating: 9,
        requestedRating: 6,
      }),
    ).resolves.toEqual({ kind: 'unavailable' })
    await expect(readEntry(entry.id)).resolves.toEqual(before)
    await expect(readEntry(adultEntry.id)).resolves.toEqual(adultBefore)
  })

  it('keeps timestamps unchanged for exact no-ops and lost-response replays', async () => {
    const owner = await insertUser()
    const item = await insertCatalogueItem()
    const entry = await insertEntry(owner.id, item.id, { rating: 7.5 })

    await expect(
      updateAnimeEntryRating(database, {
        userId: owner.id,
        entryId: entry.id,
        ratingOperation: 'save',
        expectedRating: 7.5,
        requestedRating: 7.5,
      }),
    ).resolves.toEqual({ kind: 'unchanged', rating: 7.5 })
    await expect(readEntry(entry.id)).resolves.toEqual(entry)

    await expect(
      updateAnimeEntryRating(database, {
        userId: owner.id,
        entryId: entry.id,
        ratingOperation: 'save',
        expectedRating: 7.5,
        requestedRating: 8,
      }),
    ).resolves.toEqual({ kind: 'updated', rating: 8 })
    const afterUpdate = await readEntry(entry.id)

    await expect(
      updateAnimeEntryRating(database, {
        userId: owner.id,
        entryId: entry.id,
        ratingOperation: 'save',
        expectedRating: 7.5,
        requestedRating: 8,
      }),
    ).resolves.toEqual({ kind: 'updated', rating: 8 })
    await expect(readEntry(entry.id)).resolves.toEqual(afterUpdate)

    await expect(
      updateAnimeEntryRating(database, {
        userId: owner.id,
        entryId: entry.id,
        ratingOperation: 'remove',
        expectedRating: 8,
        requestedRating: null,
      }),
    ).resolves.toEqual({ kind: 'updated', rating: null })
    const afterRemove = await readEntry(entry.id)

    await expect(
      updateAnimeEntryRating(database, {
        userId: owner.id,
        entryId: entry.id,
        ratingOperation: 'remove',
        expectedRating: 8,
        requestedRating: null,
      }),
    ).resolves.toEqual({ kind: 'updated', rating: null })
    await expect(readEntry(entry.id)).resolves.toEqual(afterRemove)
  })

  it('detects stale nullable field values, retains the authoritative current value, and permits retry', async () => {
    const owner = await insertUser()
    const item = await insertCatalogueItem()
    const entry = await insertEntry(owner.id, item.id)

    const [first, second] = await Promise.all([
      updateAnimeEntryRating(database, {
        userId: owner.id,
        entryId: entry.id,
        ratingOperation: 'save',
        expectedRating: null,
        requestedRating: 3,
      }),
      updateAnimeEntryRating(database, {
        userId: owner.id,
        entryId: entry.id,
        ratingOperation: 'save',
        expectedRating: null,
        requestedRating: 5,
      }),
    ])
    const outcomes = [first, second]
    expect(
      outcomes.filter((outcome) => outcome.kind === 'updated'),
    ).toHaveLength(1)
    expect(
      outcomes.filter((outcome) => outcome.kind === 'conflict'),
    ).toHaveLength(1)

    const currentRating = (await readEntry(entry.id))?.rating
    const conflict = outcomes.find((outcome) => outcome.kind === 'conflict')
    expect(conflict).toEqual({ kind: 'conflict', currentRating })

    await expect(
      updateAnimeEntryRating(database, {
        userId: owner.id,
        entryId: entry.id,
        ratingOperation: 'save',
        expectedRating: currentRating!,
        requestedRating: 9.5,
      }),
    ).resolves.toEqual({ kind: 'updated', rating: 9.5 })
  })

  it('rechecks a winning non-adult-to-adult curation change before writing', async () => {
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
      const mutation = updateAnimeEntryRating(database, {
        userId: owner.id,
        entryId: entry.id,
        ratingOperation: 'save',
        expectedRating: null,
        requestedRating: 8,
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

  it('lets curation wait behind the entry-to-catalogue lock sequence without deadlock', async () => {
    const advisoryLockKey = 270027
    const triggerName = 'm27_test_pause_entry_update'
    const owner = await insertUser()
    const item = await insertCatalogueItem()
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

      const mutation = updateAnimeEntryRating(database, {
        userId: owner.id,
        entryId: entry.id,
        ratingOperation: 'save',
        expectedRating: null,
        requestedRating: 8.5,
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
        "update anime_catalogue_items set maturity = 'adult' where id = $1",
        [item.id],
      )
      await waitForDatabaseWait({ pid: curationBackend.rows[0]!.pid })

      await gate.query('select pg_advisory_unlock($1)', [advisoryLockKey])
      await expect(mutation).resolves.toEqual({ kind: 'updated', rating: 8.5 })
      await curationPromise
      await curator.query('commit')

      expect(await readEntry(entry.id)).toMatchObject({
        rating: 8.5,
        status: 'on_hold',
        episodeProgress: 4,
        episodeTotalOverride: 12,
        createdAt: baselineCreatedAt,
      })
      const [storedItem] = await database
        .select({ maturity: animeCatalogueItems.maturity })
        .from(animeCatalogueItems)
        .where(eq(animeCatalogueItems.id, item.id))
      expect(storedItem?.maturity).toBe('adult')
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

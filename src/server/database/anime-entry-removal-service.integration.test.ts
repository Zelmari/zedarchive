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
import { createAnimeEntry } from '@/server/database/anime-entry-service'
import { updateAnimeEntryFavourite } from '@/server/database/anime-entry-favourite-service'
import { removeAnimeEntry } from '@/server/database/anime-entry-removal-service'
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
      englishTitle: `Removal fixture ${randomUUID()}`,
      format: 'tv',
      releaseStatus: 'finished',
      maturity: 'safe',
      catalogueState: 'published',
      ...overrides,
    })
    .returning()

  if (item === undefined) throw new Error('Expected catalogue-item fixture')
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

  if (entry === undefined) throw new Error('Expected anime-entry fixture')
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

  throw new Error('Removal did not acquire the entry lock')
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
  await pool.query(
    'truncate table anime_entries, anime_catalogue_sources, anime_alternative_titles, anime_catalogue_items, rate_limits, verifications, sessions, accounts, users restart identity cascade',
  )
})

afterAll(async () => {
  await pool.end()
})

describe('anime entry removal service', () => {
  it('removes the complete personal row while preserving the catalogue and another owner', async () => {
    const [owner, otherOwner] = await Promise.all([insertUser(), insertUser()])
    const item = await insertCatalogueItem()
    const entry = await insertEntry(owner.id, item.id, {
      status: 'completed',
      episodeProgress: 12,
      episodeTotalOverride: 13,
      rating: 8.5,
      isFavourite: true,
      startDate: '2024-01-02',
      finishDate: '2024-01-03',
    })
    const otherEntry = await insertEntry(otherOwner.id, item.id, {
      status: 'on_hold',
      episodeProgress: 4,
    })
    const [alternativeTitle] = await database
      .insert(animeAlternativeTitles)
      .values({
        catalogueItemId: item.id,
        title: 'Preserved alternative title',
        position: 0,
      })
      .returning()
    const [catalogueSource] = await database
      .insert(animeCatalogueSources)
      .values({
        catalogueItemId: item.id,
        sourceKey: 'm30_fixture',
        sourceItemId: randomUUID(),
      })
      .returning()

    await expect(
      removeAnimeEntry(database, {
        userId: owner.id,
        entryId: entry.id,
      }),
    ).resolves.toEqual({ kind: 'removed' })

    await expect(readEntry(entry.id)).resolves.toBeUndefined()
    await expect(readEntry(otherEntry.id)).resolves.toEqual(otherEntry)
    await expect(
      database
        .select()
        .from(animeCatalogueItems)
        .where(eq(animeCatalogueItems.id, item.id)),
    ).resolves.toEqual([item])
    await expect(
      database
        .select()
        .from(animeAlternativeTitles)
        .where(eq(animeAlternativeTitles.catalogueItemId, item.id)),
    ).resolves.toEqual([alternativeTitle])
    await expect(
      database
        .select()
        .from(animeCatalogueSources)
        .where(eq(animeCatalogueSources.catalogueItemId, item.id)),
    ).resolves.toEqual([catalogueSource])
  })

  it.each(['hidden', 'draft'] as const)(
    'removes an owned non-adult entry whose catalogue item is %s',
    async (catalogueState) => {
      const owner = await insertUser()
      const item = await insertCatalogueItem({ catalogueState })
      const entry = await insertEntry(owner.id, item.id)

      await expect(
        removeAnimeEntry(database, {
          userId: owner.id,
          entryId: entry.id,
        }),
      ).resolves.toEqual({ kind: 'removed' })
      await expect(readEntry(entry.id)).resolves.toBeUndefined()
    },
  )

  it('collapses foreign, unknown, adult, and replayed targets to unavailable without collateral deletion', async () => {
    const [owner, otherOwner] = await Promise.all([insertUser(), insertUser()])
    const safeItem = await insertCatalogueItem()
    const adultItem = await insertCatalogueItem({ maturity: 'adult' })
    const safeEntry = await insertEntry(owner.id, safeItem.id)
    const adultEntry = await insertEntry(owner.id, adultItem.id, {
      status: 'completed',
      rating: 10,
      isFavourite: true,
    })
    const adultBefore = await readEntry(adultEntry.id)

    await expect(
      removeAnimeEntry(database, {
        userId: otherOwner.id,
        entryId: safeEntry.id,
      }),
    ).resolves.toEqual({ kind: 'unavailable' })
    await expect(
      removeAnimeEntry(database, {
        userId: owner.id,
        entryId: randomUUID(),
      }),
    ).resolves.toEqual({ kind: 'unavailable' })
    await expect(
      removeAnimeEntry(database, {
        userId: owner.id,
        entryId: adultEntry.id,
      }),
    ).resolves.toEqual({ kind: 'unavailable' })
    await expect(readEntry(safeEntry.id)).resolves.toEqual(safeEntry)
    await expect(readEntry(adultEntry.id)).resolves.toEqual(adultBefore)

    await database
      .insert(userCataloguePreferences)
      .values({ userId: owner.id, adultContentEnabled: true })
    await expect(
      removeAnimeEntry(database, {
        userId: owner.id,
        entryId: adultEntry.id,
      }),
    ).resolves.toEqual({ kind: 'removed' })
    await expect(readEntry(adultEntry.id)).resolves.toBeUndefined()

    await expect(
      removeAnimeEntry(database, {
        userId: owner.id,
        entryId: safeEntry.id,
      }),
    ).resolves.toEqual({ kind: 'removed' })
    await expect(
      removeAnimeEntry(database, {
        userId: owner.id,
        entryId: safeEntry.id,
      }),
    ).resolves.toEqual({ kind: 'unavailable' })
  })

  it('allows a deliberate re-add with a fresh identity and database defaults', async () => {
    const owner = await insertUser()
    const item = await insertCatalogueItem()
    const removedEntry = await insertEntry(owner.id, item.id, {
      status: 'completed',
      episodeProgress: 12,
      episodeTotalOverride: 13,
      rating: 8.5,
      isFavourite: true,
      startDate: '2024-01-02',
      finishDate: '2024-01-03',
    })

    await expect(
      removeAnimeEntry(database, {
        userId: owner.id,
        entryId: removedEntry.id,
      }),
    ).resolves.toEqual({ kind: 'removed' })
    await expect(
      createAnimeEntry(database, {
        userId: owner.id,
        catalogueItemId: item.id,
        status: 'planned',
      }),
    ).resolves.toEqual({ kind: 'created', status: 'planned' })

    const [readdedEntry] = await database
      .select()
      .from(animeEntries)
      .where(eq(animeEntries.userId, owner.id))
    expect(readdedEntry).toMatchObject({
      catalogueItemId: item.id,
      status: 'planned',
      episodeProgress: 0,
      episodeTotalOverride: null,
      rating: null,
      isFavourite: false,
      startDate: null,
      finishDate: null,
    })
    expect(readdedEntry?.id).not.toBe(removedEntry.id)
  })

  it('lets a field mutation holding the entry lock finish before removal deletes its latest row', async () => {
    const advisoryLockKey = 300031
    const triggerName = 'm30_test_pause_entry_update_before_delete'
    const owner = await insertUser()
    const item = await insertCatalogueItem()
    const entry = await insertEntry(owner.id, item.id)
    const gate = await pool.connect()
    let favouritePromise:
      ReturnType<typeof updateAnimeEntryFavourite> | undefined
    let removalPromise: ReturnType<typeof removeAnimeEntry> | undefined

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

      favouritePromise = updateAnimeEntryFavourite(database, {
        userId: owner.id,
        entryId: entry.id,
        expectedFavourite: false,
        requestedFavourite: true,
      })
      await waitForDatabaseWait({
        waitEvent: 'advisory',
        queryPrefix: 'update "anime_entries"',
      })

      removalPromise = removeAnimeEntry(database, {
        userId: owner.id,
        entryId: entry.id,
      })
      await waitForEntryUpdateLock(entry.id)

      await gate.query('select pg_advisory_unlock($1)', [advisoryLockKey])
      await expect(favouritePromise).resolves.toEqual({
        kind: 'updated',
        isFavourite: true,
      })
      await expect(removalPromise).resolves.toEqual({ kind: 'removed' })
      await expect(readEntry(entry.id)).resolves.toBeUndefined()
    } finally {
      await gate
        .query('select pg_advisory_unlock($1)', [advisoryLockKey])
        .catch(() => undefined)
      await favouritePromise?.catch(() => undefined)
      await removalPromise?.catch(() => undefined)
      gate.release()
      await pool
        .query(`drop trigger if exists ${triggerName} on anime_entries`)
        .catch(() => undefined)
      await pool
        .query(`drop function if exists ${triggerName}()`)
        .catch(() => undefined)
    }
  })

  it('makes a field mutation waiting behind removal return unavailable', async () => {
    const advisoryLockKey = 300032
    const triggerName = 'm30_test_pause_delete_before_entry_update'
    const owner = await insertUser()
    const item = await insertCatalogueItem()
    const entry = await insertEntry(owner.id, item.id)
    const gate = await pool.connect()
    let removalPromise: ReturnType<typeof removeAnimeEntry> | undefined
    let favouritePromise:
      ReturnType<typeof updateAnimeEntryFavourite> | undefined

    try {
      await pool.query(`
        create function ${triggerName}() returns trigger language plpgsql as $$
        begin
          perform pg_advisory_xact_lock(${advisoryLockKey});
          return old;
        end
        $$
      `)
      await pool.query(`
        create trigger ${triggerName}
        after delete on anime_entries
        for each row execute function ${triggerName}()
      `)
      await gate.query('select pg_advisory_lock($1)', [advisoryLockKey])

      removalPromise = removeAnimeEntry(database, {
        userId: owner.id,
        entryId: entry.id,
      })
      await waitForDatabaseWait({
        waitEvent: 'advisory',
        queryPrefix: 'delete from "anime_entries"',
      })

      favouritePromise = updateAnimeEntryFavourite(database, {
        userId: owner.id,
        entryId: entry.id,
        expectedFavourite: false,
        requestedFavourite: true,
      })
      await waitForDatabaseWait({
        waitEvent: 'transactionid',
        queryPrefix: 'select "id", "catalogue_item_id", "is_favourite"',
      })

      await gate.query('select pg_advisory_unlock($1)', [advisoryLockKey])
      await expect(removalPromise).resolves.toEqual({ kind: 'removed' })
      await expect(favouritePromise).resolves.toEqual({ kind: 'unavailable' })
      await expect(readEntry(entry.id)).resolves.toBeUndefined()
    } finally {
      await gate
        .query('select pg_advisory_unlock($1)', [advisoryLockKey])
        .catch(() => undefined)
      await removalPromise?.catch(() => undefined)
      await favouritePromise?.catch(() => undefined)
      gate.release()
      await pool
        .query(`drop trigger if exists ${triggerName} on anime_entries`)
        .catch(() => undefined)
      await pool
        .query(`drop function if exists ${triggerName}()`)
        .catch(() => undefined)
    }
  })

  it('deletes the old relationship after Add observes it first', async () => {
    const advisoryLockKey = 300033
    const triggerName = 'm30_test_pause_delete_after_add'
    const owner = await insertUser()
    const item = await insertCatalogueItem()
    const entry = await insertEntry(owner.id, item.id, {
      status: 'completed',
      isFavourite: true,
    })
    const gate = await pool.connect()
    let removalPromise: ReturnType<typeof removeAnimeEntry> | undefined

    try {
      await pool.query(`
        create function ${triggerName}() returns trigger language plpgsql as $$
        begin
          perform pg_advisory_xact_lock(${advisoryLockKey});
          return old;
        end
        $$
      `)
      await pool.query(`
        create trigger ${triggerName}
        before delete on anime_entries
        for each row execute function ${triggerName}()
      `)

      await expect(
        createAnimeEntry(database, {
          userId: owner.id,
          catalogueItemId: item.id,
          status: 'planned',
        }),
      ).resolves.toEqual({
        kind: 'already_exists',
        status: 'completed',
      })

      await gate.query('select pg_advisory_lock($1)', [advisoryLockKey])
      removalPromise = removeAnimeEntry(database, {
        userId: owner.id,
        entryId: entry.id,
      })
      await waitForDatabaseWait({
        waitEvent: 'advisory',
        queryPrefix: 'delete from "anime_entries"',
      })
      await gate.query('select pg_advisory_unlock($1)', [advisoryLockKey])

      await expect(removalPromise).resolves.toEqual({ kind: 'removed' })
      await expect(
        database
          .select()
          .from(animeEntries)
          .where(eq(animeEntries.userId, owner.id)),
      ).resolves.toEqual([])
    } finally {
      await gate
        .query('select pg_advisory_unlock($1)', [advisoryLockKey])
        .catch(() => undefined)
      await removalPromise?.catch(() => undefined)
      gate.release()
      await pool
        .query(`drop trigger if exists ${triggerName} on anime_entries`)
        .catch(() => undefined)
      await pool
        .query(`drop function if exists ${triggerName}()`)
        .catch(() => undefined)
    }
  })

  it('lets Add create a fresh default row after deletion wins the relationship race', async () => {
    const advisoryLockKey = 300034
    const triggerName = 'm30_test_pause_delete_before_add'
    const owner = await insertUser()
    const item = await insertCatalogueItem()
    const removedEntry = await insertEntry(owner.id, item.id, {
      status: 'completed',
      episodeProgress: 12,
      episodeTotalOverride: 13,
      rating: 8.5,
      isFavourite: true,
      startDate: '2024-01-02',
      finishDate: '2024-01-03',
    })
    const gate = await pool.connect()
    let removalPromise: ReturnType<typeof removeAnimeEntry> | undefined
    let addPromise: ReturnType<typeof createAnimeEntry> | undefined

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
        before insert on anime_entries
        for each row execute function ${triggerName}()
      `)
      await gate.query('select pg_advisory_lock($1)', [advisoryLockKey])

      addPromise = createAnimeEntry(database, {
        userId: owner.id,
        catalogueItemId: item.id,
        status: 'planned',
      })
      await waitForDatabaseWait({
        waitEvent: 'advisory',
        queryPrefix: '%insert into "anime_entries"',
      })

      removalPromise = removeAnimeEntry(database, {
        userId: owner.id,
        entryId: removedEntry.id,
      })
      await expect(removalPromise).resolves.toEqual({ kind: 'removed' })
      await expect(readEntry(removedEntry.id)).resolves.toBeUndefined()

      await gate.query('select pg_advisory_unlock($1)', [advisoryLockKey])
      await expect(addPromise).resolves.toEqual({
        kind: 'created',
        status: 'planned',
      })

      const [freshEntry] = await database
        .select()
        .from(animeEntries)
        .where(eq(animeEntries.userId, owner.id))
      expect(freshEntry).toMatchObject({
        catalogueItemId: item.id,
        status: 'planned',
        episodeProgress: 0,
        episodeTotalOverride: null,
        rating: null,
        isFavourite: false,
        startDate: null,
        finishDate: null,
      })
      expect(freshEntry?.id).not.toBe(removedEntry.id)
    } finally {
      await gate
        .query('select pg_advisory_unlock($1)', [advisoryLockKey])
        .catch(() => undefined)
      await removalPromise?.catch(() => undefined)
      await addPromise?.catch(() => undefined)
      gate.release()
      await pool
        .query(`drop trigger if exists ${triggerName} on anime_entries`)
        .catch(() => undefined)
      await pool
        .query(`drop function if exists ${triggerName}()`)
        .catch(() => undefined)
    }
  })

  it('rechecks a winning safe-to-adult curation update before deletion', async () => {
    const owner = await insertUser()
    const item = await insertCatalogueItem()
    const entry = await insertEntry(owner.id, item.id)
    const curator = await pool.connect()

    try {
      await curator.query('begin')
      await curator.query(
        "update anime_catalogue_items set maturity = 'adult' where id = $1",
        [item.id],
      )
      const removal = removeAnimeEntry(database, {
        userId: owner.id,
        entryId: entry.id,
      })
      await waitForEntryUpdateLock(entry.id)
      await curator.query('commit')

      await expect(removal).resolves.toEqual({ kind: 'unavailable' })
      await expect(readEntry(entry.id)).resolves.toEqual(entry)
    } finally {
      await curator.query('rollback').catch(() => undefined)
      curator.release()
    }
  })

  it('holds catalogue eligibility through deletion while curation waits without deadlock', async () => {
    const advisoryLockKey = 300030
    const triggerName = 'm30_test_pause_entry_delete'
    const owner = await insertUser()
    const item = await insertCatalogueItem()
    const entry = await insertEntry(owner.id, item.id)
    const gate = await pool.connect()
    const curator = await pool.connect()
    let curationPromise: Promise<unknown> | undefined

    try {
      await pool.query(`
        create function ${triggerName}() returns trigger language plpgsql as $$
        begin
          perform pg_advisory_xact_lock(${advisoryLockKey});
          return old;
        end
        $$
      `)
      await pool.query(`
        create trigger ${triggerName}
        before delete on anime_entries
        for each row execute function ${triggerName}()
      `)
      await gate.query('select pg_advisory_lock($1)', [advisoryLockKey])

      const removal = removeAnimeEntry(database, {
        userId: owner.id,
        entryId: entry.id,
      })
      await waitForDatabaseWait({
        waitEvent: 'advisory',
        queryPrefix: 'delete from "anime_entries"',
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
      await expect(removal).resolves.toEqual({ kind: 'removed' })
      await curationPromise
      await curator.query('commit')

      await expect(readEntry(entry.id)).resolves.toBeUndefined()
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

  it('throws rather than reporting success when an eligible locked row is not deleted', async () => {
    const triggerName = 'm30_test_skip_entry_delete'
    const owner = await insertUser()
    const item = await insertCatalogueItem()
    const entry = await insertEntry(owner.id, item.id)

    try {
      await pool.query(`
        create function ${triggerName}() returns trigger language plpgsql as $$
        begin
          return null;
        end
        $$
      `)
      await pool.query(`
        create trigger ${triggerName}
        before delete on anime_entries
        for each row execute function ${triggerName}()
      `)

      await expect(
        removeAnimeEntry(database, {
          userId: owner.id,
          entryId: entry.id,
        }),
      ).rejects.toThrow('Eligible anime entry removal did not delete one row')
      await expect(readEntry(entry.id)).resolves.toEqual(entry)
    } finally {
      await pool
        .query(`drop trigger if exists ${triggerName} on anime_entries`)
        .catch(() => undefined)
      await pool
        .query(`drop function if exists ${triggerName}()`)
        .catch(() => undefined)
    }
  })
})

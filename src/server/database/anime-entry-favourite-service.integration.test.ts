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
import { updateAnimeEntryDateRange } from '@/server/database/anime-entry-date-range-service'
import { updateAnimeEntryFavourite } from '@/server/database/anime-entry-favourite-service'
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
      englishTitle: `Favourite fixture ${randomUUID()}`,
      format: 'tv',
      releaseStatus: 'finished',
      maturity: 'safe',
      catalogueState: 'published',
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

async function waitForEntryUpdateLock(entryId: string) {
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

describe('anime entry favourite service', () => {
  it('sets and removes the absolute favourite state while preserving every sibling field', async () => {
    const owner = await insertUser()
    const item = await insertCatalogueItem()
    const entry = await insertEntry(owner.id, item.id, {
      status: 'on_hold',
      episodeProgress: 4,
      episodeTotalOverride: 12,
      rating: 7.5,
      startDate: '2024-01-02',
      finishDate: '2024-01-03',
    })
    const set = {
      userId: owner.id,
      entryId: entry.id,
      expectedFavourite: false,
      requestedFavourite: true,
    }
    await expect(updateAnimeEntryFavourite(database, set)).resolves.toEqual({
      kind: 'updated',
      isFavourite: true,
    })
    const afterSet = await readEntry(entry.id)
    expect(afterSet).toMatchObject({
      isFavourite: true,
      status: 'on_hold',
      episodeProgress: 4,
      episodeTotalOverride: 12,
      rating: 7.5,
      startDate: '2024-01-02',
      finishDate: '2024-01-03',
      createdAt: baselineCreatedAt,
    })
    expect(afterSet?.updatedAt.getTime()).toBeGreaterThan(
      baselineUpdatedAt.getTime(),
    )
    await expect(
      updateAnimeEntryFavourite(database, {
        ...set,
        expectedFavourite: true,
        requestedFavourite: false,
      }),
    ).resolves.toEqual({ kind: 'updated', isFavourite: false })
    expect(await readEntry(entry.id)).toMatchObject({
      isFavourite: false,
      status: 'on_hold',
      episodeProgress: 4,
      episodeTotalOverride: 12,
      rating: 7.5,
      startDate: '2024-01-02',
      finishDate: '2024-01-03',
    })
  })

  it('permits every status and format, including hidden and draft entries', async () => {
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
        updateAnimeEntryFavourite(database, {
          userId: owner.id,
          entryId: entry.id,
          expectedFavourite: false,
          requestedFavourite: true,
        }),
      ).resolves.toEqual({ kind: 'updated', isFavourite: true })
    }
  })

  it('collapses missing, foreign, and adult targets to unavailable without writes', async () => {
    const [owner, otherOwner] = await Promise.all([insertUser(), insertUser()])
    const safeItem = await insertCatalogueItem()
    const adultItem = await insertCatalogueItem({ maturity: 'adult' })
    const entry = await insertEntry(owner.id, safeItem.id)
    const adultEntry = await insertEntry(owner.id, adultItem.id, {
      isFavourite: true,
    })
    const before = await readEntry(entry.id)
    const adultBefore = await readEntry(adultEntry.id)
    for (const request of [
      {
        userId: otherOwner.id,
        entryId: entry.id,
        expectedFavourite: false,
        requestedFavourite: true,
      },
      {
        userId: owner.id,
        entryId: randomUUID(),
        expectedFavourite: false,
        requestedFavourite: true,
      },
      {
        userId: owner.id,
        entryId: adultEntry.id,
        expectedFavourite: true,
        requestedFavourite: false,
      },
    ])
      await expect(
        updateAnimeEntryFavourite(database, request),
      ).resolves.toEqual({ kind: 'unavailable' })
    await expect(readEntry(entry.id)).resolves.toEqual(before)
    await expect(readEntry(adultEntry.id)).resolves.toEqual(adultBefore)
  })

  it('keeps timestamps unchanged for no-ops and replay, detects conflicts, and accepts the documented ABA limitation', async () => {
    const owner = await insertUser()
    const item = await insertCatalogueItem()
    const entry = await insertEntry(owner.id, item.id)
    const first = {
      userId: owner.id,
      entryId: entry.id,
      expectedFavourite: false,
      requestedFavourite: true,
    }
    await expect(
      updateAnimeEntryFavourite(database, {
        ...first,
        requestedFavourite: false,
      }),
    ).resolves.toEqual({ kind: 'unchanged', isFavourite: false })
    await expect(readEntry(entry.id)).resolves.toEqual(entry)
    await expect(updateAnimeEntryFavourite(database, first)).resolves.toEqual({
      kind: 'updated',
      isFavourite: true,
    })
    const afterFirst = await readEntry(entry.id)
    await expect(updateAnimeEntryFavourite(database, first)).resolves.toEqual({
      kind: 'updated',
      isFavourite: true,
    })
    await expect(readEntry(entry.id)).resolves.toEqual(afterFirst)
    await expect(
      updateAnimeEntryFavourite(database, {
        ...first,
        expectedFavourite: false,
        requestedFavourite: false,
      }),
    ).resolves.toEqual({ kind: 'conflict', currentFavourite: true })
    await expect(
      updateAnimeEntryFavourite(database, {
        ...first,
        expectedFavourite: true,
        requestedFavourite: false,
      }),
    ).resolves.toEqual({ kind: 'updated', isFavourite: false })
    await expect(updateAnimeEntryFavourite(database, first)).resolves.toEqual({
      kind: 'updated',
      isFavourite: true,
    })
  })

  it('serializes concurrent favourite CAS and permits a deliberate retry', async () => {
    const owner = await insertUser()
    const item = await insertCatalogueItem()
    const entry = await insertEntry(owner.id, item.id)
    const [first, second] = await Promise.all([
      updateAnimeEntryFavourite(database, {
        userId: owner.id,
        entryId: entry.id,
        expectedFavourite: false,
        requestedFavourite: true,
      }),
      updateAnimeEntryFavourite(database, {
        userId: owner.id,
        entryId: entry.id,
        expectedFavourite: false,
        requestedFavourite: false,
      }),
    ])
    expect(
      [first, second].filter((result) => result.kind === 'updated'),
    ).toHaveLength(1)
    const currentFavourite = (await readEntry(entry.id))!.isFavourite
    const conflict = [first, second].find(
      (result) => result.kind === 'conflict',
    )
    expect(conflict).toEqual({ kind: 'conflict', currentFavourite })
    await expect(
      updateAnimeEntryFavourite(database, {
        userId: owner.id,
        entryId: entry.id,
        expectedFavourite: currentFavourite,
        requestedFavourite: !currentFavourite,
      }),
    ).resolves.toEqual({ kind: 'updated', isFavourite: !currentFavourite })
  })

  it('allows independent favourite and date-range mutations on one entry without false conflicts', async () => {
    const owner = await insertUser()
    const item = await insertCatalogueItem()
    const entry = await insertEntry(owner.id, item.id)

    const [favouriteResult, dateResult] = await Promise.all([
      updateAnimeEntryFavourite(database, {
        userId: owner.id,
        entryId: entry.id,
        expectedFavourite: false,
        requestedFavourite: true,
      }),
      updateAnimeEntryDateRange(database, {
        userId: owner.id,
        entryId: entry.id,
        expectedStartDate: null,
        expectedFinishDate: null,
        requestedStartDate: '2024-02-29',
        requestedFinishDate: '2024-03-01',
      }),
    ])

    expect(favouriteResult).toEqual({ kind: 'updated', isFavourite: true })
    expect(dateResult).toEqual({
      kind: 'updated',
      startDate: '2024-02-29',
      finishDate: '2024-03-01',
    })
    await expect(readEntry(entry.id)).resolves.toMatchObject({
      isFavourite: true,
      startDate: '2024-02-29',
      finishDate: '2024-03-01',
    })
  })

  it('rechecks a winning safe-to-adult curation change before writing', async () => {
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
      const mutation = updateAnimeEntryFavourite(database, {
        userId: owner.id,
        entryId: entry.id,
        expectedFavourite: false,
        requestedFavourite: true,
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
})

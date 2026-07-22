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
      englishTitle: `Date fixture ${randomUUID()}`,
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

describe('anime entry date range service', () => {
  it('saves partial, paired, same-day, changed, and cleared ranges while preserving every sibling field', async () => {
    const owner = await insertUser()
    const item = await insertCatalogueItem()
    const entry = await insertEntry(owner.id, item.id, {
      isFavourite: true,
      status: 'on_hold',
      episodeProgress: 4,
      episodeTotalOverride: 12,
      rating: 7.5,
    })
    const request = {
      userId: owner.id,
      entryId: entry.id,
      expectedStartDate: null,
      expectedFinishDate: null,
      requestedStartDate: '2024-02-29' as const,
      requestedFinishDate: null,
    }
    await expect(updateAnimeEntryDateRange(database, request)).resolves.toEqual(
      { kind: 'updated', startDate: '2024-02-29', finishDate: null },
    )
    const afterStart = await readEntry(entry.id)
    expect(afterStart).toMatchObject({
      startDate: '2024-02-29',
      finishDate: null,
      isFavourite: true,
      status: 'on_hold',
      episodeProgress: 4,
      episodeTotalOverride: 12,
      rating: 7.5,
      createdAt: baselineCreatedAt,
    })
    await expect(
      updateAnimeEntryDateRange(database, {
        ...request,
        expectedStartDate: '2024-02-29',
        requestedFinishDate: '2024-02-29',
      }),
    ).resolves.toEqual({
      kind: 'updated',
      startDate: '2024-02-29',
      finishDate: '2024-02-29',
    })
    await expect(
      updateAnimeEntryDateRange(database, {
        ...request,
        expectedStartDate: '2024-02-29',
        expectedFinishDate: '2024-02-29',
        requestedStartDate: null,
        requestedFinishDate: '2024-03-01',
      }),
    ).resolves.toEqual({
      kind: 'updated',
      startDate: null,
      finishDate: '2024-03-01',
    })
    await expect(
      updateAnimeEntryDateRange(database, {
        ...request,
        expectedFinishDate: '2024-03-01',
        requestedStartDate: null,
        requestedFinishDate: null,
      }),
    ).resolves.toEqual({ kind: 'updated', startDate: null, finishDate: null })
    expect((await readEntry(entry.id))?.updatedAt.getTime()).toBeGreaterThan(
      afterStart!.updatedAt.getTime(),
    )
  })

  it('permits date ranges for every status and format, including hidden and draft entries', async () => {
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
        updateAnimeEntryDateRange(database, {
          userId: owner.id,
          entryId: entry.id,
          expectedStartDate: null,
          expectedFinishDate: null,
          requestedStartDate: null,
          requestedFinishDate: '2026-01-01',
        }),
      ).resolves.toEqual({
        kind: 'updated',
        startDate: null,
        finishDate: '2026-01-01',
      })
    }
  })

  it('keeps timestamps unchanged for no-ops and replay, detects either-field conflicts, supports retry, and documents ABA', async () => {
    const owner = await insertUser()
    const item = await insertCatalogueItem()
    const entry = await insertEntry(owner.id, item.id, {
      startDate: '2024-01-01',
      finishDate: '2024-01-02',
    })
    const first = {
      userId: owner.id,
      entryId: entry.id,
      expectedStartDate: '2024-01-01' as const,
      expectedFinishDate: '2024-01-02' as const,
      requestedStartDate: '2024-01-03' as const,
      requestedFinishDate: '2024-01-04' as const,
    }
    await expect(
      updateAnimeEntryDateRange(database, {
        ...first,
        requestedStartDate: '2024-01-01',
        requestedFinishDate: '2024-01-02',
      }),
    ).resolves.toEqual({
      kind: 'unchanged',
      startDate: '2024-01-01',
      finishDate: '2024-01-02',
    })
    await expect(readEntry(entry.id)).resolves.toEqual(entry)
    await expect(updateAnimeEntryDateRange(database, first)).resolves.toEqual({
      kind: 'updated',
      startDate: '2024-01-03',
      finishDate: '2024-01-04',
    })
    const afterFirst = await readEntry(entry.id)
    await expect(updateAnimeEntryDateRange(database, first)).resolves.toEqual({
      kind: 'updated',
      startDate: '2024-01-03',
      finishDate: '2024-01-04',
    })
    await expect(readEntry(entry.id)).resolves.toEqual(afterFirst)
    await expect(
      updateAnimeEntryDateRange(database, {
        ...first,
        requestedStartDate: '2024-01-05',
        requestedFinishDate: '2024-01-06',
      }),
    ).resolves.toEqual({
      kind: 'conflict',
      currentStartDate: '2024-01-03',
      currentFinishDate: '2024-01-04',
    })
    await expect(
      updateAnimeEntryDateRange(database, {
        ...first,
        expectedStartDate: '2024-01-03',
        expectedFinishDate: '2024-01-04',
        requestedStartDate: '2024-01-05',
        requestedFinishDate: '2024-01-06',
      }),
    ).resolves.toEqual({
      kind: 'updated',
      startDate: '2024-01-05',
      finishDate: '2024-01-06',
    })
    await expect(
      updateAnimeEntryDateRange(database, {
        ...first,
        expectedStartDate: '2024-01-05',
        expectedFinishDate: '2024-01-06',
        requestedStartDate: '2024-01-01',
        requestedFinishDate: '2024-01-02',
      }),
    ).resolves.toEqual({
      kind: 'updated',
      startDate: '2024-01-01',
      finishDate: '2024-01-02',
    })
    await expect(updateAnimeEntryDateRange(database, first)).resolves.toEqual({
      kind: 'updated',
      startDate: '2024-01-03',
      finishDate: '2024-01-04',
    })
  })

  it('collapses missing, foreign, and adult targets to unavailable without writes', async () => {
    const [owner, otherOwner] = await Promise.all([insertUser(), insertUser()])
    const safeItem = await insertCatalogueItem()
    const adultItem = await insertCatalogueItem({ maturity: 'adult' })
    const entry = await insertEntry(owner.id, safeItem.id, {
      startDate: '2024-01-01',
    })
    const adultEntry = await insertEntry(owner.id, adultItem.id, {
      finishDate: '2024-01-02',
    })
    const before = await readEntry(entry.id)
    const adultBefore = await readEntry(adultEntry.id)
    for (const request of [
      { userId: otherOwner.id, entryId: entry.id },
      { userId: owner.id, entryId: randomUUID() },
      { userId: owner.id, entryId: adultEntry.id },
    ])
      await expect(
        updateAnimeEntryDateRange(database, {
          ...request,
          expectedStartDate: null,
          expectedFinishDate: null,
          requestedStartDate: '2024-01-03',
          requestedFinishDate: null,
        }),
      ).resolves.toEqual({ kind: 'unavailable' })
    await expect(readEntry(entry.id)).resolves.toEqual(before)
    await expect(readEntry(adultEntry.id)).resolves.toEqual(adultBefore)
  })

  it('serializes concurrent pair CAS and rejects a winning safe-to-adult reclassification', async () => {
    const owner = await insertUser()
    const item = await insertCatalogueItem()
    const entry = await insertEntry(owner.id, item.id)
    const [first, second] = await Promise.all([
      updateAnimeEntryDateRange(database, {
        userId: owner.id,
        entryId: entry.id,
        expectedStartDate: null,
        expectedFinishDate: null,
        requestedStartDate: '2024-01-01',
        requestedFinishDate: null,
      }),
      updateAnimeEntryDateRange(database, {
        userId: owner.id,
        entryId: entry.id,
        expectedStartDate: null,
        expectedFinishDate: null,
        requestedStartDate: null,
        requestedFinishDate: '2024-01-02',
      }),
    ])
    expect(
      [first, second].filter((result) => result.kind === 'updated'),
    ).toHaveLength(1)
    expect(
      [first, second].filter((result) => result.kind === 'conflict'),
    ).toHaveLength(1)
    const barrierItem = await insertCatalogueItem()
    const barrierEntry = await insertEntry(owner.id, barrierItem.id)
    const before = await readEntry(barrierEntry.id)
    const curator = await pool.connect()
    try {
      await curator.query('begin')
      await curator.query(
        "update anime_catalogue_items set maturity = 'adult' where id = $1",
        [barrierItem.id],
      )
      const mutation = updateAnimeEntryDateRange(database, {
        userId: owner.id,
        entryId: barrierEntry.id,
        expectedStartDate: null,
        expectedFinishDate: null,
        requestedStartDate: '2024-01-03',
        requestedFinishDate: null,
      })
      await waitForEntryUpdateLock(barrierEntry.id)
      await curator.query('commit')
      await expect(mutation).resolves.toEqual({ kind: 'unavailable' })
      await expect(readEntry(barrierEntry.id)).resolves.toEqual(before)
    } finally {
      await curator.query('rollback').catch(() => undefined)
      curator.release()
    }
  })
})

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
import {
  entryStatusValues,
  type EntryStatus,
} from '@/features/archive/domain/entry-status'
import { updateAnimeEntryStatus } from '@/server/database/anime-entry-service'
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

const realStatusTransitions = entryStatusValues.flatMap((expectedStatus) =>
  entryStatusValues
    .filter((requestedStatus) => requestedStatus !== expectedStatus)
    .map((requestedStatus) => ({ expectedStatus, requestedStatus })),
)

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

  if (!user) {
    throw new Error('Expected user fixture')
  }

  return user
}

async function insertCatalogueItem(
  overrides: Partial<typeof animeCatalogueItems.$inferInsert> = {},
) {
  const [item] = await database
    .insert(animeCatalogueItems)
    .values({
      englishTitle: `Status fixture ${randomUUID()}`,
      format: 'tv',
      releaseStatus: 'finished',
      maturity: 'safe',
      catalogueState: 'published',
      ...overrides,
    })
    .returning()

  if (!item) {
    throw new Error('Expected catalogue item fixture')
  }

  return item
}

async function insertEntry(
  userId: string,
  catalogueItemId: string,
  status: EntryStatus,
) {
  const [entry] = await database
    .insert(animeEntries)
    .values({
      userId,
      catalogueItemId,
      status,
      createdAt: baselineCreatedAt,
      updatedAt: baselineUpdatedAt,
    })
    .returning()

  if (!entry) {
    throw new Error('Expected anime entry fixture')
  }

  return entry
}

async function readStoredEntry(entryId: string) {
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

  throw new Error('Status mutation did not acquire the entry lock')
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

describe('updateAnimeEntryStatus', () => {
  it.each(realStatusTransitions)(
    'atomically updates $expectedStatus to $requestedStatus with database time',
    async ({ expectedStatus, requestedStatus }) => {
      const [owner, item] = await Promise.all([
        insertUser(),
        insertCatalogueItem(),
      ])
      const entry = await insertEntry(owner.id, item.id, expectedStatus)

      await expect(
        updateAnimeEntryStatus(database, {
          userId: owner.id,
          entryId: entry.id,
          expectedStatus,
          requestedStatus,
        }),
      ).resolves.toEqual({ kind: 'updated', status: requestedStatus })

      await expect(readStoredEntry(entry.id)).resolves.toMatchObject({
        id: entry.id,
        status: requestedStatus,
        createdAt: baselineCreatedAt,
        updatedAt: expect.any(Date),
      })
      const storedEntry = await readStoredEntry(entry.id)
      expect(storedEntry?.updatedAt.getTime()).toBeGreaterThan(
        baselineUpdatedAt.getTime(),
      )
    },
  )

  it.each(entryStatusValues)(
    'preserves the exact row for a forged same-status %s request',
    async (status) => {
      const [owner, item] = await Promise.all([
        insertUser(),
        insertCatalogueItem(),
      ])
      const entry = await insertEntry(owner.id, item.id, status)
      const before = await readStoredEntry(entry.id)

      await expect(
        updateAnimeEntryStatus(database, {
          userId: owner.id,
          entryId: entry.id,
          expectedStatus: status,
          requestedStatus: status,
        }),
      ).resolves.toEqual({ kind: 'unchanged', status })
      await expect(readStoredEntry(entry.id)).resolves.toEqual(before)
    },
  )

  it('preserves episode progress and personal total through a status mutation', async () => {
    const [owner, item] = await Promise.all([
      insertUser(),
      insertCatalogueItem(),
    ])
    const [entry] = await database
      .insert(animeEntries)
      .values({
        userId: owner.id,
        catalogueItemId: item.id,
        status: 'planned',
        episodeProgress: 7,
        episodeTotalOverride: 13,
        isFavourite: true,
        startDate: '2024-01-02',
        finishDate: '2024-01-03',
        createdAt: baselineCreatedAt,
        updatedAt: baselineUpdatedAt,
      })
      .returning()

    if (entry === undefined) throw new Error('Expected anime entry fixture')

    await expect(
      updateAnimeEntryStatus(database, {
        userId: owner.id,
        entryId: entry.id,
        expectedStatus: 'planned',
        requestedStatus: 'completed',
      }),
    ).resolves.toEqual({ kind: 'updated', status: 'completed' })
    await expect(readStoredEntry(entry.id)).resolves.toMatchObject({
      status: 'completed',
      episodeProgress: 7,
      episodeTotalOverride: 13,
      isFavourite: true,
      startDate: '2024-01-02',
      finishDate: '2024-01-03',
      createdAt: baselineCreatedAt,
    })
  })

  it('treats a lost-response replay as updated without advancing the first write timestamp', async () => {
    const [owner, item] = await Promise.all([
      insertUser(),
      insertCatalogueItem(),
    ])
    const entry = await insertEntry(owner.id, item.id, 'planned')
    const request = {
      userId: owner.id,
      entryId: entry.id,
      expectedStatus: 'planned' as const,
      requestedStatus: 'completed' as const,
    }

    await expect(updateAnimeEntryStatus(database, request)).resolves.toEqual({
      kind: 'updated',
      status: 'completed',
    })
    const afterFirstWrite = await readStoredEntry(entry.id)

    await expect(updateAnimeEntryStatus(database, request)).resolves.toEqual({
      kind: 'updated',
      status: 'completed',
    })
    await expect(readStoredEntry(entry.id)).resolves.toEqual(afterFirstWrite)
  })

  it('returns the current status for a stale same-status request without writing', async () => {
    const [owner, item] = await Promise.all([
      insertUser(),
      insertCatalogueItem(),
    ])
    const entry = await insertEntry(owner.id, item.id, 'completed')
    const before = await readStoredEntry(entry.id)

    await expect(
      updateAnimeEntryStatus(database, {
        userId: owner.id,
        entryId: entry.id,
        expectedStatus: 'planned',
        requestedStatus: 'planned',
      }),
    ).resolves.toEqual({
      kind: 'conflict',
      currentStatus: 'completed',
    })
    await expect(readStoredEntry(entry.id)).resolves.toEqual(before)
  })

  it('collapses missing and cross-owner targets to the same unavailable result without mutation', async () => {
    const [owner, otherUser, item] = await Promise.all([
      insertUser(),
      insertUser(),
      insertCatalogueItem(),
    ])
    const entry = await insertEntry(owner.id, item.id, 'on_hold')
    const before = await readStoredEntry(entry.id)
    const baseRequest = {
      userId: otherUser.id,
      expectedStatus: 'on_hold' as const,
      requestedStatus: 'dropped' as const,
    }

    await expect(
      updateAnimeEntryStatus(database, {
        ...baseRequest,
        entryId: entry.id,
      }),
    ).resolves.toEqual({ kind: 'unavailable' })
    await expect(
      updateAnimeEntryStatus(database, {
        ...baseRequest,
        entryId: randomUUID(),
      }),
    ).resolves.toEqual({ kind: 'unavailable' })
    await expect(readStoredEntry(entry.id)).resolves.toEqual(before)
  })

  it.each(['hidden', 'draft'] as const)(
    'updates an owned non-adult %s catalogue entry',
    async (catalogueState) => {
      const [owner, item] = await Promise.all([
        insertUser(),
        insertCatalogueItem({ catalogueState }),
      ])
      const entry = await insertEntry(owner.id, item.id, 'planned')

      await expect(
        updateAnimeEntryStatus(database, {
          userId: owner.id,
          entryId: entry.id,
          expectedStatus: 'planned',
          requestedStatus: 'in_progress',
        }),
      ).resolves.toEqual({ kind: 'updated', status: 'in_progress' })
      expect((await readStoredEntry(entry.id))?.status).toBe('in_progress')
    },
  )

  it('blocks an adult target from update and same-status classification', async () => {
    const [owner, item] = await Promise.all([
      insertUser(),
      insertCatalogueItem({ maturity: 'adult' }),
    ])
    const entry = await insertEntry(owner.id, item.id, 'planned')
    const before = await readStoredEntry(entry.id)

    for (const requestedStatus of ['completed', 'planned'] as const) {
      await expect(
        updateAnimeEntryStatus(database, {
          userId: owner.id,
          entryId: entry.id,
          expectedStatus: 'planned',
          requestedStatus,
        }),
      ).resolves.toEqual({ kind: 'unavailable' })
    }
    await expect(readStoredEntry(entry.id)).resolves.toEqual(before)
  })

  it('blocks an entry reclassified as adult before submission', async () => {
    const [owner, item] = await Promise.all([
      insertUser(),
      insertCatalogueItem({ maturity: 'safe' }),
    ])
    const entry = await insertEntry(owner.id, item.id, 'planned')
    await database
      .update(animeCatalogueItems)
      .set({ maturity: 'adult' })
      .where(eq(animeCatalogueItems.id, item.id))

    await expect(
      updateAnimeEntryStatus(database, {
        userId: owner.id,
        entryId: entry.id,
        expectedStatus: 'planned',
        requestedStatus: 'completed',
      }),
    ).resolves.toEqual({ kind: 'unavailable' })
    expect((await readStoredEntry(entry.id))?.status).toBe('planned')
  })

  it('allows one concurrent compare-and-set winner, reports the loser, and permits an intentional retry', async () => {
    const [owner, item] = await Promise.all([
      insertUser(),
      insertCatalogueItem(),
    ])
    const entry = await insertEntry(owner.id, item.id, 'planned')
    const requestedStatuses = ['in_progress', 'completed'] as const
    const outcomes = await Promise.all(
      requestedStatuses.map((requestedStatus) =>
        updateAnimeEntryStatus(database, {
          userId: owner.id,
          entryId: entry.id,
          expectedStatus: 'planned',
          requestedStatus,
        }),
      ),
    )
    const updatedOutcome = outcomes.find(
      (outcome): outcome is Extract<typeof outcome, { kind: 'updated' }> =>
        outcome.kind === 'updated',
    )
    const conflictOutcome = outcomes.find(
      (outcome): outcome is Extract<typeof outcome, { kind: 'conflict' }> =>
        outcome.kind === 'conflict',
    )

    expect(updatedOutcome).toBeDefined()
    expect(conflictOutcome).toEqual({
      kind: 'conflict',
      currentStatus: updatedOutcome?.status,
    })
    expect((await readStoredEntry(entry.id))?.status).toBe(
      updatedOutcome?.status,
    )

    const losingRequestedStatus = requestedStatuses.find(
      (status) => status !== updatedOutcome?.status,
    )
    if (!updatedOutcome || !losingRequestedStatus) {
      throw new Error('Expected one update winner and one losing request')
    }

    await expect(
      updateAnimeEntryStatus(database, {
        userId: owner.id,
        entryId: entry.id,
        expectedStatus: updatedOutcome.status,
        requestedStatus: losingRequestedStatus,
      }),
    ).resolves.toEqual({
      kind: 'updated',
      status: losingRequestedStatus,
    })
    expect((await readStoredEntry(entry.id))?.status).toBe(
      losingRequestedStatus,
    )
  })

  it('rechecks a winning safe-to-adult curation update before changing status', async () => {
    const [owner, item] = await Promise.all([
      insertUser(),
      insertCatalogueItem(),
    ])
    const entry = await insertEntry(owner.id, item.id, 'planned')
    const before = await readStoredEntry(entry.id)
    const curator = await pool.connect()

    try {
      await curator.query('begin')
      await curator.query(
        "update anime_catalogue_items set maturity = 'adult' where id = $1",
        [item.id],
      )
      const mutation = updateAnimeEntryStatus(database, {
        userId: owner.id,
        entryId: entry.id,
        expectedStatus: 'planned',
        requestedStatus: 'completed',
      })
      await waitForEntryUpdateLock(entry.id)
      await curator.query('commit')

      await expect(mutation).resolves.toEqual({ kind: 'unavailable' })
      await expect(readStoredEntry(entry.id)).resolves.toEqual(before)
    } finally {
      await curator.query('rollback').catch(() => undefined)
      curator.release()
    }
  })
})

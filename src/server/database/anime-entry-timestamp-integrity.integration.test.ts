import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool, type PoolClient } from 'pg'
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
  updateAnimeEntryEpisodeProgress,
  updateAnimeEntryEpisodeTotalOverride,
} from '@/server/database/anime-entry-episode-progress-service'
import { updateAnimeEntryFavourite } from '@/server/database/anime-entry-favourite-service'
import { updateAnimeEntryRating } from '@/server/database/anime-entry-rating-service'
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
const futureUpdatedAt = new Date('2100-01-01T00:00:00.000Z')

type StoredEntry = typeof animeEntries.$inferSelect

type Mutation = {
  name: string
  invoke: (
    executor: NodePgDatabase,
    userId: string,
    entryId: string,
  ) => Promise<unknown>
  expectedResult: (status: StoredEntry['status']) => unknown
  assertMutation: (entry: StoredEntry) => void
  expectedState: Partial<MutableEntryState>
}

type MutableEntryState = Pick<
  StoredEntry,
  | 'status'
  | 'episodeProgress'
  | 'episodeTotalOverride'
  | 'rating'
  | 'isFavourite'
  | 'startDate'
  | 'finishDate'
>

const baselineMutableEntryState: MutableEntryState = {
  status: 'planned',
  episodeProgress: 0,
  episodeTotalOverride: null,
  rating: null,
  isFavourite: false,
  startDate: null,
  finishDate: null,
}

const statusMutation: Mutation = {
  name: 'status',
  invoke: (executor, userId, entryId) =>
    updateAnimeEntryStatus(executor, {
      userId,
      entryId,
      expectedStatus: 'planned',
      requestedStatus: 'in_progress',
    }),
  expectedResult: () => ({ kind: 'updated', status: 'in_progress' }),
  assertMutation: (entry) => expect(entry.status).toBe('in_progress'),
  expectedState: { status: 'in_progress' },
}

const siblingMutations: Mutation[] = [
  {
    name: 'episode progress',
    invoke: (executor, userId, entryId) =>
      updateAnimeEntryEpisodeProgress(executor, {
        userId,
        entryId,
        expectedEpisodeProgress: 0,
        requestedEpisodeProgress: 1,
      }),
    expectedResult: (status) => ({
      kind: 'updated',
      progress: 1,
      personalTotal: null,
      catalogueTotal: null,
      status,
    }),
    assertMutation: (entry) => expect(entry.episodeProgress).toBe(1),
    expectedState: { episodeProgress: 1 },
  },
  {
    name: 'personal total',
    invoke: (executor, userId, entryId) =>
      updateAnimeEntryEpisodeTotalOverride(executor, {
        userId,
        entryId,
        expectedEpisodeTotalOverride: null,
        requestedEpisodeTotalOverride: 12,
      }),
    expectedResult: (status) => ({
      kind: 'updated',
      personalTotal: 12,
      progress: 0,
      catalogueTotal: null,
      status,
    }),
    assertMutation: (entry) => expect(entry.episodeTotalOverride).toBe(12),
    expectedState: { episodeTotalOverride: 12 },
  },
  {
    name: 'rating',
    invoke: (executor, userId, entryId) =>
      updateAnimeEntryRating(executor, {
        userId,
        entryId,
        ratingOperation: 'save',
        expectedRating: null,
        requestedRating: 7.5,
      }),
    expectedResult: () => ({ kind: 'updated', rating: 7.5 }),
    assertMutation: (entry) => expect(entry.rating).toBe(7.5),
    expectedState: { rating: 7.5 },
  },
  {
    name: 'favourite',
    invoke: (executor, userId, entryId) =>
      updateAnimeEntryFavourite(executor, {
        userId,
        entryId,
        expectedFavourite: false,
        requestedFavourite: true,
      }),
    expectedResult: () => ({ kind: 'updated', isFavourite: true }),
    assertMutation: (entry) => expect(entry.isFavourite).toBe(true),
    expectedState: { isFavourite: true },
  },
  {
    name: 'viewing dates',
    invoke: (executor, userId, entryId) =>
      updateAnimeEntryDateRange(executor, {
        userId,
        entryId,
        expectedStartDate: null,
        expectedFinishDate: null,
        requestedStartDate: '2024-01-02',
        requestedFinishDate: '2024-01-03',
      }),
    expectedResult: () => ({
      kind: 'updated',
      startDate: '2024-01-02',
      finishDate: '2024-01-03',
    }),
    assertMutation: (entry) => {
      expect(entry.startDate).toBe('2024-01-02')
      expect(entry.finishDate).toBe('2024-01-03')
    },
    expectedState: {
      startDate: '2024-01-02',
      finishDate: '2024-01-03',
    },
  },
]

const allMutations = [statusMutation, ...siblingMutations]

function createBarrier() {
  let release: () => void = () => undefined
  let reject: (reason?: unknown) => void = () => undefined
  const promise = new Promise<void>((resolve, rejectPromise) => {
    release = resolve
    reject = rejectPromise
  })
  return { promise, release, reject }
}

function expectMutableEntryState(
  entry: StoredEntry,
  ...mutations: readonly Mutation[]
) {
  expect(entry).toMatchObject(
    Object.assign(
      { ...baselineMutableEntryState },
      ...mutations.map((mutation) => mutation.expectedState),
    ),
  )
}

async function insertUser() {
  const username = `T${randomUUID().replaceAll('-', '').slice(0, 12)}`
  const [user] = await database
    .insert(users)
    .values({
      username,
      usernameIdentityKey: username.toLowerCase(),
      email: `${randomUUID()}@example.test`,
    })
    .returning()

  if (user === undefined) throw new Error('Expected timestamp fixture user')
  return user
}

async function insertCatalogueItem() {
  const [item] = await database
    .insert(animeCatalogueItems)
    .values({
      englishTitle: `Timestamp fixture ${randomUUID()}`,
      format: 'tv',
      releaseStatus: 'finished',
      maturity: 'safe',
      catalogueState: 'published',
    })
    .returning()

  if (item === undefined) throw new Error('Expected timestamp catalogue item')
  return item
}

async function insertEntry(
  userId: string,
  catalogueItemId: string,
  updatedAt: Date,
) {
  const [entry] = await database
    .insert(animeEntries)
    .values({
      userId,
      catalogueItemId,
      status: 'planned',
      createdAt: baselineCreatedAt,
      updatedAt,
    })
    .returning()

  if (entry === undefined) throw new Error('Expected timestamp entry')
  return entry
}

async function readEntry(entryId: string): Promise<StoredEntry> {
  const [entry] = await database
    .select()
    .from(animeEntries)
    .where(eq(animeEntries.id, entryId))

  if (entry === undefined) throw new Error('Expected stored timestamp entry')
  return entry
}

async function waitForLaterDatabaseMillisecond(reference: Date): Promise<void> {
  for (let observation = 0; observation < 1_000; observation += 1) {
    const result = await pool.query<{ now: Date }>(
      'select clock_timestamp() as now',
    )
    if (result.rows[0]?.now.getTime() > reference.getTime()) return
  }

  throw new Error('Database clock did not advance to a later millisecond')
}

async function waitForExactBlocker(
  waitingPid: number,
  blockingPid: number,
): Promise<void> {
  for (let observation = 0; observation < 1_000; observation += 1) {
    const result = await pool.query<{
      waiting: boolean
      blocker: number | null
      blockingWaitEvent: string | null
    }>(
      `select
        (select wait_event_type = 'Lock' from pg_stat_activity where pid = $1) as waiting,
        (select unnest(pg_blocking_pids($1)) limit 1) as blocker,
        (select wait_event_type from pg_stat_activity where pid = $2) as "blockingWaitEvent"`,
      [waitingPid, blockingPid],
    )
    const observationResult = result.rows[0]
    if (
      observationResult?.waiting === true &&
      observationResult.blocker === blockingPid &&
      observationResult.blockingWaitEvent !== 'Lock'
    ) {
      return
    }
  }

  throw new Error(
    `Expected backend ${waitingPid} to wait behind backend ${blockingPid}`,
  )
}

async function readTransactionMetadata(client: PoolClient) {
  const result = await client.query<{ startedAt: Date; pid: number }>(
    'select transaction_timestamp() as "startedAt", pg_backend_pid() as pid',
  )
  const row = result.rows[0]
  if (row === undefined) throw new Error('Expected transaction metadata')
  return row
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

describe('anime entry timestamp integrity', () => {
  it.each(
    allMutations.flatMap((mutation) => [
      { mutation, caseName: 'advances an old stored timestamp', old: true },
      {
        mutation,
        caseName: 'does not regress a later stored timestamp',
        old: false,
      },
    ]),
  )('$mutation.name $caseName', async ({ mutation, old }) => {
    const [owner, item] = await Promise.all([
      insertUser(),
      insertCatalogueItem(),
    ])
    const originalTimestamp = old ? baselineUpdatedAt : futureUpdatedAt
    const entry = await insertEntry(owner.id, item.id, originalTimestamp)

    await expect(
      mutation.invoke(database, owner.id, entry.id),
    ).resolves.toEqual(mutation.expectedResult('planned'))

    const stored = await readEntry(entry.id)
    mutation.assertMutation(stored)
    expectMutableEntryState(stored, mutation)
    expect(stored.createdAt).toEqual(baselineCreatedAt)
    expect(stored.updatedAt.getTime()).toBeGreaterThanOrEqual(
      originalTimestamp.getTime(),
    )
    if (old) {
      expect(stored.updatedAt.getTime()).toBeGreaterThan(
        originalTimestamp.getTime(),
      )
    } else {
      expect(stored.updatedAt).toEqual(futureUpdatedAt)
    }
  })

  it.each(
    siblingMutations.flatMap((sibling) => [
      { sibling, older: statusMutation, newer: sibling },
      { sibling, older: sibling, newer: statusMutation },
    ]),
  )(
    'preserves status and $sibling.name when older $older.name waits behind newer $newer.name',
    async ({ sibling, older, newer }) => {
      const [owner, item] = await Promise.all([
        insertUser(),
        insertCatalogueItem(),
      ])
      const entry = await insertEntry(owner.id, item.id, baselineUpdatedAt)
      const olderClient = await pool.connect()
      const newerClient = await pool.connect()
      const olderDatabase = drizzle({ client: olderClient })
      const newerDatabase = drizzle({ client: newerClient })
      const olderEntered = createBarrier()
      const releaseOlderService = createBarrier()
      const newerServiced = createBarrier()
      const releaseNewerCommit = createBarrier()
      let olderMetadata: { startedAt: Date; pid: number } | undefined
      let newerMetadata: { startedAt: Date; pid: number } | undefined
      let newerCommittedTimestamp: Date | undefined
      let olderCalls = 0
      let newerCalls = 0
      let olderResult: unknown
      let newerResult: unknown
      let newerTransaction: Promise<void> | undefined

      const olderTransaction = olderDatabase.transaction(
        async (transaction) => {
          olderMetadata = await readTransactionMetadata(olderClient)
          olderEntered.release()
          await releaseOlderService.promise
          olderCalls += 1
          olderResult = await older.invoke(transaction, owner.id, entry.id)
        },
        { isolationLevel: 'read committed' },
      )
      void olderTransaction.catch((error: unknown) => {
        olderEntered.reject(error)
      })

      try {
        await olderEntered.promise
        if (olderMetadata === undefined)
          throw new Error('Expected older metadata')
        await waitForLaterDatabaseMillisecond(olderMetadata.startedAt)

        newerTransaction = newerDatabase.transaction(
          async (transaction) => {
            newerMetadata = await readTransactionMetadata(newerClient)
            newerCalls += 1
            newerResult = await newer.invoke(transaction, owner.id, entry.id)
            const stored = await newerClient.query<{ updatedAt: Date }>(
              'select updated_at as "updatedAt" from anime_entries where id = $1',
              [entry.id],
            )
            newerCommittedTimestamp = stored.rows[0]?.updatedAt
            if (newerCommittedTimestamp === undefined) {
              throw new Error('Expected newer stored timestamp')
            }
            newerServiced.release()
            await releaseNewerCommit.promise
          },
          { isolationLevel: 'read committed' },
        )
        void newerTransaction.catch((error: unknown) => {
          newerServiced.reject(error)
        })

        await newerServiced.promise
        if (newerMetadata === undefined)
          throw new Error('Expected newer metadata')
        expect(newerMetadata.startedAt.getTime()).toBeGreaterThan(
          olderMetadata.startedAt.getTime(),
        )

        releaseOlderService.release()
        await waitForExactBlocker(olderMetadata.pid, newerMetadata.pid)
        releaseNewerCommit.release()

        await Promise.all([newerTransaction, olderTransaction])
        expect(newerResult).toEqual(newer.expectedResult('planned'))
        expect(olderResult).toEqual(older.expectedResult('in_progress'))
        expect(newerCalls).toBe(1)
        expect(olderCalls).toBe(1)
        if (newerCommittedTimestamp === undefined) {
          throw new Error('Expected newer committed timestamp')
        }

        const stored = await readEntry(entry.id)
        expect(stored.status).toBe('in_progress')
        sibling.assertMutation(stored)
        expectMutableEntryState(stored, statusMutation, sibling)
        expect(stored.updatedAt.getTime()).toBeGreaterThanOrEqual(
          newerCommittedTimestamp.getTime(),
        )
      } finally {
        releaseOlderService.release()
        releaseNewerCommit.release()
        await Promise.allSettled(
          newerTransaction === undefined
            ? [olderTransaction]
            : [olderTransaction, newerTransaction],
        )
        olderClient.release()
        newerClient.release()
      }
    },
  )
})

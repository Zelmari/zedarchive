import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
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
import { entryStatusValues } from '@/features/archive/domain/entry-status'
import {
  createAnimeEntry,
  getAnimeEntryCatalogueMembership,
} from '@/server/database/anime-entry-service'
import {
  animeCatalogueItems,
  animeEntries,
  users,
} from '@/server/database/schema'
import { assertSafeTestDatabaseName } from '@/test/database/global-setup'

const { databaseTestUrl } = readDatabaseTestEnvironment()
const pool = new Pool({ connectionString: databaseTestUrl })
const database = drizzle({ client: pool })

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
      englishTitle: `Fixture ${randomUUID()}`,
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

async function countEntries() {
  const rows = await database.select().from(animeEntries)
  return rows.length
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

describe('createAnimeEntry', () => {
  it.each(entryStatusValues)(
    'creates the selected canonical %s status for the authoritative owner',
    async (status) => {
      const [user, item] = await Promise.all([
        insertUser(),
        insertCatalogueItem(),
      ])

      await expect(
        createAnimeEntry(database, {
          userId: user.id,
          catalogueItemId: item.id,
          status,
        }),
      ).resolves.toEqual({ kind: 'created', status })
      await expect(
        database
          .select({ userId: animeEntries.userId, status: animeEntries.status })
          .from(animeEntries),
      ).resolves.toEqual([{ userId: user.id, status }])
    },
  )

  it('accepts published safe, sensitive, and unknown items', async () => {
    const user = await insertUser()

    for (const maturity of ['safe', 'sensitive', 'unknown'] as const) {
      const item = await insertCatalogueItem({ maturity })
      await expect(
        createAnimeEntry(database, {
          userId: user.id,
          catalogueItemId: item.id,
          status: 'planned',
        }),
      ).resolves.toEqual({ kind: 'created', status: 'planned' })
    }
  })

  it.each([
    ['adult', { maturity: 'adult' }],
    ['draft', { catalogueState: 'draft' }],
    ['hidden', { catalogueState: 'hidden' }],
  ] as const)(
    'rejects a %s item without creating an entry',
    async (_, overrides) => {
      const [user, item] = await Promise.all([
        insertUser(),
        insertCatalogueItem(overrides),
      ])

      await expect(
        createAnimeEntry(database, {
          userId: user.id,
          catalogueItemId: item.id,
          status: 'planned',
        }),
      ).resolves.toEqual({ kind: 'unavailable' })
      expect(await countEntries()).toBe(0)
    },
  )

  it('maps a nonexistent item to unavailable without creating an entry', async () => {
    const user = await insertUser()

    await expect(
      createAnimeEntry(database, {
        userId: user.id,
        catalogueItemId: randomUUID(),
        status: 'planned',
      }),
    ).resolves.toEqual({ kind: 'unavailable' })
    expect(await countEntries()).toBe(0)
  })

  it('preserves the original status and timestamps for duplicate submission', async () => {
    const [user, item] = await Promise.all([
      insertUser(),
      insertCatalogueItem(),
    ])
    await createAnimeEntry(database, {
      userId: user.id,
      catalogueItemId: item.id,
      status: 'planned',
    })
    const [beforeDuplicate] = await database
      .select({
        status: animeEntries.status,
        createdAt: animeEntries.createdAt,
        updatedAt: animeEntries.updatedAt,
      })
      .from(animeEntries)
      .where(
        and(
          eq(animeEntries.userId, user.id),
          eq(animeEntries.catalogueItemId, item.id),
        ),
      )

    await expect(
      createAnimeEntry(database, {
        userId: user.id,
        catalogueItemId: item.id,
        status: 'completed',
      }),
    ).resolves.toEqual({ kind: 'already_exists', status: 'planned' })

    const [afterDuplicate] = await database
      .select({
        status: animeEntries.status,
        createdAt: animeEntries.createdAt,
        updatedAt: animeEntries.updatedAt,
      })
      .from(animeEntries)
      .where(
        and(
          eq(animeEntries.userId, user.id),
          eq(animeEntries.catalogueItemId, item.id),
        ),
      )
    expect(afterDuplicate).toEqual(beforeDuplicate)
  })

  it('finds an owned entry after its catalogue item is later hidden', async () => {
    const [user, item] = await Promise.all([
      insertUser(),
      insertCatalogueItem(),
    ])
    await createAnimeEntry(database, {
      userId: user.id,
      catalogueItemId: item.id,
      status: 'on_hold',
    })
    await database
      .update(animeCatalogueItems)
      .set({ catalogueState: 'hidden' })
      .where(eq(animeCatalogueItems.id, item.id))

    await expect(
      createAnimeEntry(database, {
        userId: user.id,
        catalogueItemId: item.id,
        status: 'completed',
      }),
    ).resolves.toEqual({ kind: 'already_exists', status: 'on_hold' })
  })

  it('allows two owners to add the same item independently', async () => {
    const [firstUser, secondUser, item] = await Promise.all([
      insertUser(),
      insertUser(),
      insertCatalogueItem(),
    ])

    await expect(
      Promise.all([
        createAnimeEntry(database, {
          userId: firstUser.id,
          catalogueItemId: item.id,
          status: 'planned',
        }),
        createAnimeEntry(database, {
          userId: secondUser.id,
          catalogueItemId: item.id,
          status: 'completed',
        }),
      ]),
    ).resolves.toEqual([
      { kind: 'created', status: 'planned' },
      { kind: 'created', status: 'completed' },
    ])
    expect(await countEntries()).toBe(2)
  })

  it('makes concurrent conflicting submissions create once and retain the winner', async () => {
    const [user, item] = await Promise.all([
      insertUser(),
      insertCatalogueItem(),
    ])
    const [first, second] = await Promise.all([
      createAnimeEntry(database, {
        userId: user.id,
        catalogueItemId: item.id,
        status: 'planned',
      }),
      createAnimeEntry(database, {
        userId: user.id,
        catalogueItemId: item.id,
        status: 'completed',
      }),
    ])

    const outcomes = [first, second]
    const createdOutcome = outcomes.find(
      (outcome): outcome is Extract<typeof outcome, { kind: 'created' }> =>
        outcome.kind === 'created',
    )
    const existingOutcome = outcomes.find(
      (
        outcome,
      ): outcome is Extract<typeof outcome, { kind: 'already_exists' }> =>
        outcome.kind === 'already_exists',
    )
    expect(createdOutcome).toBeDefined()
    expect(existingOutcome).toBeDefined()
    expect(await countEntries()).toBe(1)
    const [storedEntry] = await database.select().from(animeEntries)
    expect(storedEntry?.status).toBe(createdOutcome?.status)
    expect(existingOutcome?.status).toBe(storedEntry?.status)
  })
})

describe('getAnimeEntryCatalogueMembership', () => {
  it('returns only the requested owner rows and supports an empty page', async () => {
    const [owner, otherUser, firstItem, secondItem, otherItem] =
      await Promise.all([
        insertUser(),
        insertUser(),
        insertCatalogueItem(),
        insertCatalogueItem(),
        insertCatalogueItem(),
      ])
    await database.insert(animeEntries).values([
      {
        userId: owner.id,
        catalogueItemId: firstItem.id,
        status: 'planned',
      },
      {
        userId: owner.id,
        catalogueItemId: otherItem.id,
        status: 'completed',
      },
      {
        userId: otherUser.id,
        catalogueItemId: secondItem.id,
        status: 'dropped',
      },
    ])

    await expect(
      getAnimeEntryCatalogueMembership(database, {
        userId: owner.id,
        catalogueItemIds: [firstItem.id, secondItem.id, firstItem.id],
      }),
    ).resolves.toEqual([{ catalogueItemId: firstItem.id, status: 'planned' }])
    await expect(
      getAnimeEntryCatalogueMembership(database, {
        userId: owner.id,
        catalogueItemIds: [],
      }),
    ).resolves.toEqual([])
  })
})

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
  readAnimeArchivePage,
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

async function insertEntry(
  userId: string,
  catalogueItemId: string,
  status: (typeof entryStatusValues)[number] = 'planned',
) {
  const [entry] = await database
    .insert(animeEntries)
    .values({ userId, catalogueItemId, status })
    .returning()

  if (!entry) {
    throw new Error('Expected anime entry fixture')
  }

  return entry
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

describe('readAnimeArchivePage', () => {
  it('returns only one owner count and rows when two owners saved the same item with different statuses', async () => {
    const [owner, otherUser, sharedItem, ownerOnlyItem, otherOnlyItem] =
      await Promise.all([
        insertUser(),
        insertUser(),
        insertCatalogueItem({ englishTitle: 'Shared Anime' }),
        insertCatalogueItem({ englishTitle: 'Owner Anime' }),
        insertCatalogueItem({ englishTitle: 'Other Anime' }),
      ])

    await Promise.all([
      insertEntry(owner.id, sharedItem.id, 'planned'),
      insertEntry(owner.id, ownerOnlyItem.id, 'completed'),
      insertEntry(otherUser.id, sharedItem.id, 'dropped'),
      insertEntry(otherUser.id, otherOnlyItem.id, 'on_hold'),
    ])

    const page = await readAnimeArchivePage(database, {
      userId: owner.id,
      page: 1,
      pageSize: 24,
    })

    expect(page.pagination).toMatchObject({ totalItems: 2, totalPages: 1 })
    expect(page.entries).toEqual([
      expect.objectContaining({
        kind: 'displayable',
        entryId: expect.any(String),
        title: 'Owner Anime',
        archiveStatus: 'completed',
      }),
      expect.objectContaining({
        kind: 'displayable',
        entryId: expect.any(String),
        title: 'Shared Anime',
        archiveStatus: 'planned',
      }),
    ])
    expect(JSON.stringify(page)).not.toContain(ownerOnlyItem.id)
    expect(JSON.stringify(page)).not.toContain(sharedItem.id)
    expect(JSON.stringify(page)).not.toContain(otherUser.id)
    expect(JSON.stringify(page)).not.toContain(otherOnlyItem.id)
    expect(JSON.stringify(page)).not.toContain('dropped')
    for (const entry of page.entries) {
      expect(Object.keys(entry).sort()).toEqual([
        'archiveStatus',
        'entryId',
        'episodeCount',
        'kind',
        'releaseStatus',
        'releaseYear',
        'title',
      ])
    }
  })

  it('returns every canonical archive status', async () => {
    const owner = await insertUser()
    const items = await Promise.all(
      entryStatusValues.map((status) =>
        insertCatalogueItem({ englishTitle: `Status ${status}` }),
      ),
    )

    await Promise.all(
      entryStatusValues.map((status, index) =>
        insertEntry(owner.id, items[index]!.id, status),
      ),
    )

    const page = await readAnimeArchivePage(database, {
      userId: owner.id,
      page: 1,
      pageSize: 24,
    })

    expect(
      page.entries.map(({ archiveStatus }) => archiveStatus).sort(),
    ).toEqual([...entryStatusValues].sort())
  })

  it('paginates more than 24 owner rows and distinguishes zero and beyond-final pages', async () => {
    const [owner, emptyOwner] = await Promise.all([insertUser(), insertUser()])
    const items = await Promise.all(
      Array.from({ length: 25 }, (_, index) =>
        insertCatalogueItem({
          englishTitle: `Page Item ${String(index + 1).padStart(2, '0')}`,
        }),
      ),
    )
    await Promise.all(items.map((item) => insertEntry(owner.id, item.id)))

    const firstPage = await readAnimeArchivePage(database, {
      userId: owner.id,
      page: 1,
      pageSize: 24,
    })
    const secondPage = await readAnimeArchivePage(database, {
      userId: owner.id,
      page: 2,
      pageSize: 24,
    })
    const beyondFinalPage = await readAnimeArchivePage(database, {
      userId: owner.id,
      page: 3,
      pageSize: 24,
    })
    const emptyPage = await readAnimeArchivePage(database, {
      userId: emptyOwner.id,
      page: 1,
      pageSize: 24,
    })

    expect(firstPage.entries).toHaveLength(24)
    expect(firstPage.pagination).toEqual({
      page: 1,
      pageSize: 24,
      totalItems: 25,
      totalPages: 2,
      hasPreviousPage: false,
      hasNextPage: true,
    })
    expect(secondPage.entries).toHaveLength(1)
    expect(secondPage.pagination).toMatchObject({
      page: 2,
      totalItems: 25,
      totalPages: 2,
      hasPreviousPage: true,
      hasNextPage: false,
    })
    expect(beyondFinalPage.entries).toEqual([])
    expect(beyondFinalPage.pagination).toMatchObject({
      page: 3,
      totalItems: 25,
      totalPages: 2,
      hasPreviousPage: true,
      hasNextPage: false,
    })
    expect(emptyPage).toEqual({
      entries: [],
      pagination: {
        page: 1,
        pageSize: 24,
        totalItems: 0,
        totalPages: 0,
        hasPreviousPage: false,
        hasNextPage: false,
      },
    })
  })

  it('orders by casefolded fallback title, resolved title, and catalogue id', async () => {
    const owner = await insertUser()
    const firstTieId = '11111111-1111-4111-8111-111111111111'
    const secondTieId = '11111111-1111-4111-8111-111111111112'
    const lowerTieId = '11111111-1111-4111-8111-111111111113'
    const [
      beta,
      alpha,
      englishPreferred,
      romaji,
      original,
      firstTie,
      secondTie,
      lowerTie,
    ] = await Promise.all([
      insertCatalogueItem({ englishTitle: 'Beta' }),
      insertCatalogueItem({ englishTitle: 'alpha' }),
      insertCatalogueItem({
        englishTitle: 'Delta English',
        romajiTitle: 'A Romaji Must Not Win',
        originalTitle: 'A Original Must Not Win',
      }),
      insertCatalogueItem({
        englishTitle: null,
        romajiTitle: 'Gamma Romaji',
        originalTitle: null,
      }),
      insertCatalogueItem({
        englishTitle: null,
        romajiTitle: null,
        originalTitle: 'Omega Original',
      }),
      insertCatalogueItem({ id: firstTieId, englishTitle: 'Tie' }),
      insertCatalogueItem({ id: secondTieId, englishTitle: 'Tie' }),
      insertCatalogueItem({ id: lowerTieId, englishTitle: 'tie' }),
    ])
    await Promise.all([
      ...[beta, alpha, englishPreferred, romaji, original].map((item) =>
        insertEntry(owner.id, item.id),
      ),
      insertEntry(owner.id, firstTie.id, 'planned'),
      insertEntry(owner.id, secondTie.id, 'completed'),
      insertEntry(owner.id, lowerTie.id, 'dropped'),
    ])

    const page = await readAnimeArchivePage(database, {
      userId: owner.id,
      page: 1,
      pageSize: 24,
    })

    expect(
      page.entries.map((entry) =>
        entry.kind === 'restricted' ? 'Restricted anime' : entry.title,
      ),
    ).toEqual([
      'alpha',
      'Beta',
      'Delta English',
      'Gamma Romaji',
      'Omega Original',
      'tie',
      'Tie',
      'Tie',
    ])
    expect(
      page.entries.slice(-3).map(({ archiveStatus }) => archiveStatus),
    ).toEqual(['dropped', 'planned', 'completed'])
    const serializedPage = JSON.stringify(page)
    for (const item of [
      beta,
      alpha,
      englishPreferred,
      romaji,
      original,
      firstTie,
      secondTie,
      lowerTie,
    ]) {
      expect(serializedPage).not.toContain(item.id)
    }
    expect(
      page.entries.every(
        (entry) => entry.kind === 'restricted' || entry.entryId.length > 0,
      ),
    ).toBe(true)
  })

  it.each(['hidden', 'draft'] as const)(
    'preserves an owner %s catalogue item as unavailable metadata',
    async (catalogueState) => {
      const [owner, item] = await Promise.all([
        insertUser(),
        insertCatalogueItem({
          englishTitle: `${catalogueState} title`,
          catalogueState,
          releaseYear: 2001,
          episodeCount: 12,
          releaseStatus: 'airing',
        }),
      ])
      await insertEntry(owner.id, item.id, 'on_hold')

      await expect(
        readAnimeArchivePage(database, {
          userId: owner.id,
          page: 1,
          pageSize: 24,
        }),
      ).resolves.toEqual({
        entries: [
          {
            kind: 'unavailable_in_catalogue',
            entryId: expect.any(String),
            title: `${catalogueState} title`,
            releaseYear: 2001,
            episodeCount: 12,
            releaseStatus: 'airing',
            archiveStatus: 'on_hold',
          },
        ],
        pagination: {
          page: 1,
          pageSize: 24,
          totalItems: 1,
          totalPages: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        },
      })
      expect(
        JSON.stringify(
          await readAnimeArchivePage(database, {
            userId: owner.id,
            page: 1,
            pageSize: 24,
          }),
        ),
      ).not.toContain(item.id)
    },
  )

  it('counts adult rows but returns only restricted status and allocates them by UUID, never concealed metadata', async () => {
    const owner = await insertUser()
    const adultFixtures = [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        englishTitle: 'A adult private sentinel',
        status: 'planned' as const,
      },
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
        englishTitle: 'M adult private sentinel',
        status: 'completed' as const,
      },
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
        englishTitle: 'Z adult private sentinel',
        status: 'dropped' as const,
      },
    ]
    const visibleItems = await Promise.all(
      Array.from({ length: 24 }, (_, index) =>
        insertCatalogueItem({
          englishTitle: `Visible ${String(index + 1).padStart(2, '0')}`,
        }),
      ),
    )
    const adultItems = await Promise.all(
      adultFixtures.map(({ id, englishTitle }) =>
        insertCatalogueItem({
          id,
          englishTitle,
          maturity: 'adult',
          releaseYear: 1999,
          episodeCount: 99,
          releaseStatus: 'airing',
        }),
      ),
    )
    await Promise.all([
      ...visibleItems.map((item) => insertEntry(owner.id, item.id)),
      ...adultItems.map((item, index) =>
        insertEntry(owner.id, item.id, adultFixtures[index]!.status),
      ),
    ])

    const firstPageBefore = await readAnimeArchivePage(database, {
      userId: owner.id,
      page: 1,
      pageSize: 24,
    })
    const restrictedPageBefore = await readAnimeArchivePage(database, {
      userId: owner.id,
      page: 2,
      pageSize: 24,
    })

    await Promise.all(
      adultItems.map((item, index) =>
        database
          .update(animeCatalogueItems)
          .set({
            englishTitle: [
              'Z changed sentinel',
              'A changed sentinel',
              'M changed sentinel',
            ][index],
            releaseYear: 2026,
            episodeCount: 1000,
            releaseStatus: 'upcoming',
          })
          .where(eq(animeCatalogueItems.id, item.id)),
      ),
    )

    const firstPageAfter = await readAnimeArchivePage(database, {
      userId: owner.id,
      page: 1,
      pageSize: 24,
    })
    const restrictedPageAfter = await readAnimeArchivePage(database, {
      userId: owner.id,
      page: 2,
      pageSize: 24,
    })

    expect(firstPageBefore).toEqual(firstPageAfter)
    expect(firstPageBefore.entries).toHaveLength(24)
    expect(restrictedPageBefore).toEqual(restrictedPageAfter)
    expect(restrictedPageBefore.pagination).toMatchObject({
      totalItems: 27,
      totalPages: 2,
    })
    expect(restrictedPageBefore.entries).toEqual([
      { kind: 'restricted', archiveStatus: 'planned' },
      { kind: 'restricted', archiveStatus: 'completed' },
      { kind: 'restricted', archiveStatus: 'dropped' },
    ])
    for (const entry of restrictedPageBefore.entries) {
      expect(Object.keys(entry).sort()).toEqual(['archiveStatus', 'kind'])
    }
    const serializedPage = JSON.stringify(restrictedPageBefore)
    for (const item of adultItems) {
      expect(serializedPage).not.toContain(item.id)
    }
    expect(serializedPage).not.toMatch(
      /adult private sentinel|changed sentinel|1999|2026|99|1000|airing|upcoming/,
    )
  })

  it('does not mutate archive or catalogue rows', async () => {
    const [owner, item] = await Promise.all([
      insertUser(),
      insertCatalogueItem({ englishTitle: 'Read Only Fixture' }),
    ])
    await insertEntry(owner.id, item.id, 'in_progress')
    const before = await Promise.all([
      database.select().from(animeEntries),
      database.select().from(animeCatalogueItems),
    ])

    await readAnimeArchivePage(database, {
      userId: owner.id,
      page: 1,
      pageSize: 24,
    })

    const after = await Promise.all([
      database.select().from(animeEntries),
      database.select().from(animeCatalogueItems),
    ])
    expect(after).toEqual(before)
  })
})

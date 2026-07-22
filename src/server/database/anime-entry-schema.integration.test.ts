import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readDatabaseTestEnvironment } from '@/config/database-environment'
import type { EntryStatus } from '@/features/archive/domain/entry-status'
import { episodeProgressMaximum } from '@/features/archive/domain/episode-progress'
import {
  animeAlternativeTitles,
  animeCatalogueItems,
  animeCatalogueSources,
  animeEntries,
  users,
} from '@/server/database/schema'
import { assertSafeTestDatabaseName } from '@/test/database/global-setup'

const checkViolation = '23514'
const foreignKeyViolation = '23503'
const invalidTextRepresentation = '22P02'
const notNullViolation = '23502'
const uniqueViolation = '23505'
const statuses = [
  'planned',
  'in_progress',
  'on_hold',
  'dropped',
  'completed',
] as const satisfies readonly EntryStatus[]

const { databaseTestUrl } = readDatabaseTestEnvironment()
const pool = new Pool({ connectionString: databaseTestUrl })
const database = drizzle({ client: pool })

type NewEntry = typeof animeEntries.$inferInsert

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
      ...overrides,
    })
    .returning()

  if (!item) {
    throw new Error('Expected catalogue-item fixture')
  }

  return item
}

async function insertEntry(overrides: Partial<NewEntry> = {}) {
  const user = overrides.userId ? undefined : await insertUser()
  const item = overrides.catalogueItemId
    ? undefined
    : await insertCatalogueItem()
  const [entry] = await database
    .insert(animeEntries)
    .values({
      userId: user?.id ?? overrides.userId!,
      catalogueItemId: item?.id ?? overrides.catalogueItemId!,
      status: 'planned',
      ...overrides,
    })
    .returning()

  if (!entry) {
    throw new Error('Expected entry fixture')
  }

  return entry
}

async function expectConstraintViolation(
  operation: () => PromiseLike<unknown>,
  code: string,
  constraint?: string,
): Promise<void> {
  let error: unknown

  try {
    await operation()
  } catch (caughtError) {
    error = caughtError
  }

  const postgresError =
    error instanceof Error && error.cause !== undefined ? error.cause : error

  expect(postgresError).toMatchObject(
    constraint === undefined ? { code } : { code, constraint },
  )
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

describe('anime_entries schema', () => {
  it('creates the approved columns, constraints, foreign-key actions, and index', async () => {
    const columns = await pool.query<{
      columnName: string
      dataType: string
      isNullable: string
      columnDefault: string | null
      datetimePrecision: number | null
    }>(`
      select column_name as "columnName", data_type as "dataType",
        is_nullable as "isNullable", column_default as "columnDefault",
        datetime_precision as "datetimePrecision"
      from information_schema.columns
      where table_schema = 'public' and table_name = 'anime_entries'
      order by ordinal_position
    `)
    expect(columns.rows).toEqual([
      expect.objectContaining({
        columnName: 'id',
        dataType: 'uuid',
        isNullable: 'NO',
      }),
      expect.objectContaining({
        columnName: 'user_id',
        dataType: 'uuid',
        isNullable: 'NO',
        columnDefault: null,
      }),
      expect.objectContaining({
        columnName: 'catalogue_item_id',
        dataType: 'uuid',
        isNullable: 'NO',
        columnDefault: null,
      }),
      expect.objectContaining({
        columnName: 'status',
        dataType: 'text',
        isNullable: 'NO',
        columnDefault: null,
      }),
      expect.objectContaining({
        columnName: 'created_at',
        dataType: 'timestamp with time zone',
        isNullable: 'NO',
        datetimePrecision: 3,
      }),
      expect.objectContaining({
        columnName: 'updated_at',
        dataType: 'timestamp with time zone',
        isNullable: 'NO',
        datetimePrecision: 3,
      }),
      expect.objectContaining({
        columnName: 'episode_progress',
        dataType: 'bigint',
        isNullable: 'NO',
        columnDefault: '0',
      }),
      expect.objectContaining({
        columnName: 'episode_total_override',
        dataType: 'bigint',
        isNullable: 'YES',
        columnDefault: null,
      }),
      expect.objectContaining({
        columnName: 'rating',
        dataType: 'numeric',
        isNullable: 'YES',
        columnDefault: null,
      }),
    ])
    expect(columns.rows[0]?.columnDefault).toMatch(/gen_random_uuid\(\)/)
    expect(columns.rows[4]?.columnDefault).toMatch(/now\(\)/)
    expect(columns.rows[5]?.columnDefault).toMatch(/now\(\)/)

    const constraints = await pool.query<{ constraintName: string }>(`
      select conname as "constraintName" from pg_constraint
      where conrelid = 'anime_entries'::regclass
    `)
    expect(
      constraints.rows.map(({ constraintName }) => constraintName).sort(),
    ).toEqual([
      'anime_entries_catalogue_item_id_fkey',
      'anime_entries_episode_progress_check',
      'anime_entries_episode_total_override_check',
      'anime_entries_id_uuid_v4_check',
      'anime_entries_pkey',
      'anime_entries_rating_check',
      'anime_entries_status_check',
      'anime_entries_timestamp_order_check',
      'anime_entries_user_id_catalogue_item_id_key',
      'anime_entries_user_id_fkey',
    ])

    const foreignKeys = await pool.query<{
      constraintName: string
      deleteAction: string
      updateAction: string
    }>(`
      select conname as "constraintName", confdeltype as "deleteAction",
        confupdtype as "updateAction"
      from pg_constraint
      where conrelid = 'anime_entries'::regclass and contype = 'f'
    `)
    expect(
      foreignKeys.rows.sort((left, right) =>
        left.constraintName.localeCompare(right.constraintName),
      ),
    ).toEqual([
      {
        constraintName: 'anime_entries_catalogue_item_id_fkey',
        deleteAction: 'r',
        updateAction: 'a',
      },
      {
        constraintName: 'anime_entries_user_id_fkey',
        deleteAction: 'c',
        updateAction: 'a',
      },
    ])

    const indexes = await pool.query<{
      indexName: string
      indexDefinition: string
    }>(`
      select indexname as "indexName", indexdef as "indexDefinition"
      from pg_indexes
      where schemaname = 'public' and tablename = 'anime_entries'
    `)
    expect(indexes.rows.map(({ indexName }) => indexName).sort()).toEqual([
      'anime_entries_catalogue_item_id_idx',
      'anime_entries_pkey',
      'anime_entries_user_id_catalogue_item_id_key',
    ])
    expect(
      indexes.rows.find(
        ({ indexName }) => indexName === 'anime_entries_catalogue_item_id_idx',
      )?.indexDefinition,
    ).toMatch(/using btree \(catalogue_item_id\)/i)
  })

  it('supplies UUID-v4 identity and timestamps while rejecting invalid UUID branches and missing required values', async () => {
    const user = await insertUser()
    const item = await insertCatalogueItem()
    const generated = await insertEntry({
      userId: user.id,
      catalogueItemId: item.id,
    })
    expect(generated.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    expect(generated.createdAt.getMilliseconds()).toBeGreaterThanOrEqual(0)
    expect(generated.updatedAt.getMilliseconds()).toBeGreaterThanOrEqual(0)
    expect(generated.updatedAt.getTime()).toBeGreaterThanOrEqual(
      generated.createdAt.getTime(),
    )

    await expect(insertEntry({ id: randomUUID() })).resolves.toMatchObject({
      id: expect.any(String),
    })
    await expectConstraintViolation(
      () => insertEntry({ id: '11111111-1111-5111-8111-111111111111' }),
      checkViolation,
      'anime_entries_id_uuid_v4_check',
    )
    await expectConstraintViolation(
      () => insertEntry({ id: '11111111-1111-4111-7111-111111111111' }),
      checkViolation,
      'anime_entries_id_uuid_v4_check',
    )
    await expectConstraintViolation(
      () =>
        pool.query(
          `insert into anime_entries (catalogue_item_id, status) values ($1, 'planned')`,
          [item.id],
        ),
      notNullViolation,
    )
    await expectConstraintViolation(
      () =>
        pool.query(
          `insert into anime_entries (user_id, status) values ($1, 'planned')`,
          [user.id],
        ),
      notNullViolation,
    )
    await expectConstraintViolation(
      () =>
        pool.query(
          `insert into anime_entries (user_id, catalogue_item_id) values ($1, $2)`,
          [user.id, item.id],
        ),
      notNullViolation,
    )
  })

  it('accepts every canonical status and rejects invalid or null status values', async () => {
    for (const status of statuses) {
      const entry = await insertEntry({ status })
      expect(entry.status).toBe(status)
    }

    for (const status of [
      'watching',
      'PLANNED',
      'in-progress',
      ' planned ',
      '',
    ]) {
      const user = await insertUser()
      const item = await insertCatalogueItem()
      await expectConstraintViolation(
        () =>
          pool.query(
            `insert into anime_entries (user_id, catalogue_item_id, status) values ($1, $2, $3)`,
            [user.id, item.id, status],
          ),
        checkViolation,
        'anime_entries_status_check',
      )
    }
    const user = await insertUser()
    const item = await insertCatalogueItem()
    await expectConstraintViolation(
      () =>
        pool.query(
          `insert into anime_entries (user_id, catalogue_item_id, status) values ($1, $2, null)`,
          [user.id, item.id],
        ),
      notNullViolation,
    )
  })

  it('stores checked number-mode episode progress and nullable personal totals', async () => {
    const defaultEntry = await insertEntry()
    expect(defaultEntry).toMatchObject({
      episodeProgress: 0,
      episodeTotalOverride: null,
    })
    expect(typeof defaultEntry.episodeProgress).toBe('number')

    await expect(
      insertEntry({
        episodeProgress: episodeProgressMaximum,
        episodeTotalOverride: episodeProgressMaximum,
      }),
    ).resolves.toMatchObject({
      episodeProgress: episodeProgressMaximum,
      episodeTotalOverride: episodeProgressMaximum,
    })

    await expectConstraintViolation(
      () => insertEntry({ episodeProgress: -1 }),
      checkViolation,
      'anime_entries_episode_progress_check',
    )
    await expectConstraintViolation(
      () => insertEntry({ episodeProgress: episodeProgressMaximum + 1 }),
      checkViolation,
      'anime_entries_episode_progress_check',
    )
    await expectConstraintViolation(
      () => insertEntry({ episodeTotalOverride: 0 }),
      checkViolation,
      'anime_entries_episode_total_override_check',
    )
    await expectConstraintViolation(
      () => insertEntry({ episodeTotalOverride: -1 }),
      checkViolation,
      'anime_entries_episode_total_override_check',
    )
    await expectConstraintViolation(
      () => insertEntry({ episodeTotalOverride: episodeProgressMaximum + 1 }),
      checkViolation,
      'anime_entries_episode_total_override_check',
    )
  })

  it('round-trips every nullable exact tenth-step rating without a default or rounding', async () => {
    const defaultEntry = await insertEntry()
    expect(defaultEntry.rating).toBeNull()

    for (const rating of Array.from({ length: 91 }, (_, index) =>
      Number(((10 + index) / 10).toFixed(1)),
    )) {
      const entry = await insertEntry({ rating })
      expect(entry.rating).toBe(rating)
    }

    await expectConstraintViolation(
      () => insertEntry({ rating: 0.9 }),
      checkViolation,
      'anime_entries_rating_check',
    )
    await expectConstraintViolation(
      () => insertEntry({ rating: 10.1 }),
      checkViolation,
      'anime_entries_rating_check',
    )
    await expectConstraintViolation(
      () => insertEntry({ rating: 7.55 }),
      checkViolation,
      'anime_entries_rating_check',
    )
  })

  it('rejects special numeric literals at the check boundary and malformed numeric casts before insertion', async () => {
    const user = await insertUser()
    const item = await insertCatalogueItem()

    for (const ratingLiteral of ['NaN', 'Infinity', '-Infinity']) {
      const cast = await pool.query<{ rating: string }>(
        'select $1::numeric::text as rating',
        [ratingLiteral],
      )
      expect(cast.rows).toEqual([{ rating: ratingLiteral }])
      await expectConstraintViolation(
        () =>
          pool.query(
            `insert into anime_entries (user_id, catalogue_item_id, status, rating)
             values ($1, $2, 'planned', $3::numeric)`,
            [user.id, item.id, ratingLiteral],
          ),
        checkViolation,
        'anime_entries_rating_check',
      )
    }

    await expectConstraintViolation(
      () =>
        pool.query(
          `insert into anime_entries (user_id, catalogue_item_id, status, rating)
           values ($1, $2, 'planned', $3::numeric)`,
          [user.id, item.id, 'not-a-rating'],
        ),
      invalidTextRepresentation,
    )
  })

  it('enforces ownership, restricts catalogue deletion, and retains entries for hidden items', async () => {
    const user = await insertUser()
    const otherUser = await insertUser()
    const item = await insertCatalogueItem()
    const entry = await insertEntry({
      userId: user.id,
      catalogueItemId: item.id,
    })
    const otherEntry = await insertEntry({
      userId: otherUser.id,
      catalogueItemId: item.id,
    })
    await expectConstraintViolation(
      () =>
        pool.query(
          `insert into anime_entries (user_id, catalogue_item_id, status) values ($1, $2, 'planned')`,
          [randomUUID(), item.id],
        ),
      foreignKeyViolation,
      'anime_entries_user_id_fkey',
    )
    await expectConstraintViolation(
      () =>
        pool.query(
          `insert into anime_entries (user_id, catalogue_item_id, status) values ($1, $2, 'planned')`,
          [user.id, randomUUID()],
        ),
      foreignKeyViolation,
      'anime_entries_catalogue_item_id_fkey',
    )
    await expectConstraintViolation(
      () =>
        database
          .delete(animeCatalogueItems)
          .where(eq(animeCatalogueItems.id, item.id)),
      foreignKeyViolation,
      'anime_entries_catalogue_item_id_fkey',
    )
    expect(await database.select().from(animeEntries)).toHaveLength(2)
    await database
      .update(animeCatalogueItems)
      .set({ catalogueState: 'hidden' })
      .where(eq(animeCatalogueItems.id, item.id))
    expect(
      await database
        .select()
        .from(animeEntries)
        .where(eq(animeEntries.id, entry.id)),
    ).toHaveLength(1)
    await database.delete(users).where(eq(users.id, user.id))
    expect(
      await database
        .select()
        .from(animeEntries)
        .where(eq(animeEntries.id, entry.id)),
    ).toEqual([])
    expect(
      await database
        .select()
        .from(animeEntries)
        .where(eq(animeEntries.id, otherEntry.id)),
    ).toHaveLength(1)
    expect(
      await database
        .select()
        .from(animeCatalogueItems)
        .where(eq(animeCatalogueItems.id, item.id)),
    ).toHaveLength(1)
    await database
      .delete(animeEntries)
      .where(eq(animeEntries.id, otherEntry.id))
    await database.insert(animeAlternativeTitles).values({
      catalogueItemId: item.id,
      title: 'Catalogue child',
      position: 0,
    })
    await database.insert(animeCatalogueSources).values({
      catalogueItemId: item.id,
      sourceKey: 'fixture',
      sourceItemId: 'fixture-item',
    })
    await database
      .delete(animeCatalogueItems)
      .where(eq(animeCatalogueItems.id, item.id))
    await expect(
      database
        .select()
        .from(animeAlternativeTitles)
        .where(eq(animeAlternativeTitles.catalogueItemId, item.id)),
    ).resolves.toEqual([])
    await expect(
      database
        .select()
        .from(animeCatalogueSources)
        .where(eq(animeCatalogueSources.catalogueItemId, item.id)),
    ).resolves.toEqual([])
  })

  it('enforces pair uniqueness while permitting different user and item combinations', async () => {
    const user = await insertUser()
    const otherUser = await insertUser()
    const item = await insertCatalogueItem()
    const otherItem = await insertCatalogueItem()
    const original = await insertEntry({
      userId: user.id,
      catalogueItemId: item.id,
      status: 'completed',
    })
    await expectConstraintViolation(
      () =>
        insertEntry({
          userId: user.id,
          catalogueItemId: item.id,
          status: 'planned',
        }),
      uniqueViolation,
      'anime_entries_user_id_catalogue_item_id_key',
    )
    expect(
      await database
        .select()
        .from(animeEntries)
        .where(eq(animeEntries.id, original.id)),
    ).toMatchObject([{ status: 'completed' }])
    await expect(
      insertEntry({ userId: user.id, catalogueItemId: otherItem.id }),
    ).resolves.toBeDefined()
    await expect(
      insertEntry({ userId: otherUser.id, catalogueItemId: item.id }),
    ).resolves.toBeDefined()
  })

  it('enforces timestamp ordering and the approved index order without a redundant user index', async () => {
    const user = await insertUser()
    const laterUser = await insertUser()
    const earlierUser = await insertUser()
    const item = await insertCatalogueItem()
    const createdAt = new Date('2026-01-01T00:00:00.000Z')
    const laterUpdatedAt = new Date('2026-01-02T00:00:00.000Z')
    await expect(
      insertEntry({
        userId: user.id,
        catalogueItemId: item.id,
        createdAt,
        updatedAt: createdAt,
      }),
    ).resolves.toBeDefined()
    await expect(
      insertEntry({
        userId: laterUser.id,
        catalogueItemId: item.id,
        createdAt,
        updatedAt: laterUpdatedAt,
      }),
    ).resolves.toBeDefined()
    await expectConstraintViolation(
      () =>
        insertEntry({
          userId: earlierUser.id,
          catalogueItemId: item.id,
          createdAt: laterUpdatedAt,
          updatedAt: createdAt,
        }),
      checkViolation,
      'anime_entries_timestamp_order_check',
    )

    const indexes = await pool.query<{
      indexName: string
      indexDefinition: string
    }>(`
      select indexname as "indexName", indexdef as "indexDefinition"
      from pg_indexes where schemaname = 'public' and tablename = 'anime_entries'
    `)
    expect(
      indexes.rows.find(
        ({ indexName }) =>
          indexName === 'anime_entries_user_id_catalogue_item_id_key',
      )?.indexDefinition,
    ).toMatch(/\(user_id, catalogue_item_id\)/i)
    expect(
      indexes.rows.filter(({ indexDefinition }) =>
        /\(user_id\)/i.test(indexDefinition),
      ),
    ).toEqual([])
  })
})

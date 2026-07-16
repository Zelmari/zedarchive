import { randomUUID } from 'node:crypto'
import { asc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  animeFormatValues,
  animeMaturityValues,
  animeReleaseStatusValues,
} from '@/features/anime/domain/anime-catalogue-item'
import {
  animeAlternativeTitles,
  animeCatalogueItems,
  animeCatalogueSources,
  animeCatalogueStateValues,
} from '@/server/database/schema'
import { readDatabaseTestEnvironment } from '@/config/database-environment'
import { assertSafeTestDatabaseName } from '@/test/database/global-setup'

const checkViolation = '23514'
const foreignKeyViolation = '23503'
const uniqueViolation = '23505'

const { databaseTestUrl } = readDatabaseTestEnvironment()
const pool = new Pool({ connectionString: databaseTestUrl })
const database = drizzle({ client: pool })

type NewCatalogueItem = typeof animeCatalogueItems.$inferInsert

const defaultCatalogueItem = {
  englishTitle: 'Cowboy Bebop',
  format: 'tv',
  releaseStatus: 'finished',
  maturity: 'safe',
} satisfies NewCatalogueItem

async function insertCatalogueItem(overrides: Partial<NewCatalogueItem> = {}) {
  const [catalogueItem] = await database
    .insert(animeCatalogueItems)
    .values({ ...defaultCatalogueItem, ...overrides })
    .returning()

  if (!catalogueItem) {
    throw new Error('Expected the inserted catalogue item to be returned')
  }

  return catalogueItem
}

async function expectConstraintViolation(
  operation: () => PromiseLike<unknown>,
  code: string,
  constraint: string,
): Promise<void> {
  let error: unknown

  try {
    await operation()
  } catch (caughtError) {
    error = caughtError
  }

  const postgresError =
    error instanceof Error && error.cause !== undefined ? error.cause : error

  expect(postgresError).toMatchObject({ code, constraint })
}

function insertInvalidCanonicalValue(
  field: 'format' | 'release_status' | 'maturity' | 'catalogue_state',
  value: string,
) {
  const statements = {
    format: `
      insert into anime_catalogue_items
        (english_title, format, release_status, maturity)
      values ('Invalid format fixture', $1, 'finished', 'safe')
    `,
    release_status: `
      insert into anime_catalogue_items
        (english_title, format, release_status, maturity)
      values ('Invalid release status fixture', 'tv', $1, 'safe')
    `,
    maturity: `
      insert into anime_catalogue_items
        (english_title, format, release_status, maturity)
      values ('Invalid maturity fixture', 'tv', 'finished', $1)
    `,
    catalogue_state: `
      insert into anime_catalogue_items
        (english_title, format, release_status, maturity, catalogue_state)
      values ('Invalid catalogue state fixture', 'tv', 'finished', 'safe', $1)
    `,
  } as const

  return pool.query(statements[field], [value])
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
      anime_catalogue_sources,
      anime_alternative_titles,
      anime_catalogue_items
    restart identity cascade
  `)
})

afterAll(async () => {
  await pool.end()
})

describe('database integration safety', () => {
  it('rejects database names other than the dedicated test database', () => {
    expect(() => assertSafeTestDatabaseName('archive_dev')).toThrow(
      'Database integration setup refused to reset "archive_dev"; expected "archive_test"',
    )
    expect(() => assertSafeTestDatabaseName(undefined)).toThrow(
      'Database integration setup refused to reset "unknown"; expected "archive_test"',
    )
  })

  it('contains exactly the three approved public application tables', async () => {
    const result = await pool.query<{ tableName: string }>(`
      select tablename as "tableName"
      from pg_catalog.pg_tables
      where schemaname = 'public'
      order by tablename
    `)

    expect(result.rows.map(({ tableName }) => tableName)).toEqual([
      'anime_alternative_titles',
      'anime_catalogue_items',
      'anime_catalogue_sources',
    ])
  })

  it('creates the planned named constraints and source parent index', async () => {
    const constraintResult = await pool.query<{ constraintName: string }>(`
      select conname as "constraintName"
      from pg_catalog.pg_constraint
      where conrelid in (
        'anime_catalogue_items'::regclass,
        'anime_alternative_titles'::regclass,
        'anime_catalogue_sources'::regclass
      )
    `)
    const indexResult = await pool.query<{ indexName: string }>(`
      select indexname as "indexName"
      from pg_catalog.pg_indexes
      where schemaname = 'public'
    `)

    expect(
      constraintResult.rows.map(({ constraintName }) => constraintName),
    ).toEqual(
      expect.arrayContaining([
        'anime_catalogue_items_pkey',
        'anime_catalogue_items_id_uuid_v4_check',
        'anime_catalogue_items_primary_title_check',
        'anime_catalogue_items_english_title_non_blank_check',
        'anime_catalogue_items_romaji_title_non_blank_check',
        'anime_catalogue_items_original_title_non_blank_check',
        'anime_catalogue_items_format_check',
        'anime_catalogue_items_release_status_check',
        'anime_catalogue_items_release_year_check',
        'anime_catalogue_items_episode_count_check',
        'anime_catalogue_items_maturity_check',
        'anime_catalogue_items_catalogue_state_check',
        'anime_catalogue_items_timestamp_order_check',
        'anime_alternative_titles_pkey',
        'anime_alternative_titles_catalogue_item_id_fkey',
        'anime_alternative_titles_catalogue_item_id_title_key',
        'anime_alternative_titles_catalogue_item_id_position_key',
        'anime_alternative_titles_title_non_blank_check',
        'anime_alternative_titles_position_check',
        'anime_catalogue_sources_pkey',
        'anime_catalogue_sources_catalogue_item_id_fkey',
        'anime_catalogue_sources_source_key_check',
        'anime_catalogue_sources_source_item_id_non_blank_check',
        'anime_catalogue_sources_timestamp_order_check',
      ]),
    )
    expect(indexResult.rows.map(({ indexName }) => indexName)).toContain(
      'anime_catalogue_sources_catalogue_item_id_idx',
    )
  })
})

describe('anime catalogue items', () => {
  it('generates a UUID v4 identity and safe database defaults', async () => {
    const catalogueItem = await insertCatalogueItem()

    expect(catalogueItem.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(catalogueItem.catalogueState).toBe('draft')
    expect(catalogueItem.createdAt).toBeInstanceOf(Date)
    expect(catalogueItem.updatedAt).toBeInstanceOf(Date)

    const precisionResult = await pool.query<{ millisecondAligned: boolean }>(
      `
        select
          mod(extract(microseconds from created_at)::integer, 1000) = 0
            as "millisecondAligned"
        from anime_catalogue_items
        where id = $1
      `,
      [catalogueItem.id],
    )

    expect(precisionResult.rows[0]?.millisecondAligned).toBe(true)
  })

  it('accepts an explicitly supplied UUID v4', async () => {
    const id = '550e8400-e29b-41d4-a716-446655440000'

    await expect(insertCatalogueItem({ id })).resolves.toMatchObject({ id })
  })

  it.each([
    '550e8400-e29b-11d4-a716-446655440000',
    '550e8400-e29b-41d4-7716-446655440000',
  ])('rejects the non-v4 or non-RFC-variant UUID %s', async (id) => {
    await expectConstraintViolation(
      () => insertCatalogueItem({ id }),
      checkViolation,
      'anime_catalogue_items_id_uuid_v4_check',
    )
  })

  it.each([
    { englishTitle: 'English title' },
    { englishTitle: null, romajiTitle: 'Romaji title' },
    {
      englishTitle: null,
      romajiTitle: null,
      originalTitle: 'オリジナル',
    },
    {
      englishTitle: 'English title',
      romajiTitle: 'Romaji title',
      originalTitle: 'オリジナル',
    },
  ])('accepts the available primary title combination %#', async (titles) => {
    await expect(insertCatalogueItem(titles)).resolves.toBeDefined()
  })

  it('rejects an item without any primary title', async () => {
    await expectConstraintViolation(
      () =>
        insertCatalogueItem({
          englishTitle: null,
          romajiTitle: null,
          originalTitle: null,
        }),
      checkViolation,
      'anime_catalogue_items_primary_title_check',
    )
  })

  it.each([
    ['englishTitle', 'anime_catalogue_items_english_title_non_blank_check'],
    ['romajiTitle', 'anime_catalogue_items_romaji_title_non_blank_check'],
    ['originalTitle', 'anime_catalogue_items_original_title_non_blank_check'],
  ] as const)('rejects a blank %s', async (field, constraint) => {
    await expectConstraintViolation(
      () =>
        insertCatalogueItem({
          englishTitle: field === 'englishTitle' ? ' \n\t ' : null,
          romajiTitle: field === 'romajiTitle' ? ' \n\t ' : null,
          originalTitle: field === 'originalTitle' ? ' \n\t ' : null,
        }),
      checkViolation,
      constraint,
    )
  })

  it('allows identical titles on different catalogue items', async () => {
    await insertCatalogueItem()
    await expect(insertCatalogueItem()).resolves.toBeDefined()
  })

  it.each(animeFormatValues)(
    'accepts the canonical %s format',
    async (format) => {
      await expect(insertCatalogueItem({ format })).resolves.toBeDefined()
    },
  )

  it.each(animeReleaseStatusValues)(
    'accepts the canonical %s release status',
    async (releaseStatus) => {
      await expect(
        insertCatalogueItem({ releaseStatus }),
      ).resolves.toBeDefined()
    },
  )

  it.each(animeMaturityValues)(
    'accepts the canonical %s maturity',
    async (maturity) => {
      await expect(insertCatalogueItem({ maturity })).resolves.toBeDefined()
    },
  )

  it.each(animeCatalogueStateValues)(
    'accepts the canonical %s catalogue state',
    async (catalogueState) => {
      await expect(
        insertCatalogueItem({ catalogueState }),
      ).resolves.toBeDefined()
    },
  )

  it.each([
    ['format', 'anime_catalogue_items_format_check', 'invalid-format'],
    [
      'release_status',
      'anime_catalogue_items_release_status_check',
      'invalid-status',
    ],
    ['maturity', 'anime_catalogue_items_maturity_check', 'invalid-maturity'],
    [
      'catalogue_state',
      'anime_catalogue_items_catalogue_state_check',
      'invalid-state',
    ],
  ] as const)(
    'rejects an invalid %s value',
    async (field, constraint, value) => {
      await expectConstraintViolation(
        () => insertInvalidCanonicalValue(field, value),
        checkViolation,
        constraint,
      )
    },
  )

  it.each([1, 9999, null])(
    'accepts the release year %s',
    async (releaseYear) => {
      await expect(insertCatalogueItem({ releaseYear })).resolves.toBeDefined()
    },
  )

  it.each([0, 10000])('rejects the release year %s', async (releaseYear) => {
    await expectConstraintViolation(
      () => insertCatalogueItem({ releaseYear }),
      checkViolation,
      'anime_catalogue_items_release_year_check',
    )
  })

  it.each([1, 26, null])(
    'accepts the episode count %s',
    async (episodeCount) => {
      await expect(insertCatalogueItem({ episodeCount })).resolves.toBeDefined()
    },
  )

  it.each([0, -1])('rejects the episode count %s', async (episodeCount) => {
    await expectConstraintViolation(
      () => insertCatalogueItem({ episodeCount }),
      checkViolation,
      'anime_catalogue_items_episode_count_check',
    )
  })

  it('accepts equal and increasing item timestamps', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z')

    await expect(
      insertCatalogueItem({ createdAt, updatedAt: createdAt }),
    ).resolves.toBeDefined()
    await expect(
      insertCatalogueItem({
        createdAt,
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      }),
    ).resolves.toBeDefined()
  })

  it('rejects an updated timestamp before the created timestamp', async () => {
    await expectConstraintViolation(
      () =>
        insertCatalogueItem({
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      checkViolation,
      'anime_catalogue_items_timestamp_order_check',
    )
  })

  it('does not hide an updated-at trigger behind ordinary updates', async () => {
    const updatedAt = new Date('2026-01-01T00:00:00.000Z')
    const catalogueItem = await insertCatalogueItem({
      createdAt: updatedAt,
      updatedAt,
    })
    const [updatedItem] = await database
      .update(animeCatalogueItems)
      .set({ englishTitle: 'Updated title' })
      .where(eq(animeCatalogueItems.id, catalogueItem.id))
      .returning()

    expect(updatedItem?.updatedAt).toEqual(updatedAt)
  })
})

describe('anime alternative titles', () => {
  it('stores generated identities and returns titles in their explicit order', async () => {
    const catalogueItem = await insertCatalogueItem()
    const inserted = await database
      .insert(animeAlternativeTitles)
      .values([
        {
          catalogueItemId: catalogueItem.id,
          title: 'Space Cowboy',
          position: 1,
        },
        {
          catalogueItemId: catalogueItem.id,
          title: 'COWBOY BEBOP',
          position: 0,
        },
      ])
      .returning()

    expect(inserted.every(({ id }) => Number.isInteger(id) && id > 0)).toBe(
      true,
    )

    const ordered = await database
      .select()
      .from(animeAlternativeTitles)
      .where(eq(animeAlternativeTitles.catalogueItemId, catalogueItem.id))
      .orderBy(asc(animeAlternativeTitles.position))

    expect(ordered.map(({ title }) => title)).toEqual([
      'COWBOY BEBOP',
      'Space Cowboy',
    ])
  })

  it('rejects blank titles and negative positions', async () => {
    const catalogueItem = await insertCatalogueItem()

    await expectConstraintViolation(
      () =>
        database
          .insert(animeAlternativeTitles)
          .values({
            catalogueItemId: catalogueItem.id,
            title: ' \n\t ',
            position: 0,
          })
          .execute(),
      checkViolation,
      'anime_alternative_titles_title_non_blank_check',
    )
    await expectConstraintViolation(
      () =>
        database
          .insert(animeAlternativeTitles)
          .values({
            catalogueItemId: catalogueItem.id,
            title: 'Valid title',
            position: -1,
          })
          .execute(),
      checkViolation,
      'anime_alternative_titles_position_check',
    )
  })

  it('enforces exact title and position uniqueness within one item', async () => {
    const catalogueItem = await insertCatalogueItem()
    await database.insert(animeAlternativeTitles).values({
      catalogueItemId: catalogueItem.id,
      title: 'Space Cowboy',
      position: 0,
    })

    await expectConstraintViolation(
      () =>
        database
          .insert(animeAlternativeTitles)
          .values({
            catalogueItemId: catalogueItem.id,
            title: 'Space Cowboy',
            position: 1,
          })
          .execute(),
      uniqueViolation,
      'anime_alternative_titles_catalogue_item_id_title_key',
    )
    await expectConstraintViolation(
      () =>
        database
          .insert(animeAlternativeTitles)
          .values({
            catalogueItemId: catalogueItem.id,
            title: 'COWBOY BEBOP',
            position: 0,
          })
          .execute(),
      uniqueViolation,
      'anime_alternative_titles_catalogue_item_id_position_key',
    )
  })

  it('allows the same title and position on different items', async () => {
    const firstItem = await insertCatalogueItem()
    const secondItem = await insertCatalogueItem()

    await database.insert(animeAlternativeTitles).values([
      {
        catalogueItemId: firstItem.id,
        title: 'Shared alternative',
        position: 0,
      },
      {
        catalogueItemId: secondItem.id,
        title: 'Shared alternative',
        position: 0,
      },
    ])

    await expect(
      database.select().from(animeAlternativeTitles),
    ).resolves.toHaveLength(2)
  })

  it('rejects a missing parent and cascades parent deletion', async () => {
    await expectConstraintViolation(
      () =>
        database
          .insert(animeAlternativeTitles)
          .values({
            catalogueItemId: randomUUID(),
            title: 'Orphan title',
            position: 0,
          })
          .execute(),
      foreignKeyViolation,
      'anime_alternative_titles_catalogue_item_id_fkey',
    )

    const catalogueItem = await insertCatalogueItem()
    await database.insert(animeAlternativeTitles).values({
      catalogueItemId: catalogueItem.id,
      title: 'Cascading title',
      position: 0,
    })
    await database
      .delete(animeCatalogueItems)
      .where(eq(animeCatalogueItems.id, catalogueItem.id))

    await expect(
      database.select().from(animeAlternativeTitles),
    ).resolves.toEqual([])
  })
})

describe('anime catalogue sources', () => {
  it.each(['a', 'wikidata', 'source_name-2', 'a'.repeat(50)])(
    'accepts the source key %s',
    async (sourceKey) => {
      const catalogueItem = await insertCatalogueItem()

      await expect(
        database.insert(animeCatalogueSources).values({
          catalogueItemId: catalogueItem.id,
          sourceKey,
          sourceItemId: `item-${sourceKey}`,
        }),
      ).resolves.toBeDefined()
    },
  )

  it.each(['Wikidata', '1source', 'source key', 'source.key', 'a'.repeat(51)])(
    'rejects the source key %s',
    async (sourceKey) => {
      const catalogueItem = await insertCatalogueItem()

      await expectConstraintViolation(
        () =>
          database
            .insert(animeCatalogueSources)
            .values({
              catalogueItemId: catalogueItem.id,
              sourceKey,
              sourceItemId: 'invalid-key-fixture',
            })
            .execute(),
        checkViolation,
        'anime_catalogue_sources_source_key_check',
      )
    },
  )

  it('accepts opaque source IDs and rejects blank source IDs', async () => {
    const catalogueItem = await insertCatalogueItem()

    await expect(
      database.insert(animeCatalogueSources).values({
        catalogueItemId: catalogueItem.id,
        sourceKey: 'wikidata',
        sourceItemId: 'opaque:Q123/日本語',
      }),
    ).resolves.toBeDefined()
    await expectConstraintViolation(
      () =>
        database
          .insert(animeCatalogueSources)
          .values({
            catalogueItemId: catalogueItem.id,
            sourceKey: 'manual',
            sourceItemId: ' \n\t ',
          })
          .execute(),
      checkViolation,
      'anime_catalogue_sources_source_item_id_non_blank_check',
    )
  })

  it('maps each source pair to only one catalogue item', async () => {
    const firstItem = await insertCatalogueItem()
    const secondItem = await insertCatalogueItem()
    await database.insert(animeCatalogueSources).values({
      catalogueItemId: firstItem.id,
      sourceKey: 'wikidata',
      sourceItemId: 'Q123',
    })

    await expectConstraintViolation(
      () =>
        database
          .insert(animeCatalogueSources)
          .values({
            catalogueItemId: secondItem.id,
            sourceKey: 'wikidata',
            sourceItemId: 'Q123',
          })
          .execute(),
      uniqueViolation,
      'anime_catalogue_sources_pkey',
    )
  })

  it('allows one source item ID under different source keys', async () => {
    const catalogueItem = await insertCatalogueItem()

    await database.insert(animeCatalogueSources).values([
      {
        catalogueItemId: catalogueItem.id,
        sourceKey: 'wikidata',
        sourceItemId: '123',
      },
      {
        catalogueItemId: catalogueItem.id,
        sourceKey: 'another_source',
        sourceItemId: '123',
      },
    ])

    await expect(
      database.select().from(animeCatalogueSources),
    ).resolves.toHaveLength(2)
  })

  it('stores and finds several sources for one catalogue item', async () => {
    const catalogueItem = await insertCatalogueItem()
    await database.insert(animeCatalogueSources).values([
      {
        catalogueItemId: catalogueItem.id,
        sourceKey: 'wikidata',
        sourceItemId: 'Q123',
      },
      {
        catalogueItemId: catalogueItem.id,
        sourceKey: 'manual',
        sourceItemId: 'curated-123',
      },
    ])

    const sources = await database
      .select()
      .from(animeCatalogueSources)
      .where(eq(animeCatalogueSources.catalogueItemId, catalogueItem.id))

    expect(sources).toHaveLength(2)
  })

  it('rejects a missing parent and invalid timestamp order', async () => {
    await expectConstraintViolation(
      () =>
        database
          .insert(animeCatalogueSources)
          .values({
            catalogueItemId: randomUUID(),
            sourceKey: 'wikidata',
            sourceItemId: 'Q404',
          })
          .execute(),
      foreignKeyViolation,
      'anime_catalogue_sources_catalogue_item_id_fkey',
    )

    const catalogueItem = await insertCatalogueItem()
    await expectConstraintViolation(
      () =>
        database
          .insert(animeCatalogueSources)
          .values({
            catalogueItemId: catalogueItem.id,
            sourceKey: 'wikidata',
            sourceItemId: 'Q123',
            firstSeenAt: new Date('2026-01-02T00:00:00.000Z'),
            lastSeenAt: new Date('2026-01-01T00:00:00.000Z'),
          })
          .execute(),
      checkViolation,
      'anime_catalogue_sources_timestamp_order_check',
    )
  })

  it('cascades both child groups when their parent is deleted', async () => {
    const catalogueItem = await insertCatalogueItem()
    await database.insert(animeAlternativeTitles).values({
      catalogueItemId: catalogueItem.id,
      title: 'Cascade fixture',
      position: 0,
    })
    await database.insert(animeCatalogueSources).values({
      catalogueItemId: catalogueItem.id,
      sourceKey: 'wikidata',
      sourceItemId: 'Q123',
    })

    await database
      .delete(animeCatalogueItems)
      .where(eq(animeCatalogueItems.id, catalogueItem.id))

    const [titles, sources] = await Promise.all([
      database.select().from(animeAlternativeTitles),
      database.select().from(animeCatalogueSources),
    ])
    expect(titles).toEqual([])
    expect(sources).toEqual([])
  })
})

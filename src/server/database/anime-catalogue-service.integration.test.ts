import { randomUUID } from 'node:crypto'
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
import type { AnimeCatalogueItem } from '@/features/anime/domain/anime-catalogue-item'
import {
  browseAnimeCatalogue,
  searchAnimeCatalogue,
  StoredAnimeCatalogueTitleIntegrityError,
} from '@/server/database/anime-catalogue-service'
import {
  animeAlternativeTitles,
  animeCatalogueItems,
} from '@/server/database/schema'
import { assertSafeTestDatabaseName } from '@/test/database/global-setup'

const { databaseTestUrl } = readDatabaseTestEnvironment()
const pool = new Pool({ connectionString: databaseTestUrl })
const database = drizzle({ client: pool })

type NewCatalogueItem = typeof animeCatalogueItems.$inferInsert

async function insertPublishedItem(
  overrides: Partial<NewCatalogueItem> = {},
  alternatives: Array<{ title: string; position: number }> = [],
) {
  const id = overrides.id ?? randomUUID()
  const [item] = await database
    .insert(animeCatalogueItems)
    .values({
      englishTitle: 'Published fixture',
      format: 'tv',
      releaseStatus: 'finished',
      releaseYear: 2020,
      episodeCount: 12,
      maturity: 'safe',
      catalogueState: 'published',
      ...overrides,
      id,
    })
    .returning()

  if (!item) {
    throw new Error('Expected inserted catalogue item')
  }

  if (alternatives.length > 0) {
    await database.insert(animeAlternativeTitles).values(
      alternatives.map(({ title, position }) => ({
        catalogueItemId: id,
        title,
        position,
      })),
    )
  }

  return item
}

function expectItemShape(item: AnimeCatalogueItem) {
  expect(Object.keys(item).sort()).toEqual([
    'episodeCount',
    'format',
    'id',
    'maturity',
    'releaseStatus',
    'releaseYear',
    'titles',
  ])
  expect(Object.keys(item.titles).sort()).toEqual([
    'alternatives',
    'english',
    'original',
    'romaji',
  ])
  expect(item).not.toHaveProperty('catalogueState')
  expect(item).not.toHaveProperty('createdAt')
  expect(item).not.toHaveProperty('updatedAt')
  expect(item).not.toHaveProperty('sources')
}

async function readCatalogueFingerprint(): Promise<unknown> {
  const result = await pool.query<{ fingerprint: unknown }>(`
    select jsonb_build_object(
      'items', coalesce(
        (select jsonb_agg(to_jsonb(i) order by i.id) from anime_catalogue_items i),
        '[]'::jsonb
      ),
      'alternatives', coalesce(
        (select jsonb_agg(to_jsonb(a) order by a.id) from anime_alternative_titles a),
        '[]'::jsonb
      ),
      'sources', coalesce(
        (
          select jsonb_agg(to_jsonb(s) order by s.source_key, s.source_item_id)
          from anime_catalogue_sources s
        ),
        '[]'::jsonb
      )
    ) as fingerprint
  `)

  return result.rows[0]?.fingerprint
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
      anime_catalogue_items
    restart identity cascade
  `)
})

afterAll(async () => {
  await pool.end()
})

describe('browseAnimeCatalogue', () => {
  it('returns only published non-adult items with an exact count', async () => {
    const visibleId = '11111111-1111-4111-8111-111111111111'
    const sensitiveId = '22222222-2222-4222-8222-222222222222'
    const unknownId = '33333333-3333-4333-8333-333333333333'

    await Promise.all([
      insertPublishedItem({
        id: visibleId,
        englishTitle: 'Visible Alpha',
        maturity: 'safe',
      }),
      insertPublishedItem({
        id: sensitiveId,
        englishTitle: 'Visible Sensitive',
        maturity: 'sensitive',
      }),
      insertPublishedItem({
        id: unknownId,
        englishTitle: 'Visible Unknown',
        maturity: 'unknown',
      }),
      insertPublishedItem({
        englishTitle: 'Hidden Adult',
        maturity: 'adult',
        catalogueState: 'published',
      }),
      insertPublishedItem({
        englishTitle: 'Draft Safe',
        catalogueState: 'draft',
      }),
      insertPublishedItem({
        englishTitle: 'Hidden Safe',
        catalogueState: 'hidden',
      }),
    ])

    const page = await browseAnimeCatalogue(database)

    expect(page.pagination).toEqual({
      page: 1,
      pageSize: 24,
      totalItems: 3,
      totalPages: 1,
      hasPreviousPage: false,
      hasNextPage: false,
    })
    expect(page.items.map(({ id }) => id).sort()).toEqual(
      [visibleId, sensitiveId, unknownId].sort(),
    )
  })

  it('orders browse results by default title, raw title, and id', async () => {
    const firstAlphaId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    const secondAlphaId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
    const romajiFallbackId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
    const originalFallbackId = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
    const zebraId = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1'

    await Promise.all([
      insertPublishedItem({
        id: zebraId,
        englishTitle: 'Zebra Catalogue',
      }),
      insertPublishedItem({
        id: secondAlphaId,
        englishTitle: 'Alpha',
      }),
      insertPublishedItem({
        id: firstAlphaId,
        englishTitle: 'Alpha',
      }),
      insertPublishedItem({
        id: romajiFallbackId,
        englishTitle: null,
        romajiTitle: 'Beta Romaji',
        originalTitle: null,
      }),
      insertPublishedItem({
        id: originalFallbackId,
        englishTitle: null,
        romajiTitle: null,
        originalTitle: 'Gamma Original',
      }),
    ])

    const page = await browseAnimeCatalogue(database, { page: 1, pageSize: 48 })

    expect(page.items.map(({ id }) => id)).toEqual([
      firstAlphaId,
      secondAlphaId,
      romajiFallbackId,
      originalFallbackId,
      zebraId,
    ])
  })

  it('maps stored rows to the provider-neutral domain item without persistence fields', async () => {
    const id = '44444444-4444-4444-8444-444444444444'

    await insertPublishedItem(
      {
        id,
        englishTitle: 'Mapped Title',
        romajiTitle: 'Mapped Romaji',
        originalTitle: 'Mapped Original',
        format: 'movie',
        releaseStatus: 'airing',
        releaseYear: 2024,
        episodeCount: 1,
        maturity: 'sensitive',
      },
      [
        { title: 'Alias One', position: 0 },
        { title: 'Alias Two', position: 1 },
      ],
    )

    const page = await browseAnimeCatalogue(database, { page: 1, pageSize: 1 })

    expect(page.items).toEqual([
      {
        id,
        titles: {
          english: 'Mapped Title',
          romaji: 'Mapped Romaji',
          original: 'Mapped Original',
          alternatives: ['Alias One', 'Alias Two'],
        },
        format: 'movie',
        releaseStatus: 'airing',
        releaseYear: 2024,
        episodeCount: 1,
        maturity: 'sensitive',
      },
    ])
    expectItemShape(page.items[0]!)
  })

  it('applies default pagination and reports empty first pages truthfully', async () => {
    const page = await browseAnimeCatalogue(database)

    expect(page).toEqual({
      items: [],
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

  it('supports custom, last, and beyond-last pages with truthful metadata', async () => {
    const firstId = '55555555-5555-4555-8555-555555555551'
    const secondId = '55555555-5555-4555-8555-555555555552'
    const thirdId = '55555555-5555-4555-8555-555555555553'

    await Promise.all([
      insertPublishedItem({ id: firstId, englishTitle: 'Page One' }),
      insertPublishedItem({ id: secondId, englishTitle: 'Page Two' }),
      insertPublishedItem({ id: thirdId, englishTitle: 'Page Three' }),
    ])

    const firstPage = await browseAnimeCatalogue(database, {
      page: 1,
      pageSize: 2,
    })
    const lastPage = await browseAnimeCatalogue(database, {
      page: 2,
      pageSize: 2,
    })
    const beyondLastPage = await browseAnimeCatalogue(database, {
      page: 3,
      pageSize: 2,
    })

    expect(firstPage.pagination).toEqual({
      page: 1,
      pageSize: 2,
      totalItems: 3,
      totalPages: 2,
      hasPreviousPage: false,
      hasNextPage: true,
    })
    expect(firstPage.items).toHaveLength(2)
    expect(lastPage.pagination).toEqual({
      page: 2,
      pageSize: 2,
      totalItems: 3,
      totalPages: 2,
      hasPreviousPage: true,
      hasNextPage: false,
    })
    expect(lastPage.items).toHaveLength(1)
    expect(beyondLastPage).toEqual({
      items: [],
      pagination: {
        page: 3,
        pageSize: 2,
        totalItems: 3,
        totalPages: 2,
        hasPreviousPage: true,
        hasNextPage: false,
      },
    })
  })

  it('rejects a whole page when a stored primary title differs from JavaScript trim', async () => {
    const validId = '66666666-6666-4666-8666-666666666661'
    const paddedId = '66666666-6666-4666-8666-666666666662'

    await insertPublishedItem({
      id: validId,
      englishTitle: 'Valid Title',
    })
    await pool.query(
      `
        insert into anime_catalogue_items
          (id, english_title, format, release_status, maturity, catalogue_state)
        values ($1, $2, 'tv', 'finished', 'safe', 'published')
      `,
      [paddedId, ' Padded Title '],
    )

    await expect(
      browseAnimeCatalogue(database, { page: 1, pageSize: 48 }),
    ).rejects.toBeInstanceOf(StoredAnimeCatalogueTitleIntegrityError)
  })

  it('does not mutate catalogue rows during read-only browse', async () => {
    const id = '77777777-7777-4777-8777-777777777771'
    await insertPublishedItem({ id, englishTitle: 'Read Only Browse' })

    const fingerprintBefore = await readCatalogueFingerprint()

    await browseAnimeCatalogue(database)

    expect(await readCatalogueFingerprint()).toEqual(fingerprintBefore)
  })
})

describe('searchAnimeCatalogue', () => {
  it('matches primary titles in English, Romaji, and original forms', async () => {
    const englishId = '88888881-8888-4888-8888-888888888881'
    const romajiId = '88888881-8888-4888-8888-888888888882'
    const originalId = '88888881-8888-4888-8888-888888888883'

    await Promise.all([
      insertPublishedItem({
        id: englishId,
        englishTitle: 'English Search Target',
        romajiTitle: 'Romaji Only',
        originalTitle: 'Original Only',
      }),
      insertPublishedItem({
        id: romajiId,
        englishTitle: null,
        romajiTitle: 'Romaji Search Target',
        originalTitle: 'Original Only',
      }),
      insertPublishedItem({
        id: originalId,
        englishTitle: null,
        romajiTitle: null,
        originalTitle: 'Original Search Target',
      }),
    ])

    await expect(
      searchAnimeCatalogue(database, { query: 'english search' }),
    ).resolves.toMatchObject({
      pagination: { totalItems: 1 },
      items: [expect.objectContaining({ id: englishId })],
    })
    await expect(
      searchAnimeCatalogue(database, { query: 'romaji search' }),
    ).resolves.toMatchObject({
      pagination: { totalItems: 1 },
      items: [expect.objectContaining({ id: romajiId })],
    })
    await expect(
      searchAnimeCatalogue(database, { query: 'original search' }),
    ).resolves.toMatchObject({
      pagination: { totalItems: 1 },
      items: [expect.objectContaining({ id: originalId })],
    })
  })

  it('matches alternative titles, preserves stored order, and suppresses duplicates', async () => {
    const publicId = '99999991-9999-4999-8999-999999999991'
    const hiddenId = '99999991-9999-4999-8999-999999999992'

    await insertPublishedItem(
      {
        id: publicId,
        englishTitle: 'Shared Parent',
      },
      [
        { title: 'Shared Alias', position: 0 },
        { title: 'Second Alias', position: 1 },
        { title: 'POKEMON', position: 2 },
      ],
    )
    await insertPublishedItem(
      {
        id: hiddenId,
        englishTitle: 'Hidden Parent',
        catalogueState: 'hidden',
      },
      [{ title: 'Shared Alias', position: 0 }],
    )

    const page = await searchAnimeCatalogue(database, { query: 'pokemon' })

    expect(page.pagination.totalItems).toBe(1)
    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toMatchObject({
      id: publicId,
      titles: {
        alternatives: ['Shared Alias', 'Second Alias', 'POKEMON'],
      },
    })

    const duplicatePage = await searchAnimeCatalogue(database, {
      query: 'shared',
    })

    expect(duplicatePage.pagination.totalItems).toBe(1)
    expect(duplicatePage.items[0]?.id).toBe(publicId)
  })

  it('does not match alternative titles belonging only to adult or unpublished items', async () => {
    await insertPublishedItem(
      {
        englishTitle: 'Adult Parent',
        maturity: 'adult',
      },
      [{ title: 'Private Adult Alias', position: 0 }],
    )
    await insertPublishedItem(
      {
        englishTitle: 'Draft Parent',
        catalogueState: 'draft',
      },
      [{ title: 'Private Draft Alias', position: 0 }],
    )

    await expect(
      searchAnimeCatalogue(database, { query: 'private adult alias' }),
    ).resolves.toMatchObject({ items: [], pagination: { totalItems: 0 } })
    await expect(
      searchAnimeCatalogue(database, { query: 'private draft alias' }),
    ).resolves.toMatchObject({ items: [], pagination: { totalItems: 0 } })
  })

  it('ranks exact matches ahead of prefix and contains matches', async () => {
    const exactId = '10101010-1010-4101-8101-101010101001'
    const prefixId = '10101010-1010-4101-8101-101010101002'
    const containsId = '10101010-1010-4101-8101-101010101003'

    await Promise.all([
      insertPublishedItem({
        id: containsId,
        englishTitle: 'Contains Steins;Gate Story',
      }),
      insertPublishedItem({
        id: prefixId,
        englishTitle: 'Steins;Gate Prelude',
      }),
      insertPublishedItem(
        {
          id: exactId,
          englishTitle: 'Another Series',
        },
        [{ title: 'steins;gate', position: 0 }],
      ),
    ])

    const page = await searchAnimeCatalogue(database, { query: 'steins;gate' })

    expect(page.items.map(({ id }) => id)).toEqual([
      exactId,
      prefixId,
      containsId,
    ])
  })

  it('applies exact, prefix, and contains ranks to alternative titles', async () => {
    const exactId = '11101010-1010-4101-8101-101010101001'
    const prefixId = '11101010-1010-4101-8101-101010101002'
    const containsId = '11101010-1010-4101-8101-101010101003'

    await Promise.all([
      insertPublishedItem(
        { id: containsId, englishTitle: 'Alternative Contains Parent' },
        [{ title: 'A Sailor Moon Story', position: 0 }],
      ),
      insertPublishedItem(
        { id: prefixId, englishTitle: 'Alternative Prefix Parent' },
        [{ title: 'Sailor Moon Prelude', position: 0 }],
      ),
      insertPublishedItem(
        { id: exactId, englishTitle: 'Alternative Exact Parent' },
        [{ title: 'Sailor Moon', position: 0 }],
      ),
    ])

    const page = await searchAnimeCatalogue(database, { query: 'sailor moon' })

    expect(page.items.map(({ id }) => id)).toEqual([
      exactId,
      prefixId,
      containsId,
    ])
  })

  it('treats query wildcards and escape characters literally', async () => {
    const percentId = '12121212-1212-4121-8121-121212121201'
    const underscoreId = '12121212-1212-4121-8121-121212121202'
    const escapeId = '12121212-1212-4121-8121-121212121203'
    const percentDecoyId = '12121212-1212-4121-8121-121212121204'
    const underscoreDecoyId = '12121212-1212-4121-8121-121212121205'

    await Promise.all([
      insertPublishedItem({
        id: percentId,
        englishTitle: 'Score 100% Completion',
      }),
      insertPublishedItem({
        id: underscoreId,
        englishTitle: 'Title_with_underscore',
      }),
      insertPublishedItem({
        id: escapeId,
        englishTitle: String.raw`Path\Literal`,
      }),
      insertPublishedItem({
        id: percentDecoyId,
        englishTitle: 'Score 100 Percent Completion',
      }),
      insertPublishedItem({
        id: underscoreDecoyId,
        englishTitle: 'TitleXwithXunderscore',
      }),
    ])

    await expect(
      searchAnimeCatalogue(database, { query: '100%' }),
    ).resolves.toMatchObject({
      pagination: { totalItems: 1 },
      items: [expect.objectContaining({ id: percentId })],
    })
    await expect(
      searchAnimeCatalogue(database, { query: 'title_with' }),
    ).resolves.toMatchObject({
      pagination: { totalItems: 1 },
      items: [expect.objectContaining({ id: underscoreId })],
    })
    await expect(
      searchAnimeCatalogue(database, { query: String.raw`Path\Literal` }),
    ).resolves.toMatchObject({
      pagination: { totalItems: 1 },
      items: [expect.objectContaining({ id: escapeId })],
    })
  })

  it('rejects a whole page when an alternative duplicates a primary title', async () => {
    const id = '12121212-1212-4121-8121-121212121206'

    await insertPublishedItem({ id, englishTitle: 'Duplicate Title' })
    await pool.query(
      `
        insert into anime_alternative_titles
          (catalogue_item_id, title, position)
        values ($1, $2, 0)
      `,
      [id, 'Duplicate Title'],
    )

    await expect(browseAnimeCatalogue(database)).rejects.toMatchObject({
      name: 'ZodError',
    })
  })

  it('normalizes leading, trailing, and repeated query whitespace', async () => {
    const id = '13131313-1313-4131-8131-131313131301'

    await insertPublishedItem({
      id,
      englishTitle: 'One Piece Voyage',
    })

    await expect(
      searchAnimeCatalogue(database, { query: '  one   piece  ' }),
    ).resolves.toMatchObject({
      pagination: { totalItems: 1 },
      items: [expect.objectContaining({ id })],
    })
  })

  it('returns truthful search counts and empty beyond-last pages', async () => {
    const firstId = '14141414-1414-4141-8141-141414141401'
    const secondId = '14141414-1414-4141-8141-141414141402'

    await Promise.all([
      insertPublishedItem({ id: firstId, englishTitle: 'Count Alpha' }),
      insertPublishedItem({ id: secondId, englishTitle: 'Count Beta' }),
      insertPublishedItem({
        englishTitle: 'Count Draft',
        catalogueState: 'draft',
      }),
      insertPublishedItem({
        englishTitle: 'Count Adult',
        maturity: 'adult',
        catalogueState: 'published',
      }),
    ])

    const firstPage = await searchAnimeCatalogue(database, {
      query: 'count',
      page: 1,
      pageSize: 1,
    })
    const beyondLastPage = await searchAnimeCatalogue(database, {
      query: 'count',
      page: 3,
      pageSize: 1,
    })

    expect(firstPage.pagination).toEqual({
      page: 1,
      pageSize: 1,
      totalItems: 2,
      totalPages: 2,
      hasPreviousPage: false,
      hasNextPage: true,
    })
    expect(beyondLastPage).toEqual({
      items: [],
      pagination: {
        page: 3,
        pageSize: 1,
        totalItems: 2,
        totalPages: 2,
        hasPreviousPage: true,
        hasNextPage: false,
      },
    })
  })

  it('rejects a whole page when a stored alternative title differs from JavaScript trim', async () => {
    const id = '15151515-1515-4151-8151-151515151501'

    await insertPublishedItem({
      id,
      englishTitle: 'Valid Parent',
    })
    await pool.query(
      `
        insert into anime_alternative_titles
          (catalogue_item_id, title, position)
        values ($1, $2, 0)
      `,
      [id, ' Trimmed Alias '],
    )

    await expect(
      searchAnimeCatalogue(database, { query: 'valid parent' }),
    ).rejects.toBeInstanceOf(StoredAnimeCatalogueTitleIntegrityError)
  })

  it('does not mutate catalogue rows during read-only search', async () => {
    const id = '16161616-1616-4161-8161-161616161601'
    await insertPublishedItem({ id, englishTitle: 'Read Only Search' })

    const fingerprintBefore = await readCatalogueFingerprint()

    await searchAnimeCatalogue(database, { query: 'read only' })

    expect(await readCatalogueFingerprint()).toEqual(fingerprintBefore)
  })
})

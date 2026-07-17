import { randomUUID } from 'node:crypto'
import { asc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type {
  AnimeCatalogueSeed,
  AnimeCatalogueSeedItem,
} from '@/features/anime/catalogue/anime-catalogue-seed'
import { readDatabaseTestEnvironment } from '@/config/database-environment'
import {
  AnimeCatalogueSeedSourceConflictError,
  synchronizeAnimeCatalogueSeed,
} from '@/server/database/seed-anime-catalogue'
import {
  animeAlternativeTitles,
  animeCatalogueItems,
  animeCatalogueSources,
} from '@/server/database/schema'
import { assertSafeTestDatabaseName } from '@/test/database/global-setup'

const firstItemId = '0652e18e-9316-43f8-b51f-a971c4cfdde9'
const secondItemId = '3f193409-1cb7-45b0-b9a5-c0f80a65397a'
const initialMutationTime = new Date('2026-01-01T00:00:00.000Z')
const laterMutationTime = new Date('2026-02-01T00:00:00.000Z')

const { databaseTestUrl } = readDatabaseTestEnvironment()
const pool = new Pool({ connectionString: databaseTestUrl })
const database = drizzle({ client: pool })

function createSeedItem(
  overrides: Partial<AnimeCatalogueSeedItem> = {},
): AnimeCatalogueSeedItem {
  return {
    id: firstItemId,
    titles: {
      english: 'Cowboy Bebop',
      romaji: 'Cowboy Bebop',
      original: 'カウボーイビバップ',
      alternatives: ['Space Cowboy'],
    },
    format: 'tv',
    releaseStatus: 'finished',
    releaseYear: 1998,
    episodeCount: 26,
    maturity: 'sensitive',
    catalogueState: 'published',
    sources: [{ sourceKey: 'wikidata', sourceItemId: 'Q101244908' }],
    ...overrides,
  }
}

function createSeed(
  items: AnimeCatalogueSeedItem[] = [createSeedItem()],
): AnimeCatalogueSeed {
  return { version: 1, items }
}

async function selectItem(id: string) {
  const [item] = await database
    .select()
    .from(animeCatalogueItems)
    .where(eq(animeCatalogueItems.id, id))

  return item
}

async function selectAlternatives(id: string) {
  return database
    .select()
    .from(animeAlternativeTitles)
    .where(eq(animeAlternativeTitles.catalogueItemId, id))
    .orderBy(asc(animeAlternativeTitles.position))
}

async function selectSources(id: string) {
  return database
    .select()
    .from(animeCatalogueSources)
    .where(eq(animeCatalogueSources.catalogueItemId, id))
    .orderBy(
      asc(animeCatalogueSources.sourceKey),
      asc(animeCatalogueSources.sourceItemId),
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
      anime_catalogue_sources,
      anime_alternative_titles,
      anime_catalogue_items
    restart identity cascade
  `)
})

afterAll(async () => {
  await pool.end()
})

describe('synchronizeAnimeCatalogueSeed', () => {
  it('inserts parents, ordered alternatives, sources, and accurate counts', async () => {
    const secondItem = createSeedItem({
      id: secondItemId,
      titles: {
        english: 'Spirited Away',
        romaji: 'Sen to Chihiro no Kamikakushi',
        original: '千と千尋の神隠し',
        alternatives: [],
      },
      format: 'movie',
      releaseYear: 2001,
      episodeCount: null,
      maturity: 'safe',
      sources: [
        { sourceKey: 'wikidata', sourceItemId: 'Q155653' },
        { sourceKey: 'manual', sourceItemId: 'spirited-away' },
      ],
    })
    const firstItem = createSeedItem({
      titles: {
        english: 'Cowboy Bebop',
        romaji: 'Cowboy Bebop',
        original: 'カウボーイビバップ',
        alternatives: ['COWBOY BEBOP', 'Space Cowboy'],
      },
    })

    await expect(
      synchronizeAnimeCatalogueSeed(
        database,
        createSeed([firstItem, secondItem]),
        { mutationTime: initialMutationTime },
      ),
    ).resolves.toEqual({ inserted: 2, updated: 0, unchanged: 0 })

    const [storedParents, firstAlternatives, firstSources, secondSources] =
      await Promise.all([
        database
          .select()
          .from(animeCatalogueItems)
          .orderBy(asc(animeCatalogueItems.id)),
        selectAlternatives(firstItemId),
        selectSources(firstItemId),
        selectSources(secondItemId),
      ])

    expect(storedParents).toHaveLength(2)
    expect(storedParents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: firstItemId,
          englishTitle: 'Cowboy Bebop',
          releaseYear: 1998,
          episodeCount: 26,
          createdAt: initialMutationTime,
          updatedAt: initialMutationTime,
        }),
        expect.objectContaining({
          id: secondItemId,
          englishTitle: 'Spirited Away',
          format: 'movie',
          episodeCount: null,
          createdAt: initialMutationTime,
          updatedAt: initialMutationTime,
        }),
      ]),
    )
    expect(
      firstAlternatives.map(({ title, position }) => ({ title, position })),
    ).toEqual([
      { title: 'COWBOY BEBOP', position: 0 },
      { title: 'Space Cowboy', position: 1 },
    ])
    expect(firstSources).toEqual([
      expect.objectContaining({
        catalogueItemId: firstItemId,
        sourceKey: 'wikidata',
        sourceItemId: 'Q101244908',
        firstSeenAt: initialMutationTime,
        lastSeenAt: initialMutationTime,
      }),
    ])
    expect(secondSources).toHaveLength(2)
  })

  it('does no writes for an identical rerun and preserves every timestamp and child ID', async () => {
    const seed = createSeed()
    await synchronizeAnimeCatalogueSeed(database, seed, {
      mutationTime: initialMutationTime,
    })

    const before = {
      parent: await selectItem(firstItemId),
      alternatives: await selectAlternatives(firstItemId),
      sources: await selectSources(firstItemId),
    }

    await expect(
      synchronizeAnimeCatalogueSeed(database, seed, {
        mutationTime: laterMutationTime,
      }),
    ).resolves.toEqual({ inserted: 0, updated: 0, unchanged: 1 })

    expect({
      parent: await selectItem(firstItemId),
      alternatives: await selectAlternatives(firstItemId),
      sources: await selectSources(firstItemId),
    }).toEqual(before)
  })

  it('treats child-only convergence as an aggregate update without changing the parent row timestamp', async () => {
    const originalItem = createSeedItem()
    const seed = createSeed([originalItem])
    await synchronizeAnimeCatalogueSeed(database, seed, {
      mutationTime: initialMutationTime,
    })

    const parentBefore = await selectItem(firstItemId)
    const sourcesBefore = await selectSources(firstItemId)
    const changedSeed = createSeed([
      createSeedItem({
        titles: {
          ...originalItem.titles,
          alternatives: ['Changed child title'],
        },
      }),
    ])

    await expect(
      synchronizeAnimeCatalogueSeed(database, changedSeed, {
        mutationTime: laterMutationTime,
      }),
    ).resolves.toEqual({ inserted: 0, updated: 1, unchanged: 0 })

    expect(await selectItem(firstItemId)).toEqual(parentBefore)
    expect(await selectSources(firstItemId)).toEqual(sourcesBefore)
    expect(
      (await selectAlternatives(firstItemId)).map(({ title }) => title),
    ).toEqual(['Changed child title'])
  })

  it('converges parent, alternative, and source changes without churning an unchanged source', async () => {
    const originalSeed = createSeed([
      createSeedItem({
        titles: {
          english: 'Manual old title',
          romaji: 'Cowboy Bebop',
          original: 'カウボーイビバップ',
          alternatives: ['Old first', 'Old second'],
        },
        sources: [
          { sourceKey: 'manual', sourceItemId: 'old-source' },
          { sourceKey: 'wikidata', sourceItemId: 'Q101244908' },
        ],
      }),
    ])
    await synchronizeAnimeCatalogueSeed(database, originalSeed, {
      mutationTime: initialMutationTime,
    })

    const originalParent = await selectItem(firstItemId)
    const originalAlternatives = await selectAlternatives(firstItemId)
    const originalSources = await selectSources(firstItemId)
    const originalWikidataSource = originalSources.find(
      ({ sourceKey }) => sourceKey === 'wikidata',
    )
    const changedSeed = createSeed([
      createSeedItem({
        titles: {
          english: 'Cowboy Bebop restored',
          romaji: 'Cowboy Bebop',
          original: 'カウボーイビバップ',
          alternatives: ['Replacement second', 'Replacement first'],
        },
        sources: [
          { sourceKey: 'wikidata', sourceItemId: 'Q101244908' },
          { sourceKey: 'manual', sourceItemId: 'new-source' },
        ],
      }),
    ])

    await expect(
      synchronizeAnimeCatalogueSeed(database, changedSeed, {
        mutationTime: laterMutationTime,
      }),
    ).resolves.toEqual({ inserted: 0, updated: 1, unchanged: 0 })

    const changedParent = await selectItem(firstItemId)
    const changedAlternatives = await selectAlternatives(firstItemId)
    const changedSources = await selectSources(firstItemId)

    expect(changedParent).toMatchObject({
      englishTitle: 'Cowboy Bebop restored',
      createdAt: originalParent?.createdAt,
      updatedAt: laterMutationTime,
    })
    expect(changedAlternatives.map(({ title }) => title)).toEqual([
      'Replacement second',
      'Replacement first',
    ])
    expect(changedAlternatives.map(({ id }) => id)).not.toEqual(
      originalAlternatives.map(({ id }) => id),
    )
    expect(changedSources).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceItemId: 'old-source' }),
      ]),
    )
    expect(changedSources).toEqual(
      expect.arrayContaining([
        originalWikidataSource,
        expect.objectContaining({
          sourceKey: 'manual',
          sourceItemId: 'new-source',
          firstSeenAt: laterMutationTime,
          lastSeenAt: laterMutationTime,
        }),
      ]),
    )
  })

  it('preserves unlisted records and records removed from later seed input', async () => {
    const removedItem = createSeedItem({
      id: secondItemId,
      titles: {
        english: 'Spirited Away',
        romaji: null,
        original: null,
        alternatives: ['Sen to Chihiro no Kamikakushi'],
      },
      sources: [{ sourceKey: 'wikidata', sourceItemId: 'Q155653' }],
    })
    await synchronizeAnimeCatalogueSeed(
      database,
      createSeed([createSeedItem(), removedItem]),
      { mutationTime: initialMutationTime },
    )

    const unlistedId = randomUUID()
    await database.insert(animeCatalogueItems).values({
      id: unlistedId,
      englishTitle: 'Developer-added record',
      format: 'ova',
      releaseStatus: 'unknown',
      maturity: 'unknown',
      catalogueState: 'draft',
    })
    await database.insert(animeAlternativeTitles).values({
      catalogueItemId: unlistedId,
      title: 'Unlisted alternative',
      position: 0,
    })
    await database.insert(animeCatalogueSources).values({
      catalogueItemId: unlistedId,
      sourceKey: 'manual',
      sourceItemId: 'unlisted',
    })
    const unlistedBefore = {
      parent: await selectItem(unlistedId),
      alternatives: await selectAlternatives(unlistedId),
      sources: await selectSources(unlistedId),
    }
    const removedBefore = {
      parent: await selectItem(secondItemId),
      alternatives: await selectAlternatives(secondItemId),
      sources: await selectSources(secondItemId),
    }

    await expect(
      synchronizeAnimeCatalogueSeed(database, createSeed(), {
        mutationTime: laterMutationTime,
      }),
    ).resolves.toEqual({ inserted: 0, updated: 0, unchanged: 1 })

    expect({
      parent: await selectItem(unlistedId),
      alternatives: await selectAlternatives(unlistedId),
      sources: await selectSources(unlistedId),
    }).toEqual(unlistedBefore)
    expect({
      parent: await selectItem(secondItemId),
      alternatives: await selectAlternatives(secondItemId),
      sources: await selectSources(secondItemId),
    }).toEqual(removedBefore)
  })

  it('converges manual data already stored under a listed fixed ID', async () => {
    await database.insert(animeCatalogueItems).values({
      id: firstItemId,
      englishTitle: 'Developer edit',
      format: 'unknown',
      releaseStatus: 'unknown',
      maturity: 'unknown',
      catalogueState: 'draft',
      createdAt: initialMutationTime,
      updatedAt: initialMutationTime,
    })
    await database.insert(animeAlternativeTitles).values({
      catalogueItemId: firstItemId,
      title: 'Developer alternative',
      position: 0,
    })
    await database.insert(animeCatalogueSources).values({
      catalogueItemId: firstItemId,
      sourceKey: 'manual',
      sourceItemId: 'developer-source',
      firstSeenAt: initialMutationTime,
      lastSeenAt: initialMutationTime,
    })

    await expect(
      synchronizeAnimeCatalogueSeed(database, createSeed(), {
        mutationTime: laterMutationTime,
      }),
    ).resolves.toEqual({ inserted: 0, updated: 1, unchanged: 0 })

    expect(await selectItem(firstItemId)).toMatchObject({
      englishTitle: 'Cowboy Bebop',
      format: 'tv',
      releaseStatus: 'finished',
      maturity: 'sensitive',
      catalogueState: 'published',
      createdAt: initialMutationTime,
      updatedAt: laterMutationTime,
    })
    expect(
      (await selectAlternatives(firstItemId)).map(({ title }) => title),
    ).toEqual(['Space Cowboy'])
    expect(await selectSources(firstItemId)).toEqual([
      expect.objectContaining({
        sourceKey: 'wikidata',
        sourceItemId: 'Q101244908',
      }),
    ])
  })

  it('rejects source ownership conflicts without modifying any catalogue data', async () => {
    const ownerId = randomUUID()
    await database.insert(animeCatalogueItems).values({
      id: ownerId,
      englishTitle: 'Existing source owner',
      format: 'unknown',
      releaseStatus: 'unknown',
      maturity: 'unknown',
    })
    await database.insert(animeCatalogueSources).values({
      catalogueItemId: ownerId,
      sourceKey: 'wikidata',
      sourceItemId: 'Q155653',
    })
    const conflictingItem = createSeedItem({
      id: secondItemId,
      sources: [{ sourceKey: 'wikidata', sourceItemId: 'Q155653' }],
    })

    await expect(
      synchronizeAnimeCatalogueSeed(
        database,
        createSeed([createSeedItem(), conflictingItem]),
        { mutationTime: initialMutationTime },
      ),
    ).rejects.toEqual(
      new AnimeCatalogueSeedSourceConflictError('wikidata', 'Q155653'),
    )

    expect(await selectItem(firstItemId)).toBeUndefined()
    expect(await selectItem(secondItemId)).toBeUndefined()
    expect(await selectItem(ownerId)).toMatchObject({
      englishTitle: 'Existing source owner',
    })
    expect(await selectSources(ownerId)).toHaveLength(1)
  })

  it('rolls back earlier writes when a later operation fails', async () => {
    const futureCreatedAt = new Date('2030-01-01T00:00:00.000Z')
    await database.insert(animeCatalogueItems).values({
      id: secondItemId,
      englishTitle: 'Future-created manual record',
      format: 'unknown',
      releaseStatus: 'unknown',
      maturity: 'unknown',
      createdAt: futureCreatedAt,
      updatedAt: futureCreatedAt,
    })
    const originalSecondItem = await selectItem(secondItemId)
    const secondSeedItem = createSeedItem({
      id: secondItemId,
      titles: {
        english: 'Spirited Away',
        romaji: null,
        original: null,
        alternatives: [],
      },
      sources: [{ sourceKey: 'wikidata', sourceItemId: 'Q155653' }],
    })

    let synchronizationError: unknown

    try {
      await synchronizeAnimeCatalogueSeed(
        database,
        createSeed([createSeedItem(), secondSeedItem]),
        { mutationTime: laterMutationTime },
      )
    } catch (error) {
      synchronizationError = error
    }

    const postgresError =
      synchronizationError instanceof Error &&
      synchronizationError.cause !== undefined
        ? synchronizationError.cause
        : synchronizationError

    expect(postgresError).toMatchObject({
      code: '23514',
      constraint: 'anime_catalogue_items_timestamp_order_check',
    })

    expect(await selectItem(firstItemId)).toBeUndefined()
    expect(await selectItem(secondItemId)).toEqual(originalSecondItem)
    expect(await selectSources(secondItemId)).toEqual([])
  })
})

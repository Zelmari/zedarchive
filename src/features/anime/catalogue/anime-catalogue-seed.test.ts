import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  animeCatalogueSeedSchema,
  loadAnimeCatalogueSeed,
  parseAnimeCatalogueSeed,
  type AnimeCatalogueSeed,
} from '@/features/anime/catalogue/anime-catalogue-seed'
import {
  animeCatalogueStateSchema,
  animeCatalogueStateValues,
} from '@/features/anime/catalogue/anime-catalogue-state'

const committedSeedPath = resolve(
  process.cwd(),
  'data/seeds/anime-catalogue.development.json',
)

const approvedItems = [
  {
    id: '0652e18e-9316-43f8-b51f-a971c4cfdde9',
    titles: {
      english: 'Cowboy Bebop',
      romaji: 'Cowboy Bebop',
      original: 'カウボーイビバップ',
      alternatives: [],
    },
    format: 'tv',
    releaseStatus: 'finished',
    releaseYear: 1998,
    episodeCount: 26,
    maturity: 'sensitive',
    catalogueState: 'published',
    sources: [{ sourceKey: 'wikidata', sourceItemId: 'Q101244908' }],
  },
  {
    id: '3f193409-1cb7-45b0-b9a5-c0f80a65397a',
    titles: {
      english: 'Spirited Away',
      romaji: 'Sen to Chihiro no Kamikakushi',
      original: '千と千尋の神隠し',
      alternatives: [],
    },
    format: 'movie',
    releaseStatus: 'finished',
    releaseYear: 2001,
    episodeCount: null,
    maturity: 'safe',
    catalogueState: 'published',
    sources: [{ sourceKey: 'wikidata', sourceItemId: 'Q155653' }],
  },
  {
    id: 'c3631432-448a-4192-b5d7-900ab6816197',
    titles: {
      english: 'FLCL',
      romaji: 'Furi Kuri',
      original: 'フリクリ',
      alternatives: ['Fooly Cooly'],
    },
    format: 'ova',
    releaseStatus: 'finished',
    releaseYear: 2000,
    episodeCount: 6,
    maturity: 'sensitive',
    catalogueState: 'published',
    sources: [{ sourceKey: 'wikidata', sourceItemId: 'Q111954103' }],
  },
  {
    id: 'd7633df5-7c0c-4df6-917d-1eebf48f7226',
    titles: {
      english: 'Cyberpunk: Edgerunners',
      romaji: 'Cyberpunk: Edgerunners',
      original: 'サイバーパンク エッジランナーズ',
      alternatives: ['Edgerunners'],
    },
    format: 'ona',
    releaseStatus: 'finished',
    releaseYear: 2022,
    episodeCount: 10,
    maturity: 'adult',
    catalogueState: 'published',
    sources: [{ sourceKey: 'wikidata', sourceItemId: 'Q96677963' }],
  },
  {
    id: '1e9f0f2f-0a69-4846-967a-ec7c1aedc804',
    titles: {
      english: 'Pokémon Origins',
      romaji: 'Pocket Monsters: The Origin',
      original: 'ポケットモンスター THE ORIGIN',
      alternatives: ['Pokemon Origins'],
    },
    format: 'special',
    releaseStatus: 'finished',
    releaseYear: 2013,
    episodeCount: 4,
    maturity: 'safe',
    catalogueState: 'published',
    sources: [{ sourceKey: 'wikidata', sourceItemId: 'Q14870116' }],
  },
  {
    id: '49e3cb82-c826-4cda-85d3-be3c816bd53a',
    titles: {
      english: 'One Piece',
      romaji: 'One Piece',
      original: 'ONE PIECE',
      alternatives: [],
    },
    format: 'tv',
    releaseStatus: 'airing',
    releaseYear: 1999,
    episodeCount: null,
    maturity: 'sensitive',
    catalogueState: 'published',
    sources: [{ sourceKey: 'wikidata', sourceItemId: 'Q710324' }],
  },
  {
    id: '850c3e6b-15f6-4aea-99cc-3d8e5a84d008',
    titles: {
      english: null,
      romaji: 'Katanagatari',
      original: '刀語',
      alternatives: [],
    },
    format: 'tv',
    releaseStatus: 'finished',
    releaseYear: 2010,
    episodeCount: 12,
    maturity: 'sensitive',
    catalogueState: 'draft',
    sources: [{ sourceKey: 'wikidata', sourceItemId: 'Q110420017' }],
  },
  {
    id: 'e22aa50a-0efc-4c18-809d-feb75dab3b6a',
    titles: {
      english: 'Perfect Blue',
      romaji: 'Perfect Blue',
      original: 'パーフェクトブルー',
      alternatives: ['PERFECT BLUE'],
    },
    format: 'movie',
    releaseStatus: 'finished',
    releaseYear: 1997,
    episodeCount: null,
    maturity: 'sensitive',
    catalogueState: 'hidden',
    sources: [{ sourceKey: 'wikidata', sourceItemId: 'Q1205051' }],
  },
] as const

let committedSeed: AnimeCatalogueSeed
let temporaryDirectory: string

beforeAll(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'archive-anime-seed-'))

  try {
    committedSeed = await loadAnimeCatalogueSeed(committedSeedPath)
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true })
    throw error
  }
})

afterAll(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true })
})

describe('anime catalogue state', () => {
  it.each(animeCatalogueStateValues)(
    'accepts the canonical "%s" state',
    (state) => {
      expect(animeCatalogueStateSchema.parse(state)).toBe(state)
    },
  )

  it.each(['', 'published ', 'Published', 'archived'])(
    'rejects the noncanonical state "%s"',
    (state) => {
      expect(animeCatalogueStateSchema.safeParse(state).success).toBe(false)
    },
  )
})

describe('committed development seed', () => {
  it('preserves the original eight approved anime before imported records', () => {
    expect(committedSeed.items).toHaveLength(28)
    expect(committedSeed.items.slice(0, approvedItems.length)).toEqual(
      approvedItems,
    )
  })

  it('preserves declared alternative-title order', () => {
    const seed = parseAnimeCatalogueSeed({
      version: 1,
      items: [
        {
          ...approvedItems[0],
          titles: {
            ...approvedItems[0].titles,
            alternatives: ['First alias', 'Second alias', 'Third alias'],
          },
        },
      ],
    })

    expect(seed.items[0]?.titles.alternatives).toEqual([
      'First alias',
      'Second alias',
      'Third alias',
    ])
  })
})

describe('animeCatalogueSeedSchema', () => {
  it('requires version 1 and at least one item', () => {
    expect(
      animeCatalogueSeedSchema.safeParse({ items: approvedItems }).success,
    ).toBe(false)
    expect(
      animeCatalogueSeedSchema.safeParse({ version: 2, items: approvedItems })
        .success,
    ).toBe(false)
    expect(
      animeCatalogueSeedSchema.safeParse({ version: 1, items: [] }).success,
    ).toBe(false)
  })

  it('rejects unexpected keys at every object level', () => {
    const item = approvedItems[0]
    const invalidSeeds = [
      { version: 1, items: [item], note: 'unexpected' },
      { version: 1, items: [{ ...item, description: 'unexpected' }] },
      {
        version: 1,
        items: [
          {
            ...item,
            titles: { ...item.titles, japanese: 'unexpected' },
          },
        ],
      },
      {
        version: 1,
        items: [
          {
            ...item,
            sources: [{ ...item.sources[0], url: 'unexpected' }],
          },
        ],
      },
    ]

    invalidSeeds.forEach((seed) => {
      expect(animeCatalogueSeedSchema.safeParse(seed).success).toBe(false)
    })
  })

  it('reuses catalogue rules and validates catalogue states and sources', () => {
    const item = approvedItems[0]
    const invalidItems = [
      { ...item, id: 'not-a-uuid' },
      { ...item, episodeCount: 0 },
      { ...item, catalogueState: 'archived' },
      { ...item, sources: [] },
      { ...item, sources: [{ sourceKey: 'WikiData', sourceItemId: 'Q1' }] },
      { ...item, sources: [{ sourceKey: 'wikidata', sourceItemId: '   ' }] },
    ]

    invalidItems.forEach((invalidItem) => {
      expect(
        animeCatalogueSeedSchema.safeParse({
          version: 1,
          items: [invalidItem],
        }).success,
      ).toBe(false)
    })
  })

  it('rejects duplicate catalogue item IDs', () => {
    const duplicate = {
      ...approvedItems[1],
      id: approvedItems[0].id,
    }

    expect(() =>
      parseAnimeCatalogueSeed({
        version: 1,
        items: [approvedItems[0], duplicate],
      }),
    ).toThrow('Catalogue item IDs must be unique within a seed')
  })

  it('rejects UUID duplicates that differ only by letter case', () => {
    const mixedCaseDuplicate = {
      ...approvedItems[1],
      id: approvedItems[0].id.toUpperCase(),
    }

    expect(() =>
      parseAnimeCatalogueSeed({
        version: 1,
        items: [approvedItems[0], mixedCaseDuplicate],
      }),
    ).toThrow('Catalogue item IDs must be unique within a seed')
  })

  it('rejects duplicate source pairs across different items', () => {
    const duplicate = {
      ...approvedItems[1],
      sources: approvedItems[0].sources,
    }

    expect(() =>
      parseAnimeCatalogueSeed({
        version: 1,
        items: [approvedItems[0], duplicate],
      }),
    ).toThrow(
      'Catalogue source key and item ID pairs must be unique within a seed',
    )
  })

  it('normalises the strings whose schemas promise trimming', () => {
    const parsed = parseAnimeCatalogueSeed({
      version: 1,
      items: [
        {
          ...approvedItems[0],
          titles: { ...approvedItems[0].titles, english: ' Cowboy Bebop ' },
          sources: [{ sourceKey: 'wikidata', sourceItemId: ' Q101244908 ' }],
        },
      ],
    })

    expect(parsed.items[0]?.titles.english).toBe('Cowboy Bebop')
    expect(parsed.items[0]?.sources[0]?.sourceItemId).toBe('Q101244908')
  })
})

describe('loadAnimeCatalogueSeed', () => {
  it('reports malformed JSON explicitly', async () => {
    const filePath = join(temporaryDirectory, 'malformed.json')
    await writeFile(filePath, '{"version": 1,', 'utf8')

    await expect(loadAnimeCatalogueSeed(filePath)).rejects.toThrow(
      `Malformed JSON in anime catalogue seed at "${filePath}"`,
    )
  })

  it('reports file read failures without hiding the path', async () => {
    const filePath = join(temporaryDirectory, 'missing.json')

    await expect(loadAnimeCatalogueSeed(filePath)).rejects.toThrow(
      `Unable to read anime catalogue seed at "${filePath}"`,
    )
  })

  it('validates parsed JSON instead of trusting the file contents', async () => {
    const filePath = join(temporaryDirectory, 'invalid.json')
    await writeFile(filePath, '{"version":1,"items":[]}', 'utf8')

    await expect(loadAnimeCatalogueSeed(filePath)).rejects.toMatchObject({
      name: 'ZodError',
    })
  })
})

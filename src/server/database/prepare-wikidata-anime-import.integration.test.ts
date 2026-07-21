import { randomUUID } from 'node:crypto'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readDatabaseTestEnvironment } from '@/config/database-environment'
import {
  parseWikidataAnimeCandidateManifest,
  reviewWikidataAnimeCandidate,
} from '@/features/anime/catalogue/wikidata-anime-import'
import type { WikidataEntity } from '@/integrations/wikidata/wikidata-entity'
import { readAnimeCatalogueSnapshot } from '@/server/database/prepare-wikidata-anime-import'
import {
  animeAlternativeTitles,
  animeCatalogueItems,
  animeCatalogueSources,
} from '@/server/database/schema'
import { assertSafeTestDatabaseName } from '@/test/database/global-setup'

const { databaseTestUrl } = readDatabaseTestEnvironment()
const pool = new Pool({ connectionString: databaseTestUrl })
const database = drizzle({ client: pool })

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

describe('readAnimeCatalogueSnapshot', () => {
  it('reads ordered parents, titles, and source ownership without changing rows', async () => {
    const id = randomUUID()
    await database.insert(animeCatalogueItems).values({
      id,
      englishTitle: 'Snapshot title',
      format: 'tv',
      releaseStatus: 'finished',
      releaseYear: 2020,
      episodeCount: 12,
      maturity: 'safe',
      catalogueState: 'draft',
    })
    await database.insert(animeAlternativeTitles).values([
      { catalogueItemId: id, title: 'Second', position: 1 },
      { catalogueItemId: id, title: 'First', position: 0 },
    ])
    await database.insert(animeCatalogueSources).values({
      catalogueItemId: id,
      sourceKey: 'wikidata',
      sourceItemId: 'Q1',
    })
    const rowsBefore = await pool.query(
      `select
        (select jsonb_agg(to_jsonb(i) order by i.id) from anime_catalogue_items i) as items,
        (select jsonb_agg(to_jsonb(a) order by a.id) from anime_alternative_titles a) as alternatives,
        (select jsonb_agg(to_jsonb(s) order by s.source_key, s.source_item_id) from anime_catalogue_sources s) as sources`,
    )

    await expect(readAnimeCatalogueSnapshot(database)).resolves.toEqual({
      items: [
        expect.objectContaining({
          id,
          titles: {
            english: 'Snapshot title',
            romaji: null,
            original: null,
            alternatives: ['First', 'Second'],
          },
          sources: [{ sourceKey: 'wikidata', sourceItemId: 'Q1' }],
        }),
      ],
    })

    const rowsAfter = await pool.query(
      `select
        (select jsonb_agg(to_jsonb(i) order by i.id) from anime_catalogue_items i) as items,
        (select jsonb_agg(to_jsonb(a) order by a.id) from anime_alternative_titles a) as alternatives,
        (select jsonb_agg(to_jsonb(s) order by s.source_key, s.source_item_id) from anime_catalogue_sources s) as sources`,
    )
    expect(rowsAfter.rows).toEqual(rowsBefore.rows)
  })

  it('supports source and duplicate classification from one consistent projection', async () => {
    const id = randomUUID()
    await database.insert(animeCatalogueItems).values({
      id,
      englishTitle: 'Snapshot title',
      format: 'tv',
      releaseStatus: 'finished',
      releaseYear: 2020,
      episodeCount: 12,
      maturity: 'safe',
      catalogueState: 'draft',
    })
    await database.insert(animeAlternativeTitles).values([
      { catalogueItemId: id, title: 'First', position: 0 },
      { catalogueItemId: id, title: 'Second', position: 1 },
    ])
    await database.insert(animeCatalogueSources).values({
      catalogueItemId: id,
      sourceKey: 'wikidata',
      sourceItemId: 'Q1',
    })
    const snapshot = await readAnimeCatalogueSnapshot(database)
    const sourceCandidate = parseWikidataAnimeCandidateManifest({
      version: 1,
      sourceKey: 'wikidata',
      candidates: [
        {
          catalogueItemId: id,
          sourceItemId: 'Q1',
          expectedEnglishLabel: 'Snapshot title',
          intent: 'create',
          overrides: {
            format: 'tv',
            releaseYear: 2020,
            episodeCount: 12,
            releaseStatus: 'finished',
            maturity: 'safe',
          },
        },
      ],
    }).candidates[0]!
    const sourceEntity: WikidataEntity = {
      id: 'Q1',
      type: 'item',
      labels: { en: { language: 'en', value: 'Snapshot title' } },
      aliases: {
        en: [
          { language: 'en', value: 'First' },
          { language: 'en', value: 'Second' },
        ],
      },
      claims: {
        P31: [
          {
            rank: 'normal',
            mainsnak: {
              snaktype: 'value',
              property: 'P31',
              datatype: 'wikibase-item',
              datavalue: {
                type: 'wikibase-entityid',
                value: { id: 'Q63952888', 'entity-type': 'item' },
              },
            },
          },
        ],
      },
    }

    expect(
      reviewWikidataAnimeCandidate(sourceCandidate, sourceEntity, snapshot, 0)
        .classification,
    ).toBe('existing-source-no-change')
    expect(
      reviewWikidataAnimeCandidate(
        sourceCandidate,
        {
          ...sourceEntity,
          labels: { en: { language: 'en', value: 'Provider changed title' } },
        },
        snapshot,
        0,
      ).classification,
    ).toBe('existing-source-differs')

    const duplicateCandidate = parseWikidataAnimeCandidateManifest({
      version: 1,
      sourceKey: 'wikidata',
      candidates: [
        {
          catalogueItemId: randomUUID(),
          sourceItemId: 'Q2',
          expectedEnglishLabel: 'First',
          intent: 'create',
          overrides: { format: 'tv', releaseYear: 2020 },
        },
      ],
    }).candidates[0]!
    const duplicateReview = reviewWikidataAnimeCandidate(
      duplicateCandidate,
      {
        ...sourceEntity,
        id: 'Q2',
        labels: { en: { language: 'en', value: 'First' } },
        aliases: {},
      },
      snapshot,
      0,
    )

    expect(duplicateReview.classification).toBe('blocked-potential-duplicate')
    expect(duplicateReview.matches[0]).toMatchObject({
      catalogueItemId: id,
      matchedTitles: ['First'],
    })
  })
})

import { asc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import {
  createAnimeReleaseCoverage,
  normalizedAnimeReleaseItemSha256,
  sha256Canonical,
  type AnimeReleaseBundle,
  type AnimeReleaseItem,
} from '@/features/anime/catalogue/anime-release-corpus'
import { readDatabaseTestEnvironment } from '@/config/database-environment'
import {
  ReleaseAnimeCatalogueSourceConflictError,
  planAnimeReleaseCatalogue,
  synchronizeAnimeReleaseCatalogue,
} from '@/server/database/release-anime-catalogue-loader'
import {
  animeAlternativeTitles,
  animeCatalogueItems,
  animeCatalogueSources,
} from '@/server/database/schema'
import { assertSafeTestDatabaseName } from '@/test/database/global-setup'

const { databaseTestUrl } = readDatabaseTestEnvironment()
const pool = new Pool({ connectionString: databaseTestUrl })
const database = drizzle({ client: pool })
const mutationTime = new Date('2026-07-26T00:00:00.000Z')
const releaseTransactionTimeoutMilliseconds = 30_000

async function insertUnlistedCatalogueItem(input: {
  id?: string
  sourceItemId?: string
  englishTitle?: string
}) {
  const id = input.id ?? '90000000-0000-4000-8000-000000000001'
  await database.insert(animeCatalogueItems).values({
    id,
    englishTitle: input.englishTitle ?? 'Unlisted preserved item',
    romajiTitle: null,
    originalTitle: null,
    format: 'movie',
    releaseStatus: 'finished',
    releaseYear: 2000,
    episodeCount: null,
    maturity: 'unknown',
    catalogueState: 'published',
    createdAt: mutationTime,
    updatedAt: mutationTime,
  })
  await database.insert(animeCatalogueSources).values({
    catalogueItemId: id,
    sourceKey: 'wikidata',
    sourceItemId: input.sourceItemId ?? 'Q900000001',
    firstSeenAt: mutationTime,
    lastSeenAt: mutationTime,
  })
  return id
}

function item(index: number): AnimeReleaseItem {
  return {
    id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    titles: {
      english: index < 25 ? null : `English ${index}`,
      romaji: index >= 25 && index < 50 ? null : `Romaji ${index}`,
      original: index >= 50 && index < 75 ? null : `Original ${index}`,
      alternatives: index < 150 ? [`Alternative ${index}`] : [],
    },
    format:
      index < 250
        ? 'tv'
        : index < 410
          ? 'movie'
          : index < 445
            ? 'ova'
            : index < 480
              ? 'ona'
              : 'special',
    releaseStatus:
      index < 400 ? 'finished' : index < 425 ? 'upcoming' : 'unknown',
    releaseYear:
      index < 20
        ? 1979
        : index < 75
          ? 1985
          : index < 150
            ? 1995
            : index < 250
              ? 2005
              : index < 380
                ? 2015
                : index < 490
                  ? 2022
                  : null,
    episodeCount: index < 100 ? null : 12,
    maturity:
      index < 25
        ? 'safe'
        : index < 75
          ? 'sensitive'
          : index < 486
            ? 'unknown'
            : 'adult',
    catalogueState:
      index < 446 || index >= 486
        ? 'published'
        : index < 471
          ? 'draft'
          : 'hidden',
    sources: [{ sourceKey: 'wikidata', sourceItemId: `Q${100_000 + index}` }],
  }
}

function maturityEvidenceFor(record: AnimeReleaseItem, index: number) {
  if (record.maturity === 'unknown') return []
  const ratingCode =
    record.maturity === 'safe'
      ? 'U'
      : record.maturity === 'sensitive'
        ? '12'
        : '18'
  return [
    {
      issuer: 'bbfc' as const,
      territory: 'GB' as const,
      ratingCode,
      mappedMaturity: record.maturity,
      scope: 'exact-work' as const,
      coveredEpisodeCount: null,
      evidenceUrl: `https://www.bbfc.co.uk/release/evidence-${index}`,
      classificationDate: null,
      acquisitionReview: 'approved' as const,
      independentReview: 'approved' as const,
    },
  ]
}

function statusEvidenceFor(record: AnimeReleaseItem): string[] {
  if (record.releaseStatus === 'unknown') return []
  if (record.releaseStatus === 'upcoming') {
    return ['P577|none', 'P580|normal|+2026-12-01T00:00:00Z|11', 'P582|none']
  }
  if (record.format === 'movie') {
    return ['P577|normal|+2020-01-01T00:00:00Z|11', 'P580|none', 'P582|none']
  }
  return [
    'P577|none',
    'P580|normal|+2020-01-01T00:00:00Z|11',
    'P582|normal|+2021-01-01T00:00:00Z|11',
  ]
}

function bundle(): AnimeReleaseBundle {
  const items = Array.from({ length: 500 }, (_, index) => item(index))
  const manifests = Array.from({ length: 20 }, (_, batchIndex) => ({
    version: 1 as const,
    sourceKey: 'wikidata' as const,
    release: 'anime-v1' as const,
    batch: batchIndex + 1,
    candidates: items
      .slice(batchIndex * 25, batchIndex * 25 + 25)
      .map((record) => ({
        catalogueItemId: record.id,
        sourceItemId: record.sources[0]!.sourceItemId,
        expectedEnglishLabel: record.titles.english ?? `Label ${record.id}`,
        intent: 'create' as const,
        catalogueState: record.catalogueState,
        overrides:
          record.maturity === 'unknown' && record.releaseStatus === 'unknown'
            ? {}
            : {
                ...(record.maturity === 'unknown'
                  ? {}
                  : { maturity: record.maturity }),
                ...(record.releaseStatus === 'unknown'
                  ? {}
                  : { releaseStatus: record.releaseStatus }),
              },
      })),
  }))
  const corpus = {
    schema: 'zedarchive.anime-release-corpus' as const,
    version: 1 as const,
    release: 1 as const,
    items,
  }
  const reviewLedger = {
    schema: 'zedarchive.anime-release-review' as const,
    version: 1 as const,
    release: 1 as const,
    items: items.map((record, index) => ({
      catalogueItemId: record.id,
      sourceItemId: record.sources[0]!.sourceItemId,
      normalizedItemSha256: normalizedAnimeReleaseItemSha256(record),
      outcome: 'approved' as const,
      acquisitionReview: 'approved' as const,
      independentReview: 'approved' as const,
      maturityClassification: 'zedarchive-curation' as const,
      maturityEvidence: maturityEvidenceFor(record, index),
      overrides: [
        ...(record.releaseStatus === 'unknown'
          ? []
          : [
              {
                category: 'release_status_correction' as const,
                providerValue: statusEvidenceFor(record),
                selectedValue: record.releaseStatus,
                rationale:
                  'Reviewed projected dates satisfy the release-status evidence profile.',
                normalizedItemSha256: normalizedAnimeReleaseItemSha256(record),
              },
            ]),
        ...(record.maturity === 'unknown'
          ? []
          : [
              {
                category: 'maturity_curation' as const,
                providerValue: null,
                selectedValue: record.maturity,
                rationale:
                  'Official classification evidence maps to the reviewed zedarchive maturity.',
                normalizedItemSha256: normalizedAnimeReleaseItemSha256(record),
              },
            ]),
      ],
    })),
  }
  const semanticSummary = {
    added: items.map((record) => ({
      catalogueItemId: record.id,
      sourceItemId: record.sources[0]!.sourceItemId,
      normalizedItemSha256: normalizedAnimeReleaseItemSha256(record),
    })),
    parentChanged: [],
    alternativesChanged: [],
    sourceChanged: [],
    stateChanged: [],
  }
  return {
    corpus,
    manifests,
    reviewLedger,
    index: {
      schema: 'zedarchive.anime-release-index',
      version: 1,
      release: 1,
      corpusSha256: sha256Canonical(corpus),
      predecessorCorpusSha256: null,
      coverage: createAnimeReleaseCoverage(items),
      manifests: manifests.map((manifest) => ({
        path: `data/imports/releases/anime-v1/batch-${String(manifest.batch).padStart(2, '0')}.json`,
        sha256: sha256Canonical(manifest),
      })),
      reviewLedgerSha256: sha256Canonical(reviewLedger),
      semanticSummarySha256: sha256Canonical(semanticSummary),
    },
  }
}

beforeAll(async () => {
  const result = await pool.query<{ databaseName: string }>(
    'select current_database() as "databaseName"',
  )
  assertSafeTestDatabaseName(result.rows[0]?.databaseName)
})

beforeEach(async () => {
  await pool.query(
    'truncate table anime_entries, anime_catalogue_sources, anime_alternative_titles, anime_catalogue_items restart identity cascade',
  )
})

afterEach(async () => {
  await pool.query(
    'truncate table anime_entries, anime_catalogue_sources, anime_alternative_titles, anime_catalogue_items restart identity cascade',
  )
})

afterAll(async () => {
  await pool.end()
})

describe('synchronizeAnimeReleaseCatalogue', () => {
  it(
    'inserts the complete release then permits an exact create replay without timestamp or child-ID churn',
    async () => {
      const release = bundle()
      await expect(
        synchronizeAnimeReleaseCatalogue(database, release, { mutationTime }),
      ).resolves.toEqual({ inserted: 500, updated: 0, unchanged: 0 })
      const id = release.corpus.items[0]!.id
      const before = {
        parent: await database
          .select()
          .from(animeCatalogueItems)
          .where(eq(animeCatalogueItems.id, id)),
        alternatives: await database
          .select()
          .from(animeAlternativeTitles)
          .where(eq(animeAlternativeTitles.catalogueItemId, id))
          .orderBy(asc(animeAlternativeTitles.position)),
      }
      await expect(
        synchronizeAnimeReleaseCatalogue(database, release, {
          mutationTime: new Date('2026-07-27T00:00:00.000Z'),
        }),
      ).resolves.toEqual({ inserted: 0, updated: 0, unchanged: 500 })
      expect({
        parent: await database
          .select()
          .from(animeCatalogueItems)
          .where(eq(animeCatalogueItems.id, id)),
        alternatives: await database
          .select()
          .from(animeAlternativeTitles)
          .where(eq(animeAlternativeTitles.catalogueItemId, id))
          .orderBy(asc(animeAlternativeTitles.position)),
      }).toEqual(before)
    },
    releaseTransactionTimeoutMilliseconds,
  )

  it(
    'refuses a create aggregate that already exists but differs, before writing it',
    async () => {
      const release = bundle()
      await synchronizeAnimeReleaseCatalogue(database, release, {
        mutationTime,
      })
      const id = release.corpus.items[0]!.id
      const secondId = release.corpus.items[1]!.id
      await database
        .update(animeCatalogueItems)
        .set({ englishTitle: 'Manual difference' })
        .where(eq(animeCatalogueItems.id, id))
      await database
        .update(animeCatalogueItems)
        .set({ englishTitle: 'Second manual difference' })
        .where(eq(animeCatalogueItems.id, secondId))
      await expect(
        planAnimeReleaseCatalogue(database, release),
      ).resolves.toEqual({
        inserted: 0,
        updated: 0,
        unchanged: 498,
        conflicts: 2,
      })
      await expect(
        synchronizeAnimeReleaseCatalogue(database, release),
      ).rejects.toEqual(new ReleaseAnimeCatalogueSourceConflictError())
      expect(
        (
          await database
            .select()
            .from(animeCatalogueItems)
            .where(eq(animeCatalogueItems.id, id))
        )[0]?.englishTitle,
      ).toBe('Manual difference')
    },
    releaseTransactionTimeoutMilliseconds,
  )

  it(
    'allows only reviewed link-existing convergence and preserves unrelated sources',
    async () => {
      const release = bundle()
      await synchronizeAnimeReleaseCatalogue(database, release, {
        mutationTime,
      })
      const first = release.corpus.items[0]!
      const manifest = release.manifests[0]!
      manifest.candidates[0]!.intent = 'link-existing'
      release.index.manifests[0] = {
        ...release.index.manifests[0]!,
        sha256: sha256Canonical(manifest),
      }
      await database
        .update(animeCatalogueItems)
        .set({ englishTitle: 'Reviewed correction target' })
        .where(eq(animeCatalogueItems.id, first.id))
      await database.insert(animeCatalogueSources).values({
        catalogueItemId: first.id,
        sourceKey: 'manual',
        sourceItemId: 'reviewed-local-note',
        firstSeenAt: mutationTime,
        lastSeenAt: mutationTime,
      })

      await expect(
        synchronizeAnimeReleaseCatalogue(database, release, {
          mutationTime: new Date('2026-07-27T00:00:00.000Z'),
        }),
      ).resolves.toEqual({ inserted: 0, updated: 1, unchanged: 499 })
      expect(
        await database
          .select()
          .from(animeCatalogueSources)
          .where(eq(animeCatalogueSources.catalogueItemId, first.id)),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sourceKey: 'manual',
            sourceItemId: 'reviewed-local-note',
          }),
        ]),
      )
    },
    releaseTransactionTimeoutMilliseconds,
  )

  it(
    'rejects a second Wikidata source on the same listed UUID without changing the aggregate',
    async () => {
      const release = bundle()
      await synchronizeAnimeReleaseCatalogue(database, release, {
        mutationTime,
      })
      const first = release.corpus.items[0]!
      const conflictingSourceTime = new Date('2026-07-26T12:00:00.000Z')
      await database.insert(animeCatalogueSources).values({
        catalogueItemId: first.id,
        sourceKey: 'wikidata',
        sourceItemId: 'Q999999999',
        firstSeenAt: conflictingSourceTime,
        lastSeenAt: conflictingSourceTime,
      })
      const before = {
        parent: await database
          .select()
          .from(animeCatalogueItems)
          .where(eq(animeCatalogueItems.id, first.id)),
        alternatives: await database
          .select()
          .from(animeAlternativeTitles)
          .where(eq(animeAlternativeTitles.catalogueItemId, first.id))
          .orderBy(asc(animeAlternativeTitles.position)),
        sources: await database
          .select()
          .from(animeCatalogueSources)
          .where(eq(animeCatalogueSources.catalogueItemId, first.id))
          .orderBy(
            asc(animeCatalogueSources.sourceKey),
            asc(animeCatalogueSources.sourceItemId),
          ),
      }

      await expect(
        planAnimeReleaseCatalogue(database, release),
      ).resolves.toEqual({
        inserted: 0,
        updated: 0,
        unchanged: 499,
        conflicts: 1,
      })
      await expect(
        synchronizeAnimeReleaseCatalogue(database, release, {
          mutationTime: new Date('2026-07-27T00:00:00.000Z'),
        }),
      ).rejects.toEqual(new ReleaseAnimeCatalogueSourceConflictError())
      expect({
        parent: await database
          .select()
          .from(animeCatalogueItems)
          .where(eq(animeCatalogueItems.id, first.id)),
        alternatives: await database
          .select()
          .from(animeAlternativeTitles)
          .where(eq(animeAlternativeTitles.catalogueItemId, first.id))
          .orderBy(asc(animeAlternativeTitles.position)),
        sources: await database
          .select()
          .from(animeCatalogueSources)
          .where(eq(animeCatalogueSources.catalogueItemId, first.id))
          .orderBy(
            asc(animeCatalogueSources.sourceKey),
            asc(animeCatalogueSources.sourceItemId),
          ),
      }).toEqual(before)
    },
    releaseTransactionTimeoutMilliseconds,
  )

  it(
    'rolls back every release write on the injected final-fingerprint failure',
    async () => {
      await expect(
        synchronizeAnimeReleaseCatalogue(database, bundle(), {
          mutationTime,
          failFinalFingerprint: true,
        }),
      ).rejects.toThrow('final fingerprint')
      expect(await database.select().from(animeCatalogueItems)).toEqual([])
    },
    releaseTransactionTimeoutMilliseconds,
  )

  it(
    'rolls back parent, alternative-title, and source writes after an injected mid-transaction failure',
    async () => {
      await expect(
        synchronizeAnimeReleaseCatalogue(database, bundle(), {
          mutationTime,
          failAfterItem: 250,
        }),
      ).rejects.toThrow('Injected release synchronization failure')
      expect(await database.select().from(animeCatalogueItems)).toEqual([])
      expect(await database.select().from(animeAlternativeTitles)).toEqual([])
      expect(await database.select().from(animeCatalogueSources)).toEqual([])
    },
    releaseTransactionTimeoutMilliseconds,
  )

  it(
    'rejects a preflight QID owned by another UUID without writing release rows',
    async () => {
      const release = bundle()
      const conflictingQid = release.corpus.items[0]!.sources[0]!.sourceItemId
      const unlistedId = await insertUnlistedCatalogueItem({
        sourceItemId: conflictingQid,
        englishTitle: 'Existing source owner',
      })

      await expect(
        synchronizeAnimeReleaseCatalogue(database, release, { mutationTime }),
      ).rejects.toEqual(new ReleaseAnimeCatalogueSourceConflictError())
      expect(await database.select().from(animeCatalogueItems)).toEqual([
        expect.objectContaining({
          id: unlistedId,
          englishTitle: 'Existing source owner',
        }),
      ])
      expect(await database.select().from(animeAlternativeTitles)).toEqual([])
      expect(await database.select().from(animeCatalogueSources)).toEqual([
        expect.objectContaining({
          catalogueItemId: unlistedId,
          sourceItemId: conflictingQid,
        }),
      ])
    },
    releaseTransactionTimeoutMilliseconds,
  )

  it(
    'preserves an unlisted catalogue aggregate during a successful release synchronization',
    async () => {
      const unlistedId = await insertUnlistedCatalogueItem({})

      await expect(
        synchronizeAnimeReleaseCatalogue(database, bundle(), { mutationTime }),
      ).resolves.toEqual({ inserted: 500, updated: 0, unchanged: 0 })
      const parents = await database.select().from(animeCatalogueItems)
      expect(parents).toHaveLength(501)
      expect(parents).toContainEqual(
        expect.objectContaining({
          id: unlistedId,
          englishTitle: 'Unlisted preserved item',
        }),
      )
      expect(
        await database
          .select()
          .from(animeCatalogueSources)
          .where(eq(animeCatalogueSources.catalogueItemId, unlistedId)),
      ).toEqual([
        expect.objectContaining({
          sourceItemId: 'Q900000001',
        }),
      ])
    },
    releaseTransactionTimeoutMilliseconds,
  )

  it(
    'converges exactly after an injected rollback is corrected and retried',
    async () => {
      const release = bundle()
      await expect(
        synchronizeAnimeReleaseCatalogue(database, release, {
          mutationTime,
          failAfterItem: 250,
        }),
      ).rejects.toThrow('Injected release synchronization failure')
      expect(await database.select().from(animeCatalogueItems)).toEqual([])

      await expect(
        synchronizeAnimeReleaseCatalogue(database, release, {
          mutationTime: new Date('2026-07-27T00:00:00.000Z'),
        }),
      ).resolves.toEqual({ inserted: 500, updated: 0, unchanged: 0 })
      expect(await database.select().from(animeCatalogueItems)).toHaveLength(
        500,
      )
      expect(await database.select().from(animeCatalogueSources)).toHaveLength(
        500,
      )
      expect(await database.select().from(animeAlternativeTitles)).toHaveLength(
        150,
      )
    },
    releaseTransactionTimeoutMilliseconds,
  )
})

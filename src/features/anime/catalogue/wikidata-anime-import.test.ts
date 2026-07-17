import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  loadAnimeCatalogueSeed,
  type AnimeCatalogueSeed,
} from '@/features/anime/catalogue/anime-catalogue-seed'
import {
  approvedWikidataAnimeCandidateQids,
  assertApprovedWikidataAnimeCandidateSet,
  createWikidataAnimeReviewArtifact,
  loadWikidataAnimeCandidateManifest,
  parseWikidataAnimeCandidateManifest,
  reviewWikidataAnimeCandidate,
  sha256,
  wikidataAnimeReviewArtifactSchema,
  type CatalogueSnapshot,
  type WikidataAnimeCandidateManifest,
} from '@/features/anime/catalogue/wikidata-anime-import'
import { wikidataImporterUserAgent } from '@/integrations/wikidata/wikidata-client'
import { parseWikidataEntityResponse } from '@/integrations/wikidata/wikidata-entity'

const manifestPath = resolve(
  process.cwd(),
  'data/imports/wikidata-anime-candidates.development.json',
)
const fixturePath = resolve(
  process.cwd(),
  'data/fixtures/wikidata/frieren-season-1.json',
)
const seedPath = resolve(
  process.cwd(),
  'data/seeds/anime-catalogue.development.json',
)
const emptySnapshot: CatalogueSnapshot = { items: [] }

let manifest: WikidataAnimeCandidateManifest
let seed: AnimeCatalogueSeed
let frierenEntity: ReturnType<
  typeof parseWikidataEntityResponse
>['entities'][string]

beforeAll(async () => {
  manifest = await loadWikidataAnimeCandidateManifest(manifestPath)
  seed = await loadAnimeCatalogueSeed(seedPath)
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as {
    response: unknown
  }
  frierenEntity = parseWikidataEntityResponse(fixture.response).entities
    .Q130377145
})

describe('Wikidata anime candidate manifest', () => {
  it('contains the exact approved 20-QID order and distinct Frieren seasons', () => {
    expect(manifest.candidates.map(({ sourceItemId }) => sourceItemId)).toEqual(
      approvedWikidataAnimeCandidateQids,
    )
    expect(() =>
      assertApprovedWikidataAnimeCandidateSet(manifest),
    ).not.toThrow()
    expect(manifest.candidates[0]?.catalogueItemId).not.toBe(
      manifest.candidates[1]?.catalogueItemId,
    )
  })

  it('maps every approved candidate one-to-one into the deterministic seed', () => {
    const importedItems = seed.items.slice(-manifest.candidates.length)
    expect(importedItems).toHaveLength(manifest.candidates.length)

    manifest.candidates.forEach((candidate, index) => {
      const item = importedItems[index]
      expect(item).toMatchObject({
        id: candidate.catalogueItemId,
        format: candidate.overrides.format,
        releaseStatus: candidate.overrides.releaseStatus,
        releaseYear: candidate.overrides.releaseYear,
        episodeCount: candidate.overrides.episodeCount,
        maturity: candidate.overrides.maturity,
        catalogueState: 'draft',
        sources: [
          {
            sourceKey: 'wikidata',
            sourceItemId: candidate.sourceItemId,
          },
        ],
      })
      expect(item?.titles.romaji).toBe(candidate.overrides.romajiTitle)
    })
  })

  it('preserves reviewed exclusions for misleading or excessively generic aliases', () => {
    const gunbusterCandidate = manifest.candidates.find(
      ({ sourceItemId }) => sourceItemId === 'Q1196284',
    )
    const gunbusterSeedItem = seed.items.find(
      ({ id }) => id === gunbusterCandidate?.catalogueItemId,
    )

    expect(gunbusterCandidate?.overrides.excludedAlternativeTitles).toEqual([
      'ハワイ県',
      'トップ!',
    ])
    expect(gunbusterSeedItem?.titles.alternatives).not.toEqual(
      expect.arrayContaining(['ハワイ県', 'トップ!']),
    )
  })

  it('keeps the Steins;Gate TV series separate from later special material', () => {
    const steinsGateCandidate = manifest.candidates.find(
      ({ sourceItemId }) => sourceItemId === 'Q20590069',
    )
    const steinsGateSeedItem = seed.items.find(
      ({ id }) => id === steinsGateCandidate?.catalogueItemId,
    )

    expect(steinsGateCandidate?.overrides.episodeCount).toBe(24)
    expect(steinsGateSeedItem?.episodeCount).toBe(24)
  })

  it('rejects empty, oversized, duplicate, malformed, and unexpected input', () => {
    const candidate = manifest.candidates[0]
    expect(() =>
      parseWikidataAnimeCandidateManifest({
        version: 1,
        sourceKey: 'wikidata',
        candidates: [],
      }),
    ).toThrow()
    expect(() =>
      parseWikidataAnimeCandidateManifest({
        version: 1,
        sourceKey: 'wikidata',
        candidates: Array.from({ length: 51 }, (_, index) => ({
          ...candidate,
          catalogueItemId:
            index === 0
              ? candidate.catalogueItemId
              : `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
          sourceItemId: `Q${index + 1}`,
        })),
      }),
    ).toThrow()
    expect(() =>
      parseWikidataAnimeCandidateManifest({
        version: 1,
        sourceKey: 'wikidata',
        candidates: [candidate, candidate],
      }),
    ).toThrow('Catalogue item IDs must be unique')
    expect(() =>
      parseWikidataAnimeCandidateManifest({
        version: 1,
        sourceKey: 'wikidata',
        candidates: [{ ...candidate, sourceItemId: 'q1' }],
      }),
    ).toThrow()
    expect(() =>
      parseWikidataAnimeCandidateManifest({
        version: 1,
        sourceKey: 'wikidata',
        candidates: [{ ...candidate, description: 'not allowed' }],
      }),
    ).toThrow()
  })
})

describe('Wikidata anime normalization and classification', () => {
  it('normalizes supported claims into the provider-neutral domain model', () => {
    const review = reviewWikidataAnimeCandidate(
      manifest.candidates[0]!,
      frierenEntity!,
      emptySnapshot,
      0,
    )

    expect(review.classification).toBe('ready-create')
    expect(review.proposedItem).toMatchObject({
      id: manifest.candidates[0]?.catalogueItemId,
      titles: {
        english: 'Frieren, season 1',
        romaji: 'Soso no Frieren, season 1',
        original: '葬送のフリーレン',
        alternatives: ['Frieren season 1'],
      },
      format: 'tv',
      releaseStatus: 'finished',
      releaseYear: 2023,
      episodeCount: 28,
      maturity: 'sensitive',
      catalogueState: 'draft',
    })
  })

  it('projects only consumed claim fields and removes references and URLs', () => {
    const entity = structuredClone(frierenEntity!)
    const statement = entity.claims.P1113?.[0] as Record<string, unknown>
    statement.references = [
      {
        snaks: {
          P854: [
            {
              datavalue: {
                type: 'string',
                value: 'https://example.invalid/provider-reference',
              },
            },
          ],
        },
      },
    ]

    const review = reviewWikidataAnimeCandidate(
      manifest.candidates[0]!,
      entity,
      emptySnapshot,
      0,
    )
    const serializedProjection = JSON.stringify(review.providerProjection)
    expect(serializedProjection).not.toContain('references')
    expect(serializedProjection).not.toContain('http')
    expect(serializedProjection).not.toContain('calendarmodel')
    expect(serializedProjection).not.toContain('hash')
  })

  it('uses exact normalized title overlap and compatible metadata only as a blocker', () => {
    const candidate = manifest.candidates[0]!
    const snapshot: CatalogueSnapshot = {
      items: [
        {
          id: '0652e18e-9316-43f8-b51f-a971c4cfdde9',
          titles: {
            english: 'Ｆｒｉｅｒｅｎ， ｓｅａｓｏｎ １',
            romaji: null,
            original: null,
            alternatives: [],
          },
          format: 'tv',
          releaseStatus: 'unknown',
          releaseYear: null,
          episodeCount: null,
          maturity: 'unknown',
          catalogueState: 'draft',
          sources: [],
        },
      ],
    }

    const review = reviewWikidataAnimeCandidate(
      candidate,
      frierenEntity!,
      snapshot,
      0,
    )
    expect(review.classification).toBe('blocked-potential-duplicate')
    expect(review.matches[0]?.catalogueItemId).toBe(snapshot.items[0]?.id)
  })

  it('blocks missing and unsupported provider identities', () => {
    const candidate = manifest.candidates[0]!
    expect(
      reviewWikidataAnimeCandidate(
        candidate,
        {
          id: candidate.sourceItemId,
          missing: true,
          labels: {},
          aliases: {},
          claims: {},
        },
        emptySnapshot,
        0,
      ).classification,
    ).toBe('blocked-invalid-provider-data')

    expect(
      reviewWikidataAnimeCandidate(
        candidate,
        {
          id: candidate.sourceItemId,
          type: 'item',
          labels: { en: { language: 'en', value: 'Wrong identity' } },
          aliases: {},
          claims: {},
        },
        emptySnapshot,
        0,
      ).classification,
    ).toBe('blocked-unsupported-identity')
  })

  it('constructs deterministic semantic artifacts and counts blockers', () => {
    const oneCandidateManifest = {
      ...manifest,
      candidates: [manifest.candidates[0]!],
    }
    const input = {
      generatedAt: new Date('2026-07-17T00:00:00.000Z'),
      manifestSha256: sha256('manifest'),
      snapshot: emptySnapshot,
      manifest: oneCandidateManifest,
      entities: { Q130377145: frierenEntity! },
    }
    const first = createWikidataAnimeReviewArtifact(input)
    const second = createWikidataAnimeReviewArtifact(input)

    expect(first).toEqual(second)
    expect(first.catalogueSnapshotSha256).toBe(
      sha256(JSON.stringify(emptySnapshot)),
    )
    expect(first.summary).toMatchObject({
      total: 1,
      blockers: 0,
      classifications: { 'ready-create': 1 },
    })
    expect(first.userAgent).toBe(wikidataImporterUserAgent)
  })

  it('rejects inconsistent summaries, altered user agents, and arbitrary projected claims', () => {
    const artifact = createWikidataAnimeReviewArtifact({
      generatedAt: new Date('2026-07-17T00:00:00.000Z'),
      manifestSha256: sha256('manifest'),
      snapshot: emptySnapshot,
      manifest: { ...manifest, candidates: [manifest.candidates[0]!] },
      entities: { Q130377145: frierenEntity! },
    })

    expect(() =>
      wikidataAnimeReviewArtifactSchema.parse({
        ...artifact,
        summary: { ...artifact.summary, total: 2 },
      }),
    ).toThrow('summary total')
    expect(() =>
      wikidataAnimeReviewArtifactSchema.parse({
        ...artifact,
        userAgent: 'unreviewed-agent',
      }),
    ).toThrow()

    const arbitraryClaimsArtifact = structuredClone(artifact) as unknown as {
      candidates: Array<{
        providerProjection: { claims: Record<string, unknown> }
      }>
    }
    arbitraryClaimsArtifact.candidates[0]!.providerProjection.claims.P999 = [
      { raw: 'unrelated provider data' },
    ]
    expect(() =>
      wikidataAnimeReviewArtifactSchema.parse(arbitraryClaimsArtifact),
    ).toThrow()
  })

  it('changes the catalogue fingerprint when comparison data changes', () => {
    const oneCandidateManifest = {
      ...manifest,
      candidates: [manifest.candidates[0]!],
    }
    const base = {
      generatedAt: new Date('2026-07-17T00:00:00.000Z'),
      manifestSha256: sha256('manifest'),
      manifest: oneCandidateManifest,
      entities: { Q130377145: frierenEntity! },
    }
    const emptyArtifact = createWikidataAnimeReviewArtifact({
      ...base,
      snapshot: emptySnapshot,
    })
    const changedArtifact = createWikidataAnimeReviewArtifact({
      ...base,
      snapshot: {
        items: [
          {
            id: '0652e18e-9316-43f8-b51f-a971c4cfdde9',
            titles: {
              english: 'Unrelated',
              romaji: null,
              original: null,
              alternatives: [],
            },
            format: 'movie',
            releaseStatus: 'unknown',
            releaseYear: null,
            episodeCount: null,
            maturity: 'unknown',
            catalogueState: 'draft',
            sources: [],
          },
        ],
      },
    })
    expect(changedArtifact.catalogueSnapshotSha256).not.toBe(
      emptyArtifact.catalogueSnapshotSha256,
    )
  })
})

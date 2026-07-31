import { describe, expect, it } from 'vitest'
import {
  animeReleaseDescriptors,
  canonicalJsonBytes,
  animeReleaseMaturityEvidenceSchema,
  animeReleaseV2Descriptor,
  createAnimeReleaseCoverage,
  normalizedAnimeReleaseItemSha256,
  sha256Canonical,
  validateAnimeReleaseBundle,
  validateAnimeReleaseBundleForDescriptor,
  validateAnimeReleaseV2Bundle,
  type AnimeReleaseBundle,
  type AnimeReleaseItem,
  type AnimeReleaseV2Bundle,
} from '@/features/anime/catalogue/anime-release-corpus'

type ReleaseFixtureOptions = {
  adultStart?: number
  publishedPrefixLength?: number
  publishedSuffixStart?: number
}

function releaseItem(
  index: number,
  {
    adultStart = 486,
    publishedPrefixLength = 446,
    publishedSuffixStart = 486,
  }: ReleaseFixtureOptions = {},
): AnimeReleaseItem {
  const id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
  return {
    id,
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
          : index < adultStart
            ? 'unknown'
            : 'adult',
    catalogueState:
      index < publishedPrefixLength || index >= publishedSuffixStart
        ? 'published'
        : index < publishedPrefixLength + 25
          ? 'draft'
          : 'hidden',
    sources: [{ sourceKey: 'wikidata', sourceItemId: `Q${index + 1}` }],
  }
}

function maturityEvidenceFor(item: AnimeReleaseItem, index: number) {
  if (item.maturity === 'unknown') return []
  const ratingCode =
    item.maturity === 'safe' ? 'U' : item.maturity === 'sensitive' ? '12' : '18'
  return [
    {
      issuer: 'bbfc' as const,
      territory: 'GB' as const,
      ratingCode,
      mappedMaturity: item.maturity,
      scope: 'exact-work' as const,
      coveredEpisodeCount: null,
      evidenceUrl: `https://www.bbfc.co.uk/release/evidence-${index}`,
      classificationDate: null,
      acquisitionReview: 'approved' as const,
      independentReview: 'approved' as const,
    },
  ]
}

function statusEvidenceFor(item: AnimeReleaseItem): string[] {
  if (item.releaseStatus === 'unknown') return []
  if (item.releaseStatus === 'upcoming') {
    return ['P577|none', 'P580|normal|+2026-12-01T00:00:00Z|11', 'P582|none']
  }
  if (item.format === 'movie') {
    return ['P577|normal|+2020-01-01T00:00:00Z|11', 'P580|none', 'P582|none']
  }
  return [
    'P577|none',
    'P580|normal|+2020-01-01T00:00:00Z|11',
    'P582|normal|+2021-01-01T00:00:00Z|11',
  ]
}

function initialSemanticSummary(items: readonly AnimeReleaseItem[]) {
  return {
    added: items.map((item) => ({
      catalogueItemId: item.id,
      sourceItemId: item.sources[0]!.sourceItemId,
      normalizedItemSha256: normalizedAnimeReleaseItemSha256(item),
    })),
    parentChanged: [],
    alternativesChanged: [],
    sourceChanged: [],
    stateChanged: [],
  }
}

function releaseBundle(
  fixtureOptions: ReleaseFixtureOptions = {},
): AnimeReleaseBundle {
  const items = Array.from({ length: 500 }, (_, index) =>
    releaseItem(index, fixtureOptions),
  )
  const manifests = Array.from({ length: 20 }, (_, batchIndex) => ({
    version: 1 as const,
    sourceKey: 'wikidata' as const,
    release: 'anime-v1' as const,
    batch: batchIndex + 1,
    candidates: items
      .slice(batchIndex * 25, batchIndex * 25 + 25)
      .map((item) => ({
        catalogueItemId: item.id,
        sourceItemId: item.sources[0]!.sourceItemId,
        expectedEnglishLabel: item.titles.english ?? `Label ${item.id}`,
        intent: 'create' as const,
        catalogueState: item.catalogueState,
        overrides:
          item.maturity === 'unknown' && item.releaseStatus === 'unknown'
            ? {}
            : {
                ...(item.maturity === 'unknown'
                  ? {}
                  : { maturity: item.maturity }),
                ...(item.releaseStatus === 'unknown'
                  ? {}
                  : { releaseStatus: item.releaseStatus }),
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
    items: items.map((item, index) => ({
      catalogueItemId: item.id,
      sourceItemId: item.sources[0]!.sourceItemId,
      normalizedItemSha256: normalizedAnimeReleaseItemSha256(item),
      outcome: 'approved' as const,
      acquisitionReview: 'approved' as const,
      independentReview: 'approved' as const,
      maturityClassification: 'zedarchive-curation' as const,
      maturityEvidence: maturityEvidenceFor(item, index),
      overrides: [
        ...(item.releaseStatus === 'unknown'
          ? []
          : [
              {
                category: 'release_status_correction' as const,
                providerValue: statusEvidenceFor(item),
                selectedValue: item.releaseStatus,
                rationale:
                  'Reviewed projected dates satisfy the release-status evidence profile.',
                normalizedItemSha256: normalizedAnimeReleaseItemSha256(item),
              },
            ]),
        ...(item.maturity === 'unknown'
          ? []
          : [
              {
                category: 'maturity_curation' as const,
                providerValue: null,
                selectedValue: item.maturity,
                rationale:
                  'Official classification evidence maps to the reviewed zedarchive maturity.',
                normalizedItemSha256: normalizedAnimeReleaseItemSha256(item),
              },
            ]),
      ],
    })),
  }
  const summary = initialSemanticSummary(items)
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
      semanticSummarySha256: sha256Canonical(summary),
    },
  }
}

function releaseV2Bundle(): AnimeReleaseV2Bundle {
  const items = Array.from({ length: 5001 }, (_, index) => ({
    ...releaseItem(index),
    catalogueState:
      index === 5000 ? ('draft' as const) : ('published' as const),
  }))
  const manifests = Array.from(
    { length: Math.ceil(items.length / 50) },
    (_, batchIndex) => ({
      version: 2 as const,
      sourceKey: 'wikidata' as const,
      release: 'anime-v2' as const,
      batch: batchIndex + 1,
      candidates: items
        .slice(batchIndex * 50, batchIndex * 50 + 50)
        .map((item) => ({
          catalogueItemId: item.id,
          sourceItemId: item.sources[0]!.sourceItemId,
          expectedEnglishLabel: item.titles.english ?? `Label ${item.id}`,
          intent: 'create' as const,
          catalogueState: item.catalogueState,
          overrides: {},
        })),
    }),
  )
  const corpus = {
    schema: 'zedarchive.anime-release-corpus' as const,
    version: 2 as const,
    release: 2 as const,
    items,
  }
  const ledgerItems = items.map((item) => ({
    catalogueItemId: item.id,
    sourceItemId: item.sources[0]!.sourceItemId,
    normalizedItemSha256: normalizedAnimeReleaseItemSha256(item),
  }))
  const reviewLedger = {
    schema: 'zedarchive.anime-release-review' as const,
    version: 2 as const,
    release: 2 as const,
    items: ledgerItems,
  }
  const discoveryLedger = {
    schema: 'zedarchive.anime-release-discovery' as const,
    version: 2 as const,
    release: 2 as const,
    items: ledgerItems,
  }
  const semanticDiff = {
    schema: 'zedarchive.anime-release-diff' as const,
    version: 2 as const,
    release: 2 as const,
  }
  return {
    corpus,
    manifests,
    reviewLedger,
    discoveryLedger,
    semanticDiff,
    index: {
      schema: 'zedarchive.anime-release-index' as const,
      version: 2 as const,
      release: 2 as const,
      corpusSha256: sha256Canonical(corpus),
      predecessorCorpusSha256: 'a'.repeat(64),
      predecessorReviewLedgerSha256: 'b'.repeat(64),
      predecessorIndexSha256: 'c'.repeat(64),
      manifests: manifests.map((manifest) => ({
        path: `data/imports/releases/anime-v2/batch-${String(manifest.batch).padStart(3, '0')}.json`,
        sha256: sha256Canonical(manifest),
      })),
      reviewLedgerSha256: sha256Canonical(reviewLedger),
      discoveryLedgerSha256: sha256Canonical(discoveryLedger),
      semanticDiffSha256: sha256Canonical(semanticDiff),
    },
  }
}

function setReleaseStatus(
  bundle: AnimeReleaseBundle,
  index: number,
  releaseStatus: AnimeReleaseItem['releaseStatus'],
) {
  const item = bundle.corpus.items[index]!
  const review = bundle.reviewLedger.items[index]!
  const manifestCandidate =
    bundle.manifests[Math.floor(index / 25)]!.candidates[index % 25]!
  item.releaseStatus = releaseStatus
  if (releaseStatus === 'unknown') {
    delete manifestCandidate.overrides.releaseStatus
    review.overrides = review.overrides.filter(
      ({ category }) => category !== 'release_status_correction',
    )
  } else {
    manifestCandidate.overrides.releaseStatus = releaseStatus
    const statusOverride = review.overrides.find(
      ({ category }) => category === 'release_status_correction',
    )
    if (statusOverride === undefined) {
      review.overrides.unshift({
        category: 'release_status_correction',
        providerValue: statusEvidenceFor(item),
        selectedValue: releaseStatus,
        rationale:
          'Reviewed projected dates satisfy the release-status evidence profile.',
        normalizedItemSha256: normalizedAnimeReleaseItemSha256(item),
      })
    } else {
      statusOverride.providerValue = statusEvidenceFor(item)
      statusOverride.selectedValue = releaseStatus
    }
  }
  review.normalizedItemSha256 = normalizedAnimeReleaseItemSha256(item)
  review.overrides.forEach((override) => {
    override.normalizedItemSha256 = review.normalizedItemSha256
  })
  bundle.index.manifests[Math.floor(index / 25)] = {
    ...bundle.index.manifests[Math.floor(index / 25)]!,
    sha256: sha256Canonical(bundle.manifests[Math.floor(index / 25)]),
  }
  bundle.index.coverage = createAnimeReleaseCoverage(bundle.corpus.items)
  bundle.index.corpusSha256 = sha256Canonical(bundle.corpus)
  bundle.index.reviewLedgerSha256 = sha256Canonical(bundle.reviewLedger)
}

describe('anime release corpus contract', () => {
  it('makes every supported release explicit while retaining v1 historical limits', () => {
    expect(animeReleaseDescriptors).toEqual([
      expect.objectContaining({
        name: 'anime-v1',
        version: 1,
        expected: expect.objectContaining({
          exactItemCount: 500,
          predecessor: null,
          manifest: {
            exactCount: 20,
            batchSize: 25,
            finalBatchMayBeShort: false,
          },
        }),
      }),
      expect.objectContaining({
        name: 'anime-v2',
        version: 2,
        supportedModes: ['check'],
        expected: expect.objectContaining({
          exactPublishedCount: 5000,
          predecessor: 'anime-v1',
          manifest: expect.objectContaining({
            batchSize: 50,
            finalBatchMayBeShort: true,
          }),
        }),
      }),
    ])
  })

  it('accepts a v2 variable-total bundle with exactly 5,000 published records and a final short manifest', () => {
    const bundle = releaseV2Bundle()

    expect(validateAnimeReleaseV2Bundle(bundle)).toEqual(bundle)
    expect(
      validateAnimeReleaseBundleForDescriptor(animeReleaseV2Descriptor, bundle),
    ).toEqual(bundle)
    expect(bundle.manifests).toHaveLength(101)
    expect(bundle.manifests.at(-1)?.candidates).toHaveLength(1)
  })

  it('rejects v2 non-final short manifests and descriptor/version mismatches', () => {
    const shortMiddleManifest = releaseV2Bundle()
    shortMiddleManifest.manifests[0]!.candidates.pop()

    expect(() => validateAnimeReleaseV2Bundle(shortMiddleManifest)).toThrow(
      'short manifest only in the final batch',
    )
    expect(() =>
      validateAnimeReleaseBundleForDescriptor(
        animeReleaseV2Descriptor,
        releaseBundle() as never,
      ),
    ).toThrow('version does not match')
  })

  it('rejects v2 wrong publication count, predecessor binding, and manifest path', () => {
    const wrongPublishedCount = releaseV2Bundle()
    wrongPublishedCount.corpus.items[5000]!.catalogueState = 'published'
    expect(() => validateAnimeReleaseV2Bundle(wrongPublishedCount)).toThrow(
      'exactly 5,000 published',
    )

    const missingPredecessor = releaseV2Bundle()
    missingPredecessor.index.predecessorCorpusSha256 = null as never
    expect(() => validateAnimeReleaseV2Bundle(missingPredecessor)).toThrow()

    const wrongManifestPath = releaseV2Bundle()
    wrongManifestPath.index.manifests[0]!.path =
      'data/imports/releases/anime-v2/batch-01.json'
    expect(() => validateAnimeReleaseV2Bundle(wrongManifestPath)).toThrow()
  })

  it('rejects unknown or raw fields at every v2 artifact boundary', () => {
    const unknownCorpusField = releaseV2Bundle()
    ;(unknownCorpusField.corpus as Record<string, unknown>).rawPayload = {}
    expect(() => validateAnimeReleaseV2Bundle(unknownCorpusField)).toThrow()

    const unknownManifestField = releaseV2Bundle()
    ;(
      unknownManifestField.manifests[0]!.candidates[0] as Record<
        string,
        unknown
      >
    ).rawPayload = {}
    expect(() => validateAnimeReleaseV2Bundle(unknownManifestField)).toThrow()

    const unknownReviewField = releaseV2Bundle()
    ;(unknownReviewField.reviewLedger.items[0] as Record<string, unknown>).raw =
      'provider payload'
    expect(() => validateAnimeReleaseV2Bundle(unknownReviewField)).toThrow()

    const unknownDiscoveryField = releaseV2Bundle()
    ;(unknownDiscoveryField.discoveryLedger as Record<string, unknown>).notes =
      'reviewer prose'
    expect(() => validateAnimeReleaseV2Bundle(unknownDiscoveryField)).toThrow()

    const unknownDiffField = releaseV2Bundle()
    ;(unknownDiffField.semanticDiff as Record<string, unknown>).details =
      'unbounded change history'
    expect(() => validateAnimeReleaseV2Bundle(unknownDiffField)).toThrow()

    const unknownIndexField = releaseV2Bundle()
    ;(unknownIndexField.index as Record<string, unknown>).rawResponse = {
      claims: [],
    }
    expect(() => validateAnimeReleaseV2Bundle(unknownIndexField)).toThrow()
  })

  it('validates the exact quota package and deterministic canonical hashes', () => {
    const bundle = releaseBundle()
    expect(validateAnimeReleaseBundle(bundle)).toEqual(bundle)
    expect(bundle.index.coverage.statuses).toEqual({
      finished: 400,
      airing: 0,
      upcoming: 25,
      unknown: 75,
    })
    expect(canonicalJsonBytes({ b: [2, 1], a: { d: true, c: null } })).toBe(
      '{"a":{"c":null,"d":true},"b":[2,1]}\n',
    )
  })

  it('requires the version-one predecessor corpus hash to be null', () => {
    const bundle = releaseBundle()
    bundle.index.predecessorCorpusSha256 = 'a'.repeat(64) as never

    expect(() => validateAnimeReleaseBundle(bundle)).toThrow()
  })

  it('requires lowercase canonical UUID text at every release artifact boundary', () => {
    const uppercaseUuid = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'
    const corpusBundle = releaseBundle()
    corpusBundle.corpus.items[0]!.id = uppercaseUuid
    expect(() => validateAnimeReleaseBundle(corpusBundle)).toThrow(
      'canonical lowercase',
    )

    const manifestBundle = releaseBundle()
    manifestBundle.manifests[0]!.candidates[0]!.catalogueItemId = uppercaseUuid
    expect(() => validateAnimeReleaseBundle(manifestBundle)).toThrow(
      'canonical lowercase',
    )

    const reviewBundle = releaseBundle()
    reviewBundle.reviewLedger.items[0]!.catalogueItemId = uppercaseUuid
    expect(() => validateAnimeReleaseBundle(reviewBundle)).toThrow(
      'canonical lowercase',
    )
  })

  it('rejects case-only duplicate UUID text across manifest batches', () => {
    const bundle = releaseBundle()
    bundle.manifests[0]!.candidates[0]!.catalogueItemId =
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    bundle.manifests[1]!.candidates[0]!.catalogueItemId =
      'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'

    expect(() => validateAnimeReleaseBundle(bundle)).toThrow(
      'canonical lowercase',
    )
  })

  it('binds caller manifest positions to their exact batch numbers', () => {
    const bundle = releaseBundle()
    const manifests =
      bundle.manifests as AnimeReleaseBundle['manifests'][number][]
    ;[manifests[0], manifests[1]] = [manifests[1]!, manifests[0]!]

    const firstCorpusBatch = bundle.corpus.items.slice(0, 25)
    const secondCorpusBatch = bundle.corpus.items.slice(25, 50)
    bundle.corpus.items.splice(0, 50, ...secondCorpusBatch, ...firstCorpusBatch)
    const firstReviewBatch = bundle.reviewLedger.items.slice(0, 25)
    const secondReviewBatch = bundle.reviewLedger.items.slice(25, 50)
    bundle.reviewLedger.items.splice(
      0,
      50,
      ...secondReviewBatch,
      ...firstReviewBatch,
    )
    bundle.index.corpusSha256 = sha256Canonical(bundle.corpus)
    bundle.index.reviewLedgerSha256 = sha256Canonical(bundle.reviewLedger)
    bundle.index.semanticSummarySha256 = sha256Canonical(
      initialSemanticSummary(bundle.corpus.items),
    )

    expect(() => validateAnimeReleaseBundle(bundle)).toThrow(
      'manifest order must match batch positions',
    )
  })

  it('rejects any airing record under the evidence-backed status profile', () => {
    const bundle = releaseBundle()
    setReleaseStatus(bundle, 425, 'airing')
    expect(() => validateAnimeReleaseBundle(bundle)).toThrow(
      'Release status evidence',
    )
  })

  it('accepts bounded finished, exact movie publication-finished, and upcoming evidence', () => {
    const bundle = releaseBundle()
    const validated = validateAnimeReleaseBundle(bundle)
    expect(validated.corpus.items[0]).toMatchObject({
      format: 'tv',
      releaseStatus: 'finished',
    })
    expect(validated.corpus.items[250]).toMatchObject({
      format: 'movie',
      releaseStatus: 'finished',
    })
    expect(validated.corpus.items[400]!.releaseStatus).toBe('upcoming')
  })

  it('rejects forged or incomplete status evidence tokens', () => {
    const bundle = releaseBundle()
    const statusOverride = bundle.reviewLedger.items[0]!.overrides.find(
      ({ category }) => category === 'release_status_correction',
    )!
    statusOverride.providerValue = ['P582|normal|+2021-01-01T00:00:00Z|11']
    bundle.index.reviewLedgerSha256 = sha256Canonical(bundle.reviewLedger)
    expect(() => validateAnimeReleaseBundle(bundle)).toThrow(
      'Release status evidence is invalid',
    )
  })

  it('rejects conflicting projected dates for a finished status', () => {
    const bundle = releaseBundle()
    const statusOverride = bundle.reviewLedger.items[0]!.overrides.find(
      ({ category }) => category === 'release_status_correction',
    )!
    statusOverride.providerValue = [
      'P577|none',
      'P580|normal|+2026-12-01T00:00:00Z|11',
      'P582|normal|+2021-01-01T00:00:00Z|11',
    ]
    bundle.index.reviewLedgerSha256 = sha256Canonical(bundle.reviewLedger)
    expect(() => validateAnimeReleaseBundle(bundle)).toThrow(
      'Finished release status evidence is conflicting or insufficient',
    )
  })

  it('accepts a complete canonical status projection with more than 12 tokens', () => {
    const bundle = releaseBundle()
    const movieIndex = 250
    const statusOverride = bundle.reviewLedger.items[
      movieIndex
    ]!.overrides.find(
      ({ category }) => category === 'release_status_correction',
    )!
    statusOverride.providerValue = [
      ...Array.from(
        { length: 13 },
        (_, index) =>
          `P577|normal|+2020-01-${String(index + 1).padStart(2, '0')}T00:00:00Z|11`,
      ),
      'P580|none',
      'P582|none',
    ]
    bundle.index.reviewLedgerSha256 = sha256Canonical(bundle.reviewLedger)

    expect(validateAnimeReleaseBundle(bundle)).toEqual(bundle)
  })

  it('rejects wrong non-airing release-status totals', () => {
    const wrongFinishedTotal = releaseBundle()
    setReleaseStatus(wrongFinishedTotal, 399, 'unknown')
    expect(() => validateAnimeReleaseBundle(wrongFinishedTotal)).toThrow(
      'Release status quota is invalid',
    )

    const wrongUpcomingTotal = releaseBundle()
    setReleaseStatus(wrongUpcomingTotal, 400, 'unknown')
    expect(() => validateAnimeReleaseBundle(wrongUpcomingTotal)).toThrow(
      'Release status quota is invalid',
    )
  })

  it('rejects 13 or 15 adult records', () => {
    expect(() =>
      validateAnimeReleaseBundle(releaseBundle({ adultStart: 487 })),
    ).toThrow('Release maturity coverage is invalid')
    expect(() =>
      validateAnimeReleaseBundle(releaseBundle({ adultStart: 485 })),
    ).toThrow('Release maturity coverage is invalid')
  })

  it('rejects an otherwise exact adult total with the wrong published cross-tab', () => {
    expect(() =>
      validateAnimeReleaseBundle(
        releaseBundle({
          publishedPrefixLength: 447,
          publishedSuffixStart: 487,
        }),
      ),
    ).toThrow('Release adult publication quota is invalid')
  })

  it('rejects a post-2026 v1 release year rather than silently counting it as 2020s', () => {
    const item = releaseItem(0)
    item.releaseYear = 2027
    expect(() => createAnimeReleaseCoverage([item])).toThrow('after 2026')
  })

  it('accepts only reviewed issuer evidence that maps exactly to the selected maturity', () => {
    const safeEvidence = maturityEvidenceFor(releaseItem(0), 0)[0]!
    expect(animeReleaseMaturityEvidenceSchema.parse(safeEvidence)).toEqual(
      safeEvidence,
    )
    expect(() =>
      animeReleaseMaturityEvidenceSchema.parse({
        ...safeEvidence,
        ratingCode: '18',
      }),
    ).toThrow('issuer, territory, code, and mapped maturity')
    expect(() =>
      animeReleaseMaturityEvidenceSchema.parse({
        ...safeEvidence,
        evidenceUrl: `${safeEvidence.evidenceUrl}?private=1`,
      }),
    ).toThrow('canonical allowlisted HTTPS')
    expect(() =>
      animeReleaseMaturityEvidenceSchema.parse({
        ...safeEvidence,
        evidenceUrl: 'https://www.bbfc.co.uk:443/release/evidence-0',
      }),
    ).toThrow('canonical allowlisted HTTPS')
    expect(() =>
      animeReleaseMaturityEvidenceSchema.parse({
        ...safeEvidence,
        evidenceUrl: 'https://www.bbfc.co.uk/classification/evidence-0',
      }),
    ).toThrow('canonical allowlisted HTTPS')
    expect(() =>
      animeReleaseMaturityEvidenceSchema.parse({
        ...safeEvidence,
        scope: 'complete-episode-set',
        coveredEpisodeCount: null,
      }),
    ).toThrow('scope and covered episode count')
    for (const unestablishedRecordEvidence of [
      {
        ...safeEvidence,
        issuer: 'australian-classification' as const,
        territory: 'AU' as const,
        ratingCode: 'PG',
        evidenceUrl:
          'https://www.classification.gov.au/classification-ratings/what-are-ratings',
      },
      {
        ...safeEvidence,
        issuer: 'australian-classification' as const,
        territory: 'AU' as const,
        ratingCode: 'PG',
        evidenceUrl: 'https://www.classification.gov.au/about-us',
      },
      {
        ...safeEvidence,
        issuer: 'australian-classification' as const,
        territory: 'AU' as const,
        ratingCode: 'PG',
        evidenceUrl:
          'https://www.classification.gov.au/titles/fabricated-record',
      },
      {
        ...safeEvidence,
        issuer: 'eirin' as const,
        territory: 'JP' as const,
        ratingCode: 'PG12',
        mappedMaturity: 'sensitive' as const,
        evidenceUrl: 'https://www.eirin.jp/english/008.html',
      },
      {
        ...safeEvidence,
        issuer: 'eirin' as const,
        territory: 'JP' as const,
        ratingCode: 'PG12',
        mappedMaturity: 'sensitive' as const,
        evidenceUrl: 'https://www.eirin.jp/about.html',
      },
      {
        ...safeEvidence,
        issuer: 'eirin' as const,
        territory: 'JP' as const,
        ratingCode: 'PG12',
        mappedMaturity: 'sensitive' as const,
        evidenceUrl: 'https://www.eirin.jp/evidence/pg12',
        classificationDate: '2026-07-26',
      },
    ]) {
      expect(() =>
        animeReleaseMaturityEvidenceSchema.parse(unestablishedRecordEvidence),
      ).toThrow('canonical allowlisted HTTPS')
    }

    const ifcoEvidence = {
      ...safeEvidence,
      issuer: 'ifco' as const,
      territory: 'IE' as const,
      ratingCode: '18',
      mappedMaturity: 'adult' as const,
      evidenceUrl: 'https://www.ifco.ie/en/ifco/pages/0123456789ABCDEF',
    }
    expect(animeReleaseMaturityEvidenceSchema.parse(ifcoEvidence)).toEqual(
      ifcoEvidence,
    )

    for (const invalidIfcoEvidence of [
      { evidenceUrl: 'https://www.ifco.ie/en/ifco/pages/0123456789abcdef' },
      { evidenceUrl: 'https://www.ifco.ie/en/ifco/pages/0123456789ABCDE' },
      { evidenceUrl: 'https://www.ifco.ie/en/ifco/page/0123456789ABCDEF' },
      {
        evidenceUrl:
          'https://www.ifco.ie/en/ifco/pages/0123456789ABCDEF?source=release',
      },
      {
        evidenceUrl:
          'https://www.ifco.ie/en/ifco/pages/0123456789ABCDEF#evidence',
      },
      {
        evidenceUrl:
          'https://classification.gov.au/en/ifco/pages/0123456789ABCDEF',
      },
      {
        evidenceUrl: 'https://ifco.ie/en/ifco/pages/0123456789ABCDEF',
      },
      {
        evidenceUrl: 'https://www.ifco.ie:8443/en/ifco/pages/0123456789ABCDEF',
      },
      {
        evidenceUrl: 'https://www.ifco.ie/en/ifco/pages/0123456789ABCDEF/',
      },
      { territory: 'GB' },
      { mappedMaturity: 'sensitive' },
      { ratingCode: 'R18' },
    ]) {
      expect(() =>
        animeReleaseMaturityEvidenceSchema.parse({
          ...ifcoEvidence,
          ...invalidIfcoEvidence,
        }),
      ).toThrow()
    }
  })

  it('rejects reordered corpus, omitted review records, and raw override structures', () => {
    const reordered = releaseBundle()
    reordered.corpus.items.reverse()
    expect(() => validateAnimeReleaseBundle(reordered)).toThrow('corpus order')

    const missingReview = releaseBundle()
    missingReview.reviewLedger.items.pop()
    expect(() => validateAnimeReleaseBundle(missingReview)).toThrow()

    const rawOverride = releaseBundle()
    rawOverride.reviewLedger.items[0]!.overrides.push({
      category: 'alternative_title_exclusion',
      providerValue: ['Provider'],
      selectedValue: [],
      rationale: 'Reviewed alias is not this work.',
      normalizedItemSha256:
        rawOverride.reviewLedger.items[0]!.normalizedItemSha256,
    })
    expect(() => validateAnimeReleaseBundle(rawOverride)).toThrow()
  })

  it('requires ledger override values to match both scalar and excluded-title manifest values', () => {
    const scalarMismatch = releaseBundle()
    const scalarCandidate = scalarMismatch.manifests[0]!.candidates[0]!
    scalarCandidate.overrides.romajiTitle = 'Reviewed Romaji'
    scalarMismatch.index.manifests[0] = {
      ...scalarMismatch.index.manifests[0]!,
      sha256: sha256Canonical(scalarMismatch.manifests[0]),
    }
    scalarMismatch.reviewLedger.items[0]!.overrides.push({
      category: 'romaji_title_missing',
      providerValue: null,
      selectedValue: 'Wrong Romaji',
      rationale: 'The reviewed provider projection supplied a Romanized title.',
      normalizedItemSha256:
        scalarMismatch.reviewLedger.items[0]!.normalizedItemSha256,
    })
    scalarMismatch.index.reviewLedgerSha256 = sha256Canonical(
      scalarMismatch.reviewLedger,
    )
    expect(() => validateAnimeReleaseBundle(scalarMismatch)).toThrow(
      'override values',
    )

    const exclusionMismatch = releaseBundle()
    const exclusionCandidate = exclusionMismatch.manifests[0]!.candidates[0]!
    exclusionCandidate.overrides.excludedAlternativeTitles = ['Unrelated alias']
    exclusionMismatch.index.manifests[0] = {
      ...exclusionMismatch.index.manifests[0]!,
      sha256: sha256Canonical(exclusionMismatch.manifests[0]),
    }
    exclusionMismatch.reviewLedger.items[0]!.overrides.push({
      category: 'alternative_title_exclusion',
      providerValue: ['Different alias'],
      selectedValue: [],
      rationale: 'The reviewed alias belongs to a different work identity.',
      normalizedItemSha256:
        exclusionMismatch.reviewLedger.items[0]!.normalizedItemSha256,
    })
    exclusionMismatch.index.reviewLedgerSha256 = sha256Canonical(
      exclusionMismatch.reviewLedger,
    )
    expect(() => validateAnimeReleaseBundle(exclusionMismatch)).toThrow(
      'override values',
    )
  })

  it('rejects unbounded, prose-shaped, or category-incompatible override values', () => {
    const invalidOverrides = [
      {
        category: 'maturity_curation',
        providerValue: 'copied provider classification prose',
        selectedValue: 'safe',
      },
      {
        category: 'format_identity_correction',
        providerValue: ['generic film prose'],
        selectedValue: 'movie',
      },
      {
        category: 'release_status_correction',
        providerValue: Array.from(
          { length: 65 },
          (_, index) => `token-${index}`,
        ),
        selectedValue: 'finished',
      },
      {
        category: 'romaji_title_missing',
        providerValue: null,
        selectedValue: 'x'.repeat(513),
      },
      {
        category: 'alternative_title_exclusion',
        providerValue: ['Reviewed alias'],
        selectedValue: ['must be empty'],
      },
    ] as const

    for (const invalidOverride of invalidOverrides) {
      const bundle = releaseBundle()
      bundle.reviewLedger.items[0]!.overrides.push({
        ...invalidOverride,
        rationale: 'Invalid review value fixture.',
        normalizedItemSha256:
          bundle.reviewLedger.items[0]!.normalizedItemSha256,
      } as never)
      expect(() => validateAnimeReleaseBundle(bundle)).toThrow()
    }
  })

  it('requires year and episode corrections to select a projected value', () => {
    const yearBundle = releaseBundle()
    yearBundle.manifests[0]!.candidates[0]!.overrides.releaseYear = 1979
    yearBundle.reviewLedger.items[0]!.overrides.push({
      category: 'release_year_identity_correction',
      providerValue: [1980],
      selectedValue: 1979,
      rationale: 'Invalid projected year selection fixture.',
      normalizedItemSha256:
        yearBundle.reviewLedger.items[0]!.normalizedItemSha256,
    })
    expect(() => validateAnimeReleaseBundle(yearBundle)).toThrow(
      'must select a projected value',
    )

    const episodeBundle = releaseBundle()
    episodeBundle.manifests[0]!.candidates[0]!.overrides.episodeCount = null
    episodeBundle.reviewLedger.items[0]!.overrides.push({
      category: 'episode_scope_correction',
      providerValue: [12],
      selectedValue: null,
      rationale: 'Invalid projected episode-count selection fixture.',
      normalizedItemSha256:
        episodeBundle.reviewLedger.items[0]!.normalizedItemSha256,
    })
    expect(() => validateAnimeReleaseBundle(episodeBundle)).toThrow(
      'must select a projected value',
    )
  })

  it('requires qualifying evidence and a matching maturity override for every known maturity', () => {
    const missingEvidence = releaseBundle()
    missingEvidence.reviewLedger.items[0]!.maturityEvidence = []
    missingEvidence.index.reviewLedgerSha256 = sha256Canonical(
      missingEvidence.reviewLedger,
    )
    expect(() => validateAnimeReleaseBundle(missingEvidence)).toThrow(
      'maturity evidence',
    )

    const unknownWithEvidence = releaseBundle()
    const unknownIndex = 75
    unknownWithEvidence.reviewLedger.items[unknownIndex]!.maturityEvidence = [
      maturityEvidenceFor(releaseItem(0), unknownIndex)[0]!,
    ]
    unknownWithEvidence.index.reviewLedgerSha256 = sha256Canonical(
      unknownWithEvidence.reviewLedger,
    )
    expect(() => validateAnimeReleaseBundle(unknownWithEvidence)).toThrow(
      'maturity evidence',
    )

    const lowerMaturity = releaseBundle()
    const sensitiveIndex = 25
    lowerMaturity.reviewLedger.items[sensitiveIndex]!.maturityEvidence.push({
      issuer: 'bbfc',
      territory: 'GB',
      ratingCode: '18',
      mappedMaturity: 'adult',
      scope: 'exact-work',
      coveredEpisodeCount: null,
      evidenceUrl: 'https://www.bbfc.co.uk/release/more-restrictive-evidence',
      classificationDate: null,
      acquisitionReview: 'approved',
      independentReview: 'approved',
    })
    lowerMaturity.index.reviewLedgerSha256 = sha256Canonical(
      lowerMaturity.reviewLedger,
    )
    expect(() => validateAnimeReleaseBundle(lowerMaturity)).toThrow(
      'maturity evidence',
    )
  })

  it('requires complete-set evidence to match a known normalized episode count', () => {
    const bundle = releaseBundle()
    const adultIndex = 486
    const evidence = bundle.reviewLedger.items[adultIndex]!.maturityEvidence[0]!
    evidence.scope = 'complete-episode-set'
    evidence.coveredEpisodeCount = 6
    bundle.index.reviewLedgerSha256 = sha256Canonical(bundle.reviewLedger)

    expect(() => validateAnimeReleaseBundle(bundle)).toThrow(
      'maturity episode coverage does not match',
    )
  })

  it('retains dual-reviewed complete-set evidence when the normalized episode count is unknown', () => {
    const bundle = releaseBundle()
    const evidence = bundle.reviewLedger.items[0]!.maturityEvidence[0]!
    evidence.scope = 'complete-episode-set'
    evidence.coveredEpisodeCount = 12
    bundle.index.reviewLedgerSha256 = sha256Canonical(bundle.reviewLedger)

    expect(validateAnimeReleaseBundle(bundle)).toEqual(bundle)
  })

  it('requires maturity evidence URLs to be unique across the review ledger', () => {
    const bundle = releaseBundle()
    bundle.reviewLedger.items[1]!.maturityEvidence[0]!.evidenceUrl =
      bundle.reviewLedger.items[0]!.maturityEvidence[0]!.evidenceUrl
    bundle.index.reviewLedgerSha256 = sha256Canonical(bundle.reviewLedger)

    expect(() => validateAnimeReleaseBundle(bundle)).toThrow(
      'duplicated across the review ledger',
    )
  })

  it('fails closed for a same-issuer severity contradiction but permits cross-jurisdiction corroboration', () => {
    const sameIssuerConflict = releaseBundle()
    sameIssuerConflict.reviewLedger.items[0]!.maturityEvidence.push({
      issuer: 'bbfc',
      territory: 'GB',
      ratingCode: '18',
      mappedMaturity: 'adult',
      scope: 'exact-work',
      coveredEpisodeCount: null,
      evidenceUrl: 'https://www.bbfc.co.uk/release/contradictory-evidence',
      classificationDate: null,
      acquisitionReview: 'approved',
      independentReview: 'approved',
    })
    sameIssuerConflict.index.reviewLedgerSha256 = sha256Canonical(
      sameIssuerConflict.reviewLedger,
    )
    expect(() => validateAnimeReleaseBundle(sameIssuerConflict)).toThrow(
      'same-issuer contradiction',
    )

    const crossJurisdiction = releaseBundle()
    const adultIndex = 486
    crossJurisdiction.reviewLedger.items[adultIndex]!.maturityEvidence.push({
      issuer: 'ifco',
      territory: 'IE',
      ratingCode: '18',
      mappedMaturity: 'adult',
      scope: 'exact-work',
      coveredEpisodeCount: null,
      evidenceUrl: 'https://www.ifco.ie/en/ifco/pages/0123456789ABCDEF',
      classificationDate: null,
      acquisitionReview: 'approved',
      independentReview: 'approved',
    })
    crossJurisdiction.index.reviewLedgerSha256 = sha256Canonical(
      crossJurisdiction.reviewLedger,
    )
    expect(validateAnimeReleaseBundle(crossJurisdiction)).toEqual(
      crossJurisdiction,
    )
  })
})

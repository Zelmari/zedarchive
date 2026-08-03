import { beforeAll, describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import {
  acceptedDiscoveryCandidateReceiptSha256,
  acceptedPredecessorIdentityProjection,
  adultPublicationSignals,
  assertAcceptedIdentityProjection,
  createIdentityScopeDisposition,
  directContinuityQids,
  normalizeLatinCompatibleTitle,
  predecessorIdentityCorrection,
  predecessorReductionFailureCategories,
  PredecessorReductionError,
  createPendingPredecessorRoleReviewDraft,
  createPredecessorReReviewDocket,
  projectTitleCandidates,
  reconcilePredecessorRoleReviews,
  reducePredecessorEntity,
  reducePredecessorEntityResult,
  reductionFailureCategoryFromError,
  validatePredecessorRoleReviewResult,
  validatePredecessorReReviewDocket,
  validatePredecessorReviewResult,
} from '@/features/anime/catalogue/anime-successor-predecessor-review'
import { discoverySha256 } from '@/features/anime/catalogue/wikidata-anime-discovery'
import {
  loadAnimeReleaseBundle,
  normalizedAnimeReleaseItemSha256,
  sha256Canonical,
  validateAnimeReleaseBundle,
  type AnimeReleaseBundle,
  type AnimeReleaseItem,
} from '@/features/anime/catalogue/anime-release-corpus'
import type { WikidataEntity } from '@/integrations/wikidata/wikidata-entity'

let bundle: AnimeReleaseBundle
beforeAll(async () => {
  bundle = await loadAnimeReleaseBundle({
    corpus: resolve('data/releases/anime-catalogue.v1.json'),
    reviewLedger: resolve('data/releases/anime-catalogue.v1.review.json'),
    index: resolve('data/releases/anime-catalogue.v1.index.json'),
    manifests: Array.from({ length: 20 }, (_, index) =>
      resolve(
        `data/imports/releases/anime-v1/batch-${String(index + 1).padStart(2, '0')}.json`,
      ),
    ),
  })
})

function validPreparation() {
  const aggregate = bundle.corpus.items.find(
    ({ id }) => id === predecessorIdentityCorrection.catalogueItemId,
  )!
  const requestQids = [
    ...bundle.corpus.items.map((item) => item.sources[0]!.sourceItemId),
    'Q114798407',
  ]
  const evidenceUrls = bundle.reviewLedger.items.flatMap(
    ({ maturityEvidence }) =>
      maturityEvidence.map(({ evidenceUrl }) => evidenceUrl),
  )
  const records = bundle.corpus.items.map((prior) => {
    const qid = prior.sources[0]!.sourceItemId
    const english =
      prior.titles.english ??
      (prior.titles.romaji === null ? `Reviewed ${qid}` : undefined)
    return {
      catalogueItemId: prior.id,
      sourceItemId: qid,
      predecessorNormalizedItemSha256: normalizedAnimeReleaseItemSha256(prior),
      projection: reducePredecessorEntity(
        entity({
          id: qid,
          lastrevid: 1,
          labels: {
            ...(english ? { en: { language: 'en', value: english } } : {}),
            ...(prior.titles.romaji && !english
              ? {
                  'ja-latn': {
                    language: 'ja-latn',
                    value: prior.titles.romaji,
                  },
                }
              : {}),
          },
          claims:
            qid === 'Q125436925'
              ? {
                  P31: [
                    statement('P31', {
                      id: 'Q172067',
                      'entity-type': 'item',
                    }),
                  ],
                }
              : {},
        }),
      ),
    }
  })
  const corroboratingProjection = reducePredecessorEntity(
    acceptedIdentityEntity('Q114798407'),
  )
  const orderedProjections = [
    ...records.map(({ projection }) => projection),
    corroboratingProjection,
  ]
  return {
    schema: 'zedarchive.anime-v2-predecessor-preparation',
    version: 1,
    predecessorCorpusSha256: sha256Canonical(bundle.corpus),
    predecessorReviewSha256: sha256Canonical(bundle.reviewLedger),
    predecessorIndexSha256: sha256Canonical(bundle.index),
    discoveryCandidateReceiptSha256: acceptedDiscoveryCandidateReceiptSha256,
    preparedAt: '2026-07-31T00:00:00.000Z',
    records,
    corroboratingProjection,
    acquisitionEvidence: {
      actionGroups: Array.from({ length: 21 }, (_, index) => ({
        position: index + 1,
        requestedQidsSha256: discoverySha256(
          requestQids.slice(index * 25, index * 25 + 25),
        ),
        reducedResponseSetSha256: discoverySha256(
          orderedProjections.slice(index * 25, index * 25 + 25),
        ),
        responseRevisionSetSha256: discoverySha256(
          orderedProjections
            .slice(index * 25, index * 25 + 25)
            .map(({ qid, revision }) => ({ qid, revision })),
        ),
      })),
      retainedEvidenceUrls: evidenceUrls.map((value, index) => {
        const evidenceUrlSha256 = discoverySha256(value)
        return {
          position: index + 1,
          evidenceUrlSha256,
          outcome: 'reachable',
          shape: 'html',
          outcomeSha256: discoverySha256({
            evidenceUrlSha256,
            outcome: 'reachable',
            shape: 'html',
          }),
        }
      }),
    },
    requiredIdentityScopeDisposition: createIdentityScopeDisposition(aggregate),
  }
}

function testApprovedIdentityCorrection(predecessor: AnimeReleaseItem) {
  return {
    ...createIdentityScopeDisposition(predecessor),
    primaryReview: 'approved' as const,
    independentReview: 'approved' as const,
  }
}

function validFinalResult(preparation = validPreparation()) {
  const reviews = new Map(
    bundle.reviewLedger.items.map((item) => [item.catalogueItemId, item]),
  )
  return {
    schema: 'zedarchive.anime-v2-predecessor-review-result',
    version: 1,
    predecessorCorpusSha256: sha256Canonical(bundle.corpus),
    predecessorReviewSha256: sha256Canonical(bundle.reviewLedger),
    preparationSha256: discoverySha256(preparation),
    records: bundle.corpus.items.map((prior, index) => {
      const acquired = preparation.records[index]!
      const priorHash = normalizedAnimeReleaseItemSha256(prior)
      const qid = prior.sources[0]!.sourceItemId
      const identity =
        prior.id === predecessorIdentityCorrection.catalogueItemId
      const adult = acquired.projection.adultSignals.length > 0
      const adultPublished = adult && prior.catalogueState === 'published'
      const englishCandidate = acquired.projection.titleCandidates.find(
        ({ source }) => source === 'label.en',
      )
      const romajiCandidate = acquired.projection.titleCandidates.find(
        ({ source }) => source === 'label.ja-latn',
      )
      const selectedCandidate = englishCandidate ?? romajiCandidate
      const titleUnavailable =
        prior.catalogueState === 'published' &&
        selectedCandidate === undefined &&
        !identity &&
        !adult
      const publishedAfterReview =
        prior.catalogueState === 'published' &&
        !identity &&
        !adult &&
        !titleUnavailable
      const currentItem = {
        ...prior,
        titles: {
          ...prior.titles,
          english: publishedAfterReview
            ? (englishCandidate?.value ?? prior.titles.english)
            : titleUnavailable
              ? null
              : prior.titles.english,
          romaji: publishedAfterReview
            ? (romajiCandidate?.value ?? prior.titles.romaji)
            : titleUnavailable
              ? null
              : prior.titles.romaji,
        },
        catalogueState:
          identity || adultPublished || titleUnavailable
            ? ('hidden' as const)
            : prior.catalogueState,
      }
      const currentHash = normalizedAnimeReleaseItemSha256(currentItem)
      const corrections: Array<Record<string, unknown>> = []
      if (identity) corrections.push(testApprovedIdentityCorrection(prior))
      if (adultPublished)
        corrections.push({
          category: 'catalogue_state_adult_publication_hide',
          predecessorNormalizedItemSha256: priorHash,
          normalizedItemSha256: currentHash,
          rationale:
            'The finite predecessor signal requires hidden publication state.',
        })
      if (titleUnavailable)
        corrections.push({
          category: 'catalogue_state_title_usability_hide',
          predecessorNormalizedItemSha256: priorHash,
          normalizedItemSha256: currentHash,
          rationale: 'No permitted reviewed title remained usable.',
        })
      if (prior.titles.english !== currentItem.titles.english)
        corrections.push({
          category: 'english_title_correction',
          predecessorNormalizedItemSha256: priorHash,
          normalizedItemSha256: currentHash,
          rationale:
            'The reviewed structured English title is Latin-compatible.',
        })
      if (prior.titles.romaji !== currentItem.titles.romaji)
        corrections.push({
          category: 'romaji_title_correction',
          predecessorNormalizedItemSha256: priorHash,
          normalizedItemSha256: currentHash,
          rationale:
            'The reviewed structured romaji title is Latin-compatible.',
        })
      const selectedLanguage = publishedAfterReview
        ? englishCandidate
          ? ('english' as const)
          : romajiCandidate
            ? ('romaji' as const)
            : null
        : null
      const selectedTitle =
        selectedLanguage === 'english'
          ? currentItem.titles.english
          : selectedLanguage === 'romaji'
            ? currentItem.titles.romaji
            : null
      return {
        catalogueItemId: prior.id,
        sourceItemId: qid,
        intent: 'link-existing' as const,
        predecessorNormalizedItemSha256: priorHash,
        predecessorReviewItemSha256: sha256Canonical(reviews.get(prior.id)),
        predecessorProjectionSha256: acquired.projection.projectionSha256,
        currentItem,
        normalizedItemSha256: currentHash,
        titleReview: {
          selectedLanguage,
          selectedSource:
            selectedLanguage === 'english'
              ? ('label.en' as const)
              : selectedLanguage === 'romaji'
                ? ('label.ja-latn' as const)
                : null,
          selectedValueSha256:
            selectedTitle === null ? null : discoverySha256(selectedTitle),
        },
        adultSignals: acquired.projection.adultSignals,
        adultPublicationOutcome: adult
          ? currentItem.catalogueState === 'draft'
            ? ('excluded' as const)
            : ('hidden' as const)
          : ('cleared' as const),
        corrections,
        primaryReview: 'approved' as const,
        independentReview: 'approved' as const,
      }
    }),
  }
}

function withSignalledDraftPredecessors(
  preparation = validPreparation(),
  count = 2,
) {
  const drafts = bundle.corpus.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.catalogueState === 'draft')
    .slice(0, count)
  if (drafts.length !== count) throw new Error('Insufficient draft fixture.')
  for (const { index } of drafts) {
    const projection = preparation.records[index]!.projection
    const { projectionSha256: ignored, ...unhashed } = projection
    void ignored
    preparation.records[index]!.projection = {
      ...unhashed,
      adultSignals: ['known-predecessor-q125436925'],
      projectionSha256: discoverySha256({
        ...unhashed,
        adultSignals: ['known-predecessor-q125436925'],
      }),
    }
  }
  refreshPreparationAcquisitionEvidence(preparation)
  return preparation
}

function refreshPreparationAcquisitionEvidence(
  preparation: ReturnType<typeof validPreparation>,
) {
  const qids = [
    ...bundle.corpus.items.map((item) => item.sources[0]!.sourceItemId),
    'Q114798407',
  ]
  const projections = [
    ...preparation.records.map(({ projection }) => projection),
    preparation.corroboratingProjection,
  ]
  preparation.acquisitionEvidence.actionGroups = Array.from(
    { length: 21 },
    (_, index) => {
      const group = projections.slice(index * 25, index * 25 + 25)
      return {
        position: index + 1,
        requestedQidsSha256: discoverySha256(
          qids.slice(index * 25, index * 25 + 25),
        ),
        reducedResponseSetSha256: discoverySha256(group),
        responseRevisionSetSha256: discoverySha256(
          group.map(({ qid, revision }) => ({ qid, revision })),
        ),
      }
    },
  )
}

function roleInput(
  role: 'primary' | 'independent',
  preparation = validPreparation(),
) {
  const common = {
    schema: 'zedarchive.anime-v2-predecessor-review-input',
    version: 1,
    role,
    preparationSha256: discoverySha256(preparation),
    records: preparation.records.map((record) => ({
      catalogueItemId: record.catalogueItemId,
      sourceItemId: record.sourceItemId,
      predecessorNormalizedItemSha256: record.predecessorNormalizedItemSha256,
      projection: record.projection,
    })),
  }
  return role === 'primary'
    ? {
        ...common,
        role: 'primary' as const,
        requiredIdentityScopeDisposition:
          preparation.requiredIdentityScopeDisposition,
      }
    : {
        ...common,
        role: 'independent' as const,
        requiredDecision055Evidence: {
          catalogueItemId:
            preparation.requiredIdentityScopeDisposition.catalogueItemId,
          sourceItemId:
            preparation.requiredIdentityScopeDisposition.sourceItemId,
          projection: preparation.requiredIdentityScopeDisposition.projection,
          projectionSha256:
            preparation.requiredIdentityScopeDisposition.projectionSha256,
          requiredState: 'hidden' as const,
          reason: preparation.requiredIdentityScopeDisposition.reason,
        },
      }
}

function approvedRoleResult(
  role: 'primary' | 'independent',
  preparation = validPreparation(),
  round = 1,
  priorRoundDocketSha256: string | null = null,
) {
  const input = roleInput(role, preparation)
  const final = validFinalResult(preparation)
  return {
    schema: 'zedarchive.anime-v2-predecessor-role-review-result',
    version: 1,
    role,
    roleInputSha256: discoverySha256(input),
    preparationSha256: discoverySha256(preparation),
    round,
    priorRoundDocketSha256,
    records: final.records.map((record) => ({
      catalogueItemId: record.catalogueItemId,
      sourceItemId: record.sourceItemId,
      predecessorNormalizedItemSha256: record.predecessorNormalizedItemSha256,
      predecessorProjectionSha256: record.predecessorProjectionSha256,
      outcome: 'approved' as const,
      resolution: {
        currentItem: record.currentItem,
        titleReview: record.titleReview,
        adultSignals: record.adultSignals,
        adultPublicationOutcome: record.adultPublicationOutcome,
      },
    })),
  }
}

function fullySelfConsistentAlternateV1Bundle(): AnimeReleaseBundle {
  const alternate = structuredClone(bundle)
  ;[alternate.corpus.items[0], alternate.corpus.items[1]] = [
    alternate.corpus.items[1]!,
    alternate.corpus.items[0]!,
  ]
  ;[alternate.reviewLedger.items[0], alternate.reviewLedger.items[1]] = [
    alternate.reviewLedger.items[1]!,
    alternate.reviewLedger.items[0]!,
  ]
  ;[
    alternate.manifests[0]!.candidates[0],
    alternate.manifests[0]!.candidates[1],
  ] = [
    alternate.manifests[0]!.candidates[1]!,
    alternate.manifests[0]!.candidates[0]!,
  ]
  alternate.index.corpusSha256 = sha256Canonical(alternate.corpus)
  alternate.index.reviewLedgerSha256 = sha256Canonical(alternate.reviewLedger)
  alternate.index.manifests[0]!.sha256 = sha256Canonical(alternate.manifests[0])
  alternate.index.semanticSummarySha256 = sha256Canonical({
    added: alternate.corpus.items.map((item) => ({
      catalogueItemId: item.id,
      sourceItemId: item.sources[0]!.sourceItemId,
      normalizedItemSha256: normalizedAnimeReleaseItemSha256(item),
    })),
    parentChanged: [],
    alternativesChanged: [],
    sourceChanged: [],
    stateChanged: [],
  })
  return validateAnimeReleaseBundle(alternate)
}

function statement(
  property: string,
  value: unknown,
  type = 'wikibase-entityid',
  rank = 'normal',
) {
  return {
    rank,
    mainsnak: {
      property,
      snaktype: 'value',
      datatype: ['monolingualtext', 'time', 'quantity'].includes(type)
        ? type
        : 'wikibase-item',
      datavalue: { type, value },
    },
  }
}
function entity(changes: Partial<WikidataEntity> = {}): WikidataEntity {
  return {
    id: 'Q1',
    type: 'item',
    labels: {},
    aliases: {},
    claims: {},
    ...changes,
  }
}

function acceptedIdentityEntity(qid: string): WikidataEntity {
  const projected = acceptedPredecessorIdentityProjection.entities.find(
    (candidate) => candidate.qid === qid,
  )!
  return {
    id: projected.qid,
    type: 'item',
    lastrevid: 1,
    labels: { en: { language: 'en', value: projected.label } },
    aliases: {},
    claims: Object.fromEntries(
      Object.entries(projected.claims).map(([property, statements]) => [
        property,
        statements.map((value) => ({
          rank: value.rank,
          mainsnak: {
            property,
            snaktype: value.snaktype,
            datatype: value.datatype,
            datavalue: {
              type:
                value.datatype === 'wikibase-item'
                  ? 'wikibase-entityid'
                  : value.datatype,
              value:
                typeof value.value === 'string'
                  ? { id: value.value, 'entity-type': 'item' }
                  : value.value,
            },
          },
        })),
      ]),
    ),
  }
}

describe('M45 predecessor policy', () => {
  it('binds the exact Decision 055 projection and rejects drift', () => {
    expect(discoverySha256(acceptedPredecessorIdentityProjection)).toBe(
      predecessorIdentityCorrection.projectionSha256,
    )
    expect(() =>
      assertAcceptedIdentityProjection(acceptedPredecessorIdentityProjection),
    ).not.toThrow()
    const drift = structuredClone(acceptedPredecessorIdentityProjection)
    drift.entities[0]!.label = 'Changed'
    expect(() => assertAcceptedIdentityProjection(drift)).toThrow(
      'Decision 055',
    )
  })

  it.each([
    ['Pokémon', 'Pokémon'],
    ['８６', '86'],
    ['Cafe\u0301', 'Café'],
    ['鬼父', null],
    ['Naruto（ナルト）', null],
    ['Aниме', null],
    ['---', null],
  ])('validates Latin-compatible titles %s', (input, expected) => {
    expect(normalizeLatinCompatibleTitle(input)).toBe(expected)
  })

  it('projects only approved English and ja-latn structured titles', () => {
    const input = entity({
      labels: {
        en: { language: 'en', value: 'English' },
        ja: { language: 'ja', value: '日本語' },
        'JA-LATN': { language: 'JA-LATN', value: 'Romaji' },
      },
      aliases: { en: [{ language: 'en', value: 'Alias' }] },
      claims: {
        P1476: [
          statement(
            'P1476',
            { language: 'ja-latn', text: 'Claimed Romaji' },
            'monolingualtext',
          ),
        ],
      },
    })
    expect(
      projectTitleCandidates(input).map(({ source, value }) => [source, value]),
    ).toEqual([
      ['label.en', 'English'],
      ['alias.en', 'Alias'],
      ['label.ja-latn', 'Romaji'],
      ['claim.P1476.ja-latn', 'Claimed Romaji'],
    ])
  })

  it('extracts finite adult signals and direct one-edge continuity only', () => {
    const input = entity({
      id: 'Q125436925',
      claims: {
        P31: [statement('P31', { id: 'Q172067', 'entity-type': 'item' })],
        P136: [
          statement('P136', { id: 'Q185529', 'entity-type': 'item' }),
          statement(
            'P136',
            { id: 'Q136926229', 'entity-type': 'item' },
            'wikibase-entityid',
            'deprecated',
          ),
        ],
        P155: [statement('P155', { id: 'Q9', 'entity-type': 'item' })],
        P156: [statement('P156', { id: 'Q2', 'entity-type': 'item' })],
        P179: [statement('P179', { id: 'Q3', 'entity-type': 'item' })],
      },
    })
    expect(adultPublicationSignals(input)).toEqual([
      'instance-hentai',
      'genre-pornographic-film',
      'known-predecessor-q125436925',
    ])
    expect(directContinuityQids(input)).toEqual(['Q2', 'Q9'])
  })

  it('rejects missing and redirected predecessor entities', () => {
    expect(() => reducePredecessorEntity(entity({ redirect: 'Q2' }))).toThrow(
      'redirected',
    )
    expect(() => reducePredecessorEntity(entity({ missing: true }))).toThrow(
      'missing',
    )
  })

  it('classifies only the closed predecessor reduction failure families', () => {
    const categories = [
      reducePredecessorEntityResult(entity({ missing: true })),
      reducePredecessorEntityResult(
        entity({
          claims: {
            P155: Array.from({ length: 9 }, (_, index) =>
              statement('P155', {
                id: `Q${index + 2}`,
                'entity-type': 'item',
              }),
            ),
          },
        }),
      ),
      reducePredecessorEntityResult(
        entity({ claims: { P31: [{ malformed: true }] } }),
      ),
      reducePredecessorEntityResult(
        entity({
          claims: {
            P577: [statement('P577', { unapproved: 'representation' })],
          },
        }),
      ),
      reducePredecessorEntityResult(entity({ lastrevid: -1 })),
    ]
    expect(
      categories.map((result) =>
        result.success ? 'success' : result.category,
      ),
    ).toEqual([
      'entity-state',
      'continuity-limit',
      'statement-shape',
      'claim-value',
      'projection-schema',
    ])
    expect(predecessorReductionFailureCategories).toEqual([
      'entity-state',
      'continuity-limit',
      'statement-shape',
      'claim-value',
      'projection-schema',
      'unexpected-reduction',
    ])
  })

  it('projects only exact property-specific claim shapes and fields', () => {
    const input = entity({
      claims: {
        P31: [
          statement('P31', {
            id: 'Q63952888',
            'entity-type': 'item',
            providerExtra: 'discarded',
          }),
        ],
        P136: [
          statement('P136', {
            id: 'Q185529',
            'entity-type': 'item',
            providerExtra: 'discarded',
          }),
        ],
        P1476: [
          statement(
            'P1476',
            {
              language: 'en',
              text: 'Structured title',
              providerExtra: 'discarded',
            },
            'monolingualtext',
          ),
        ],
        P577: [
          statement(
            'P577',
            {
              time: '+2001-01-02T00:00:00Z',
              precision: 11,
              calendarmodel: 'http://www.wikidata.org/entity/Q1985727',
              timezone: 0,
              before: 0,
              after: 0,
            },
            'time',
          ),
        ],
        P580: [
          statement(
            'P580',
            {
              time: '+2002-01-02T00:00:00Z',
              precision: 11,
              calendarmodel: 'http://www.wikidata.org/entity/Q1985727',
              timezone: 0,
              before: 0,
            },
            'time',
          ),
        ],
        P582: [
          statement(
            'P582',
            {
              time: '+2003-01-02T00:00:00Z',
              precision: 11,
              calendarmodel: 'http://www.wikidata.org/entity/Q1985727',
              timezone: 0,
              after: 0,
            },
            'time',
          ),
        ],
        P1113: [
          statement(
            'P1113',
            {
              amount: '+12',
              unit: '1',
              upperBound: '+13',
              lowerBound: '+11',
            },
            'quantity',
          ),
        ],
        P155: [
          statement('P155', {
            id: 'Q2',
            'entity-type': 'item',
            providerExtra: 'discarded',
          }),
        ],
        P156: [
          statement('P156', {
            id: 'Q3',
            'entity-type': 'item',
            providerExtra: 'discarded',
          }),
        ],
      },
    })
    const result = reducePredecessorEntityResult(input)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error('Expected a reduced predecessor.')
    expect(result.projection.claims).toEqual({
      P31: [{ rank: 'normal', value: 'Q63952888' }],
      P136: [{ rank: 'normal', value: 'Q185529' }],
      P1476: [
        {
          rank: 'normal',
          value: { language: 'en', text: 'Structured title' },
        },
      ],
      P577: [
        {
          rank: 'normal',
          value: {
            time: '+2001-01-02T00:00:00Z',
            precision: 11,
            calendarmodel: 'http://www.wikidata.org/entity/Q1985727',
          },
        },
      ],
      P580: [
        {
          rank: 'normal',
          value: {
            time: '+2002-01-02T00:00:00Z',
            precision: 11,
            calendarmodel: 'http://www.wikidata.org/entity/Q1985727',
          },
        },
      ],
      P582: [
        {
          rank: 'normal',
          value: {
            time: '+2003-01-02T00:00:00Z',
            precision: 11,
            calendarmodel: 'http://www.wikidata.org/entity/Q1985727',
          },
        },
      ],
      P1113: [{ rank: 'normal', value: { amount: '+12', unit: '1' } }],
      P155: [{ rank: 'normal', value: 'Q2' }],
      P156: [{ rank: 'normal', value: 'Q3' }],
    })
    expect(JSON.stringify(result.projection)).not.toContain('providerExtra')
    expect(JSON.stringify(result.projection)).not.toContain('upperBound')
    expect(JSON.stringify(result.projection)).not.toContain('timezone')
    const withoutProviderExtras = structuredClone(input)
    const clonedClaims = withoutProviderExtras.claims as Record<
      string,
      Array<{ mainsnak: { datavalue?: { value: unknown } } }>
    >
    for (const property of ['P31', 'P136', 'P155', 'P156'] as const)
      delete (
        clonedClaims[property]![0]!.mainsnak.datavalue!.value as {
          providerExtra?: unknown
        }
      ).providerExtra
    for (const property of ['P577', 'P580', 'P582'] as const) {
      const value = clonedClaims[property]![0]!.mainsnak.datavalue!.value as {
        timezone?: unknown
        before?: unknown
        after?: unknown
      }
      delete value.timezone
      delete value.before
      delete value.after
    }
    const quantity = clonedClaims.P1113![0]!.mainsnak.datavalue!.value as {
      upperBound?: unknown
      lowerBound?: unknown
    }
    delete quantity.upperBound
    delete quantity.lowerBound
    const baseline = reducePredecessorEntityResult(withoutProviderExtras)
    expect(baseline).toEqual(result)
  })

  it('classifies exact datatype, datavalue, and required-field failures as claim values', () => {
    const invalid = [
      entity({
        claims: {
          P31: [
            statement(
              'P577',
              {
                time: '+2001-01-01T00:00:00Z',
                precision: 11,
                calendarmodel: 'http://www.wikidata.org/entity/Q1985727',
              },
              'time',
            ),
          ],
        },
      }),
      entity({
        claims: {
          P31: [
            statement(
              'P31',
              {
                time: '+2001-01-01T00:00:00Z',
                precision: 11,
                calendarmodel: 'http://www.wikidata.org/entity/Q1985727',
              },
              'time',
            ),
          ],
        },
      }),
      entity({
        claims: {
          P1476: [
            statement(
              'P1476',
              { id: 'Q1', 'entity-type': 'item' },
              'wikibase-entityid',
            ),
          ],
        },
      }),
      entity({
        claims: {
          P577: [statement('P577', { amount: '+1', unit: '1' }, 'quantity')],
        },
      }),
      entity({
        claims: {
          P1113: [
            statement(
              'P1113',
              {
                time: '+2001-01-01T00:00:00Z',
                precision: 11,
                calendarmodel: 'http://www.wikidata.org/entity/Q1985727',
              },
              'time',
            ),
          ],
        },
      }),
      entity({
        claims: {
          P155: [
            {
              rank: 'normal',
              mainsnak: {
                property: 'P155',
                snaktype: 'value',
                datatype: 'wikibase-item',
                datavalue: {
                  type: 'time',
                  value: {
                    time: '+2001-01-01T00:00:00Z',
                    precision: 11,
                    calendarmodel: 'http://www.wikidata.org/entity/Q1985727',
                  },
                },
              },
            },
          ],
        },
      }),
      entity({
        claims: {
          P577: [
            {
              rank: 'normal',
              mainsnak: {
                property: 'P577',
                snaktype: 'value',
                datatype: 'time',
              },
            },
          ],
        },
      }),
      entity({
        claims: {
          P1113: [statement('P1113', { amount: '+1' }, 'quantity')],
        },
      }),
    ]
    for (const input of invalid)
      expect(reducePredecessorEntityResult(input)).toEqual({
        success: false,
        category: 'claim-value',
      })
  })

  it('continues excluding deprecated and non-value statements', () => {
    const input = entity({
      claims: {
        P577: [
          {
            rank: 'deprecated',
            mainsnak: { property: 'P577', snaktype: 'value' },
          },
          {
            rank: 'normal',
            mainsnak: { property: 'P577', snaktype: 'somevalue' },
          },
          {
            rank: 'normal',
            mainsnak: { property: 'P577', snaktype: 'novalue' },
          },
        ],
      },
    })
    const result = reducePredecessorEntityResult(input)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error('Expected a reduced predecessor.')
    expect(result.projection.claims.P577).toEqual([])
  })

  it('uses the fixed fallback without deriving it from exception text', () => {
    const throws = (message: string) =>
      entity({
        claims: new Proxy(
          {},
          {
            get() {
              throw new Error(message)
            },
          },
        ),
      })
    const first = reducePredecessorEntityResult(throws('private Q1 detail'))
    const second = reducePredecessorEntityResult(
      throws('different hidden provider response'),
    )
    expect(first).toEqual({
      success: false,
      category: 'unexpected-reduction',
    })
    expect(second).toEqual(first)
  })

  it('runtime-closes forged reduction categories and throwing entity-state reads', () => {
    const exportedView =
      predecessorReductionFailureCategories as unknown as string[]
    expect(() =>
      exportedView.push('Q999 private source-looking token'),
    ).toThrow()
    expect(() => {
      exportedView[0] = 'Q999 private source-looking token'
    }).toThrow()
    expect(() => exportedView.splice(0, 1)).toThrow()
    expect(predecessorReductionFailureCategories).not.toContain(
      'Q999 private source-looking token',
    )
    const forged = Object.create(
      PredecessorReductionError.prototype,
    ) as PredecessorReductionError
    Object.defineProperty(forged, 'category', {
      value: 'Q999 private source-looking token',
    })
    const forgedResult = reducePredecessorEntityResult(
      entity({
        claims: new Proxy(
          {},
          {
            get() {
              throw forged
            },
          },
        ),
      }),
    )
    expect(forgedResult).toEqual({
      success: false,
      category: 'unexpected-reduction',
    })
    const constructed = new PredecessorReductionError(
      'Q999 private source-looking token',
      'private error message',
    )
    expect(constructed.category).toBe('unexpected-reduction')
    expect(() => {
      ;(constructed as { category: string }).category = 'entity-state'
    }).toThrow()

    const hostileCategoryRead = new Proxy(
      new PredecessorReductionError('entity-state', 'private error message'),
      {
        get(target, property, receiver) {
          if (property === 'category')
            throw new Error('private branded category getter')
          return Reflect.get(target, property, receiver)
        },
      },
    )
    expect(reductionFailureCategoryFromError(hostileCategoryRead)).toBe(
      'unexpected-reduction',
    )
    const hostileBrandRead = new Proxy(
      new PredecessorReductionError('entity-state', 'private error message'),
      {
        getPrototypeOf() {
          throw new Error('private branded prototype getter')
        },
      },
    )
    expect(reductionFailureCategoryFromError(hostileBrandRead)).toBe(
      'unexpected-reduction',
    )
    const hostileResult = reducePredecessorEntityResult(
      entity({
        claims: new Proxy(
          {},
          {
            get() {
              throw hostileCategoryRead
            },
          },
        ),
      }),
    )
    expect(hostileResult).toEqual({
      success: false,
      category: 'unexpected-reduction',
    })

    const throwingEntityState = new Proxy(entity(), {
      get(target, property, receiver) {
        if (property === 'missing')
          throw new Error('private entity-state getter')
        return Reflect.get(target, property, receiver)
      },
    })
    expect(reducePredecessorEntityResult(throwingEntityState)).toEqual({
      success: false,
      category: 'unexpected-reduction',
    })
  })

  it('keeps successful predecessor projection bytes and hashes unchanged', () => {
    const input = entity({
      id: 'Q42',
      lastrevid: 7,
      labels: { en: { language: 'en', value: 'The Answer' } },
      claims: {
        P31: [statement('P31', { id: 'Q63952888', 'entity-type': 'item' })],
      },
    })
    const result = reducePredecessorEntityResult(input)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error('Expected a reduced predecessor.')
    expect(reducePredecessorEntity(input)).toEqual(result.projection)
    expect(discoverySha256(result.projection)).toBe(
      'b08b83d4469da9a5b0fd209302785bff1ea3a12148690d7ce8c9bc7d17b3df41',
    )
    expect(result.projection.projectionSha256).toBe(
      '2c5790e25b6f46da72cac7917e2a20e00e7293ff48fb8663d23b4d365e13e9a0',
    )
  })

  it('keeps approval stamping outside the exact production disposition', () => {
    const item: AnimeReleaseItem = {
      id: predecessorIdentityCorrection.catalogueItemId,
      titles: {
        english: "Masamune-kun's Revenge",
        romaji: null,
        original: '政宗くんのリベンジ',
        alternatives: [],
      },
      format: 'tv',
      releaseStatus: 'finished',
      releaseYear: 2017,
      episodeCount: 24,
      maturity: 'unknown',
      catalogueState: 'published',
      sources: [
        {
          sourceKey: 'wikidata',
          sourceItemId: predecessorIdentityCorrection.qid,
        },
      ],
    }
    const disposition = createIdentityScopeDisposition(item)
    expect(disposition).toMatchObject({
      intent: 'link-existing',
      currentState: 'hidden',
    })
    expect(disposition).not.toHaveProperty('primaryReview')
    expect(disposition).not.toHaveProperty('independentReview')
    expect(testApprovedIdentityCorrection(item)).toMatchObject({
      primaryReview: 'approved',
      independentReview: 'approved',
    })
    expect(() =>
      createIdentityScopeDisposition({
        ...item,
        id: '00000000-0000-4000-8000-000000000001',
      }),
    ).toThrow('another predecessor')
  })

  it('accepts only a complete hash-bound 500-record final review result', () => {
    const preparation = validPreparation()
    const result = validFinalResult(preparation)
    expect(
      validatePredecessorReviewResult(
        result,
        bundle.corpus,
        bundle.reviewLedger,
        bundle.index,
        preparation,
      ).records,
    ).toHaveLength(500)
    expect(() =>
      validatePredecessorReviewResult(
        { ...result, records: result.records.slice(1) },
        bundle.corpus,
        bundle.reviewLedger,
        bundle.index,
        preparation,
      ),
    ).toThrow()
  })

  it('rejects a fully self-consistent alternate release-v1 bundle', () => {
    const alternate = fullySelfConsistentAlternateV1Bundle()
    const preparation = validPreparation()
    preparation.predecessorCorpusSha256 = sha256Canonical(alternate.corpus)
    preparation.predecessorReviewSha256 = sha256Canonical(
      alternate.reviewLedger,
    )
    preparation.predecessorIndexSha256 = sha256Canonical(alternate.index)
    const result = validFinalResult(preparation)
    result.predecessorCorpusSha256 = sha256Canonical(alternate.corpus)
    result.predecessorReviewSha256 = sha256Canonical(alternate.reviewLedger)
    result.preparationSha256 = discoverySha256(preparation)

    expect(() =>
      validatePredecessorReviewResult(
        result,
        alternate.corpus,
        alternate.reviewLedger,
        alternate.index,
        preparation,
      ),
    ).toThrow('accepted raw release-v1 files')
  })

  it('rejects preparation hash, projection, and ordered-record drift', () => {
    const preparation = validPreparation()
    const wrongHash = validFinalResult(preparation)
    wrongHash.preparationSha256 = 'b'.repeat(64)
    expect(() =>
      validatePredecessorReviewResult(
        wrongHash,
        bundle.corpus,
        bundle.reviewLedger,
        bundle.index,
        preparation,
      ),
    ).toThrow('exact preparation')

    const wrongProjection = validFinalResult(preparation)
    wrongProjection.records[0]!.predecessorProjectionSha256 = 'b'.repeat(64)
    expect(() =>
      validatePredecessorReviewResult(
        wrongProjection,
        bundle.corpus,
        bundle.reviewLedger,
        bundle.index,
        preparation,
      ),
    ).toThrow('history or current-item hash')

    const fakeAcquisition = validPreparation()
    fakeAcquisition.acquisitionEvidence.actionGroups[0]!.reducedResponseSetSha256 =
      'f'.repeat(64)
    expect(() =>
      validatePredecessorReviewResult(
        validFinalResult(fakeAcquisition),
        bundle.corpus,
        bundle.reviewLedger,
        bundle.index,
        fakeAcquisition,
      ),
    ).toThrow('request, response, or revision hash')

    const corroboratingDrift = validPreparation()
    const corroboratingTitle =
      corroboratingDrift.corroboratingProjection.titleCandidates[0]!
    corroboratingTitle.value = 'Changed corroborating title'
    corroboratingTitle.valueSha256 = discoverySha256(corroboratingTitle.value)
    const projectionBody = structuredClone(
      corroboratingDrift.corroboratingProjection,
    ) as Record<string, unknown>
    delete projectionBody.projectionSha256
    corroboratingDrift.corroboratingProjection.projectionSha256 =
      discoverySha256(projectionBody)
    expect(() =>
      validatePredecessorReviewResult(
        validFinalResult(corroboratingDrift),
        bundle.corpus,
        bundle.reviewLedger,
        bundle.index,
        corroboratingDrift,
      ),
    ).toThrow('disagrees with fresh Decision 055')

    const reordered = structuredClone(preparation)
    ;[reordered.records[0], reordered.records[1]] = [
      reordered.records[1]!,
      reordered.records[0]!,
    ]
    const reorderedProjections = [
      ...reordered.records.map(({ projection }) => projection),
      reordered.corroboratingProjection,
    ]
    for (const [
      index,
      group,
    ] of reordered.acquisitionEvidence.actionGroups.entries()) {
      const projections = reorderedProjections.slice(
        index * 25,
        index * 25 + 25,
      )
      group.reducedResponseSetSha256 = discoverySha256(projections)
      group.responseRevisionSetSha256 = discoverySha256(
        projections.map(({ qid, revision }) => ({ qid, revision })),
      )
    }
    const rebound = validFinalResult(reordered)
    expect(() =>
      validatePredecessorReviewResult(
        rebound,
        bundle.corpus,
        bundle.reviewLedger,
        bundle.index,
        reordered,
      ),
    ).toThrow('removed, reordered, merged, or remapped')
  })

  it('rejects uncorrected changes and unexpected result fields', () => {
    const preparation = validPreparation()
    const result = validFinalResult(preparation)
    const changed = structuredClone(result)
    const record = changed.records.find(
      ({ corrections }) => corrections.length > 0,
    )!
    record.corrections = []
    expect(() =>
      validatePredecessorReviewResult(
        changed,
        bundle.corpus,
        bundle.reviewLedger,
        bundle.index,
        preparation,
      ),
    ).toThrow('requires a correction')
    expect(() =>
      validatePredecessorReviewResult(
        { ...result, primaryReasoning: 'must not cross review roles' },
        bundle.corpus,
        bundle.reviewLedger,
        bundle.index,
        preparation,
      ),
    ).toThrow()
  })

  it('requires both explicit approvals on the final identity correction', () => {
    const preparation = validPreparation()
    const result = validFinalResult(preparation)
    const identityRecord = result.records.find(({ corrections }) =>
      corrections.some(
        ({ category }) => category === predecessorIdentityCorrection.category,
      ),
    )!
    const identityCorrection = identityRecord.corrections.find(
      ({ category }) => category === predecessorIdentityCorrection.category,
    ) as Record<string, unknown>
    delete identityCorrection.independentReview
    expect(() =>
      validatePredecessorReviewResult(
        result,
        bundle.corpus,
        bundle.reviewLedger,
        bundle.index,
        preparation,
      ),
    ).toThrow()
  })

  it('rejects concealed signals and invented title-source evidence', () => {
    const preparation = validPreparation()
    const concealed = validFinalResult(preparation)
    concealed.records.find(
      ({ sourceItemId }) => sourceItemId === 'Q125436925',
    )!.adultSignals = []
    expect(() =>
      validatePredecessorReviewResult(
        concealed,
        bundle.corpus,
        bundle.reviewLedger,
        bundle.index,
        preparation,
      ),
    ).toThrow('canonical acquired projection')

    const invented = validFinalResult(preparation)
    const titled = invented.records.find(
      ({ titleReview, currentItem }) =>
        currentItem.catalogueState === 'published' &&
        titleReview.selectedSource === 'label.en',
    )!
    ;(titled.titleReview as { selectedSource: string | null }).selectedSource =
      'alias.en'
    expect(() =>
      validatePredecessorReviewResult(
        invented,
        bundle.corpus,
        bundle.reviewLedger,
        bundle.index,
        preparation,
      ),
    ).toThrow('internally inconsistent')
  })

  it('rejects evidence-free triggered clearance', () => {
    const preparation = validPreparation()
    const result = validFinalResult(preparation)
    const record = result.records.find(
      ({ sourceItemId }) => sourceItemId === 'Q125436925',
    )!
    const prior = bundle.corpus.items.find(
      ({ sources }) => sources[0]!.sourceItemId === 'Q125436925',
    )!
    const acquired = preparation.records.find(
      ({ sourceItemId }) => sourceItemId === 'Q125436925',
    )!
    const title = acquired.projection.titleCandidates[0]!
    if (title.source !== 'label.en') throw new Error('Invalid test fixture')
    record.currentItem = {
      ...prior,
      titles: { ...prior.titles, english: title.value },
    }
    record.normalizedItemSha256 = normalizedAnimeReleaseItemSha256(
      record.currentItem,
    )
    record.titleReview = {
      selectedLanguage: 'english',
      selectedSource: title.source,
      selectedValueSha256: title.valueSha256,
    }
    record.corrections = [
      {
        category: 'english_title_correction',
        predecessorNormalizedItemSha256: record.predecessorNormalizedItemSha256,
        normalizedItemSha256: record.normalizedItemSha256,
        rationale: 'A permitted acquired title was selected.',
      },
    ]
    record.adultPublicationOutcome = 'cleared'
    expect(() =>
      validatePredecessorReviewResult(
        result,
        bundle.corpus,
        bundle.reviewLedger,
        bundle.index,
        preparation,
      ),
    ).toThrow('lacks retained exact-scope maturity evidence')
  })

  it('keeps signalled draft predecessors excluded without fabricating state corrections', () => {
    const preparation = withSignalledDraftPredecessors()
    const result = validFinalResult(preparation)
    const excluded = result.records.filter(
      ({ adultPublicationOutcome }) => adultPublicationOutcome === 'excluded',
    )
    expect(excluded).toHaveLength(2)
    expect(
      excluded.every(
        ({ currentItem, corrections }) =>
          currentItem.catalogueState === 'draft' && corrections.length === 0,
      ),
    ).toBe(true)
    expect(() =>
      validatePredecessorReviewResult(
        result,
        bundle.corpus,
        bundle.reviewLedger,
        bundle.index,
        preparation,
      ),
    ).not.toThrow()
    expect(() =>
      validatePredecessorRoleReviewResult(
        approvedRoleResult('primary', preparation),
        roleInput('primary', preparation),
        preparation,
        'primary',
      ),
    ).not.toThrow()
    const hiddenPublished = result.records.find(
      ({ adultSignals, currentItem }) =>
        adultSignals.length > 0 && currentItem.catalogueState === 'hidden',
    )!
    expect(
      hiddenPublished.corrections.some(
        ({ category }) => category === 'catalogue_state_adult_publication_hide',
      ),
    ).toBe(true)

    const excludedPublished = structuredClone(result)
    const excludedRecord = excludedPublished.records.find(
      ({ adultSignals, adultPublicationOutcome }) =>
        adultSignals.length > 0 && adultPublicationOutcome !== 'excluded',
    )!
    const predecessor = bundle.corpus.items.find(
      ({ id }) => id === excludedRecord.catalogueItemId,
    )!
    expect(predecessor.catalogueState).toBe('published')
    excludedRecord.currentItem = {
      ...predecessor,
    }
    excludedRecord.normalizedItemSha256 = normalizedAnimeReleaseItemSha256(
      excludedRecord.currentItem,
    )
    excludedRecord.corrections = []
    excludedRecord.adultPublicationOutcome = 'excluded'
    expect(() =>
      validatePredecessorReviewResult(
        excludedPublished,
        bundle.corpus,
        bundle.reviewLedger,
        bundle.index,
        preparation,
      ),
    ).toThrow()

    const hiddenDraft = structuredClone(result)
    const hiddenDraftRecord = hiddenDraft.records.find(
      ({ adultPublicationOutcome }) => adultPublicationOutcome === 'excluded',
    )!
    hiddenDraftRecord.adultPublicationOutcome = 'hidden'
    expect(() =>
      validatePredecessorReviewResult(
        hiddenDraft,
        bundle.corpus,
        bundle.reviewLedger,
        bundle.index,
        preparation,
      ),
    ).toThrow('hidden outcome')
  })

  it('requires cleared for no signal and permits hidden signalled predecessors', () => {
    const preparation = validPreparation()
    const result = validFinalResult(preparation)
    const noSignal = result.records.find(
      ({ adultSignals }) => adultSignals.length === 0,
    )!
    noSignal.adultPublicationOutcome = 'excluded'
    expect(() =>
      validatePredecessorReviewResult(
        result,
        bundle.corpus,
        bundle.reviewLedger,
        bundle.index,
        preparation,
      ),
    ).toThrow('not cleared')

    const hiddenPreparation = withSignalledDraftPredecessors(
      validPreparation(),
      1,
    )
    const hiddenPrior = bundle.corpus.items.find(
      ({ catalogueState }) => catalogueState === 'hidden',
    )!
    const hiddenIndex = bundle.corpus.items.indexOf(hiddenPrior)
    const projection = hiddenPreparation.records[hiddenIndex]!.projection
    const { projectionSha256: ignored, ...unhashed } = projection
    void ignored
    hiddenPreparation.records[hiddenIndex]!.projection = {
      ...unhashed,
      adultSignals: ['known-predecessor-q125436925'],
      projectionSha256: discoverySha256({
        ...unhashed,
        adultSignals: ['known-predecessor-q125436925'],
      }),
    }
    refreshPreparationAcquisitionEvidence(hiddenPreparation)
    const hiddenResult = validFinalResult(hiddenPreparation)
    const hiddenRecord = hiddenResult.records[hiddenIndex]!
    expect(hiddenRecord.adultPublicationOutcome).toBe('hidden')
    expect(hiddenRecord.currentItem.catalogueState).toBe('hidden')
    expect(hiddenRecord.corrections).toEqual([])
    expect(() =>
      validatePredecessorReviewResult(
        hiddenResult,
        bundle.corpus,
        bundle.reviewLedger,
        bundle.index,
        hiddenPreparation,
      ),
    ).not.toThrow()
  })

  it('rejects wrong-category field changes and original-title mutation', () => {
    const preparation = validPreparation()
    const wrongCategory = validFinalResult(preparation)
    const record = wrongCategory.records.find(
      ({ corrections }) => corrections.length === 0,
    )!
    record.currentItem = {
      ...record.currentItem,
      format: record.currentItem.format === 'tv' ? 'movie' : 'tv',
    }
    record.normalizedItemSha256 = normalizedAnimeReleaseItemSha256(
      record.currentItem,
    )
    record.corrections = [
      {
        category: 'release_year_identity_correction',
        predecessorNormalizedItemSha256: record.predecessorNormalizedItemSha256,
        normalizedItemSha256: record.normalizedItemSha256,
        rationale: 'Deliberately wrong category for regression coverage.',
      },
    ]
    expect(() =>
      validatePredecessorReviewResult(
        wrongCategory,
        bundle.corpus,
        bundle.reviewLedger,
        bundle.index,
        preparation,
      ),
    ).toThrow('domain-field change')

    const originalMutation = validFinalResult(preparation)
    const originalRecord = originalMutation.records.find(
      ({ corrections }) => corrections.length === 0,
    )!
    originalRecord.currentItem = {
      ...originalRecord.currentItem,
      titles: {
        ...originalRecord.currentItem.titles,
        original: `${originalRecord.currentItem.titles.original} changed`,
      },
    }
    originalRecord.normalizedItemSha256 = normalizedAnimeReleaseItemSha256(
      originalRecord.currentItem,
    )
    originalRecord.corrections = [
      {
        category: 'format_identity_correction',
        predecessorNormalizedItemSha256:
          originalRecord.predecessorNormalizedItemSha256,
        normalizedItemSha256: originalRecord.normalizedItemSha256,
        rationale: 'Original titles have no permitted correction category.',
      },
    ]
    expect(() =>
      validatePredecessorReviewResult(
        originalMutation,
        bundle.corpus,
        bundle.reviewLedger,
        bundle.index,
        preparation,
      ),
    ).toThrow('immutable identity, source, or original title')
  })

  it('creates pending-only strict role drafts bound to exact input and preparation', () => {
    const preparation = validPreparation()
    const input = roleInput('primary', preparation)
    const draft = createPendingPredecessorRoleReviewDraft(input, preparation)
    expect(draft.records).toHaveLength(500)
    expect(draft.records.every(({ outcome }) => outcome === 'pending')).toBe(
      true,
    )
    expect(JSON.stringify(draft)).not.toContain('approved')
    expect(() =>
      createPendingPredecessorRoleReviewDraft(
        { ...input, privateNote: 'forbidden' },
        preparation,
      ),
    ).toThrow()
  })

  it('rejects stale, copied-role, reordered, and private role verdicts', () => {
    const preparation = validPreparation()
    const input = roleInput('primary', preparation)
    const result = approvedRoleResult('primary', preparation)
    expect(() =>
      validatePredecessorRoleReviewResult(
        result,
        input,
        preparation,
        'independent',
      ),
    ).toThrow('exact role input')
    expect(() =>
      validatePredecessorRoleReviewResult(
        { ...result, privateNote: 'forbidden' },
        input,
        preparation,
      ),
    ).toThrow()
    const reordered = structuredClone(result)
    ;[reordered.records[0], reordered.records[1]] = [
      reordered.records[1]!,
      reordered.records[0]!,
    ]
    expect(() =>
      validatePredecessorRoleReviewResult(reordered, input, preparation),
    ).toThrow('order or binding')
    const stale = structuredClone(result)
    stale.preparationSha256 = 'f'.repeat(64)
    expect(() =>
      validatePredecessorRoleReviewResult(stale, input, preparation),
    ).toThrow('exact role input')
  })

  it('requires two approved, identical semantic role resolutions and derives fixed corrections', () => {
    const preparation = validPreparation()
    const primaryInput = roleInput('primary', preparation)
    const independentInput = roleInput('independent', preparation)
    const primary = approvedRoleResult('primary', preparation)
    const independent = approvedRoleResult('independent', preparation)
    const reconciled = reconcilePredecessorRoleReviews(
      primaryInput,
      independentInput,
      primary,
      independent,
      bundle.corpus,
      bundle.reviewLedger,
      bundle.index,
      preparation,
    )
    expect(reconciled.safeAggregate.records).toBe(500)
    const repeated = reconcilePredecessorRoleReviews(
      primaryInput,
      independentInput,
      primary,
      independent,
      bundle.corpus,
      bundle.reviewLedger,
      bundle.index,
      preparation,
    )
    expect(discoverySha256(repeated.result)).toBe(
      discoverySha256(reconciled.result),
    )
    expect(discoverySha256(repeated.safeAggregate)).toBe(
      discoverySha256(reconciled.safeAggregate),
    )
    expect(reconciled.result).toEqual(
      validatePredecessorReviewResult(
        reconciled.result,
        bundle.corpus,
        bundle.reviewLedger,
        bundle.index,
        preparation,
      ),
    )
    expect(
      reconciled.result.records.find(
        ({ catalogueItemId }) =>
          catalogueItemId === predecessorIdentityCorrection.catalogueItemId,
      )?.corrections,
    ).toEqual([
      testApprovedIdentityCorrection(
        bundle.corpus.items.find(
          ({ id }) => id === predecessorIdentityCorrection.catalogueItemId,
        )!,
      ),
    ])
    const blocked = JSON.parse(JSON.stringify(independent)) as {
      records: Array<Record<string, unknown>>
    }
    blocked.records[0] = {
      catalogueItemId: blocked.records[0]!.catalogueItemId,
      sourceItemId: blocked.records[0]!.sourceItemId,
      predecessorNormalizedItemSha256:
        blocked.records[0]!.predecessorNormalizedItemSha256,
      predecessorProjectionSha256:
        blocked.records[0]!.predecessorProjectionSha256,
      outcome: 'blocked',
      reason: 'title',
    }
    expect(() =>
      reconcilePredecessorRoleReviews(
        primaryInput,
        independentInput,
        primary,
        blocked,
        bundle.corpus,
        bundle.reviewLedger,
        bundle.index,
        preparation,
      ),
    ).toThrow('blocked or missing')
    const disagreement = JSON.parse(JSON.stringify(independent)) as {
      records: Array<{
        resolution: { currentItem: Record<string, unknown> }
      }>
    }
    disagreement.records[0]!.resolution.currentItem = {
      ...disagreement.records[0]!.resolution.currentItem,
      maturity: 'unknown',
    }
    expect(() =>
      reconcilePredecessorRoleReviews(
        primaryInput,
        independentInput,
        primary,
        disagreement,
        bundle.corpus,
        bundle.reviewLedger,
        bundle.index,
        preparation,
      ),
    ).toThrow('resolutions disagree')
  })

  it('binds a full fresh re-review round to the prior disagreement docket', () => {
    const preparation = validPreparation()
    const primaryInput = roleInput('primary', preparation)
    const independentInput = roleInput('independent', preparation)
    const primary = approvedRoleResult('primary', preparation)
    const independent = approvedRoleResult('independent', preparation)
    independent.records[0]!.resolution.currentItem = {
      ...independent.records[0]!.resolution.currentItem,
      maturity: 'unknown',
    }
    const docket = createPredecessorReReviewDocket(
      primary,
      independent,
      preparation,
      1,
    )
    expect(() =>
      validatePredecessorReReviewDocket(
        docket,
        primary,
        independent,
        primaryInput,
        independentInput,
        preparation,
        null,
      ),
    ).not.toThrow()
    expect(() =>
      validatePredecessorReReviewDocket(
        { ...docket, primaryRoleResultSha256: 'f'.repeat(64) },
        primary,
        independent,
        primaryInput,
        independentInput,
        preparation,
        null,
      ),
    ).toThrow('immutable role locks')
    const agreeingIndependent = approvedRoleResult('independent', preparation)
    expect(() =>
      validatePredecessorReReviewDocket(
        {
          ...docket,
          primaryRoleResultSha256: discoverySha256(primary),
          independentRoleResultSha256: discoverySha256(agreeingIndependent),
        },
        primary,
        agreeingIndependent,
        primaryInput,
        independentInput,
        preparation,
        null,
      ),
    ).toThrow('actual role disagreement')
    const commitment = discoverySha256(docket)
    const roundTwoPrimary = approvedRoleResult(
      'primary',
      preparation,
      2,
      commitment,
    )
    const roundTwoIndependent = approvedRoleResult(
      'independent',
      preparation,
      2,
      commitment,
    )
    expect(() =>
      validatePredecessorReReviewDocket(
        docket,
        roundTwoPrimary,
        independent,
        primaryInput,
        independentInput,
        preparation,
        null,
      ),
    ).toThrow('exact role input')
    expect(
      reconcilePredecessorRoleReviews(
        primaryInput,
        independentInput,
        roundTwoPrimary,
        roundTwoIndependent,
        bundle.corpus,
        bundle.reviewLedger,
        bundle.index,
        preparation,
        2,
        commitment,
      ).result.records,
    ).toHaveLength(500)
    expect(() =>
      reconcilePredecessorRoleReviews(
        primaryInput,
        independentInput,
        roundTwoPrimary,
        roundTwoIndependent,
        bundle.corpus,
        bundle.reviewLedger,
        bundle.index,
        preparation,
        1,
        null,
      ),
    ).toThrow('exact role input')
  })
})

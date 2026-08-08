import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createIndependentReviewPopulationAuthority,
  createIndependentReviewProposal,
  createIndependentReviewSeedAuthority,
  deriveIndependentReviewRiskReasons,
  independentReviewRiskReasonOrder,
  independentReviewRecordCommitment,
  independentReviewSampleSize,
  independentReviewProposalRecordSha256,
  parseIndependentReviewPopulationAuthority,
  parseIndependentReviewProposal,
  parseIndependentReviewRecordProjection,
  parseIndependentReviewSeedAuthority,
  prepareIndependentReviewSample,
  validateIndependentReviewCohorts,
  type IndependentReviewPopulationRecord,
  type IndependentReviewRiskTriggers,
} from '@/features/anime/catalogue/anime-release-v2-independent-review'
import { prepareIndependentReviewSamplingCore } from '@/features/anime/catalogue/anime-release-v2-independent-review-sampling-core'
import { discoverySha256 } from '@/features/anime/catalogue/wikidata-anime-discovery'

const digest = (value: string) => discoverySha256({ value })
const qid = (index: number) => `Q${index}`
const uuid = (index: number) =>
  `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`

const triggers = (
  overrides: Partial<IndependentReviewRiskTriggers> = {},
): IndependentReviewRiskTriggers => ({
  predecessorChanged: false,
  overrideApplied: false,
  publicationState: 'published',
  maturity: 'unknown',
  adultSafetySignal: false,
  englishTitlePresent: true,
  titleProjection: 'english',
  format: 'tv',
  upcoming: false,
  sourceFlag: false,
  identityFlag: false,
  editionFlag: false,
  seasonFlag: false,
  relationshipFlag: false,
  fuzzyDuplicateFlag: false,
  franchiseContinuityAddition: false,
  coverageFloorSelection: false,
  ...overrides,
})

function proposal() {
  return createIndependentReviewProposal({
    candidateAuthoritySha256: digest('candidate-authority'),
    candidateReceiptSha256: digest('candidate-receipt'),
    predecessorResultSha256: digest('predecessor-result'),
    predecessorCorpusSha256: digest('predecessor-corpus'),
    canonicalSelectionEvidenceSha256: digest('selection-evidence'),
    orderedProposedPublishedQids: Array.from({ length: 5_000 }, (_, index) =>
      qid(index + 1),
    ),
  })
}

function seed(proposed = proposal()) {
  return createIndependentReviewSeedAuthority({
    candidateReceiptSha256: proposed.candidateReceiptSha256,
    predecessorCorpusSha256: proposed.predecessorCorpusSha256,
    orderedProposedPublishedQidSequenceSha256:
      proposed.orderedProposedPublishedQidSequenceSha256,
  })
}

function record(
  index: number,
  proposed: ReturnType<typeof proposal>,
  overrides: Partial<IndependentReviewPopulationRecord> = {},
): IndependentReviewPopulationRecord {
  const riskTriggers = overrides.riskTriggers ?? triggers()
  const canonicalUuid = overrides.canonicalUuid ?? uuid(index)
  const currentQid = overrides.qid ?? qid(index)
  const proposalRecordSha256 = independentReviewProposalRecordSha256({
    proposalSha256: proposed.proposalSha256,
    canonicalUuid,
    qid: currentQid,
  })
  const projectionCore = {
    canonicalUuid,
    qid: currentQid,
    proposedItem: {
      catalogueState: 'published' as const,
      titles: {
        english: `Title ${index}`,
        romaji: null,
        original: null,
        alternatives: [],
      },
      format: riskTriggers.format,
      releaseYear: 2020,
      episodeCount: 12,
      releaseStatus: 'finished' as const,
      maturity: 'unknown' as const,
      adultPublicationOutcome: 'cleared' as const,
    },
    sourceProjection: {
      revision: 1,
      titleCandidates: [],
      releaseYear: 2020,
      releaseYearSource: 'P577' as const,
      episodeCount: 12,
      episodeCountEvidence: 'single-valid' as const,
      claims: {
        P31: [],
        P136: [],
        P1476: [],
        P577: [],
        P580: [],
        P582: [],
        P1113: [],
        P155: [],
        P156: [],
      },
    },
    adultSignals: [],
    directContinuityQids: [],
    machineReviewRequired: true,
    machineReviewComplete: true,
    primaryReviewRequired: true,
    primaryReviewComplete: true,
    proposalRecordSha256,
    identityReviewSha256: digest(`identity-review-${index}`),
    identityAllocationSha256: digest(`identity-allocation-${index}`),
  }
  const projection = {
    kind: 'new-candidate' as const,
    ...projectionCore,
    candidateSha256: digest(`candidate-${index}`),
    manifestSha256: digest(`manifest-${index}`),
    acquisitionOutcomeSha256: digest(`outcome-${index}`),
    candidateProjectionSha256: digest(`candidate-projection-${index}`),
    candidateReviewAuthoritySha256: digest(`candidate-review-${index}`),
  }
  const populated: Omit<IndependentReviewPopulationRecord, 'recordCommitment'> =
    {
      canonicalUuid,
      qid: currentQid,
      proposalRecordSha256,
      identityReviewSha256: projectionCore.identityReviewSha256,
      identityAllocationSha256: projectionCore.identityAllocationSha256,
      primaryReviewEvidenceSha256: digest(`primary-review-${index}`),
      primaryReviewRequired: true,
      primaryReviewComplete: true,
      acquisitionCohort: '001',
      selectionCohort: {
        discoveryReasons: ['audience-en'],
        format: riskTriggers.format,
        eraBucket: '2020-2026',
      },
      riskTriggers,
      mandatoryRiskReasons: deriveIndependentReviewRiskReasons(riskTriggers),
      projection: {
        ...projection,
        projectionSha256: discoverySha256(projection),
      },
    }
  const candidate = { ...populated, ...overrides }
  return {
    ...candidate,
    recordCommitment: independentReviewRecordCommitment(candidate),
  }
}

function population(
  proposed = proposal(),
  records = Array.from({ length: 5_000 }, (_, index) =>
    record(index + 1, proposed),
  ),
) {
  const authority = seed(proposed)
  return {
    proposal: proposed,
    seedAuthority: authority,
    population: createIndependentReviewPopulationAuthority(
      {
        candidateAuthoritySha256: proposed.candidateAuthoritySha256,
        candidateReceiptSha256: proposed.candidateReceiptSha256,
        predecessorCorpusSha256: proposed.predecessorCorpusSha256,
        proposalSha256: proposed.proposalSha256,
        orderedProposedPublishedQidSequenceSha256:
          proposed.orderedProposedPublishedQidSequenceSha256,
        seedAuthoritySha256: authority.seedAuthoritySha256,
        records,
      },
      proposed,
      authority,
    ),
  }
}

function withReviewFlags(
  value: IndependentReviewPopulationRecord,
  changes: Partial<{
    primaryReviewRequired: boolean
    primaryReviewComplete: boolean
    machineReviewRequired: boolean
    machineReviewComplete: boolean
  }>,
): IndependentReviewPopulationRecord {
  const projectionCore: Record<string, unknown> = { ...value.projection }
  delete projectionCore.projectionSha256
  const projection = {
    ...projectionCore,
    primaryReviewRequired:
      changes.primaryReviewRequired ?? value.primaryReviewRequired,
    primaryReviewComplete:
      changes.primaryReviewComplete ?? value.primaryReviewComplete,
    machineReviewRequired:
      changes.machineReviewRequired ?? value.projection.machineReviewRequired,
    machineReviewComplete:
      changes.machineReviewComplete ?? value.projection.machineReviewComplete,
  }
  const changed = {
    ...value,
    primaryReviewRequired:
      changes.primaryReviewRequired ?? value.primaryReviewRequired,
    primaryReviewComplete:
      changes.primaryReviewComplete ?? value.primaryReviewComplete,
    projection: {
      ...projection,
      projectionSha256: discoverySha256(projection),
    } as typeof value.projection,
  }
  const changedCore: Record<string, unknown> = { ...changed }
  delete changedCore.recordCommitment
  return {
    ...changedCore,
    recordCommitment: independentReviewRecordCommitment(
      changedCore as Omit<
        IndependentReviewPopulationRecord,
        'recordCommitment'
      >,
    ),
  } as IndependentReviewPopulationRecord
}

describe('Decision 097 closed trigger matrix', () => {
  it.each([
    ['predecessor-change', { predecessorChanged: true }],
    ['override', { overrideApplied: true }],
    ['non-published-state', { publicationState: 'draft' }],
    ['non-unknown-maturity', { maturity: 'general' }],
    ['adult-safety-signal', { adultSafetySignal: true }],
    ['missing-english', { englishTitlePresent: false }],
    ['original-only-title', { titleProjection: 'original-only' }],
    ['ova-format', { format: 'ova' }],
    ['ona-format', { format: 'ona' }],
    ['special-format', { format: 'special' }],
    ['upcoming', { upcoming: true }],
    ['source-flag', { sourceFlag: true }],
    ['identity-flag', { identityFlag: true }],
    ['edition-flag', { editionFlag: true }],
    ['season-flag', { seasonFlag: true }],
    ['relationship-flag', { relationshipFlag: true }],
    ['fuzzy-duplicate-flag', { fuzzyDuplicateFlag: true }],
    ['franchise-continuity-addition', { franchiseContinuityAddition: true }],
    ['coverage-floor-selection', { coverageFloorSelection: true }],
  ] satisfies readonly [
    (typeof independentReviewRiskReasonOrder)[number],
    Partial<IndependentReviewRiskTriggers>,
  ][])('%s derives only its closed risk reason', (reason, override) => {
    expect(deriveIndependentReviewRiskReasons(triggers(override))).toEqual([
      reason,
    ])
  })

  it('rejects missing and unknown trigger fields', () => {
    expect(() =>
      deriveIndependentReviewRiskReasons({
        ...triggers(),
        upcoming: undefined,
      } as never),
    ).toThrow(/boolean/)
    expect(() =>
      deriveIndependentReviewRiskReasons({
        ...triggers(),
        unrecognized: false,
      } as never),
    ).toThrow(/missing or unknown/)
  })
})

describe('Decision 097 cohort matrix', () => {
  const cohortInput = (acquisitionCohort: string, overrides = {}) => ({
    acquisitionCohort,
    selectionCohort: {
      discoveryReasons: ['audience-en'] as const,
      format: 'tv' as const,
      eraBucket: '2020-2026' as const,
      ...overrides,
    },
    riskTriggers: triggers(),
  })

  it.each(['000', '161', '1', 'foo'])(
    '%s is not a valid manifest cohort',
    (cohort) => {
      expect(() =>
        validateIndependentReviewCohorts(cohortInput(cohort) as never),
      ).toThrow(/acquisition cohort/)
    },
  )

  it.each(['001', '160', 'predecessor-v1'])(
    '%s is accepted at the cohort boundary',
    (cohort) => {
      expect(() =>
        validateIndependentReviewCohorts(cohortInput(cohort) as never),
      ).not.toThrow()
    },
  )

  it('rejects a cohort format or era mismatch', () => {
    expect(() =>
      validateIndependentReviewCohorts(
        cohortInput('001', { format: 'movie' }) as never,
      ),
    ).toThrow(/format must match/)
    expect(() =>
      validateIndependentReviewCohorts(
        cohortInput('001', { eraBucket: 'not-an-era' }) as never,
      ),
    ).toThrow(/era bucket/)
  })
})

describe('Decision 097 seed and proposal authority', () => {
  it('derives a self-hashed seed and rejects each mutated tuple member', () => {
    const proposed = proposal()
    const authority = seed(proposed)
    expect(parseIndependentReviewSeedAuthority(authority)).toEqual(authority)
    for (const field of [
      'candidateReceiptSha256',
      'predecessorCorpusSha256',
      'orderedProposedPublishedQidSequenceSha256',
      'originalSeed',
      'seedAuthoritySha256',
    ] as const)
      expect(() =>
        parseIndependentReviewSeedAuthority({
          ...authority,
          [field]: digest(`forged-${field}`),
        }),
      ).toThrow()
  })

  it('requires an exact 5,000-QID numeric sequence and self hash', () => {
    const proposed = proposal()
    expect(parseIndependentReviewProposal(proposed)).toEqual(proposed)
    expect(() =>
      parseIndependentReviewProposal({
        ...proposed,
        orderedProposedPublishedQids:
          proposed.orderedProposedPublishedQids.slice(1),
      }),
    ).toThrow(/5,000/)
    expect(() =>
      parseIndependentReviewProposal({
        ...proposed,
        proposalSha256: digest('forged'),
      }),
    ).toThrow(/commitment/)
  })
})

describe('Decision 097 population and projection authority', () => {
  it('binds UUID-ordered full coverage to proposal, seed, and record commitments', () => {
    const fixture = population()
    expect(
      parseIndependentReviewPopulationAuthority(
        fixture.population,
        fixture.proposal,
        fixture.seedAuthority,
      ),
    ).toEqual(fixture.population)
    const reordered = {
      ...fixture.population,
      records: [...fixture.population.records].reverse(),
    }
    expect(() =>
      parseIndependentReviewPopulationAuthority(
        reordered,
        fixture.proposal,
        fixture.seedAuthority,
      ),
    ).toThrow(/UUID order/)
    const changedIdentity = {
      ...fixture.population.records[0]!,
      identityAllocationSha256: digest('swapped-allocation'),
    }
    const changedIdentityWithCommitment = {
      ...changedIdentity,
      recordCommitment: independentReviewRecordCommitment(changedIdentity),
    }
    expect(() =>
      createIndependentReviewPopulationAuthority(
        {
          ...fixture.population,
          records: [
            changedIdentityWithCommitment,
            ...fixture.population.records.slice(1),
          ],
        },
        fixture.proposal,
        fixture.seedAuthority,
      ),
    ).toThrow(/projection does not match/)
    const mismatchedState = {
      ...fixture.population.records[0]!,
      riskTriggers: {
        ...fixture.population.records[0]!.riskTriggers,
        publicationState: 'draft' as const,
      },
      mandatoryRiskReasons: ['non-published-state'] as const,
    }
    const mismatchedStateWithCommitment = {
      ...mismatchedState,
      recordCommitment: independentReviewRecordCommitment(mismatchedState),
    }
    expect(() =>
      createIndependentReviewPopulationAuthority(
        {
          ...fixture.population,
          records: [
            mismatchedStateWithCommitment,
            ...fixture.population.records.slice(1),
          ],
        },
        fixture.proposal,
        fixture.seedAuthority,
      ),
    ).toThrow(/publication state and format/)
    const mismatchedFormat = {
      ...fixture.population.records[0]!,
      riskTriggers: {
        ...fixture.population.records[0]!.riskTriggers,
        format: 'movie' as const,
      },
      selectionCohort: {
        ...fixture.population.records[0]!.selectionCohort,
        format: 'movie' as const,
      },
    }
    const mismatchedFormatWithCommitment = {
      ...mismatchedFormat,
      recordCommitment: independentReviewRecordCommitment(mismatchedFormat),
    }
    expect(() =>
      createIndependentReviewPopulationAuthority(
        {
          ...fixture.population,
          records: [
            mismatchedFormatWithCommitment,
            ...fixture.population.records.slice(1),
          ],
        },
        fixture.proposal,
        fixture.seedAuthority,
      ),
    ).toThrow(/publication state and format/)
    expect(() =>
      parseIndependentReviewPopulationAuthority(
        fixture.population,
        fixture.proposal,
        createIndependentReviewSeedAuthority({
          candidateReceiptSha256: digest('other'),
          predecessorCorpusSha256: fixture.proposal.predecessorCorpusSha256,
          orderedProposedPublishedQidSequenceSha256:
            fixture.proposal.orderedProposedPublishedQidSequenceSha256,
        }),
      ),
    ).toThrow(/bound proposal or seed/)
  })

  it('rejects empty/invalid cohorts, record swaps, and raw projection fields', () => {
    const proposed = proposal()
    const valid = record(1, proposed)
    for (const selectionCohort of [
      { ...valid.selectionCohort, discoveryReasons: [] },
      {
        ...valid.selectionCohort,
        discoveryReasons: ['audience-ja', 'audience-en'],
      },
    ])
      expect(() =>
        createIndependentReviewPopulationAuthority(
          {
            candidateAuthoritySha256: proposed.candidateAuthoritySha256,
            candidateReceiptSha256: proposed.candidateReceiptSha256,
            predecessorCorpusSha256: proposed.predecessorCorpusSha256,
            proposalSha256: proposed.proposalSha256,
            orderedProposedPublishedQidSequenceSha256:
              proposed.orderedProposedPublishedQidSequenceSha256,
            seedAuthoritySha256: seed(proposed).seedAuthoritySha256,
            records: Array.from({ length: 5_000 }, (_, index) =>
              index === 0
                ? ({
                    ...valid,
                    selectionCohort,
                  } as IndependentReviewPopulationRecord)
                : record(index + 1, proposed),
            ),
          },
          proposed,
          seed(proposed),
        ),
      ).toThrow()
    expect(() =>
      parseIndependentReviewRecordProjection({
        ...valid.projection,
        rawProviderResponse: 'forbidden',
      }),
    ).toThrow(/unknown/)
    expect(() =>
      parseIndependentReviewRecordProjection({
        ...valid.projection,
        sourceProjection: {
          ...valid.projection.sourceProjection,
          titleCandidates: Array.from({ length: 17 }, () => ({
            source: 'label.en',
            value: 'Title',
            valueSha256: discoverySha256('Title'),
          })),
        },
      }),
    ).toThrow(/cap/)
    expect(() =>
      parseIndependentReviewRecordProjection({
        ...valid.projection,
        sourceProjection: {
          ...valid.projection.sourceProjection,
          titleCandidates: [
            {
              source: 'label.en',
              value: 'A'.repeat(2_049),
              valueSha256: discoverySha256('A'.repeat(2_049)),
            },
          ],
        },
      }),
    ).toThrow(/title bounds/)
    expect(() =>
      deriveIndependentReviewRiskReasons({
        ...triggers(),
        publicationState: 'excluded',
      } as never),
    ).toThrow(/publicationState/)
    expect(() =>
      parseIndependentReviewRecordProjection({
        ...valid.projection,
        proposedItem: {
          ...valid.projection.proposedItem,
          titles: {
            ...valid.projection.proposedItem.titles,
            english: ' Untrimmed title ',
          },
        },
      }),
    ).toThrow(/trimmed title/)
    expect(() =>
      parseIndependentReviewRecordProjection({
        ...valid.projection,
        sourceProjection: {
          ...valid.projection.sourceProjection,
          revision: 0,
        },
      }),
    ).toThrow(/positive/)
  })

  it('accepts the strict predecessor projection and rejects unordered corrections', () => {
    const proposed = proposal()
    const base = record(1, proposed).projection
    if (base.kind !== 'new-candidate') throw new Error('Fixture must be new.')
    const core = {
      ...base,
      kind: 'predecessor' as const,
      predecessorNormalizedItemSha256: digest('prior'),
      proposedNormalizedItemSha256: digest('next'),
      predecessorProjectionSha256: digest('predecessor-projection'),
      predecessorReviewResultSha256: digest('predecessor-review-result'),
      correctionDisposition: 'unchanged-non-published' as const,
      correctionCommitments: [
        {
          category: 'english_title_correction' as const,
          predecessorNormalizedItemSha256: digest('prior'),
          proposedNormalizedItemSha256: digest('next'),
        },
      ],
    }
    const withoutCandidate = structuredClone(core) as Record<string, unknown>
    for (const key of [
      'candidateSha256',
      'manifestSha256',
      'acquisitionOutcomeSha256',
      'candidateProjectionSha256',
      'candidateReviewAuthoritySha256',
      'projectionSha256',
    ])
      delete withoutCandidate[key]
    const predecessor = {
      ...withoutCandidate,
      projectionSha256: discoverySha256(withoutCandidate),
    }
    expect(parseIndependentReviewRecordProjection(predecessor).kind).toBe(
      'predecessor',
    )
    const predecessorCore: Record<string, unknown> = { ...predecessor }
    delete predecessorCore.projectionSha256
    const predecessorWithNullRevision = {
      ...predecessorCore,
      sourceProjection: {
        ...base.sourceProjection,
        revision: null,
      },
    }
    expect(
      parseIndependentReviewRecordProjection({
        ...predecessorWithNullRevision,
        projectionSha256: discoverySha256(predecessorWithNullRevision),
      }).kind,
    ).toBe('predecessor')
    const malformed = {
      ...predecessor,
      correctionCommitments: [
        ...core.correctionCommitments,
        {
          category: 'alternative_title_exclusion',
          predecessorNormalizedItemSha256: digest('prior2'),
          proposedNormalizedItemSha256: digest('next2'),
        },
      ],
    }
    expect(() => parseIndependentReviewRecordProjection(malformed)).toThrow(
      /canonical reason order/,
    )
  })
})

describe('Decision 097 reduced-claim and bounded-array matrix', () => {
  const proposed = proposal()
  const valid = record(1, proposed)
  if (valid.projection.kind !== 'new-candidate')
    throw new Error('Fixture must be a new candidate.')
  const withProjectionHash = (core: Record<string, unknown>) => ({
    ...core,
    projectionSha256: discoverySha256(core),
  })
  const withClaim = (property: string, value: unknown) => {
    const core: Record<string, unknown> = { ...valid.projection }
    delete core.projectionSha256
    return withProjectionHash({
      ...core,
      sourceProjection: {
        ...valid.projection.sourceProjection,
        claims: {
          ...valid.projection.sourceProjection.claims,
          [property]: [{ rank: 'normal', value }],
        },
      },
    })
  }

  it.each([
    ['P31', 'Q1'],
    ['P136', 'Q2'],
    ['P1476', { language: 'en', text: 'Title' }],
    [
      'P577',
      {
        time: '+2020-01-01T00:00:00Z',
        precision: 11,
        calendarmodel: 'Q1985727',
      },
    ],
    [
      'P580',
      {
        time: '+2020-01-01T00:00:00Z',
        precision: 11,
        calendarmodel: 'Q1985727',
      },
    ],
    [
      'P582',
      {
        time: '+2020-01-01T00:00:00Z',
        precision: 11,
        calendarmodel: 'Q1985727',
      },
    ],
    ['P1113', { amount: '+12', unit: '1' }],
    ['P155', 'Q3'],
    ['P156', 'Q4'],
  ])('%s accepts its closed reduced claim shape', (property, value) => {
    expect(() =>
      parseIndependentReviewRecordProjection(withClaim(property, value)),
    ).not.toThrow()
  })

  it.each([
    ['P31', { id: 'Q1' }],
    ['P136', { id: 'Q2' }],
    ['P1476', 'Title'],
    ['P577', '2020'],
    ['P580', '2020'],
    ['P582', '2020'],
    ['P1113', '12'],
    ['P155', { id: 'Q3' }],
    ['P156', { id: 'Q4' }],
  ])('%s rejects a foreign reduced claim shape', (property, value) => {
    expect(() =>
      parseIndependentReviewRecordProjection(withClaim(property, value)),
    ).toThrow()
  })

  it('rejects claim cap, duplicates, and noncanonical order', () => {
    const values = Array.from({ length: 33 }, (_, index) => ({
      rank: 'normal',
      value: `Q${index + 1}`,
    }))
    expect(() =>
      parseIndependentReviewRecordProjection(
        withProjectionHash({
          ...valid.projection,
          sourceProjection: {
            ...valid.projection.sourceProjection,
            claims: {
              ...valid.projection.sourceProjection.claims,
              P31: values,
            },
          },
        }),
      ),
    ).toThrow(/cap/)
    const unordered = [
      { rank: 'normal', value: 'Q2' },
      { rank: 'normal', value: 'Q1' },
    ]
    expect(() =>
      parseIndependentReviewRecordProjection(
        withProjectionHash({
          ...valid.projection,
          sourceProjection: {
            ...valid.projection.sourceProjection,
            claims: {
              ...valid.projection.sourceProjection.claims,
              P31: unordered,
            },
          },
        }),
      ),
    ).toThrow(/canonical-JSON ordered/)
    const duplicate = [
      { rank: 'normal', value: 'Q1' },
      { rank: 'preferred', value: 'Q1' },
    ]
    expect(() =>
      parseIndependentReviewRecordProjection(
        withProjectionHash({
          ...valid.projection,
          sourceProjection: {
            ...valid.projection.sourceProjection,
            claims: {
              ...valid.projection.sourceProjection.claims,
              P31: duplicate,
            },
          },
        }),
      ),
    ).toThrow(/unique/)
  })

  it('rejects adult and continuity duplicate, ordering, and cap violations', () => {
    expect(() =>
      parseIndependentReviewRecordProjection(
        withProjectionHash({
          ...valid.projection,
          adultSignals: ['genre-hentai', 'instance-hentai'],
        }),
      ),
    ).toThrow(/canonical reason order/)
    expect(() =>
      parseIndependentReviewRecordProjection(
        withProjectionHash({
          ...valid.projection,
          adultSignals: Array.from({ length: 8 }, () => 'instance-hentai'),
        }),
      ),
    ).toThrow(/cap/)
    expect(() =>
      parseIndependentReviewRecordProjection(
        withProjectionHash({
          ...valid.projection,
          directContinuityQids: ['Q2', 'Q1'],
        }),
      ),
    ).toThrow(/numeric-QID ordered/)
    expect(() =>
      parseIndependentReviewRecordProjection(
        withProjectionHash({
          ...valid.projection,
          directContinuityQids: Array.from(
            { length: 9 },
            (_, index) => `Q${index + 1}`,
          ),
        }),
      ),
    ).toThrow(/cap/)
  })

  it('rejects oversized, private, and primary-reasoning projections', () => {
    expect(() =>
      parseIndependentReviewRecordProjection({
        ...valid.projection,
        primaryReasoning: 'forbidden',
      }),
    ).toThrow(/unknown/)
    expect(() =>
      parseIndependentReviewRecordProjection({
        ...valid.projection,
        privateNotes: 'forbidden',
      }),
    ).toThrow(/unknown/)
    expect(() =>
      parseIndependentReviewRecordProjection(
        withProjectionHash({
          ...valid.projection,
          sourceProjection: {
            ...valid.projection.sourceProjection,
            claims: {
              ...valid.projection.sourceProjection.claims,
              P577: [
                {
                  rank: 'normal',
                  value: {
                    time: 'x'.repeat(64 * 1024),
                    precision: 11,
                    calendarmodel: 'Q1985727',
                  },
                },
              ],
            },
          },
        }),
      ),
    ).toThrow(/64 KiB/)
  })
})

describe('Decision 097 deterministic sampling', () => {
  it('keeps the strict initial wrapper byte-equivalent to the shared internal core', () => {
    const fixture = population()
    const wrapped = prepareIndependentReviewSample({
      population: fixture.population,
      proposal: fixture.proposal,
      seedAuthority: fixture.seedAuthority,
      round: 'initial',
    })
    const core = prepareIndependentReviewSamplingCore({
      candidates: wrapped.lowRiskPopulation,
      roundSeed: wrapped.roundSeed,
    })
    expect(core.sampleSize).toBe(wrapped.sampleSize)
    expect(core.allocations).toEqual(wrapped.allocations)
    expect(core.sampled).toEqual(wrapped.sampled)
  })

  it('retains exact sample boundaries, self-hashed membership, and no later-round API', () => {
    expect(
      [0, 399, 400, 401, 4_000, 4_001].map(independentReviewSampleSize),
    ).toEqual([0, 399, 400, 400, 400, 401])
    const fixture = population()
    const initial = prepareIndependentReviewSample({
      population: fixture.population,
      proposal: fixture.proposal,
      seedAuthority: fixture.seedAuthority,
      round: 'initial',
    })
    expect(initial.sampleSize).toBe(500)
    expect(initial.sampledCanonicalUuids).toEqual(
      initial.sampled.map(({ canonicalUuid }) => canonicalUuid),
    )
    expect(initial.sampledCanonicalUuidsSha256).toBe(
      discoverySha256(initial.sampledCanonicalUuids),
    )
    expect(initial.selectedRecordCommitments).toEqual(
      initial.sampled.map(({ recordCommitment }) => recordCommitment).sort(),
    )
    expect(initial.sampleSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(() =>
      prepareIndependentReviewSample({
        population: fixture.population,
        proposal: fixture.proposal,
        seedAuthority: fixture.seedAuthority,
        round: 1,
      } as never),
    ).toThrow(/initial sample round/)
    expect(() =>
      prepareIndependentReviewSample({
        population: fixture.population,
        proposal: fixture.proposal,
        seedAuthority: {
          ...fixture.seedAuthority,
          originalSeed: digest('raw'),
        },
        round: 'initial',
      }),
    ).toThrow(/seed authority/)
  })

  it('uses ASCII-stable Hamilton strata and seeded UUID membership', () => {
    const proposed = proposal()
    const records = Array.from({ length: 5_000 }, (_, index) =>
      record(index + 1, proposed, {
        riskTriggers: triggers({ format: index < 2_500 ? 'movie' : 'tv' }),
      }),
    )
    const fixture = population(proposed, records)
    const sample = prepareIndependentReviewSample({
      population: fixture.population,
      proposal: fixture.proposal,
      seedAuthority: fixture.seedAuthority,
      round: 'initial',
    })
    expect(
      sample.allocations.map(({ key, allocation }) => ({ key, allocation })),
    ).toEqual([
      { key: 'movie:2020-2026', allocation: 250 },
      { key: 'tv:2020-2026', allocation: 250 },
    ])
    expect(sample.sampled).toHaveLength(500)
  })
})

describe('Decision 098 internal sampling import boundary', () => {
  it('allows production imports only from foundation and result/history', () => {
    const importToken = 'anime-release-v2-independent-review-sampling-core'
    const productionExtension = /\.(?:[cm]?[jt]s|tsx)$/
    const testOrSpec = /(?:^|\/)[^/]+\.(?:test|spec)\.(?:[cm]?[jt]s|tsx)$/
    const coreImport = new RegExp(
      String.raw`(?:\b(?:import|export)[\s\S]*?\bfrom\s*|\brequire\s*\(|\bimport\s*\()(['\"])[^'\"]*${importToken}\1`,
    )
    const importers = ['src', 'scripts']
      .flatMap((root) => {
        const absoluteRoot = join(process.cwd(), root)
        return readdirSync(absoluteRoot, {
          encoding: 'utf8',
          recursive: true,
        })
          .filter(
            (path) =>
              productionExtension.test(path) &&
              !testOrSpec.test(path) &&
              !`${root}/${path}`.includes('/catalogue/test-support/') &&
              `${root}/${path}` !==
                'src/features/anime/catalogue/anime-release-v2-independent-review-sampling-core.ts',
          )
          .filter((path) =>
            coreImport.test(readFileSync(join(absoluteRoot, path), 'utf8')),
          )
          .map((path) => `${root}/${path}`)
      })
      .sort()
    expect(importers).toEqual([
      'src/features/anime/catalogue/anime-release-v2-independent-review-result.ts',
      'src/features/anime/catalogue/anime-release-v2-independent-review.ts',
    ])
    for (const syntax of [
      `import value from '${importToken}'`,
      `export { value } from '${importToken}'`,
      `require('${importToken}')`,
      `import('${importToken}')`,
    ])
      expect(coreImport.test(syntax)).toBe(true)

    const successorPath =
      'src/features/anime/catalogue/anime-release-v2-independent-review-successor-authority.ts'
    expect(
      readFileSync(join(process.cwd(), successorPath), 'utf8'),
    ).not.toMatch(coreImport)

    const successorFixtureImport =
      /(?:import[\s\S]*?ForFixture\b[\s\S]*?from\s*|require\s*\()(['"])[^'"]*independent-review-successor-authority\1/
    const successorFixtureImporters = ['src', 'scripts']
      .flatMap((root) => {
        const absoluteRoot = join(process.cwd(), root)
        return readdirSync(absoluteRoot, { encoding: 'utf8', recursive: true })
          .filter(
            (path) => productionExtension.test(path) && !testOrSpec.test(path),
          )
          .filter((path) =>
            successorFixtureImport.test(
              readFileSync(join(absoluteRoot, path), 'utf8'),
            ),
          )
          .map((path) => `${root}/${path}`)
      })
      .sort()
    const resultPath =
      'src/features/anime/catalogue/anime-release-v2-independent-review-result.ts'
    expect(successorFixtureImporters).toEqual([resultPath])
    const resultSource = readFileSync(join(process.cwd(), resultPath), 'utf8')
    expect(
      resultSource.match(
        /parseIndependentReviewSuccessorAuthoritySnapshotForFixture/g,
      ),
    ).toHaveLength(3)
    expect(resultSource).toMatch(
      /export function parseIndependentReviewSeriesForFixture[\s\S]*?process\.env\.NODE_ENV !== 'test'[\s\S]*?parseIndependentReviewSuccessorAuthoritySnapshotForFixture/,
    )
    expect(resultSource).toMatch(
      /export function prepareIndependentReviewFreshSampleForFixture[\s\S]*?process\.env\.NODE_ENV !== 'test'[\s\S]*?parseIndependentReviewSuccessorAuthoritySnapshotForFixture/,
    )

    const resultFixtureImport =
      /(?:import|export)[\s\S]*?ForFixture\b[\s\S]*?from\s*(['"])[^'"]*independent-review-result\1/
    const resultFixtureImporters = ['src', 'scripts']
      .flatMap((root) => {
        const absoluteRoot = join(process.cwd(), root)
        return readdirSync(absoluteRoot, { encoding: 'utf8', recursive: true })
          .filter(
            (path) => productionExtension.test(path) && !testOrSpec.test(path),
          )
          .filter((path) =>
            resultFixtureImport.test(
              readFileSync(join(absoluteRoot, path), 'utf8'),
            ),
          )
          .map((path) => `${root}/${path}`)
      })
      .sort()
    expect(resultFixtureImporters).toEqual([])
  })
})

describe('Decision 097 sampling exclusion and allocation matrix', () => {
  it.each([
    ['incomplete primary', { primaryReviewComplete: false }],
    ['primary not required', { primaryReviewRequired: false }],
    ['incomplete machine', { machineReviewComplete: false }],
    ['machine not required', { machineReviewRequired: false }],
  ] as const)('%s is excluded from low-risk sampling', (_name, changes) => {
    const proposed = proposal()
    const rows = Array.from({ length: 5_000 }, (_, index) =>
      record(index + 1, proposed),
    )
    rows[0] = withReviewFlags(rows[0]!, changes)
    const fixture = population(proposed, rows)
    expect(
      prepareIndependentReviewSample({
        population: fixture.population,
        proposal: fixture.proposal,
        seedAuthority: fixture.seedAuthority,
        round: 'initial',
      }).lowRiskPopulation,
    ).toHaveLength(4_999)
  })

  it('excludes records carrying a derived mandatory risk', () => {
    const proposed = proposal()
    const rows = Array.from({ length: 5_000 }, (_, index) =>
      record(index + 1, proposed, {
        riskTriggers: index === 0 ? triggers({ upcoming: true }) : triggers(),
      }),
    )
    const fixture = population(proposed, rows)
    expect(
      prepareIndependentReviewSample({
        population: fixture.population,
        proposal: fixture.proposal,
        seedAuthority: fixture.seedAuthority,
        round: 'initial',
      }).lowRiskPopulation,
    ).toHaveLength(4_999)
  })

  it('takes all undersized strata and applies the minimum of ten when available', () => {
    const proposed = proposal()
    const rows = Array.from({ length: 5_000 }, (_, index) =>
      record(index + 1, proposed, {
        riskTriggers:
          index === 0
            ? triggers()
            : index < 10
              ? triggers({ format: 'movie' })
              : index < 20
                ? triggers()
                : triggers({ upcoming: true }),
        selectionCohort:
          index === 0
            ? {
                discoveryReasons: ['audience-en'],
                format: 'tv',
                eraBucket: 'before-1980',
              }
            : index < 10
              ? {
                  discoveryReasons: ['audience-en'],
                  format: 'movie',
                  eraBucket: '1990-1999',
                }
              : {
                  discoveryReasons: ['audience-en'],
                  format: 'tv',
                  eraBucket: '2020-2026',
                },
      }),
    )
    const fixture = population(proposed, rows)
    const sample = prepareIndependentReviewSample({
      population: fixture.population,
      proposal: fixture.proposal,
      seedAuthority: fixture.seedAuthority,
      round: 'initial',
    })
    expect(sample.sampleSize).toBe(20)
    expect(sample.allocations).toEqual([
      expect.objectContaining({ key: 'movie:1990-1999', allocation: 9 }),
      expect.objectContaining({ key: 'tv:2020-2026', allocation: 10 }),
      expect.objectContaining({ key: 'tv:before-1980', allocation: 1 }),
    ])
  })

  it('uses a nonzero Hamilton remainder with canonical key tie handling', () => {
    const proposed = proposal()
    const rows = Array.from({ length: 5_000 }, (_, index) =>
      record(index + 1, proposed, {
        riskTriggers:
          index < 403
            ? triggers({ format: index < 202 ? 'movie' : 'tv' })
            : triggers({ upcoming: true }),
        selectionCohort: {
          discoveryReasons: ['audience-en'],
          format: index < 202 ? 'movie' : 'tv',
          eraBucket: '2020-2026',
        },
      }),
    )
    const fixture = population(proposed, rows)
    const sample = prepareIndependentReviewSample({
      population: fixture.population,
      proposal: fixture.proposal,
      seedAuthority: fixture.seedAuthority,
      round: 'initial',
    })
    expect(sample.allocations).toEqual([
      expect.objectContaining({ key: 'movie:2020-2026', allocation: 200 }),
      expect.objectContaining({ key: 'tv:2020-2026', allocation: 200 }),
    ])
    expect(
      sample.allocations.reduce((sum, row) => sum + row.allocation, 0),
    ).toBe(400)
  })

  it('breaks a true equal-remainder Hamilton tie by ASCII-lowest stratum key', () => {
    const proposed = proposal()
    const strata = [
      { format: 'movie', eraBucket: '1990-1999' },
      { format: 'movie', eraBucket: '2020-2026' },
      { format: 'tv', eraBucket: '2020-2026' },
    ] as const
    const rows = Array.from({ length: 5_000 }, (_, index) => {
      const stratum = strata[Math.floor(index / 201)]
      return record(index + 1, proposed, {
        riskTriggers:
          index < 603 && stratum !== undefined
            ? triggers({ format: stratum.format })
            : triggers({ upcoming: true }),
        selectionCohort: {
          discoveryReasons: ['audience-en'],
          format: stratum?.format ?? 'tv',
          eraBucket: stratum?.eraBucket ?? '2020-2026',
        },
      })
    })
    const fixture = population(proposed, rows)
    const sample = prepareIndependentReviewSample({
      population: fixture.population,
      proposal: fixture.proposal,
      seedAuthority: fixture.seedAuthority,
      round: 'initial',
    })
    expect(sample.allocations).toEqual([
      expect.objectContaining({ key: 'movie:1990-1999', allocation: 134 }),
      expect.objectContaining({ key: 'movie:2020-2026', allocation: 133 }),
      expect.objectContaining({ key: 'tv:2020-2026', allocation: 133 }),
    ])
  })

  it('proves valid low-risk strata cannot reach an impossible minimum allocation', () => {
    const proposed = proposal()
    const formats = ['tv', 'movie', 'ova', 'ona', 'special'] as const
    const eras = [
      'before-1980',
      '1980-1989',
      '1990-1999',
      '2000-2009',
      '2010-2019',
      '2020-2026',
      'unknown',
      'after-2026',
    ] as const
    const strata = formats.flatMap((format) =>
      eras.map((eraBucket) => ({ format, eraBucket })),
    )
    const rows = Array.from({ length: 5_000 }, (_, index) => {
      const stratum = strata[Math.floor(index / 10)]
      return record(index + 1, proposed, {
        riskTriggers:
          index < 400 && stratum !== undefined
            ? triggers({
                format: stratum.format,
                upcoming: !['tv', 'movie'].includes(stratum.format),
              })
            : triggers({ upcoming: true }),
        selectionCohort: {
          discoveryReasons: ['audience-en'],
          format: stratum?.format ?? 'tv',
          eraBucket: stratum?.eraBucket ?? '2020-2026',
        },
      })
    })
    const fixture = population(proposed, rows)
    const sample = prepareIndependentReviewSample({
      population: fixture.population,
      proposal: fixture.proposal,
      seedAuthority: fixture.seedAuthority,
      round: 'initial',
    })
    expect(sample.sampleSize).toBe(160)
    expect(sample.allocations).toHaveLength(16)
    expect(
      sample.allocations.every(
        ({ minimumAllocation, allocation }) =>
          minimumAllocation === 10 && allocation === 10,
      ),
    ).toBe(true)
    // OVA, ONA, and special are mandatory-risk formats, so only 2×8 low-risk
    // strata are valid. Thus impossible minimum/capacity is unreachable: the
    // closed maximum is 16 minima × 10, below the fixed 400-sample floor.
  })

  it('is repeatable and rejects a population permutation instead of normalizing it', () => {
    const fixture = population()
    const first = prepareIndependentReviewSample({
      population: fixture.population,
      proposal: fixture.proposal,
      seedAuthority: fixture.seedAuthority,
      round: 'initial',
    })
    const second = prepareIndependentReviewSample({
      population: fixture.population,
      proposal: fixture.proposal,
      seedAuthority: fixture.seedAuthority,
      round: 'initial',
    })
    expect(second.sampledCanonicalUuids).toEqual(first.sampledCanonicalUuids)
    expect(() =>
      parseIndependentReviewPopulationAuthority(
        {
          ...fixture.population,
          records: [...fixture.population.records].reverse(),
        },
        fixture.proposal,
        fixture.seedAuthority,
      ),
    ).toThrow(/UUID order/)
  })

  it('changes sample commitment for validated seed, proposal, population, and membership drift', () => {
    const first = population()
    const firstSample = prepareIndependentReviewSample({
      population: first.population,
      proposal: first.proposal,
      seedAuthority: first.seedAuthority,
      round: 'initial',
    })
    const changedProposal = createIndependentReviewProposal({
      ...first.proposal,
      candidateAuthoritySha256: digest('replacement-candidate-authority'),
    })
    const proposalFixture = population(changedProposal)
    const proposalSample = prepareIndependentReviewSample({
      population: proposalFixture.population,
      proposal: proposalFixture.proposal,
      seedAuthority: proposalFixture.seedAuthority,
      round: 'initial',
    })
    expect(proposalSample.sampleSha256).not.toBe(firstSample.sampleSha256)

    const changedReceiptProposal = createIndependentReviewProposal({
      ...first.proposal,
      candidateReceiptSha256: digest('replacement-candidate-receipt'),
    })
    const seedFixture = population(changedReceiptProposal)
    const seedSample = prepareIndependentReviewSample({
      population: seedFixture.population,
      proposal: seedFixture.proposal,
      seedAuthority: seedFixture.seedAuthority,
      round: 'initial',
    })
    expect(seedSample.sampleSha256).not.toBe(firstSample.sampleSha256)

    const membershipRows = Array.from({ length: 5_000 }, (_, index) =>
      record(index + 1, first.proposal, {
        riskTriggers: index < 500 ? triggers({ upcoming: true }) : triggers(),
      }),
    )
    const membershipFixture = population(first.proposal, membershipRows)
    const membershipSample = prepareIndependentReviewSample({
      population: membershipFixture.population,
      proposal: membershipFixture.proposal,
      seedAuthority: membershipFixture.seedAuthority,
      round: 'initial',
    })
    expect(membershipSample.sampleSha256).not.toBe(firstSample.sampleSha256)
    expect(membershipSample.sampledCanonicalUuids).not.toEqual(
      firstSample.sampledCanonicalUuids,
    )
  }, 10_000)
})

describe('Decision 097 proposal and population drift matrix', () => {
  it.each([
    'candidateAuthoritySha256',
    'candidateReceiptSha256',
    'predecessorResultSha256',
    'predecessorCorpusSha256',
    'canonicalSelectionEvidenceSha256',
    'orderedProposedPublishedQidSequenceSha256',
  ] as const)('rejects forged proposal %s', (field) => {
    const value = proposal()
    expect(() =>
      parseIndependentReviewProposal({
        ...value,
        [field]: digest(`forged-${field}`),
      }),
    ).toThrow()
  })

  it('rejects numeric-order, duplicate, missing, and extra proposal QIDs', () => {
    const value = proposal()
    const reversed = [...value.orderedProposedPublishedQids]
    ;[reversed[0], reversed[1]] = [reversed[1]!, reversed[0]!]
    expect(() =>
      parseIndependentReviewProposal({
        ...value,
        orderedProposedPublishedQids: reversed,
      }),
    ).toThrow(/ascending/)
    const duplicate = [...value.orderedProposedPublishedQids]
    duplicate[1] = duplicate[0]!
    expect(() =>
      parseIndependentReviewProposal({
        ...value,
        orderedProposedPublishedQids: duplicate,
      }),
    ).toThrow()
    expect(() =>
      parseIndependentReviewProposal({
        ...value,
        orderedProposedPublishedQids:
          value.orderedProposedPublishedQids.slice(1),
      }),
    ).toThrow(/5,000/)
    expect(() =>
      parseIndependentReviewProposal({
        ...value,
        orderedProposedPublishedQids: [
          ...value.orderedProposedPublishedQids,
          'Q5001',
        ],
      }),
    ).toThrow(/5,000/)
  })

  it.each([
    'candidateAuthoritySha256',
    'candidateReceiptSha256',
    'predecessorCorpusSha256',
    'proposalSha256',
    'orderedProposedPublishedQidSequenceSha256',
    'seedAuthoritySha256',
    'populationSha256',
  ] as const)('rejects forged population %s', (field) => {
    const fixture = population()
    expect(() =>
      parseIndependentReviewPopulationAuthority(
        { ...fixture.population, [field]: digest(`forged-${field}`) },
        fixture.proposal,
        fixture.seedAuthority,
      ),
    ).toThrow()
  })

  it('rejects duplicate, missing, and swapped population QID or record commitments', () => {
    const fixture = population()
    const duplicateQid = [
      {
        ...fixture.population.records[0]!,
        qid: fixture.population.records[1]!.qid,
      },
      ...fixture.population.records.slice(1),
    ]
    expect(() =>
      createIndependentReviewPopulationAuthority(
        { ...fixture.population, records: duplicateQid },
        fixture.proposal,
        fixture.seedAuthority,
      ),
    ).toThrow()
    expect(() =>
      createIndependentReviewPopulationAuthority(
        { ...fixture.population, records: fixture.population.records.slice(1) },
        fixture.proposal,
        fixture.seedAuthority,
      ),
    ).toThrow(/5,000/)
    const swappedCommitments = [
      {
        ...fixture.population.records[0]!,
        recordCommitment: fixture.population.records[1]!.recordCommitment,
      },
      {
        ...fixture.population.records[1]!,
        recordCommitment: fixture.population.records[0]!.recordCommitment,
      },
      ...fixture.population.records.slice(2),
    ]
    expect(() =>
      createIndependentReviewPopulationAuthority(
        { ...fixture.population, records: swappedCommitments },
        fixture.proposal,
        fixture.seedAuthority,
      ),
    ).toThrow(/record commitment/)
  })
})

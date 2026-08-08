import {
  createIndependentReviewPopulationAuthority,
  createIndependentReviewProposal,
  createIndependentReviewSeedAuthority,
  deriveIndependentReviewRiskReasons,
  independentReviewProposalRecordSha256,
  independentReviewRecordCommitment,
  type IndependentReviewAcquisitionCohort,
  type IndependentReviewPopulationRecord,
  type IndependentReviewRiskTriggers,
  type IndependentReviewSelectionCohort,
} from '@/features/anime/catalogue/anime-release-v2-independent-review'
import {
  createIndependentReviewInitialAuthoritySnapshot,
  independentReviewWorkingAllocationHistorySha256,
} from '@/features/anime/catalogue/anime-release-v2-independent-review-successor-authority'
import {
  acceptedCandidateReceiptSha256,
  acceptedSelectionRubricSha256,
  identityAllocationHistoryVersion,
  identityAllocationLedgerSha256,
  identityAllocationVersion,
  type IdentityAllocationHistoryEvent,
} from '@/features/anime/catalogue/anime-release-v2-identity-allocation'
import {
  deriveIndependentSampleRoundSeed,
  deriveIndependentSampleSeed,
  replacementLineageSha256,
} from '@/features/anime/catalogue/anime-release-v2-lineage'
import {
  canonicalJson,
  compareDiscoveryQids,
  discoverySha256,
} from '@/features/anime/catalogue/wikidata-anime-discovery'

function assertTestOnlyFixture(): void {
  if (process.env.NODE_ENV !== 'test')
    throw new Error(
      'Independent-review synthetic authority fixtures are test-only.',
    )
}

assertTestOnlyFixture()

export const digest = (value: string) => discoverySha256({ value })
export const qid = (index: number) => `Q${index}`
export const uuid = (index: number) =>
  `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`

const triggers = (): IndependentReviewRiskTriggers => ({
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
})

const candidateSelectionReasonSets = [
  ['audience-en'],
  ['audience-ja'],
  ['multilingual-coverage'],
  ['coverage-cell'],
  ['franchise-continuity'],
  ['audience-en', 'coverage-cell'],
] as const satisfies ReadonlyArray<
  IndependentReviewSelectionCohort['discoveryReasons']
>

export type IndependentReviewIsolatedCohortFixtureInput = Readonly<{
  qids: readonly string[]
  acquisitionCohort: IndependentReviewAcquisitionCohort
  selectionCohort: IndependentReviewSelectionCohort
}>

export type IndependentReviewRootFixtureVariantInput = Readonly<{
  mandatoryRiskQids: readonly string[]
  isolatedCohorts: readonly IndependentReviewIsolatedCohortFixtureInput[]
}>

type ParsedRootFixtureVariantInput = Readonly<{
  mandatoryRiskQids: readonly string[]
  isolatedCohorts: readonly IndependentReviewIsolatedCohortFixtureInput[]
}>

type RootTupleOptions = Readonly<{
  mandatoryRiskQids: ReadonlySet<string>
  isolatedCohortByQid: ReadonlyMap<
    string,
    IndependentReviewIsolatedCohortFixtureInput
  >
  fallbackOrdinalByQid: ReadonlyMap<string, number>
  fallbackSelectionReasonSets: ReadonlyArray<
    IndependentReviewSelectionCohort['discoveryReasons']
  >
}>

const selectionReasonOrder = [
  'predecessor',
  'audience-en',
  'audience-ja',
  'multilingual-coverage',
  'coverage-cell',
  'franchise-continuity',
] as const

function strictFixtureObject(
  input: unknown,
  keys: readonly string[],
  description: string,
): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input))
    throw new Error(`${description} must be an object.`)
  if (
    canonicalJson(Object.keys(input).sort()) !== canonicalJson([...keys].sort())
  )
    throw new Error(`${description} contains missing or unknown fields.`)
  return input as Record<string, unknown>
}

function parseFixtureCandidateQids(
  input: unknown,
  description: string,
  requireNonEmpty: boolean,
): readonly string[] {
  if (!Array.isArray(input) || (requireNonEmpty && input.length === 0))
    throw new Error(
      `${description} must be a${requireNonEmpty ? ' non-empty' : 'n'} array.`,
    )
  for (const value of input)
    if (
      typeof value !== 'string' ||
      !/^Q[1-9][0-9]*$/.test(value) ||
      Number(value.slice(1)) > 4_999
    )
      throw new Error(`${description} must contain existing candidate QIDs.`)
  if (
    new Set(input).size !== input.length ||
    canonicalJson([...input].sort(compareDiscoveryQids)) !==
      canonicalJson(input)
  )
    throw new Error(`${description} must be unique and numeric-QID ordered.`)
  return input as readonly string[]
}

function parseFixtureSelectionCohort(
  input: unknown,
): IndependentReviewSelectionCohort {
  const value = strictFixtureObject(
    input,
    ['discoveryReasons', 'format', 'eraBucket'],
    'Independent-review isolated selection cohort',
  )
  if (value.format !== 'tv' || value.eraBucket !== '2020-2026')
    throw new Error(
      'Independent-review isolated selection cohort must match the root stratum.',
    )
  if (
    !Array.isArray(value.discoveryReasons) ||
    value.discoveryReasons.length === 0
  )
    throw new Error(
      'Independent-review isolated selection reasons must be non-empty.',
    )
  const reasons = value.discoveryReasons
  if (
    reasons.some(
      (reason) =>
        typeof reason !== 'string' ||
        reason === 'predecessor' ||
        !selectionReasonOrder.includes(
          reason as (typeof selectionReasonOrder)[number],
        ),
    ) ||
    new Set(reasons).size !== reasons.length ||
    canonicalJson(
      [...reasons].sort(
        (left, right) =>
          selectionReasonOrder.indexOf(
            left as (typeof selectionReasonOrder)[number],
          ) -
          selectionReasonOrder.indexOf(
            right as (typeof selectionReasonOrder)[number],
          ),
      ),
    ) !== canonicalJson(reasons)
  )
    throw new Error(
      'Independent-review isolated selection reasons are not closed and ordered.',
    )
  return {
    discoveryReasons:
      reasons as IndependentReviewSelectionCohort['discoveryReasons'],
    format: 'tv',
    eraBucket: '2020-2026',
  }
}

function parseRootFixtureVariantInput(
  input: unknown,
): ParsedRootFixtureVariantInput {
  const value = strictFixtureObject(
    input,
    ['mandatoryRiskQids', 'isolatedCohorts'],
    'Independent-review root fixture variant input',
  )
  const mandatoryRiskQids = parseFixtureCandidateQids(
    value.mandatoryRiskQids,
    'Independent-review mandatory-risk QIDs',
    false,
  )
  if (!Array.isArray(value.isolatedCohorts) || value.isolatedCohorts.length > 2)
    throw new Error(
      'Independent-review isolated cohorts must contain zero to two groups.',
    )
  const isolatedCohorts = value.isolatedCohorts
    .map((inputCohort) => {
      const cohort = strictFixtureObject(
        inputCohort,
        ['qids', 'acquisitionCohort', 'selectionCohort'],
        'Independent-review isolated cohort',
      )
      if (
        cohort.acquisitionCohort !== '159' &&
        cohort.acquisitionCohort !== '160'
      )
        throw new Error(
          'Independent-review isolated acquisition cohort must reserve 159 or 160.',
        )
      return {
        qids: parseFixtureCandidateQids(
          cohort.qids,
          'Independent-review isolated cohort QIDs',
          true,
        ),
        acquisitionCohort:
          cohort.acquisitionCohort as IndependentReviewAcquisitionCohort,
        selectionCohort: parseFixtureSelectionCohort(cohort.selectionCohort),
      }
    })
    .sort((left, right) =>
      left.acquisitionCohort.localeCompare(right.acquisitionCohort, 'en'),
    )
  const allIsolatedQids = isolatedCohorts.flatMap(({ qids }) => qids)
  if (new Set(allIsolatedQids).size !== allIsolatedQids.length)
    throw new Error('Independent-review isolated cohort QIDs must be disjoint.')
  if (
    new Set(isolatedCohorts.map(({ acquisitionCohort }) => acquisitionCohort))
      .size !== isolatedCohorts.length ||
    new Set(
      isolatedCohorts.map(({ selectionCohort }) =>
        canonicalJson(selectionCohort),
      ),
    ).size !== isolatedCohorts.length
  )
    throw new Error('Independent-review isolated cohort keys must be distinct.')
  return { mandatoryRiskQids, isolatedCohorts }
}

function createRootTuple(options?: RootTupleOptions) {
  const proposal = createIndependentReviewProposal({
    candidateAuthoritySha256: digest('candidate-authority'),
    candidateReceiptSha256: digest('candidate-receipt'),
    predecessorResultSha256: digest('predecessor-result'),
    predecessorCorpusSha256: digest('predecessor-corpus'),
    canonicalSelectionEvidenceSha256: digest('selection-evidence'),
    orderedProposedPublishedQids: Array.from({ length: 5_000 }, (_, index) =>
      qid(index + 1),
    ),
  })
  const seedAuthority = createIndependentReviewSeedAuthority({
    candidateReceiptSha256: proposal.candidateReceiptSha256,
    predecessorCorpusSha256: proposal.predecessorCorpusSha256,
    orderedProposedPublishedQidSequenceSha256:
      proposal.orderedProposedPublishedQidSequenceSha256,
  })
  const allocationLedger = Array.from({ length: 4_999 }, (_, index) => {
    const number = index + 1
    return {
      version: identityAllocationVersion,
      qid: qid(number),
      catalogueItemId: uuid(number),
      canonicalCandidateReceiptSha256: acceptedCandidateReceiptSha256,
      reducedProjectionSha256: digest(`root-reduced-projection-${number}`),
      identityOutcome: 'approved-exact-work' as const,
      proposedSelectionSha256: digest(`root-identity-proposal-${number}`),
      allocationRound: 1,
    }
  })
  const records = Array.from({ length: 5_000 }, (_, index) => {
    const number = index + 1
    const canonicalUuid = uuid(number)
    const itemQid = qid(number)
    const isPredecessor = number === 5_000
    const isolatedCohort = options?.isolatedCohortByQid.get(itemQid)
    const fallbackOrdinal = options?.fallbackOrdinalByQid.get(itemQid)
    const acquisitionCohort = isPredecessor
      ? 'predecessor-v1'
      : isolatedCohort
        ? isolatedCohort.acquisitionCohort
        : options
          ? (String((fallbackOrdinal! % 158) + 1).padStart(
              3,
              '0',
            ) as IndependentReviewAcquisitionCohort)
          : (String(((number - 1) % 160) + 1).padStart(
              3,
              '0',
            ) as IndependentReviewAcquisitionCohort)
    const discoveryReasons = isPredecessor
      ? (['predecessor'] as const)
      : isolatedCohort
        ? isolatedCohort.selectionCohort.discoveryReasons
        : options
          ? options.fallbackSelectionReasonSets[
              fallbackOrdinal! % options.fallbackSelectionReasonSets.length
            ]!
          : candidateSelectionReasonSets[(number - 1) % 6]!
    const riskTriggers = {
      ...triggers(),
      sourceFlag: options?.mandatoryRiskQids.has(itemQid) ?? false,
    }
    const proposalRecordSha256 = independentReviewProposalRecordSha256({
      proposalSha256: proposal.proposalSha256,
      canonicalUuid,
      qid: itemQid,
    })
    const projectionCore = {
      canonicalUuid,
      qid: itemQid,
      proposedItem: {
        catalogueState: 'published' as const,
        titles: {
          english: `Title ${number}`,
          romaji: null,
          original: null,
          alternatives: [],
        },
        format: 'tv' as const,
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
      identityReviewSha256: digest(`review-${number}`),
      identityAllocationSha256:
        number === 5_000
          ? digest('predecessor-allocation-5000')
          : discoverySha256(allocationLedger[index]),
    }
    const candidateProjection = {
      kind: 'new-candidate' as const,
      ...projectionCore,
      candidateSha256: digest(`candidate-${number}`),
      manifestSha256: digest(`manifest-${number}`),
      acquisitionOutcomeSha256: digest(`outcome-${number}`),
      candidateProjectionSha256: digest(`projection-${number}`),
      candidateReviewAuthoritySha256: digest(`review-authority-${number}`),
    }
    const projection = (() => {
      if (number !== 5_000) return candidateProjection
      const {
        candidateSha256,
        manifestSha256,
        acquisitionOutcomeSha256,
        candidateProjectionSha256,
        candidateReviewAuthoritySha256,
        ...predecessorCore
      } = candidateProjection
      void candidateSha256
      void manifestSha256
      void acquisitionOutcomeSha256
      void candidateProjectionSha256
      void candidateReviewAuthoritySha256
      return {
        ...predecessorCore,
        kind: 'predecessor' as const,
        predecessorNormalizedItemSha256: digest('predecessor-normalized-5000'),
        proposedNormalizedItemSha256: digest('proposed-normalized-5000'),
        predecessorProjectionSha256: digest('predecessor-projection-5000'),
        predecessorReviewResultSha256: digest('predecessor-review-5000'),
        correctionDisposition: 'unchanged-non-published' as const,
        correctionCommitments: [],
      }
    })()
    const record: Omit<IndependentReviewPopulationRecord, 'recordCommitment'> =
      {
        canonicalUuid,
        qid: itemQid,
        proposalRecordSha256,
        identityReviewSha256: projectionCore.identityReviewSha256,
        identityAllocationSha256: projectionCore.identityAllocationSha256,
        primaryReviewEvidenceSha256: digest(`primary-${number}`),
        primaryReviewRequired: true,
        primaryReviewComplete: true,
        acquisitionCohort,
        selectionCohort: {
          discoveryReasons,
          format: 'tv',
          eraBucket: '2020-2026',
        },
        riskTriggers,
        mandatoryRiskReasons: deriveIndependentReviewRiskReasons(riskTriggers),
        projection: {
          ...projection,
          projectionSha256: discoverySha256(projection),
        },
      }
    return {
      ...record,
      recordCommitment: independentReviewRecordCommitment(record),
    }
  })
  const population = createIndependentReviewPopulationAuthority(
    {
      candidateAuthoritySha256: proposal.candidateAuthoritySha256,
      candidateReceiptSha256: proposal.candidateReceiptSha256,
      predecessorCorpusSha256: proposal.predecessorCorpusSha256,
      proposalSha256: proposal.proposalSha256,
      orderedProposedPublishedQidSequenceSha256:
        proposal.orderedProposedPublishedQidSequenceSha256,
      seedAuthoritySha256: seedAuthority.seedAuthoritySha256,
      records,
    },
    proposal,
    seedAuthority,
  )
  const allocationHistory = allocationLedger.map((allocation) => ({
    version: identityAllocationHistoryVersion,
    event: 'allocated' as const,
    qid: allocation.qid,
    catalogueItemId: allocation.catalogueItemId,
    proposalSha256: allocation.proposedSelectionSha256,
    reviewRound: allocation.allocationRound,
    reducedProjectionSha256: allocation.reducedProjectionSha256,
  }))
  return {
    seedAuthority,
    proposal,
    population,
    allocationLedger,
    allocationHistory,
  }
}

export const root = createRootTuple()
export const initialRootSnapshot =
  createIndependentReviewInitialAuthoritySnapshot(root)

export type IndependentReviewRootFixtureVariant = Readonly<{
  root: ReturnType<typeof createRootTuple>
  initialSnapshot: ReturnType<
    typeof createIndependentReviewInitialAuthoritySnapshot
  >
}>

const rootFixtureVariants = new Map<
  string,
  IndependentReviewRootFixtureVariant
>()

export function createIndependentReviewRootFixtureVariant(
  input: unknown,
): IndependentReviewRootFixtureVariant {
  const parsed = parseRootFixtureVariantInput(input)
  const cacheKey = canonicalJson(parsed)
  const cached = rootFixtureVariants.get(cacheKey)
  if (cached !== undefined) return cached

  const isolatedCohortByQid = new Map(
    parsed.isolatedCohorts.flatMap((cohort) =>
      cohort.qids.map((qidValue) => [qidValue, cohort] as const),
    ),
  )
  const fallbackQids = Array.from({ length: 4_999 }, (_, index) =>
    qid(index + 1),
  ).filter((qidValue) => !isolatedCohortByQid.has(qidValue))
  const fallbackOrdinalByQid = new Map(
    fallbackQids.map((qidValue, index) => [qidValue, index] as const),
  )
  const isolatedSelectionKeys = new Set(
    parsed.isolatedCohorts.map(({ selectionCohort }) =>
      canonicalJson(selectionCohort.discoveryReasons),
    ),
  )
  const fallbackSelectionReasonSets = candidateSelectionReasonSets.filter(
    (reasons) => !isolatedSelectionKeys.has(canonicalJson(reasons)),
  )
  if (fallbackSelectionReasonSets.length === 0)
    throw new Error(
      'Independent-review root fixture has no noncolliding fallback selection cohort.',
    )
  const variantRoot = createRootTuple({
    mandatoryRiskQids: new Set(parsed.mandatoryRiskQids),
    isolatedCohortByQid,
    fallbackOrdinalByQid,
    fallbackSelectionReasonSets,
  })
  const variant = {
    root: variantRoot,
    initialSnapshot:
      createIndependentReviewInitialAuthoritySnapshot(variantRoot),
  }
  rootFixtureVariants.set(cacheKey, variant)
  return variant
}

let exactEmptyRootFixture: IndependentReviewRootFixtureVariant | undefined

export function createIndependentReviewExactEmptyRootFixture(): IndependentReviewRootFixtureVariant {
  if (exactEmptyRootFixture !== undefined) return exactEmptyRootFixture
  const bridgeQid = 'Q2016'
  const isolatedCohorts: readonly IndependentReviewIsolatedCohortFixtureInput[] =
    [
      {
        qids: Array.from({ length: 2_500 }, (_, index) =>
          qid(index + 1),
        ).filter((qidValue) => qidValue !== bridgeQid),
        acquisitionCohort: '159',
        selectionCohort: {
          discoveryReasons: ['audience-en', 'audience-ja'],
          format: 'tv',
          eraBucket: '2020-2026',
        },
      },
      {
        qids: [bridgeQid],
        acquisitionCohort: '159',
        selectionCohort: {
          discoveryReasons: ['multilingual-coverage', 'franchise-continuity'],
          format: 'tv',
          eraBucket: '2020-2026',
        },
      },
      {
        qids: Array.from({ length: 2_499 }, (_, index) => qid(index + 2_501)),
        acquisitionCohort: '160',
        selectionCohort: {
          discoveryReasons: ['multilingual-coverage', 'franchise-continuity'],
          format: 'tv',
          eraBucket: '2020-2026',
        },
      },
    ]
  const isolatedCohortByQid = new Map(
    isolatedCohorts.flatMap((cohort) =>
      cohort.qids.map((qidValue) => [qidValue, cohort] as const),
    ),
  )
  const exactRoot = createRootTuple({
    mandatoryRiskQids: new Set(['Q5000']),
    isolatedCohortByQid,
    fallbackOrdinalByQid: new Map(),
    fallbackSelectionReasonSets: candidateSelectionReasonSets,
  })
  exactEmptyRootFixture = {
    root: exactRoot,
    initialSnapshot: createIndependentReviewInitialAuthoritySnapshot(exactRoot),
  }
  return exactEmptyRootFixture
}

type SuccessorFixtureContext = Readonly<{
  root: ReturnType<typeof createRootTuple>
  initialRootSnapshot: ReturnType<
    typeof createIndependentReviewInitialAuthoritySnapshot
  >
}>

const defaultSuccessorFixtureContext: SuccessorFixtureContext = {
  root,
  initialRootSnapshot,
}

export function identityFixture(
  qidValue: string,
  projectionSha256: string,
  replacementRound = 1,
  context: SuccessorFixtureContext = defaultSuccessorFixtureContext,
) {
  const originalQids = context.root.proposal.orderedProposedPublishedQids
  const predecessorCorpusSha256 = digest('identity-fixture-predecessor-corpus')
  const selectionCore = {
    schema: 'zedarchive.anime-v2-canonical-selection-evidence' as const,
    version: 1 as const,
    candidateReceiptSha256: acceptedCandidateReceiptSha256,
    selectionRubricSha256: acceptedSelectionRubricSha256,
    finalizedContinuitySha256: digest(`continuity-${qidValue}`),
    orderedSelectedQids: originalQids,
    orderedSelectedQidsSha256: discoverySha256(originalQids),
    audienceAnchorQids: ['Q1'],
    coverageWitnessQids: ['Q1'],
    reasonCodes: originalQids.map((qid) => ({
      qid,
      reasons: ['audience-en'] as const,
    })),
    primaryCost: '0',
    tierWeight: '1',
    witnessPartitionsSolved: 1,
  }
  const canonicalSelectionEvidence = {
    ...selectionCore,
    evidenceSha256: discoverySha256(selectionCore),
  }
  const identityOriginalSeed = deriveIndependentSampleSeed({
    canonicalCandidateReceiptSha256: acceptedCandidateReceiptSha256,
    predecessorCorpusSha256,
    orderedProposedPublishedQidSequenceSha256: discoverySha256(originalQids),
  })
  const identityLineage = Array.from(
    { length: replacementRound },
    (_, index) => {
      const round = index + 1
      const priorQids =
        index === 0
          ? originalQids
          : Array.from({ length: 5_000 }, (_, qidIndex) => qid(qidIndex + 1))
              .filter((value) => Number(value.slice(1)) > index)
              .concat(
                Array.from({ length: index }, (_, addedIndex) =>
                  qid(5_001 + addedIndex),
                ),
              )
              .sort(
                (left, right) => Number(left.slice(1)) - Number(right.slice(1)),
              )
      const currentOrderedQids = [...priorQids]
        .filter((value) => value !== qid(round))
        .concat(qid(5_000 + round))
        .sort((left, right) => Number(left.slice(1)) - Number(right.slice(1)))
      return {
        version: 'replacement-lineage.v1' as const,
        round,
        removedQids: [qid(round)],
        addedQids: [qid(5_000 + round)],
        previousOrderedQidSequenceSha256: discoverySha256(priorQids),
        currentOrderedQids,
        currentOrderedQidSequenceSha256: discoverySha256(currentOrderedQids),
        roundSeed: deriveIndependentSampleRoundSeed(
          identityOriginalSeed,
          round,
        ),
      }
    },
  )
  const identityReviewResults = identityLineage.map((lineage) => {
    const reviewInput = {
      version: 'identity-replacement-review-input.v1',
      candidateReceiptSha256: acceptedCandidateReceiptSha256,
      canonicalSelectionEvidenceSha256:
        canonicalSelectionEvidence.evidenceSha256,
      round: lineage.round,
      previousSelectedQidsSha256: lineage.previousOrderedQidSequenceSha256,
      roundSeed: lineage.roundSeed,
      reviewedQids: lineage.removedQids,
    }
    const core = {
      ...reviewInput,
      schema: 'zedarchive.anime-v2-identity-replacement-review-result' as const,
      version: 1 as const,
      removals: lineage.removedQids.map((qid) => ({
        qid,
        outcome: 'independent-review-rejected' as const,
      })),
    }
    return {
      schema: core.schema,
      version: core.version,
      candidateReceiptSha256: core.candidateReceiptSha256,
      canonicalSelectionEvidenceSha256: core.canonicalSelectionEvidenceSha256,
      round: core.round,
      previousSelectedQidsSha256: core.previousSelectedQidsSha256,
      roundSeed: core.roundSeed,
      removals: core.removals,
      reviewInputSha256: discoverySha256(reviewInput),
      resultSha256: discoverySha256(core),
    }
  })
  const proposalCore = {
    allocationRound: replacementRound + 1,
    candidateReceiptSha256: acceptedCandidateReceiptSha256,
    selectionRubricSha256: acceptedSelectionRubricSha256,
    canonicalSelectionEvidenceSha256: canonicalSelectionEvidence.evidenceSha256,
    finalizedContinuitySha256:
      canonicalSelectionEvidence.finalizedContinuitySha256,
    selectionAuthority: {
      kind: 'replacement-lineage' as const,
      commitmentSha256: replacementLineageSha256(identityLineage, {
        originalSeed: identityOriginalSeed,
        initialOrderedQids: originalQids,
      }),
    },
    orderedQids: [qidValue],
    orderedQidSequenceSha256: discoverySha256([qidValue]),
  }
  const proposal = {
    version: 'identity-proposal.v1' as const,
    ...proposalCore,
    proposalSha256: discoverySha256({
      version: 'identity-proposal.v1',
      ...proposalCore,
    }),
  }
  const reviewCore = {
    version: 'identity-review-input.v1',
    qid: qidValue,
    proposalSha256: proposal.proposalSha256,
    allocationRound: replacementRound + 1,
    candidateReceiptSha256: acceptedCandidateReceiptSha256,
    reducedProjectionSha256: projectionSha256,
  }
  return {
    proposal,
    authority: {
      canonicalSelectionEvidence,
      retainedPredecessorQids: ['Q5000'],
      predecessorCorpusSha256,
      identityReplacementLineage: identityLineage,
      identityReplacementReviewResults: identityReviewResults,
    },
    approval: {
      version: 'primary-identity-review-result.v1' as const,
      qid: qidValue,
      allocationRound: replacementRound + 1,
      candidateReceiptSha256: acceptedCandidateReceiptSha256,
      reducedProjectionSha256: projectionSha256,
      proposalSha256: proposal.proposalSha256,
      reviewInputSha256: discoverySha256(reviewCore),
      exactWorkIdentity: 'approved' as const,
      mediaScope: 'approved' as const,
      outcome: 'approved-exact-work' as const,
    },
  }
}

export function rebindRecord(
  record: IndependentReviewPopulationRecord,
  proposal: ReturnType<typeof createIndependentReviewProposal>,
): IndependentReviewPopulationRecord {
  const proposalRecordSha256 = independentReviewProposalRecordSha256({
    proposalSha256: proposal.proposalSha256,
    canonicalUuid: record.canonicalUuid,
    qid: record.qid,
  })
  const { projectionSha256: priorProjectionSha256, ...priorProjection } =
    record.projection
  void priorProjectionSha256
  const projectionCore = {
    ...priorProjection,
    proposalRecordSha256,
  }
  const projection = {
    ...projectionCore,
    projectionSha256: discoverySha256(projectionCore),
  }
  const { recordCommitment: priorRecordCommitment, ...priorRecord } = record
  void priorRecordCommitment
  const recordCore = {
    ...priorRecord,
    proposalRecordSha256,
    projection,
  }
  return {
    ...recordCore,
    recordCommitment: independentReviewRecordCommitment(recordCore),
  }
}

function replacementLineageEntry(
  round: number,
  priorQids: readonly string[],
  removedQid: string,
  addedQid: string,
  context: SuccessorFixtureContext = defaultSuccessorFixtureContext,
) {
  const currentOrderedQids = [...priorQids]
    .filter((value) => value !== removedQid)
    .concat(addedQid)
    .sort((left, right) => Number(left.slice(1)) - Number(right.slice(1)))
  return {
    version: 'replacement-lineage.v1' as const,
    round,
    removedQids: [removedQid],
    addedQids: [addedQid],
    previousOrderedQidSequenceSha256: discoverySha256(priorQids),
    currentOrderedQids,
    currentOrderedQidSequenceSha256: discoverySha256(currentOrderedQids),
    roundSeed: deriveIndependentSampleRoundSeed(
      context.root.seedAuthority.originalSeed,
      round,
    ),
  }
}

function identityReplacementResult(
  round: number,
  lineage: ReturnType<typeof replacementLineageEntry>,
  context: SuccessorFixtureContext = defaultSuccessorFixtureContext,
) {
  const reviewInput = {
    version: 'identity-replacement-review-input.v1',
    candidateReceiptSha256: context.root.proposal.candidateReceiptSha256,
    canonicalSelectionEvidenceSha256:
      context.root.proposal.canonicalSelectionEvidenceSha256,
    round,
    previousSelectedQidsSha256: lineage.previousOrderedQidSequenceSha256,
    roundSeed: lineage.roundSeed,
    reviewedQids: lineage.removedQids,
  }
  const core = {
    schema: 'zedarchive.anime-v2-identity-replacement-review-result' as const,
    version: 1 as const,
    candidateReceiptSha256: reviewInput.candidateReceiptSha256,
    canonicalSelectionEvidenceSha256:
      reviewInput.canonicalSelectionEvidenceSha256,
    round: reviewInput.round,
    previousSelectedQidsSha256: reviewInput.previousSelectedQidsSha256,
    roundSeed: reviewInput.roundSeed,
    removals: lineage.removedQids.map((qid) => ({
      qid,
      outcome: 'independent-review-rejected' as const,
    })),
  }
  const resultCore = { ...reviewInput, ...core }
  return {
    ...core,
    reviewInputSha256: discoverySha256(reviewInput),
    resultSha256: discoverySha256(resultCore),
  }
}

function successorProposal(
  qids: readonly string[],
  context: SuccessorFixtureContext = defaultSuccessorFixtureContext,
) {
  return createIndependentReviewProposal({
    candidateAuthoritySha256: context.root.proposal.candidateAuthoritySha256,
    candidateReceiptSha256: context.root.proposal.candidateReceiptSha256,
    predecessorResultSha256: context.root.proposal.predecessorResultSha256,
    predecessorCorpusSha256: context.root.proposal.predecessorCorpusSha256,
    canonicalSelectionEvidenceSha256:
      context.root.proposal.canonicalSelectionEvidenceSha256,
    orderedProposedPublishedQids: qids,
  })
}

function addedRecord(
  qidValue: string,
  canonicalUuid: string,
  proposal: ReturnType<typeof createIndependentReviewProposal>,
  approval: ReturnType<typeof identityFixture>['approval'],
  allocation: (typeof root.allocationLedger)[number],
  mandatoryRisk = false,
  context: SuccessorFixtureContext = defaultSuccessorFixtureContext,
): IndependentReviewPopulationRecord {
  const template = context.root.population.records[0]!
  const proposalRecordSha256 = independentReviewProposalRecordSha256({
    proposalSha256: proposal.proposalSha256,
    canonicalUuid,
    qid: qidValue,
  })
  const { projectionSha256: templateProjectionSha256, ...templateProjection } =
    template.projection
  void templateProjectionSha256
  const projectionCore = {
    ...templateProjection,
    canonicalUuid,
    qid: qidValue,
    proposalRecordSha256,
    identityReviewSha256: discoverySha256(approval),
    identityAllocationSha256: discoverySha256(allocation),
  }
  const projection = {
    ...projectionCore,
    projectionSha256: discoverySha256(projectionCore),
  }
  const { recordCommitment: templateRecordCommitment, ...templateRecord } =
    template
  void templateRecordCommitment
  const riskTriggers = mandatoryRisk
    ? { ...templateRecord.riskTriggers, sourceFlag: true }
    : templateRecord.riskTriggers
  const recordCore = {
    ...templateRecord,
    canonicalUuid,
    qid: qidValue,
    proposalRecordSha256,
    identityReviewSha256: discoverySha256(approval),
    identityAllocationSha256: discoverySha256(allocation),
    riskTriggers,
    mandatoryRiskReasons: deriveIndependentReviewRiskReasons(riskTriggers),
    projection,
  }
  return {
    ...recordCore,
    recordCommitment: independentReviewRecordCommitment(recordCore),
  }
}

function successorPopulation(
  round: number,
  priorSnapshotSha256: string,
  proposal: ReturnType<typeof createIndependentReviewProposal>,
  records: readonly IndependentReviewPopulationRecord[],
  context: SuccessorFixtureContext = defaultSuccessorFixtureContext,
) {
  const core = {
    schema:
      'zedarchive.anime-v2-independent-review-successor-population-authority' as const,
    version: 1 as const,
    rootSeedAuthoritySha256: context.root.seedAuthority.seedAuthoritySha256,
    reviewSeriesSha256: context.initialRootSnapshot.reviewSeriesSha256,
    round,
    proposalSha256: proposal.proposalSha256,
    orderedProposedPublishedQidSequenceSha256:
      proposal.orderedProposedPublishedQidSequenceSha256,
    priorAuthoritySnapshotSha256: priorSnapshotSha256,
    records: [...records].sort((left, right) =>
      left.canonicalUuid.localeCompare(right.canonicalUuid, 'en'),
    ),
  }
  return { ...core, populationSha256: discoverySha256(core) }
}

function successorProof(
  input: Readonly<{
    round: number
    priorSnapshot:
      | ReturnType<typeof createIndependentReviewInitialAuthoritySnapshot>
      | Record<string, unknown>
    priorProposal: ReturnType<typeof createIndependentReviewProposal>
    priorPopulation: { populationSha256: string }
    proposal: ReturnType<typeof createIndependentReviewProposal>
    population: ReturnType<typeof successorPopulation>
    lineage: readonly ReturnType<typeof replacementLineageEntry>[]
    ledger: readonly (typeof root.allocationLedger)[number][]
    history: readonly IdentityAllocationHistoryEvent[]
    addition: ReturnType<typeof identityFixture>
    allocation: (typeof root.allocationLedger)[number]
    removedQid: string
  }>,
  context: SuccessorFixtureContext = defaultSuccessorFixtureContext,
) {
  const identityResult = identityReplacementResult(
    input.round,
    input.lineage.at(-1)!,
    context,
  )
  const finalSelectionSha256 =
    input.proposal.orderedProposedPublishedQidSequenceSha256
  const priorRecord =
    input.round === 1
      ? context.root.population.records.find(
          (record) => record.qid === input.removedQid,
        )!
      : (
          input.priorSnapshot as {
            population: { records: IndependentReviewPopulationRecord[] }
          }
        ).population.records.find((record) => record.qid === input.removedQid)!
  const previousAllocation = input.ledger.find(
    (entry) => entry.qid === input.removedQid,
  )!
  const retirement = {
    version: identityAllocationHistoryVersion,
    event: 'retired' as const,
    qid: input.removedQid,
    catalogueItemId: priorRecord.canonicalUuid,
    proposalSha256: previousAllocation.proposedSelectionSha256,
    reviewRound: previousAllocation.allocationRound,
    reducedProjectionSha256: previousAllocation.reducedProjectionSha256,
    finalSelectionSha256,
    reason: 'independent-review-rejected' as const,
  }
  const additions = [
    {
      qid: input.allocation.qid,
      identityProposal: input.addition.proposal,
      identityProposalAuthority: input.addition.authority,
      primaryIdentityReviewResult: input.addition.approval,
      allocation: input.allocation,
    },
  ]
  const lineageAuthority = {
    originalSeed: context.root.seedAuthority.originalSeed,
    initialOrderedQids: context.root.proposal.orderedProposedPublishedQids,
  }
  const core = {
    schema: 'zedarchive.anime-v2-independent-review-replacement-proof' as const,
    version: 1 as const,
    reviewSeriesSha256: context.initialRootSnapshot.reviewSeriesSha256,
    round: input.round,
    priorAuthoritySnapshotSha256: (
      input.priorSnapshot as { authoritySnapshotSha256: string }
    ).authoritySnapshotSha256,
    priorProposalSha256: input.priorProposal.proposalSha256,
    priorPopulationSha256: input.priorPopulation.populationSha256,
    nextProposalSha256: input.proposal.proposalSha256,
    nextPopulationSha256: input.population.populationSha256,
    replacementLineage: input.lineage,
    replacementLineageSha256: replacementLineageSha256(
      input.lineage,
      lineageAuthority,
    ),
    identityReplacementReviewResult: identityResult,
    allocationLedger: input.ledger,
    allocationLedgerSha256: identityAllocationLedgerSha256(input.ledger),
    allocationHistory: input.history,
    allocationHistorySha256: independentReviewWorkingAllocationHistorySha256(
      input.history,
    ),
    additions,
    removals: [{ qid: input.removedQid, retirement }],
    triggeringDefects: [
      {
        planSha256: digest(`trigger-plan-${input.round}`),
        inputSha256: digest(`trigger-input-${input.round}`),
        resultSha256: digest(`trigger-result-${input.round}`),
        recordCommitment: priorRecord.recordCommitment,
        qid: input.removedQid,
        category: 'work-identity' as const,
      },
    ],
  }
  return { ...core, replacementProofSha256: discoverySha256(core) }
}

export function successorSnapshot(
  input: Readonly<{
    round: number
    priorSnapshot: { authoritySnapshotSha256: string }
    proposal: ReturnType<typeof createIndependentReviewProposal>
    population: ReturnType<typeof successorPopulation>
    replacementProof: ReturnType<typeof successorProof>
  }>,
  context: SuccessorFixtureContext = defaultSuccessorFixtureContext,
) {
  const core = {
    schema:
      'zedarchive.anime-v2-independent-review-authority-snapshot' as const,
    version: 1 as const,
    kind: 'successor' as const,
    round: input.round,
    rootSeedAuthoritySha256: context.root.seedAuthority.seedAuthoritySha256,
    reviewSeriesSha256: context.initialRootSnapshot.reviewSeriesSha256,
    priorAuthoritySnapshotSha256: input.priorSnapshot.authoritySnapshotSha256,
    proposal: input.proposal,
    population: input.population,
    replacementProof: input.replacementProof,
  }
  return { ...core, authoritySnapshotSha256: discoverySha256(core) }
}

export function rehashSnapshotProof(
  snapshot: ReturnType<typeof successorSnapshot>,
  replacementProof: ReturnType<typeof successorProof>,
) {
  const { replacementProofSha256, ...proofCore } = replacementProof
  void replacementProofSha256
  const proof = {
    ...proofCore,
    replacementProofSha256: discoverySha256(proofCore),
  }
  const { authoritySnapshotSha256, ...snapshotCore } = snapshot
  void authoritySnapshotSha256
  const nextCore = { ...snapshotCore, replacementProof: proof }
  return {
    ...nextCore,
    authoritySnapshotSha256: discoverySha256(nextCore),
  }
}

export function rehashRetainedRecordMutation(
  snapshot: ReturnType<typeof successorSnapshot>,
  qidValue: string,
  mutate: (
    record: IndependentReviewPopulationRecord,
  ) => IndependentReviewPopulationRecord,
) {
  const records = snapshot.population.records.map((record) => {
    if (record.qid !== qidValue) return record
    const mutated = mutate(record)
    const proposalRecordSha256 = independentReviewProposalRecordSha256({
      proposalSha256: snapshot.proposal.proposalSha256,
      canonicalUuid: mutated.canonicalUuid,
      qid: mutated.qid,
    })
    const { projectionSha256, ...projectionWithoutHash } = mutated.projection
    void projectionSha256
    const projectionCore = {
      ...projectionWithoutHash,
      proposalRecordSha256,
    }
    const projection = {
      ...projectionCore,
      projectionSha256: discoverySha256(projectionCore),
    }
    const { recordCommitment, ...recordWithoutCommitment } = mutated
    void recordCommitment
    const recordCore = {
      ...recordWithoutCommitment,
      proposalRecordSha256,
      projection,
    }
    return {
      ...recordCore,
      recordCommitment: independentReviewRecordCommitment(recordCore),
    }
  })
  const { populationSha256, ...populationWithoutHash } = snapshot.population
  void populationSha256
  const populationCore = { ...populationWithoutHash, records }
  const population = {
    ...populationCore,
    populationSha256: discoverySha256(populationCore),
  }
  const proofInput = {
    ...snapshot.replacementProof,
    nextPopulationSha256: population.populationSha256,
  }
  const { replacementProofSha256, ...proofCore } = proofInput
  void replacementProofSha256
  const replacementProof = {
    ...proofCore,
    replacementProofSha256: discoverySha256(proofCore),
  }
  const { authoritySnapshotSha256, ...snapshotWithoutHash } = snapshot
  void authoritySnapshotSha256
  const snapshotCore = {
    ...snapshotWithoutHash,
    population,
    replacementProof,
  }
  return {
    ...snapshotCore,
    authoritySnapshotSha256: discoverySha256(snapshotCore),
  }
}

type PredecessorProjection = Extract<
  IndependentReviewPopulationRecord['projection'],
  Readonly<{ kind: 'predecessor' }>
>

export function mutatePredecessorProjection(
  record: IndependentReviewPopulationRecord,
  mutate: (projection: PredecessorProjection) => PredecessorProjection,
): IndependentReviewPopulationRecord {
  if (record.projection.kind !== 'predecessor')
    throw new Error('Predecessor mutation fixture requires a predecessor row.')
  return { ...record, projection: mutate(record.projection) }
}

export function allocationHistory(
  allocation: (typeof root.allocationLedger)[number],
): IdentityAllocationHistoryEvent {
  return {
    version: identityAllocationHistoryVersion,
    event: 'allocated',
    qid: allocation.qid,
    catalogueItemId: allocation.catalogueItemId,
    proposalSha256: allocation.proposedSelectionSha256,
    reviewRound: allocation.allocationRound,
    reducedProjectionSha256: allocation.reducedProjectionSha256,
  }
}

function retirementHistory(
  qidValue: string,
  priorRecords: readonly IndependentReviewPopulationRecord[],
  ledger: readonly (typeof root.allocationLedger)[number][],
  nextProposal: ReturnType<typeof createIndependentReviewProposal>,
): IdentityAllocationHistoryEvent {
  const record = priorRecords.find((value) => value.qid === qidValue)!
  const allocation = ledger.find((value) => value.qid === qidValue)!
  return {
    version: identityAllocationHistoryVersion,
    event: 'retired',
    qid: qidValue,
    catalogueItemId: record.canonicalUuid,
    proposalSha256: allocation.proposedSelectionSha256,
    reviewRound: allocation.allocationRound,
    reducedProjectionSha256: allocation.reducedProjectionSha256,
    finalSelectionSha256:
      nextProposal.orderedProposedPublishedQidSequenceSha256,
    reason: 'independent-review-rejected',
  }
}

function addedAllocation(
  qidValue: string,
  canonicalUuid: string,
  fixture: ReturnType<typeof identityFixture>,
) {
  return {
    version: identityAllocationVersion,
    qid: qidValue,
    catalogueItemId: canonicalUuid,
    canonicalCandidateReceiptSha256: acceptedCandidateReceiptSha256,
    reducedProjectionSha256: fixture.approval.reducedProjectionSha256,
    identityOutcome: 'approved-exact-work' as const,
    proposedSelectionSha256: fixture.proposal.proposalSha256,
    allocationRound: fixture.approval.allocationRound,
  }
}

type ParsedSuccessorRounds = Readonly<{
  rootSnapshot: ReturnType<
    typeof createIndependentReviewInitialAuthoritySnapshot
  >
  firstSnapshot: ReturnType<typeof successorSnapshot>
  secondSnapshot: ReturnType<typeof successorSnapshot>
}>

export type ParsedSuccessorRemovalPair = Readonly<{
  firstRemovedQid: string
  secondRemovedQid: string
}>

export type ParsedSuccessorFixtureVariantInput = Readonly<{
  firstRemovedQid: string
  secondRemovedQid: string
  mandatoryAddedRounds: readonly (1 | 2)[]
}>

const parsedSuccessorRoundsByRemovalPair = new Map<
  string,
  ParsedSuccessorRounds
>()

function assertRemovalCandidate(
  qidValue: unknown,
  records: readonly IndependentReviewPopulationRecord[],
  description: string,
): asserts qidValue is string {
  if (typeof qidValue !== 'string' || !/^Q[1-9][0-9]*$/.test(qidValue))
    throw new Error(`${description} must be a canonical QID.`)
  const record = records.find(({ qid }) => qid === qidValue)
  if (!record || record.projection.kind !== 'new-candidate')
    throw new Error(
      `${description} must identify an existing new-candidate record.`,
    )
}

export function createParsedSuccessorRoundsForRemovals(
  input: ParsedSuccessorRemovalPair,
): ParsedSuccessorRounds {
  if (
    input === null ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    JSON.stringify(Object.keys(input).sort()) !==
      JSON.stringify(['firstRemovedQid', 'secondRemovedQid'])
  )
    throw new Error(
      'Independent-review successor fixture removal pair is not exact.',
    )
  assertRemovalCandidate(
    input.firstRemovedQid,
    root.population.records,
    'First successor fixture removal',
  )
  if (input.secondRemovedQid === input.firstRemovedQid)
    throw new Error('Successor fixture removals must be distinct.')
  return createParsedSuccessorRoundsVariantInternal(input, [])
}

export function createParsedSuccessorRoundsVariant(
  input: unknown,
): ParsedSuccessorRounds {
  const value = strictFixtureObject(
    input,
    ['firstRemovedQid', 'secondRemovedQid', 'mandatoryAddedRounds'],
    'Independent-review successor fixture variant',
  )
  assertRemovalCandidate(
    value.firstRemovedQid,
    root.population.records,
    'First successor fixture removal',
  )
  if (
    typeof value.secondRemovedQid !== 'string' ||
    value.secondRemovedQid === value.firstRemovedQid
  )
    throw new Error(
      'Successor fixture removals must be distinct canonical QIDs.',
    )
  if (
    !Array.isArray(value.mandatoryAddedRounds) ||
    value.mandatoryAddedRounds.some((round) => round !== 1 && round !== 2) ||
    new Set(value.mandatoryAddedRounds).size !==
      value.mandatoryAddedRounds.length ||
    canonicalJson([...value.mandatoryAddedRounds].sort()) !==
      canonicalJson(value.mandatoryAddedRounds)
  )
    throw new Error(
      'Successor fixture mandatory-added rounds must be a unique ascending subset of one and two.',
    )
  return createParsedSuccessorRoundsVariantInternal(
    {
      firstRemovedQid: value.firstRemovedQid,
      secondRemovedQid: value.secondRemovedQid,
    },
    value.mandatoryAddedRounds as readonly (1 | 2)[],
  )
}

export function createIndependentReviewExactEmptySuccessorFixture(
  input: unknown,
): ParsedSuccessorRounds {
  const value = strictFixtureObject(
    input,
    ['firstRemovedQid', 'secondRemovedQid'],
    'Independent-review exact-empty successor fixture',
  )
  const exactRootFixture = createIndependentReviewExactEmptyRootFixture()
  assertRemovalCandidate(
    value.firstRemovedQid,
    exactRootFixture.root.population.records,
    'First exact-empty successor fixture removal',
  )
  if (
    typeof value.secondRemovedQid !== 'string' ||
    value.secondRemovedQid === value.firstRemovedQid
  )
    throw new Error(
      'Exact-empty successor fixture removals must be distinct canonical QIDs.',
    )
  return createParsedSuccessorRoundsVariantInternal(
    {
      firstRemovedQid: value.firstRemovedQid,
      secondRemovedQid: value.secondRemovedQid,
    },
    [1],
    {
      root: exactRootFixture.root,
      initialRootSnapshot: exactRootFixture.initialSnapshot,
    },
  )
}

function createParsedSuccessorRoundsVariantInternal(
  input: ParsedSuccessorRemovalPair,
  mandatoryAddedRounds: readonly (1 | 2)[],
  context: SuccessorFixtureContext = defaultSuccessorFixtureContext,
): ParsedSuccessorRounds {
  const cacheKey = `${context.initialRootSnapshot.authoritySnapshotSha256}:${input.firstRemovedQid}:${input.secondRemovedQid}:${mandatoryAddedRounds.join(',')}`
  const cached = parsedSuccessorRoundsByRemovalPair.get(cacheKey)
  if (cached !== undefined) return cached

  const rootSnapshot = context.initialRootSnapshot
  const firstLineage = replacementLineageEntry(
    1,
    context.root.proposal.orderedProposedPublishedQids,
    input.firstRemovedQid,
    'Q5001',
    context,
  )
  const firstProposal = successorProposal(
    firstLineage.currentOrderedQids,
    context,
  )
  const firstIdentity = identityFixture(
    'Q5001',
    digest('Q5001-projection'),
    1,
    context,
  )
  const firstAllocation = addedAllocation('Q5001', uuid(5001), firstIdentity)
  const firstRecords = [
    ...context.root.population.records
      .filter((record) => record.qid !== input.firstRemovedQid)
      .map((record) => rebindRecord(record, firstProposal)),
    addedRecord(
      'Q5001',
      uuid(5001),
      firstProposal,
      firstIdentity.approval,
      firstAllocation,
      mandatoryAddedRounds.includes(1),
      context,
    ),
  ]
  const firstPopulation = successorPopulation(
    1,
    rootSnapshot.authoritySnapshotSha256,
    firstProposal,
    firstRecords,
    context,
  )
  const firstLedger = [...context.root.allocationLedger, firstAllocation]
  const firstHistory = [
    ...context.root.allocationHistory,
    retirementHistory(
      input.firstRemovedQid,
      context.root.population.records,
      firstLedger,
      firstProposal,
    ),
    allocationHistory(firstAllocation),
  ]
  const firstProof = successorProof(
    {
      round: 1,
      priorSnapshot: rootSnapshot,
      priorProposal: context.root.proposal,
      priorPopulation: context.root.population,
      proposal: firstProposal,
      population: firstPopulation,
      lineage: [firstLineage],
      ledger: firstLedger,
      history: firstHistory,
      addition: firstIdentity,
      allocation: firstAllocation,
      removedQid: input.firstRemovedQid,
    },
    context,
  )
  const firstSnapshot = successorSnapshot(
    {
      round: 1,
      priorSnapshot: rootSnapshot,
      proposal: firstProposal,
      population: firstPopulation,
      replacementProof: firstProof,
    },
    context,
  )

  assertRemovalCandidate(
    input.secondRemovedQid,
    firstPopulation.records,
    'Second successor fixture removal',
  )

  const secondLineage = replacementLineageEntry(
    2,
    firstProposal.orderedProposedPublishedQids,
    input.secondRemovedQid,
    'Q5002',
    context,
  )
  const secondProposal = successorProposal(
    secondLineage.currentOrderedQids,
    context,
  )
  const secondIdentity = identityFixture(
    'Q5002',
    digest('Q5002-projection'),
    2,
    context,
  )
  const secondAllocation = addedAllocation('Q5002', uuid(5002), secondIdentity)
  const secondRecords = [
    ...firstPopulation.records
      .filter((record) => record.qid !== input.secondRemovedQid)
      .map((record) => rebindRecord(record, secondProposal)),
    addedRecord(
      'Q5002',
      uuid(5002),
      secondProposal,
      secondIdentity.approval,
      secondAllocation,
      mandatoryAddedRounds.includes(2),
      context,
    ),
  ]
  const secondPopulation = successorPopulation(
    2,
    firstSnapshot.authoritySnapshotSha256,
    secondProposal,
    secondRecords,
    context,
  )
  const secondLedger = [...firstLedger, secondAllocation]
  const secondHistory = [
    ...firstHistory,
    retirementHistory(
      input.secondRemovedQid,
      firstPopulation.records,
      secondLedger,
      secondProposal,
    ),
    allocationHistory(secondAllocation),
  ]
  const secondProof = successorProof(
    {
      round: 2,
      priorSnapshot: firstSnapshot,
      priorProposal: firstProposal,
      priorPopulation: firstPopulation,
      proposal: secondProposal,
      population: secondPopulation,
      lineage: [firstLineage, secondLineage],
      ledger: secondLedger,
      history: secondHistory,
      addition: secondIdentity,
      allocation: secondAllocation,
      removedQid: input.secondRemovedQid,
    },
    context,
  )
  const secondSnapshot = successorSnapshot(
    {
      round: 2,
      priorSnapshot: firstSnapshot,
      proposal: secondProposal,
      population: secondPopulation,
      replacementProof: secondProof,
    },
    context,
  )
  const rounds = { rootSnapshot, firstSnapshot, secondSnapshot }
  parsedSuccessorRoundsByRemovalPair.set(cacheKey, rounds)
  return rounds
}

export function createParsedSuccessorRounds(): ParsedSuccessorRounds {
  return createParsedSuccessorRoundsForRemovals({
    firstRemovedQid: 'Q1',
    secondRemovedQid: 'Q2',
  })
}

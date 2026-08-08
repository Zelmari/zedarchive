import { readdirSync, readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  createIndependentReviewPopulationAuthority,
  createIndependentReviewProposal,
  createIndependentReviewSeedAuthority,
  deriveIndependentReviewRiskReasons,
  independentReviewProposalRecordSha256,
  independentReviewRecordCommitment,
  parseIndependentReviewPopulationAuthority,
  type IndependentReviewPopulationRecord,
  type IndependentReviewRiskTriggers,
} from '@/features/anime/catalogue/anime-release-v2-independent-review'
import {
  createIndependentReviewInitialAuthoritySnapshot,
  deriveIndependentReviewSeriesSha256,
  independentReviewWorkingAllocationHistorySha256,
  parseIndependentReviewInitialAuthoritySnapshot,
  parseIndependentReviewSuccessorAuthoritySnapshotForFixture,
} from '@/features/anime/catalogue/anime-release-v2-independent-review-successor-authority'
import {
  acceptedCandidateReceiptSha256,
  identityAllocationLedgerSha256,
  identityAllocationVersion,
  acceptedSelectionRubricSha256,
  identityAllocationHistoryVersion,
  type IdentityAllocationHistoryEvent,
} from '@/features/anime/catalogue/anime-release-v2-identity-allocation'
import {
  deriveIndependentSampleSeed,
  deriveIndependentSampleRoundSeed,
  replacementLineageSha256,
} from '@/features/anime/catalogue/anime-release-v2-lineage'
import { discoverySha256 } from '@/features/anime/catalogue/wikidata-anime-discovery'

const digest = (value: string) => discoverySha256({ value })
const qid = (index: number) => `Q${index}`
const uuid = (index: number) =>
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

function createRootTuple() {
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
    const riskTriggers = triggers()
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
        acquisitionCohort: number === 5_000 ? 'predecessor-v1' : '001',
        selectionCohort: {
          discoveryReasons: ['audience-en'],
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

const root = createRootTuple()
const initialRootSnapshot =
  createIndependentReviewInitialAuthoritySnapshot(root)

function identityFixture(
  qidValue: string,
  projectionSha256: string,
  replacementRound = 1,
) {
  const originalQids = root.proposal.orderedProposedPublishedQids
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

function rebindRecord(
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
      root.seedAuthority.originalSeed,
      round,
    ),
  }
}

function identityReplacementResult(
  round: number,
  lineage: ReturnType<typeof replacementLineageEntry>,
) {
  const reviewInput = {
    version: 'identity-replacement-review-input.v1',
    candidateReceiptSha256: root.proposal.candidateReceiptSha256,
    canonicalSelectionEvidenceSha256:
      root.proposal.canonicalSelectionEvidenceSha256,
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

function successorProposal(qids: readonly string[]) {
  return createIndependentReviewProposal({
    candidateAuthoritySha256: root.proposal.candidateAuthoritySha256,
    candidateReceiptSha256: root.proposal.candidateReceiptSha256,
    predecessorResultSha256: root.proposal.predecessorResultSha256,
    predecessorCorpusSha256: root.proposal.predecessorCorpusSha256,
    canonicalSelectionEvidenceSha256:
      root.proposal.canonicalSelectionEvidenceSha256,
    orderedProposedPublishedQids: qids,
  })
}

function addedRecord(
  qidValue: string,
  canonicalUuid: string,
  proposal: ReturnType<typeof createIndependentReviewProposal>,
  approval: ReturnType<typeof identityFixture>['approval'],
  allocation: (typeof root.allocationLedger)[number],
): IndependentReviewPopulationRecord {
  const template = root.population.records[0]!
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
  const recordCore = {
    ...templateRecord,
    canonicalUuid,
    qid: qidValue,
    proposalRecordSha256,
    identityReviewSha256: discoverySha256(approval),
    identityAllocationSha256: discoverySha256(allocation),
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
) {
  const core = {
    schema:
      'zedarchive.anime-v2-independent-review-successor-population-authority' as const,
    version: 1 as const,
    rootSeedAuthoritySha256: root.seedAuthority.seedAuthoritySha256,
    reviewSeriesSha256: initialRootSnapshot.reviewSeriesSha256,
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
) {
  const identityResult = identityReplacementResult(
    input.round,
    input.lineage.at(-1)!,
  )
  const finalSelectionSha256 =
    input.proposal.orderedProposedPublishedQidSequenceSha256
  const priorRecord =
    input.round === 1
      ? root.population.records.find(
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
    originalSeed: root.seedAuthority.originalSeed,
    initialOrderedQids: root.proposal.orderedProposedPublishedQids,
  }
  const core = {
    schema: 'zedarchive.anime-v2-independent-review-replacement-proof' as const,
    version: 1 as const,
    reviewSeriesSha256: initialRootSnapshot.reviewSeriesSha256,
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
    triggeringPlanSha256: digest(`trigger-plan-${input.round}`),
    triggeringInputSha256: digest(`trigger-input-${input.round}`),
    triggeringResultSha256: digest(`trigger-result-${input.round}`),
  }
  return { ...core, replacementProofSha256: discoverySha256(core) }
}

function successorSnapshot(
  input: Readonly<{
    round: number
    priorSnapshot: { authoritySnapshotSha256: string }
    proposal: ReturnType<typeof createIndependentReviewProposal>
    population: ReturnType<typeof successorPopulation>
    replacementProof: ReturnType<typeof successorProof>
  }>,
) {
  const core = {
    schema:
      'zedarchive.anime-v2-independent-review-authority-snapshot' as const,
    version: 1 as const,
    kind: 'successor' as const,
    round: input.round,
    rootSeedAuthoritySha256: root.seedAuthority.seedAuthoritySha256,
    reviewSeriesSha256: initialRootSnapshot.reviewSeriesSha256,
    priorAuthoritySnapshotSha256: input.priorSnapshot.authoritySnapshotSha256,
    proposal: input.proposal,
    population: input.population,
    replacementProof: input.replacementProof,
  }
  return { ...core, authoritySnapshotSha256: discoverySha256(core) }
}

function rehashSnapshotProof(
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

function rehashRetainedRecordMutation(
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

function mutatePredecessorProjection(
  record: IndependentReviewPopulationRecord,
  mutate: (projection: PredecessorProjection) => PredecessorProjection,
): IndependentReviewPopulationRecord {
  if (record.projection.kind !== 'predecessor')
    throw new Error('Predecessor mutation fixture requires a predecessor row.')
  return { ...record, projection: mutate(record.projection) }
}

function allocationHistory(
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

let parsedSuccessorRounds: ParsedSuccessorRounds | undefined

function createParsedSuccessorRounds(): ParsedSuccessorRounds {
  if (parsedSuccessorRounds !== undefined) return parsedSuccessorRounds
  const rootSnapshot = initialRootSnapshot
  const firstLineage = replacementLineageEntry(
    1,
    root.proposal.orderedProposedPublishedQids,
    'Q1',
    'Q5001',
  )
  const firstProposal = successorProposal(firstLineage.currentOrderedQids)
  const firstIdentity = identityFixture('Q5001', digest('Q5001-projection'))
  const firstAllocation = addedAllocation('Q5001', uuid(5001), firstIdentity)
  const firstRecords = [
    ...root.population.records
      .filter((record) => record.qid !== 'Q1')
      .map((record) => rebindRecord(record, firstProposal)),
    addedRecord(
      'Q5001',
      uuid(5001),
      firstProposal,
      firstIdentity.approval,
      firstAllocation,
    ),
  ]
  const firstPopulation = successorPopulation(
    1,
    rootSnapshot.authoritySnapshotSha256,
    firstProposal,
    firstRecords,
  )
  const firstLedger = [...root.allocationLedger, firstAllocation]
  const firstHistory = [
    ...root.allocationHistory,
    retirementHistory(
      'Q1',
      root.population.records,
      firstLedger,
      firstProposal,
    ),
    allocationHistory(firstAllocation),
  ]
  const firstProof = successorProof({
    round: 1,
    priorSnapshot: rootSnapshot,
    priorProposal: root.proposal,
    priorPopulation: root.population,
    proposal: firstProposal,
    population: firstPopulation,
    lineage: [firstLineage],
    ledger: firstLedger,
    history: firstHistory,
    addition: firstIdentity,
    allocation: firstAllocation,
    removedQid: 'Q1',
  })
  const firstSnapshot = successorSnapshot({
    round: 1,
    priorSnapshot: rootSnapshot,
    proposal: firstProposal,
    population: firstPopulation,
    replacementProof: firstProof,
  })

  const secondLineage = replacementLineageEntry(
    2,
    firstProposal.orderedProposedPublishedQids,
    'Q2',
    'Q5002',
  )
  const secondProposal = successorProposal(secondLineage.currentOrderedQids)
  const secondIdentity = identityFixture('Q5002', digest('Q5002-projection'), 2)
  const secondAllocation = addedAllocation('Q5002', uuid(5002), secondIdentity)
  const secondRecords = [
    ...firstPopulation.records
      .filter((record) => record.qid !== 'Q2')
      .map((record) => rebindRecord(record, secondProposal)),
    addedRecord(
      'Q5002',
      uuid(5002),
      secondProposal,
      secondIdentity.approval,
      secondAllocation,
    ),
  ]
  const secondPopulation = successorPopulation(
    2,
    firstSnapshot.authoritySnapshotSha256,
    secondProposal,
    secondRecords,
  )
  const secondLedger = [...firstLedger, secondAllocation]
  const secondHistory = [
    ...firstHistory,
    retirementHistory(
      'Q2',
      firstPopulation.records,
      secondLedger,
      secondProposal,
    ),
    allocationHistory(secondAllocation),
  ]
  const secondProof = successorProof({
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
    removedQid: 'Q2',
  })
  const secondSnapshot = successorSnapshot({
    round: 2,
    priorSnapshot: firstSnapshot,
    proposal: secondProposal,
    population: secondPopulation,
    replacementProof: secondProof,
  })
  parsedSuccessorRounds = { rootSnapshot, firstSnapshot, secondSnapshot }
  return parsedSuccessorRounds
}

describe('Decision 098 initial authority snapshot', () => {
  it('derives one root-series commitment from the complete parsed tuple', () => {
    const snapshot = initialRootSnapshot
    expect(snapshot.reviewSeriesSha256).toBe(
      deriveIndependentReviewSeriesSha256(
        root.seedAuthority,
        root.proposal,
        root.population,
      ),
    )
    expect(parseIndependentReviewInitialAuthoritySnapshot(snapshot)).toEqual(
      snapshot,
    )
  })

  it.each([
    'candidateReceiptSha256',
    'predecessorCorpusSha256',
    'orderedProposedPublishedQidSequenceSha256',
    'originalSeed',
    'seedAuthoritySha256',
  ])('rejects root seed mutation: %s', (field) => {
    const snapshot = initialRootSnapshot
    expect(() =>
      parseIndependentReviewInitialAuthoritySnapshot({
        ...snapshot,
        seedAuthority: { ...snapshot.seedAuthority, [field]: digest(field) },
      }),
    ).toThrow()
  })

  it.each([
    'proposalSha256',
    'orderedProposedPublishedQidSequenceSha256',
    'candidateAuthoritySha256',
  ])('rejects root proposal mutation: %s', (field) => {
    const snapshot = initialRootSnapshot
    expect(() =>
      parseIndependentReviewInitialAuthoritySnapshot({
        ...snapshot,
        proposal: { ...snapshot.proposal, [field]: digest(field) },
      }),
    ).toThrow()
  })

  it('rejects a root population substitution and snapshot hash substitution', () => {
    const snapshot = initialRootSnapshot
    const record = snapshot.population.records[0]!
    const changed = {
      ...record,
      identityReviewSha256: digest('substituted-review'),
    }
    expect(() =>
      parseIndependentReviewPopulationAuthority(
        {
          ...snapshot.population,
          records: [changed, ...snapshot.population.records.slice(1)],
        },
        snapshot.proposal,
        snapshot.seedAuthority,
      ),
    ).toThrow()
    expect(() =>
      parseIndependentReviewInitialAuthoritySnapshot({
        ...snapshot,
        authoritySnapshotSha256: digest('forged-snapshot'),
      }),
    ).toThrow(/snapshot commitment/)
  })

  it('keeps the successor module acyclic: it cannot import result/history', () => {
    const source = readFileSync(
      new URL(
        './anime-release-v2-independent-review-successor-authority.ts',
        import.meta.url,
      ),
      'utf8',
    )
    expect(source).not.toMatch(/independent-review-result/)
    expect(source).not.toMatch(
      /export function prepareIndependentReviewSuccessorSamplingCore/,
    )
  })

  it('permits the fixture parser to be imported only by test files', () => {
    const catalogueDirectory = new URL('./', import.meta.url)
    const files = (directory: URL): string[] =>
      readdirSync(directory).flatMap((entry) => {
        const target = new URL(entry, directory)
        return statSync(target).isDirectory()
          ? files(target)
          : target.pathname.endsWith('.ts')
            ? [target.pathname]
            : []
      })
    const productionImports = files(catalogueDirectory).filter((file) => {
      if (file.endsWith('.test.ts') || file.endsWith('.spec.ts')) return false
      const source = readFileSync(file, 'utf8')
      return (
        file !==
          new URL(
            './anime-release-v2-independent-review-successor-authority.ts',
            import.meta.url,
          ).pathname &&
        source.includes(
          'parseIndependentReviewSuccessorAuthoritySnapshotForFixture',
        )
      )
    })
    expect(productionImports).toEqual([])
  })

  it('uses an append-only M45-07 working history and rejects premature active finalization', () => {
    expect(
      identityFixture('Q5001', digest('fixture-projection')).proposal
        .orderedQids,
    ).toEqual(['Q5001'])
    const allocated = {
      version: identityAllocationHistoryVersion,
      event: 'allocated' as const,
      qid: 'Q1',
      catalogueItemId: uuid(1),
      proposalSha256: digest('proposal'),
      reviewRound: 1,
      reducedProjectionSha256: digest('projection'),
    }
    expect(
      independentReviewWorkingAllocationHistorySha256([allocated]),
    ).toMatch(/^[a-f0-9]{64}$/)
    expect(() =>
      independentReviewWorkingAllocationHistorySha256([
        allocated,
        {
          ...allocated,
          event: 'active' as const,
          finalSelectionSha256: digest('final'),
        },
      ]),
    ).toThrow(/active allocations/)
  })

  it('binds the exact mixed root allocation pair and rejects custody mutations', () => {
    const snapshot = initialRootSnapshot
    expect(
      snapshot.population.records.filter(
        (record) => record.projection.kind === 'new-candidate',
      ),
    ).toHaveLength(4_999)
    expect(
      snapshot.population.records.filter(
        (record) => record.projection.kind === 'predecessor',
      ),
    ).toHaveLength(1)
    expect(snapshot.allocationLedger).toHaveLength(4_999)
    expect(snapshot.allocationHistory).toHaveLength(4_999)

    const reorderedLedger = [...snapshot.allocationLedger]
    ;[reorderedLedger[0], reorderedLedger[1]] = [
      reorderedLedger[1]!,
      reorderedLedger[0]!,
    ]
    const substitutions: unknown[] = [
      { ...snapshot, allocationLedger: reorderedLedger },
      {
        ...snapshot,
        allocationLedger: snapshot.allocationLedger.slice(1),
        allocationHistory: snapshot.allocationHistory.slice(1),
      },
      {
        ...snapshot,
        allocationLedger: [
          ...snapshot.allocationLedger,
          {
            ...snapshot.allocationLedger[0]!,
            qid: 'Q5000',
            catalogueItemId: uuid(5000),
          },
        ],
        allocationHistory: [
          ...snapshot.allocationHistory,
          {
            ...snapshot.allocationHistory[0]!,
            qid: 'Q5000',
            catalogueItemId: uuid(5000),
          },
        ],
      },
      {
        ...snapshot,
        allocationHistory: snapshot.allocationHistory.map((event, index) =>
          index === 0
            ? {
                ...event,
                event: 'active' as const,
                finalSelectionSha256: digest('premature-active'),
              }
            : event,
        ),
      },
      {
        ...snapshot,
        allocationHistory: snapshot.allocationHistory.map((event, index) =>
          index === 0
            ? {
                ...event,
                event: 'retired' as const,
                finalSelectionSha256: digest('premature-retired'),
                reason: 'independent-review-rejected' as const,
              }
            : event,
        ),
      },
      {
        ...snapshot,
        allocationLedgerSha256: digest('forged-root-ledger'),
      },
      {
        ...snapshot,
        allocationHistorySha256: digest('forged-root-history'),
      },
    ]
    for (const substitution of substitutions)
      expect(() =>
        parseIndependentReviewInitialAuthoritySnapshot(substitution),
      ).toThrow()
  }, 60_000)
})

describe('Decisions 098–100 successor authority', () => {
  it('parses genuine 5,000-record round-one and contiguous round-two successor snapshots', () => {
    const { rootSnapshot, firstSnapshot, secondSnapshot } =
      createParsedSuccessorRounds()
    expect(
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
        firstSnapshot,
        {
          rootSnapshot,
          priorSuccessorSnapshots: [],
        },
      ),
    ).toEqual(firstSnapshot)
    expect(
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
        secondSnapshot,
        {
          rootSnapshot,
          priorSuccessorSnapshots: [firstSnapshot],
        },
      ),
    ).toEqual(secondSnapshot)
  }, 30_000)

  it('uses Decision100 one-way proof-to-population binding and rejects the removed population proof field', () => {
    const { rootSnapshot, firstSnapshot } = createParsedSuccessorRounds()
    expect(() =>
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
        {
          ...firstSnapshot,
          population: {
            ...firstSnapshot.population,
            replacementProofSha256:
              firstSnapshot.replacementProof.replacementProofSha256,
          },
        },
        { rootSnapshot, priorSuccessorSnapshots: [] },
      ),
    ).toThrow(/unknown fields/)
    expect(() =>
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
        {
          ...firstSnapshot,
          replacementProof: {
            ...firstSnapshot.replacementProof,
            nextPopulationSha256: digest('swapped-population'),
          },
        },
        { rootSnapshot, priorSuccessorSnapshots: [] },
      ),
    ).toThrow(/detached authority commitments/)
  })

  it.each([
    'rootSeedAuthoritySha256',
    'reviewSeriesSha256',
    'priorAuthoritySnapshotSha256',
    'authoritySnapshotSha256',
  ])('rejects a successor snapshot commitment mutation: %s', (field) => {
    const { rootSnapshot, firstSnapshot } = createParsedSuccessorRounds()
    expect(() =>
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
        { ...firstSnapshot, [field]: digest(`mutated-${field}`) },
        { rootSnapshot, priorSuccessorSnapshots: [] },
      ),
    ).toThrow()
  })

  it.each([
    'proposalSha256',
    'orderedProposedPublishedQidSequenceSha256',
    'priorAuthoritySnapshotSha256',
    'populationSha256',
  ])('rejects a successor population commitment mutation: %s', (field) => {
    const { rootSnapshot, firstSnapshot } = createParsedSuccessorRounds()
    expect(() =>
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
        {
          ...firstSnapshot,
          population: {
            ...firstSnapshot.population,
            [field]: digest(`mutated-${field}`),
          },
        },
        { rootSnapshot, priorSuccessorSnapshots: [] },
      ),
    ).toThrow()
  })

  it.each([
    'priorProposalSha256',
    'priorPopulationSha256',
    'nextProposalSha256',
    'nextPopulationSha256',
    'replacementLineageSha256',
    'allocationLedgerSha256',
    'allocationHistorySha256',
    'triggeringPlanSha256',
    'triggeringInputSha256',
    'triggeringResultSha256',
    'replacementProofSha256',
  ])('rejects a replacement proof commitment mutation: %s', (field) => {
    const { rootSnapshot, firstSnapshot } = createParsedSuccessorRounds()
    expect(() =>
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
        {
          ...firstSnapshot,
          replacementProof: {
            ...firstSnapshot.replacementProof,
            [field]: digest(`mutated-${field}`),
          },
        },
        { rootSnapshot, priorSuccessorSnapshots: [] },
      ),
    ).toThrow()
  })

  it('proves the exact four-member retained-record proposal rebind and rejects substantive drift', () => {
    const { rootSnapshot, firstSnapshot } = createParsedSuccessorRounds()
    const rootRecord = rootSnapshot.population.records.find(
      (record) => record.qid === 'Q3',
    )!
    const successorRecord = firstSnapshot.population.records.find(
      (record) => record.qid === 'Q3',
    )!
    expect(rootRecord.canonicalUuid).toBe(successorRecord.canonicalUuid)
    expect(rootRecord.proposalRecordSha256).not.toBe(
      successorRecord.proposalRecordSha256,
    )
    expect(rootRecord.projection.proposalRecordSha256).not.toBe(
      successorRecord.projection.proposalRecordSha256,
    )
    expect(rootRecord.projection.projectionSha256).not.toBe(
      successorRecord.projection.projectionSha256,
    )
    expect(rootRecord.recordCommitment).not.toBe(
      successorRecord.recordCommitment,
    )
    expect(() =>
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
        {
          ...firstSnapshot,
          population: {
            ...firstSnapshot.population,
            records: firstSnapshot.population.records.map((record) =>
              record.qid === 'Q3'
                ? {
                    ...record,
                    projection: {
                      ...record.projection,
                      proposedItem: {
                        ...record.projection.proposedItem,
                        titles: {
                          ...record.projection.proposedItem.titles,
                          english: 'substantive drift',
                        },
                      },
                    },
                  }
                : record,
            ),
          },
        },
        { rootSnapshot, priorSuccessorSnapshots: [] },
      ),
    ).toThrow()
  })

  it('rejects every rehashed nonpermitted retained record and projection layer mutation', () => {
    const { rootSnapshot, firstSnapshot } = createParsedSuccessorRounds()
    const projectionMutation = (
      record: IndependentReviewPopulationRecord,
      projection: Partial<IndependentReviewPopulationRecord['projection']>,
    ) =>
      ({
        ...record,
        projection: { ...record.projection, ...projection },
      }) as IndependentReviewPopulationRecord
    const cases: readonly Readonly<{
      name: string
      mutate: (
        record: IndependentReviewPopulationRecord,
      ) => IndependentReviewPopulationRecord
    }>[] = [
      {
        name: 'canonical UUID',
        mutate: (record) =>
          projectionMutation(
            { ...record, canonicalUuid: uuid(9000) },
            { canonicalUuid: uuid(9000) },
          ),
      },
      {
        name: 'QID',
        mutate: (record) =>
          projectionMutation({ ...record, qid: 'Q6000' }, { qid: 'Q6000' }),
      },
      {
        name: 'identity review',
        mutate: (record) => {
          const value = digest('changed-identity-review')
          return projectionMutation(
            { ...record, identityReviewSha256: value },
            { identityReviewSha256: value },
          )
        },
      },
      {
        name: 'identity allocation',
        mutate: (record) => {
          const value = digest('changed-identity-allocation')
          return projectionMutation(
            { ...record, identityAllocationSha256: value },
            { identityAllocationSha256: value },
          )
        },
      },
      {
        name: 'primary evidence',
        mutate: (record) => ({
          ...record,
          primaryReviewEvidenceSha256: digest('changed-primary-evidence'),
        }),
      },
      {
        name: 'primary required',
        mutate: (record) =>
          projectionMutation(
            { ...record, primaryReviewRequired: false },
            { primaryReviewRequired: false },
          ),
      },
      {
        name: 'primary complete',
        mutate: (record) =>
          projectionMutation(
            { ...record, primaryReviewComplete: false },
            { primaryReviewComplete: false },
          ),
      },
      {
        name: 'acquisition cohort',
        mutate: (record) => ({ ...record, acquisitionCohort: '002' }),
      },
      {
        name: 'selection cohort',
        mutate: (record) => ({
          ...record,
          selectionCohort: {
            ...record.selectionCohort,
            eraBucket: '2010-2019',
          },
        }),
      },
      {
        name: 'risk evidence',
        mutate: (record) => {
          const riskTriggers = { ...record.riskTriggers, sourceFlag: true }
          return {
            ...record,
            riskTriggers,
            mandatoryRiskReasons:
              deriveIndependentReviewRiskReasons(riskTriggers),
          }
        },
      },
      {
        name: 'proposed item',
        mutate: (record) =>
          projectionMutation(record, {
            proposedItem: {
              ...record.projection.proposedItem,
              titles: {
                ...record.projection.proposedItem.titles,
                english: 'Changed retained title',
              },
            },
          }),
      },
      {
        name: 'source projection',
        mutate: (record) =>
          projectionMutation(record, {
            sourceProjection: {
              ...record.projection.sourceProjection,
              revision: 2,
            },
          }),
      },
      {
        name: 'adult signals',
        mutate: (record) => {
          const riskTriggers = {
            ...record.riskTriggers,
            adultSafetySignal: true,
          }
          return projectionMutation(
            {
              ...record,
              riskTriggers,
              mandatoryRiskReasons:
                deriveIndependentReviewRiskReasons(riskTriggers),
            },
            { adultSignals: ['instance-hentai'] },
          )
        },
      },
      {
        name: 'continuity',
        mutate: (record) =>
          projectionMutation(record, { directContinuityQids: ['Q7'] }),
      },
      {
        name: 'machine review required',
        mutate: (record) =>
          projectionMutation(record, { machineReviewRequired: false }),
      },
      {
        name: 'machine review complete',
        mutate: (record) =>
          projectionMutation(record, { machineReviewComplete: false }),
      },
      ...[
        'candidateSha256',
        'manifestSha256',
        'acquisitionOutcomeSha256',
        'candidateProjectionSha256',
        'candidateReviewAuthoritySha256',
      ].map((field) => ({
        name: field,
        mutate: (record: IndependentReviewPopulationRecord) =>
          projectionMutation(record, {
            [field]: digest(`changed-${field}`),
          }),
      })),
    ]
    for (const testCase of cases) {
      const changed = rehashRetainedRecordMutation(
        firstSnapshot,
        'Q3',
        testCase.mutate,
      )
      expect(
        () =>
          parseIndependentReviewSuccessorAuthoritySnapshotForFixture(changed, {
            rootSnapshot,
            priorSuccessorSnapshots: [],
          }),
        testCase.name,
      ).toThrow()
    }
  }, 60_000)

  it('rejects every rehashed predecessor-specific retained mutation', () => {
    const { rootSnapshot, firstSnapshot } = createParsedSuccessorRounds()
    const cases: readonly Readonly<{
      name: string
      mutate: (
        record: IndependentReviewPopulationRecord,
      ) => IndependentReviewPopulationRecord
    }>[] = [
      {
        name: 'predecessor normalized item commitment',
        mutate: (record) =>
          mutatePredecessorProjection(record, (projection) => ({
            ...projection,
            predecessorNormalizedItemSha256: digest(
              'changed-predecessor-normalized-item',
            ),
          })),
      },
      {
        name: 'proposed normalized item commitment',
        mutate: (record) =>
          mutatePredecessorProjection(record, (projection) => ({
            ...projection,
            proposedNormalizedItemSha256: digest(
              'changed-proposed-normalized-item',
            ),
          })),
      },
      {
        name: 'predecessor projection commitment',
        mutate: (record) =>
          mutatePredecessorProjection(record, (projection) => ({
            ...projection,
            predecessorProjectionSha256: digest(
              'changed-predecessor-projection',
            ),
          })),
      },
      {
        name: 'predecessor review-result commitment',
        mutate: (record) =>
          mutatePredecessorProjection(record, (projection) => ({
            ...projection,
            predecessorReviewResultSha256: digest('changed-predecessor-review'),
          })),
      },
      {
        name: 'correction disposition',
        mutate: (record) =>
          mutatePredecessorProjection(record, (projection) => ({
            ...projection,
            correctionDisposition: 'catalogue_state_identity_scope_hide',
          })),
      },
      {
        name: 'correction commitments',
        mutate: (record) =>
          mutatePredecessorProjection(record, (projection) => ({
            ...projection,
            correctionCommitments: [
              {
                category: 'english_title_correction',
                predecessorNormalizedItemSha256:
                  projection.predecessorNormalizedItemSha256,
                proposedNormalizedItemSha256:
                  projection.proposedNormalizedItemSha256,
              },
            ],
          })),
      },
      {
        name: 'predecessor-valid zero source revision',
        mutate: (record) =>
          mutatePredecessorProjection(record, (projection) => ({
            ...projection,
            sourceProjection: {
              ...projection.sourceProjection,
              revision: 0,
            },
          })),
      },
    ]
    for (const testCase of cases) {
      const changed = rehashRetainedRecordMutation(
        firstSnapshot,
        'Q5000',
        testCase.mutate,
      )
      expect(
        () =>
          parseIndependentReviewSuccessorAuthoritySnapshotForFixture(changed, {
            rootSnapshot,
            priorSuccessorSnapshots: [],
          }),
        testCase.name,
      ).toThrow()
    }
  }, 60_000)

  it('rejects each independently forged allowed retained-rebind hash', () => {
    const { rootSnapshot, firstSnapshot } = createParsedSuccessorRounds()
    const recordIndex = firstSnapshot.population.records.findIndex(
      (record) => record.qid === 'Q3',
    )
    const record = firstSnapshot.population.records[recordIndex]!
    const forgeries = [
      { ...record, proposalRecordSha256: digest('forged-top-proposal') },
      {
        ...record,
        projection: {
          ...record.projection,
          proposalRecordSha256: digest('forged-projection-proposal'),
        },
      },
      {
        ...record,
        projection: {
          ...record.projection,
          projectionSha256: digest('forged-projection'),
        },
      },
      { ...record, recordCommitment: digest('forged-record') },
    ]
    for (const forged of forgeries)
      expect(() =>
        parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
          {
            ...firstSnapshot,
            population: {
              ...firstSnapshot.population,
              records: firstSnapshot.population.records.map((value, index) =>
                index === recordIndex ? forged : value,
              ),
            },
          },
          { rootSnapshot, priorSuccessorSnapshots: [] },
        ),
      ).toThrow()
  })

  it('does not permit added or removed rows to use retained-record rebinding', () => {
    const { rootSnapshot, firstSnapshot } = createParsedSuccessorRounds()
    const retained = firstSnapshot.population.records.find(
      (record) => record.qid === 'Q3',
    )!
    const forgedAddition = rehashRetainedRecordMutation(
      firstSnapshot,
      'Q5001',
      (record) =>
        ({
          ...record,
          identityReviewSha256: retained.identityReviewSha256,
          identityAllocationSha256: retained.identityAllocationSha256,
          projection: {
            ...record.projection,
            identityReviewSha256: retained.identityReviewSha256,
            identityAllocationSha256: retained.identityAllocationSha256,
          },
        }) as IndependentReviewPopulationRecord,
    )
    expect(() =>
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
        forgedAddition,
        { rootSnapshot, priorSuccessorSnapshots: [] },
      ),
    ).toThrow(/addition/)

    const removed = rootSnapshot.population.records.find(
      (record) => record.qid === 'Q1',
    )!
    expect(() =>
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
        {
          ...firstSnapshot,
          population: {
            ...firstSnapshot.population,
            records: firstSnapshot.population.records.map((record) =>
              record.qid === 'Q5001'
                ? rebindRecord(removed, firstSnapshot.proposal)
                : record,
            ),
          },
        },
        { rootSnapshot, priorSuccessorSnapshots: [] },
      ),
    ).toThrow(/outside its frozen proposal/)
  })

  it('rejects gaps, reordering, lineage prefix drift, ledger/history delta drift, and UUID/QID replay', () => {
    const { rootSnapshot, firstSnapshot, secondSnapshot } =
      createParsedSuccessorRounds()
    const parseSecond = (
      value: unknown,
      prior: readonly unknown[] = [firstSnapshot],
    ) =>
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(value, {
        rootSnapshot,
        priorSuccessorSnapshots: prior,
      })
    expect(() => parseSecond(secondSnapshot, [])).toThrow(
      /immediate root-series successor/,
    )
    expect(() => parseSecond(secondSnapshot, [secondSnapshot])).toThrow()
    expect(() =>
      parseSecond({
        ...secondSnapshot,
        replacementProof: {
          ...secondSnapshot.replacementProof,
          replacementLineage: [
            secondSnapshot.replacementProof.replacementLineage[1],
          ],
        },
      }),
    ).toThrow()
    expect(() =>
      parseSecond({
        ...secondSnapshot,
        replacementProof: {
          ...secondSnapshot.replacementProof,
          allocationLedger:
            secondSnapshot.replacementProof.allocationLedger.slice(1),
        },
      }),
    ).toThrow()
    expect(() =>
      parseSecond({
        ...secondSnapshot,
        replacementProof: {
          ...secondSnapshot.replacementProof,
          allocationHistory:
            secondSnapshot.replacementProof.allocationHistory.slice(1),
        },
      }),
    ).toThrow()
    expect(() =>
      parseSecond({
        ...secondSnapshot,
        population: {
          ...secondSnapshot.population,
          records: secondSnapshot.population.records.map((record) =>
            record.qid === 'Q5002'
              ? { ...record, canonicalUuid: uuid(1) }
              : record,
          ),
        },
      }),
    ).toThrow()
  }, 15_000)

  it('rejects predecessor removals and allocations, retired UUID reappearance, and swapped identity evidence', () => {
    const { rootSnapshot, firstSnapshot } = createParsedSuccessorRounds()
    const predecessor = {
      ...rootSnapshot.population.records[0]!,
      acquisitionCohort: 'predecessor-v1' as const,
      projection: {
        ...rootSnapshot.population.records[0]!.projection,
        kind: 'predecessor' as const,
      },
    }
    expect(predecessor.qid).toBe('Q1')
    expect(() =>
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
        {
          ...firstSnapshot,
          replacementProof: {
            ...firstSnapshot.replacementProof,
            additions: firstSnapshot.replacementProof.additions.map(
              (addition) => ({
                ...addition,
                primaryIdentityReviewResult: {
                  ...addition.primaryIdentityReviewResult,
                  qid: 'Q1',
                },
              }),
            ),
          },
        },
        { rootSnapshot, priorSuccessorSnapshots: [] },
      ),
    ).toThrow()
    expect(() =>
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
        {
          ...firstSnapshot,
          population: {
            ...firstSnapshot.population,
            records: [
              predecessor,
              ...firstSnapshot.population.records.slice(1),
            ],
          },
        },
        { rootSnapshot, priorSuccessorSnapshots: [] },
      ),
    ).toThrow()
  })

  it('rejects rehashed round-one root-prefix and round-two prior-prefix mutations', () => {
    const { rootSnapshot, firstSnapshot, secondSnapshot } =
      createParsedSuccessorRounds()
    const swapPrefix = (values: readonly unknown[]) => {
      const reordered = [...values]
      ;[reordered[0], reordered[1]] = [reordered[1], reordered[0]]
      return reordered
    }
    const firstLedger = swapPrefix(
      firstSnapshot.replacementProof.allocationLedger,
    ) as typeof firstSnapshot.replacementProof.allocationLedger
    const firstHistory = swapPrefix(
      firstSnapshot.replacementProof.allocationHistory,
    ) as typeof firstSnapshot.replacementProof.allocationHistory
    const changedFirst = rehashSnapshotProof(firstSnapshot, {
      ...firstSnapshot.replacementProof,
      allocationLedger: firstLedger,
      allocationLedgerSha256: identityAllocationLedgerSha256(firstLedger),
      allocationHistory: firstHistory,
      allocationHistorySha256:
        independentReviewWorkingAllocationHistorySha256(firstHistory),
    })
    expect(() =>
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(changedFirst, {
        rootSnapshot,
        priorSuccessorSnapshots: [],
      }),
    ).toThrow(/preserve complete prior ledger\/history bytes/)

    const secondLedger = swapPrefix(
      secondSnapshot.replacementProof.allocationLedger,
    ) as typeof secondSnapshot.replacementProof.allocationLedger
    const secondHistory = swapPrefix(
      secondSnapshot.replacementProof.allocationHistory,
    ) as typeof secondSnapshot.replacementProof.allocationHistory
    const changedSecond = rehashSnapshotProof(secondSnapshot, {
      ...secondSnapshot.replacementProof,
      allocationLedger: secondLedger,
      allocationLedgerSha256: identityAllocationLedgerSha256(secondLedger),
      allocationHistory: secondHistory,
      allocationHistorySha256:
        independentReviewWorkingAllocationHistorySha256(secondHistory),
    })
    expect(() =>
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
        changedSecond,
        {
          rootSnapshot,
          priorSuccessorSnapshots: [firstSnapshot],
        },
      ),
    ).toThrow(/preserve complete prior ledger\/history bytes/)
  }, 30_000)
})

import {
  allocationHistoryMappings,
  validateFinalIdentityAllocationCorrespondence,
  type IdentityAllocationHistoryEvent,
  type IdentityAllocationLedgerEntry,
} from '@/features/anime/catalogue/anime-release-v2-identity-allocation'
import {
  independentApprovedContinuityQids,
  finalizedContinuitySchema,
  parseAcceptedCandidateReceipt,
  type AcceptedCandidate,
} from '@/features/anime/catalogue/anime-release-v2-continuity'
import { validatePredecessorReviewResult } from '@/features/anime/catalogue/anime-successor-predecessor-review'
import type {
  AnimeReleaseCorpus,
  AnimeReleaseIndex,
  AnimeReleaseReviewLedger,
} from '@/features/anime/catalogue/anime-release-corpus'
import {
  canonicalSelectionEvidence,
  parseCanonicalSelectionEvidence,
  parseSuccessorDiscoveryRecords,
  selectAuthenticatedCanonicalReleaseV2,
  successorDiscoveryReasonOrder,
  validateDerivedSuccessorDiscoveryReasons,
  validateSuccessorRepresentationAgainstValidatedPredecessor,
  validateSuccessorRepresentation,
  type SuccessorDiscoveryReason,
  type SuccessorDiscoveryRecord,
  type SuccessorRepresentation,
} from '@/features/anime/catalogue/anime-release-v2-selection'
import {
  canonicalJson,
  compareDiscoveryQids,
  discoverySha256,
} from '@/features/anime/catalogue/wikidata-anime-discovery'

const canonicalQidPattern = /^Q[1-9][0-9]*$/
const lowercaseUuidV4Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

type SuccessorAllocationMapping = Readonly<{
  qid: string
  catalogueItemId: string
}>

function authoritativeQidSet(
  input: readonly string[],
  description: string,
): ReadonlySet<string> {
  input.forEach((qid) => {
    if (typeof qid !== 'string' || !canonicalQidPattern.test(qid)) {
      throw new Error(`${description} must contain primitive canonical QIDs.`)
    }
  })
  if (new Set(input).size !== input.length) {
    throw new Error(`${description} QIDs must be unique.`)
  }
  return new Set(input)
}

function validateAllocationMappings(
  mappings: readonly SuccessorAllocationMapping[],
  description: string,
): void {
  const qids = new Set<string>()
  const uuids = new Set<string>()
  for (const mapping of mappings) {
    if (!canonicalQidPattern.test(mapping.qid)) {
      throw new Error(`${description} allocation QID must be canonical.`)
    }
    if (!lowercaseUuidV4Pattern.test(mapping.catalogueItemId)) {
      throw new Error(`${description} allocation UUID must be lowercase v4.`)
    }
    if (qids.has(mapping.qid) || uuids.has(mapping.catalogueItemId)) {
      throw new Error(`${description} allocation ownership must be unique.`)
    }
    qids.add(mapping.qid)
    uuids.add(mapping.catalogueItemId)
  }
}

/** Neutral release authority joining selection, predecessor and identity evidence. */
export function validateSuccessorDiscoverySemantics(
  input: Readonly<{
    records: unknown
    representation: SuccessorRepresentation
    candidateReceipt: unknown
    primaryCandidateReview: unknown
    candidateAcquisitionReviewAuthority: unknown
    continuityAcquisition: unknown
    continuityPreparation: unknown
    finalizedContinuity: unknown
    canonicalSelectionEvidence: unknown
    predecessorReviewResult: unknown
    predecessorCorpus: AnimeReleaseCorpus
    predecessorReviewLedger: AnimeReleaseReviewLedger
    predecessorIndex: AnimeReleaseIndex
    predecessorPreparation: unknown
    allocationLedger: readonly IdentityAllocationLedgerEntry[]
    allocationHistory: readonly IdentityAllocationHistoryEvent[]
  }>,
): readonly SuccessorDiscoveryRecord[] {
  const records = parseSuccessorDiscoveryRecords(input.records)
  validateSuccessorRepresentation(input.representation)
  const canonicalSelection = selectAuthenticatedCanonicalReleaseV2({
    candidateReceipt: input.candidateReceipt,
    primaryCandidateReview: input.primaryCandidateReview,
    candidateAcquisitionReviewAuthority:
      input.candidateAcquisitionReviewAuthority,
    continuityAcquisition: input.continuityAcquisition,
    continuityPreparation: input.continuityPreparation,
    finalizedContinuity: input.finalizedContinuity,
    predecessorReviewResult: input.predecessorReviewResult,
    predecessorCorpus: input.predecessorCorpus,
    predecessorReviewLedger: input.predecessorReviewLedger,
    predecessorIndex: input.predecessorIndex,
    predecessorPreparation: input.predecessorPreparation,
  })
  const receipt = parseAcceptedCandidateReceipt(input.candidateReceipt)
  const finalizedContinuity = finalizedContinuitySchema.parse(
    input.finalizedContinuity,
  )
  const selectionEvidence = parseCanonicalSelectionEvidence(
    input.canonicalSelectionEvidence,
  )
  const recomputedSelectionEvidence = canonicalSelectionEvidence(
    canonicalSelection,
    discoverySha256(finalizedContinuity),
  )
  if (
    canonicalJson(selectionEvidence) !==
    canonicalJson(recomputedSelectionEvidence)
  )
    throw new Error(
      'Canonical selection evidence changed fixed solver recomputation.',
    )
  const predecessorReview = validatePredecessorReviewResult(
    input.predecessorReviewResult,
    input.predecessorCorpus,
    input.predecessorReviewLedger,
    input.predecessorIndex,
    input.predecessorPreparation,
  )
  validateSuccessorRepresentationAgainstValidatedPredecessor(
    input.representation,
    predecessorReview.records,
  )
  const retainedPredecessors = new Set(
    predecessorReview.records.map(({ sourceItemId }) => sourceItemId),
  )
  if (retainedPredecessors.size !== 500) {
    throw new Error(
      'Successor authority requires exactly 500 retained predecessors.',
    )
  }
  const predecessors = new Set(
    predecessorReview.records
      .filter(({ currentItem }) => currentItem.catalogueState === 'published')
      .map(({ sourceItemId }) => sourceItemId),
  )
  const witnesses = authoritativeQidSet(
    selectionEvidence.coverageWitnessQids,
    'Coverage witness authority',
  )
  const continuity = independentApprovedContinuityQids(finalizedContinuity)
  validateDerivedSuccessorDiscoveryReasons({
    records,
    publishedPredecessorQids: [...predecessors],
    coverageWitnessQids: [...witnesses],
    independentlyApprovedContinuityQids: [...continuity],
  })
  const allocations = allocationHistoryMappings(input.allocationHistory)
  validateAllocationMappings(allocations.active, 'Active')
  validateAllocationMappings(allocations.retired, 'Retired')
  validateFinalIdentityAllocationCorrespondence({
    ledger: input.allocationLedger,
    history: input.allocationHistory,
    finalRepresentation: input.representation.completeCorpus.map((record) => ({
      qid: record.qid,
      catalogueItemId: record.catalogueItemId,
      state: record.state,
      intent:
        record.state === 'published' && !retainedPredecessors.has(record.qid)
          ? ('create' as const)
          : ('link-existing' as const),
    })),
    predecessorReviewResult: input.predecessorReviewResult,
    predecessorCorpus: input.predecessorCorpus,
    predecessorReviewLedger: input.predecessorReviewLedger,
    predecessorIndex: input.predecessorIndex,
    predecessorPreparation: input.predecessorPreparation,
  })

  const corpusByQid = new Map(
    input.representation.completeCorpus.map((record) => [record.qid, record]),
  )
  const recordsByQid = new Map(records.map((record) => [record.qid, record]))
  if (
    recordsByQid.size !== corpusByQid.size ||
    [...corpusByQid.keys()].some((qid) => !recordsByQid.has(qid))
  ) {
    throw new Error(
      'Discovery union must correspond exactly to the successor corpus.',
    )
  }
  const publishedQids = input.representation.publishedSelection
    .map(({ qid }) => qid)
    .sort(compareDiscoveryQids)
  if (
    canonicalJson(publishedQids) !==
    canonicalJson(selectionEvidence.orderedSelectedQids)
  )
    throw new Error(
      'Published representation changed the canonical selection evidence.',
    )
  const receiptCandidates = new Map(
    receipt.candidates.map((candidate) => [candidate.qid, candidate]),
  )
  for (const predecessor of predecessorReview.records) {
    const represented = corpusByQid.get(predecessor.sourceItemId)
    if (
      represented === undefined ||
      represented.catalogueItemId !== predecessor.catalogueItemId ||
      represented.state !== predecessor.currentItem.catalogueState
    )
      throw new Error(
        'Successor representation changed predecessor review authority.',
      )
    if (
      represented.state !== 'published' &&
      (represented.predecessorSha256 !==
        predecessor.predecessorNormalizedItemSha256 ||
        represented.currentSha256 !== predecessor.normalizedItemSha256)
    )
      throw new Error(
        'Retained predecessor hashes changed predecessor review authority.',
      )
  }
  if (
    predecessorReview.records.some(
      ({ sourceItemId }) =>
        !corpusByQid.has(sourceItemId) ||
        (corpusByQid.get(sourceItemId)?.state === 'published' &&
          !predecessors.has(sourceItemId)),
    )
  ) {
    throw new Error(
      'Every retained predecessor must remain link-existing at its reviewed state.',
    )
  }

  for (const record of records) {
    const corpusRecord = corpusByQid.get(record.qid)!
    if (record.kind === 'eligible-selected') {
      const candidate: AcceptedCandidate | undefined = receiptCandidates.get(
        record.qid,
      )
      if (
        candidate === undefined ||
        record.englishBand !== candidate.englishBand ||
        record.japaneseBand !== candidate.japaneseBand ||
        record.sitelinkBand !== candidate.sitelinkBand ||
        record.englishMappingInputSha256 !==
          candidate.englishMappingInputSha256 ||
        record.japaneseMappingInputSha256 !==
          candidate.japaneseMappingInputSha256
      )
        throw new Error(
          'Eligible-selected evidence changed the frozen candidate receipt.',
        )
      if (record.qid === 'Q583684') {
        throw new Error(
          'Q583684 must use the exact predecessor-only discovery representation.',
        )
      }
      if (corpusRecord.state !== 'published') {
        throw new Error(
          'Eligible-selected discovery records must be published.',
        )
      }
      const expectedReasons = new Set<SuccessorDiscoveryReason>()
      if (predecessors.has(record.qid)) expectedReasons.add('predecessor')
      if (record.englishBand !== 'unavailable')
        expectedReasons.add('audience-en')
      if (record.japaneseBand !== 'unavailable')
        expectedReasons.add('audience-ja')
      if (record.sitelinkBand !== '0-to-4')
        expectedReasons.add('multilingual-coverage')
      if (witnesses.has(record.qid)) expectedReasons.add('coverage-cell')
      if (continuity.has(record.qid))
        expectedReasons.add('franchise-continuity')
      const canonicalReasons = successorDiscoveryReasonOrder.filter((reason) =>
        expectedReasons.has(reason),
      )
      if (
        canonicalJson(record.reasonCodes) !== canonicalJson(canonicalReasons)
      ) {
        throw new Error(
          'Eligible-selected reasons do not exactly match authoritative derivation.',
        )
      }
      continue
    }
    if (record.kind === 'predecessor-only-selected') {
      const predecessorAuthority = predecessorReview.records.find(
        ({ sourceItemId }) => sourceItemId === record.qid,
      )
      if (
        record.qid !== 'Q583684' ||
        record.catalogueItemId !== '69269f92-4bfa-4657-95cf-0f71aa93ba0e' ||
        corpusRecord.catalogueItemId !== record.catalogueItemId ||
        corpusRecord.state !== 'published' ||
        !predecessors.has(record.qid) ||
        record.predecessorSha256 !==
          predecessorAuthority?.predecessorNormalizedItemSha256
      ) {
        throw new Error(
          'Q583684 predecessor-only exception does not match its exact authority.',
        )
      }
      continue
    }
    if (
      corpusRecord.state === 'published' ||
      corpusRecord.catalogueItemId !== record.catalogueItemId ||
      canonicalJson(corpusRecord) !==
        canonicalJson({
          qid: record.qid,
          catalogueItemId: record.catalogueItemId,
          predecessorSha256: record.predecessorSha256,
          currentSha256: record.currentSha256,
          state: record.state,
          correctionDisposition: record.correctionDisposition,
        })
    ) {
      throw new Error(
        'Retained-predecessor discovery evidence does not match representation.',
      )
    }
    if (
      record.correctionDisposition === 'catalogue_state_identity_scope_hide' &&
      (record.qid !== 'Q114798266' ||
        record.catalogueItemId !== '3ad12706-93ab-496e-9ca8-729fc79342e6')
    ) {
      throw new Error(
        'Identity-scope hide is authorized only for the accepted predecessor.',
      )
    }
  }

  for (const qid of [...witnesses, ...continuity]) {
    if (recordsByQid.get(qid)?.kind !== 'eligible-selected') {
      throw new Error(
        'Witness and continuity authority must name eligible-selected records.',
      )
    }
  }
  for (const qid of predecessors) {
    const discoveryRecord = recordsByQid.get(qid)
    if (
      (discoveryRecord?.kind !== 'eligible-selected' &&
        discoveryRecord?.kind !== 'predecessor-only-selected') ||
      corpusByQid.get(qid)?.state !== 'published'
    ) {
      throw new Error(
        'Published predecessor authority must name a selected published record.',
      )
    }
  }
  if (recordsByQid.get('Q583684')?.kind !== 'predecessor-only-selected') {
    throw new Error(
      'Q583684 must use the exact predecessor-only discovery representation.',
    )
  }
  const expectedActive = input.representation.publishedSelection
    .filter(({ qid }) => !retainedPredecessors.has(qid))
    .map(({ qid, catalogueItemId }) => ({ qid, catalogueItemId }))
    .sort((left, right) => compareDiscoveryQids(left.qid, right.qid))
  const actualActive = [...allocations.active].sort((left, right) =>
    compareDiscoveryQids(left.qid, right.qid),
  )
  if (canonicalJson(actualActive) !== canonicalJson(expectedActive)) {
    throw new Error(
      'Active allocation mappings must exactly equal new published records.',
    )
  }
  for (const retired of allocations.retired) {
    if (
      retainedPredecessors.has(retired.qid) ||
      corpusByQid.has(retired.qid) ||
      input.representation.completeCorpus.some(
        ({ catalogueItemId }) => catalogueItemId === retired.catalogueItemId,
      )
    ) {
      throw new Error(
        'Retired allocation must be absent from successor representation.',
      )
    }
  }
  if (
    [...allocations.active, ...allocations.retired].some(({ qid }) =>
      retainedPredecessors.has(qid),
    )
  ) {
    throw new Error(
      'Retained predecessors cannot enter active or retired allocation history.',
    )
  }
  const allAllocationUuids = [
    ...allocations.active,
    ...allocations.retired,
  ].map(({ catalogueItemId }) => catalogueItemId)
  if (new Set(allAllocationUuids).size !== allAllocationUuids.length) {
    throw new Error(
      'Active and retired allocation UUIDs must be globally unique.',
    )
  }
  return records
}

import { randomUUID } from 'node:crypto'
import {
  compareDiscoveryQids,
  discoverySha256,
} from '@/features/anime/catalogue/wikidata-anime-discovery'
import {
  canonicalSelectionEvidence,
  validateAuthenticatedIdentityReplacementLineage,
} from '@/features/anime/catalogue/anime-release-v2-selection'
import {
  finalizedContinuitySchema,
  parseAcceptedCandidateReceipt,
} from '@/features/anime/catalogue/anime-release-v2-continuity'
import {
  acceptedCandidateProjectionSha256,
  assertAcceptedCandidateAcquisitionReviewAuthority,
} from '@/features/anime/catalogue/anime-v2-candidate-acquisition'
import {
  deriveIndependentSampleSeed,
  deriveIndependentSampleRoundSeed,
  parseIdentityReplacementReviewResult,
  replacementLineageSha256,
  validateReplacementLineage,
  type ReplacementLineageEntry,
} from '@/features/anime/catalogue/anime-release-v2-lineage'
import { validatePredecessorReviewResult } from '@/features/anime/catalogue/anime-successor-predecessor-review'
import type {
  AnimeReleaseCorpus,
  AnimeReleaseIndex,
  AnimeReleaseReviewLedger,
} from '@/features/anime/catalogue/anime-release-corpus'
import { sha256Canonical } from '@/features/anime/catalogue/anime-release-corpus'

const sha256Pattern = /^[a-f0-9]{64}$/
const lowercaseUuidV4Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export const identityAllocationVersion = 'identity-allocation.v1' as const
export const identityAllocationHistoryVersion =
  'identity-allocation-history.v1' as const
export const frozenIdentityProposalVersion = 'identity-proposal.v1' as const
export const primaryIdentityReviewResultVersion =
  'primary-identity-review-result.v1' as const
export const acceptedCandidateReceiptSha256 =
  'fa126f87e53ef4babfec7f0a5924c153e84aa03a638052157656537e71002c59' as const
export const acceptedSelectionRubricSha256 =
  'dc606cb0c7571e47c3ab6b632dcc3961fa92c4c5eb5a114909071d56a148c3da' as const

export type CanonicalSelectionEvidenceAuthority = Readonly<{
  schema: 'zedarchive.anime-v2-canonical-selection-evidence'
  version: 1
  candidateReceiptSha256: typeof acceptedCandidateReceiptSha256
  selectionRubricSha256: typeof acceptedSelectionRubricSha256
  finalizedContinuitySha256: string
  orderedSelectedQids: readonly string[]
  orderedSelectedQidsSha256: string
  audienceAnchorQids: readonly string[]
  coverageWitnessQids: readonly string[]
  reasonCodes: readonly Readonly<{ qid: string; reasons: readonly string[] }>[]
  primaryCost: string
  tierWeight: string
  witnessPartitionsSolved: number
  evidenceSha256: string
}>

export type IdentityProposalAuthority = Readonly<{
  candidateReceipt: unknown
  primaryCandidateReview: unknown
  candidateAcquisitionReviewAuthority: unknown
  continuityAcquisition: unknown
  continuityPreparation: unknown
  finalizedContinuity: unknown
  predecessorReviewResult: unknown
  predecessorCorpus: AnimeReleaseCorpus
  predecessorReviewLedger: AnimeReleaseReviewLedger
  predecessorIndex: AnimeReleaseIndex
  predecessorPreparation: unknown
  identityReplacementLineage?: readonly ReplacementLineageEntry[]
  identityReplacementReviewResults?: readonly unknown[]
}>

export type IdentityProposalFixtureAuthority = Readonly<{
  canonicalSelectionEvidence: CanonicalSelectionEvidenceAuthority
  retainedPredecessorQids: readonly string[]
  predecessorCorpusSha256: string
  identityReplacementLineage?: readonly ReplacementLineageEntry[]
  identityReplacementReviewResults?: readonly unknown[]
}>

export type FrozenIdentityProposalArtifact = Readonly<{
  version: typeof frozenIdentityProposalVersion
  allocationRound: number
  candidateReceiptSha256: typeof acceptedCandidateReceiptSha256
  selectionRubricSha256: typeof acceptedSelectionRubricSha256
  canonicalSelectionEvidenceSha256: string
  finalizedContinuitySha256: string
  selectionAuthority: Readonly<{
    kind: 'initial' | 'replacement-lineage'
    commitmentSha256: string
  }>
  orderedQids: readonly string[]
  orderedQidSequenceSha256: string
  proposalSha256: string
}>

export type PrimaryIdentityReviewResult = Readonly<{
  version: typeof primaryIdentityReviewResultVersion
  qid: string
  allocationRound: number
  candidateReceiptSha256: typeof acceptedCandidateReceiptSha256
  reducedProjectionSha256: string
  proposalSha256: string
  reviewInputSha256: string
  exactWorkIdentity: 'approved'
  mediaScope: 'approved'
  outcome: 'approved-exact-work'
}>

export type IdentityAllocationLedgerEntry = Readonly<{
  version: typeof identityAllocationVersion
  qid: string
  catalogueItemId: string
  canonicalCandidateReceiptSha256: typeof acceptedCandidateReceiptSha256
  reducedProjectionSha256: string
  identityOutcome: 'approved-exact-work'
  proposedSelectionSha256: string
  allocationRound: number
}>

export type IdentityAllocationRequest = Readonly<{
  proposal: unknown
  proposalAuthority: IdentityProposalAuthority
  primaryIdentityReviewResult: unknown
  allocationHistory: readonly IdentityAllocationHistoryEvent[]
}>

function assertSha256(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !sha256Pattern.test(value))
    throw new Error(`${field} must be a lowercase SHA-256 digest.`)
}

export function assertLowercaseUuidV4(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !lowercaseUuidV4Pattern.test(value)) {
    throw new Error(
      'Allocated catalogue IDs must be canonical lowercase UUID v4 values.',
    )
  }
}

function assertQid(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^Q[1-9][0-9]*$/.test(value))
    throw new Error('Allocation QIDs must be canonical Wikidata IDs.')
}

function assertPositiveRound(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error('Allocation rounds start at one.')
  }
}

function strictObject(
  input: unknown,
  expectedKeys: readonly string[],
  description: string,
): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(`${description} must be an object.`)
  }
  const record = input as Record<string, unknown>
  if (
    JSON.stringify(Object.keys(record).sort()) !==
    JSON.stringify([...expectedKeys].sort())
  ) {
    throw new Error(`${description} contains missing or unknown fields.`)
  }
  return record
}

function assertCanonicalQids(input: unknown, description: string): string[] {
  if (!Array.isArray(input)) throw new Error(`${description} must be an array.`)
  const qids = input.map((qid) => {
    assertQid(qid)
    return qid
  })
  if (new Set(qids).size !== qids.length) {
    throw new Error(`${description} must contain unique QIDs.`)
  }
  const ordered = [...qids].sort(compareDiscoveryQids)
  if (JSON.stringify(ordered) !== JSON.stringify(qids)) {
    throw new Error(`${description} must use ascending numeric-QID order.`)
  }
  return qids
}

function assertUniqueQidSequence(
  input: unknown,
  description: string,
): string[] {
  if (!Array.isArray(input)) throw new Error(`${description} must be an array.`)
  const qids = input.map((qid) => {
    assertQid(qid)
    return qid
  })
  if (new Set(qids).size !== qids.length)
    throw new Error(`${description} must contain unique QIDs.`)
  return qids
}

function proposalCommitment(
  input: Omit<FrozenIdentityProposalArtifact, 'version' | 'proposalSha256'>,
): string {
  return discoverySha256({
    version: frozenIdentityProposalVersion,
    ...input,
  })
}

function parseCanonicalSelectionEvidenceAuthority(
  input: unknown,
): CanonicalSelectionEvidenceAuthority {
  const record = strictObject(
    input,
    [
      'schema',
      'version',
      'candidateReceiptSha256',
      'selectionRubricSha256',
      'finalizedContinuitySha256',
      'orderedSelectedQids',
      'orderedSelectedQidsSha256',
      'audienceAnchorQids',
      'coverageWitnessQids',
      'reasonCodes',
      'primaryCost',
      'tierWeight',
      'witnessPartitionsSolved',
      'evidenceSha256',
    ],
    'Canonical selection evidence',
  )
  if (
    record.schema !== 'zedarchive.anime-v2-canonical-selection-evidence' ||
    record.version !== 1 ||
    record.candidateReceiptSha256 !== acceptedCandidateReceiptSha256 ||
    record.selectionRubricSha256 !== acceptedSelectionRubricSha256
  ) {
    throw new Error('Canonical selection evidence authority is invalid.')
  }
  assertSha256(record.finalizedContinuitySha256, 'Finalized continuity hash')
  assertSha256(record.orderedSelectedQidsSha256, 'Selected QID sequence hash')
  assertSha256(record.evidenceSha256, 'Canonical selection evidence hash')
  const orderedSelectedQids = assertCanonicalQids(
    record.orderedSelectedQids,
    'Canonical selected',
  )
  const audienceAnchorQids = assertUniqueQidSequence(
    record.audienceAnchorQids,
    'Canonical audience anchor',
  )
  const coverageWitnessQids = assertCanonicalQids(
    record.coverageWitnessQids,
    'Canonical coverage witness',
  )
  if (!Array.isArray(record.reasonCodes))
    throw new Error('Canonical selection reasons must be an array.')
  const reasonCodes = record.reasonCodes.map((input) => {
    const reason = strictObject(
      input,
      ['qid', 'reasons'],
      'Canonical selection reason',
    )
    assertQid(reason.qid)
    if (
      !Array.isArray(reason.reasons) ||
      reason.reasons.some((value) => typeof value !== 'string')
    )
      throw new Error('Canonical selection reasons must be primitive strings.')
    return { qid: reason.qid, reasons: reason.reasons as string[] }
  })
  if (
    canonicalJsonQids(reasonCodes.map(({ qid }) => qid)) !==
    canonicalJsonQids(orderedSelectedQids)
  )
    throw new Error(
      'Canonical selection reasons changed selected QID coverage.',
    )
  if (
    typeof record.primaryCost !== 'string' ||
    !/^(0|[1-9][0-9]*)$/.test(record.primaryCost) ||
    typeof record.tierWeight !== 'string' ||
    !/^(0|[1-9][0-9]*)$/.test(record.tierWeight) ||
    !Number.isSafeInteger(record.witnessPartitionsSolved) ||
    (record.witnessPartitionsSolved as number) < 1
  )
    throw new Error('Canonical selection solver evidence is invalid.')
  if (
    discoverySha256(orderedSelectedQids) !== record.orderedSelectedQidsSha256
  ) {
    throw new Error('Canonical selection QID sequence hash does not match.')
  }
  const core = {
    schema: record.schema,
    version: record.version,
    candidateReceiptSha256: record.candidateReceiptSha256,
    selectionRubricSha256: record.selectionRubricSha256,
    finalizedContinuitySha256: record.finalizedContinuitySha256,
    orderedSelectedQids,
    orderedSelectedQidsSha256: record.orderedSelectedQidsSha256,
    audienceAnchorQids,
    coverageWitnessQids,
    reasonCodes,
    primaryCost: record.primaryCost,
    tierWeight: record.tierWeight,
    witnessPartitionsSolved: record.witnessPartitionsSolved,
  }
  if (discoverySha256(core) !== record.evidenceSha256) {
    throw new Error('Canonical selection evidence hash does not match.')
  }
  return {
    ...core,
    evidenceSha256: record.evidenceSha256,
  } as CanonicalSelectionEvidenceAuthority
}

export function parseFrozenIdentityProposalArtifact(
  input: unknown,
  authority: IdentityProposalAuthority,
): FrozenIdentityProposalArtifact {
  const acceptedCandidateReceipt = parseAcceptedCandidateReceipt(
    authority.candidateReceipt,
  )
  assertAcceptedCandidateAcquisitionReviewAuthority(
    acceptedCandidateReceipt,
    acceptedCandidateReceiptSha256,
    authority.candidateAcquisitionReviewAuthority,
    authority.predecessorReviewResult,
  )
  const replacementAuthority = validateAuthenticatedIdentityReplacementLineage(
    authority,
    authority.identityReplacementLineage ?? [],
    authority.identityReplacementReviewResults ?? [],
  )
  const canonicalResult = replacementAuthority.canonicalSelection
  const finalizedContinuity = finalizedContinuitySchema.parse(
    authority.finalizedContinuity,
  )
  const selection = parseCanonicalSelectionEvidenceAuthority(
    canonicalSelectionEvidence(
      canonicalResult,
      discoverySha256(finalizedContinuity),
    ),
  )
  const predecessorReview = validatePredecessorReviewResult(
    authority.predecessorReviewResult,
    authority.predecessorCorpus,
    authority.predecessorReviewLedger,
    authority.predecessorIndex,
    authority.predecessorPreparation,
  )
  const predecessorQids = new Set(
    predecessorReview.records.map(({ sourceItemId }) => sourceItemId),
  )
  if (predecessorQids.size !== 500) {
    throw new Error(
      'Identity proposals require exactly 500 retained predecessors.',
    )
  }
  return parseFrozenIdentityProposalForFixture(input, {
    canonicalSelectionEvidence: selection,
    retainedPredecessorQids: [...predecessorQids].sort(compareDiscoveryQids),
    predecessorCorpusSha256: sha256Canonical(authority.predecessorCorpus),
    identityReplacementLineage: authority.identityReplacementLineage,
    identityReplacementReviewResults:
      authority.identityReplacementReviewResults,
  })
}

/** Pure seam for proposal fixtures after selection and predecessor authentication. */
export function parseFrozenIdentityProposalForFixture(
  input: unknown,
  authority: IdentityProposalFixtureAuthority,
): FrozenIdentityProposalArtifact {
  const selection = parseCanonicalSelectionEvidenceAuthority(
    authority.canonicalSelectionEvidence,
  )
  const predecessorQids = new Set(
    assertCanonicalQids(
      authority.retainedPredecessorQids,
      'Retained predecessor authority',
    ),
  )
  assertSha256(authority.predecessorCorpusSha256, 'Predecessor corpus hash')
  const record = strictObject(
    input,
    [
      'version',
      'allocationRound',
      'candidateReceiptSha256',
      'selectionRubricSha256',
      'canonicalSelectionEvidenceSha256',
      'finalizedContinuitySha256',
      'selectionAuthority',
      'orderedQids',
      'orderedQidSequenceSha256',
      'proposalSha256',
    ],
    'Frozen identity proposal',
  )
  if (record.version !== frozenIdentityProposalVersion) {
    throw new Error('Frozen identity proposal version is invalid.')
  }
  assertPositiveRound(record.allocationRound)
  if (
    record.candidateReceiptSha256 !== acceptedCandidateReceiptSha256 ||
    record.selectionRubricSha256 !== acceptedSelectionRubricSha256
  )
    throw new Error('Frozen identity proposal changed fixed authority hashes.')
  assertSha256(
    record.canonicalSelectionEvidenceSha256,
    'Selection evidence hash',
  )
  assertSha256(record.finalizedContinuitySha256, 'Finalized continuity hash')
  assertSha256(record.orderedQidSequenceSha256, 'Proposal QID sequence hash')
  assertSha256(record.proposalSha256, 'Proposal canonical hash')
  const orderedQids = assertCanonicalQids(
    record.orderedQids,
    'Frozen proposal QIDs',
  )
  if (orderedQids.length === 0) {
    throw new Error('Frozen identity proposal must contain at least one QID.')
  }
  if (discoverySha256(orderedQids) !== record.orderedQidSequenceSha256) {
    throw new Error('Frozen proposal QID sequence hash does not match.')
  }
  const proposalAuthority = strictObject(
    record.selectionAuthority,
    ['kind', 'commitmentSha256'],
    'Proposal selection authority',
  )
  if (
    proposalAuthority.kind !== 'initial' &&
    proposalAuthority.kind !== 'replacement-lineage'
  )
    throw new Error('Proposal selection authority kind is invalid.')
  assertSha256(
    proposalAuthority.commitmentSha256,
    'Selection authority commitment',
  )
  const lineage = authority.identityReplacementLineage ?? []
  const originalSelectionQids = selection.orderedSelectedQids
  const originalSelectionSha256 = discoverySha256(originalSelectionQids)
  const lineageAuthority = {
    originalSeed: deriveIndependentSampleSeed({
      canonicalCandidateReceiptSha256: acceptedCandidateReceiptSha256,
      predecessorCorpusSha256: authority.predecessorCorpusSha256,
      orderedProposedPublishedQidSequenceSha256: originalSelectionSha256,
    }),
    initialOrderedQids: originalSelectionQids,
  }
  validateReplacementLineage(lineage, lineageAuthority)
  if (
    (authority.identityReplacementReviewResults ?? []).length !== lineage.length
  )
    throw new Error('Every identity replacement round needs one review result.')
  let previousLineageQids = originalSelectionQids
  lineage.forEach((entry, index) => {
    const review = parseIdentityReplacementReviewResult(
      authority.identityReplacementReviewResults![index],
      {
        candidateReceiptSha256: acceptedCandidateReceiptSha256,
        canonicalSelectionEvidenceSha256: selection.evidenceSha256,
        round: index + 1,
        previousSelectedQidsSha256: discoverySha256(previousLineageQids),
        roundSeed: deriveIndependentSampleRoundSeed(
          lineageAuthority.originalSeed,
          index + 1,
        ),
      },
    )
    if (
      canonicalJsonQids(review.removals.map(({ qid }) => qid)) !==
      canonicalJsonQids(entry.removedQids)
    )
      throw new Error('Identity replacement review changed lineage removals.')
    previousLineageQids = entry.currentOrderedQids
  })
  const latestLineage = lineage.at(-1)
  const expectedQids =
    latestLineage === undefined
      ? originalSelectionQids.filter((qid) => !predecessorQids.has(qid))
      : [...latestLineage.addedQids]
  if (expectedQids.some((qid) => predecessorQids.has(qid)))
    throw new Error('Identity proposal cannot contain a retained predecessor.')
  const expectedSelectionAuthority =
    latestLineage === undefined
      ? {
          kind: 'initial' as const,
          commitmentSha256: selection.evidenceSha256,
        }
      : {
          kind: 'replacement-lineage' as const,
          commitmentSha256: replacementLineageSha256(lineage, lineageAuthority),
        }
  const expectedRound = lineage.length + 1
  if (
    proposalAuthority.kind !== expectedSelectionAuthority.kind ||
    proposalAuthority.commitmentSha256 !==
      expectedSelectionAuthority.commitmentSha256 ||
    canonicalJsonQids(orderedQids) !== canonicalJsonQids(expectedQids) ||
    record.canonicalSelectionEvidenceSha256 !== selection.evidenceSha256 ||
    record.finalizedContinuitySha256 !== selection.finalizedContinuitySha256 ||
    record.allocationRound !== expectedRound
  )
    throw new Error(
      'Frozen identity proposal does not match separately supplied authority.',
    )
  if (
    proposalCommitment({
      allocationRound: record.allocationRound,
      candidateReceiptSha256: acceptedCandidateReceiptSha256,
      selectionRubricSha256: acceptedSelectionRubricSha256,
      canonicalSelectionEvidenceSha256: record.canonicalSelectionEvidenceSha256,
      finalizedContinuitySha256: record.finalizedContinuitySha256,
      selectionAuthority:
        proposalAuthority as FrozenIdentityProposalArtifact['selectionAuthority'],
      orderedQids,
      orderedQidSequenceSha256: record.orderedQidSequenceSha256,
    }) !== record.proposalSha256
  ) {
    throw new Error('Frozen proposal canonical hash does not match.')
  }
  return record as unknown as FrozenIdentityProposalArtifact
}

function canonicalJsonQids(qids: readonly string[]): string {
  return JSON.stringify(qids)
}

export function parsePrimaryIdentityReviewResult(
  input: unknown,
  proposal: FrozenIdentityProposalArtifact,
  expectedProjectionSha256?: string,
): PrimaryIdentityReviewResult {
  const record = strictObject(
    input,
    [
      'version',
      'qid',
      'allocationRound',
      'candidateReceiptSha256',
      'reducedProjectionSha256',
      'proposalSha256',
      'reviewInputSha256',
      'exactWorkIdentity',
      'mediaScope',
      'outcome',
    ],
    'Primary identity review result',
  )
  if (record.version !== primaryIdentityReviewResultVersion) {
    throw new Error('Primary identity review result version is invalid.')
  }
  assertQid(record.qid)
  assertPositiveRound(record.allocationRound)
  assertSha256(record.reducedProjectionSha256, 'Reduced projection hash')
  assertSha256(record.proposalSha256, 'Review proposal hash')
  assertSha256(record.reviewInputSha256, 'Review input hash')
  if (
    record.candidateReceiptSha256 !== acceptedCandidateReceiptSha256 ||
    record.proposalSha256 !== proposal.proposalSha256 ||
    record.allocationRound !== proposal.allocationRound ||
    !proposal.orderedQids.includes(record.qid as string) ||
    record.exactWorkIdentity !== 'approved' ||
    record.mediaScope !== 'approved' ||
    record.outcome !== 'approved-exact-work'
  ) {
    throw new Error(
      'Primary identity review is not an approved exact-work result bound to the proposal.',
    )
  }
  const expectedInput = discoverySha256({
    version: 'identity-review-input.v1',
    qid: record.qid,
    proposalSha256: record.proposalSha256,
    allocationRound: record.allocationRound,
    candidateReceiptSha256: record.candidateReceiptSha256,
    reducedProjectionSha256: record.reducedProjectionSha256,
  })
  if (record.reviewInputSha256 !== expectedInput) {
    throw new Error('Primary identity review input hash does not match.')
  }
  if (
    expectedProjectionSha256 !== undefined &&
    record.reducedProjectionSha256 !== expectedProjectionSha256
  ) {
    throw new Error(
      'Primary identity review substituted the accepted candidate projection hash.',
    )
  }
  return record as unknown as PrimaryIdentityReviewResult
}

export function validateIdentityAllocationLedger(
  ledger: readonly IdentityAllocationLedgerEntry[],
): void {
  const qids = new Set<string>()
  const uuids = new Set<string>()
  for (const entry of ledger) {
    if (entry.version !== identityAllocationVersion)
      throw new Error('Allocation ledger version is invalid.')
    assertQid(entry.qid)
    assertLowercaseUuidV4(entry.catalogueItemId)
    if (
      entry.canonicalCandidateReceiptSha256 !== acceptedCandidateReceiptSha256
    )
      throw new Error('Allocation ledger changed the fixed candidate receipt.')
    assertSha256(entry.reducedProjectionSha256, 'Reduced projection hash')
    assertSha256(entry.proposedSelectionSha256, 'Proposed selection hash')
    if (entry.identityOutcome !== 'approved-exact-work')
      throw new Error('Only approved exact-work identities may be allocated.')
    if (
      !Number.isSafeInteger(entry.allocationRound) ||
      entry.allocationRound < 1
    )
      throw new Error('Allocation rounds start at one.')
    if (qids.has(entry.qid))
      throw new Error('A QID may be allocated only once.')
    if (uuids.has(entry.catalogueItemId))
      throw new Error('An allocated UUID may never be reused.')
    qids.add(entry.qid)
    uuids.add(entry.catalogueItemId)
  }
}

export function parseIdentityAllocationLedgerEntry(
  input: unknown,
): IdentityAllocationLedgerEntry {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Identity-allocation ledger entry must be an object.')
  }
  const record = input as Record<string, unknown>
  const expectedKeys = [
    'version',
    'qid',
    'catalogueItemId',
    'canonicalCandidateReceiptSha256',
    'reducedProjectionSha256',
    'identityOutcome',
    'proposedSelectionSha256',
    'allocationRound',
  ].sort()
  if (
    JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(expectedKeys)
  ) {
    throw new Error(
      'Identity-allocation ledger entry contains missing or unknown fields.',
    )
  }
  const entry = record as unknown as IdentityAllocationLedgerEntry
  validateIdentityAllocationLedger([entry])
  return entry
}

export function parseIdentityAllocationLedger(
  input: unknown,
): readonly IdentityAllocationLedgerEntry[] {
  if (!Array.isArray(input))
    throw new Error('Identity-allocation ledger must be an array.')
  const ledger = input.map(parseIdentityAllocationLedgerEntry)
  validateIdentityAllocationLedger(ledger)
  return ledger
}

export function allocateIdentity(
  ledger: readonly IdentityAllocationLedgerEntry[],
  request: IdentityAllocationRequest,
): Readonly<{
  ledger: readonly IdentityAllocationLedgerEntry[]
  entry: IdentityAllocationLedgerEntry
  appended: boolean
}> {
  validateIdentityAllocationLedger(ledger)
  const proposal = parseFrozenIdentityProposalArtifact(
    request.proposal,
    request.proposalAuthority,
  )
  const receipt = parseAcceptedCandidateReceipt(
    request.proposalAuthority.candidateReceipt,
  )
  const reviewQid =
    request.primaryIdentityReviewResult !== null &&
    typeof request.primaryIdentityReviewResult === 'object' &&
    !Array.isArray(request.primaryIdentityReviewResult)
      ? (request.primaryIdentityReviewResult as { qid?: unknown }).qid
      : undefined
  assertQid(reviewQid)
  const expectedProjectionSha256 = acceptedCandidateProjectionSha256(
    receipt,
    acceptedCandidateReceiptSha256,
    request.proposalAuthority.candidateAcquisitionReviewAuthority,
    request.proposalAuthority.predecessorReviewResult,
    reviewQid,
  )
  const approval = parsePrimaryIdentityReviewResult(
    request.primaryIdentityReviewResult,
    proposal,
    expectedProjectionSha256,
  )
  return allocateIdentityFromValidatedEvidence(
    ledger,
    { proposal, approval, allocationHistory: request.allocationHistory },
    randomUUID,
  )
}

/** Pure seam after proposal and independent review authentication. */
function allocateIdentityFromValidatedEvidence(
  ledger: readonly IdentityAllocationLedgerEntry[],
  request: Readonly<{
    proposal: FrozenIdentityProposalArtifact
    approval: PrimaryIdentityReviewResult
    allocationHistory: readonly IdentityAllocationHistoryEvent[]
    expectedProjectionSha256?: string
  }>,
  uuidGenerator: () => string,
): Readonly<{
  ledger: readonly IdentityAllocationLedgerEntry[]
  entry: IdentityAllocationLedgerEntry
  appended: boolean
}> {
  validateIdentityAllocationLedger(ledger)
  const { proposal, approval } = request
  validateIdentityAllocationHistory(request.allocationHistory)
  validateLedgerHistoryCorrespondence(ledger, request.allocationHistory)
  if (approval.proposalSha256 !== proposal.proposalSha256) {
    throw new Error('Identity approval is not bound to the frozen proposal.')
  }
  if (!proposal.orderedQids.includes(approval.qid))
    throw new Error('A QID outside the frozen proposal cannot receive a UUID.')

  if (
    request.allocationHistory.some(
      (event) => event.qid === approval.qid && event.event === 'retired',
    )
  ) {
    throw new Error('A retired QID/UUID allocation cannot be reactivated.')
  }

  const existing = ledger.find(({ qid }) => qid === approval.qid)
  if (existing !== undefined) {
    const replayFieldsAgree =
      existing.canonicalCandidateReceiptSha256 ===
        proposal.candidateReceiptSha256 &&
      existing.reducedProjectionSha256 === approval.reducedProjectionSha256 &&
      existing.proposedSelectionSha256 === proposal.proposalSha256 &&
      existing.allocationRound === proposal.allocationRound &&
      existing.identityOutcome === approval.outcome
    if (!replayFieldsAgree)
      throw new Error(
        'Allocation replay attempted to rewrite an existing QID allocation.',
      )
    return { ledger, entry: existing, appended: false }
  }

  const catalogueItemId = uuidGenerator()
  assertLowercaseUuidV4(catalogueItemId)
  if (ledger.some((entry) => entry.catalogueItemId === catalogueItemId)) {
    throw new Error(
      'The generated UUID is already present in the allocation ledger.',
    )
  }
  const entry: IdentityAllocationLedgerEntry = {
    version: identityAllocationVersion,
    qid: approval.qid,
    catalogueItemId,
    canonicalCandidateReceiptSha256: proposal.candidateReceiptSha256,
    reducedProjectionSha256: approval.reducedProjectionSha256,
    identityOutcome: approval.outcome,
    proposedSelectionSha256: proposal.proposalSha256,
    allocationRound: proposal.allocationRound,
  }
  return { ledger: [...ledger, entry], entry, appended: true }
}

export function allocateIdentityForFixture(
  ledger: readonly IdentityAllocationLedgerEntry[],
  request: Readonly<{
    proposal: FrozenIdentityProposalArtifact
    approval: PrimaryIdentityReviewResult
    allocationHistory: readonly IdentityAllocationHistoryEvent[]
    expectedProjectionSha256?: string
  }>,
  uuidGenerator: () => string = randomUUID,
) {
  if (process.env.NODE_ENV !== 'test')
    throw new Error(
      'Fixture identity allocation is unavailable to live tooling.',
    )
  if (request.expectedProjectionSha256 !== undefined)
    assertSha256(
      request.expectedProjectionSha256,
      'Fixture expected projection hash',
    )
  if (
    request.expectedProjectionSha256 !== undefined &&
    request.approval.reducedProjectionSha256 !==
      request.expectedProjectionSha256
  ) {
    throw new Error(
      'Fixture identity allocation substituted the expected projection hash.',
    )
  }
  return allocateIdentityFromValidatedEvidence(ledger, request, uuidGenerator)
}

export type IdentityAllocationRetirementReason =
  'independent-review-rejected' | 'selection-recomputed-after-correction'

export type IdentityAllocationHistoryEvent =
  | Readonly<{
      version: typeof identityAllocationHistoryVersion
      event: 'allocated'
      qid: string
      catalogueItemId: string
      proposalSha256: string
      reviewRound: number
      reducedProjectionSha256: string
    }>
  | Readonly<{
      version: typeof identityAllocationHistoryVersion
      event: 'active'
      qid: string
      catalogueItemId: string
      proposalSha256: string
      reviewRound: number
      reducedProjectionSha256: string
      finalSelectionSha256: string
    }>
  | Readonly<{
      version: typeof identityAllocationHistoryVersion
      event: 'retired'
      qid: string
      catalogueItemId: string
      proposalSha256: string
      reviewRound: number
      reducedProjectionSha256: string
      finalSelectionSha256: string
      reason: IdentityAllocationRetirementReason
    }>

function strictHistoryRecord(
  input: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Allocation-history event must be an object.')
  }
  const record = input as Record<string, unknown>
  const actual = Object.keys(record).sort()
  const expected = [...keys].sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      'Allocation-history event contains missing or unknown fields.',
    )
  }
  return record
}

export function parseIdentityAllocationHistoryEvent(
  input: unknown,
): IdentityAllocationHistoryEvent {
  const event =
    input !== null && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>).event
      : undefined
  const commonKeys = [
    'version',
    'event',
    'qid',
    'catalogueItemId',
    'proposalSha256',
    'reviewRound',
    'reducedProjectionSha256',
  ]
  const record = strictHistoryRecord(
    input,
    event === 'allocated'
      ? commonKeys
      : event === 'active'
        ? [...commonKeys, 'finalSelectionSha256']
        : event === 'retired'
          ? [...commonKeys, 'finalSelectionSha256', 'reason']
          : [],
  )
  if (event !== 'allocated' && event !== 'active' && event !== 'retired') {
    throw new Error('Allocation-history event kind is not closed.')
  }
  validateHistoryEvent(record as unknown as IdentityAllocationHistoryEvent)
  return record as unknown as IdentityAllocationHistoryEvent
}

export function parseFinalizedIdentityAllocationHistory(
  input: unknown,
): readonly IdentityAllocationHistoryEvent[] {
  if (!Array.isArray(input))
    throw new Error('Finalized allocation history must be an array.')
  const history = input.map(parseIdentityAllocationHistoryEvent)
  validateIdentityAllocationHistory(history, { requireTerminalState: true })
  return history
}

function mappingKey(
  value: Readonly<{ qid: string; catalogueItemId: string }>,
): string {
  return `${value.qid}/${value.catalogueItemId}`
}

function validateHistoryEvent(event: IdentityAllocationHistoryEvent): void {
  if (event.version !== identityAllocationHistoryVersion)
    throw new Error('Allocation-history version is invalid.')
  assertQid(event.qid)
  assertLowercaseUuidV4(event.catalogueItemId)
  assertSha256(event.proposalSha256, 'History proposal hash')
  assertSha256(event.reducedProjectionSha256, 'History projection hash')
  if (!Number.isSafeInteger(event.reviewRound) || event.reviewRound < 1)
    throw new Error('History review rounds start at one.')
  if (event.event !== 'allocated')
    assertSha256(event.finalSelectionSha256, 'Final selection hash')
  if (
    event.event === 'retired' &&
    event.reason !== 'independent-review-rejected' &&
    event.reason !== 'selection-recomputed-after-correction'
  ) {
    throw new Error('Allocation retirement reason is not closed.')
  }
}

export function validateIdentityAllocationHistory(
  history: readonly IdentityAllocationHistoryEvent[],
  options: Readonly<{ requireTerminalState?: boolean }> = {},
): void {
  const states = new Map<
    string,
    Readonly<{
      allocation: Extract<
        IdentityAllocationHistoryEvent,
        { event: 'allocated' }
      >
      terminal?: 'active' | 'retired'
    }>
  >()
  const qidOwners = new Map<string, string>()
  const uuidOwners = new Map<string, string>()
  for (const event of history) {
    validateHistoryEvent(event)
    const key = mappingKey(event)
    const state = states.get(key)
    if (event.event === 'allocated') {
      if (state !== undefined)
        throw new Error(
          'Each QID/UUID mapping must have exactly one allocated event.',
        )
      const qidOwner = qidOwners.get(event.qid)
      const uuidOwner = uuidOwners.get(event.catalogueItemId)
      if (qidOwner !== undefined && qidOwner !== event.catalogueItemId)
        throw new Error('A QID cannot own multiple UUID allocations.')
      if (uuidOwner !== undefined && uuidOwner !== event.qid)
        throw new Error('A UUID cannot be reassigned to another QID.')
      qidOwners.set(event.qid, event.catalogueItemId)
      uuidOwners.set(event.catalogueItemId, event.qid)
      states.set(key, { allocation: event })
      continue
    }
    if (state === undefined)
      throw new Error('Allocation history cannot transition before allocation.')
    if (state.terminal !== undefined)
      throw new Error('An allocation has more than one terminal state.')
    if (
      state.allocation.proposalSha256 !== event.proposalSha256 ||
      state.allocation.reviewRound !== event.reviewRound ||
      state.allocation.reducedProjectionSha256 !== event.reducedProjectionSha256
    ) {
      throw new Error(
        'Allocation history transition does not bind its allocated evidence.',
      )
    }
    states.set(key, { ...state, terminal: event.event })
  }
  if (
    options.requireTerminalState &&
    [...states.values()].some(({ terminal }) => terminal === undefined)
  ) {
    throw new Error(
      'Every allocation must end active or retired before finalization.',
    )
  }
  if (options.requireTerminalState) {
    const finalHashes = new Set(
      history
        .filter((event) => event.event !== 'allocated')
        .map((event) => event.finalSelectionSha256),
    )
    if (finalHashes.size > 1) {
      throw new Error(
        'Every finalized allocation transition must bind one final selection hash.',
      )
    }
  }
}

export function validateLedgerHistoryCorrespondence(
  ledger: readonly IdentityAllocationLedgerEntry[],
  history: readonly IdentityAllocationHistoryEvent[],
): void {
  validateIdentityAllocationLedger(ledger)
  validateIdentityAllocationHistory(history)
  const allocations = history.filter(
    (
      event,
    ): event is Extract<
      IdentityAllocationHistoryEvent,
      { event: 'allocated' }
    > => event.event === 'allocated',
  )
  if (allocations.length !== ledger.length) {
    throw new Error(
      'Allocation ledger and history must contain the same allocated mappings.',
    )
  }
  for (const entry of ledger) {
    const event = allocations.find(
      (candidate) =>
        candidate.qid === entry.qid &&
        candidate.catalogueItemId === entry.catalogueItemId,
    )
    if (
      event === undefined ||
      event.proposalSha256 !== entry.proposedSelectionSha256 ||
      event.reviewRound !== entry.allocationRound ||
      event.reducedProjectionSha256 !== entry.reducedProjectionSha256
    ) {
      throw new Error(
        'Allocation ledger entry does not exactly match its history evidence.',
      )
    }
  }
}

export function allocationHistoryEvent(
  allocation: IdentityAllocationLedgerEntry,
): Extract<IdentityAllocationHistoryEvent, { event: 'allocated' }> {
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

export function appendAllocationHistoryEvent(
  history: readonly IdentityAllocationHistoryEvent[],
  event: IdentityAllocationHistoryEvent,
): readonly IdentityAllocationHistoryEvent[] {
  validateIdentityAllocationHistory(history)
  const next = [...history, event]
  validateIdentityAllocationHistory(next)
  return next
}

export function terminalAllocationHistoryEvent(
  allocation: IdentityAllocationLedgerEntry,
  terminal:
    | Readonly<{ state: 'active'; finalSelectionSha256: string }>
    | Readonly<{
        state: 'retired'
        finalSelectionSha256: string
        reason: IdentityAllocationRetirementReason
      }>,
): Extract<IdentityAllocationHistoryEvent, { event: 'active' | 'retired' }> {
  const common = {
    version: identityAllocationHistoryVersion,
    qid: allocation.qid,
    catalogueItemId: allocation.catalogueItemId,
    proposalSha256: allocation.proposedSelectionSha256,
    reviewRound: allocation.allocationRound,
    reducedProjectionSha256: allocation.reducedProjectionSha256,
    finalSelectionSha256: terminal.finalSelectionSha256,
  } as const
  if (terminal.state === 'active') return { ...common, event: 'active' }
  return { ...common, event: 'retired', reason: terminal.reason }
}

export function allocationHistoryMappings(
  history: readonly IdentityAllocationHistoryEvent[],
): Readonly<{
  active: readonly Readonly<{ qid: string; catalogueItemId: string }>[]
  retired: readonly Readonly<{ qid: string; catalogueItemId: string }>[]
}> {
  validateIdentityAllocationHistory(history, { requireTerminalState: true })
  const terminal = history.filter(
    (
      event,
    ): event is Extract<
      IdentityAllocationHistoryEvent,
      { event: 'active' | 'retired' }
    > => event.event !== 'allocated',
  )
  const toMappings = (state: 'active' | 'retired') =>
    terminal
      .filter(({ event }) => event === state)
      .map(({ qid, catalogueItemId }) => ({ qid, catalogueItemId }))
      .sort((left, right) => compareDiscoveryQids(left.qid, right.qid))
  return { active: toMappings('active'), retired: toMappings('retired') }
}

export type FinalIdentityRepresentationRecord = Readonly<{
  qid: string
  catalogueItemId: string
  state: 'published' | 'draft' | 'hidden'
  intent: 'create' | 'link-existing'
}>

export function finalIdentitySelectionSha256(
  representation: readonly FinalIdentityRepresentationRecord[],
): string {
  const publishedQids = representation
    .filter(({ state }) => state === 'published')
    .map(({ qid }) => qid)
    .sort(compareDiscoveryQids)
  publishedQids.forEach(assertQid)
  if (new Set(publishedQids).size !== publishedQids.length) {
    throw new Error('Final published representation QIDs must be unique.')
  }
  return discoverySha256(publishedQids)
}

function validateFinalIdentityAllocationCorrespondenceWithRetainedQids(
  input: Readonly<{
    ledger: readonly IdentityAllocationLedgerEntry[]
    history: readonly IdentityAllocationHistoryEvent[]
    finalRepresentation: readonly FinalIdentityRepresentationRecord[]
    retainedPredecessorQids: readonly string[]
  }>,
): void {
  validateLedgerHistoryCorrespondence(input.ledger, input.history)
  validateIdentityAllocationHistory(input.history, {
    requireTerminalState: true,
  })
  const qids = new Set<string>()
  const uuids = new Set<string>()
  const retainedPredecessorQids = new Set(input.retainedPredecessorQids)
  if (
    retainedPredecessorQids.size !== input.retainedPredecessorQids.length ||
    [...retainedPredecessorQids].some((qid) => !/^Q[1-9][0-9]*$/.test(qid))
  ) {
    throw new Error(
      'Retained predecessor create exclusions must be canonical and unique.',
    )
  }
  for (const record of input.finalRepresentation) {
    assertQid(record.qid)
    assertLowercaseUuidV4(record.catalogueItemId)
    if (
      record.state !== 'published' &&
      record.state !== 'draft' &&
      record.state !== 'hidden'
    ) {
      throw new Error('Final identity representation state is invalid.')
    }
    if (record.intent !== 'create' && record.intent !== 'link-existing') {
      throw new Error('Final identity representation intent is invalid.')
    }
    if (qids.has(record.qid) || uuids.has(record.catalogueItemId)) {
      throw new Error('Final identity representation ownership must be unique.')
    }
    qids.add(record.qid)
    uuids.add(record.catalogueItemId)
    if (
      retainedPredecessorQids.has(record.qid) &&
      record.intent !== 'link-existing'
    ) {
      throw new Error(
        'A retained predecessor can never use the create identity path.',
      )
    }
  }
  const finalSelectionSha256 = finalIdentitySelectionSha256(
    input.finalRepresentation,
  )
  const terminalEvents = input.history.filter(
    (
      event,
    ): event is Extract<
      IdentityAllocationHistoryEvent,
      { event: 'active' | 'retired' }
    > => event.event !== 'allocated',
  )
  for (const event of terminalEvents) {
    if (retainedPredecessorQids.has(event.qid)) {
      throw new Error(
        'A retained predecessor can never have an allocation history outcome.',
      )
    }
    if (event.finalSelectionSha256 !== finalSelectionSha256) {
      throw new Error(
        'Allocation history final selection hash does not match the final representation.',
      )
    }
    const record = input.finalRepresentation.find(
      (candidate) =>
        candidate.qid === event.qid ||
        candidate.catalogueItemId === event.catalogueItemId,
    )
    if (event.event === 'active') {
      if (
        record?.qid !== event.qid ||
        record.catalogueItemId !== event.catalogueItemId ||
        record.state !== 'published' ||
        record.intent !== 'create'
      ) {
        throw new Error(
          'Active allocation must exactly match one published create record.',
        )
      }
    } else if (record !== undefined) {
      throw new Error(
        'Retired allocation must be absent from every final representation record.',
      )
    }
  }
  for (const record of input.finalRepresentation.filter(
    ({ intent }) => intent === 'create',
  )) {
    if (retainedPredecessorQids.has(record.qid)) {
      throw new Error(
        'A retained predecessor can never have a create allocation.',
      )
    }
    if (
      !terminalEvents.some(
        (event) =>
          event.event === 'active' &&
          event.qid === record.qid &&
          event.catalogueItemId === record.catalogueItemId,
      )
    ) {
      throw new Error(
        'Every final create record must have one active allocation history outcome.',
      )
    }
  }
}

export function validateFinalIdentityAllocationCorrespondence(
  input: Readonly<{
    ledger: readonly IdentityAllocationLedgerEntry[]
    history: readonly IdentityAllocationHistoryEvent[]
    finalRepresentation: readonly FinalIdentityRepresentationRecord[]
    predecessorReviewResult: unknown
    predecessorCorpus: AnimeReleaseCorpus
    predecessorReviewLedger: AnimeReleaseReviewLedger
    predecessorIndex: AnimeReleaseIndex
    predecessorPreparation: unknown
  }>,
): void {
  const predecessorReview = validatePredecessorReviewResult(
    input.predecessorReviewResult,
    input.predecessorCorpus,
    input.predecessorReviewLedger,
    input.predecessorIndex,
    input.predecessorPreparation,
  )
  const retainedPredecessorQids = predecessorReview.records.map(
    ({ sourceItemId }) => sourceItemId,
  )
  if (new Set(retainedPredecessorQids).size !== 500) {
    throw new Error(
      'Final identity correspondence requires exactly 500 authenticated predecessor identities.',
    )
  }
  validateFinalIdentityAllocationCorrespondenceWithRetainedQids({
    ledger: input.ledger,
    history: input.history,
    finalRepresentation: input.finalRepresentation,
    retainedPredecessorQids,
  })
}

export function validateFinalIdentityAllocationCorrespondenceForFixture(
  input: Readonly<{
    ledger: readonly IdentityAllocationLedgerEntry[]
    history: readonly IdentityAllocationHistoryEvent[]
    finalRepresentation: readonly FinalIdentityRepresentationRecord[]
    retainedPredecessorQids: readonly string[]
  }>,
): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(
      'Fixture retained-predecessor allocation correspondence is unavailable to live tooling.',
    )
  }
  if (input.retainedPredecessorQids.length > 500) {
    throw new Error(
      'Fixture retained-predecessor allocation correspondence is bounded to 500 identities.',
    )
  }
  validateFinalIdentityAllocationCorrespondenceWithRetainedQids(input)
}

export function identityAllocationLedgerSha256(
  ledger: readonly IdentityAllocationLedgerEntry[],
): string {
  validateIdentityAllocationLedger(ledger)
  return discoverySha256(ledger)
}

export function identityAllocationHistorySha256(
  history: readonly IdentityAllocationHistoryEvent[],
): string {
  validateIdentityAllocationHistory(history, { requireTerminalState: true })
  return discoverySha256(history)
}

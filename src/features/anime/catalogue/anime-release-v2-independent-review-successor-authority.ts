import {
  createIndependentReviewPopulationAuthority,
  createIndependentReviewSeedAuthority,
  parseIndependentReviewPopulationAuthority,
  parseIndependentReviewProposal,
  parseIndependentReviewSeedAuthority,
  type IndependentReviewPopulationAuthority,
  type IndependentReviewPopulationRecord,
  type IndependentReviewProposal,
  type IndependentReviewSeedAuthority,
} from '@/features/anime/catalogue/anime-release-v2-independent-review'
import {
  allocationHistoryEvent,
  identityAllocationLedgerSha256,
  parseFrozenIdentityProposalArtifact,
  parseFrozenIdentityProposalForFixture,
  parseIdentityAllocationLedger,
  parseIdentityAllocationHistoryEvent,
  parsePrimaryIdentityReviewResult,
  validateIdentityAllocationHistory,
  validateLedgerHistoryCorrespondence,
  type FrozenIdentityProposalArtifact,
  type IdentityAllocationHistoryEvent,
  type IdentityAllocationLedgerEntry,
  type IdentityProposalAuthority,
  type IdentityProposalFixtureAuthority,
} from '@/features/anime/catalogue/anime-release-v2-identity-allocation'
import { acceptedCandidateProjectionSha256 } from '@/features/anime/catalogue/anime-v2-candidate-acquisition'
import { parseAcceptedCandidateReceipt } from '@/features/anime/catalogue/anime-release-v2-continuity'
import {
  parseIdentityReplacementReviewResult,
  replacementLineageSha256,
  validateReplacementLineage,
  type IdentityReplacementReviewResult,
  type ReplacementLineageEntry,
} from '@/features/anime/catalogue/anime-release-v2-lineage'
import {
  canonicalJson,
  compareDiscoveryQids,
  discoverySha256,
} from '@/features/anime/catalogue/wikidata-anime-discovery'

const sha256Pattern = /^[a-f0-9]{64}$/

export const independentReviewAuthoritySnapshotSchema =
  'zedarchive.anime-v2-independent-review-authority-snapshot' as const
export const independentReviewSuccessorPopulationAuthoritySchema =
  'zedarchive.anime-v2-independent-review-successor-population-authority' as const
export const independentReviewReplacementProofSchema =
  'zedarchive.anime-v2-independent-review-replacement-proof' as const

/**
 * The finite defect vocabulary belongs to the successor-proof protocol. The
 * result/history authority imports this definition so a proof cannot be
 * structurally valid under one vocabulary and semantically resolved under
 * another.
 */
export const independentReviewDefectCategories = [
  'work-identity',
  'duplicate',
  'unusable-public-title',
  'unsupported-factual-value',
  'incorrect-publication-state',
  'missed-adult-safety-signal',
  'invalid-provenance',
  'missing-required-review',
  'predecessor-integrity',
] as const
export type IndependentReviewDefectCategory =
  (typeof independentReviewDefectCategories)[number]

export function independentReviewWorkingAllocationHistorySha256(
  history: readonly IdentityAllocationHistoryEvent[],
): string {
  validateIdentityAllocationHistory(history)
  if (history.some((event) => event.event === 'active'))
    throw new Error(
      'Independent-review working allocation history cannot finalize active allocations.',
    )
  return discoverySha256({
    schema: 'independent-review-working-allocation-history.v1',
    history,
  })
}

export type IndependentReviewInitialAuthoritySnapshot = Readonly<{
  schema: typeof independentReviewAuthoritySnapshotSchema
  version: 1
  kind: 'initial'
  round: 0
  seedAuthority: IndependentReviewSeedAuthority
  proposal: IndependentReviewProposal
  population: IndependentReviewPopulationAuthority
  allocationLedger: readonly IdentityAllocationLedgerEntry[]
  allocationLedgerSha256: string
  allocationHistory: readonly IdentityAllocationHistoryEvent[]
  allocationHistorySha256: string
  reviewSeriesSha256: string
  authoritySnapshotSha256: string
}>

export type IndependentReviewSuccessorPopulationAuthority = Readonly<{
  schema: typeof independentReviewSuccessorPopulationAuthoritySchema
  version: 1
  rootSeedAuthoritySha256: string
  reviewSeriesSha256: string
  round: number
  proposalSha256: string
  orderedProposedPublishedQidSequenceSha256: string
  priorAuthoritySnapshotSha256: string
  records: readonly IndependentReviewPopulationRecord[]
  populationSha256: string
}>

export type IndependentReviewReplacementAddition = Readonly<{
  qid: string
  identityProposal: unknown
  identityProposalAuthority: IdentityProposalAuthority
  primaryIdentityReviewResult: unknown
  allocation: unknown
}>

export type IndependentReviewReplacementRemoval = Readonly<{
  qid: string
  retirement: unknown
}>

export type IndependentReviewTriggeringDefect = Readonly<{
  planSha256: string
  inputSha256: string
  resultSha256: string
  recordCommitment: string
  qid: string
  category: IndependentReviewDefectCategory
}>

export type IndependentReviewReplacementProof = Readonly<{
  schema: typeof independentReviewReplacementProofSchema
  version: 1
  reviewSeriesSha256: string
  round: number
  priorAuthoritySnapshotSha256: string
  priorProposalSha256: string
  priorPopulationSha256: string
  nextProposalSha256: string
  nextPopulationSha256: string
  replacementLineage: readonly ReplacementLineageEntry[]
  replacementLineageSha256: string
  identityReplacementReviewResult: IdentityReplacementReviewResult
  allocationLedger: readonly IdentityAllocationLedgerEntry[]
  allocationLedgerSha256: string
  allocationHistory: readonly IdentityAllocationHistoryEvent[]
  allocationHistorySha256: string
  additions: readonly IndependentReviewReplacementAddition[]
  removals: readonly IndependentReviewReplacementRemoval[]
  triggeringDefects: readonly IndependentReviewTriggeringDefect[]
  replacementProofSha256: string
}>

export type IndependentReviewSuccessorAuthoritySnapshot = Readonly<{
  schema: typeof independentReviewAuthoritySnapshotSchema
  version: 1
  kind: 'successor'
  round: number
  rootSeedAuthoritySha256: string
  reviewSeriesSha256: string
  priorAuthoritySnapshotSha256: string
  proposal: IndependentReviewProposal
  population: IndependentReviewSuccessorPopulationAuthority
  replacementProof: IndependentReviewReplacementProof
  authoritySnapshotSha256: string
}>

export type IndependentReviewAuthoritySnapshot =
  | IndependentReviewInitialAuthoritySnapshot
  | IndependentReviewSuccessorAuthoritySnapshot

type ParsedReplacementIdentityProposal = Readonly<{
  proposal: FrozenIdentityProposalArtifact
  expectedProjectionSha256?: string
}>

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function strictObject(
  input: unknown,
  keys: readonly string[],
  description: string,
): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input))
    throw new Error(`${description} must be an object.`)
  const actual = Object.keys(input as Record<string, unknown>).sort(
    compareAscii,
  )
  const expected = [...keys].sort(compareAscii)
  if (canonicalJson(actual) !== canonicalJson(expected))
    throw new Error(`${description} contains missing or unknown fields.`)
  return input as Record<string, unknown>
}

function assertSha256(
  value: unknown,
  description: string,
): asserts value is string {
  if (typeof value !== 'string' || !sha256Pattern.test(value))
    throw new Error(`${description} must be a lowercase SHA-256 digest.`)
}

function assertQid(
  value: unknown,
  description: string,
): asserts value is string {
  if (typeof value !== 'string' || !/^Q[1-9][0-9]*$/.test(value))
    throw new Error(`${description} must be a canonical QID.`)
}

function assertRound(
  value: unknown,
  description: string,
  minimum: number,
): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum)
    throw new Error(
      `${description} must be a safe integer of at least ${minimum}.`,
    )
}

function assertCanonicalQids(
  value: unknown,
  description: string,
): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`${description} must be an array.`)
  value.forEach((qid) => assertQid(qid, description))
  if (
    new Set(value).size !== value.length ||
    canonicalJson([...value].sort(compareDiscoveryQids)) !==
      canonicalJson(value)
  )
    throw new Error(
      `${description} must be unique and ascending numeric-QID ordered.`,
    )
  return value as readonly string[]
}

function parseReplacementLineageEntries(
  input: unknown,
): readonly ReplacementLineageEntry[] {
  if (!Array.isArray(input))
    throw new Error('Independent-review replacement lineage must be an array.')
  return input.map((entry) => {
    const value = strictObject(
      entry,
      [
        'version',
        'round',
        'removedQids',
        'addedQids',
        'previousOrderedQidSequenceSha256',
        'currentOrderedQids',
        'currentOrderedQidSequenceSha256',
        'roundSeed',
      ],
      'Independent-review replacement-lineage entry',
    )
    if (value.version !== 'replacement-lineage.v1')
      throw new Error(
        'Independent-review replacement-lineage version is invalid.',
      )
    assertRound(value.round, 'Independent-review replacement-lineage round', 1)
    const removedQids = assertCanonicalQids(
      value.removedQids,
      'Independent-review replacement-lineage removed QIDs',
    )
    const addedQids = assertCanonicalQids(
      value.addedQids,
      'Independent-review replacement-lineage added QIDs',
    )
    const currentOrderedQids = assertCanonicalQids(
      value.currentOrderedQids,
      'Independent-review replacement-lineage current QIDs',
    )
    for (const key of [
      'previousOrderedQidSequenceSha256',
      'currentOrderedQidSequenceSha256',
      'roundSeed',
    ] as const)
      assertSha256(value[key], `Independent-review replacement-lineage ${key}`)
    return {
      version: value.version,
      round: value.round as number,
      removedQids,
      addedQids,
      previousOrderedQidSequenceSha256:
        value.previousOrderedQidSequenceSha256 as string,
      currentOrderedQids,
      currentOrderedQidSequenceSha256:
        value.currentOrderedQidSequenceSha256 as string,
      roundSeed: value.roundSeed as string,
    }
  })
}

function assertCommitment(
  value: unknown,
  expected: string,
  description: string,
): void {
  assertSha256(value, description)
  if (value !== expected) throw new Error(`${description} has drifted.`)
}

export function deriveIndependentReviewSeriesSha256(
  seedInput: unknown,
  proposalInput: unknown,
  populationInput: unknown,
): string {
  const seedAuthority = parseIndependentReviewSeedAuthority(seedInput)
  const proposal = parseIndependentReviewProposal(proposalInput)
  const population = parseIndependentReviewPopulationAuthority(
    populationInput,
    proposal,
    seedAuthority,
  )
  return discoverySha256({
    schema: 'independent-review-series-root.v1',
    seedAuthoritySha256: seedAuthority.seedAuthoritySha256,
    proposalSha256: proposal.proposalSha256,
    populationSha256: population.populationSha256,
  })
}

function initialSnapshotCore(
  input: Omit<
    IndependentReviewInitialAuthoritySnapshot,
    'authoritySnapshotSha256'
  >,
) {
  return input
}

export function createIndependentReviewInitialAuthoritySnapshot(
  input: Readonly<{
    seedAuthority: unknown
    proposal: unknown
    population: unknown
    allocationLedger: unknown
    allocationHistory: unknown
  }>,
): IndependentReviewInitialAuthoritySnapshot {
  const seedAuthority = parseIndependentReviewSeedAuthority(input.seedAuthority)
  const proposal = parseIndependentReviewProposal(input.proposal)
  const population = parseIndependentReviewPopulationAuthority(
    input.population,
    proposal,
    seedAuthority,
  )
  const allocationLedger = parseIdentityAllocationLedger(input.allocationLedger)
  if (!Array.isArray(input.allocationHistory))
    throw new Error(
      'Independent-review root allocation history must be an array.',
    )
  const allocationHistory = input.allocationHistory.map(
    parseIdentityAllocationHistoryEvent,
  )
  validateLedgerHistoryCorrespondence(allocationLedger, allocationHistory)
  if (allocationHistory.some((event) => event.event !== 'allocated'))
    throw new Error(
      'Independent-review root allocation history permits only allocated events.',
    )
  const newCandidateRecords = population.records.filter(
    (record) => record.projection.kind === 'new-candidate',
  )
  if (allocationLedger.length !== newCandidateRecords.length)
    throw new Error(
      'Independent-review root ledger must contain exactly every new-candidate allocation.',
    )
  const newCandidateByQid = new Map(
    newCandidateRecords.map((record) => [record.qid, record]),
  )
  for (const entry of allocationLedger) {
    const record = newCandidateByQid.get(entry.qid)
    if (
      record === undefined ||
      record.canonicalUuid !== entry.catalogueItemId ||
      record.identityAllocationSha256 !== discoverySha256(entry)
    )
      throw new Error(
        'Independent-review root ledger does not match new-candidate population ownership.',
      )
  }
  if (
    allocationHistory.length !== allocationLedger.length ||
    allocationHistory.some(
      (event, index) =>
        canonicalJson(event) !==
        canonicalJson(allocationHistoryEvent(allocationLedger[index]!)),
    )
  )
    throw new Error(
      'Independent-review root history must be the exact same-order ledger projection.',
    )
  const allocationLedgerSha256 =
    identityAllocationLedgerSha256(allocationLedger)
  const allocationHistorySha256 =
    independentReviewWorkingAllocationHistorySha256(allocationHistory)
  const reviewSeriesSha256 = deriveIndependentReviewSeriesSha256(
    seedAuthority,
    proposal,
    population,
  )
  const core = {
    schema: independentReviewAuthoritySnapshotSchema,
    version: 1 as const,
    kind: 'initial' as const,
    round: 0 as const,
    seedAuthority,
    proposal,
    population,
    allocationLedger,
    allocationLedgerSha256,
    allocationHistory,
    allocationHistorySha256,
    reviewSeriesSha256,
  }
  return {
    ...core,
    authoritySnapshotSha256: discoverySha256(initialSnapshotCore(core)),
  }
}

export function parseIndependentReviewInitialAuthoritySnapshot(
  input: unknown,
): IndependentReviewInitialAuthoritySnapshot {
  const value = strictObject(
    input,
    [
      'schema',
      'version',
      'kind',
      'round',
      'seedAuthority',
      'proposal',
      'population',
      'allocationLedger',
      'allocationLedgerSha256',
      'allocationHistory',
      'allocationHistorySha256',
      'reviewSeriesSha256',
      'authoritySnapshotSha256',
    ],
    'Independent-review initial authority snapshot',
  )
  if (
    value.schema !== independentReviewAuthoritySnapshotSchema ||
    value.version !== 1 ||
    value.kind !== 'initial' ||
    value.round !== 0
  )
    throw new Error('Independent-review initial snapshot shape is invalid.')
  const expected = createIndependentReviewInitialAuthoritySnapshot({
    seedAuthority: value.seedAuthority,
    proposal: value.proposal,
    population: value.population,
    allocationLedger: value.allocationLedger,
    allocationHistory: value.allocationHistory,
  })
  assertCommitment(
    value.reviewSeriesSha256,
    expected.reviewSeriesSha256,
    'Independent-review initial series commitment',
  )
  assertCommitment(
    value.allocationLedgerSha256,
    expected.allocationLedgerSha256,
    'Independent-review root allocation-ledger commitment',
  )
  assertCommitment(
    value.allocationHistorySha256,
    expected.allocationHistorySha256,
    'Independent-review root allocation-history commitment',
  )
  assertCommitment(
    value.authoritySnapshotSha256,
    expected.authoritySnapshotSha256,
    'Independent-review initial snapshot commitment',
  )
  return expected
}

function successorPopulationCore(
  value: Omit<
    IndependentReviewSuccessorPopulationAuthority,
    'populationSha256'
  >,
) {
  return value
}

function createSuccessorPopulation(
  input: Omit<
    IndependentReviewSuccessorPopulationAuthority,
    'populationSha256'
  >,
  proposal: IndependentReviewProposal,
  root: IndependentReviewInitialAuthoritySnapshot,
): IndependentReviewSuccessorPopulationAuthority {
  assertCommitment(
    input.rootSeedAuthoritySha256,
    root.seedAuthority.seedAuthoritySha256,
    'Independent-review successor root seed commitment',
  )
  assertCommitment(
    input.reviewSeriesSha256,
    root.reviewSeriesSha256,
    'Independent-review successor series commitment',
  )
  assertRound(input.round, 'Independent-review successor population round', 1)
  assertCommitment(
    input.proposalSha256,
    proposal.proposalSha256,
    'Independent-review successor proposal commitment',
  )
  assertCommitment(
    input.orderedProposedPublishedQidSequenceSha256,
    proposal.orderedProposedPublishedQidSequenceSha256,
    'Independent-review successor proposal sequence commitment',
  )
  assertSha256(
    input.priorAuthoritySnapshotSha256,
    'Independent-review successor prior snapshot commitment',
  )
  if (!Array.isArray(input.records) || input.records.length !== 5_000)
    throw new Error(
      'Independent-review successor population requires exactly 5,000 records.',
    )

  // The root seed intentionally cannot validate a corrected proposal. Reuse the
  // exact record parser under a temporary current-proposal seed, then retain
  // the root seed commitment in the successor-only wrapper.
  const temporarySeed = createIndependentReviewSeedAuthority({
    candidateReceiptSha256: proposal.candidateReceiptSha256,
    predecessorCorpusSha256: proposal.predecessorCorpusSha256,
    orderedProposedPublishedQidSequenceSha256:
      proposal.orderedProposedPublishedQidSequenceSha256,
  })
  const parsed = createIndependentReviewPopulationAuthority(
    {
      candidateAuthoritySha256: proposal.candidateAuthoritySha256,
      candidateReceiptSha256: proposal.candidateReceiptSha256,
      predecessorCorpusSha256: proposal.predecessorCorpusSha256,
      proposalSha256: proposal.proposalSha256,
      orderedProposedPublishedQidSequenceSha256:
        proposal.orderedProposedPublishedQidSequenceSha256,
      seedAuthoritySha256: temporarySeed.seedAuthoritySha256,
      records: input.records,
    },
    proposal,
    temporarySeed,
  )
  const core = {
    schema: independentReviewSuccessorPopulationAuthoritySchema,
    version: 1 as const,
    rootSeedAuthoritySha256: input.rootSeedAuthoritySha256,
    reviewSeriesSha256: input.reviewSeriesSha256,
    round: input.round,
    proposalSha256: input.proposalSha256,
    orderedProposedPublishedQidSequenceSha256:
      input.orderedProposedPublishedQidSequenceSha256,
    priorAuthoritySnapshotSha256: input.priorAuthoritySnapshotSha256,
    records: parsed.records,
  }
  return {
    ...core,
    populationSha256: discoverySha256(successorPopulationCore(core)),
  }
}

function parseSuccessorPopulation(
  input: unknown,
  proposal: IndependentReviewProposal,
  root: IndependentReviewInitialAuthoritySnapshot,
  expected: Readonly<{
    round: number
    priorAuthoritySnapshotSha256: string
  }>,
): IndependentReviewSuccessorPopulationAuthority {
  const value = strictObject(
    input,
    [
      'schema',
      'version',
      'rootSeedAuthoritySha256',
      'reviewSeriesSha256',
      'round',
      'proposalSha256',
      'orderedProposedPublishedQidSequenceSha256',
      'priorAuthoritySnapshotSha256',
      'records',
      'populationSha256',
    ],
    'Independent-review successor population authority',
  )
  if (
    value.schema !== independentReviewSuccessorPopulationAuthoritySchema ||
    value.version !== 1
  )
    throw new Error(
      'Independent-review successor population schema is unsupported.',
    )
  if (
    value.round !== expected.round ||
    value.priorAuthoritySnapshotSha256 !== expected.priorAuthoritySnapshotSha256
  )
    throw new Error(
      'Independent-review successor population is detached from its snapshot.',
    )
  const parsed = createSuccessorPopulation(
    {
      schema: independentReviewSuccessorPopulationAuthoritySchema,
      version: 1,
      rootSeedAuthoritySha256: value.rootSeedAuthoritySha256 as string,
      reviewSeriesSha256: value.reviewSeriesSha256 as string,
      round: value.round as number,
      proposalSha256: value.proposalSha256 as string,
      orderedProposedPublishedQidSequenceSha256:
        value.orderedProposedPublishedQidSequenceSha256 as string,
      priorAuthoritySnapshotSha256:
        value.priorAuthoritySnapshotSha256 as string,
      records: value.records as readonly IndependentReviewPopulationRecord[],
    },
    proposal,
    root,
  )
  assertCommitment(
    value.populationSha256,
    parsed.populationSha256,
    'Independent-review successor population commitment',
  )
  return parsed
}

function parseReplacementAdditions(
  input: unknown,
  parser: (
    value: unknown,
    authority: unknown,
    qid: string,
  ) => ParsedReplacementIdentityProposal,
  proof: Readonly<{
    expectedQids: readonly string[]
    population: IndependentReviewSuccessorPopulationAuthority
    ledgerByQid: ReadonlyMap<string, IdentityAllocationLedgerEntry>
    populationByQid: ReadonlyMap<string, IndependentReviewPopulationRecord>
  }>,
): readonly IndependentReviewReplacementAddition[] {
  if (!Array.isArray(input))
    throw new Error(
      'Independent-review replacement additions must be an array.',
    )
  const additions = input.map((entry) => {
    const value = strictObject(
      entry,
      [
        'qid',
        'identityProposal',
        'identityProposalAuthority',
        'primaryIdentityReviewResult',
        'allocation',
      ],
      'Independent-review replacement addition',
    )
    assertQid(value.qid, 'Independent-review replacement addition QID')
    const parsedProposal = parser(
      value.identityProposal,
      value.identityProposalAuthority,
      value.qid as string,
    )
    const proposal = parsedProposal.proposal
    if (
      proposal.allocationRound !== proof.population.round + 1 ||
      proposal.selectionAuthority.kind !== 'replacement-lineage' ||
      canonicalJson(proposal.orderedQids) !== canonicalJson(proof.expectedQids)
    )
      throw new Error(
        'Independent-review replacement identity proposal is not bound to the complete current round.',
      )
    const approval = parsePrimaryIdentityReviewResult(
      value.primaryIdentityReviewResult,
      proposal,
      parsedProposal.expectedProjectionSha256,
    )
    const allocation = parseIdentityAllocationLedger([value.allocation])[0]!
    if (
      approval.qid !== value.qid ||
      allocation.qid !== value.qid ||
      allocation.catalogueItemId === undefined ||
      allocation.proposedSelectionSha256 !== proposal.proposalSha256 ||
      allocation.reducedProjectionSha256 !== approval.reducedProjectionSha256 ||
      allocation.allocationRound !== approval.allocationRound
    )
      throw new Error(
        'Independent-review replacement addition identity evidence is not bound.',
      )
    const populationRecord = proof.populationByQid.get(value.qid as string)
    if (
      !populationRecord ||
      populationRecord.canonicalUuid !== allocation.catalogueItemId ||
      populationRecord.identityReviewSha256 !== discoverySha256(approval) ||
      populationRecord.identityAllocationSha256 !== discoverySha256(allocation)
    )
      throw new Error(
        'Independent-review replacement addition does not match the successor population.',
      )
    if (
      canonicalJson(proof.ledgerByQid.get(value.qid as string)) !==
      canonicalJson(allocation)
    )
      throw new Error(
        'Independent-review replacement addition is absent from the full ledger.',
      )
    return {
      qid: value.qid as string,
      identityProposal: value.identityProposal,
      identityProposalAuthority:
        value.identityProposalAuthority as IdentityProposalAuthority,
      primaryIdentityReviewResult: value.primaryIdentityReviewResult,
      allocation: value.allocation,
    }
  })
  const qids = assertCanonicalQids(
    additions.map(({ qid }) => qid),
    'Independent-review replacement addition QIDs',
  )
  if (canonicalJson(qids) !== canonicalJson(proof.expectedQids))
    throw new Error(
      'Independent-review replacement additions do not match the lineage delta.',
    )
  return additions
}

function parseReplacementRemovals(
  input: unknown,
  expectedQids: readonly string[],
  finalSelectionSha256: string,
  priorPopulationByQid: ReadonlyMap<string, IndependentReviewPopulationRecord>,
  expectedOutcomeByQid: ReadonlyMap<string, string>,
  retiredHistoryByQid: ReadonlyMap<string, IdentityAllocationHistoryEvent>,
): readonly IndependentReviewReplacementRemoval[] {
  if (!Array.isArray(input))
    throw new Error('Independent-review replacement removals must be an array.')
  const removals = input.map((entry) => {
    const value = strictObject(
      entry,
      ['qid', 'retirement'],
      'Independent-review replacement removal',
    )
    assertQid(value.qid, 'Independent-review replacement removal QID')
    const retirement = parseIdentityAllocationHistoryEvent(value.retirement)
    if (retirement?.event !== 'retired')
      throw new Error(
        'Independent-review replacement removal requires a retirement event.',
      )
    const prior = priorPopulationByQid.get(value.qid as string)
    if (
      !prior ||
      retirement.qid !== value.qid ||
      retirement.catalogueItemId !== prior.canonicalUuid ||
      prior.projection.kind !== 'new-candidate' ||
      retirement.finalSelectionSha256 !== finalSelectionSha256 ||
      retirement.reason !== expectedOutcomeByQid.get(value.qid as string)
    )
      throw new Error(
        'Independent-review replacement retirement does not match prior ownership.',
      )
    if (
      canonicalJson(retiredHistoryByQid.get(value.qid as string)) !==
      canonicalJson(retirement)
    )
      throw new Error(
        'Independent-review replacement retirement is absent from full history.',
      )
    return { qid: value.qid as string, retirement: value.retirement }
  })
  const qids = assertCanonicalQids(
    removals.map(({ qid }) => qid),
    'Independent-review replacement removal QIDs',
  )
  if (canonicalJson(qids) !== canonicalJson(expectedQids))
    throw new Error(
      'Independent-review replacement removals do not match the lineage delta.',
    )
  return removals
}

function validateOwnershipAndDeltas(
  root: IndependentReviewInitialAuthoritySnapshot,
  previousSnapshots: readonly IndependentReviewAuthoritySnapshot[],
  prior: IndependentReviewAuthoritySnapshot,
  population: IndependentReviewSuccessorPopulationAuthority,
  ledger: readonly IdentityAllocationLedgerEntry[],
  history: readonly IdentityAllocationHistoryEvent[],
  removedQids: readonly string[],
  addedQids: readonly string[],
): void {
  const priorRecords = prior.population.records
  const currentByQid = new Map(
    population.records.map((record) => [record.qid, record]),
  )
  const priorByQid = new Map(priorRecords.map((record) => [record.qid, record]))
  for (const qid of priorByQid.keys()) {
    const previous = priorByQid.get(qid)!
    const current = currentByQid.get(qid)
    if (!current) continue
    if (
      previous.canonicalUuid !== current.canonicalUuid ||
      previous.qid !== current.qid
    )
      throw new Error(
        'Independent-review successor changed retained QID/UUID ownership.',
      )
    const previousWithoutSuccessorDerivedCommitments = {
      ...previous,
      proposalRecordSha256: null,
      recordCommitment: null,
      projection: {
        ...previous.projection,
        proposalRecordSha256: null,
        projectionSha256: null,
      },
    }
    const currentWithoutSuccessorDerivedCommitments = {
      ...current,
      proposalRecordSha256: null,
      recordCommitment: null,
      projection: {
        ...current.projection,
        proposalRecordSha256: null,
        projectionSha256: null,
      },
    }
    if (
      canonicalJson(previousWithoutSuccessorDerivedCommitments) !==
      canonicalJson(currentWithoutSuccessorDerivedCommitments)
    )
      throw new Error(
        'Independent-review successor changed a retained substantive population record.',
      )
  }
  const actualRemoved = [...priorByQid.keys()]
    .filter((qid) => !currentByQid.has(qid))
    .sort(compareDiscoveryQids)
  const actualAdded = [...currentByQid.keys()]
    .filter((qid) => !priorByQid.has(qid))
    .sort(compareDiscoveryQids)
  if (
    canonicalJson(actualRemoved) !== canonicalJson(removedQids) ||
    canonicalJson(actualAdded) !== canonicalJson(addedQids)
  )
    throw new Error(
      'Independent-review replacement lineage does not match proposal/population delta.',
    )
  const historicalSnapshots = previousSnapshots
  const historicRecords = historicalSnapshots.flatMap(
    (snapshot) => snapshot.population.records,
  )
  const allocationBearingHistoricRecords = historicRecords.filter(
    (record) => record.projection.kind === 'new-candidate',
  )
  const allocationBearingCurrentRecords = population.records.filter(
    (record) => record.projection.kind === 'new-candidate',
  )
  const historicRecordByQid = new Map(
    historicRecords.map((record) => [record.qid, record]),
  )
  const cumulativeRemovedQids = historicalSnapshots.flatMap((snapshot) =>
    snapshot.kind === 'initial'
      ? []
      : snapshot.replacementProof.replacementLineage.at(-1)!.removedQids,
  )
  const retiredUuids = new Set(
    [...cumulativeRemovedQids, ...removedQids].map(
      (qid) => historicRecordByQid.get(qid)!.canonicalUuid,
    ),
  )
  if (
    population.records.some((record) => retiredUuids.has(record.canonicalUuid))
  )
    throw new Error('Independent-review successor reintroduced a retired UUID.')

  const historicUuidOwners = new Map<string, string>()
  for (const record of historicRecords) {
    const existingOwner = historicUuidOwners.get(record.canonicalUuid)
    if (existingOwner !== undefined && existingOwner !== record.qid)
      throw new Error(
        'Independent-review successor history contains conflicting UUID ownership.',
      )
    historicUuidOwners.set(record.canonicalUuid, record.qid)
  }
  for (const record of population.records) {
    const historicOwner = historicUuidOwners.get(record.canonicalUuid)
    if (historicOwner !== undefined && historicOwner !== record.qid)
      throw new Error(
        'Independent-review successor reused a historical UUID for another QID.',
      )
  }

  const recordByQid = new Map(
    [
      ...allocationBearingHistoricRecords,
      ...allocationBearingCurrentRecords,
    ].map((record) => [record.qid, record]),
  )
  if (ledger.length !== recordByQid.size)
    throw new Error(
      'Independent-review replacement ledger contains extra or missing ownership records.',
    )
  for (const entry of ledger) {
    const record = recordByQid.get(entry.qid)
    if (
      !record ||
      record.canonicalUuid !== entry.catalogueItemId ||
      record.identityAllocationSha256 !== discoverySha256(entry)
    )
      throw new Error(
        'Independent-review replacement ledger changed record ownership or allocation hash.',
      )
  }
  {
    const priorLedger =
      prior.kind === 'initial'
        ? prior.allocationLedger
        : prior.replacementProof.allocationLedger
    const priorHistory =
      prior.kind === 'initial'
        ? prior.allocationHistory
        : prior.replacementProof.allocationHistory
    if (
      canonicalJson(ledger.slice(0, priorLedger.length)) !==
        canonicalJson(priorLedger) ||
      canonicalJson(history.slice(0, priorHistory.length)) !==
        canonicalJson(priorHistory)
    )
      throw new Error(
        'Independent-review replacement must preserve complete prior ledger/history bytes.',
      )
    const expectedLedgerDelta = ledger.slice(priorLedger.length)
    if (
      canonicalJson(
        expectedLedgerDelta
          .map((entry) => entry.qid)
          .sort(compareDiscoveryQids),
      ) !== canonicalJson(addedQids)
    )
      throw new Error(
        'Independent-review replacement ledger has an unexpected delta.',
      )
    const expectedHistoryDelta = history.slice(priorHistory.length)
    const expectedNewAllocationQids = expectedHistoryDelta
      .filter((event) => event.event === 'allocated')
      .map((event) => event.qid)
      .sort(compareDiscoveryQids)
    const expectedNewRetiredQids = expectedHistoryDelta
      .filter((event) => event.event === 'retired')
      .map((event) => event.qid)
      .sort(compareDiscoveryQids)
    if (
      canonicalJson(expectedNewAllocationQids) !== canonicalJson(addedQids) ||
      canonicalJson(expectedNewRetiredQids) !== canonicalJson(removedQids)
    )
      throw new Error(
        'Independent-review replacement history has an unexpected delta.',
      )
  }
  if (history.some((event) => event.event === 'active'))
    throw new Error(
      'Independent-review replacement history cannot contain final active events during M45-07.',
    )
  const allocated = new Set(
    history
      .filter((event) => event.event === 'allocated')
      .map((event) => event.qid),
  )
  const retired = new Set(
    history
      .filter((event) => event.event === 'retired')
      .map((event) => event.qid),
  )
  if (allocationBearingCurrentRecords.some((record) => retired.has(record.qid)))
    throw new Error(
      'Independent-review replacement retained a retired new-candidate allocation.',
    )
  if (
    canonicalJson([...allocated].sort(compareDiscoveryQids)) !==
      canonicalJson([...recordByQid.keys()].sort(compareDiscoveryQids)) ||
    canonicalJson([...retired].sort(compareDiscoveryQids)) !==
      canonicalJson(
        [...cumulativeRemovedQids, ...removedQids]
          .filter((qid) => recordByQid.has(qid))
          .sort(compareDiscoveryQids),
      )
  )
    throw new Error(
      'Independent-review replacement history has an unexpected allocation delta.',
    )
}

function parseTriggeringDefects(
  input: unknown,
): readonly IndependentReviewTriggeringDefect[] {
  if (!Array.isArray(input) || input.length === 0)
    throw new Error(
      'Independent-review replacement triggering defects must be a non-empty array.',
    )
  const defects = input.map((entry) => {
    const value = strictObject(
      entry,
      [
        'planSha256',
        'inputSha256',
        'resultSha256',
        'recordCommitment',
        'qid',
        'category',
      ],
      'Independent-review replacement triggering defect',
    )
    for (const key of [
      'planSha256',
      'inputSha256',
      'resultSha256',
      'recordCommitment',
    ] as const)
      assertSha256(value[key], `Independent-review triggering defect ${key}`)
    assertQid(value.qid, 'Independent-review triggering defect QID')
    if (
      typeof value.category !== 'string' ||
      !independentReviewDefectCategories.includes(
        value.category as IndependentReviewDefectCategory,
      )
    )
      throw new Error(
        'Independent-review triggering defect category is unsupported.',
      )
    return {
      planSha256: value.planSha256 as string,
      inputSha256: value.inputSha256 as string,
      resultSha256: value.resultSha256 as string,
      recordCommitment: value.recordCommitment as string,
      qid: value.qid as string,
      category: value.category as IndependentReviewDefectCategory,
    }
  })
  const recordCommitments = defects.map(
    ({ recordCommitment }) => recordCommitment,
  )
  const qids = defects.map(({ qid }) => qid)
  if (
    new Set(recordCommitments).size !== recordCommitments.length ||
    new Set(qids).size !== qids.length
  )
    throw new Error(
      'Independent-review triggering defects must have unique record commitments and QIDs.',
    )
  if (
    canonicalJson([...recordCommitments].sort(compareAscii)) !==
    canonicalJson(recordCommitments)
  )
    throw new Error(
      'Independent-review triggering defects must be ASCII record-commitment ordered.',
    )
  return defects
}

function proofCore(
  input: Omit<IndependentReviewReplacementProof, 'replacementProofSha256'>,
) {
  return input
}

function parseReplacementProof(
  input: unknown,
  root: IndependentReviewInitialAuthoritySnapshot,
  previousSnapshots: readonly IndependentReviewAuthoritySnapshot[],
  prior: IndependentReviewAuthoritySnapshot,
  proposal: IndependentReviewProposal,
  population: IndependentReviewSuccessorPopulationAuthority,
  parseProposal: (
    value: unknown,
    authority: unknown,
    qid: string,
  ) => ParsedReplacementIdentityProposal,
): IndependentReviewReplacementProof {
  const value = strictObject(
    input,
    [
      'schema',
      'version',
      'reviewSeriesSha256',
      'round',
      'priorAuthoritySnapshotSha256',
      'priorProposalSha256',
      'priorPopulationSha256',
      'nextProposalSha256',
      'nextPopulationSha256',
      'replacementLineage',
      'replacementLineageSha256',
      'identityReplacementReviewResult',
      'allocationLedger',
      'allocationLedgerSha256',
      'allocationHistory',
      'allocationHistorySha256',
      'additions',
      'removals',
      'triggeringDefects',
      'replacementProofSha256',
    ],
    'Independent-review replacement proof',
  )
  if (
    value.schema !== independentReviewReplacementProofSchema ||
    value.version !== 1
  )
    throw new Error(
      'Independent-review replacement proof schema is unsupported.',
    )
  assertRound(value.round, 'Independent-review replacement round', 1)
  if (
    value.round !== population.round ||
    value.reviewSeriesSha256 !== population.reviewSeriesSha256 ||
    value.priorAuthoritySnapshotSha256 !== prior.authoritySnapshotSha256 ||
    value.priorProposalSha256 !== prior.proposal.proposalSha256 ||
    value.priorPopulationSha256 !== prior.population.populationSha256 ||
    value.nextProposalSha256 !== proposal.proposalSha256 ||
    value.nextPopulationSha256 !== population.populationSha256
  )
    throw new Error(
      'Independent-review replacement proof has detached authority commitments.',
    )
  for (const key of [
    'reviewSeriesSha256',
    'priorAuthoritySnapshotSha256',
    'priorProposalSha256',
    'priorPopulationSha256',
    'nextProposalSha256',
    'nextPopulationSha256',
    'replacementLineageSha256',
    'allocationLedgerSha256',
    'allocationHistorySha256',
    'replacementProofSha256',
  ] as const)
    assertSha256(value[key], `Independent-review replacement ${key}`)
  const lineage = parseReplacementLineageEntries(value.replacementLineage)
  const lineageAuthority = {
    originalSeed: root.seedAuthority.originalSeed,
    initialOrderedQids: root.proposal.orderedProposedPublishedQids,
  }
  const currentQids = validateReplacementLineage(lineage, lineageAuthority)
  if (
    lineage.length !== value.round ||
    canonicalJson(currentQids) !==
      canonicalJson(proposal.orderedProposedPublishedQids)
  )
    throw new Error(
      'Independent-review replacement lineage does not reach the successor proposal.',
    )
  if (
    replacementLineageSha256(lineage, lineageAuthority) !==
    value.replacementLineageSha256
  )
    throw new Error(
      'Independent-review replacement lineage hash does not match.',
    )
  const edge = lineage.at(-1)!
  const priorLineage =
    prior.kind === 'initial' ? [] : prior.replacementProof.replacementLineage
  if (
    lineage.length !== priorLineage.length + 1 ||
    canonicalJson(lineage.slice(0, -1)) !== canonicalJson(priorLineage) ||
    edge.previousOrderedQidSequenceSha256 !==
      prior.proposal.orderedProposedPublishedQidSequenceSha256
  )
    throw new Error(
      'Independent-review replacement lineage is not an exact extension of its immediate predecessor.',
    )
  const identityReview = parseIdentityReplacementReviewResult(
    value.identityReplacementReviewResult,
    {
      candidateReceiptSha256: root.proposal.candidateReceiptSha256,
      canonicalSelectionEvidenceSha256:
        root.proposal.canonicalSelectionEvidenceSha256,
      round: value.round as number,
      previousSelectedQidsSha256: edge.previousOrderedQidSequenceSha256,
      roundSeed: edge.roundSeed,
    },
  )
  if (
    canonicalJson(identityReview.removals.map(({ qid }) => qid)) !==
    canonicalJson(edge.removedQids)
  )
    throw new Error(
      'Independent-review replacement result does not match lineage removals.',
    )
  const ledger = parseIdentityAllocationLedger(value.allocationLedger)
  if (!Array.isArray(value.allocationHistory))
    throw new Error('Independent-review replacement history must be an array.')
  const history = value.allocationHistory.map(
    parseIdentityAllocationHistoryEvent,
  )
  validateIdentityAllocationHistory(history)
  if (history.some((event) => event.event === 'active'))
    throw new Error(
      'Independent-review replacement history cannot contain final active events during M45-07.',
    )
  validateLedgerHistoryCorrespondence(ledger, history)
  if (
    identityAllocationLedgerSha256(ledger) !== value.allocationLedgerSha256 ||
    independentReviewWorkingAllocationHistorySha256(history) !==
      value.allocationHistorySha256
  )
    throw new Error(
      'Independent-review replacement ledger/history hash does not match.',
    )
  const populationByQid = new Map(
    population.records.map((record) => [record.qid, record]),
  )
  const priorPopulationByQid = new Map(
    prior.population.records.map((record) => [record.qid, record]),
  )
  const ledgerByQid = new Map(ledger.map((entry) => [entry.qid, entry]))
  const expectedOutcomeByQid = new Map(
    identityReview.removals.map(({ qid, outcome }) => [qid, outcome]),
  )
  const retiredHistoryByQid = new Map(
    history
      .filter((event) => event.event === 'retired')
      .map((event) => [event.qid, event]),
  )
  const additions = parseReplacementAdditions(value.additions, parseProposal, {
    expectedQids: edge.addedQids,
    population,
    ledgerByQid,
    populationByQid,
  })
  const removals = parseReplacementRemovals(
    value.removals,
    edge.removedQids,
    proposal.orderedProposedPublishedQidSequenceSha256,
    priorPopulationByQid,
    expectedOutcomeByQid,
    retiredHistoryByQid,
  )
  const triggeringDefects = parseTriggeringDefects(value.triggeringDefects)
  validateOwnershipAndDeltas(
    root,
    previousSnapshots,
    prior,
    population,
    ledger,
    history,
    edge.removedQids,
    edge.addedQids,
  )
  const core = {
    schema: independentReviewReplacementProofSchema,
    version: 1 as const,
    reviewSeriesSha256: value.reviewSeriesSha256 as string,
    round: value.round as number,
    priorAuthoritySnapshotSha256: value.priorAuthoritySnapshotSha256 as string,
    priorProposalSha256: value.priorProposalSha256 as string,
    priorPopulationSha256: value.priorPopulationSha256 as string,
    nextProposalSha256: value.nextProposalSha256 as string,
    nextPopulationSha256: value.nextPopulationSha256 as string,
    replacementLineage: lineage,
    replacementLineageSha256: value.replacementLineageSha256 as string,
    identityReplacementReviewResult: identityReview,
    allocationLedger: ledger,
    allocationLedgerSha256: value.allocationLedgerSha256 as string,
    allocationHistory: history,
    allocationHistorySha256: value.allocationHistorySha256 as string,
    additions,
    removals,
    triggeringDefects,
  }
  if (value.replacementProofSha256 !== discoverySha256(proofCore(core)))
    throw new Error('Independent-review replacement proof hash does not match.')
  return {
    ...core,
    replacementProofSha256: value.replacementProofSha256 as string,
  }
}

function successorSnapshotCore(
  value: Omit<
    IndependentReviewSuccessorAuthoritySnapshot,
    'authoritySnapshotSha256'
  >,
) {
  return value
}

function parseSuccessorSnapshot(
  input: unknown,
  root: IndependentReviewInitialAuthoritySnapshot,
  previousSnapshots: readonly IndependentReviewAuthoritySnapshot[],
  prior: IndependentReviewAuthoritySnapshot,
  parseProposal: (
    value: unknown,
    authority: unknown,
    qid: string,
  ) => ParsedReplacementIdentityProposal,
): IndependentReviewSuccessorAuthoritySnapshot {
  const value = strictObject(
    input,
    [
      'schema',
      'version',
      'kind',
      'round',
      'rootSeedAuthoritySha256',
      'reviewSeriesSha256',
      'priorAuthoritySnapshotSha256',
      'proposal',
      'population',
      'replacementProof',
      'authoritySnapshotSha256',
    ],
    'Independent-review successor authority snapshot',
  )
  if (
    value.schema !== independentReviewAuthoritySnapshotSchema ||
    value.version !== 1 ||
    value.kind !== 'successor'
  )
    throw new Error(
      'Independent-review successor snapshot schema is unsupported.',
    )
  assertRound(value.round, 'Independent-review successor snapshot round', 1)
  if (
    value.round !== prior.round + 1 ||
    value.rootSeedAuthoritySha256 !== root.seedAuthority.seedAuthoritySha256 ||
    value.reviewSeriesSha256 !== root.reviewSeriesSha256 ||
    value.priorAuthoritySnapshotSha256 !== prior.authoritySnapshotSha256
  )
    throw new Error(
      'Independent-review successor snapshot is not an immediate root-series successor.',
    )
  const proposal = parseIndependentReviewProposal(value.proposal)
  for (const key of [
    'candidateAuthoritySha256',
    'candidateReceiptSha256',
    'predecessorResultSha256',
    'predecessorCorpusSha256',
    'canonicalSelectionEvidenceSha256',
  ] as const) {
    if (proposal[key] !== root.proposal[key])
      throw new Error(
        'Independent-review successor proposal changed immutable root provenance.',
      )
  }
  const population = parseSuccessorPopulation(
    value.population,
    proposal,
    root,
    {
      round: value.round as number,
      priorAuthoritySnapshotSha256: prior.authoritySnapshotSha256,
    },
  )
  const replacementProof = parseReplacementProof(
    value.replacementProof,
    root,
    previousSnapshots,
    prior,
    proposal,
    population,
    parseProposal,
  )
  const core = {
    schema: independentReviewAuthoritySnapshotSchema,
    version: 1 as const,
    kind: 'successor' as const,
    round: value.round as number,
    rootSeedAuthoritySha256: value.rootSeedAuthoritySha256 as string,
    reviewSeriesSha256: value.reviewSeriesSha256 as string,
    priorAuthoritySnapshotSha256: value.priorAuthoritySnapshotSha256 as string,
    proposal,
    population,
    replacementProof,
  }
  if (
    value.authoritySnapshotSha256 !==
    discoverySha256(successorSnapshotCore(core))
  )
    throw new Error(
      'Independent-review successor snapshot hash does not match.',
    )
  return {
    ...core,
    authoritySnapshotSha256: value.authoritySnapshotSha256 as string,
  }
}

function parseSuccessorChain(
  rootInput: unknown,
  priorSnapshotsInput: readonly unknown[],
  successorInput: unknown,
  parseProposal: (
    value: unknown,
    authority: unknown,
    qid: string,
  ) => ParsedReplacementIdentityProposal,
): IndependentReviewSuccessorAuthoritySnapshot {
  const root = parseIndependentReviewInitialAuthoritySnapshot(rootInput)
  const parsedSnapshots: IndependentReviewAuthoritySnapshot[] = [root]
  let prior: IndependentReviewAuthoritySnapshot = root
  for (const [index, snapshot] of priorSnapshotsInput.entries()) {
    prior = parseSuccessorSnapshot(
      snapshot,
      root,
      parsedSnapshots,
      prior,
      parseProposal,
    )
    if (prior.round !== index + 1)
      throw new Error('Independent-review prior snapshots must be contiguous.')
    parsedSnapshots.push(prior)
  }
  return parseSuccessorSnapshot(
    successorInput,
    root,
    parsedSnapshots,
    prior,
    parseProposal,
  )
}

/** Live parser: every addition is reparsed through the complete private authority package. */
export function parseIndependentReviewSuccessorAuthoritySnapshot(
  input: unknown,
  context: Readonly<{
    rootSnapshot: unknown
    priorSuccessorSnapshots: readonly unknown[]
  }>,
): IndependentReviewSuccessorAuthoritySnapshot {
  return parseSuccessorChain(
    context.rootSnapshot,
    context.priorSuccessorSnapshots,
    input,
    (proposal, authority, qid) => {
      const parsedAuthority = authority as IdentityProposalAuthority
      const parsedProposal = parseFrozenIdentityProposalArtifact(
        proposal,
        parsedAuthority,
      )
      return {
        proposal: parsedProposal,
        expectedProjectionSha256: acceptedCandidateProjectionSha256(
          parseAcceptedCandidateReceipt(parsedAuthority.candidateReceipt),
          parsedProposal.candidateReceiptSha256,
          parsedAuthority.candidateAcquisitionReviewAuthority,
          parsedAuthority.predecessorReviewResult,
          qid,
        ),
      }
    },
  )
}

/** Test-only fixture parser; it never enters live custody or UUID allocation. */
export function parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
  input: unknown,
  context: Readonly<{
    rootSnapshot: unknown
    priorSuccessorSnapshots: readonly unknown[]
  }>,
): IndependentReviewSuccessorAuthoritySnapshot {
  if (process.env.NODE_ENV !== 'test')
    throw new Error(
      'Fixture successor authority parsing is unavailable to live tooling.',
    )
  return parseSuccessorChain(
    context.rootSnapshot,
    context.priorSuccessorSnapshots,
    input,
    (proposal, authority) => ({
      proposal: parseFrozenIdentityProposalForFixture(
        proposal,
        authority as IdentityProposalFixtureAuthority,
      ),
    }),
  )
}

/**
 * Structural transition validation for the later result/history module.
 * It deliberately does not inspect a review result, so semantic trigger
 * resolution remains in that module and the import graph stays acyclic.
 */
export function validateIndependentReviewSuccessorTransition(
  context: Readonly<{
    rootSnapshot: unknown
    priorSuccessorSnapshots: readonly unknown[]
  }>,
  successorInput: unknown,
): IndependentReviewSuccessorAuthoritySnapshot {
  return parseIndependentReviewSuccessorAuthoritySnapshot(
    successorInput,
    context,
  )
}

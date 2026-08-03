import { createHash } from 'node:crypto'
import {
  canonicalJson,
  compareDiscoveryQids,
  discoverySha256,
} from '@/features/anime/catalogue/wikidata-anime-discovery'

const sha256Pattern = /^[a-f0-9]{64}$/
export const replacementLineageVersion = 'replacement-lineage.v1' as const

export type ReplacementLineageEntry = Readonly<{
  version: typeof replacementLineageVersion
  round: number
  removedQids: readonly string[]
  addedQids: readonly string[]
  previousOrderedQidSequenceSha256: string
  currentOrderedQids: readonly string[]
  currentOrderedQidSequenceSha256: string
  roundSeed: string
}>

export type ReplacementLineageAuthority = Readonly<{
  originalSeed: string
  initialOrderedQids: readonly string[]
}>

export type IdentityReplacementReviewResult = Readonly<{
  schema: 'zedarchive.anime-v2-identity-replacement-review-result'
  version: 1
  candidateReceiptSha256: string
  canonicalSelectionEvidenceSha256: string
  round: number
  previousSelectedQidsSha256: string
  roundSeed: string
  removals: readonly Readonly<{
    qid: string
    outcome:
      'independent-review-rejected' | 'selection-recomputed-after-correction'
  }>[]
  reviewInputSha256: string
  resultSha256: string
}>

function strictObject(
  input: unknown,
  keys: readonly string[],
  description: string,
): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input))
    throw new Error(`${description} must be an object.`)
  const record = input as Record<string, unknown>
  if (
    canonicalJson(Object.keys(record).sort()) !==
    canonicalJson([...keys].sort())
  )
    throw new Error(`${description} contains missing or unknown fields.`)
  return record
}

export function parseIdentityReplacementReviewResult(
  input: unknown,
  authority: Readonly<{
    candidateReceiptSha256: string
    canonicalSelectionEvidenceSha256: string
    round: number
    previousSelectedQidsSha256: string
    roundSeed: string
  }>,
): IdentityReplacementReviewResult {
  const record = strictObject(
    input,
    [
      'schema',
      'version',
      'candidateReceiptSha256',
      'canonicalSelectionEvidenceSha256',
      'round',
      'previousSelectedQidsSha256',
      'roundSeed',
      'removals',
      'reviewInputSha256',
      'resultSha256',
    ],
    'Identity replacement review result',
  )
  if (
    record.schema !==
      'zedarchive.anime-v2-identity-replacement-review-result' ||
    record.version !== 1 ||
    record.candidateReceiptSha256 !== authority.candidateReceiptSha256 ||
    record.canonicalSelectionEvidenceSha256 !==
      authority.canonicalSelectionEvidenceSha256 ||
    record.round !== authority.round ||
    record.previousSelectedQidsSha256 !==
      authority.previousSelectedQidsSha256 ||
    record.roundSeed !== authority.roundSeed
  )
    throw new Error('Identity replacement review result changed its authority.')
  for (const field of [
    'candidateReceiptSha256',
    'canonicalSelectionEvidenceSha256',
    'previousSelectedQidsSha256',
    'roundSeed',
    'reviewInputSha256',
    'resultSha256',
  ] as const) {
    if (typeof record[field] !== 'string' || !sha256Pattern.test(record[field]))
      throw new Error(`Identity replacement ${field} must be SHA-256.`)
  }
  if (!Array.isArray(record.removals) || record.removals.length === 0)
    throw new Error('Identity replacement review needs at least one removal.')
  const removals: IdentityReplacementReviewResult['removals'] =
    record.removals.map((input) => {
      const removal = strictObject(
        input,
        ['qid', 'outcome'],
        'Identity replacement removal',
      )
      const [qid] = canonicalReplacementQids(
        [removal.qid],
        'Identity replacement removal',
      )
      if (
        removal.outcome !== 'independent-review-rejected' &&
        removal.outcome !== 'selection-recomputed-after-correction'
      )
        throw new Error('Identity replacement removal outcome is not closed.')
      return { qid: qid!, outcome: removal.outcome }
    })
  const qids = removals.map(({ qid }) => qid)
  if (
    canonicalJson([...qids].sort(compareDiscoveryQids)) !==
      canonicalJson(qids) ||
    new Set(qids).size !== qids.length
  )
    throw new Error('Identity replacement removals must be unique and ordered.')
  const reviewInput = {
    version: 'identity-replacement-review-input.v1',
    candidateReceiptSha256: record.candidateReceiptSha256,
    canonicalSelectionEvidenceSha256: record.canonicalSelectionEvidenceSha256,
    round: record.round,
    previousSelectedQidsSha256: record.previousSelectedQidsSha256,
    roundSeed: record.roundSeed,
    reviewedQids: qids,
  }
  if (record.reviewInputSha256 !== discoverySha256(reviewInput))
    throw new Error('Identity replacement review input hash does not match.')
  const core = {
    ...reviewInput,
    schema: record.schema,
    version: record.version,
    removals,
  }
  if (record.resultSha256 !== discoverySha256(core))
    throw new Error('Identity replacement review result hash does not match.')
  return {
    schema: record.schema,
    version: record.version,
    candidateReceiptSha256: record.candidateReceiptSha256,
    canonicalSelectionEvidenceSha256: record.canonicalSelectionEvidenceSha256,
    round: record.round,
    previousSelectedQidsSha256: record.previousSelectedQidsSha256,
    roundSeed: record.roundSeed,
    removals,
    reviewInputSha256: record.reviewInputSha256,
    resultSha256: record.resultSha256,
  }
}

export const independentSampleSeedVersion = 'm45-independent-sample.v1' as const

export function deriveIndependentSampleSeed(
  input: Readonly<{
    canonicalCandidateReceiptSha256: string
    predecessorCorpusSha256: string
    orderedProposedPublishedQidSequenceSha256: string
  }>,
): string {
  for (const [field, value] of Object.entries(input)) {
    if (typeof value !== 'string' || !sha256Pattern.test(value))
      throw new Error(`${field} must be a lowercase SHA-256 digest.`)
  }
  return createHash('sha256')
    .update(
      `${independentSampleSeedVersion}:${input.canonicalCandidateReceiptSha256}:${input.predecessorCorpusSha256}:${input.orderedProposedPublishedQidSequenceSha256}`,
    )
    .digest('hex')
}

export function deriveIndependentSampleRoundSeed(
  originalSeed: string,
  roundNumber: number,
): string {
  if (typeof originalSeed !== 'string' || !sha256Pattern.test(originalSeed))
    throw new Error('Original sample seed must be SHA-256.')
  if (!Number.isSafeInteger(roundNumber) || roundNumber < 1)
    throw new Error('Sample round numbers start at one.')
  return createHash('sha256')
    .update(`${originalSeed}:round-${roundNumber}`)
    .digest('hex')
}

function canonicalReplacementQids(
  input: unknown,
  description: string,
  requireOrdered = true,
): readonly string[] {
  if (!Array.isArray(input))
    throw new Error(`${description} QIDs must be an array.`)
  input.forEach((qid) => {
    if (typeof qid !== 'string' || !/^Q[1-9][0-9]*$/.test(qid))
      throw new Error(`${description} must contain canonical QIDs.`)
  })
  if (new Set(input).size !== input.length)
    throw new Error(`${description} QIDs must be unique.`)
  const ordered = [...input].sort(compareDiscoveryQids)
  if (requireOrdered && canonicalJson(ordered) !== canonicalJson(input))
    throw new Error(`${description} QIDs must be in ascending numeric order.`)
  return ordered
}

export function validateReplacementLineage(
  lineage: readonly ReplacementLineageEntry[],
  authority: ReplacementLineageAuthority,
): readonly string[] {
  if (!sha256Pattern.test(authority.originalSeed))
    throw new Error('Original replacement-lineage seed must be SHA-256.')
  let currentQids = [
    ...canonicalReplacementQids(
      authority.initialOrderedQids,
      'Initial replacement-lineage',
    ),
  ]
  const removedEver = new Set<string>()
  const addedEver = new Set<string>()
  lineage.forEach((entry, index) => {
    const round = index + 1
    if (entry.version !== replacementLineageVersion || entry.round !== round)
      throw new Error(
        'Replacement lineage rounds must be contiguous and append-only.',
      )
    if (
      entry.roundSeed !==
      deriveIndependentSampleRoundSeed(authority.originalSeed, round)
    )
      throw new Error(
        'Replacement lineage round seed does not match the original seed.',
      )
    if (entry.previousOrderedQidSequenceSha256 !== discoverySha256(currentQids))
      throw new Error(
        'Replacement lineage previous sequence hash does not match.',
      )
    const removedQids = canonicalReplacementQids(
      entry.removedQids,
      'Removed replacement-lineage',
    )
    const addedQids = canonicalReplacementQids(
      entry.addedQids,
      'Added replacement-lineage',
    )
    if (removedQids.some((qid) => addedQids.includes(qid)))
      throw new Error('A replacement round cannot remove and add the same QID.')
    if (removedQids.length !== addedQids.length)
      throw new Error(
        'Every replacement round must preserve the exact published-selection cardinality.',
      )
    const current = new Set(currentQids)
    for (const qid of removedQids) {
      if (!current.has(qid) || removedEver.has(qid))
        throw new Error(
          'Replacement lineage cannot remove an absent or re-removed QID.',
        )
      current.delete(qid)
      removedEver.add(qid)
    }
    for (const qid of addedQids) {
      if (current.has(qid) || addedEver.has(qid) || removedEver.has(qid))
        throw new Error(
          'Replacement lineage cannot add a present or re-added QID.',
        )
      current.add(qid)
      addedEver.add(qid)
    }
    currentQids = [...current].sort(compareDiscoveryQids)
    canonicalReplacementQids(
      entry.currentOrderedQids,
      'Current replacement-lineage',
    )
    if (canonicalJson(entry.currentOrderedQids) !== canonicalJson(currentQids))
      throw new Error(
        'Replacement lineage current QID sequence does not match its delta.',
      )
    if (entry.currentOrderedQidSequenceSha256 !== discoverySha256(currentQids))
      throw new Error(
        'Replacement lineage current sequence hash does not match.',
      )
  })
  return currentQids
}

export function appendReplacementLineage(
  lineage: readonly ReplacementLineageEntry[],
  input: Readonly<{
    removedQids: readonly string[]
    addedQids: readonly string[]
  }>,
  authority: ReplacementLineageAuthority,
): readonly ReplacementLineageEntry[] {
  const previousQids = validateReplacementLineage(lineage, authority)
  const round = lineage.length + 1
  const removedQids = [
    ...canonicalReplacementQids(
      input.removedQids,
      'Removed replacement-lineage',
      false,
    ),
  ].sort(compareDiscoveryQids)
  const addedQids = [
    ...canonicalReplacementQids(
      input.addedQids,
      'Added replacement-lineage',
      false,
    ),
  ].sort(compareDiscoveryQids)
  const current = new Set(previousQids)
  removedQids.forEach((qid) => current.delete(qid))
  addedQids.forEach((qid) => current.add(qid))
  const currentOrderedQids = [...current].sort(compareDiscoveryQids)
  const entry: ReplacementLineageEntry = {
    version: replacementLineageVersion,
    round,
    removedQids,
    addedQids,
    previousOrderedQidSequenceSha256: discoverySha256(previousQids),
    currentOrderedQids,
    currentOrderedQidSequenceSha256: discoverySha256(currentOrderedQids),
    roundSeed: deriveIndependentSampleRoundSeed(authority.originalSeed, round),
  }
  const next = [...lineage, entry]
  validateReplacementLineage(next, authority)
  return next
}

export function replacementLineageSha256(
  lineage: readonly ReplacementLineageEntry[],
  authority: ReplacementLineageAuthority,
): string {
  validateReplacementLineage(lineage, authority)
  return discoverySha256({
    version: replacementLineageVersion,
    originalSeed: authority.originalSeed,
    initialOrderedQids: authority.initialOrderedQids,
    lineage,
  })
}

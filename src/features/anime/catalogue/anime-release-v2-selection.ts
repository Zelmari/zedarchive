import {
  independentApprovedContinuityQids,
  finalizedContinuitySchema,
  parseAcceptedCandidateReceipt,
  parseContinuityPreparation,
  parseFinalizedContinuity,
  parsePrimaryCandidateReviewResult,
  primaryApprovedContinuityQids,
  type FinalizedContinuity,
} from '@/features/anime/catalogue/anime-release-v2-continuity'
import {
  acceptedDiscoveryCandidateReceiptSha256,
  validatePredecessorReviewResult,
} from '@/features/anime/catalogue/anime-successor-predecessor-review'
import type {
  AnimeReleaseCorpus,
  AnimeReleaseIndex,
  AnimeReleaseReviewLedger,
} from '@/features/anime/catalogue/anime-release-corpus'
import { sha256Canonical } from '@/features/anime/catalogue/anime-release-corpus'
import {
  deriveIndependentSampleRoundSeed as deriveReplacementRoundSeed,
  deriveIndependentSampleSeed as deriveReplacementSeed,
  parseIdentityReplacementReviewResult,
  validateReplacementLineage as validateReplacementLineageAuthority,
  type IdentityReplacementReviewResult,
  type ReplacementLineageEntry as AuthorityReplacementLineageEntry,
} from '@/features/anime/catalogue/anime-release-v2-lineage'
import {
  canonicalJson,
  compareAudienceCandidates,
  compareDiscoveryQids,
  discoveryCoverageFloors,
  discoverySha256,
  type DiscoveryFormat,
  type PageviewBand,
  type SitelinkBand,
} from '@/features/anime/catalogue/wikidata-anime-discovery'

export const selectionRubricV2Specification = {
  canonicalization: 'recursive-lexicographic-object-keys',
  constraints: {
    eraFloors: {
      '1980-1989': 275,
      '1990-1999': 450,
      '2000-2009': 800,
      '2010-2019': 1200,
      '2020-2026': 1200,
      'before-1980': 100,
    },
    formatFloors: { movie: 850, ona: 100, ova: 250, special: 35, tv: 2500 },
    publishedCount: 5000,
    unknownYearMaximum: 250,
  },
  coverageWitness: {
    candidatePool: 'machine-and-primary-approved-frozen-eligible',
    constraints: 'residual-format-and-era-floors-plus-unknown-year-maximum',
    extensionConstraint:
      'must-extend-to-exact-final-solution-under-reason-admission',
    objective: [
      'minimum-cardinality',
      'minimum-summed-main-candidate-cost',
      'lexicographically-smallest-ascending-numeric-qid-sequence',
    ],
    tieAlgorithm:
      'scan-ascending-numeric-qid; include iff witness cardinality and cost optimum remain feasible',
  },
  mandatory: [
    'publishable-predecessor',
    'top-250-audience-anchor',
    'canonical-floor-witness',
  ],
  objective: {
    arithmetic: 'bigint',
    candidateCostFormula:
      '(is-reviewed-continuity ? 0 : tierWeight)+audienceOrdinal',
    finalTieAlgorithm:
      'scan-ascending-numeric-qid; include iff the primary-optimal constrained solution remains feasible',
    finalTieBreak: 'lexicographically-smallest-ascending-numeric-qid-sequence',
    maxAudienceOrdinalSymbol: 'N-1',
    optionalCountSymbol: 'K',
    optionalPoolCountSymbol: 'N',
    tierWeightFormula: 'K*(N-1)+1',
  },
  ordering: {
    audience: [
      'better-language-band-desc',
      'other-language-band-desc',
      'sitelink-band-desc',
      'numeric-qid-asc',
    ],
    continuityFirst: true,
  },
  reasonEligibility: {
    fixedBeforeRemainingFill: ['predecessor', 'coverage-cell'],
    optionalAdmission: [
      'audience-en',
      'audience-ja',
      'multilingual-coverage',
      'franchise-continuity',
    ],
    rule: 'no candidate without a preassigned permitted reason enters remaining-capacity flow',
  },
  solver: 'dependency-free-integral-min-cost-flow',
  variables: 'one-binary-per-optional-candidate',
  version: 'selection-rubric.v2',
} as const

export const selectionRubricV2Sha256 =
  'dc606cb0c7571e47c3ab6b632dcc3961fa92c4c5eb5a114909071d56a148c3da' as const

if (
  discoverySha256(selectionRubricV2Specification) !== selectionRubricV2Sha256
) {
  throw new Error(
    'The canonical selection-rubric.v2 specification has drifted.',
  )
}

export const successorDiscoveryReasonOrder = [
  'predecessor',
  'audience-en',
  'audience-ja',
  'multilingual-coverage',
  'coverage-cell',
  'franchise-continuity',
] as const
export type SuccessorDiscoveryReason =
  (typeof successorDiscoveryReasonOrder)[number]

export type SelectionEra =
  keyof typeof discoveryCoverageFloors.eras | 'unknown' | 'after-2026'

export type SelectionCandidate = Readonly<{
  qid: string
  format: DiscoveryFormat
  era: SelectionEra
  englishBand: PageviewBand
  japaneseBand: PageviewBand
  sitelinkBand: SitelinkBand
  source: 'frozen-primary-approved' | 'publishable-predecessor-only'
  publishablePredecessor: boolean
}>

export type SelectionConstraints = Readonly<{
  publishedCount: number
  unknownYearMaximum: number
  formatFloors: Readonly<Record<DiscoveryFormat, number>>
  eraFloors: Readonly<Record<keyof typeof discoveryCoverageFloors.eras, number>>
}>

export const releaseV2SelectionConstraints: SelectionConstraints = {
  publishedCount: 5000,
  unknownYearMaximum: 250,
  formatFloors: discoveryCoverageFloors.formats,
  eraFloors: discoveryCoverageFloors.eras,
}

export type PublishedSuccessorRecord = Readonly<{
  qid: string
  catalogueItemId: string
  state: 'published'
}>

export type RetainedPredecessorRecord = Readonly<{
  qid: string
  catalogueItemId: string
  predecessorSha256: string
  currentSha256: string
  state: 'draft' | 'hidden'
  correctionDisposition:
    | 'unchanged-non-published'
    | 'catalogue_state_title_usability_hide'
    | 'catalogue_state_adult_publication_hide'
    | 'catalogue_state_identity_scope_hide'
}>

export type SuccessorRepresentation = Readonly<{
  publishedSelection: readonly PublishedSuccessorRecord[]
  retainedPredecessors: readonly RetainedPredecessorRecord[]
  completeCorpus: readonly (
    PublishedSuccessorRecord | RetainedPredecessorRecord
  )[]
}>

function assertUniqueOwnership(
  records: readonly Readonly<{ qid: string; catalogueItemId: string }>[],
): void {
  if (new Set(records.map(({ qid }) => qid)).size !== records.length) {
    throw new Error('Successor QIDs must be unique across the complete corpus.')
  }
  if (
    new Set(records.map(({ catalogueItemId }) => catalogueItemId)).size !==
    records.length
  ) {
    throw new Error(
      'Successor UUIDs must be unique across the complete corpus.',
    )
  }
}

function assertSuccessorQid(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^Q[1-9][0-9]*$/.test(value)) {
    throw new Error('Successor representation QIDs must be canonical strings.')
  }
}

function assertSuccessorUuid(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !successorUuidPattern.test(value)) {
    throw new Error(
      'Successor representation IDs must be lowercase UUID v4 strings.',
    )
  }
}

export function validateSuccessorRepresentation(
  representation: SuccessorRepresentation,
): void {
  validateSuccessorRepresentationForFixture(
    representation,
    releaseV2SelectionConstraints.publishedCount,
  )
  if (
    representation.retainedPredecessors.length !== 63 ||
    representation.completeCorpus.length !== 5_063
  ) {
    throw new Error(
      'The authenticated successor representation requires exactly 63 retained and 5,063 complete records.',
    )
  }
}

/** Pure representation seam for bounded fixtures; release validation is fixed at 5,000. */
export function validateSuccessorRepresentationForFixture(
  representation: SuccessorRepresentation,
  expectedPublishedCount: number,
): void {
  if (!Array.isArray(representation.publishedSelection)) {
    throw new Error('Published successor selection must be an array.')
  }
  if (!Array.isArray(representation.retainedPredecessors)) {
    throw new Error('Retained predecessors must be an array.')
  }
  if (representation.publishedSelection.length !== expectedPublishedCount) {
    throw new Error('The successor published selection has the wrong count.')
  }
  for (const record of representation.publishedSelection) {
    assertSuccessorQid(record.qid)
    assertSuccessorUuid(record.catalogueItemId)
    if (record.state !== 'published') {
      throw new Error('Published successor records must remain published.')
    }
  }
  for (const record of representation.retainedPredecessors) {
    assertSuccessorQid(record.qid)
    assertSuccessorUuid(record.catalogueItemId)
    if (
      typeof record.predecessorSha256 !== 'string' ||
      !successorSha256Pattern.test(record.predecessorSha256) ||
      typeof record.currentSha256 !== 'string' ||
      !successorSha256Pattern.test(record.currentSha256)
    ) {
      throw new Error(
        'Retained predecessor hashes must be primitive SHA-256 strings.',
      )
    }
    if (record.state !== 'draft' && record.state !== 'hidden') {
      throw new Error('Retained predecessors must be non-published.')
    }
    if (record.correctionDisposition !== 'unchanged-non-published') {
      if (record.state !== 'hidden') {
        throw new Error(
          'Every catalogue-state hide correction must finish hidden.',
        )
      }
      if (record.predecessorSha256 === record.currentSha256) {
        throw new Error(
          'Every catalogue-state hide correction must change the normalized predecessor record.',
        )
      }
      if (
        record.correctionDisposition !==
          'catalogue_state_title_usability_hide' &&
        record.correctionDisposition !==
          'catalogue_state_adult_publication_hide' &&
        record.correctionDisposition !== 'catalogue_state_identity_scope_hide'
      ) {
        throw new Error(
          'Retained predecessor correction disposition is not closed.',
        )
      }
    }
  }
  const completeCorpus = [
    ...representation.publishedSelection,
    ...representation.retainedPredecessors,
  ]
  assertUniqueOwnership(completeCorpus)
  if (
    canonicalJson(completeCorpus) !==
    canonicalJson(representation.completeCorpus)
  ) {
    throw new Error(
      'Successor complete corpus must be the exact published/retained union.',
    )
  }
}

export function createSuccessorRepresentation(
  publishedSelection: readonly PublishedSuccessorRecord[],
  retainedPredecessors: readonly RetainedPredecessorRecord[],
): SuccessorRepresentation {
  const representation = createSuccessorRepresentationForFixture(
    publishedSelection,
    retainedPredecessors,
    releaseV2SelectionConstraints.publishedCount,
  )
  validateSuccessorRepresentation(representation)
  return representation
}

/** Pure representation seam for bounded fixtures; release construction is fixed at 5,000. */
export function createSuccessorRepresentationForFixture(
  publishedSelection: readonly PublishedSuccessorRecord[],
  retainedPredecessors: readonly RetainedPredecessorRecord[],
  expectedPublishedCount: number,
): SuccessorRepresentation {
  const completeCorpus = [...publishedSelection, ...retainedPredecessors]
  const representation = {
    publishedSelection,
    retainedPredecessors,
    completeCorpus,
  }
  validateSuccessorRepresentationForFixture(
    representation,
    expectedPublishedCount,
  )
  return representation
}

type PredecessorRepresentationAuthorityRecord = Readonly<{
  sourceItemId: string
  catalogueItemId: string
  predecessorNormalizedItemSha256: string
  normalizedItemSha256: string
  currentItem: Readonly<{ catalogueState: 'published' | 'draft' | 'hidden' }>
  corrections: readonly Readonly<{ category: string }>[]
}>

function retainedCorrectionDisposition(
  record: PredecessorRepresentationAuthorityRecord,
): RetainedPredecessorRecord['correctionDisposition'] {
  const dispositions = record.corrections
    .map(({ category }) => category)
    .filter(
      (
        category,
      ): category is Exclude<
        RetainedPredecessorRecord['correctionDisposition'],
        'unchanged-non-published'
      > =>
        category === 'catalogue_state_title_usability_hide' ||
        category === 'catalogue_state_adult_publication_hide' ||
        category === 'catalogue_state_identity_scope_hide',
    )
  if (dispositions.length > 1) {
    throw new Error(
      'A retained predecessor has ambiguous catalogue-state correction authority.',
    )
  }
  return dispositions[0] ?? 'unchanged-non-published'
}

/**
 * Pure comparison after the caller has authenticated the exact predecessor
 * result. Live release authority performs that authentication before calling.
 */
export function validateSuccessorRepresentationAgainstValidatedPredecessor(
  representation: SuccessorRepresentation,
  predecessorRecords: readonly PredecessorRepresentationAuthorityRecord[],
): void {
  const expected = predecessorRecords
    .filter(({ currentItem }) => currentItem.catalogueState !== 'published')
    .map((record): RetainedPredecessorRecord => ({
      qid: record.sourceItemId,
      catalogueItemId: record.catalogueItemId,
      predecessorSha256: record.predecessorNormalizedItemSha256,
      currentSha256: record.normalizedItemSha256,
      state: record.currentItem.catalogueState as 'draft' | 'hidden',
      correctionDisposition: retainedCorrectionDisposition(record),
    }))
  if (expected.length !== 63) {
    throw new Error(
      'Authenticated successor authority requires exactly 63 non-published predecessors.',
    )
  }
  if (
    canonicalJson(representation.retainedPredecessors) !==
    canonicalJson(expected)
  ) {
    throw new Error(
      'Retained successor records do not exactly match authenticated predecessor authority.',
    )
  }
  if (
    representation.completeCorpus.length !==
      representation.publishedSelection.length + 63 ||
    canonicalJson(representation.completeCorpus) !==
      canonicalJson([
        ...representation.publishedSelection,
        ...representation.retainedPredecessors,
      ])
  ) {
    throw new Error(
      'Complete successor corpus is not the exact published and retained union.',
    )
  }
}

export type EligibleSelectedDiscoveryRecord = Readonly<{
  kind: 'eligible-selected'
  qid: string
  reasonCodes: readonly SuccessorDiscoveryReason[]
  englishBand: PageviewBand
  japaneseBand: PageviewBand
  sitelinkBand: SitelinkBand
  englishMappingInputSha256: string
  japaneseMappingInputSha256: string
}>

export type PredecessorOnlySelectedDiscoveryRecord = Readonly<{
  kind: 'predecessor-only-selected'
  catalogueItemId: string
  qid: 'Q583684'
  predecessorSha256: string
  state: 'published'
  reasonCodes: readonly ['predecessor']
}>

export type RetainedPredecessorDiscoveryRecord = RetainedPredecessorRecord &
  Readonly<{ kind: 'retained-predecessor' }>

export type SuccessorDiscoveryRecord =
  | EligibleSelectedDiscoveryRecord
  | PredecessorOnlySelectedDiscoveryRecord
  | RetainedPredecessorDiscoveryRecord

const successorSha256Pattern = /^[a-f0-9]{64}$/
const successorUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const pageviewBands: readonly PageviewBand[] = [
  'top-1-percent',
  'top-5-percent',
  'top-20-percent',
  'remainder',
  'unavailable',
]
const sitelinkBands: readonly SitelinkBand[] = [
  '50-plus',
  '20-to-49',
  '5-to-19',
  '0-to-4',
]

function strictRecord(
  input: unknown,
  keys: readonly string[],
  description: string,
): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(`${description} must be an object.`)
  }
  const record = input as Record<string, unknown>
  const actual = Object.keys(record).sort()
  const expected = [...keys].sort()
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`${description} contains missing or unknown fields.`)
  }
  return record
}

function parseCommonDiscoveryIdentity(record: Record<string, unknown>): void {
  if (typeof record.qid !== 'string' || !/^Q[1-9][0-9]*$/.test(record.qid)) {
    throw new Error('Successor discovery QID is invalid.')
  }
}

export function parseSuccessorDiscoveryRecord(
  input: unknown,
): SuccessorDiscoveryRecord {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Successor discovery record must be an object.')
  }
  const kind = (input as Record<string, unknown>).kind
  if (kind === 'eligible-selected') {
    const record = strictRecord(
      input,
      [
        'kind',
        'qid',
        'reasonCodes',
        'englishBand',
        'japaneseBand',
        'sitelinkBand',
        'englishMappingInputSha256',
        'japaneseMappingInputSha256',
      ],
      'Eligible-selected discovery record',
    )
    parseCommonDiscoveryIdentity(record)
    if (!pageviewBands.includes(record.englishBand as PageviewBand))
      throw new Error('English audience band is invalid.')
    if (!pageviewBands.includes(record.japaneseBand as PageviewBand))
      throw new Error('Japanese audience band is invalid.')
    if (!sitelinkBands.includes(record.sitelinkBand as SitelinkBand))
      throw new Error('Sitelink band is invalid.')
    if (
      typeof record.englishMappingInputSha256 !== 'string' ||
      !successorSha256Pattern.test(record.englishMappingInputSha256) ||
      typeof record.japaneseMappingInputSha256 !== 'string' ||
      !successorSha256Pattern.test(record.japaneseMappingInputSha256)
    ) {
      throw new Error('Eligible-selected mapping hashes are invalid.')
    }
    if (!Array.isArray(record.reasonCodes) || record.reasonCodes.length === 0)
      throw new Error('Eligible-selected records need reason codes.')
    const reasons = record.reasonCodes as SuccessorDiscoveryReason[]
    if (
      reasons.some(
        (reason) => !successorDiscoveryReasonOrder.includes(reason),
      ) ||
      canonicalJson(reasons) !==
        canonicalJson(
          successorDiscoveryReasonOrder.filter((reason) =>
            reasons.includes(reason),
          ),
        )
    ) {
      throw new Error(
        'Eligible-selected reason codes are not closed and canonically ordered.',
      )
    }
    if (
      reasons.includes('audience-en') !==
      (record.englishBand !== 'unavailable')
    ) {
      throw new Error('English audience reason and band disagree.')
    }
    if (
      reasons.includes('audience-ja') !==
      (record.japaneseBand !== 'unavailable')
    ) {
      throw new Error('Japanese audience reason and band disagree.')
    }
    if (
      reasons.includes('multilingual-coverage') !==
      (record.sitelinkBand !== '0-to-4')
    ) {
      throw new Error('Multilingual reason and sitelink band disagree.')
    }
    return record as unknown as EligibleSelectedDiscoveryRecord
  }
  if (kind === 'predecessor-only-selected') {
    const record = strictRecord(
      input,
      [
        'kind',
        'catalogueItemId',
        'qid',
        'predecessorSha256',
        'state',
        'reasonCodes',
      ],
      'Predecessor-only-selected discovery record',
    )
    parseCommonDiscoveryIdentity(record)
    if (
      record.qid !== 'Q583684' ||
      record.catalogueItemId !== '69269f92-4bfa-4657-95cf-0f71aa93ba0e' ||
      record.state !== 'published'
    )
      throw new Error('Predecessor-only-selected authority is invalid.')
    if (
      typeof record.catalogueItemId !== 'string' ||
      !successorUuidPattern.test(record.catalogueItemId) ||
      typeof record.predecessorSha256 !== 'string' ||
      !successorSha256Pattern.test(record.predecessorSha256)
    )
      throw new Error('Predecessor-only-selected identity evidence is invalid.')
    if (canonicalJson(record.reasonCodes) !== canonicalJson(['predecessor']))
      throw new Error('Predecessor-only-selected reason must be predecessor.')
    return record as unknown as PredecessorOnlySelectedDiscoveryRecord
  }
  if (kind === 'retained-predecessor') {
    const record = strictRecord(
      input,
      [
        'kind',
        'qid',
        'catalogueItemId',
        'predecessorSha256',
        'currentSha256',
        'state',
        'correctionDisposition',
      ],
      'Retained-predecessor discovery record',
    )
    parseCommonDiscoveryIdentity(record)
    if (
      typeof record.catalogueItemId !== 'string' ||
      !successorUuidPattern.test(record.catalogueItemId)
    )
      throw new Error('Retained predecessor UUID is invalid.')
    if (
      typeof record.predecessorSha256 !== 'string' ||
      !successorSha256Pattern.test(record.predecessorSha256) ||
      typeof record.currentSha256 !== 'string' ||
      !successorSha256Pattern.test(record.currentSha256)
    )
      throw new Error('Retained predecessor hashes are invalid.')
    if (record.state !== 'draft' && record.state !== 'hidden')
      throw new Error('Retained predecessor must be non-published.')
    if (
      record.correctionDisposition !== 'unchanged-non-published' &&
      record.correctionDisposition !== 'catalogue_state_title_usability_hide' &&
      record.correctionDisposition !==
        'catalogue_state_adult_publication_hide' &&
      record.correctionDisposition !== 'catalogue_state_identity_scope_hide'
    )
      throw new Error('Retained predecessor disposition is invalid.')
    return record as unknown as RetainedPredecessorDiscoveryRecord
  }
  throw new Error('Successor discovery record kind is not closed.')
}

export function parseSuccessorDiscoveryRecords(
  input: unknown,
): readonly SuccessorDiscoveryRecord[] {
  if (!Array.isArray(input))
    throw new Error('Successor discovery records must be an array.')
  const records = input.map(parseSuccessorDiscoveryRecord)
  if (new Set(records.map(({ qid }) => qid)).size !== records.length) {
    throw new Error('Successor discovery record QIDs must be unique.')
  }
  return records
}

function authoritativeQidSet(
  input: readonly string[],
  description: string,
): ReadonlySet<string> {
  input.forEach((qid) => {
    if (typeof qid !== 'string' || !/^Q[1-9][0-9]*$/.test(qid)) {
      throw new Error(`${description} must contain primitive canonical QIDs.`)
    }
  })
  if (new Set(input).size !== input.length) {
    throw new Error(`${description} QIDs must be unique.`)
  }
  return new Set(input)
}

/** Pure evidence-derivation seam. Release code must call the authenticated wrapper below. */
export function validateDerivedSuccessorDiscoveryReasons(
  input: Readonly<{
    records: unknown
    publishedPredecessorQids: readonly string[]
    coverageWitnessQids: readonly string[]
    independentlyApprovedContinuityQids: readonly string[]
  }>,
): readonly SuccessorDiscoveryRecord[] {
  const records = parseSuccessorDiscoveryRecords(input.records)
  const predecessors = authoritativeQidSet(
    input.publishedPredecessorQids,
    'Derived predecessor',
  )
  const witnesses = authoritativeQidSet(
    input.coverageWitnessQids,
    'Derived witness',
  )
  const continuity = authoritativeQidSet(
    input.independentlyApprovedContinuityQids,
    'Derived continuity',
  )
  for (const record of records) {
    if (record.kind === 'eligible-selected') {
      if (record.qid === 'Q583684')
        throw new Error('Q583684 must use predecessor-only evidence.')
      const reasons = new Set<SuccessorDiscoveryReason>()
      if (predecessors.has(record.qid)) reasons.add('predecessor')
      if (record.englishBand !== 'unavailable') reasons.add('audience-en')
      if (record.japaneseBand !== 'unavailable') reasons.add('audience-ja')
      if (record.sitelinkBand !== '0-to-4') reasons.add('multilingual-coverage')
      if (witnesses.has(record.qid)) reasons.add('coverage-cell')
      if (continuity.has(record.qid)) reasons.add('franchise-continuity')
      const expected = successorDiscoveryReasonOrder.filter((reason) =>
        reasons.has(reason),
      )
      if (canonicalJson(expected) !== canonicalJson(record.reasonCodes))
        throw new Error(
          'Eligible-selected reasons do not exactly match derived authority.',
        )
    } else if (
      record.kind === 'predecessor-only-selected' &&
      (!predecessors.has(record.qid) || record.qid !== 'Q583684')
    )
      throw new Error('Predecessor-only evidence changed the exact exception.')
  }
  for (const qid of [...witnesses, ...continuity]) {
    if (
      records.find((record) => record.qid === qid)?.kind !== 'eligible-selected'
    )
      throw new Error(
        'Derived witness and continuity must name eligible-selected records.',
      )
  }
  return records
}

export function predecessorOnlySelectedDiscoveryRecord(
  input: Omit<PredecessorOnlySelectedDiscoveryRecord, 'kind' | 'reasonCodes'>,
): PredecessorOnlySelectedDiscoveryRecord {
  if (
    input.qid !== 'Q583684' ||
    input.catalogueItemId !== '69269f92-4bfa-4657-95cf-0f71aa93ba0e'
  ) {
    throw new Error('Only Q583684 is authorized as predecessor-only-selected.')
  }
  return {
    kind: 'predecessor-only-selected',
    ...input,
    reasonCodes: ['predecessor'],
  }
}

export function retainedPredecessorDiscoveryRecord(
  input: RetainedPredecessorRecord,
): RetainedPredecessorDiscoveryRecord {
  return { kind: 'retained-predecessor', ...input }
}

function isAudienceAvailable(candidate: SelectionCandidate): boolean {
  return (
    candidate.englishBand !== 'unavailable' ||
    candidate.japaneseBand !== 'unavailable'
  )
}

export function selectAudienceAnchors(
  candidates: readonly SelectionCandidate[],
  requiredCount = 250,
): readonly SelectionCandidate[] {
  const eligible = candidates.filter(
    (candidate) =>
      candidate.source === 'frozen-primary-approved' &&
      isAudienceAvailable(candidate),
  )
  const qids = eligible.map(({ qid }) => qid)
  if (new Set(qids).size !== qids.length) {
    throw new Error('Audience-anchor candidate QIDs must be unique.')
  }
  if (eligible.length < requiredCount) {
    throw new Error(
      `Fewer than ${requiredCount} publishable audience anchors remain.`,
    )
  }
  return [...eligible].sort(compareAudienceCandidates).slice(0, requiredCount)
}

export function reasonsForCandidate(
  candidate: SelectionCandidate,
  options: Readonly<{
    coverageWitness?: boolean
    independentlyApprovedContinuity?: boolean
  }> = {},
): readonly SuccessorDiscoveryReason[] {
  const reasons = new Set<SuccessorDiscoveryReason>()
  if (candidate.publishablePredecessor) reasons.add('predecessor')
  if (candidate.englishBand !== 'unavailable') reasons.add('audience-en')
  if (candidate.japaneseBand !== 'unavailable') reasons.add('audience-ja')
  if (candidate.sitelinkBand !== '0-to-4') reasons.add('multilingual-coverage')
  if (options.coverageWitness) reasons.add('coverage-cell')
  if (options.independentlyApprovedContinuity)
    reasons.add('franchise-continuity')
  return successorDiscoveryReasonOrder.filter((reason) => reasons.has(reason))
}

export function isAdmittedToRemainingFill(
  candidate: SelectionCandidate,
  independentlyApprovedContinuity = false,
): boolean {
  return reasonsForCandidate(candidate, {
    independentlyApprovedContinuity,
  }).some((reason) =>
    (
      [
        'audience-en',
        'audience-ja',
        'multilingual-coverage',
        'franchise-continuity',
      ] as readonly SuccessorDiscoveryReason[]
    ).includes(reason),
  )
}

export function assignAudienceOrdinals(
  candidates: readonly SelectionCandidate[],
): ReadonlyMap<string, number> {
  const ordered = [...candidates].sort(compareAudienceCandidates)
  if (new Set(ordered.map(({ qid }) => qid)).size !== ordered.length) {
    throw new Error('Optional selection candidate QIDs must be unique.')
  }
  return new Map(ordered.map(({ qid }, index) => [qid, index]))
}

export function selectionTierWeight(
  optionalCount: number,
  poolCount: number,
): bigint {
  if (
    !Number.isSafeInteger(optionalCount) ||
    optionalCount < 0 ||
    !Number.isSafeInteger(poolCount) ||
    poolCount < 0
  ) {
    throw new Error(
      'Selection cardinalities must be non-negative safe integers.',
    )
  }
  return BigInt(optionalCount) * BigInt(Math.max(0, poolCount - 1)) + BigInt(1)
}

export function selectionCandidateCost(
  independentlyApprovedContinuity: boolean,
  audienceOrdinal: number,
  tierWeight: bigint,
): bigint {
  if (!Number.isSafeInteger(audienceOrdinal) || audienceOrdinal < 0) {
    throw new Error('Audience ordinals must be non-negative safe integers.')
  }
  return (
    (independentlyApprovedContinuity ? BigInt(0) : tierWeight) +
    BigInt(audienceOrdinal)
  )
}

type Edge = {
  to: number
  reverse: number
  capacity: number
  cost: bigint
  initialCapacity: number
}

type LowerBoundEdge = Readonly<{
  from: number
  edgeIndex: number
  lower: number
}>

class IntegralMinCostCirculation {
  readonly graph: Edge[][]
  readonly balance: number[]
  private potentials: bigint[]

  constructor(nodeCount: number) {
    this.graph = Array.from({ length: nodeCount }, () => [])
    this.balance = Array.from({ length: nodeCount }, () => 0)
    this.potentials = Array.from({ length: nodeCount }, () => BigInt(0))
  }

  addEdge(from: number, to: number, capacity: number, cost: bigint): number {
    const forwardIndex = this.graph[from]!.length
    const reverseIndex = this.graph[to]!.length
    this.graph[from]!.push({
      to,
      reverse: reverseIndex,
      capacity,
      cost,
      initialCapacity: capacity,
    })
    this.graph[to]!.push({
      to: from,
      reverse: forwardIndex,
      capacity: 0,
      cost: -cost,
      initialCapacity: 0,
    })
    return forwardIndex
  }

  addBoundedEdge(
    from: number,
    to: number,
    lower: number,
    upper: number,
    cost: bigint,
  ): LowerBoundEdge {
    if (lower < 0 || upper < lower) throw new Error('Invalid flow edge bounds.')
    const edgeIndex = this.addEdge(from, to, upper - lower, cost)
    this.balance[from] = this.balance[from]! - lower
    this.balance[to] = this.balance[to]! + lower
    return { from, edgeIndex, lower }
  }

  flow(edge: LowerBoundEdge): number {
    const value = this.graph[edge.from]![edge.edgeIndex]!
    return edge.lower + value.initialCapacity - value.capacity
  }

  satisfyBalances(superSource: number, superSink: number): bigint | null {
    let required = 0
    const auxiliaryEdges: Array<Readonly<{ from: number; edgeIndex: number }>> =
      []
    for (let node = 0; node < this.balance.length; node += 1) {
      const balance = this.balance[node]!
      if (balance > 0) {
        auxiliaryEdges.push({
          from: superSource,
          edgeIndex: this.addEdge(superSource, node, balance, BigInt(0)),
        })
        required += balance
      } else if (balance < 0) {
        auxiliaryEdges.push({
          from: node,
          edgeIndex: this.addEdge(node, superSink, -balance, BigInt(0)),
        })
      }
    }
    const result = this.minimumCostFlow(superSource, superSink, required)
    if (result.flow !== required) return null
    // Auxiliary arcs prove feasibility only. Sealing both residual directions
    // keeps canonical tie cycles inside the original bounded circulation.
    for (const reference of auxiliaryEdges) {
      const edge = this.graph[reference.from]![reference.edgeIndex]!
      edge.capacity = 0
      this.graph[edge.to]![edge.reverse]!.capacity = 0
    }
    return result.cost
  }

  canonicalizeUnitEdges(
    edges: readonly Readonly<{
      qid: string
      reference: LowerBoundEdge
    }>[],
  ): void {
    for (const { reference } of [...edges].sort((left, right) =>
      compareDiscoveryQids(left.qid, right.qid),
    )) {
      const edge = this.graph[reference.from]![reference.edgeIndex]!
      const reverse = this.graph[edge.to]![edge.reverse]!
      if (this.flow(reference) === 1) {
        // The current primary-optimal flow already includes this QID, so the
        // scan fixes it immediately and forbids its reverse residual arc.
        reverse.capacity = 0
        continue
      }
      const reducedCandidateCost =
        edge.cost + this.potentials[reference.from]! - this.potentials[edge.to]!
      const path =
        reducedCandidateCost === BigInt(0)
          ? this.zeroReducedCostPath(edge.to, reference.from)
          : null
      if (path === null) {
        // No zero-cost residual cycle can include the candidate while keeping
        // the established primary optimum, so the scan fixes it excluded.
        edge.capacity = 0
        edge.initialCapacity = 0
        continue
      }
      edge.capacity -= 1
      reverse.capacity += 1
      for (const step of path) {
        const pathEdge = this.graph[step.from]![step.edgeIndex]!
        pathEdge.capacity -= 1
        this.graph[pathEdge.to]![pathEdge.reverse]!.capacity += 1
      }
      // Inclusion is now fixed for every later QID decision.
      reverse.capacity = 0
    }
  }

  private zeroReducedCostPath(
    source: number,
    sink: number,
  ): readonly Readonly<{ from: number; edgeIndex: number }>[] | null {
    const previousNode = Array.from({ length: this.graph.length }, () => -1)
    const previousEdge = Array.from({ length: this.graph.length }, () => -1)
    const queue = [source]
    previousNode[source] = source
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const from = queue[cursor]!
      if (from === sink) break
      this.graph[from]!.forEach((edge, edgeIndex) => {
        if (edge.capacity === 0 || previousNode[edge.to] !== -1) return
        const reducedCost =
          edge.cost + this.potentials[from]! - this.potentials[edge.to]!
        if (reducedCost !== BigInt(0)) return
        previousNode[edge.to] = from
        previousEdge[edge.to] = edgeIndex
        queue.push(edge.to)
      })
    }
    if (previousNode[sink] === -1) return null
    const path: Array<Readonly<{ from: number; edgeIndex: number }>> = []
    for (let node = sink; node !== source; node = previousNode[node]!) {
      path.push({ from: previousNode[node]!, edgeIndex: previousEdge[node]! })
    }
    return path.reverse()
  }

  private minimumCostFlow(
    source: number,
    sink: number,
    requiredFlow: number,
  ): Readonly<{ flow: number; cost: bigint }> {
    let flow = 0
    let cost = BigInt(0)
    const nodeCount = this.graph.length
    while (flow < requiredFlow) {
      const distance: Array<bigint | null> = Array.from(
        { length: nodeCount },
        () => null,
      )
      const previousNode = Array.from({ length: nodeCount }, () => -1)
      const previousEdge = Array.from({ length: nodeCount }, () => -1)
      distance[source] = BigInt(0)

      const queue = new BigIntMinimumHeap()
      queue.push({ node: source, distance: BigInt(0) })
      while (queue.size > 0) {
        const current = queue.pop()!
        if (distance[current.node] !== current.distance) continue
        this.graph[current.node]!.forEach((edge, edgeIndex) => {
          if (edge.capacity === 0) return
          const reducedCost =
            edge.cost +
            this.potentials[current.node]! -
            this.potentials[edge.to]!
          if (reducedCost < BigInt(0)) {
            throw new Error('Minimum-cost residual potentials became invalid.')
          }
          const nextDistance = current.distance + reducedCost
          if (distance[edge.to] === null || nextDistance < distance[edge.to]!) {
            distance[edge.to] = nextDistance
            previousNode[edge.to] = current.node
            previousEdge[edge.to] = edgeIndex
            queue.push({ node: edge.to, distance: nextDistance })
          }
        })
      }
      if (distance[sink] === null) break

      for (let node = 0; node < nodeCount; node += 1) {
        if (distance[node] !== null) {
          this.potentials[node] = this.potentials[node]! + distance[node]!
        }
      }

      let augmentation = requiredFlow - flow
      for (let node = sink; node !== source; node = previousNode[node]!) {
        const from = previousNode[node]
        if (from < 0) throw new Error('Broken minimum-cost augmenting path.')
        augmentation = Math.min(
          augmentation,
          this.graph[from]![previousEdge[node]!]!.capacity,
        )
      }
      for (let node = sink; node !== source; node = previousNode[node]!) {
        const from = previousNode[node]!
        const edge = this.graph[from]![previousEdge[node]!]!
        edge.capacity -= augmentation
        this.graph[node]![edge.reverse]!.capacity += augmentation
        cost += BigInt(augmentation) * edge.cost
      }
      flow += augmentation
    }
    return { flow, cost }
  }
}

type HeapEntry = Readonly<{ node: number; distance: bigint }>

class BigIntMinimumHeap {
  private readonly values: HeapEntry[] = []

  get size(): number {
    return this.values.length
  }

  push(value: HeapEntry): void {
    this.values.push(value)
    let index = this.values.length - 1
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (this.values[parent]!.distance <= value.distance) break
      this.values[index] = this.values[parent]!
      index = parent
    }
    this.values[index] = value
  }

  pop(): HeapEntry | undefined {
    const first = this.values[0]
    const last = this.values.pop()
    if (first === undefined || last === undefined || this.values.length === 0) {
      return first
    }
    let index = 0
    while (true) {
      const left = index * 2 + 1
      const right = left + 1
      if (left >= this.values.length) break
      const child =
        right < this.values.length &&
        this.values[right]!.distance < this.values[left]!.distance
          ? right
          : left
      if (this.values[child]!.distance >= last.distance) break
      this.values[index] = this.values[child]!
      index = child
    }
    this.values[index] = last
    return first
  }
}

type ExactSelectionRequest = Readonly<{
  candidates: readonly SelectionCandidate[]
  costs: ReadonlyMap<string, bigint>
  fixedSelected: readonly SelectionCandidate[]
  selectCount: number
  constraints: SelectionConstraints
  requiredQids?: ReadonlySet<string>
  excludedQids?: ReadonlySet<string>
}>

type ExactSelectionResult = Readonly<{
  selected: readonly SelectionCandidate[]
  cost: bigint
}>

function countBy<T extends string>(values: readonly T[]): Map<T, number> {
  const counts = new Map<T, number>()
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1))
  return counts
}

function solveExactSelection(
  request: ExactSelectionRequest,
): ExactSelectionResult | null {
  const requiredQids = request.requiredQids ?? new Set<string>()
  const excludedQids = request.excludedQids ?? new Set<string>()
  if ([...requiredQids].some((qid) => excludedQids.has(qid))) return null
  const fixedQids = new Set(request.fixedSelected.map(({ qid }) => qid))
  const candidates = request.candidates.filter(
    (candidate) => !fixedQids.has(candidate.qid),
  )
  const byQid = new Map(
    candidates.map((candidate) => [candidate.qid, candidate]),
  )
  if (byQid.size !== candidates.length)
    throw new Error('Selection QIDs must be unique.')
  if ([...requiredQids].some((qid) => !byQid.has(qid))) return null
  const required = [...requiredQids].map((qid) => byQid.get(qid)!)
  const fixed = [...request.fixedSelected, ...required]
  const remainingCount = request.selectCount - required.length
  if (remainingCount < 0) return null

  const formatCounts = countBy(fixed.map(({ format }) => format))
  const eraCounts = countBy(fixed.map(({ era }) => era))
  if ((eraCounts.get('unknown') ?? 0) > request.constraints.unknownYearMaximum)
    return null

  const formats = Object.keys(
    request.constraints.formatFloors,
  ) as DiscoveryFormat[]
  const eras = [
    ...Object.keys(request.constraints.eraFloors),
    'unknown',
    'after-2026',
  ] as SelectionEra[]
  const source = 0
  const formatOffset = 1
  const optional = candidates.filter(
    ({ qid }) => !requiredQids.has(qid) && !excludedQids.has(qid),
  )
  const eraOffset = formatOffset + formats.length
  const sink = eraOffset + eras.length
  const superSource = sink + 1
  const superSink = sink + 2
  const circulation = new IntegralMinCostCirculation(superSink + 1)

  for (const [index, format] of formats.entries()) {
    const floor = Math.max(
      0,
      request.constraints.formatFloors[format] -
        (formatCounts.get(format) ?? 0),
    )
    if (floor > remainingCount) return null
    circulation.addBoundedEdge(
      source,
      formatOffset + index,
      floor,
      remainingCount,
      BigInt(0),
    )
  }
  const candidateEdges = new Map<string, LowerBoundEdge>()
  optional.forEach((candidate) => {
    const formatIndex = formats.indexOf(candidate.format)
    const eraIndex = eras.indexOf(candidate.era)
    if (formatIndex < 0 || eraIndex < 0)
      throw new Error('Candidate cell is outside the solver graph.')
    const cost = request.costs.get(candidate.qid)
    if (cost === undefined || cost < BigInt(0))
      throw new Error(
        'Every optional candidate needs a non-negative BigInt cost.',
      )
    candidateEdges.set(
      candidate.qid,
      circulation.addBoundedEdge(
        formatOffset + formatIndex,
        eraOffset + eraIndex,
        0,
        1,
        cost,
      ),
    )
  })
  for (const [index, era] of eras.entries()) {
    const floor =
      era === 'unknown' || era === 'after-2026'
        ? 0
        : Math.max(
            0,
            request.constraints.eraFloors[era] - (eraCounts.get(era) ?? 0),
          )
    const upper =
      era === 'unknown'
        ? request.constraints.unknownYearMaximum -
          (eraCounts.get('unknown') ?? 0)
        : remainingCount
    if (upper < floor) return null
    circulation.addBoundedEdge(eraOffset + index, sink, floor, upper, BigInt(0))
  }
  circulation.addBoundedEdge(
    sink,
    source,
    remainingCount,
    remainingCount,
    BigInt(0),
  )
  if (circulation.satisfyBalances(superSource, superSink) === null) return null
  circulation.canonicalizeUnitEdges(
    optional.map((candidate) => ({
      qid: candidate.qid,
      reference: candidateEdges.get(candidate.qid)!,
    })),
  )

  const selectedOptional = optional.filter((candidate) => {
    const edge = candidateEdges.get(candidate.qid)
    return edge !== undefined && circulation.flow(edge) === 1
  })
  if (selectedOptional.length !== remainingCount) return null
  const selected = [...required, ...selectedOptional].sort((left, right) =>
    compareDiscoveryQids(left.qid, right.qid),
  )
  const cost = selected.reduce(
    (sum, candidate) => sum + request.costs.get(candidate.qid)!,
    BigInt(0),
  )
  return { selected, cost }
}

export function selectMinimumCostSet(
  request: Omit<ExactSelectionRequest, 'requiredQids' | 'excludedQids'>,
): ExactSelectionResult {
  const optimum = solveExactSelection(request)
  if (optimum === null)
    throw new Error('No feasible integral selection exists.')
  return optimum
}

type SelectionPartition = Readonly<{
  requiredQids: ReadonlySet<string>
  excludedQids: ReadonlySet<string>
  prefixLength: number
  result: ExactSelectionResult
}>

function compareSelectedQidSequences(
  left: readonly SelectionCandidate[],
  right: readonly SelectionCandidate[],
): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const comparison = compareDiscoveryQids(left[index]!.qid, right[index]!.qid)
    if (comparison !== 0) return comparison
  }
  return left.length - right.length
}

function selectCanonicalExtendableSet(
  request: Omit<ExactSelectionRequest, 'requiredQids' | 'excludedQids'>,
  extendsToFinal: (selection: ExactSelectionResult) => boolean,
  evidence: { solved: number },
): ExactSelectionResult | null {
  evidence.solved += 1
  const initial = solveExactSelection(request)
  if (initial === null) return null
  const orderedQids = request.candidates
    .filter(
      ({ qid }) => !request.fixedSelected.some((fixed) => fixed.qid === qid),
    )
    .map(({ qid }) => qid)
    .sort(compareDiscoveryQids)
  const frontier: SelectionPartition[] = [
    {
      requiredQids: new Set(),
      excludedQids: new Set(),
      prefixLength: 0,
      result: initial,
    },
  ]
  const visited = new Set<string>(['|'])

  while (frontier.length > 0) {
    frontier.sort((left, right) => {
      if (left.result.cost !== right.result.cost) {
        return left.result.cost < right.result.cost ? -1 : 1
      }
      return compareSelectedQidSequences(
        left.result.selected,
        right.result.selected,
      )
    })
    const partition = frontier.shift()!
    if (extendsToFinal(partition.result)) return partition.result

    const selectedQids = new Set(
      partition.result.selected.map(({ qid }) => qid),
    )
    const prefixRequired = new Set(partition.requiredQids)
    const prefixExcluded = new Set(partition.excludedQids)
    for (
      let index = partition.prefixLength;
      index < orderedQids.length;
      index += 1
    ) {
      const qid = orderedQids[index]!
      const childRequired = new Set(prefixRequired)
      const childExcluded = new Set(prefixExcluded)
      if (selectedQids.has(qid)) childExcluded.add(qid)
      else childRequired.add(qid)
      const signature = `${[...childRequired].sort(compareDiscoveryQids).join(',')}|${[
        ...childExcluded,
      ]
        .sort(compareDiscoveryQids)
        .join(',')}`
      if (!visited.has(signature)) {
        visited.add(signature)
        evidence.solved += 1
        const result = solveExactSelection({
          ...request,
          requiredQids: childRequired,
          excludedQids: childExcluded,
        })
        if (result !== null) {
          frontier.push({
            requiredQids: childRequired,
            excludedQids: childExcluded,
            prefixLength: index + 1,
            result,
          })
        }
      }
      if (selectedQids.has(qid)) prefixRequired.add(qid)
      else prefixExcluded.add(qid)
    }
  }
  return null
}

export type CanonicalSelectionResult = Readonly<{
  selected: readonly SelectionCandidate[]
  audienceAnchors: readonly SelectionCandidate[]
  coverageWitness: readonly SelectionCandidate[]
  reasonCodes: ReadonlyMap<string, readonly SuccessorDiscoveryReason[]>
  primaryCost: bigint
  tierWeight: bigint
  witnessPartitionsSolved: number
}>

function assertCandidatePool(candidates: readonly SelectionCandidate[]): void {
  if (new Set(candidates.map(({ qid }) => qid)).size !== candidates.length) {
    throw new Error('Successor selection candidate QIDs must be unique.')
  }
  for (const candidate of candidates) {
    if (
      !candidate.publishablePredecessor &&
      candidate.source !== 'frozen-primary-approved'
    ) {
      throw new Error(
        'A non-predecessor candidate is outside the frozen receipt.',
      )
    }
    if (
      candidate.source === 'publishable-predecessor-only' &&
      !candidate.publishablePredecessor
    ) {
      throw new Error(
        'Predecessor-only candidates must be publishable predecessors.',
      )
    }
  }
}

function constraintsWithPublishedCount(
  constraints: SelectionConstraints,
  publishedCount: number,
): SelectionConstraints {
  return { ...constraints, publishedCount }
}

function selectionEraForYear(year: number | null): SelectionEra {
  if (year === null) return 'unknown'
  if (year < 1980) return 'before-1980'
  if (year < 1990) return '1980-1989'
  if (year < 2000) return '1990-1999'
  if (year < 2010) return '2000-2009'
  if (year < 2020) return '2010-2019'
  if (year <= 2026) return '2020-2026'
  return 'after-2026'
}

function minimumCoverageWitnessCardinality(
  fixed: readonly SelectionCandidate[],
  constraints: SelectionConstraints,
): number {
  const formatCounts = countBy(fixed.map(({ format }) => format))
  const eraCounts = countBy(fixed.map(({ era }) => era))
  const formatResidual = Object.entries(constraints.formatFloors).reduce(
    (sum, [format, floor]) =>
      sum +
      Math.max(0, floor - (formatCounts.get(format as DiscoveryFormat) ?? 0)),
    0,
  )
  const eraResidual = Object.entries(constraints.eraFloors).reduce(
    (sum, [era, floor]) =>
      sum + Math.max(0, floor - (eraCounts.get(era as SelectionEra) ?? 0)),
    0,
  )
  return Math.max(formatResidual, eraResidual)
}

/** Pure solver seam for deterministic fixtures; release code uses the authenticated wrapper. */
export function selectCanonicalReleaseV2ForFixture(
  candidates: readonly SelectionCandidate[],
  options: Readonly<{
    constraints?: SelectionConstraints
    audienceAnchorCount?: number
    independentlyApprovedContinuityQids?: ReadonlySet<string>
  }> = {},
): CanonicalSelectionResult {
  assertCandidatePool(candidates)
  const constraints = options.constraints ?? releaseV2SelectionConstraints
  const continuity =
    options.independentlyApprovedContinuityQids ?? new Set<string>()
  const candidatesByQid = new Map(
    candidates.map((candidate) => [candidate.qid, candidate]),
  )
  for (const qid of continuity) {
    if (candidatesByQid.get(qid)?.source !== 'frozen-primary-approved') {
      throw new Error(
        'Independent continuity approval must name a primary-approved frozen candidate.',
      )
    }
  }
  const predecessors = candidates.filter(
    ({ publishablePredecessor }) => publishablePredecessor,
  )
  const anchors = selectAudienceAnchors(
    candidates,
    options.audienceAnchorCount ?? 250,
  )
  const mandatoryByQid = new Map(
    [...predecessors, ...anchors].map((candidate) => [
      candidate.qid,
      candidate,
    ]),
  )
  if (mandatoryByQid.size > constraints.publishedCount) {
    throw new Error('Mandatory selections exceed the published target.')
  }
  const initialFixed = [...mandatoryByQid.values()]
  const optionalPool = candidates.filter(({ qid }) => !mandatoryByQid.has(qid))
  const optionalCount = constraints.publishedCount - initialFixed.length
  const ordinals = assignAudienceOrdinals(optionalPool)
  const tierWeight = selectionTierWeight(optionalCount, optionalPool.length)
  const costs = new Map(
    optionalPool.map((candidate) => [
      candidate.qid,
      selectionCandidateCost(
        continuity.has(candidate.qid),
        ordinals.get(candidate.qid)!,
        tierWeight,
      ),
    ]),
  )

  const admitted = optionalPool.filter((candidate) =>
    isAdmittedToRemainingFill(candidate, continuity.has(candidate.qid)),
  )
  const witnessPool = optionalPool
  const maxWitness = Math.min(optionalCount, witnessPool.length)
  let witness: ExactSelectionResult | null = null
  const witnessSearchBudget = { solved: 0 }
  for (
    let count = minimumCoverageWitnessCardinality(initialFixed, constraints);
    count <= maxWitness;
    count += 1
  ) {
    witness = selectCanonicalExtendableSet(
      {
        candidates: witnessPool,
        costs,
        fixedSelected: initialFixed,
        selectCount: count,
        constraints: constraintsWithPublishedCount(
          constraints,
          initialFixed.length + count,
        ),
      },
      (candidateWitness) => {
        const witnessQids = new Set(
          candidateWitness.selected.map(({ qid }) => qid),
        )
        const remainingCandidates = admitted.filter(
          ({ qid }) => !witnessQids.has(qid),
        )
        const fixed = [...initialFixed, ...candidateWitness.selected]
        return (
          solveExactSelection({
            candidates: remainingCandidates,
            costs: new Map(
              remainingCandidates.map((candidate) => [
                candidate.qid,
                costs.get(candidate.qid)!,
              ]),
            ),
            fixedSelected: fixed,
            selectCount: constraints.publishedCount - fixed.length,
            constraints,
          }) !== null
        )
      },
      witnessSearchBudget,
    )
    if (witness !== null) break
  }
  if (witness === null)
    throw new Error('No extendable canonical floor witness exists.')

  const witnessQids = new Set(witness.selected.map(({ qid }) => qid))
  const fixed = [...initialFixed, ...witness.selected]
  const finalCandidates = admitted.filter(({ qid }) => !witnessQids.has(qid))
  const final = selectMinimumCostSet({
    candidates: finalCandidates,
    costs: new Map(
      finalCandidates.map((candidate) => [
        candidate.qid,
        costs.get(candidate.qid)!,
      ]),
    ),
    fixedSelected: fixed,
    selectCount: constraints.publishedCount - fixed.length,
    constraints,
  })
  const selected = [...fixed, ...final.selected].sort((left, right) =>
    compareDiscoveryQids(left.qid, right.qid),
  )
  const reasonCodes = new Map(
    selected.map((candidate) => [
      candidate.qid,
      reasonsForCandidate(candidate, {
        coverageWitness: witnessQids.has(candidate.qid),
        independentlyApprovedContinuity: continuity.has(candidate.qid),
      }),
    ]),
  )
  if ([...reasonCodes.values()].some((reasons) => reasons.length === 0)) {
    throw new Error('Every selected record must carry a permitted reason code.')
  }
  return {
    selected,
    audienceAnchors: anchors,
    coverageWitness: witness.selected,
    reasonCodes,
    primaryCost: witness.cost + final.cost,
    tierWeight,
    witnessPartitionsSolved: witnessSearchBudget.solved,
  }
}

export type AuthenticatedSelectionInput = Readonly<{
  candidateReceipt: unknown
  primaryCandidateReview: unknown
  candidateAcquisitionReviewAuthority?: unknown
  continuityAcquisition: unknown
  continuityPreparation: unknown
  finalizedContinuity: unknown
  predecessorReviewResult: unknown
  predecessorCorpus: AnimeReleaseCorpus
  predecessorReviewLedger: AnimeReleaseReviewLedger
  predecessorIndex: AnimeReleaseIndex
  predecessorPreparation: unknown
}>

function prepareAuthenticatedSelection(input: AuthenticatedSelectionInput) {
  if (input.candidateAcquisitionReviewAuthority === undefined) {
    throw new Error(
      'Authenticated selection requires complete locked candidate acquisition/review authority.',
    )
  }
  const receipt = parseAcceptedCandidateReceipt(input.candidateReceipt)
  const predecessorReview = validatePredecessorReviewResult(
    input.predecessorReviewResult,
    input.predecessorCorpus,
    input.predecessorReviewLedger,
    input.predecessorIndex,
    input.predecessorPreparation,
  )
  const primary = parsePrimaryCandidateReviewResult(
    input.primaryCandidateReview,
    receipt,
    input.candidateAcquisitionReviewAuthority,
    input.predecessorReviewResult,
  )
  const preparation = parseContinuityPreparation(
    input.continuityPreparation,
    receipt,
    primary,
    input.continuityAcquisition,
    input.candidateAcquisitionReviewAuthority,
    input.predecessorReviewResult,
  )
  const retainedPredecessorQids = new Set(
    predecessorReview.records.map(({ sourceItemId }) => sourceItemId),
  )
  if (retainedPredecessorQids.size !== 500) {
    throw new Error(
      'Authenticated selection requires exactly 500 retained predecessors.',
    )
  }
  const publishablePredecessors = new Map(
    predecessorReview.records
      .filter(({ currentItem }) => currentItem.catalogueState === 'published')
      .map((record) => [record.sourceItemId, record]),
  )
  if (publishablePredecessors.size !== 437) {
    throw new Error(
      'Authenticated selection requires exactly 437 published predecessors.',
    )
  }
  const primaryApproved = new Set(primary.orderedPrimaryApprovedQids)
  if ([...primaryApproved].some((qid) => retainedPredecessorQids.has(qid))) {
    throw new Error(
      'Retained predecessors cannot enter primary-approved new selection.',
    )
  }
  const receiptByQid = new Map(
    receipt.candidates.map((candidate) => [candidate.qid, candidate]),
  )
  const candidates: SelectionCandidate[] = receipt.candidates
    .filter(
      ({ qid }) =>
        primaryApproved.has(qid) && !retainedPredecessorQids.has(qid),
    )
    .map((candidate) => ({
      qid: candidate.qid,
      format: candidate.format,
      era: candidate.era,
      englishBand: candidate.englishBand,
      japaneseBand: candidate.japaneseBand,
      sitelinkBand: candidate.sitelinkBand,
      source: 'frozen-primary-approved',
      publishablePredecessor: publishablePredecessors.has(candidate.qid),
    }))
  let receiptResidentPublishedPredecessors = 0
  for (const [qid, predecessor] of publishablePredecessors) {
    const frozen = receiptByQid.get(qid)
    if (frozen !== undefined) {
      if (
        predecessor.currentItem.format !== frozen.format ||
        selectionEraForYear(predecessor.currentItem.releaseYear) !== frozen.era
      ) {
        throw new Error(
          'Receipt-resident published predecessor format or era changed frozen authority.',
        )
      }
      receiptResidentPublishedPredecessors += 1
      candidates.push({
        qid,
        format: frozen.format,
        era: frozen.era,
        englishBand: frozen.englishBand,
        japaneseBand: frozen.japaneseBand,
        sitelinkBand: frozen.sitelinkBand,
        source: 'frozen-primary-approved',
        publishablePredecessor: true,
      })
      continue
    }
    if (qid !== 'Q583684' || predecessor.currentItem.format === 'unknown') {
      throw new Error(
        'Only Q583684 may be a predecessor-only published selection.',
      )
    }
    candidates.push({
      qid,
      format: predecessor.currentItem.format,
      era: selectionEraForYear(predecessor.currentItem.releaseYear),
      englishBand: 'unavailable',
      japaneseBand: 'unavailable',
      sitelinkBand: '0-to-4',
      source: 'publishable-predecessor-only',
      publishablePredecessor: true,
    })
  }
  if (receiptResidentPublishedPredecessors !== 436) {
    throw new Error(
      'Authenticated selection requires exactly 436 receipt-resident published predecessors.',
    )
  }
  if (
    candidates.some(
      ({ qid, publishablePredecessor }) =>
        retainedPredecessorQids.has(qid) && !publishablePredecessor,
    )
  ) {
    throw new Error(
      'Non-published retained predecessors cannot enter selection.',
    )
  }
  return {
    receipt,
    primary,
    preparation,
    candidates,
    publishablePredecessors,
    retainedPredecessorQids,
  }
}

export function selectAuthenticatedCanonicalReleaseV2(
  input: AuthenticatedSelectionInput,
): CanonicalSelectionResult {
  const { receipt, primary, preparation, candidates, publishablePredecessors } =
    prepareAuthenticatedSelection(input)
  const initial = selectCanonicalReleaseV2ForFixture(candidates, {
    independentlyApprovedContinuityQids:
      primaryApprovedContinuityQids(preparation),
  })
  const finalized = parseFinalizedContinuity(
    input.finalizedContinuity,
    preparation,
    receipt,
    primary,
    input.continuityAcquisition,
    initial.selected.map(({ qid }) => qid),
    sha256Canonical(input.predecessorCorpus),
    input.candidateAcquisitionReviewAuthority,
    input.predecessorReviewResult,
  )
  const result = validateFinalizedContinuitySelectionForFixture({
    initialSelection: initial,
    candidates,
    finalizedContinuity: finalized,
  })
  const selectedPredecessors = result.selected.filter(({ qid }) =>
    publishablePredecessors.has(qid),
  ).length
  if (
    selectedPredecessors !== 437 ||
    result.selected.length - selectedPredecessors !== 4_563
  ) {
    throw new Error(
      'Authenticated selection must contain exactly 437 predecessors and 4,563 new records.',
    )
  }
  return result
}

/** Pure recomputation seam for bounded fixtures; authenticated release selection fixes all policies. */
export function validateFinalizedContinuitySelectionForFixture(
  input: Readonly<{
    initialSelection: CanonicalSelectionResult
    candidates: readonly SelectionCandidate[]
    finalizedContinuity: FinalizedContinuity
    constraints?: SelectionConstraints
    audienceAnchorCount?: number
  }>,
): CanonicalSelectionResult {
  const finalized = input.finalizedContinuity
  const initialQids = input.initialSelection.selected.map(({ qid }) => qid)
  if (
    canonicalJson(initialQids) !== canonicalJson(finalized.initialSelectedQids)
  )
    throw new Error(
      'Finalized continuity changed its authenticated initial selection.',
    )
  const independentlyApproved = independentApprovedContinuityQids(finalized)
  const rejectedByRound = new Map<number, string[]>()
  for (const outcome of finalized.outcomes) {
    if (outcome.outcome !== 'independent-rejected') continue
    const qids = rejectedByRound.get(outcome.replacementRound) ?? []
    qids.push(outcome.relatedQid)
    rejectedByRound.set(outcome.replacementRound, qids)
  }
  const excluded = new Set<string>()
  let previous = input.initialSelection
  for (const entry of finalized.replacementLineage) {
    const rejectedQids = [...(rejectedByRound.get(entry.round) ?? [])].sort(
      compareDiscoveryQids,
    )
    if (canonicalJson(rejectedQids) !== canonicalJson(entry.removedQids))
      throw new Error(
        'Continuity replacement round changed independent rejection authority.',
      )
    entry.removedQids.forEach((qid) => excluded.add(qid))
    const next = selectCanonicalReleaseV2ForFixture(
      input.candidates.filter(({ qid }) => !excluded.has(qid)),
      {
        constraints: input.constraints,
        audienceAnchorCount: input.audienceAnchorCount,
        independentlyApprovedContinuityQids: independentlyApproved,
      },
    )
    const previousQids = previous.selected.map(({ qid }) => qid)
    const nextQids = next.selected.map(({ qid }) => qid)
    const previousSet = new Set(previousQids)
    const nextSet = new Set(nextQids)
    const removedQids = previousQids
      .filter((qid) => !nextSet.has(qid))
      .sort(compareDiscoveryQids)
    const addedQids = nextQids
      .filter((qid) => !previousSet.has(qid))
      .sort(compareDiscoveryQids)
    if (
      canonicalJson(removedQids) !== canonicalJson(entry.removedQids) ||
      canonicalJson(addedQids) !== canonicalJson(entry.addedQids) ||
      entry.previousOrderedQidSequenceSha256 !==
        discoverySha256(previousQids) ||
      canonicalJson(nextQids) !== canonicalJson(entry.currentOrderedQids) ||
      entry.currentOrderedQidSequenceSha256 !== discoverySha256(nextQids)
    )
      throw new Error(
        'Continuity replacement lineage changed exact canonical recomputation.',
      )
    previous = next
  }
  const final =
    finalized.replacementLineage.length === 0
      ? selectCanonicalReleaseV2ForFixture(input.candidates, {
          constraints: input.constraints,
          audienceAnchorCount: input.audienceAnchorCount,
          independentlyApprovedContinuityQids: independentlyApproved,
        })
      : previous
  if (
    canonicalJson(final.selected.map(({ qid }) => qid)) !==
    canonicalJson(finalized.finalSelectedQids)
  )
    throw new Error(
      'Finalized continuity does not match canonical recomputation.',
    )
  return final
}

export function validateAuthenticatedIdentityReplacementLineage(
  input: AuthenticatedSelectionInput,
  lineage: readonly AuthorityReplacementLineageEntry[],
  reviewResults: readonly unknown[],
): Readonly<{
  canonicalSelection: CanonicalSelectionResult
  canonicalSelectionEvidenceSha256: string
  originalSeed: string
  currentSelectedQids: readonly string[]
  latestAddedQids: readonly string[]
  reviews: readonly IdentityReplacementReviewResult[]
}> {
  const canonicalSelection = selectAuthenticatedCanonicalReleaseV2(input)
  const context = prepareAuthenticatedSelection(input)
  const finalized = finalizedContinuitySchema.parse(input.finalizedContinuity)
  const selectionEvidence = canonicalSelectionEvidence(
    canonicalSelection,
    discoverySha256(finalized),
  )
  const result = validateIdentityReplacementLineageForFixture({
    initialSelection: canonicalSelection,
    candidates: context.candidates,
    independentlyApprovedContinuityQids:
      independentApprovedContinuityQids(finalized),
    predecessorQids: [...context.retainedPredecessorQids],
    candidateReceiptSha256: acceptedDiscoveryCandidateReceiptSha256,
    predecessorCorpusSha256: sha256Canonical(input.predecessorCorpus),
    canonicalSelectionEvidenceSha256: selectionEvidence.evidenceSha256,
    lineage,
    reviewResults,
  })
  return { canonicalSelection, ...result }
}

/** Pure recomputation seam for bounded fixtures; release code fixes the 5,000/250 selector. */
export function validateIdentityReplacementLineageForFixture(
  input: Readonly<{
    initialSelection: CanonicalSelectionResult
    candidates: readonly SelectionCandidate[]
    independentlyApprovedContinuityQids: ReadonlySet<string>
    predecessorQids: readonly string[]
    candidateReceiptSha256: string
    predecessorCorpusSha256: string
    canonicalSelectionEvidenceSha256: string
    lineage: readonly AuthorityReplacementLineageEntry[]
    reviewResults: readonly unknown[]
    constraints?: SelectionConstraints
    audienceAnchorCount?: number
  }>,
): Readonly<{
  canonicalSelectionEvidenceSha256: string
  originalSeed: string
  currentSelectedQids: readonly string[]
  latestAddedQids: readonly string[]
  reviews: readonly IdentityReplacementReviewResult[]
}> {
  const initialSelectedQids = input.initialSelection.selected.map(
    ({ qid }) => qid,
  )
  const originalSeed = deriveReplacementSeed({
    canonicalCandidateReceiptSha256: input.candidateReceiptSha256,
    predecessorCorpusSha256: input.predecessorCorpusSha256,
    orderedProposedPublishedQidSequenceSha256:
      discoverySha256(initialSelectedQids),
  })
  const lineageAuthority = {
    originalSeed,
    initialOrderedQids: initialSelectedQids,
  }
  validateReplacementLineageAuthority(input.lineage, lineageAuthority)
  if (input.reviewResults.length !== input.lineage.length)
    throw new Error('Every identity replacement round needs one review result.')

  const predecessors = authoritativeQidSet(
    input.predecessorQids,
    'Identity replacement predecessor',
  )
  const excluded = new Set<string>()
  let previous = input.initialSelection
  const parsedReviews: IdentityReplacementReviewResult[] = []
  let latestAddedQids: readonly string[] = []
  input.lineage.forEach((entry, index) => {
    const round = index + 1
    const previousQids = previous.selected.map(({ qid }) => qid)
    const review = parseIdentityReplacementReviewResult(
      input.reviewResults[index],
      {
        candidateReceiptSha256: input.candidateReceiptSha256,
        canonicalSelectionEvidenceSha256:
          input.canonicalSelectionEvidenceSha256,
        round,
        previousSelectedQidsSha256: discoverySha256(previousQids),
        roundSeed: deriveReplacementRoundSeed(originalSeed, round),
      },
    )
    const removedQids = review.removals.map(({ qid }) => qid)
    const previousSet = new Set(previousQids)
    if (removedQids.some((qid) => predecessors.has(qid)))
      throw new Error(
        'Identity replacement review cannot remove a predecessor.',
      )
    if (removedQids.some((qid) => !previousSet.has(qid) || excluded.has(qid)))
      throw new Error(
        'Identity replacement review removal is not currently selected.',
      )
    if (canonicalJson(removedQids) !== canonicalJson(entry.removedQids))
      throw new Error('Identity replacement review changed lineage removals.')
    removedQids.forEach((qid) => excluded.add(qid))
    const next = selectCanonicalReleaseV2ForFixture(
      input.candidates.filter(({ qid }) => !excluded.has(qid)),
      {
        constraints: input.constraints,
        audienceAnchorCount: input.audienceAnchorCount,
        independentlyApprovedContinuityQids:
          input.independentlyApprovedContinuityQids,
      },
    )
    const nextQids = next.selected.map(({ qid }) => qid)
    const nextSet = new Set(nextQids)
    const recomputedRemoved = previousQids
      .filter((qid) => !nextSet.has(qid))
      .sort(compareDiscoveryQids)
    const recomputedAdded = nextQids
      .filter((qid) => !previousSet.has(qid))
      .sort(compareDiscoveryQids)
    if (
      canonicalJson(entry.removedQids) !== canonicalJson(recomputedRemoved) ||
      canonicalJson(entry.addedQids) !== canonicalJson(recomputedAdded) ||
      canonicalJson(entry.currentOrderedQids) !== canonicalJson(nextQids) ||
      entry.previousOrderedQidSequenceSha256 !==
        discoverySha256(previousQids) ||
      entry.currentOrderedQidSequenceSha256 !== discoverySha256(nextQids) ||
      entry.roundSeed !== deriveReplacementRoundSeed(originalSeed, round)
    )
      throw new Error(
        'Identity replacement lineage changed canonical recomputation.',
      )
    parsedReviews.push(review)
    latestAddedQids = recomputedAdded
    previous = next
  })
  return {
    canonicalSelectionEvidenceSha256: input.canonicalSelectionEvidenceSha256,
    originalSeed,
    currentSelectedQids: previous.selected.map(({ qid }) => qid),
    latestAddedQids,
    reviews: parsedReviews,
  }
}

export function successorRepresentationSha256(
  representation: SuccessorRepresentation,
): string {
  return discoverySha256({
    version: 'successor-representation.v2',
    publishedSelection: representation.publishedSelection,
    retainedPredecessors: representation.retainedPredecessors,
  })
}

export type CanonicalSelectionEvidence = Readonly<{
  schema: 'zedarchive.anime-v2-canonical-selection-evidence'
  version: 1
  candidateReceiptSha256: 'fa126f87e53ef4babfec7f0a5924c153e84aa03a638052157656537e71002c59'
  selectionRubricSha256: typeof selectionRubricV2Sha256
  finalizedContinuitySha256: string
  orderedSelectedQids: readonly string[]
  orderedSelectedQidsSha256: string
  audienceAnchorQids: readonly string[]
  coverageWitnessQids: readonly string[]
  reasonCodes: readonly Readonly<{
    qid: string
    reasons: readonly SuccessorDiscoveryReason[]
  }>[]
  primaryCost: string
  tierWeight: string
  witnessPartitionsSolved: number
  evidenceSha256: string
}>

export function parseCanonicalSelectionEvidence(
  input: unknown,
): CanonicalSelectionEvidence {
  const record = strictRecord(
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
    record.candidateReceiptSha256 !==
      'fa126f87e53ef4babfec7f0a5924c153e84aa03a638052157656537e71002c59' ||
    record.selectionRubricSha256 !== selectionRubricV2Sha256
  )
    throw new Error('Canonical selection evidence authority is invalid.')
  for (const field of [
    'finalizedContinuitySha256',
    'orderedSelectedQidsSha256',
    'evidenceSha256',
  ] as const) {
    if (
      typeof record[field] !== 'string' ||
      !successorSha256Pattern.test(record[field])
    )
      throw new Error(`Canonical selection ${field} must be SHA-256.`)
  }
  const parseQids = (value: unknown, description: string) => {
    if (!Array.isArray(value))
      throw new Error(`${description} must be an array.`)
    value.forEach(assertSuccessorQid)
    if (new Set(value).size !== value.length)
      throw new Error(`${description} must be unique.`)
    return value as string[]
  }
  const orderedSelectedQids = parseQids(
    record.orderedSelectedQids,
    'Selected QIDs',
  )
  if (
    canonicalJson([...orderedSelectedQids].sort(compareDiscoveryQids)) !==
      canonicalJson(orderedSelectedQids) ||
    discoverySha256(orderedSelectedQids) !== record.orderedSelectedQidsSha256
  )
    throw new Error('Canonical selected QID sequence changed.')
  const audienceAnchorQids = parseQids(
    record.audienceAnchorQids,
    'Audience anchor QIDs',
  )
  const coverageWitnessQids = parseQids(
    record.coverageWitnessQids,
    'Coverage witness QIDs',
  )
  if (!Array.isArray(record.reasonCodes))
    throw new Error('Canonical reason codes must be an array.')
  const reasonCodes = record.reasonCodes.map((input) => {
    const reason = strictRecord(
      input,
      ['qid', 'reasons'],
      'Canonical reason evidence',
    )
    assertSuccessorQid(reason.qid)
    if (
      !Array.isArray(reason.reasons) ||
      reason.reasons.some(
        (value) =>
          typeof value !== 'string' ||
          !successorDiscoveryReasonOrder.includes(
            value as SuccessorDiscoveryReason,
          ),
      )
    )
      throw new Error('Canonical reason evidence contains an invalid reason.')
    const reasons = successorDiscoveryReasonOrder.filter((value) =>
      (reason.reasons as string[]).includes(value),
    )
    if (canonicalJson(reasons) !== canonicalJson(reason.reasons))
      throw new Error('Canonical reason evidence must be unique and ordered.')
    return { qid: reason.qid, reasons }
  })
  if (
    canonicalJson(reasonCodes.map(({ qid }) => qid)) !==
    canonicalJson(orderedSelectedQids)
  )
    throw new Error('Canonical reasons must cover every selected QID once.')
  if (
    typeof record.primaryCost !== 'string' ||
    !/^(0|[1-9][0-9]*)$/.test(record.primaryCost) ||
    typeof record.tierWeight !== 'string' ||
    !/^(0|[1-9][0-9]*)$/.test(record.tierWeight) ||
    !Number.isSafeInteger(record.witnessPartitionsSolved) ||
    (record.witnessPartitionsSolved as number) < 1
  )
    throw new Error('Canonical selection solver evidence is invalid.')
  const { evidenceSha256, ...core } = record
  if (discoverySha256(core) !== evidenceSha256)
    throw new Error('Canonical selection evidence hash does not match.')
  return {
    ...core,
    orderedSelectedQids,
    audienceAnchorQids,
    coverageWitnessQids,
    reasonCodes,
    evidenceSha256,
  } as unknown as CanonicalSelectionEvidence
}

export function canonicalSelectionEvidence(
  result: CanonicalSelectionResult,
  finalizedContinuitySha256: string,
): CanonicalSelectionEvidence {
  if (!successorSha256Pattern.test(finalizedContinuitySha256)) {
    throw new Error('Finalized continuity hash must be SHA-256.')
  }
  const orderedSelectedQids = result.selected.map(({ qid }) => qid)
  const core = {
    schema: 'zedarchive.anime-v2-canonical-selection-evidence' as const,
    version: 1 as const,
    candidateReceiptSha256:
      'fa126f87e53ef4babfec7f0a5924c153e84aa03a638052157656537e71002c59' as const,
    selectionRubricSha256: selectionRubricV2Sha256,
    finalizedContinuitySha256,
    orderedSelectedQids,
    orderedSelectedQidsSha256: discoverySha256(orderedSelectedQids),
    audienceAnchorQids: result.audienceAnchors.map(({ qid }) => qid),
    coverageWitnessQids: result.coverageWitness.map(({ qid }) => qid),
    reasonCodes: result.selected.map(({ qid }) => ({
      qid,
      reasons: result.reasonCodes.get(qid)!,
    })),
    primaryCost: result.primaryCost.toString(),
    tierWeight: result.tierWeight.toString(),
    witnessPartitionsSolved: result.witnessPartitionsSolved,
  }
  return { ...core, evidenceSha256: discoverySha256(core) }
}

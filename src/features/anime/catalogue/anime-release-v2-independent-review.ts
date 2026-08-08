import { animeCatalogueStateSchema } from '@/features/anime/catalogue/anime-catalogue-state'
import {
  adultPublicationSignalTokens,
  titleSourceTokens,
} from '@/features/anime/catalogue/anime-successor-predecessor-review'
import { deriveIndependentSampleSeed } from '@/features/anime/catalogue/anime-release-v2-lineage'
import {
  independentReviewSamplingCoreSize,
  prepareIndependentReviewSamplingCore,
} from '@/features/anime/catalogue/anime-release-v2-independent-review-sampling-core'
import {
  successorDiscoveryReasonOrder,
  type SelectionEra,
  type SuccessorDiscoveryReason,
} from '@/features/anime/catalogue/anime-release-v2-selection'
import {
  animeFormatSchema,
  animeMaturitySchema,
  animeReleaseStatusSchema,
  animeTitlesSchema,
  type AnimeFormat,
  type AnimeTitles,
} from '@/features/anime/domain/anime-catalogue-item'
import {
  canonicalJson,
  compareDiscoveryQids,
  discoveryCoverageFloors,
  discoverySha256,
  type DiscoveryFormat,
} from '@/features/anime/catalogue/wikidata-anime-discovery'

const sha256Pattern = /^[a-f0-9]{64}$/
const qidPattern = /^Q[1-9][0-9]*$/
const uuidV4Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export const independentReviewSeedAuthoritySchema =
  'zedarchive.anime-v2-independent-sample-seed-authority' as const
export const independentReviewProposalSchema =
  'zedarchive.anime-v2-independent-review-proposal' as const
export const independentReviewPopulationAuthoritySchema =
  'zedarchive.anime-v2-independent-review-population-authority' as const

export const independentReviewRiskReasonOrder = [
  'predecessor-change',
  'override',
  'non-published-state',
  'non-unknown-maturity',
  'adult-safety-signal',
  'missing-english',
  'original-only-title',
  'ova-format',
  'ona-format',
  'special-format',
  'upcoming',
  'source-flag',
  'identity-flag',
  'edition-flag',
  'season-flag',
  'relationship-flag',
  'fuzzy-duplicate-flag',
  'franchise-continuity-addition',
  'coverage-floor-selection',
] as const
export type IndependentReviewRiskReason =
  (typeof independentReviewRiskReasonOrder)[number]

export const independentReviewCorrectionCategoryOrder = [
  'romaji_title_missing',
  'format_identity_correction',
  'release_year_identity_correction',
  'episode_scope_correction',
  'release_status_correction',
  'maturity_curation',
  'alternative_title_exclusion',
  'english_title_correction',
  'romaji_title_correction',
  'catalogue_state_title_usability_hide',
  'catalogue_state_adult_publication_hide',
  'catalogue_state_identity_scope_hide',
] as const
export type IndependentReviewCorrectionCategory =
  (typeof independentReviewCorrectionCategoryOrder)[number]
export const independentReviewCorrectionDispositions = [
  'unchanged-non-published',
  'catalogue_state_title_usability_hide',
  'catalogue_state_adult_publication_hide',
  'catalogue_state_identity_scope_hide',
] as const
export type IndependentReviewCorrectionDisposition =
  (typeof independentReviewCorrectionDispositions)[number]

export type IndependentReviewRiskTriggers = Readonly<{
  predecessorChanged: boolean
  overrideApplied: boolean
  publicationState: 'published' | 'draft' | 'hidden'
  maturity: 'unknown' | 'general' | 'mature'
  adultSafetySignal: boolean
  englishTitlePresent: boolean
  titleProjection: 'english' | 'original-only' | 'other'
  format: DiscoveryFormat
  upcoming: boolean
  sourceFlag: boolean
  identityFlag: boolean
  editionFlag: boolean
  seasonFlag: boolean
  relationshipFlag: boolean
  fuzzyDuplicateFlag: boolean
  franchiseContinuityAddition: boolean
  coverageFloorSelection: boolean
}>

export type IndependentReviewAcquisitionCohort =
  'predecessor-v1' | `${number}${number}${number}`
export type IndependentReviewSelectionCohort = Readonly<{
  discoveryReasons: readonly SuccessorDiscoveryReason[]
  format: DiscoveryFormat
  eraBucket: SelectionEra
}>

type ProposedItem = Readonly<{
  catalogueState: 'draft' | 'published' | 'hidden'
  titles: AnimeTitles
  format: AnimeFormat
  releaseYear: number | null
  episodeCount: number | null
  releaseStatus: 'upcoming' | 'airing' | 'finished' | 'unknown'
  maturity: 'safe' | 'sensitive' | 'adult' | 'unknown'
  adultPublicationOutcome: 'cleared' | 'hidden' | 'excluded'
}>

type ReducedClaim = Readonly<{
  rank: 'preferred' | 'normal'
  value:
    | string
    | Readonly<{ language: string; text: string }>
    | Readonly<{ time: string; precision: number; calendarmodel: string }>
    | Readonly<{ amount: string; unit: string }>
}>
type ReducedClaims = Readonly<
  Record<ReducedClaimProperty, readonly ReducedClaim[]>
>
type ReducedClaimProperty =
  | 'P31'
  | 'P136'
  | 'P1476'
  | 'P577'
  | 'P580'
  | 'P582'
  | 'P1113'
  | 'P155'
  | 'P156'

type SourceProjection = Readonly<{
  revision: number | null
  titleCandidates: readonly Readonly<{
    source: (typeof titleSourceTokens)[number]
    value: string
    valueSha256: string
  }>[]
  releaseYear: number | null
  releaseYearSource: 'P577' | 'P580' | 'unavailable'
  episodeCount: number | null
  episodeCountEvidence: 'single-valid' | 'absent' | 'ambiguous'
  claims: ReducedClaims
}>

type ProjectionCore = Readonly<{
  canonicalUuid: string
  qid: string
  proposedItem: ProposedItem
  sourceProjection: SourceProjection
  adultSignals: readonly (typeof adultPublicationSignalTokens)[number][]
  directContinuityQids: readonly string[]
  machineReviewRequired: boolean
  machineReviewComplete: boolean
  primaryReviewRequired: boolean
  primaryReviewComplete: boolean
  proposalRecordSha256: string
  identityReviewSha256: string
  identityAllocationSha256: string
}>

export type IndependentReviewRecordProjectionV1 =
  | (ProjectionCore &
      Readonly<{
        kind: 'new-candidate'
        candidateSha256: string
        manifestSha256: string
        acquisitionOutcomeSha256: string
        candidateProjectionSha256: string
        candidateReviewAuthoritySha256: string
        projectionSha256: string
      }>)
  | (ProjectionCore &
      Readonly<{
        kind: 'predecessor'
        predecessorNormalizedItemSha256: string
        proposedNormalizedItemSha256: string
        predecessorProjectionSha256: string
        predecessorReviewResultSha256: string
        correctionDisposition: IndependentReviewCorrectionDisposition
        correctionCommitments: readonly Readonly<{
          category: IndependentReviewCorrectionCategory
          predecessorNormalizedItemSha256: string
          proposedNormalizedItemSha256: string
        }>[]
        projectionSha256: string
      }>)

export type IndependentReviewSeedAuthority = Readonly<{
  schema: typeof independentReviewSeedAuthoritySchema
  version: 1
  candidateReceiptSha256: string
  predecessorCorpusSha256: string
  orderedProposedPublishedQidSequenceSha256: string
  originalSeed: string
  seedAuthoritySha256: string
}>

export type IndependentReviewProposal = Readonly<{
  schema: typeof independentReviewProposalSchema
  version: 1
  candidateAuthoritySha256: string
  candidateReceiptSha256: string
  predecessorResultSha256: string
  predecessorCorpusSha256: string
  canonicalSelectionEvidenceSha256: string
  orderedProposedPublishedQids: readonly string[]
  orderedProposedPublishedQidSequenceSha256: string
  proposalSha256: string
}>

export type IndependentReviewPopulationRecord = Readonly<{
  canonicalUuid: string
  qid: string
  recordCommitment: string
  proposalRecordSha256: string
  identityReviewSha256: string
  identityAllocationSha256: string
  primaryReviewEvidenceSha256: string
  primaryReviewRequired: boolean
  primaryReviewComplete: boolean
  acquisitionCohort: IndependentReviewAcquisitionCohort
  selectionCohort: IndependentReviewSelectionCohort
  riskTriggers: IndependentReviewRiskTriggers
  mandatoryRiskReasons: readonly IndependentReviewRiskReason[]
  projection: IndependentReviewRecordProjectionV1
}>

export type IndependentReviewPopulationAuthority = Readonly<{
  schema: typeof independentReviewPopulationAuthoritySchema
  version: 1
  candidateAuthoritySha256: string
  candidateReceiptSha256: string
  predecessorCorpusSha256: string
  proposalSha256: string
  orderedProposedPublishedQidSequenceSha256: string
  seedAuthoritySha256: string
  records: readonly IndependentReviewPopulationRecord[]
  populationSha256: string
}>

export type IndependentReviewStratumAllocation = Readonly<{
  key: string
  population: number
  minimumAllocation: number
  hamiltonAllocation: number
  allocation: number
}>

export type IndependentReviewSample = Readonly<{
  seedAuthoritySha256: string
  populationSha256: string
  proposalSha256: string
  round: 'initial'
  roundSeed: string
  lowRiskPopulation: readonly IndependentReviewPopulationRecord[]
  sampleSize: number
  allocations: readonly IndependentReviewStratumAllocation[]
  sampled: readonly IndependentReviewPopulationRecord[]
  sampledCanonicalUuids: readonly string[]
  sampledCanonicalUuidsSha256: string
  selectedRecordCommitments: readonly string[]
  sampleSha256: string
}>

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

if (
  canonicalJson(eras.slice(0, 6)) !==
  canonicalJson(Object.keys(discoveryCoverageFloors.eras))
) {
  throw new Error(
    'Independent-review era authority has drifted from discovery coverage floors.',
  )
}
const triggerKeys = [
  'predecessorChanged',
  'overrideApplied',
  'publicationState',
  'maturity',
  'adultSafetySignal',
  'englishTitlePresent',
  'titleProjection',
  'format',
  'upcoming',
  'sourceFlag',
  'identityFlag',
  'editionFlag',
  'seasonFlag',
  'relationshipFlag',
  'fuzzyDuplicateFlag',
  'franchiseContinuityAddition',
  'coverageFloorSelection',
] as const
const reducedClaimProperties = [
  'P31',
  'P136',
  'P1476',
  'P577',
  'P580',
  'P582',
  'P1113',
  'P155',
  'P156',
] as const satisfies readonly ReducedClaimProperty[]

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
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    throw new Error(`${description} contains missing or unknown fields.`)
  return input as Record<string, unknown>
}

function assertSha256(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !sha256Pattern.test(value))
    throw new Error(`${label} must be a lowercase SHA-256 digest.`)
}

function assertQid(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !qidPattern.test(value))
    throw new Error(`${label} must be a canonical QID.`)
}

function assertUuid(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !uuidV4Pattern.test(value))
    throw new Error(`${label} must be a canonical lowercase UUID v4.`)
}

function assertBoolean(
  value: unknown,
  label: string,
): asserts value is boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be boolean.`)
}

function assertBoundedTitle(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== 'string' || value.trim() !== value)
    throw new Error(`${label} must be a trimmed title string.`)
  const codePoints = [...value].length
  if (
    codePoints < 1 ||
    codePoints > 512 ||
    Buffer.byteLength(value, 'utf8') > 2048
  )
    throw new Error(`${label} exceeds the independent-review title bounds.`)
}

function assertFormat(value: unknown): asserts value is DiscoveryFormat {
  if (!formats.includes(value as DiscoveryFormat))
    throw new Error(
      'Independent-review format must be a closed discovery format.',
    )
}

function assertEra(value: unknown): asserts value is SelectionEra {
  if (!eras.includes(value as SelectionEra))
    throw new Error(
      'Independent-review era bucket must be a closed selection era.',
    )
}

function assertCanonicalReasons(
  reasons: unknown,
  order: readonly string[],
  label: string,
  requireNonEmpty = false,
): asserts reasons is readonly string[] {
  if (!Array.isArray(reasons) || (requireNonEmpty && reasons.length === 0))
    throw new Error(
      `${label} must be a${requireNonEmpty ? ' non-empty' : 'n'} array.`,
    )
  let previous = -1
  const seen = new Set<string>()
  for (const reason of reasons) {
    if (typeof reason !== 'string' || !order.includes(reason))
      throw new Error(`${label} contains an unknown reason.`)
    if (seen.has(reason))
      throw new Error(`${label} must not contain duplicates.`)
    seen.add(reason)
    const position = order.indexOf(reason)
    if (position <= previous)
      throw new Error(`${label} must use canonical reason order.`)
    previous = position
  }
}

export function deriveIndependentReviewRiskReasons(
  triggers: IndependentReviewRiskTriggers,
): readonly IndependentReviewRiskReason[] {
  const record = strictObject(
    triggers,
    triggerKeys,
    'Independent-review risk triggers',
  )
  for (const key of triggerKeys) {
    if (
      ['publicationState', 'maturity', 'titleProjection', 'format'].includes(
        key,
      )
    )
      continue
    assertBoolean(record[key], `Risk trigger ${key}`)
  }
  if (
    !['published', 'draft', 'hidden'].includes(
      record.publicationState as string,
    )
  )
    throw new Error('Risk trigger publicationState is invalid.')
  if (!['unknown', 'general', 'mature'].includes(record.maturity as string))
    throw new Error('Risk trigger maturity is invalid.')
  if (
    !['english', 'original-only', 'other'].includes(
      record.titleProjection as string,
    )
  )
    throw new Error('Risk trigger titleProjection is invalid.')
  assertFormat(record.format)
  const values = record as unknown as IndependentReviewRiskTriggers
  const enabled: Record<IndependentReviewRiskReason, boolean> = {
    'predecessor-change': values.predecessorChanged,
    override: values.overrideApplied,
    'non-published-state': values.publicationState !== 'published',
    'non-unknown-maturity': values.maturity !== 'unknown',
    'adult-safety-signal': values.adultSafetySignal,
    'missing-english': !values.englishTitlePresent,
    'original-only-title': values.titleProjection === 'original-only',
    'ova-format': values.format === 'ova',
    'ona-format': values.format === 'ona',
    'special-format': values.format === 'special',
    upcoming: values.upcoming,
    'source-flag': values.sourceFlag,
    'identity-flag': values.identityFlag,
    'edition-flag': values.editionFlag,
    'season-flag': values.seasonFlag,
    'relationship-flag': values.relationshipFlag,
    'fuzzy-duplicate-flag': values.fuzzyDuplicateFlag,
    'franchise-continuity-addition': values.franchiseContinuityAddition,
    'coverage-floor-selection': values.coverageFloorSelection,
  }
  return independentReviewRiskReasonOrder.filter((reason) => enabled[reason])
}

export function validateIndependentReviewCohorts(
  input: Pick<
    IndependentReviewPopulationRecord,
    'acquisitionCohort' | 'selectionCohort' | 'riskTriggers'
  >,
): void {
  if (
    input.acquisitionCohort !== 'predecessor-v1' &&
    !/^(0(?:0[1-9]|[1-9][0-9])|1(?:[0-5][0-9]|60))$/.test(
      input.acquisitionCohort,
    )
  )
    throw new Error(
      'Independent-review acquisition cohort must be predecessor-v1 or manifest 001–160.',
    )
  const cohort = strictObject(
    input.selectionCohort,
    ['discoveryReasons', 'format', 'eraBucket'],
    'Independent-review selection cohort',
  )
  assertCanonicalReasons(
    cohort.discoveryReasons,
    successorDiscoveryReasonOrder,
    'Independent-review discovery reasons',
    true,
  )
  assertFormat(cohort.format)
  assertEra(cohort.eraBucket)
  if (cohort.format !== input.riskTriggers.format)
    throw new Error(
      'Independent-review selection cohort format must match risk triggers.',
    )
}

export function createIndependentReviewSeedAuthority(
  input: Readonly<{
    candidateReceiptSha256: string
    predecessorCorpusSha256: string
    orderedProposedPublishedQidSequenceSha256: string
  }>,
): IndependentReviewSeedAuthority {
  for (const [key, value] of Object.entries(input)) assertSha256(value, key)
  const originalSeed = deriveIndependentSampleSeed({
    canonicalCandidateReceiptSha256: input.candidateReceiptSha256,
    predecessorCorpusSha256: input.predecessorCorpusSha256,
    orderedProposedPublishedQidSequenceSha256:
      input.orderedProposedPublishedQidSequenceSha256,
  })
  const core = {
    schema: independentReviewSeedAuthoritySchema,
    version: 1 as const,
    ...input,
    originalSeed,
  }
  return { ...core, seedAuthoritySha256: discoverySha256(core) }
}

export function parseIndependentReviewSeedAuthority(
  input: unknown,
): IndependentReviewSeedAuthority {
  const record = strictObject(
    input,
    [
      'schema',
      'version',
      'candidateReceiptSha256',
      'predecessorCorpusSha256',
      'orderedProposedPublishedQidSequenceSha256',
      'originalSeed',
      'seedAuthoritySha256',
    ],
    'Independent-review seed authority',
  )
  if (
    record.schema !== independentReviewSeedAuthoritySchema ||
    record.version !== 1
  )
    throw new Error('Independent-review seed authority schema is unsupported.')
  for (const field of [
    'candidateReceiptSha256',
    'predecessorCorpusSha256',
    'orderedProposedPublishedQidSequenceSha256',
    'originalSeed',
    'seedAuthoritySha256',
  ] as const)
    assertSha256(record[field], `Independent-review ${field}`)
  const expected = createIndependentReviewSeedAuthority({
    candidateReceiptSha256: record.candidateReceiptSha256 as string,
    predecessorCorpusSha256: record.predecessorCorpusSha256 as string,
    orderedProposedPublishedQidSequenceSha256:
      record.orderedProposedPublishedQidSequenceSha256 as string,
  })
  if (
    record.originalSeed !== expected.originalSeed ||
    record.seedAuthoritySha256 !== expected.seedAuthoritySha256
  )
    throw new Error(
      'Independent-review seed authority hash or derived seed does not match.',
    )
  return expected
}

function parseOrderedProposalQids(input: unknown): readonly string[] {
  if (!Array.isArray(input) || input.length !== 5_000)
    throw new Error(
      'Independent-review proposal requires exactly 5,000 published QIDs.',
    )
  input.forEach((qid) => assertQid(qid, 'Independent-review proposed QID'))
  if (
    new Set(input).size !== input.length ||
    canonicalJson([...input].sort(compareDiscoveryQids)) !==
      canonicalJson(input)
  )
    throw new Error(
      'Independent-review proposed QIDs must be unique and ascending numeric-QID ordered.',
    )
  return input as readonly string[]
}

export function createIndependentReviewProposal(
  input: Omit<
    IndependentReviewProposal,
    | 'schema'
    | 'version'
    | 'orderedProposedPublishedQidSequenceSha256'
    | 'proposalSha256'
  >,
): IndependentReviewProposal {
  const qids = parseOrderedProposalQids(input.orderedProposedPublishedQids)
  for (const value of [
    input.candidateAuthoritySha256,
    input.candidateReceiptSha256,
    input.predecessorResultSha256,
    input.predecessorCorpusSha256,
    input.canonicalSelectionEvidenceSha256,
  ])
    assertSha256(value, 'Independent-review proposal authority')
  const orderedProposedPublishedQidSequenceSha256 = discoverySha256(qids)
  const core = {
    schema: independentReviewProposalSchema,
    version: 1 as const,
    candidateAuthoritySha256: input.candidateAuthoritySha256,
    candidateReceiptSha256: input.candidateReceiptSha256,
    predecessorResultSha256: input.predecessorResultSha256,
    predecessorCorpusSha256: input.predecessorCorpusSha256,
    canonicalSelectionEvidenceSha256: input.canonicalSelectionEvidenceSha256,
    orderedProposedPublishedQids: qids,
    orderedProposedPublishedQidSequenceSha256,
  }
  return { ...core, proposalSha256: discoverySha256(core) }
}

export function parseIndependentReviewProposal(
  input: unknown,
): IndependentReviewProposal {
  const record = strictObject(
    input,
    [
      'schema',
      'version',
      'candidateAuthoritySha256',
      'candidateReceiptSha256',
      'predecessorResultSha256',
      'predecessorCorpusSha256',
      'canonicalSelectionEvidenceSha256',
      'orderedProposedPublishedQids',
      'orderedProposedPublishedQidSequenceSha256',
      'proposalSha256',
    ],
    'Independent-review proposal',
  )
  if (record.schema !== independentReviewProposalSchema || record.version !== 1)
    throw new Error('Independent-review proposal schema is unsupported.')
  const proposal = createIndependentReviewProposal({
    candidateAuthoritySha256: record.candidateAuthoritySha256 as string,
    candidateReceiptSha256: record.candidateReceiptSha256 as string,
    predecessorResultSha256: record.predecessorResultSha256 as string,
    predecessorCorpusSha256: record.predecessorCorpusSha256 as string,
    canonicalSelectionEvidenceSha256:
      record.canonicalSelectionEvidenceSha256 as string,
    orderedProposedPublishedQids: parseOrderedProposalQids(
      record.orderedProposedPublishedQids,
    ),
  })
  if (
    record.orderedProposedPublishedQidSequenceSha256 !==
      proposal.orderedProposedPublishedQidSequenceSha256 ||
    record.proposalSha256 !== proposal.proposalSha256
  )
    throw new Error('Independent-review proposal commitment does not match.')
  return proposal
}

export function independentReviewProposalRecordSha256(
  input: Readonly<{
    proposalSha256: string
    canonicalUuid: string
    qid: string
  }>,
): string {
  assertSha256(input.proposalSha256, 'Independent-review proposal hash')
  assertUuid(input.canonicalUuid, 'Independent-review proposal record UUID')
  assertQid(input.qid, 'Independent-review proposal record QID')
  return discoverySha256({
    schema: 'independent-review-proposal-record.v1',
    ...input,
  })
}

function parseProposedItem(input: unknown): ProposedItem {
  const value = strictObject(
    input,
    [
      'catalogueState',
      'titles',
      'format',
      'releaseYear',
      'episodeCount',
      'releaseStatus',
      'maturity',
      'adultPublicationOutcome',
    ],
    'Independent-review proposed item',
  )
  const rawTitles = strictObject(
    value.titles,
    ['english', 'romaji', 'original', 'alternatives'],
    'Independent-review proposed titles',
  )
  for (const key of ['english', 'romaji', 'original'] as const)
    if (rawTitles[key] !== null)
      assertBoundedTitle(
        rawTitles[key],
        `Independent-review proposed ${key} title`,
      )
  if (!Array.isArray(rawTitles.alternatives))
    throw new Error(
      'Independent-review proposed alternatives must be an array.',
    )
  rawTitles.alternatives.forEach((title) =>
    assertBoundedTitle(title, 'Independent-review proposed alternative title'),
  )
  const titles = animeTitlesSchema.parse(value.titles)
  const alternatives = titles.alternatives
  if (
    alternatives.length > 32 ||
    canonicalJson([...alternatives].sort(compareAscii)) !==
      canonicalJson(alternatives)
  )
    throw new Error(
      'Independent-review proposed alternatives must be capped and ASCII/code-unit ordered.',
    )
  const catalogueState = animeCatalogueStateSchema.parse(value.catalogueState)
  const format = animeFormatSchema.parse(value.format)
  const releaseStatus = animeReleaseStatusSchema.parse(value.releaseStatus)
  const maturity = animeMaturitySchema.parse(value.maturity)
  const releaseYear = value.releaseYear as unknown
  const episodeCount = value.episodeCount as unknown
  if (
    releaseYear !== null &&
    (!Number.isInteger(releaseYear) ||
      (releaseYear as number) < 1 ||
      (releaseYear as number) > 9999)
  )
    throw new Error('Independent-review release year is invalid.')
  if (
    episodeCount !== null &&
    (!Number.isInteger(episodeCount) || (episodeCount as number) < 1)
  )
    throw new Error('Independent-review episode count is invalid.')
  if (
    !['cleared', 'hidden', 'excluded'].includes(
      value.adultPublicationOutcome as string,
    )
  )
    throw new Error('Independent-review adult publication outcome is invalid.')
  return {
    catalogueState,
    titles,
    format,
    releaseYear: releaseYear as number | null,
    episodeCount: episodeCount as number | null,
    releaseStatus,
    maturity,
    adultPublicationOutcome:
      value.adultPublicationOutcome as ProposedItem['adultPublicationOutcome'],
  }
}

function parseReducedClaim(
  property: ReducedClaimProperty,
  input: unknown,
): ReducedClaim {
  const record = strictObject(
    input,
    ['rank', 'value'],
    `Independent-review ${property} claim`,
  )
  if (record.rank !== 'preferred' && record.rank !== 'normal')
    throw new Error('Independent-review claim rank is invalid.')
  const itemProperty = ['P31', 'P136', 'P155', 'P156'].includes(property)
  if (itemProperty)
    assertQid(record.value, `Independent-review ${property} claim value`)
  else if (property === 'P1476') {
    const value = strictObject(
      record.value,
      ['language', 'text'],
      'Independent-review P1476 claim value',
    )
    if (
      typeof value.language !== 'string' ||
      value.language.trim() !== value.language ||
      value.language.length === 0 ||
      value.language.length > 64
    )
      throw new Error('Independent-review P1476 language is invalid.')
    assertBoundedTitle(value.text, 'Independent-review P1476 text')
  } else if (['P577', 'P580', 'P582'].includes(property)) {
    const value = strictObject(
      record.value,
      ['time', 'precision', 'calendarmodel'],
      'Independent-review time claim value',
    )
    if (
      typeof value.time !== 'string' ||
      value.time.length === 0 ||
      !Number.isSafeInteger(value.precision) ||
      typeof value.calendarmodel !== 'string' ||
      value.calendarmodel.length === 0
    )
      throw new Error('Independent-review time claim value is invalid.')
  } else {
    const value = strictObject(
      record.value,
      ['amount', 'unit'],
      'Independent-review quantity claim value',
    )
    if (
      typeof value.amount !== 'string' ||
      value.amount.length === 0 ||
      typeof value.unit !== 'string' ||
      value.unit.length === 0
    )
      throw new Error('Independent-review quantity claim value is invalid.')
  }
  return { rank: record.rank, value: record.value as ReducedClaim['value'] }
}

function parseReducedClaims(input: unknown): ReducedClaims {
  const record = strictObject(
    input,
    reducedClaimProperties,
    'Independent-review reduced claims',
  )
  return Object.fromEntries(
    reducedClaimProperties.map((property) => {
      const claims = record[property]
      if (!Array.isArray(claims) || claims.length > 32)
        throw new Error(`Independent-review ${property} claims exceed the cap.`)
      const parsed = claims.map((claim) => parseReducedClaim(property, claim))
      const values = parsed.map((claim) => canonicalJson(claim.value))
      if (
        new Set(values).size !== values.length ||
        canonicalJson([...values].sort(compareAscii)) !== canonicalJson(values)
      )
        throw new Error(
          `Independent-review ${property} claims must be unique and canonical-JSON ordered.`,
        )
      return [property, parsed]
    }),
  ) as unknown as ReducedClaims
}

function parseSourceProjection(input: unknown): SourceProjection {
  const value = strictObject(
    input,
    [
      'revision',
      'titleCandidates',
      'releaseYear',
      'releaseYearSource',
      'episodeCount',
      'episodeCountEvidence',
      'claims',
    ],
    'Independent-review source projection',
  )
  const revision = value.revision as unknown
  const releaseYear = value.releaseYear as unknown
  const episodeCount = value.episodeCount as unknown
  if (
    revision !== null &&
    (!Number.isSafeInteger(revision) || (revision as number) < 0)
  )
    throw new Error('Independent-review source revision is invalid.')
  if (
    !Array.isArray(value.titleCandidates) ||
    value.titleCandidates.length > 16
  )
    throw new Error(
      'Independent-review source title candidates exceed the cap.',
    )
  const titleCandidates = value.titleCandidates.map((candidate) => {
    const record = strictObject(
      candidate,
      ['source', 'value', 'valueSha256'],
      'Independent-review source title candidate',
    )
    if (!titleSourceTokens.includes(record.source as never))
      throw new Error('Independent-review source title token is invalid.')
    assertBoundedTitle(record.value, 'Independent-review source title')
    assertSha256(record.valueSha256, 'Independent-review source title hash')
    if (record.valueSha256 !== discoverySha256(record.value))
      throw new Error('Independent-review source title hash does not match.')
    return {
      source: record.source as (typeof titleSourceTokens)[number],
      value: record.value as string,
      valueSha256: record.valueSha256 as string,
    }
  })
  const titleKeys = titleCandidates.map(
    ({ source, valueSha256 }) => `${source}:${valueSha256}`,
  )
  if (
    new Set(titleKeys).size !== titleKeys.length ||
    canonicalJson([...titleKeys].sort(compareAscii)) !==
      canonicalJson(titleKeys)
  )
    throw new Error(
      'Independent-review source title candidates must be unique and canonical ordered.',
    )
  if (
    releaseYear !== null &&
    (!Number.isInteger(releaseYear) ||
      (releaseYear as number) < 1 ||
      (releaseYear as number) > 9999)
  )
    throw new Error('Independent-review source release year is invalid.')
  if (
    !['P577', 'P580', 'unavailable'].includes(
      value.releaseYearSource as string,
    ) ||
    (releaseYear === null) !== (value.releaseYearSource === 'unavailable')
  )
    throw new Error('Independent-review release-year source is inconsistent.')
  if (
    episodeCount !== null &&
    (!Number.isInteger(episodeCount) || (episodeCount as number) < 1)
  )
    throw new Error('Independent-review source episode count is invalid.')
  if (
    !['single-valid', 'absent', 'ambiguous'].includes(
      value.episodeCountEvidence as string,
    ) ||
    (episodeCount === null) !== (value.episodeCountEvidence !== 'single-valid')
  )
    throw new Error(
      'Independent-review episode-count evidence is inconsistent.',
    )
  return {
    revision: revision as number | null,
    titleCandidates,
    releaseYear: releaseYear as number | null,
    releaseYearSource:
      value.releaseYearSource as SourceProjection['releaseYearSource'],
    episodeCount: episodeCount as number | null,
    episodeCountEvidence:
      value.episodeCountEvidence as SourceProjection['episodeCountEvidence'],
    claims: parseReducedClaims(value.claims),
  }
}

function projectionCore(input: Record<string, unknown>): ProjectionCore {
  assertUuid(input.canonicalUuid, 'Independent-review projection UUID')
  assertQid(input.qid, 'Independent-review projection QID')
  if (!Array.isArray(input.adultSignals) || input.adultSignals.length > 7)
    throw new Error('Independent-review adult signals exceed the cap.')
  assertCanonicalReasons(
    input.adultSignals,
    adultPublicationSignalTokens,
    'Independent-review adult signals',
  )
  if (
    !Array.isArray(input.directContinuityQids) ||
    input.directContinuityQids.length > 8
  )
    throw new Error('Independent-review direct continuity QIDs exceed the cap.')
  input.directContinuityQids.forEach((qid) =>
    assertQid(qid, 'Independent-review direct continuity QID'),
  )
  if (
    new Set(input.directContinuityQids).size !==
      input.directContinuityQids.length ||
    canonicalJson(
      [...input.directContinuityQids].sort(compareDiscoveryQids),
    ) !== canonicalJson(input.directContinuityQids)
  )
    throw new Error(
      'Independent-review direct continuity QIDs must be unique and numeric-QID ordered.',
    )
  for (const key of [
    'machineReviewRequired',
    'machineReviewComplete',
    'primaryReviewRequired',
    'primaryReviewComplete',
  ] as const)
    assertBoolean(input[key], `Independent-review ${key}`)
  for (const key of [
    'proposalRecordSha256',
    'identityReviewSha256',
    'identityAllocationSha256',
  ] as const)
    assertSha256(input[key], `Independent-review ${key}`)
  return {
    canonicalUuid: input.canonicalUuid as string,
    qid: input.qid as string,
    proposedItem: parseProposedItem(input.proposedItem),
    sourceProjection: parseSourceProjection(input.sourceProjection),
    adultSignals: input.adultSignals as ProjectionCore['adultSignals'],
    directContinuityQids: input.directContinuityQids as readonly string[],
    machineReviewRequired: input.machineReviewRequired as boolean,
    machineReviewComplete: input.machineReviewComplete as boolean,
    primaryReviewRequired: input.primaryReviewRequired as boolean,
    primaryReviewComplete: input.primaryReviewComplete as boolean,
    proposalRecordSha256: input.proposalRecordSha256 as string,
    identityReviewSha256: input.identityReviewSha256 as string,
    identityAllocationSha256: input.identityAllocationSha256 as string,
  }
}

const projectionCoreKeys = [
  'kind',
  'canonicalUuid',
  'qid',
  'proposedItem',
  'sourceProjection',
  'adultSignals',
  'directContinuityQids',
  'machineReviewRequired',
  'machineReviewComplete',
  'primaryReviewRequired',
  'primaryReviewComplete',
  'proposalRecordSha256',
  'identityReviewSha256',
  'identityAllocationSha256',
  'projectionSha256',
] as const

export function parseIndependentReviewRecordProjection(
  input: unknown,
): IndependentReviewRecordProjectionV1 {
  if (input === null || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Independent-review projection must be an object.')
  const kind = (input as Record<string, unknown>).kind
  const extra =
    kind === 'new-candidate'
      ? [
          'candidateSha256',
          'manifestSha256',
          'acquisitionOutcomeSha256',
          'candidateProjectionSha256',
          'candidateReviewAuthoritySha256',
        ]
      : kind === 'predecessor'
        ? [
            'predecessorNormalizedItemSha256',
            'proposedNormalizedItemSha256',
            'predecessorProjectionSha256',
            'predecessorReviewResultSha256',
            'correctionDisposition',
            'correctionCommitments',
          ]
        : null
  if (extra === null)
    throw new Error('Independent-review projection kind is not closed.')
  const record = strictObject(
    input,
    [...projectionCoreKeys, ...extra],
    'Independent-review projection',
  )
  if (Buffer.byteLength(canonicalJson(record), 'utf8') > 64 * 1024)
    throw new Error(
      'Independent-review projection exceeds the 64 KiB serialized cap.',
    )
  const core = projectionCore(record)
  assertSha256(record.projectionSha256, 'Independent-review projection hash')
  if (kind === 'new-candidate') {
    if (
      core.sourceProjection.revision === null ||
      core.sourceProjection.revision < 1
    )
      throw new Error(
        'Independent-review new-candidate source revision must be positive.',
      )
    for (const key of extra)
      assertSha256(record[key], `Independent-review ${key}`)
    const projection = {
      kind: 'new-candidate' as const,
      ...core,
      candidateSha256: record.candidateSha256 as string,
      manifestSha256: record.manifestSha256 as string,
      acquisitionOutcomeSha256: record.acquisitionOutcomeSha256 as string,
      candidateProjectionSha256: record.candidateProjectionSha256 as string,
      candidateReviewAuthoritySha256:
        record.candidateReviewAuthoritySha256 as string,
    }
    if (record.projectionSha256 !== discoverySha256(projection))
      throw new Error('Independent-review projection hash does not match.')
    return {
      ...projection,
      projectionSha256: record.projectionSha256 as string,
    }
  }
  for (const key of [
    'predecessorNormalizedItemSha256',
    'proposedNormalizedItemSha256',
    'predecessorProjectionSha256',
    'predecessorReviewResultSha256',
  ] as const)
    assertSha256(record[key], `Independent-review ${key}`)
  if (
    !independentReviewCorrectionDispositions.includes(
      record.correctionDisposition as never,
    )
  )
    throw new Error('Independent-review correction disposition is invalid.')
  if (!Array.isArray(record.correctionCommitments))
    throw new Error(
      'Independent-review correction commitments must be an array.',
    )
  const correctionCommitments = record.correctionCommitments.map(
    (commitment) => {
      const value = strictObject(
        commitment,
        [
          'category',
          'predecessorNormalizedItemSha256',
          'proposedNormalizedItemSha256',
        ],
        'Independent-review correction commitment',
      )
      if (
        !independentReviewCorrectionCategoryOrder.includes(
          value.category as never,
        )
      )
        throw new Error('Independent-review correction category is invalid.')
      assertSha256(
        value.predecessorNormalizedItemSha256,
        'Independent-review correction predecessor hash',
      )
      assertSha256(
        value.proposedNormalizedItemSha256,
        'Independent-review correction proposed hash',
      )
      return {
        category: value.category as IndependentReviewCorrectionCategory,
        predecessorNormalizedItemSha256:
          value.predecessorNormalizedItemSha256 as string,
        proposedNormalizedItemSha256:
          value.proposedNormalizedItemSha256 as string,
      }
    },
  )
  const categories = correctionCommitments.map(({ category }) => category)
  assertCanonicalReasons(
    categories,
    independentReviewCorrectionCategoryOrder,
    'Independent-review correction commitments',
  )
  const projection = {
    kind: 'predecessor' as const,
    ...core,
    predecessorNormalizedItemSha256:
      record.predecessorNormalizedItemSha256 as string,
    proposedNormalizedItemSha256: record.proposedNormalizedItemSha256 as string,
    predecessorProjectionSha256: record.predecessorProjectionSha256 as string,
    predecessorReviewResultSha256:
      record.predecessorReviewResultSha256 as string,
    correctionDisposition:
      record.correctionDisposition as IndependentReviewCorrectionDisposition,
    correctionCommitments,
  }
  if (record.projectionSha256 !== discoverySha256(projection))
    throw new Error('Independent-review projection hash does not match.')
  return { ...projection, projectionSha256: record.projectionSha256 as string }
}

function recordCore(
  record: Omit<IndependentReviewPopulationRecord, 'recordCommitment'>,
) {
  return record
}

export function independentReviewRecordCommitment(
  record: Omit<IndependentReviewPopulationRecord, 'recordCommitment'>,
): string {
  return discoverySha256(recordCore(record))
}

function parsePopulationRecord(
  input: unknown,
  proposal: IndependentReviewProposal,
): IndependentReviewPopulationRecord {
  const record = strictObject(
    input,
    [
      'canonicalUuid',
      'qid',
      'recordCommitment',
      'proposalRecordSha256',
      'identityReviewSha256',
      'identityAllocationSha256',
      'primaryReviewEvidenceSha256',
      'primaryReviewRequired',
      'primaryReviewComplete',
      'acquisitionCohort',
      'selectionCohort',
      'riskTriggers',
      'mandatoryRiskReasons',
      'projection',
    ],
    'Independent-review population record',
  )
  assertUuid(record.canonicalUuid, 'Independent-review population UUID')
  assertQid(record.qid, 'Independent-review population QID')
  assertSha256(
    record.recordCommitment,
    'Independent-review population record commitment',
  )
  assertSha256(
    record.proposalRecordSha256,
    'Independent-review population proposal-record commitment',
  )
  assertSha256(
    record.identityReviewSha256,
    'Independent-review population identity review commitment',
  )
  assertSha256(
    record.identityAllocationSha256,
    'Independent-review population identity allocation commitment',
  )
  assertSha256(
    record.primaryReviewEvidenceSha256,
    'Independent-review primary review evidence commitment',
  )
  assertBoolean(
    record.primaryReviewRequired,
    'Independent-review primary review required',
  )
  assertBoolean(
    record.primaryReviewComplete,
    'Independent-review primary review complete',
  )
  const riskTriggers = strictObject(
    record.riskTriggers,
    triggerKeys,
    'Independent-review population risk triggers',
  ) as unknown as IndependentReviewRiskTriggers
  const candidateBase = {
    acquisitionCohort:
      record.acquisitionCohort as IndependentReviewAcquisitionCohort,
    selectionCohort: record.selectionCohort as IndependentReviewSelectionCohort,
    riskTriggers,
  }
  deriveIndependentReviewRiskReasons(riskTriggers)
  validateIndependentReviewCohorts(candidateBase)
  const mandatoryRiskReasons = record.mandatoryRiskReasons
  assertCanonicalReasons(
    mandatoryRiskReasons,
    independentReviewRiskReasonOrder,
    'Independent-review mandatory risk reasons',
  )
  const derived = deriveIndependentReviewRiskReasons(riskTriggers)
  if (canonicalJson(mandatoryRiskReasons) !== canonicalJson(derived))
    throw new Error(
      'Independent-review mandatory risk reasons do not match triggers.',
    )
  const projection = parseIndependentReviewRecordProjection(record.projection)
  if (
    (projection.kind === 'predecessor' &&
      candidateBase.acquisitionCohort !== 'predecessor-v1') ||
    (projection.kind === 'new-candidate' &&
      candidateBase.acquisitionCohort === 'predecessor-v1')
  )
    throw new Error(
      'Independent-review projection kind must match its acquisition cohort.',
    )
  if (
    projection.canonicalUuid !== record.canonicalUuid ||
    projection.qid !== record.qid ||
    projection.proposalRecordSha256 !== record.proposalRecordSha256 ||
    projection.identityReviewSha256 !== record.identityReviewSha256 ||
    projection.identityAllocationSha256 !== record.identityAllocationSha256 ||
    projection.primaryReviewRequired !== record.primaryReviewRequired ||
    projection.primaryReviewComplete !== record.primaryReviewComplete
  )
    throw new Error(
      'Independent-review projection does not match population record bindings.',
    )
  if (
    riskTriggers.publicationState !== projection.proposedItem.catalogueState ||
    riskTriggers.format !== projection.proposedItem.format
  )
    throw new Error(
      'Independent-review risk triggers must match projection publication state and format.',
    )
  const expectedProposalRecord = independentReviewProposalRecordSha256({
    proposalSha256: proposal.proposalSha256,
    canonicalUuid: record.canonicalUuid as string,
    qid: record.qid as string,
  })
  if (
    !proposal.orderedProposedPublishedQids.includes(record.qid as string) ||
    record.proposalRecordSha256 !== expectedProposalRecord
  )
    throw new Error(
      'Independent-review population record is outside its frozen proposal.',
    )
  const parsed: Omit<IndependentReviewPopulationRecord, 'recordCommitment'> = {
    canonicalUuid: record.canonicalUuid as string,
    qid: record.qid as string,
    proposalRecordSha256: record.proposalRecordSha256 as string,
    identityReviewSha256: record.identityReviewSha256 as string,
    identityAllocationSha256: record.identityAllocationSha256 as string,
    primaryReviewEvidenceSha256: record.primaryReviewEvidenceSha256 as string,
    primaryReviewRequired: record.primaryReviewRequired as boolean,
    primaryReviewComplete: record.primaryReviewComplete as boolean,
    acquisitionCohort:
      record.acquisitionCohort as IndependentReviewAcquisitionCohort,
    selectionCohort: candidateBase.selectionCohort,
    riskTriggers,
    mandatoryRiskReasons:
      mandatoryRiskReasons as readonly IndependentReviewRiskReason[],
    projection,
  }
  if (record.recordCommitment !== independentReviewRecordCommitment(parsed))
    throw new Error(
      'Independent-review population record commitment does not match.',
    )
  return { ...parsed, recordCommitment: record.recordCommitment as string }
}

export function createIndependentReviewPopulationAuthority(
  input: Omit<
    IndependentReviewPopulationAuthority,
    'schema' | 'version' | 'populationSha256'
  >,
  proposalInput: unknown,
  seedInput: unknown,
): IndependentReviewPopulationAuthority {
  const proposal = parseIndependentReviewProposal(proposalInput)
  const seed = parseIndependentReviewSeedAuthority(seedInput)
  if (
    input.candidateAuthoritySha256 !== proposal.candidateAuthoritySha256 ||
    input.candidateReceiptSha256 !== proposal.candidateReceiptSha256 ||
    input.predecessorCorpusSha256 !== proposal.predecessorCorpusSha256 ||
    input.proposalSha256 !== proposal.proposalSha256 ||
    input.orderedProposedPublishedQidSequenceSha256 !==
      proposal.orderedProposedPublishedQidSequenceSha256 ||
    input.seedAuthoritySha256 !== seed.seedAuthoritySha256 ||
    seed.candidateReceiptSha256 !== proposal.candidateReceiptSha256 ||
    seed.predecessorCorpusSha256 !== proposal.predecessorCorpusSha256 ||
    seed.orderedProposedPublishedQidSequenceSha256 !==
      proposal.orderedProposedPublishedQidSequenceSha256
  )
    throw new Error(
      'Independent-review population authority changed bound proposal or seed evidence.',
    )
  if (!Array.isArray(input.records) || input.records.length !== 5_000)
    throw new Error(
      'Independent-review population authority requires exactly 5,000 records.',
    )
  const records = input.records.map((record) =>
    parsePopulationRecord(record, proposal),
  )
  const qids = records.map(({ qid }) => qid)
  const uuids = records.map(({ canonicalUuid }) => canonicalUuid)
  const commitments = records.map(({ recordCommitment }) => recordCommitment)
  if (
    new Set(qids).size !== records.length ||
    new Set(uuids).size !== records.length ||
    new Set(commitments).size !== records.length ||
    canonicalJson([...uuids].sort(compareAscii)) !== canonicalJson(uuids)
  )
    throw new Error(
      'Independent-review population records must have unique QIDs, UUIDs, commitments, and UUID order.',
    )
  if (
    canonicalJson([...qids].sort(compareDiscoveryQids)) !==
    canonicalJson(
      [...proposal.orderedProposedPublishedQids].sort(compareDiscoveryQids),
    )
  )
    throw new Error(
      'Independent-review population records must cover the full frozen proposal.',
    )
  const core = {
    schema: independentReviewPopulationAuthoritySchema,
    version: 1 as const,
    candidateAuthoritySha256: input.candidateAuthoritySha256,
    candidateReceiptSha256: input.candidateReceiptSha256,
    predecessorCorpusSha256: input.predecessorCorpusSha256,
    proposalSha256: input.proposalSha256,
    orderedProposedPublishedQidSequenceSha256:
      input.orderedProposedPublishedQidSequenceSha256,
    seedAuthoritySha256: input.seedAuthoritySha256,
    records,
  }
  return { ...core, populationSha256: discoverySha256(core) }
}

export function parseIndependentReviewPopulationAuthority(
  input: unknown,
  proposalInput: unknown,
  seedInput: unknown,
): IndependentReviewPopulationAuthority {
  const record = strictObject(
    input,
    [
      'schema',
      'version',
      'candidateAuthoritySha256',
      'candidateReceiptSha256',
      'predecessorCorpusSha256',
      'proposalSha256',
      'orderedProposedPublishedQidSequenceSha256',
      'seedAuthoritySha256',
      'records',
      'populationSha256',
    ],
    'Independent-review population authority',
  )
  if (
    record.schema !== independentReviewPopulationAuthoritySchema ||
    record.version !== 1
  )
    throw new Error(
      'Independent-review population authority schema is unsupported.',
    )
  assertSha256(record.populationSha256, 'Independent-review population hash')
  const population = createIndependentReviewPopulationAuthority(
    {
      candidateAuthoritySha256: record.candidateAuthoritySha256 as string,
      candidateReceiptSha256: record.candidateReceiptSha256 as string,
      predecessorCorpusSha256: record.predecessorCorpusSha256 as string,
      proposalSha256: record.proposalSha256 as string,
      orderedProposedPublishedQidSequenceSha256:
        record.orderedProposedPublishedQidSequenceSha256 as string,
      seedAuthoritySha256: record.seedAuthoritySha256 as string,
      records: record.records as readonly IndependentReviewPopulationRecord[],
    },
    proposalInput,
    seedInput,
  )
  if (record.populationSha256 !== population.populationSha256)
    throw new Error('Independent-review population commitment does not match.')
  return population
}

export function independentReviewSampleSize(lowRiskPopulation: number): number {
  return independentReviewSamplingCoreSize(lowRiskPopulation)
}

/** Pure sampler: it only accepts self-hashed authority objects, never a raw seed or UUID exclusion list. */
export function prepareIndependentReviewSample(
  input: Readonly<{
    population: unknown
    proposal: unknown
    seedAuthority: unknown
    round: 'initial'
  }>,
): IndependentReviewSample {
  const seedAuthority = parseIndependentReviewSeedAuthority(input.seedAuthority)
  const proposal = parseIndependentReviewProposal(input.proposal)
  const population = parseIndependentReviewPopulationAuthority(
    input.population,
    proposal,
    seedAuthority,
  )
  if (input.round !== 'initial')
    throw new Error(
      'Independent-review foundation permits only the initial sample round.',
    )
  const roundSeed = seedAuthority.originalSeed
  const lowRiskPopulation = population.records.filter(
    (candidate) =>
      candidate.primaryReviewRequired &&
      candidate.primaryReviewComplete &&
      candidate.projection.machineReviewRequired &&
      candidate.projection.machineReviewComplete &&
      candidate.mandatoryRiskReasons.length === 0,
  )
  const { sampleSize, allocations, sampled } =
    prepareIndependentReviewSamplingCore({
      candidates: lowRiskPopulation,
      roundSeed,
    })
  const sampledCanonicalUuids = sampled.map(
    ({ canonicalUuid }) => canonicalUuid,
  )
  const sampledCanonicalUuidsSha256 = discoverySha256(sampledCanonicalUuids)
  const selectedRecordCommitments = sampled
    .map(({ recordCommitment }) => recordCommitment)
    .sort(compareAscii)
  const sampleCore = {
    schema: 'zedarchive.anime-v2-independent-review-sample' as const,
    version: 1 as const,
    seedAuthoritySha256: seedAuthority.seedAuthoritySha256,
    populationSha256: population.populationSha256,
    proposalSha256: proposal.proposalSha256,
    round: 'initial' as const,
    roundSeed,
    allocations,
    sampledCanonicalUuids,
    sampledCanonicalUuidsSha256,
    selectedRecordCommitments,
  }
  return {
    seedAuthoritySha256: seedAuthority.seedAuthoritySha256,
    populationSha256: population.populationSha256,
    proposalSha256: proposal.proposalSha256,
    round: input.round,
    roundSeed,
    lowRiskPopulation,
    sampleSize,
    allocations,
    sampled,
    sampledCanonicalUuids,
    sampledCanonicalUuidsSha256,
    selectedRecordCommitments,
    sampleSha256: discoverySha256(sampleCore),
  }
}

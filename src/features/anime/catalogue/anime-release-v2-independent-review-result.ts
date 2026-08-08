import {
  prepareIndependentReviewSample,
  parseIndependentReviewRecordProjection,
  type IndependentReviewAcquisitionCohort,
  type IndependentReviewPopulationAuthority,
  type IndependentReviewPopulationRecord,
  type IndependentReviewProposal,
  type IndependentReviewRecordProjectionV1,
  type IndependentReviewSeedAuthority,
  type IndependentReviewSelectionCohort,
} from '@/features/anime/catalogue/anime-release-v2-independent-review'
import { deriveIndependentSampleRoundSeed } from '@/features/anime/catalogue/anime-release-v2-lineage'
import {
  parseIndependentReviewInitialAuthoritySnapshot,
  parseIndependentReviewSuccessorAuthoritySnapshot,
  parseIndependentReviewSuccessorAuthoritySnapshotForFixture,
  independentReviewDefectCategories,
  type IndependentReviewAuthoritySnapshot,
  type IndependentReviewDefectCategory,
  type IndependentReviewInitialAuthoritySnapshot,
  type IndependentReviewSuccessorAuthoritySnapshot,
} from '@/features/anime/catalogue/anime-release-v2-independent-review-successor-authority'
import {
  canonicalJson,
  compareDiscoveryQids,
  discoverySha256,
} from '@/features/anime/catalogue/wikidata-anime-discovery'
import { prepareIndependentReviewSamplingCore } from '@/features/anime/catalogue/anime-release-v2-independent-review-sampling-core'

const sha256Pattern = /^[a-f0-9]{64}$/
const uuidV4Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export { independentReviewDefectCategories }
export type { IndependentReviewDefectCategory }

export const independentReviewPlanKinds = [
  'mandatory-review',
  'original-sample',
  'fresh-sample',
  'expanded-cohort',
] as const
export type IndependentReviewPlanKind =
  (typeof independentReviewPlanKinds)[number]

export const independentReviewPlanSchema =
  'zedarchive.anime-v2-independent-review-plan' as const
export const independentReviewInputSchema =
  'zedarchive.anime-v2-independent-review-input' as const
export const independentReviewResultSchema =
  'zedarchive.anime-v2-independent-review-result' as const
export const independentReviewRoundBundleSchema =
  'zedarchive.anime-v2-independent-review-round-bundle' as const
export const independentReviewLineageSchema =
  'zedarchive.anime-v2-independent-review-proposal-population-lineage' as const

type PlanBase = Readonly<{
  schema: typeof independentReviewPlanSchema
  version: 1
  round: number
  populationSha256: string
  proposalSha256: string
  seedAuthoritySha256: string
  recordCommitments: readonly string[]
  planSha256: string
}>

export type IndependentReviewPlan =
  | (PlanBase &
      Readonly<{
        kind: 'mandatory-review'
        round: 0
      }>)
  | (PlanBase &
      Readonly<{
        kind: 'original-sample'
        round: 0
        roundSeed: string
        sampleSha256: string
        lowRiskRecordCommitmentsSha256: string
        allocationSha256: string
        sampleSize: number
        sampledCanonicalUuids: readonly string[]
        sampledCanonicalUuidsSha256: string
      }>)
  | (PlanBase &
      Readonly<{
        kind: 'fresh-sample'
        round: number
        roundSeed: string
        lowRiskRecordCommitmentsSha256: string
        allocationSha256: string
        sampleSize: number
        sampledCanonicalUuids: readonly string[]
        sampledCanonicalUuidsSha256: string
      }>)
  | (PlanBase &
      Readonly<{
        kind: 'expanded-cohort'
        round: number
        parentPlanSha256: string
        parentInputSha256: string
        parentResultSha256: string
        triggerRecordCommitment: string
        triggerCategory: IndependentReviewDefectCategory
        acquisitionCohort: IndependentReviewAcquisitionCohort
        selectionCohort: IndependentReviewSelectionCohort
      }>)

export type IndependentReviewInputRecord = Readonly<{
  recordCommitment: string
  canonicalUuid: string
  projection: IndependentReviewRecordProjectionV1
}>

export type IndependentReviewInput = Readonly<{
  schema: typeof independentReviewInputSchema
  version: 1
  populationSha256: string
  proposalSha256: string
  planSha256: string
  records: readonly IndependentReviewInputRecord[]
  inputSha256: string
}>

export type IndependentReviewResultRecord = Readonly<{
  recordCommitment: string
  canonicalUuid: string
  outcome: 'approved' | 'material-defect'
  category: IndependentReviewDefectCategory | null
}>

export type IndependentReviewResult = Readonly<{
  schema: typeof independentReviewResultSchema
  version: 1
  populationSha256: string
  proposalSha256: string
  planSha256: string
  inputSha256: string
  records: readonly IndependentReviewResultRecord[]
  resultSha256: string
}>

export type IndependentReviewProposalPopulationLineage =
  | Readonly<{
      schema: typeof independentReviewLineageSchema
      version: 1
      kind: 'unchanged'
      previousProposalSha256: string
      nextProposalSha256: string
      previousPopulationSha256: string
      nextPopulationSha256: string
      lineageSha256: string
    }>
  | Readonly<{
      schema: typeof independentReviewLineageSchema
      version: 1
      kind: 'replacement'
      previousProposalSha256: string
      nextProposalSha256: string
      previousPopulationSha256: string
      nextPopulationSha256: string
      replacementLineageSha256: string
      identityReplacementReviewResultSha256: string
      lineageSha256: string
    }>

export type IndependentReviewRoundMember = Readonly<{
  plan: IndependentReviewPlan
  input: IndependentReviewInput
  result: IndependentReviewResult
}>

export type IndependentReviewRoundBundle = Readonly<{
  schema: typeof independentReviewRoundBundleSchema
  version: 1
  reviewSeriesSha256: string
  round: number
  populationSha256: string
  proposalSha256: string
  seedAuthoritySha256: string
  priorRoundBundleSha256: string | null
  proposalPopulationLineage: IndependentReviewProposalPopulationLineage
  members: readonly IndependentReviewRoundMember[]
  roundBundleSha256: string
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
  if (canonicalJson(actual) !== canonicalJson([...keys].sort(compareAscii)))
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

function assertUuid(
  value: unknown,
  description: string,
): asserts value is string {
  if (typeof value !== 'string' || !uuidV4Pattern.test(value))
    throw new Error(`${description} must be a lowercase UUID v4.`)
}

function assertCommitments(
  values: unknown,
  description: string,
  requireNonEmpty = true,
): readonly string[] {
  if (!Array.isArray(values) || (requireNonEmpty && values.length === 0))
    throw new Error(`${description} must be a non-empty array.`)
  values.forEach((value) => assertSha256(value, `${description} member`))
  if (
    new Set(values).size !== values.length ||
    canonicalJson([...values].sort(compareAscii)) !== canonicalJson(values)
  )
    throw new Error(`${description} must be unique and ASCII ordered.`)
  return values as readonly string[]
}

function assertCanonicalUuids(
  values: unknown,
  description: string,
): readonly string[] {
  if (!Array.isArray(values))
    throw new Error(`${description} must be an array.`)
  values.forEach((value) => assertUuid(value, `${description} member`))
  if (new Set(values).size !== values.length)
    throw new Error(`${description} must be unique.`)
  return values as readonly string[]
}

function assertDefectCategory(
  value: unknown,
): asserts value is IndependentReviewDefectCategory {
  if (
    typeof value !== 'string' ||
    !independentReviewDefectCategories.includes(
      value as IndependentReviewDefectCategory,
    )
  )
    throw new Error('Independent-review defect category is not closed.')
}

function assertBoundAuthority(
  population: IndependentReviewPopulationAuthority,
  proposal: IndependentReviewProposal,
  seedAuthority: IndependentReviewSeedAuthority,
): void {
  if (
    population.proposalSha256 !== proposal.proposalSha256 ||
    population.seedAuthoritySha256 !== seedAuthority.seedAuthoritySha256
  )
    throw new Error('Independent-review authority bindings have drifted.')
}

function populationByCommitment(
  population: IndependentReviewPopulationAuthority,
): ReadonlyMap<string, IndependentReviewPopulationRecord> {
  return new Map(
    population.records.map((record) => [record.recordCommitment, record]),
  )
}

function assertPlanPopulationBinding(
  plan: Pick<
    IndependentReviewPlan,
    | 'populationSha256'
    | 'proposalSha256'
    | 'seedAuthoritySha256'
    | 'recordCommitments'
  >,
  population: IndependentReviewPopulationAuthority,
  proposal: IndependentReviewProposal,
  seedAuthority: IndependentReviewSeedAuthority,
): readonly IndependentReviewPopulationRecord[] {
  assertBoundAuthority(population, proposal, seedAuthority)
  if (
    plan.populationSha256 !== population.populationSha256 ||
    plan.proposalSha256 !== proposal.proposalSha256 ||
    plan.seedAuthoritySha256 !== seedAuthority.seedAuthoritySha256
  )
    throw new Error('Independent-review plan changed population authority.')
  const byCommitment = populationByCommitment(population)
  return plan.recordCommitments.map((commitment) => {
    const record = byCommitment.get(commitment)
    if (!record)
      throw new Error(
        'Independent-review plan names a record outside its population.',
      )
    return record
  })
}

function planCore(
  plan: Omit<IndependentReviewPlan, 'planSha256'>,
): Omit<IndependentReviewPlan, 'planSha256'> {
  return plan
}

function validatePlanShape(
  record: Record<string, unknown>,
): IndependentReviewPlan {
  const kind = record.kind
  const common = [
    'schema',
    'version',
    'kind',
    'round',
    'populationSha256',
    'proposalSha256',
    'seedAuthoritySha256',
    'recordCommitments',
    'planSha256',
  ] as const
  const keys =
    kind === 'mandatory-review'
      ? common
      : kind === 'original-sample' || kind === 'fresh-sample'
        ? [
            ...common,
            'roundSeed',
            ...(kind === 'original-sample' ? ['sampleSha256'] : []),
            'lowRiskRecordCommitmentsSha256',
            'allocationSha256',
            'sampleSize',
            'sampledCanonicalUuids',
            'sampledCanonicalUuidsSha256',
          ]
        : kind === 'expanded-cohort'
          ? [
              ...common,
              'parentPlanSha256',
              'parentInputSha256',
              'parentResultSha256',
              'triggerRecordCommitment',
              'triggerCategory',
              'acquisitionCohort',
              'selectionCohort',
            ]
          : null
  if (!keys) throw new Error('Independent-review plan kind is not closed.')
  const value = strictObject(record, keys, 'Independent-review plan')
  if (value.schema !== independentReviewPlanSchema || value.version !== 1)
    throw new Error('Independent-review plan schema is unsupported.')
  if (!Number.isSafeInteger(value.round) || (value.round as number) < 0)
    throw new Error(
      'Independent-review plan round must be a non-negative safe integer.',
    )
  if (
    (value.kind === 'mandatory-review' || value.kind === 'original-sample') &&
    value.round !== 0
  )
    throw new Error(
      'Independent-review round zero is reserved for initial plans.',
    )
  if (value.kind === 'fresh-sample' && value.round === 0)
    throw new Error('Independent-review fresh plans require a positive round.')
  for (const key of [
    'populationSha256',
    'proposalSha256',
    'seedAuthoritySha256',
    'planSha256',
  ] as const)
    assertSha256(value[key], `Independent-review plan ${key}`)
  const recordCommitments = assertCommitments(
    value.recordCommitments,
    'Independent-review plan records',
    value.kind === 'expanded-cohort',
  )
  const base = {
    schema: independentReviewPlanSchema,
    version: 1 as const,
    kind: value.kind as IndependentReviewPlanKind,
    round: value.round as number,
    populationSha256: value.populationSha256 as string,
    proposalSha256: value.proposalSha256 as string,
    seedAuthoritySha256: value.seedAuthoritySha256 as string,
    recordCommitments,
  }
  if (value.kind === 'mandatory-review')
    return {
      ...base,
      kind: 'mandatory-review',
      round: 0,
      planSha256: value.planSha256 as string,
    }
  if (value.kind === 'original-sample' || value.kind === 'fresh-sample') {
    for (const key of [
      'roundSeed',
      'lowRiskRecordCommitmentsSha256',
      'allocationSha256',
      'sampledCanonicalUuidsSha256',
    ] as const)
      assertSha256(value[key], `Independent-review plan ${key}`)
    if (value.kind === 'original-sample')
      assertSha256(value.sampleSha256, 'Independent-review plan sampleSha256')
    if (
      !Number.isSafeInteger(value.sampleSize) ||
      (value.sampleSize as number) < 0
    )
      throw new Error('Independent-review plan sample size is invalid.')
    const sampledCanonicalUuids = assertCanonicalUuids(
      value.sampledCanonicalUuids,
      'Independent-review plan sampled UUIDs',
    )
    if (sampledCanonicalUuids.length !== value.sampleSize)
      throw new Error(
        'Independent-review plan sample UUID coverage is invalid.',
      )
    return {
      ...base,
      kind: value.kind,
      round: value.round as number,
      roundSeed: value.roundSeed as string,
      ...(value.kind === 'original-sample'
        ? { sampleSha256: value.sampleSha256 as string }
        : {}),
      lowRiskRecordCommitmentsSha256:
        value.lowRiskRecordCommitmentsSha256 as string,
      allocationSha256: value.allocationSha256 as string,
      sampleSize: value.sampleSize as number,
      sampledCanonicalUuids,
      sampledCanonicalUuidsSha256: value.sampledCanonicalUuidsSha256 as string,
      planSha256: value.planSha256 as string,
    } as IndependentReviewPlan
  }
  for (const key of [
    'parentPlanSha256',
    'parentInputSha256',
    'parentResultSha256',
    'triggerRecordCommitment',
  ] as const)
    assertSha256(value[key], `Independent-review expansion ${key}`)
  assertDefectCategory(value.triggerCategory)
  const trigger = value.triggerRecordCommitment as string
  const selectionCohort = value.selectionCohort
  if (
    value.acquisitionCohort !== 'predecessor-v1' &&
    !/^(0(?:0[1-9]|[1-9][0-9])|1(?:[0-5][0-9]|60))$/.test(
      value.acquisitionCohort as string,
    )
  )
    throw new Error(
      'Independent-review expansion acquisition cohort is invalid.',
    )
  if (
    selectionCohort === null ||
    typeof selectionCohort !== 'object' ||
    Array.isArray(selectionCohort)
  )
    throw new Error(
      'Independent-review expansion selection cohort must be structured.',
    )
  return {
    ...base,
    kind: 'expanded-cohort',
    parentPlanSha256: value.parentPlanSha256 as string,
    parentInputSha256: value.parentInputSha256 as string,
    parentResultSha256: value.parentResultSha256 as string,
    triggerRecordCommitment: trigger,
    triggerCategory: value.triggerCategory,
    acquisitionCohort:
      value.acquisitionCohort as IndependentReviewAcquisitionCohort,
    selectionCohort: selectionCohort as IndependentReviewSelectionCohort,
    planSha256: value.planSha256 as string,
  }
}

/** Parses one self-hashed plan and re-derives every membership that is knowable at this boundary. */
function parseIndependentReviewPlan(
  input: unknown,
  authority: Readonly<{
    population: IndependentReviewPopulationAuthority
    proposal: IndependentReviewProposal
    seedAuthority: IndependentReviewSeedAuthority
  }>,
): IndependentReviewPlan {
  if (input === null || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Independent-review plan must be an object.')
  const parsed = validatePlanShape(input as Record<string, unknown>)
  const { planSha256, ...core } = parsed
  if (planSha256 !== discoverySha256(planCore(core)))
    throw new Error('Independent-review plan hash does not match.')
  const members = assertPlanPopulationBinding(
    parsed,
    authority.population,
    authority.proposal,
    authority.seedAuthority,
  )
  if (parsed.kind === 'mandatory-review') {
    const expected = authority.population.records
      .filter((record) => record.mandatoryRiskReasons.length > 0)
      .map((record) => record.recordCommitment)
      .sort(compareAscii)
    if (canonicalJson(parsed.recordCommitments) !== canonicalJson(expected))
      throw new Error(
        'Independent-review mandatory plan membership is not exact.',
      )
  } else if (parsed.kind === 'original-sample') {
    const sample = prepareIndependentReviewSample({
      population: authority.population,
      proposal: authority.proposal,
      seedAuthority: authority.seedAuthority,
      round: 'initial',
    })
    const lowRiskRecordCommitments = sample.lowRiskPopulation
      .map((record) => record.recordCommitment)
      .sort(compareAscii)
    if (
      parsed.roundSeed !== sample.roundSeed ||
      parsed.sampleSha256 !== sample.sampleSha256 ||
      parsed.lowRiskRecordCommitmentsSha256 !==
        discoverySha256(lowRiskRecordCommitments) ||
      parsed.allocationSha256 !== discoverySha256(sample.allocations) ||
      parsed.sampleSize !== sample.sampleSize ||
      canonicalJson(parsed.sampledCanonicalUuids) !==
        canonicalJson(sample.sampledCanonicalUuids) ||
      parsed.sampledCanonicalUuidsSha256 !==
        sample.sampledCanonicalUuidsSha256 ||
      canonicalJson(parsed.recordCommitments) !==
        canonicalJson(sample.selectedRecordCommitments)
    )
      throw new Error(
        'Independent-review original plan changed derived sample membership.',
      )
    if (members.some((record) => record.mandatoryRiskReasons.length > 0))
      throw new Error(
        'Independent-review sample plan includes a mandatory-risk record.',
      )
  } else if (parsed.kind === 'fresh-sample') {
    if (
      parsed.roundSeed !==
      deriveIndependentSampleRoundSeed(
        authority.seedAuthority.originalSeed,
        parsed.round,
      )
    )
      throw new Error('Independent-review fresh plan changed its derived seed.')
    if (members.some((record) => record.mandatoryRiskReasons.length > 0))
      throw new Error(
        'Independent-review fresh plan includes a mandatory-risk record.',
      )
  } else {
    const trigger = authority.population.records.find(
      (record) => record.recordCommitment === parsed.triggerRecordCommitment,
    )
    if (!trigger)
      throw new Error(
        'Independent-review expansion trigger is outside its population.',
      )
    if (
      parsed.acquisitionCohort !== trigger.acquisitionCohort ||
      canonicalJson(parsed.selectionCohort) !==
        canonicalJson(trigger.selectionCohort)
    )
      throw new Error(
        'Independent-review expansion changed its trigger cohorts.',
      )
    const expected = authority.population.records
      .filter(
        (record) =>
          record.acquisitionCohort === trigger.acquisitionCohort ||
          canonicalJson(record.selectionCohort) ===
            canonicalJson(trigger.selectionCohort),
      )
      .map((record) => record.recordCommitment)
      .sort(compareAscii)
    if (canonicalJson(parsed.recordCommitments) !== canonicalJson(expected))
      throw new Error(
        'Independent-review expansion membership is not its exact cohort union.',
      )
  }
  return parsed
}

function parseInputRecord(
  input: unknown,
  recordsByCommitment: ReadonlyMap<string, IndependentReviewPopulationRecord>,
): IndependentReviewInputRecord {
  const value = strictObject(
    input,
    ['recordCommitment', 'canonicalUuid', 'projection'],
    'Independent-review input record',
  )
  assertSha256(
    value.recordCommitment,
    'Independent-review input record commitment',
  )
  assertUuid(value.canonicalUuid, 'Independent-review input canonical UUID')
  const projection = parseIndependentReviewRecordProjection(value.projection)
  const populationRecord = recordsByCommitment.get(
    value.recordCommitment as string,
  )
  if (
    !populationRecord ||
    populationRecord.canonicalUuid !== value.canonicalUuid ||
    canonicalJson(populationRecord.projection) !== canonicalJson(projection)
  )
    throw new Error(
      'Independent-review input projection is not its exact population projection.',
    )
  return {
    recordCommitment: value.recordCommitment as string,
    canonicalUuid: value.canonicalUuid as string,
    projection,
  }
}

function assertInputOrder(
  records: readonly IndependentReviewInputRecord[],
): void {
  const commitments = records.map((record) => record.recordCommitment)
  const uuids = records.map((record) => record.canonicalUuid)
  if (
    new Set(commitments).size !== records.length ||
    new Set(uuids).size !== records.length ||
    canonicalJson([...commitments].sort(compareAscii)) !==
      canonicalJson(commitments)
  )
    throw new Error(
      'Independent-review input records must be unique and commitment ordered.',
    )
}

function parseIndependentReviewInput(
  input: unknown,
  authority: Parameters<typeof parseIndependentReviewPlan>[1],
  planInput: unknown,
): IndependentReviewInput {
  const plan = parseIndependentReviewPlan(planInput, authority)
  const value = strictObject(
    input,
    [
      'schema',
      'version',
      'populationSha256',
      'proposalSha256',
      'planSha256',
      'records',
      'inputSha256',
    ],
    'Independent-review input',
  )
  if (value.schema !== independentReviewInputSchema || value.version !== 1)
    throw new Error('Independent-review input schema is unsupported.')
  for (const key of [
    'populationSha256',
    'proposalSha256',
    'planSha256',
    'inputSha256',
  ] as const)
    assertSha256(value[key], `Independent-review input ${key}`)
  if (!Array.isArray(value.records))
    throw new Error('Independent-review input records must be an array.')
  const recordsByCommitment = populationByCommitment(authority.population)
  const records = value.records.map((record) =>
    parseInputRecord(record, recordsByCommitment),
  )
  assertInputOrder(records)
  if (
    value.populationSha256 !== authority.population.populationSha256 ||
    value.proposalSha256 !== authority.proposal.proposalSha256 ||
    value.planSha256 !== plan.planSha256 ||
    canonicalJson(records.map((record) => record.recordCommitment)) !==
      canonicalJson(plan.recordCommitments)
  )
    throw new Error(
      'Independent-review input changed its plan authority or membership.',
    )
  const core = {
    schema: independentReviewInputSchema,
    version: 1 as const,
    populationSha256: value.populationSha256 as string,
    proposalSha256: value.proposalSha256 as string,
    planSha256: value.planSha256 as string,
    records,
  }
  if (value.inputSha256 !== discoverySha256(core))
    throw new Error('Independent-review input hash does not match.')
  return { ...core, inputSha256: value.inputSha256 as string }
}

function parseResultRecord(input: unknown): IndependentReviewResultRecord {
  const value = strictObject(
    input,
    ['recordCommitment', 'canonicalUuid', 'outcome', 'category'],
    'Independent-review result record',
  )
  assertSha256(
    value.recordCommitment,
    'Independent-review result record commitment',
  )
  assertUuid(value.canonicalUuid, 'Independent-review result canonical UUID')
  if (value.outcome !== 'approved' && value.outcome !== 'material-defect')
    throw new Error('Independent-review result outcome is not closed.')
  if ((value.outcome === 'approved') !== (value.category === null))
    throw new Error(
      'Independent-review result outcome and category do not agree.',
    )
  if (value.category !== null) assertDefectCategory(value.category)
  return {
    recordCommitment: value.recordCommitment as string,
    canonicalUuid: value.canonicalUuid as string,
    outcome: value.outcome,
    category: value.category as IndependentReviewDefectCategory | null,
  }
}

function parseIndependentReviewResult(
  input: unknown,
  authority: Parameters<typeof parseIndependentReviewPlan>[1],
  planInput: unknown,
  reviewInput: unknown,
): IndependentReviewResult {
  const plan = parseIndependentReviewPlan(planInput, authority)
  const parsedInput = parseIndependentReviewInput(reviewInput, authority, plan)
  const value = strictObject(
    input,
    [
      'schema',
      'version',
      'populationSha256',
      'proposalSha256',
      'planSha256',
      'inputSha256',
      'records',
      'resultSha256',
    ],
    'Independent-review result',
  )
  if (value.schema !== independentReviewResultSchema || value.version !== 1)
    throw new Error('Independent-review result schema is unsupported.')
  for (const key of [
    'populationSha256',
    'proposalSha256',
    'planSha256',
    'inputSha256',
    'resultSha256',
  ] as const)
    assertSha256(value[key], `Independent-review result ${key}`)
  if (!Array.isArray(value.records))
    throw new Error('Independent-review result records must be an array.')
  const records = value.records.map(parseResultRecord)
  const commitments = records.map((record) => record.recordCommitment)
  if (
    new Set(commitments).size !== records.length ||
    canonicalJson([...commitments].sort(compareAscii)) !==
      canonicalJson(commitments) ||
    canonicalJson(
      records.map((record) => [record.recordCommitment, record.canonicalUuid]),
    ) !==
      canonicalJson(
        parsedInput.records.map((record) => [
          record.recordCommitment,
          record.canonicalUuid,
        ]),
      )
  )
    throw new Error(
      'Independent-review result changed input coverage or order.',
    )
  if (
    value.populationSha256 !== authority.population.populationSha256 ||
    value.proposalSha256 !== authority.proposal.proposalSha256 ||
    value.planSha256 !== plan.planSha256 ||
    value.inputSha256 !== parsedInput.inputSha256
  )
    throw new Error('Independent-review result changed its bound authority.')
  const core = {
    schema: independentReviewResultSchema,
    version: 1 as const,
    populationSha256: value.populationSha256 as string,
    proposalSha256: value.proposalSha256 as string,
    planSha256: value.planSha256 as string,
    inputSha256: value.inputSha256 as string,
    records,
  }
  if (value.resultSha256 !== discoverySha256(core))
    throw new Error('Independent-review result hash does not match.')
  return { ...core, resultSha256: value.resultSha256 as string }
}

function parseIndependentReviewProposalPopulationLineage(
  input: unknown,
): IndependentReviewProposalPopulationLineage {
  if (input === null || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Independent-review lineage must be an object.')
  const kind = (input as Record<string, unknown>).kind
  const keys =
    kind === 'unchanged'
      ? [
          'schema',
          'version',
          'kind',
          'previousProposalSha256',
          'nextProposalSha256',
          'previousPopulationSha256',
          'nextPopulationSha256',
          'lineageSha256',
        ]
      : kind === 'replacement'
        ? [
            'schema',
            'version',
            'kind',
            'previousProposalSha256',
            'nextProposalSha256',
            'previousPopulationSha256',
            'nextPopulationSha256',
            'replacementLineageSha256',
            'identityReplacementReviewResultSha256',
            'lineageSha256',
          ]
        : null
  if (!keys) throw new Error('Independent-review lineage kind is not closed.')
  const value = strictObject(input, keys, 'Independent-review lineage')
  if (value.schema !== independentReviewLineageSchema || value.version !== 1)
    throw new Error('Independent-review lineage schema is unsupported.')
  for (const key of keys.filter((key) => key.endsWith('Sha256')))
    assertSha256(value[key], `Independent-review lineage ${key}`)
  if (
    kind === 'unchanged' &&
    (value.previousProposalSha256 !== value.nextProposalSha256 ||
      value.previousPopulationSha256 !== value.nextPopulationSha256)
  )
    throw new Error(
      'Unchanged independent-review lineage cannot drift authority.',
    )
  const { lineageSha256, ...core } = value
  if (lineageSha256 !== discoverySha256(core))
    throw new Error('Independent-review lineage hash does not match.')
  return value as unknown as IndependentReviewProposalPopulationLineage
}

/** Validates the immutable non-recursive union linked to one proven parent sampling defect. */
function validateIndependentReviewExpansion(
  input: Readonly<{
    plan: unknown
    reviewInput: unknown
    result: unknown
    parentPlan: unknown
    parentInput: unknown
    parentResult: unknown
  }>,
  authority: Parameters<typeof parseIndependentReviewPlan>[1],
): IndependentReviewPlan {
  const plan = parseIndependentReviewPlan(input.plan, authority)
  if (plan.kind !== 'expanded-cohort')
    throw new Error(
      'Independent-review expansion must use an expanded-cohort plan.',
    )
  const parentPlan = parseIndependentReviewPlan(input.parentPlan, authority)
  if (
    parentPlan.kind !== 'original-sample' &&
    parentPlan.kind !== 'fresh-sample'
  )
    throw new Error('Only original or fresh samples can trigger an expansion.')
  const parentInput = parseIndependentReviewInput(
    input.parentInput,
    authority,
    parentPlan,
  )
  const parentResult = parseIndependentReviewResult(
    input.parentResult,
    authority,
    parentPlan,
    parentInput,
  )
  if (
    plan.round !== parentPlan.round ||
    plan.parentPlanSha256 !== parentPlan.planSha256 ||
    plan.parentInputSha256 !== parentInput.inputSha256 ||
    plan.parentResultSha256 !== parentResult.resultSha256
  )
    throw new Error(
      'Independent-review expansion is not bound to its parent review.',
    )
  const trigger = parentResult.records.find(
    (record) => record.recordCommitment === plan.triggerRecordCommitment,
  )
  if (
    !trigger ||
    trigger.outcome !== 'material-defect' ||
    trigger.category !== plan.triggerCategory
  )
    throw new Error(
      'Independent-review expansion trigger is not a proven parent defect.',
    )
  const expandedInput = parseIndependentReviewInput(
    input.reviewInput,
    authority,
    plan,
  )
  const expandedResult = parseIndependentReviewResult(
    input.result,
    authority,
    plan,
    expandedInput,
  )
  const triggerResult = expandedResult.records.find(
    (record) => record.recordCommitment === plan.triggerRecordCommitment,
  )
  if (
    !triggerResult ||
    triggerResult.outcome !== 'material-defect' ||
    triggerResult.category !== trigger.category
  )
    throw new Error(
      'Independent-review expansion did not retain its triggering defect.',
    )
  return plan
}

function parseRoundMember(
  input: unknown,
  authority: Parameters<typeof parseIndependentReviewPlan>[1],
): IndependentReviewRoundMember {
  const value = strictObject(
    input,
    ['plan', 'input', 'result'],
    'Independent-review round member',
  )
  const plan = parseIndependentReviewPlan(value.plan, authority)
  const reviewInput = parseIndependentReviewInput(value.input, authority, plan)
  const result = parseIndependentReviewResult(
    value.result,
    authority,
    plan,
    reviewInput,
  )
  return { plan, input: reviewInput, result }
}

function parseIndependentReviewRoundBundle(
  input: unknown,
  authority: Parameters<typeof parseIndependentReviewPlan>[1],
): IndependentReviewRoundBundle {
  const value = strictObject(
    input,
    [
      'schema',
      'version',
      'reviewSeriesSha256',
      'round',
      'populationSha256',
      'proposalSha256',
      'seedAuthoritySha256',
      'priorRoundBundleSha256',
      'proposalPopulationLineage',
      'members',
      'roundBundleSha256',
    ],
    'Independent-review round bundle',
  )
  if (
    value.schema !== independentReviewRoundBundleSchema ||
    value.version !== 1
  )
    throw new Error('Independent-review round bundle schema is unsupported.')
  if (!Number.isSafeInteger(value.round) || (value.round as number) < 0)
    throw new Error(
      'Independent-review round must be a non-negative safe integer.',
    )
  const round = value.round as number
  for (const key of [
    'reviewSeriesSha256',
    'populationSha256',
    'proposalSha256',
    'seedAuthoritySha256',
    'roundBundleSha256',
  ] as const)
    assertSha256(value[key], `Independent-review round bundle ${key}`)
  if (value.priorRoundBundleSha256 !== null)
    assertSha256(
      value.priorRoundBundleSha256,
      'Independent-review prior round bundle hash',
    )
  if (!Array.isArray(value.members) || value.members.length === 0)
    throw new Error('Independent-review round bundle requires members.')
  const lineage = parseIndependentReviewProposalPopulationLineage(
    value.proposalPopulationLineage,
  )
  if (
    value.populationSha256 !== authority.population.populationSha256 ||
    value.proposalSha256 !== authority.proposal.proposalSha256 ||
    value.seedAuthoritySha256 !== authority.seedAuthority.seedAuthoritySha256 ||
    lineage.nextPopulationSha256 !== authority.population.populationSha256 ||
    lineage.nextProposalSha256 !== authority.proposal.proposalSha256 ||
    (round === 0 &&
      (value.priorRoundBundleSha256 !== null ||
        lineage.kind !== 'unchanged')) ||
    (round > 0 && value.priorRoundBundleSha256 === null)
  )
    throw new Error(
      'Independent-review round bundle changed authority or lineage shape.',
    )
  const members = value.members.map((member) =>
    parseRoundMember(member, authority),
  )
  if (
    new Set(members.map((member) => member.plan.planSha256)).size !==
    members.length
  )
    throw new Error('Independent-review round bundle plans must be unique.')
  const expectedKinds =
    round === 0 ? ['mandatory-review', 'original-sample'] : ['fresh-sample']
  for (const kind of expectedKinds) {
    if (members.filter((member) => member.plan.kind === kind).length !== 1)
      throw new Error(
        'Independent-review round bundle is missing its required plan.',
      )
  }
  if (members.some((member) => member.plan.round !== round))
    throw new Error('Independent-review round bundle contains a detached plan.')
  const core = {
    schema: independentReviewRoundBundleSchema,
    version: 1 as const,
    reviewSeriesSha256: value.reviewSeriesSha256 as string,
    round,
    populationSha256: value.populationSha256 as string,
    proposalSha256: value.proposalSha256 as string,
    seedAuthoritySha256: value.seedAuthoritySha256 as string,
    priorRoundBundleSha256: value.priorRoundBundleSha256 as string | null,
    proposalPopulationLineage: lineage,
    members,
  }
  if (value.roundBundleSha256 !== discoverySha256(core))
    throw new Error('Independent-review round bundle hash does not match.')
  return { ...core, roundBundleSha256: value.roundBundleSha256 as string }
}

/**
 * Verifies contiguous history and derives the only permitted exclusion set.
 * No caller can supply a UUID list: every covered UUID comes from a complete
 * self-hashed result bundle.
 */
function _verifyIndependentReviewHistory(
  bundlesInput: readonly unknown[],
  authority: Parameters<typeof parseIndependentReviewPlan>[1],
): Readonly<{
  reviewedCanonicalUuids: readonly string[]
  latestRound: number
}> {
  if (bundlesInput.length === 0)
    throw new Error(
      'Independent-review history requires the complete round-zero bundle.',
    )
  const bundles = bundlesInput.map((bundle) =>
    parseIndependentReviewRoundBundle(bundle, authority),
  )
  const reviewed = new Set<string>()
  let previous: IndependentReviewRoundBundle | undefined
  for (const [round, bundle] of bundles.entries()) {
    if (bundle.round !== round)
      throw new Error(
        'Independent-review history rounds must be contiguous from zero.',
      )
    if (
      previous &&
      bundle.priorRoundBundleSha256 !== previous.roundBundleSha256
    )
      throw new Error('Independent-review history has a detached prior bundle.')
    if (
      previous &&
      (bundle.proposalPopulationLineage.previousProposalSha256 !==
        previous.proposalSha256 ||
        bundle.proposalPopulationLineage.previousPopulationSha256 !==
          previous.populationSha256)
    )
      throw new Error(
        'Independent-review history lineage does not bind its predecessor.',
      )
    for (const member of bundle.members) {
      for (const record of member.result.records) {
        const isExpansionReplay = member.plan.kind === 'expanded-cohort'
        if (reviewed.has(record.canonicalUuid) && !isExpansionReplay)
          throw new Error(
            'Independent-review history cannot review a UUID twice.',
          )
        reviewed.add(record.canonicalUuid)
      }
      if (member.plan.kind === 'expanded-cohort') {
        const expandedPlan = member.plan
        const parent = bundle.members.find(
          (candidate) =>
            candidate.plan.planSha256 === expandedPlan.parentPlanSha256,
        )
        if (!parent)
          throw new Error(
            'Independent-review history expansion parent is detached.',
          )
        validateIndependentReviewExpansion(
          {
            plan: member.plan,
            reviewInput: member.input,
            result: member.result,
            parentPlan: parent.plan,
            parentInput: parent.input,
            parentResult: parent.result,
          },
          authority,
        )
      }
    }
    for (const sampleMember of bundle.members.filter(
      (member) =>
        member.plan.kind === 'original-sample' ||
        member.plan.kind === 'fresh-sample',
    )) {
      for (const defect of sampleMember.result.records.filter(
        (record) => record.outcome === 'material-defect',
      )) {
        const expansions = bundle.members.filter(
          (member) =>
            member.plan.kind === 'expanded-cohort' &&
            member.plan.parentPlanSha256 === sampleMember.plan.planSha256 &&
            member.plan.triggerRecordCommitment === defect.recordCommitment,
        )
        if (expansions.length !== 1)
          throw new Error(
            'Independent-review history requires exactly one expansion per sampling defect.',
          )
      }
    }
    previous = bundle
  }
  return {
    reviewedCanonicalUuids: [...reviewed].sort(compareAscii),
    latestRound: previous!.round,
  }
}

/** The only public history boundary.  All authority is reparsed from raw bytes. */
export const independentReviewSeriesSchema =
  'zedarchive.anime-v2-independent-review-series' as const

export type IndependentReviewSeries = Readonly<{
  schema: typeof independentReviewSeriesSchema
  version: 1
  initialSnapshot: IndependentReviewInitialAuthoritySnapshot
  successorSnapshots: readonly IndependentReviewSuccessorAuthoritySnapshot[]
  bundles: readonly IndependentReviewRoundBundle[]
  reviewedCanonicalUuids: readonly string[]
  reviewSeriesSha256: string
  seriesSha256: string
}>

export type IndependentReviewFreshSample = Readonly<{
  round: number
  populationSha256: string
  proposalSha256: string
  roundSeed: string
  lowRiskRecordCommitmentsSha256: string
  sampleSize: number
  allocations: readonly Readonly<{
    key: string
    population: number
    minimumAllocation: number
    hamiltonAllocation: number
    allocation: number
  }>[]
  allocationSha256: string
  sampledCanonicalUuids: readonly string[]
  sampledCanonicalUuidsSha256: string
  selectedRecordCommitments: readonly string[]
  freshSampleSha256: string
}>

type RoundAuthority = Parameters<typeof parseIndependentReviewPlan>[1]

function authorityForSnapshot(
  snapshot: IndependentReviewAuthoritySnapshot,
  root: IndependentReviewInitialAuthoritySnapshot,
): RoundAuthority {
  /* The foundation parsers require the root seed binding.  A successor
   * population deliberately stores rootSeedAuthoritySha256 instead, so this
   * local adapter supplies only already-authenticated root header members. */
  const population =
    snapshot.kind === 'initial'
      ? snapshot.population
      : {
          schema:
            'zedarchive.anime-v2-independent-review-population-authority' as const,
          version: 1 as const,
          candidateAuthoritySha256: root.proposal.candidateAuthoritySha256,
          candidateReceiptSha256: root.proposal.candidateReceiptSha256,
          predecessorCorpusSha256: root.proposal.predecessorCorpusSha256,
          proposalSha256: snapshot.proposal.proposalSha256,
          orderedProposedPublishedQidSequenceSha256:
            snapshot.proposal.orderedProposedPublishedQidSequenceSha256,
          seedAuthoritySha256: root.seedAuthority.seedAuthoritySha256,
          records: snapshot.population.records,
          populationSha256: snapshot.population.populationSha256,
        }
  return {
    population,
    proposal: snapshot.proposal,
    seedAuthority: root.seedAuthority,
  }
}

function strictSeriesObject(input: unknown): Record<string, unknown> {
  return strictObject(
    input,
    [
      'schema',
      'version',
      'initialSnapshot',
      'successorSnapshots',
      'bundles',
      'reviewSeriesSha256',
      'seriesSha256',
    ],
    'Independent-review series',
  )
}

function validateRoundMembers(
  bundle: IndependentReviewRoundBundle,
  authority: RoundAuthority,
): void {
  const expectedBase =
    bundle.round === 0
      ? ['mandatory-review', 'original-sample']
      : ['fresh-sample']
  const base = bundle.members.filter(
    (member) => member.plan.kind !== 'expanded-cohort',
  )
  if (
    canonicalJson(base.map((member) => member.plan.kind)) !==
    canonicalJson(expectedBase)
  )
    throw new Error('Independent-review bundle base plans are not complete.')
  if (
    canonicalJson(
      bundle.members
        .slice(0, expectedBase.length)
        .map((member) => member.plan.kind),
    ) !== canonicalJson(expectedBase)
  )
    throw new Error(
      'Independent-review bundle members are not base-first ordered.',
    )
  const expansions = bundle.members.filter(
    (
      member,
    ): member is IndependentReviewRoundMember & {
      plan: Extract<IndependentReviewPlan, { kind: 'expanded-cohort' }>
    } => member.plan.kind === 'expanded-cohort',
  )
  const orderedExpansions = expansions.map(
    (member) => member.plan.triggerRecordCommitment,
  )
  if (
    canonicalJson([...orderedExpansions].sort(compareAscii)) !==
    canonicalJson(orderedExpansions)
  )
    throw new Error('Independent-review expansions are not trigger ordered.')
  for (const member of base) {
    if (
      member.plan.kind !== 'original-sample' &&
      member.plan.kind !== 'fresh-sample'
    )
      continue
    for (const defect of member.result.records.filter(
      (record) => record.outcome === 'material-defect',
    )) {
      if (
        expansions.filter(
          (candidate) =>
            candidate.plan.parentPlanSha256 === member.plan.planSha256 &&
            candidate.plan.triggerRecordCommitment === defect.recordCommitment,
        ).length !== 1
      )
        throw new Error(
          'Independent-review sample defect has no exact non-recursive expansion.',
        )
    }
  }
  for (const expansion of expansions) {
    const parent = base.find(
      (member) => member.plan.planSha256 === expansion.plan.parentPlanSha256,
    )
    if (!parent)
      throw new Error(
        'Independent-review expansion parent is not a base sample.',
      )
    validateIndependentReviewExpansion(
      {
        plan: expansion.plan,
        reviewInput: expansion.input,
        result: expansion.result,
        parentPlan: parent.plan,
        parentInput: parent.input,
        parentResult: parent.result,
      },
      authority,
    )
  }
}

type SuccessorParser = (
  input: unknown,
  context: Readonly<{
    rootSnapshot: unknown
    priorSuccessorSnapshots: readonly unknown[]
  }>,
) => IndependentReviewSuccessorAuthoritySnapshot

function compareQid(left: string, right: string): number {
  return compareDiscoveryQids(left, right)
}

function collectRoundCoverage(
  bundle: IndependentReviewRoundBundle,
  snapshot: IndependentReviewAuthoritySnapshot,
  seen: Map<
    string,
    Readonly<{
      category: IndependentReviewDefectCategory | null
      planSha256: string
      inputSha256: string
      resultSha256: string
      recordCommitment: string
      qid: string
    }>
  >,
): readonly Readonly<{
  category: IndependentReviewDefectCategory
  planSha256: string
  inputSha256: string
  resultSha256: string
  recordCommitment: string
  qid: string
}>[] {
  const byCommitment = new Map(
    snapshot.population.records.map((record) => [
      record.recordCommitment,
      record,
    ]),
  )
  const defects: Readonly<{
    category: IndependentReviewDefectCategory
    planSha256: string
    inputSha256: string
    resultSha256: string
    recordCommitment: string
    qid: string
  }>[] = []
  for (const member of bundle.members) {
    for (const result of member.result.records) {
      const record = byCommitment.get(result.recordCommitment)
      if (!record || record.canonicalUuid !== result.canonicalUuid)
        throw new Error(
          'Independent-review result record detached from snapshot.',
        )
      const prior = seen.get(record.canonicalUuid)
      const expansionReplay = member.plan.kind === 'expanded-cohort'
      const triggerReplay =
        expansionReplay &&
        member.plan.triggerRecordCommitment === result.recordCommitment
      if (prior && !expansionReplay)
        throw new Error('Independent-review history reviewed a UUID twice.')
      if (prior && expansionReplay && prior.category !== result.category)
        throw new Error(
          triggerReplay
            ? 'Independent-review expansion changed its trigger category.'
            : 'Independent-review expansion changed an overlapping result.',
        )
      const source = {
        category: result.category,
        planSha256: member.plan.planSha256,
        inputSha256: member.input.inputSha256,
        resultSha256: member.result.resultSha256,
        recordCommitment: result.recordCommitment,
        qid: record.qid,
      }
      if (!prior) seen.set(record.canonicalUuid, source)
      if (result.outcome === 'material-defect' && !prior) {
        defects.push({ ...source, category: result.category! })
      }
    }
  }
  return defects
}

function assertTransitionDefects(
  priorBundle: IndependentReviewRoundBundle,
  priorSnapshot: IndependentReviewAuthoritySnapshot,
  successor: IndependentReviewSuccessorAuthoritySnapshot,
): void {
  const coverage = new Map<
    string,
    Readonly<{
      category: IndependentReviewDefectCategory | null
      planSha256: string
      inputSha256: string
      resultSha256: string
      recordCommitment: string
      qid: string
    }>
  >()
  const actual = collectRoundCoverage(priorBundle, priorSnapshot, coverage)
    .slice()
    .sort((left, right) =>
      compareAscii(left.recordCommitment, right.recordCommitment),
    )
  const expected = successor.replacementProof.triggeringDefects
  if (canonicalJson(expected) !== canonicalJson(actual))
    throw new Error(
      'Independent-review successor proof does not bind the exact prior defect transition.',
    )
  const proofQids = expected.map(({ qid }) => qid).sort(compareQid)
  const removalQids = successor.replacementProof.removals
    .map(({ qid }) => qid)
    .sort(compareQid)
  const identityQids =
    successor.replacementProof.identityReplacementReviewResult.removals
      .map(({ qid }) => qid)
      .sort(compareQid)
  const lineageQids = successor.replacementProof.replacementLineage
    .at(-1)!
    .removedQids.slice()
    .sort(compareQid)
  if (
    canonicalJson(proofQids) !== canonicalJson(removalQids) ||
    canonicalJson(proofQids) !== canonicalJson(identityQids) ||
    canonicalJson(proofQids) !== canonicalJson(lineageQids)
  )
    throw new Error(
      'Independent-review successor removals do not match defects.',
    )
  if (
    actual.some((defect) =>
      priorSnapshot.population.records.some(
        (record) =>
          record.recordCommitment === defect.recordCommitment &&
          record.projection.kind === 'predecessor',
      ),
    )
  )
    throw new Error(
      'Independent-review predecessor defects cannot create a successor.',
    )
}

function parseSeriesEngine(
  input: unknown,
  parseSuccessor: SuccessorParser,
): IndependentReviewSeries {
  const value = strictSeriesObject(input)
  if (value.schema !== independentReviewSeriesSchema || value.version !== 1)
    throw new Error('Independent-review series schema is unsupported.')
  if (!Array.isArray(value.successorSnapshots) || !Array.isArray(value.bundles))
    throw new Error('Independent-review series members must be arrays.')
  const initialSnapshot = parseIndependentReviewInitialAuthoritySnapshot(
    value.initialSnapshot,
  )
  const successors: IndependentReviewSuccessorAuthoritySnapshot[] = []
  for (const [index, rawSnapshot] of value.successorSnapshots.entries()) {
    const parsed = parseSuccessor(rawSnapshot, {
      rootSnapshot: value.initialSnapshot,
      priorSuccessorSnapshots: value.successorSnapshots.slice(0, index),
    })
    if (parsed.round !== index + 1)
      throw new Error('Independent-review series successor rounds are gapped.')
    successors.push(parsed)
  }
  const snapshots: readonly IndependentReviewAuthoritySnapshot[] = [
    initialSnapshot,
    ...successors,
  ]
  if (value.bundles.length !== snapshots.length)
    throw new Error(
      'Independent-review series must have one bundle per snapshot.',
    )
  const bundles: IndependentReviewRoundBundle[] = []
  const reviewed = new Map<
    string,
    Readonly<{
      category: IndependentReviewDefectCategory | null
      planSha256: string
      inputSha256: string
      resultSha256: string
      recordCommitment: string
      qid: string
    }>
  >()
  for (const [round, rawBundle] of value.bundles.entries()) {
    const snapshot = snapshots[round]!
    const authority = authorityForSnapshot(snapshot, initialSnapshot)
    const bundle = parseIndependentReviewRoundBundle(rawBundle, authority)
    if (
      bundle.round !== round ||
      bundle.reviewSeriesSha256 !== initialSnapshot.reviewSeriesSha256 ||
      bundle.populationSha256 !== snapshot.population.populationSha256 ||
      bundle.proposalSha256 !== snapshot.proposal.proposalSha256 ||
      bundle.seedAuthoritySha256 !==
        initialSnapshot.seedAuthority.seedAuthoritySha256 ||
      (round > 0 &&
        bundle.priorRoundBundleSha256 !== bundles[round - 1]!.roundBundleSha256)
    )
      throw new Error(
        'Independent-review series bundle is detached from its round.',
      )
    validateRoundMembers(bundle, authority)
    if (round === 0) {
      if (bundle.proposalPopulationLineage.kind !== 'unchanged')
        throw new Error('Independent-review root bundle lineage is invalid.')
      _verifyIndependentReviewHistory([rawBundle], authority)
    }
    if (round > 0) {
      const stops = evaluateParsedSamplingStops({ bundles })
      if (stops.mandatoryReconciliationRequired || stops.stop)
        throw new Error(
          'Independent-review cumulative findings require reconciliation before a successor.',
        )
      const fresh = bundle.members.find(
        (member) => member.plan.kind === 'fresh-sample',
      )!
      assertFreshPlan(
        fresh.plan,
        deriveFreshSample(
          snapshot as IndependentReviewSuccessorAuthoritySnapshot,
          initialSnapshot,
          new Set(reviewed.keys()),
        ),
      )
      const proof = (snapshot as IndependentReviewSuccessorAuthoritySnapshot)
        .replacementProof
      if (
        bundle.proposalPopulationLineage.kind !== 'replacement' ||
        bundle.proposalPopulationLineage.replacementLineageSha256 !==
          proof.replacementLineageSha256 ||
        bundle.proposalPopulationLineage
          .identityReplacementReviewResultSha256 !==
          proof.identityReplacementReviewResult.resultSha256
      )
        throw new Error(
          'Independent-review bundle lineage disagrees with proof.',
        )
      assertTransitionDefects(
        bundles[round - 1]!,
        snapshots[round - 1]!,
        snapshot as IndependentReviewSuccessorAuthoritySnapshot,
      )
    }
    collectRoundCoverage(bundle, snapshot, reviewed)
    bundles.push(bundle)
  }
  assertSha256(value.reviewSeriesSha256, 'Independent-review series root hash')
  if (value.reviewSeriesSha256 !== initialSnapshot.reviewSeriesSha256)
    throw new Error('Independent-review series root hash drifted.')
  const core = {
    schema: independentReviewSeriesSchema,
    version: 1 as const,
    initialSnapshot,
    successorSnapshots: successors,
    bundles,
    reviewSeriesSha256: initialSnapshot.reviewSeriesSha256,
  }
  if (value.seriesSha256 !== discoverySha256(core))
    throw new Error('Independent-review series hash does not match.')
  return {
    ...core,
    reviewedCanonicalUuids: [...reviewed.keys()].sort(compareAscii),
    seriesSha256: value.seriesSha256 as string,
  }
}

export function parseIndependentReviewSeries(
  input: unknown,
): IndependentReviewSeries {
  return parseSeriesEngine(
    input,
    parseIndependentReviewSuccessorAuthoritySnapshot,
  )
}

/** Test-only fixture boundary; production modules must never import this entry point. */
export function parseIndependentReviewSeriesForFixture(
  input: unknown,
): IndependentReviewSeries {
  if (process.env.NODE_ENV !== 'test')
    throw new Error('Fixture independent-review series parsing is unavailable.')
  return parseSeriesEngine(
    input,
    parseIndependentReviewSuccessorAuthoritySnapshotForFixture,
  )
}

function deriveFreshSample(
  snapshot: IndependentReviewSuccessorAuthoritySnapshot,
  root: IndependentReviewInitialAuthoritySnapshot,
  excludedCanonicalUuids: ReadonlySet<string>,
): IndependentReviewFreshSample {
  const roundSeed = deriveIndependentSampleRoundSeed(
    root.seedAuthority.originalSeed,
    snapshot.round,
  )
  const lowRisk = snapshot.population.records.filter(
    (record) =>
      !excludedCanonicalUuids.has(record.canonicalUuid) &&
      record.primaryReviewRequired &&
      record.primaryReviewComplete &&
      record.projection.machineReviewRequired &&
      record.projection.machineReviewComplete &&
      record.mandatoryRiskReasons.length === 0,
  )
  const sampled = prepareIndependentReviewSamplingCore({
    candidates: lowRisk,
    roundSeed,
  })
  const sampledCanonicalUuids = sampled.sampled.map(
    (record) => record.canonicalUuid,
  )
  const selectedRecordCommitments = sampled.sampled
    .map((record) => record.recordCommitment)
    .sort(compareAscii)
  const core = {
    schema: 'zedarchive.anime-v2-independent-review-fresh-sample' as const,
    version: 1 as const,
    reviewSeriesSha256: root.reviewSeriesSha256,
    round: snapshot.round,
    populationSha256: snapshot.population.populationSha256,
    proposalSha256: snapshot.proposal.proposalSha256,
    roundSeed,
    lowRiskRecordCommitmentsSha256: discoverySha256(
      lowRisk.map((record) => record.recordCommitment).sort(compareAscii),
    ),
    allocations: sampled.allocations,
    sampledCanonicalUuids,
    sampledCanonicalUuidsSha256: discoverySha256(sampledCanonicalUuids),
    selectedRecordCommitments,
  }
  return {
    round: snapshot.round,
    populationSha256: snapshot.population.populationSha256,
    proposalSha256: snapshot.proposal.proposalSha256,
    roundSeed,
    lowRiskRecordCommitmentsSha256: core.lowRiskRecordCommitmentsSha256,
    sampleSize: sampled.sampleSize,
    allocations: sampled.allocations,
    allocationSha256: discoverySha256(sampled.allocations),
    sampledCanonicalUuids,
    sampledCanonicalUuidsSha256: core.sampledCanonicalUuidsSha256,
    selectedRecordCommitments,
    freshSampleSha256: discoverySha256(core),
  }
}

function assertFreshPlan(
  plan: IndependentReviewPlan,
  sample: IndependentReviewFreshSample,
): void {
  if (
    plan.kind !== 'fresh-sample' ||
    plan.round !== sample.round ||
    plan.roundSeed !== sample.roundSeed ||
    plan.lowRiskRecordCommitmentsSha256 !==
      sample.lowRiskRecordCommitmentsSha256 ||
    plan.sampleSize !== sample.sampleSize ||
    plan.allocationSha256 !== sample.allocationSha256 ||
    plan.sampledCanonicalUuidsSha256 !== sample.sampledCanonicalUuidsSha256 ||
    canonicalJson(plan.sampledCanonicalUuids) !==
      canonicalJson(sample.sampledCanonicalUuids) ||
    canonicalJson(plan.recordCommitments) !==
      canonicalJson(sample.selectedRecordCommitments)
  )
    throw new Error(
      'Independent-review fresh plan did not reproduce its sample.',
    )
}

export type IndependentReviewSamplingStops = Readonly<{
  mandatoryReconciliationRequired: boolean
  samplingMaterialDefectCount: number
  sameCategoryDistinctRecordStop: boolean
  threeMaterialFindingsStop: boolean
  expandedCohortRateStop: boolean
  stop: boolean
}>

function evaluateParsedSamplingStops(
  series: Pick<IndependentReviewSeries, 'bundles'>,
): IndependentReviewSamplingStops {
  const samplingDefects = new Map<string, IndependentReviewResultRecord>()
  let mandatoryReconciliationRequired = false
  let expandedCohortRateStop = false
  for (const bundle of series.bundles) {
    for (const member of bundle.members) {
      const defects = member.result.records.filter(
        (record) => record.outcome === 'material-defect',
      )
      if (member.plan.kind === 'mandatory-review') {
        mandatoryReconciliationRequired ||= defects.length > 0
        continue
      }
      for (const defect of defects) {
        const known = samplingDefects.get(defect.canonicalUuid)
        if (known && known.category !== defect.category)
          throw new Error(
            'Independent-review duplicate findings changed category.',
          )
        samplingDefects.set(defect.canonicalUuid, defect)
      }
      if (member.plan.kind === 'expanded-cohort') {
        const plan = member.plan
        const trigger = member.result.records.find(
          (record) => record.recordCommitment === plan.triggerRecordCommitment,
        )
        if (!trigger || trigger.outcome !== 'material-defect')
          throw new Error('Independent-review expansion omitted its trigger.')
        const numerator = new Set<string>(
          defects.map((record) => record.canonicalUuid),
        )
        numerator.add(trigger.canonicalUuid)
        expandedCohortRateStop ||=
          numerator.size / member.plan.recordCommitments.length > 0.01
      }
    }
  }
  const categories = new Map<IndependentReviewDefectCategory, Set<string>>()
  for (const defect of samplingDefects.values()) {
    const records = categories.get(defect.category!) ?? new Set<string>()
    records.add(defect.canonicalUuid)
    categories.set(defect.category!, records)
  }
  const sameCategoryDistinctRecordStop = [...categories.values()].some(
    (records) => records.size >= 2,
  )
  const threeMaterialFindingsStop = samplingDefects.size >= 3
  return {
    mandatoryReconciliationRequired,
    samplingMaterialDefectCount: samplingDefects.size,
    sameCategoryDistinctRecordStop,
    threeMaterialFindingsStop,
    expandedCohortRateStop,
    stop:
      sameCategoryDistinctRecordStop ||
      threeMaterialFindingsStop ||
      expandedCohortRateStop,
  }
}

export function evaluateIndependentReviewSamplingStops(
  series: unknown,
): IndependentReviewSamplingStops {
  return evaluateParsedSamplingStops(parseIndependentReviewSeries(series))
}

export function evaluateIndependentReviewSamplingStopsForFixture(
  series: unknown,
): IndependentReviewSamplingStops {
  if (process.env.NODE_ENV !== 'test')
    throw new Error(
      'Fixture independent-review stop evaluation is unavailable.',
    )
  return evaluateParsedSamplingStops(
    parseIndependentReviewSeriesForFixture(series),
  )
}

function parseFreshInput(input: unknown): Record<string, unknown> {
  return strictObject(
    input,
    ['priorSeries', 'successorSnapshot'],
    'Independent-review fresh sample input',
  )
}

function prepareFreshEngine(
  input: unknown,
  parseSeries: (series: unknown) => IndependentReviewSeries,
  parseSuccessor: SuccessorParser,
): IndependentReviewFreshSample {
  const value = parseFreshInput(input)
  const priorSeries = parseSeries(value.priorSeries)
  const rawSeries = strictSeriesObject(value.priorSeries)
  const rawSuccessors = rawSeries.successorSnapshots as readonly unknown[]
  const successor = parseSuccessor(value.successorSnapshot, {
    rootSnapshot: rawSeries.initialSnapshot,
    priorSuccessorSnapshots: rawSuccessors,
  })
  if (successor.round !== priorSeries.bundles.length)
    throw new Error('Independent-review fresh successor is not immediate.')
  const stops = evaluateParsedSamplingStops(priorSeries)
  if (stops.mandatoryReconciliationRequired || stops.stop)
    throw new Error(
      'Independent-review cumulative findings require reconciliation.',
    )
  assertTransitionDefects(
    priorSeries.bundles.at(-1)!,
    priorSeries.successorSnapshots.at(-1) ?? priorSeries.initialSnapshot,
    successor,
  )
  return deriveFreshSample(
    successor,
    priorSeries.initialSnapshot,
    new Set(priorSeries.reviewedCanonicalUuids),
  )
}

export function prepareIndependentReviewFreshSample(
  input: unknown,
): IndependentReviewFreshSample {
  return prepareFreshEngine(
    input,
    parseIndependentReviewSeries,
    parseIndependentReviewSuccessorAuthoritySnapshot,
  )
}

export function prepareIndependentReviewFreshSampleForFixture(
  input: unknown,
): IndependentReviewFreshSample {
  if (process.env.NODE_ENV !== 'test')
    throw new Error('Fixture independent-review fresh sampling is unavailable.')
  return prepareFreshEngine(
    input,
    parseIndependentReviewSeriesForFixture,
    parseIndependentReviewSuccessorAuthoritySnapshotForFixture,
  )
}

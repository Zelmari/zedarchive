import { z } from '@/config/zod'
import {
  adultPublicationSignalTokens,
  adultPublicationSignals,
  candidatePredecessorExclusionAuthoritySchema,
  deriveCandidatePredecessorExclusionAuthority,
  deriveCandidatePredecessorExclusionAuthorityForFixture,
  directContinuityQids,
  projectTitleCandidates,
  reductionFailureCategoryFromError,
  titleSourceTokens,
} from '@/features/anime/catalogue/anime-successor-predecessor-review'
import {
  compareAudienceCandidates,
  discoverySha256,
} from '@/features/anime/catalogue/wikidata-anime-discovery'
import {
  wikidataItemValueSchema,
  wikidataMonolingualTextValueSchema,
  wikidataQidSchema,
  wikidataQuantityValueSchema,
  wikidataStatementSchema,
  wikidataTimeValueSchema,
  type WikidataEntity,
} from '@/integrations/wikidata/wikidata-entity'

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const outcomeSchema = z.enum(['approved', 'rejected', 'not-reviewed'])
const reducedProperties = [
  'P31',
  'P136',
  'P1476',
  'P577',
  'P580',
  'P582',
  'P1113',
  'P155',
  'P156',
] as const
type ReducedProperty = (typeof reducedProperties)[number]

/** Decision 094 pins the independently recomputed candidate authority. */
export const acceptedCandidateAcquisitionSourceReceiptSha256: string | null =
  '1c16cdf422a3f6482d2efabd9665a241114d7cb858882faded14ef40995bad35'
export const acceptedCandidateAcquisitionReviewAuthoritySha256: string | null =
  '224e830272c3f6867e63a926e8b484fce7e633fa07483d7d72c60a06e2f7fe6f'
/** Decision 071 pins the independently reviewed post-recovery evidence. */
export const acceptedCandidateRecoveryCollisionAuditSha256: string | null =
  'adcf8ce342f7031becdeb2f15a0b2a6a51f6c249e8f313cd43d2eadd61a18bb8'
export const acceptedCandidateReviewRoundTwoPromotionPlanSha256: string | null =
  '32bdb25c30ed48109d997e010318e91daab1a0c4e9b35d72fbfeb6a69c775eb9'

export const candidatePrimaryAggregatePhaseSchema = z.enum([
  'authority-schema',
  'predecessor-authority',
  'receipt-binding',
  'predecessor-binding',
  'manifest-baseline',
  'source-receipt',
  'manifest-partition',
  'outcome-coverage',
  'outcome-records',
  'acquisition-binding',
  'lock-coverage',
  'lock-binding',
  'record-binding',
  'machine-disposition',
  'acquired-projection',
  'retained-collision',
  'adult-outcome',
  'semantic-completeness',
  'primary-approval',
  'frozen-format-year',
  'active-collision-audit',
  'aggregate-construction',
  'outcome-set-commitment',
  'authority-commitment',
])
export type CandidatePrimaryAggregatePhase = z.infer<
  typeof candidatePrimaryAggregatePhaseSchema
>

export const candidateAcquisitionSpecification = {
  version: 'candidate-acquisition-specification.v2',
  candidateReceiptSha256:
    'fa126f87e53ef4babfec7f0a5924c153e84aa03a638052157656537e71002c59',
  manifestSize: 50,
  requestGroupSize: 25,
  manifestCount: 160,
  maximumAttempts: 1000,
  maximumConcurrency: 1,
  minimumPacingMilliseconds: 350,
  maximumElapsedMilliseconds: 57_600_000,
} as const
/** Literal Decision-064 acquisition specification commitment. */
export const candidateAcquisitionSpecificationSha256 =
  '70d93450429dfa219c6d0e3377c3bb4e838e27b32807ea7a61fa9c580d525ff1' as const

const propertyShape = {
  P31: ['wikibase-item', 'wikibase-entityid'],
  P136: ['wikibase-item', 'wikibase-entityid'],
  P1476: ['monolingualtext', 'monolingualtext'],
  P577: ['time', 'time'],
  P580: ['time', 'time'],
  P582: ['time', 'time'],
  P1113: ['quantity', 'quantity'],
  P155: ['wikibase-item', 'wikibase-entityid'],
  P156: ['wikibase-item', 'wikibase-entityid'],
} as const

const claimRankSchema = z.strictObject({
  rank: z.enum(['preferred', 'normal']),
})
const itemClaimSchema = claimRankSchema.extend({ value: wikidataQidSchema })
const textClaimSchema = claimRankSchema.extend({
  value: z.strictObject({ language: z.string().min(1), text: z.string() }),
})
const timeClaimSchema = claimRankSchema.extend({
  value: z.strictObject({
    time: z.string(),
    precision: z.number().int(),
    calendarmodel: z.string(),
  }),
})
const quantityClaimSchema = claimRankSchema.extend({
  value: z.strictObject({ amount: z.string(), unit: z.string() }),
})
const reducedClaimsSchema = z.strictObject({
  P31: z.array(itemClaimSchema),
  P136: z.array(itemClaimSchema),
  P1476: z.array(textClaimSchema),
  P577: z.array(timeClaimSchema),
  P580: z.array(timeClaimSchema),
  P582: z.array(timeClaimSchema),
  P1113: z.array(quantityClaimSchema),
  P155: z.array(itemClaimSchema),
  P156: z.array(itemClaimSchema),
})

export const reducedCandidateProjectionSchema = z
  .strictObject({
    qid: wikidataQidSchema,
    revision: z.number().int().positive(),
    titleCandidates: z.array(
      z.strictObject({
        source: z.enum(titleSourceTokens),
        value: z.string(),
        valueSha256: sha256Schema,
      }),
    ),
    adultSignals: z.array(z.enum(adultPublicationSignalTokens)),
    continuityQids: z.array(wikidataQidSchema).max(8),
    claims: reducedClaimsSchema,
    releaseYear: z.number().int().min(1).max(9999).nullable(),
    releaseYearSource: z.enum(['P577', 'P580', 'unavailable']),
    episodeCount: z.number().int().positive().nullable(),
    episodeCountEvidence: z.enum(['single-valid', 'absent', 'ambiguous']),
    projectionSha256: sha256Schema,
  })
  .superRefine(({ projectionSha256, ...core }, context) => {
    if (projectionSha256 !== discoverySha256(core))
      context.addIssue({
        code: 'custom',
        path: ['projectionSha256'],
        message: 'Candidate projection hash does not match.',
      })
  })
export type ReducedCandidateProjection = z.infer<
  typeof reducedCandidateProjectionSchema
>

function projectValue(
  property: ReducedProperty,
  statement: z.infer<typeof wikidataStatementSchema>,
) {
  const expected = propertyShape[property]
  const datavalue = statement.mainsnak.datavalue
  if (
    statement.mainsnak.datatype !== expected[0] ||
    datavalue?.type !== expected[1]
  ) {
    throw new Error(
      'Candidate claim datatype does not match its property schema.',
    )
  }
  if (expected[0] === 'wikibase-item')
    return wikidataItemValueSchema.parse(datavalue.value).id
  if (expected[0] === 'monolingualtext') {
    const value = wikidataMonolingualTextValueSchema.parse(datavalue.value)
    return { language: value.language, text: value.text }
  }
  if (expected[0] === 'time') {
    const value = wikidataTimeValueSchema.parse(datavalue.value)
    return {
      time: value.time,
      precision: value.precision,
      calendarmodel: value.calendarmodel,
    }
  }
  const value = wikidataQuantityValueSchema.parse(datavalue.value)
  return { amount: value.amount, unit: value.unit }
}

function projectClaims(entity: WikidataEntity) {
  const result = Object.fromEntries(
    reducedProperties.map((property) => [property, []]),
  ) as unknown as Record<ReducedProperty, unknown[]>
  for (const property of reducedProperties)
    for (const raw of entity.claims[property] ?? []) {
      const statement = wikidataStatementSchema.parse(raw)
      if (statement.mainsnak.property !== property)
        throw new Error('Candidate statement changed its claim bucket.')
      if (
        statement.rank === 'deprecated' ||
        statement.mainsnak.snaktype !== 'value'
      )
        continue
      result[property].push({
        rank: statement.rank,
        value: projectValue(property, statement),
      })
    }
  return reducedClaimsSchema.parse(result)
}

function yearFromTime(value: { time: string; precision: number }): number {
  const match = /^\+?(\d{4,})-/.exec(value.time)
  if (value.precision < 9) return 0
  if (match === null)
    throw new Error('Candidate release date has an invalid time value.')
  const year = Number(match[1])
  if (!Number.isSafeInteger(year) || year < 1 || year > 9999) {
    throw new Error('Candidate release year must be between 1 and 9999.')
  }
  return year
}

function deriveReleaseYear(claims: z.infer<typeof reducedClaimsSchema>) {
  const publicationYears = claims.P577.map(({ value }) =>
    yearFromTime(value),
  ).filter((year) => year > 0)
  if (publicationYears.length > 0) {
    return {
      releaseYear: Math.min(...publicationYears),
      releaseYearSource: 'P577' as const,
    }
  }
  const startYears = claims.P580.map(({ value }) => yearFromTime(value)).filter(
    (year) => year > 0,
  )
  if (startYears.length > 0) {
    return {
      releaseYear: Math.min(...startYears),
      releaseYearSource: 'P580' as const,
    }
  }
  return { releaseYear: null, releaseYearSource: 'unavailable' as const }
}

function deriveEpisodeCount(claims: z.infer<typeof reducedClaimsSchema>) {
  const values = claims.P1113.map(({ value }) => {
    if (value.unit !== '1' || !/^\+?[1-9][0-9]*$/.test(value.amount)) {
      throw new Error(
        'Candidate episode count must be a positive integer with unit 1.',
      )
    }
    const count = Number(value.amount.replace(/^\+/, ''))
    if (!Number.isSafeInteger(count) || count <= 0) {
      throw new Error(
        'Candidate episode count must be a safe positive integer.',
      )
    }
    return count
  })
  const unique = [...new Set(values)].sort((left, right) => left - right)
  if (unique.length === 0)
    return { episodeCount: null, episodeCountEvidence: 'absent' as const }
  if (unique.length > 1)
    return { episodeCount: null, episodeCountEvidence: 'ambiguous' as const }
  return {
    episodeCount: unique[0]!,
    episodeCountEvidence: 'single-valid' as const,
  }
}

function assertCandidateTitleMapLanguages(entity: WikidataEntity): void {
  const assertLanguage = (key: string, language: unknown) => {
    const expected =
      key === 'en' ? 'en' : key.toLowerCase() === 'ja-latn' ? 'ja-latn' : null
    if (expected === null) return
    const actual =
      typeof language === 'string'
        ? expected === 'ja-latn'
          ? language.toLowerCase()
          : language
        : undefined
    if (actual !== expected) {
      throw new Error(
        'Candidate title map key does not match embedded language.',
      )
    }
  }
  for (const [key, label] of Object.entries(entity.labels))
    assertLanguage(key, label.language)
  for (const [key, aliases] of Object.entries(entity.aliases))
    for (const alias of aliases) assertLanguage(key, alias.language)
}

export function reduceCandidateEntity(
  entity: WikidataEntity,
): ReducedCandidateProjection {
  if (
    entity.missing !== undefined ||
    entity.redirect !== undefined ||
    entity.type !== 'item' ||
    !Number.isSafeInteger(entity.lastrevid) ||
    (entity.lastrevid ?? 0) <= 0
  ) {
    throw new Error(
      'Candidate response must be a direct item with a positive revision.',
    )
  }
  const claims = projectClaims(entity)
  assertCandidateTitleMapLanguages(entity)
  const core = {
    qid: entity.id,
    revision: entity.lastrevid,
    titleCandidates: projectTitleCandidates(entity),
    adultSignals: adultPublicationSignals(entity),
    continuityQids: directContinuityQids(entity),
    claims,
    ...deriveReleaseYear(claims),
    ...deriveEpisodeCount(claims),
  }
  return reducedCandidateProjectionSchema.parse({
    ...core,
    projectionSha256: discoverySha256(core),
  })
}

export type CandidateReceiptLike = Readonly<{
  candidates: readonly Readonly<{
    qid: string
    format: string
    releaseYear: number | null
    era: string
    englishBand: string
    japaneseBand: string
    sitelinkBand: string
    englishMappingInputSha256: string
    japaneseMappingInputSha256: string
  }>[]
}>

export function candidateCommitment(
  candidate: CandidateReceiptLike['candidates'][number],
): string {
  return discoverySha256({
    qid: candidate.qid,
    format: candidate.format,
    releaseYear: candidate.releaseYear,
    era: candidate.era,
    englishBand: candidate.englishBand,
    japaneseBand: candidate.japaneseBand,
    sitelinkBand: candidate.sitelinkBand,
    englishMappingInputSha256: candidate.englishMappingInputSha256,
    japaneseMappingInputSha256: candidate.japaneseMappingInputSha256,
  })
}

export function candidateRevisionWitnessSha256(
  candidate: CandidateReceiptLike['candidates'][number],
  revision: unknown,
): string {
  if (!Number.isSafeInteger(revision) || (revision as number) <= 0)
    throw new Error(
      'Candidate acquisition requires a positive provider revision.',
    )
  return discoverySha256({
    version: 'candidate-revision-witness.v1',
    candidateSha256: candidateCommitment(candidate),
    revision,
  })
}

export function candidateReductionWitnessSha256(
  candidate: CandidateReceiptLike['candidates'][number],
  outcome:
    | Readonly<{
        disposition: 'projected'
        projection: ReducedCandidateProjection
      }>
    | Readonly<{
        disposition: 'machine-rejected'
        category:
          | 'entity-state'
          | 'continuity-limit'
          | 'statement-shape'
          | 'claim-value'
          | 'projection-schema'
      }>,
): string {
  const core =
    outcome.disposition === 'projected'
      ? {
          version: 'candidate-reduction-witness.v1',
          candidateSha256: candidateCommitment(candidate),
          disposition: outcome.disposition,
          projectionSha256: outcome.projection.projectionSha256,
          revision: outcome.projection.revision,
        }
      : {
          version: 'candidate-reduction-witness.v1',
          candidateSha256: candidateCommitment(candidate),
          disposition: outcome.disposition,
          category: outcome.category,
        }
  return discoverySha256(core)
}

export const candidateManifestSchema = z.strictObject({
  ordinal: z.number().int().positive(),
  qids: z.array(wikidataQidSchema).min(1).max(50),
  candidateCommitments: z.array(sha256Schema).min(1).max(50),
  manifestSha256: sha256Schema,
})
export type CandidateManifest = z.infer<typeof candidateManifestSchema>

export function deriveCandidateManifests(
  receipt: CandidateReceiptLike,
): CandidateManifest[] {
  return Array.from(
    { length: Math.ceil(receipt.candidates.length / 50) },
    (_, index) => {
      const candidates = receipt.candidates.slice(index * 50, index * 50 + 50)
      const core = {
        ordinal: index + 1,
        qids: candidates.map(({ qid }) => qid),
        candidateCommitments: candidates.map(candidateCommitment),
      }
      return candidateManifestSchema.parse({
        ...core,
        manifestSha256: discoverySha256(core),
      })
    },
  )
}

const sourceReceiptRequestEvidenceSchema = z.strictObject({
  requestGroupCount: z.number().int().nonnegative(),
  successfulResponseGroupCount: z.number().int().nonnegative(),
  attempts: z.number().int().nonnegative(),
  retries: z.number().int().nonnegative(),
  pacingWaits: z.number().int().nonnegative(),
  pacingDelayMilliseconds: z.number().int().nonnegative(),
  elapsedMilliseconds: z.number().int().nonnegative(),
  maximumConcurrency: z.literal(1),
})
const candidateAcquisitionSourceReceiptCoreSchema = z.strictObject({
  schema: z.literal('zedarchive.anime-v2-candidate-acquisition-source-receipt'),
  version: z.literal(2),
  candidateReceiptSha256: sha256Schema,
  candidateAcquisitionSpecificationSha256: sha256Schema,
  manifestOrderSha256: sha256Schema,
  manifestSetSha256: sha256Schema,
  orderedRequestGroupCommitmentSha256: sha256Schema,
  rawAttemptSha256: z.array(sha256Schema),
  successfulAttemptOrdinalByRequestGroup: z.array(z.number().int().positive()),
  revisionWitnessSha256: z.array(sha256Schema),
  reductionWitnessSha256: z.array(sha256Schema),
  rawAttemptSetCommitmentSha256: sha256Schema,
  successfulAttemptOrdinalSetCommitmentSha256: sha256Schema,
  revisionWitnessSetCommitmentSha256: sha256Schema,
  reductionWitnessSetCommitmentSha256: sha256Schema,
  requestEvidence: sourceReceiptRequestEvidenceSchema,
})
export const candidateAcquisitionSourceReceiptSchema =
  candidateAcquisitionSourceReceiptCoreSchema.extend({
    sourceReceiptSha256: sha256Schema,
  })
export type CandidateAcquisitionSourceReceipt = z.infer<
  typeof candidateAcquisitionSourceReceiptSchema
>

function manifestCommitments(manifests: readonly CandidateManifest[]) {
  return {
    manifestOrderSha256: discoverySha256(
      manifests.map(({ ordinal, manifestSha256 }) => ({
        ordinal,
        manifestSha256,
      })),
    ),
    manifestSetSha256: discoverySha256(
      [...manifests].map(({ manifestSha256 }) => manifestSha256).sort(),
    ),
  }
}

/**
 * Structural source-receipt parser. It intentionally does not assert the
 * later independent-acceptance constants, so the bounded runner can prepare
 * an authority for review without gaining live selection authority.
 */
export function parseCandidateAcquisitionSourceReceiptForFixture(
  input: unknown,
  receipt: CandidateReceiptLike,
  candidateReceiptSha256: string,
): CandidateAcquisitionSourceReceipt {
  const sourceReceipt = candidateAcquisitionSourceReceiptSchema.parse(input)
  const manifests = deriveCandidateManifests(receipt)
  const commitments = manifestCommitments(manifests)
  if (
    sourceReceipt.candidateReceiptSha256 !== candidateReceiptSha256 ||
    sourceReceipt.candidateAcquisitionSpecificationSha256 !==
      candidateAcquisitionSpecificationSha256 ||
    sourceReceipt.manifestOrderSha256 !== commitments.manifestOrderSha256 ||
    sourceReceipt.manifestSetSha256 !== commitments.manifestSetSha256
  ) {
    throw new Error(
      'Candidate source receipt changed frozen acquisition bindings.',
    )
  }
  const groupCount = Math.ceil(receipt.candidates.length / 25)
  const frozenRequestGroups = Array.from({ length: groupCount }, (_, index) =>
    receipt.candidates.slice(index * 25, index * 25 + 25).map(({ qid }) => qid),
  )
  const setCommitment = (version: string, values: readonly unknown[]) =>
    discoverySha256({ version, values })
  const raw = setCommitment(
    'candidate-raw-attempt-set.v1',
    sourceReceipt.rawAttemptSha256,
  )
  const successful = setCommitment(
    'candidate-successful-attempt-ordinal-set.v1',
    sourceReceipt.successfulAttemptOrdinalByRequestGroup,
  )
  const revision = setCommitment(
    'candidate-revision-witness-set.v1',
    sourceReceipt.revisionWitnessSha256,
  )
  const reduction = setCommitment(
    'candidate-reduction-witness-set.v1',
    sourceReceipt.reductionWitnessSha256,
  )
  if (
    sourceReceipt.rawAttemptSha256.length !==
      sourceReceipt.requestEvidence.attempts ||
    sourceReceipt.successfulAttemptOrdinalByRequestGroup.length !==
      groupCount ||
    sourceReceipt.revisionWitnessSha256.length !== receipt.candidates.length ||
    sourceReceipt.reductionWitnessSha256.length !== receipt.candidates.length ||
    new Set(sourceReceipt.successfulAttemptOrdinalByRequestGroup).size !==
      groupCount ||
    sourceReceipt.successfulAttemptOrdinalByRequestGroup.some(
      (ordinal) =>
        ordinal < 1 || ordinal > sourceReceipt.rawAttemptSha256.length,
    ) ||
    sourceReceipt.successfulAttemptOrdinalByRequestGroup.some(
      (ordinal, index, ordinals) =>
        index > 0 && ordinal <= ordinals[index - 1]!,
    ) ||
    sourceReceipt.orderedRequestGroupCommitmentSha256 !==
      discoverySha256(frozenRequestGroups) ||
    sourceReceipt.rawAttemptSetCommitmentSha256 !== raw ||
    sourceReceipt.successfulAttemptOrdinalSetCommitmentSha256 !== successful ||
    sourceReceipt.revisionWitnessSetCommitmentSha256 !== revision ||
    sourceReceipt.reductionWitnessSetCommitmentSha256 !== reduction
  )
    throw new Error(
      'Candidate source receipt positional witnesses do not match.',
    )
  if (
    sourceReceipt.requestEvidence.requestGroupCount !==
      Math.ceil(
        receipt.candidates.length /
          candidateAcquisitionSpecification.requestGroupSize,
      ) ||
    sourceReceipt.requestEvidence.successfulResponseGroupCount !==
      sourceReceipt.requestEvidence.requestGroupCount ||
    sourceReceipt.requestEvidence.attempts <
      sourceReceipt.requestEvidence.successfulResponseGroupCount ||
    sourceReceipt.requestEvidence.attempts >
      candidateAcquisitionSpecification.maximumAttempts ||
    sourceReceipt.requestEvidence.retries !==
      sourceReceipt.requestEvidence.attempts -
        sourceReceipt.requestEvidence.successfulResponseGroupCount ||
    sourceReceipt.requestEvidence.pacingWaits >
      Math.max(0, sourceReceipt.requestEvidence.attempts - 1) ||
    (sourceReceipt.requestEvidence.pacingWaits === 0 &&
      sourceReceipt.requestEvidence.pacingDelayMilliseconds !== 0) ||
    (sourceReceipt.requestEvidence.pacingWaits > 0 &&
      (sourceReceipt.requestEvidence.pacingDelayMilliseconds <
        sourceReceipt.requestEvidence.pacingWaits ||
        sourceReceipt.requestEvidence.pacingDelayMilliseconds >
          sourceReceipt.requestEvidence.pacingWaits * 350)) ||
    sourceReceipt.requestEvidence.elapsedMilliseconds >
      candidateAcquisitionSpecification.maximumElapsedMilliseconds
  ) {
    throw new Error(
      'Candidate source receipt request evidence is outside the bounded contract.',
    )
  }
  const { sourceReceiptSha256, ...core } = sourceReceipt
  if (sourceReceiptSha256 !== discoverySha256(core))
    throw new Error('Candidate source receipt canonical hash does not match.')
  return sourceReceipt
}

export function createCandidateAcquisitionSourceReceipt(
  input: Omit<CandidateAcquisitionSourceReceipt, 'sourceReceiptSha256'>,
): CandidateAcquisitionSourceReceipt {
  return candidateAcquisitionSourceReceiptSchema.parse({
    ...input,
    sourceReceiptSha256: discoverySha256(input),
  })
}

function candidateRejectionCategory(error: unknown) {
  const predecessorCategory = reductionFailureCategoryFromError(error)
  if (
    predecessorCategory !== undefined &&
    predecessorCategory !== 'unexpected-reduction'
  ) {
    return predecessorCategory
  }
  const message = error instanceof Error ? error.message : ''
  if (message.includes('direct item') || message.includes('positive revision'))
    return 'entity-state' as const
  if (message.includes('continuity')) return 'continuity-limit' as const
  if (
    message.includes('datatype') ||
    message.includes('episode') ||
    message.includes('release date') ||
    message.includes('title map key')
  )
    return 'claim-value' as const
  if (message.includes('claim bucket')) return 'statement-shape' as const
  return 'projection-schema' as const
}

export function reduceCandidateEntitySafely(
  input: Readonly<{
    candidate: CandidateReceiptLike['candidates'][number]
    manifest: CandidateManifest
    entity: WikidataEntity
    sourceReceiptSha256: string
    revisionWitnessSha256?: string
    reductionWitnessSha256?: string
  }>,
): CandidateAcquisitionOutcome {
  const binding = {
    qid: input.candidate.qid,
    candidateSha256: candidateCommitment(input.candidate),
    manifestSha256: input.manifest.manifestSha256,
    sourceReceiptSha256: input.sourceReceiptSha256,
    revisionWitnessSha256: input.revisionWitnessSha256 ?? '0'.repeat(64),
    reductionWitnessSha256: input.reductionWitnessSha256 ?? '0'.repeat(64),
  }
  try {
    if (input.entity.id !== input.candidate.qid)
      throw new Error('Candidate entity did not match the requested QID.')
    return projectedOutcomeSchema.parse({
      ...binding,
      disposition: 'projected',
      projection: reduceCandidateEntity(input.entity),
    })
  } catch (error) {
    const category = candidateRejectionCategory(error)
    const core = {
      ...binding,
      disposition: 'machine-rejected' as const,
      category,
    }
    return rejectedOutcomeSchema.parse({
      ...core,
      rejectionSha256: discoverySha256(core),
    })
  }
}

const reviewRecordSchema = z.strictObject({
  qid: wikidataQidSchema,
  candidateSha256: sha256Schema,
  manifestSha256: sha256Schema,
  projectionSha256: sha256Schema.nullable(),
  acquisitionOutcomeSha256: sha256Schema,
  reviewInputSha256: sha256Schema,
  machineValidation: outcomeSchema,
  exactWorkIdentity: outcomeSchema,
  mediaScope: outcomeSchema,
  title: z.union([
    z.null(),
    z.strictObject({
      source: z.enum(titleSourceTokens),
      valueSha256: sha256Schema,
    }),
  ]),
  titleUsability: outcomeSchema,
  adultSignals: z.array(z.enum(adultPublicationSignalTokens)),
  adultPublicationOutcome: z.enum(['cleared', 'hidden', 'excluded']),
  format: outcomeSchema,
  year: outcomeSchema,
  episode: outcomeSchema,
  status: outcomeSchema,
  maturity: outcomeSchema,
  duplicate: outcomeSchema,
  relationship: outcomeSchema,
  primaryReview: z.enum(['approved', 'rejected']),
})
const lockedManifestSchema = z.strictObject({
  schema: z.literal('zedarchive.anime-v2-primary-candidate-review-lock'),
  version: z.literal(3),
  candidateReceiptSha256: sha256Schema,
  predecessorReviewResultSha256: sha256Schema,
  retainedPredecessorIdentitySetSha256: sha256Schema,
  predecessorExclusionAuthoritySha256: sha256Schema,
  predecessorCollisionAuditSha256: sha256Schema,
  candidateReviewRoundSha256: sha256Schema,
  verdictSha256: sha256Schema,
  completedResultSha256: sha256Schema,
  manifest: candidateManifestSchema,
  records: z.array(reviewRecordSchema).min(1).max(50),
  lockedResultSha256: sha256Schema,
})
export type LockedCandidateReviewManifest = z.infer<typeof lockedManifestSchema>

const collisionAuditManifestSchema = z.strictObject({
  ordinal: z.number().int().positive(),
  manifestSha256: sha256Schema,
  expectedCollisionCount: z.number().int().nonnegative().max(50),
  collisionSetSha256: sha256Schema,
})
const recoveryCollisionAuditManifestSchema =
  collisionAuditManifestSchema.extend({
    disposition: z.enum(['valid', 'requires-quarantine', 'missing']),
  })
const candidateRecoveryCollisionGeometrySchema = z.strictObject({
  schema: z.literal(
    'zedarchive.anime-v2-candidate-predecessor-recovery-collision-audit',
  ),
  version: z.literal(1),
  candidateReceiptSha256: sha256Schema,
  predecessorReviewResultSha256: sha256Schema,
  retainedPredecessorIdentitySetSha256: sha256Schema,
  predecessorExclusionAuthoritySha256: sha256Schema,
  candidateReviewRoundSha256: sha256Schema,
  records: z.number().int().nonnegative(),
  manifests: z.array(recoveryCollisionAuditManifestSchema),
  collisionCount: z.number().int().nonnegative(),
  collisionManifestCount: z.number().int().nonnegative(),
  revalidatedManifestCount: z.number().int().nonnegative(),
  freshManifestCount: z.number().int().nonnegative(),
  auditSha256: sha256Schema,
})
export type CandidateRecoveryCollisionGeometry = z.infer<
  typeof candidateRecoveryCollisionGeometrySchema
>
export type CandidateRecoveryCollisionGeometryFixtureOptions = Readonly<{
  allowSyntheticLineage: true
}>

const recoveryAuditArtifactCountSchema = z.strictObject({
  verdicts: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  locks: z.number().int().nonnegative(),
})
const recoveryAuditClassificationSchema = z.strictObject({
  missing: z.number().int().nonnegative(),
  valid: z.number().int().nonnegative(),
  requiresQuarantine: z.number().int().nonnegative(),
})
const recoveryAuditManifestResultSchema = z.strictObject({
  ordinal: z.number().int().positive(),
  manifestSha256: sha256Schema,
  collisionCount: z.number().int().nonnegative().max(50),
  collisionSetSha256: sha256Schema,
  verdictSha256: sha256Schema.nullable(),
  verdictBytes: z.number().int().nonnegative().nullable(),
  completedResultSha256: sha256Schema.nullable(),
  completedResultBytes: z.number().int().nonnegative().nullable(),
  lockedResultSha256: sha256Schema.nullable(),
  lockedResultBytes: z.number().int().nonnegative().nullable(),
  status: z.enum(['missing', 'valid', 'requires-quarantine']),
})
/** The sole immutable recovery authority: geometry plus custody-safe evidence. */
export const candidateRecoveryCollisionAuditSchema = z.strictObject({
  schema: z.literal(
    'zedarchive.anime-v2-candidate-predecessor-collision-audit',
  ),
  version: z.literal(1),
  candidateReceiptSha256: sha256Schema,
  acquisitionSha256: sha256Schema,
  predecessorReviewResultSha256: sha256Schema,
  retainedPredecessorIdentitySetSha256: sha256Schema,
  predecessorExclusionAuthoritySha256: sha256Schema,
  records: z.number().int().nonnegative(),
  manifests: z.number().int().nonnegative(),
  collisionRecords: z.number().int().nonnegative(),
  collisionManifests: z.number().int().nonnegative(),
  artifactCounts: recoveryAuditArtifactCountSchema,
  classifications: recoveryAuditClassificationSchema,
  manifestResults: z.array(recoveryAuditManifestResultSchema),
  recoveryAudit: candidateRecoveryCollisionGeometrySchema,
  auditSha256: sha256Schema,
})
export type CandidateRecoveryCollisionAudit = z.infer<
  typeof candidateRecoveryCollisionAuditSchema
>

const activeCollisionAuditManifestSchema = collisionAuditManifestSchema.extend({
  lockedResultSha256: sha256Schema,
  lineage: z.enum(['revalidated', 'fresh']),
})
export const candidateActiveCollisionAuditSchema = z.strictObject({
  schema: z.literal(
    'zedarchive.anime-v2-candidate-predecessor-active-collision-audit',
  ),
  version: z.literal(1),
  recoveryAudit: candidateRecoveryCollisionAuditSchema,
  candidateReceiptSha256: sha256Schema,
  predecessorReviewResultSha256: sha256Schema,
  retainedPredecessorIdentitySetSha256: sha256Schema,
  predecessorExclusionAuthoritySha256: sha256Schema,
  candidateReviewRoundSha256: sha256Schema,
  records: z.number().int().nonnegative(),
  manifests: z.array(activeCollisionAuditManifestSchema),
  collisionCount: z.number().int().nonnegative(),
  collisionManifestCount: z.number().int().nonnegative(),
  correctlyRejectedCollisionCount: z.number().int().nonnegative(),
  violationCount: z.number().int().nonnegative(),
  revalidatedLockCount: z.number().int().nonnegative(),
  freshLockCount: z.number().int().nonnegative(),
  auditSha256: sha256Schema,
})
export type CandidateActiveCollisionAudit = z.infer<
  typeof candidateActiveCollisionAuditSchema
>

const rejectionCategorySchema = z.enum([
  'entity-state',
  'continuity-limit',
  'statement-shape',
  'claim-value',
  'projection-schema',
])
const projectedOutcomeSchema = z.strictObject({
  qid: wikidataQidSchema,
  candidateSha256: sha256Schema,
  manifestSha256: sha256Schema,
  sourceReceiptSha256: sha256Schema,
  revisionWitnessSha256: sha256Schema,
  reductionWitnessSha256: sha256Schema,
  disposition: z.literal('projected'),
  projection: reducedCandidateProjectionSchema,
})
const rejectedOutcomeSchema = z.strictObject({
  qid: wikidataQidSchema,
  candidateSha256: sha256Schema,
  manifestSha256: sha256Schema,
  sourceReceiptSha256: sha256Schema,
  revisionWitnessSha256: sha256Schema,
  reductionWitnessSha256: sha256Schema,
  disposition: z.literal('machine-rejected'),
  category: rejectionCategorySchema,
  rejectionSha256: sha256Schema,
})
export const candidateAcquisitionOutcomeSchema = z.discriminatedUnion(
  'disposition',
  [projectedOutcomeSchema, rejectedOutcomeSchema],
)
export type CandidateAcquisitionOutcome = z.infer<
  typeof candidateAcquisitionOutcomeSchema
>

export function acquisitionOutcomeCommitment(
  outcome: CandidateAcquisitionOutcome,
): string {
  if (outcome.disposition === 'machine-rejected') return outcome.rejectionSha256
  return discoverySha256({
    qid: outcome.qid,
    candidateSha256: outcome.candidateSha256,
    manifestSha256: outcome.manifestSha256,
    sourceReceiptSha256: outcome.sourceReceiptSha256,
    revisionWitnessSha256: outcome.revisionWitnessSha256,
    reductionWitnessSha256: outcome.reductionWitnessSha256,
    disposition: outcome.disposition,
    projectionSha256: outcome.projection.projectionSha256,
  })
}

export const candidateAcquisitionReviewAuthoritySchema = z.strictObject({
  schema: z.literal(
    'zedarchive.anime-v2-candidate-acquisition-review-authority',
  ),
  version: z.literal(3),
  candidateReceiptSha256: sha256Schema,
  predecessorReviewResultSha256: sha256Schema,
  retainedPredecessorIdentitySetSha256: sha256Schema,
  predecessorExclusionAuthoritySha256: sha256Schema,
  candidateReviewRoundSha256: sha256Schema,
  reviewRoundPromotionPlanSha256: sha256Schema,
  activeCollisionAudit: candidateActiveCollisionAuditSchema,
  sourceReceipt: candidateAcquisitionSourceReceiptSchema,
  manifests: z.array(candidateManifestSchema),
  outcomes: z.array(candidateAcquisitionOutcomeSchema),
  lockedReviews: z.array(lockedManifestSchema),
  outcomeSetCommitmentSha256: sha256Schema,
  authoritySha256: sha256Schema,
})
export type CandidateAcquisitionReviewAuthority = z.infer<
  typeof candidateAcquisitionReviewAuthoritySchema
>

function reviewInput(
  record: Pick<
    z.infer<typeof reviewRecordSchema>,
    | 'qid'
    | 'candidateSha256'
    | 'manifestSha256'
    | 'projectionSha256'
    | 'acquisitionOutcomeSha256'
  >,
) {
  return {
    version: 'candidate-primary-review-input.v2',
    qid: record.qid,
    candidateSha256: record.candidateSha256,
    manifestSha256: record.manifestSha256,
    projectionSha256: record.projectionSha256,
    acquisitionOutcomeSha256: record.acquisitionOutcomeSha256,
  }
}
function lockedCore(
  lock: Omit<LockedCandidateReviewManifest, 'lockedResultSha256'>,
) {
  return lock
}

/** Derives the immutable Decision-068 review-round binding used by every v3 lock. */
export function deriveCandidateReviewRoundSha256(
  input: Readonly<{
    candidateReceiptSha256: string
    predecessorReviewResultSha256: string
    retainedPredecessorIdentitySetSha256: string
    predecessorExclusionAuthoritySha256: string
  }>,
): string {
  return discoverySha256({
    version: 'candidate-primary-review-round.v3',
    ...input,
  })
}

function resolvePredecessorExclusionAuthority(
  predecessorReviewResult: unknown,
) {
  const fixture = candidatePredecessorExclusionAuthoritySchema.safeParse(
    predecessorReviewResult,
  )
  if (fixture.success) {
    if (process.env.NODE_ENV !== 'test')
      throw new Error(
        'Fixture predecessor exclusion authority is unavailable to live tooling.',
      )
    const authority = fixture.data
    const derived = deriveCandidatePredecessorExclusionAuthorityForFixture(
      authority.qids,
    )
    if (JSON.stringify(authority) !== JSON.stringify(derived))
      throw new Error(
        'Fixture predecessor exclusion authority is not canonically derived.',
      )
    return authority
  }
  return deriveCandidatePredecessorExclusionAuthority(predecessorReviewResult)
}

function assertLiteralCandidatePredecessorCollisionBaseline(
  receipt: CandidateReceiptLike,
  candidateReceiptSha256: string,
  manifests: readonly CandidateManifest[],
  retainedPredecessorQids: ReadonlySet<string>,
): void {
  if (
    candidateReceiptSha256 !==
      candidateAcquisitionSpecification.candidateReceiptSha256 ||
    receipt.candidates.length !== 7_958 ||
    manifests.length !== 160
  )
    return
  const collisions = receipt.candidates.filter(({ qid }) =>
    retainedPredecessorQids.has(qid),
  )
  const manifestCount = new Set(
    collisions.map(
      ({ qid }) =>
        manifests.find((manifest) => manifest.qids.includes(qid))?.ordinal,
    ),
  ).size
  if (collisions.length !== 499 || manifestCount !== 154)
    throw new Error(
      'Accepted retained predecessor identities do not match the literal candidate collision baseline.',
    )
}

function collisionManifestEvidence(
  receipt: CandidateReceiptLike,
  manifests: readonly CandidateManifest[],
  retainedPredecessorQids: ReadonlySet<string>,
) {
  const evidence = manifests.map((manifest) => ({
    // The digest binds the ordered per-manifest collision set without exposing it.
    // Its order is the immutable candidate-manifest order, never a sorted substitute.
    collisionSetSha256: discoverySha256(
      manifest.qids.filter((qid) => retainedPredecessorQids.has(qid)),
    ),
    ordinal: manifest.ordinal,
    manifestSha256: manifest.manifestSha256,
    expectedCollisionCount: manifest.qids.filter((qid) =>
      retainedPredecessorQids.has(qid),
    ).length,
  }))
  const collisionCount = receipt.candidates.filter(({ qid }) =>
    retainedPredecessorQids.has(qid),
  ).length
  return {
    manifests: evidence,
    collisionCount,
    collisionManifestCount: evidence.filter(
      ({ expectedCollisionCount }) => expectedCollisionCount > 0,
    ).length,
  }
}

/** Re-derives the immutable pre-recovery collision geometry without QIDs. */
export function createCandidateRecoveryCollisionGeometry(
  receipt: CandidateReceiptLike,
  candidateReceiptSha256: string,
  predecessorReviewResult: unknown,
  dispositionsInput?: readonly unknown[],
  fixtureOptions?: CandidateRecoveryCollisionGeometryFixtureOptions,
): CandidateRecoveryCollisionGeometry {
  const predecessorAuthority = resolvePredecessorExclusionAuthority(
    predecessorReviewResult,
  )
  const manifests = deriveCandidateManifests(receipt)
  const retainedPredecessorQids = new Set(predecessorAuthority.qids)
  assertLiteralCandidatePredecessorCollisionBaseline(
    receipt,
    candidateReceiptSha256,
    manifests,
    retainedPredecessorQids,
  )
  const dispositionSchema = z.strictObject({
    ordinal: z.number().int().positive(),
    manifestSha256: sha256Schema,
    disposition: z.enum(['valid', 'requires-quarantine', 'missing']),
  })
  const supplied =
    dispositionsInput === undefined && process.env.NODE_ENV === 'test'
      ? manifests.map(({ ordinal, manifestSha256 }) => ({
          ordinal,
          manifestSha256,
          disposition: 'missing' as const,
        }))
      : z.array(dispositionSchema).parse(dispositionsInput)
  if (
    supplied.length !== manifests.length ||
    JSON.stringify(
      supplied.map(({ ordinal, manifestSha256 }) => ({
        ordinal,
        manifestSha256,
      })),
    ) !==
      JSON.stringify(
        manifests.map(({ ordinal, manifestSha256 }) => ({
          ordinal,
          manifestSha256,
        })),
      )
  )
    throw new Error(
      'Recovery collision audit changed exact manifest lineage order.',
    )
  const recoveryManifests = collisionManifestEvidence(
    receipt,
    manifests,
    retainedPredecessorQids,
  ).manifests.map((manifest, index) => ({
    ...manifest,
    disposition: supplied[index]!.disposition,
  }))
  const revalidatedManifestCount = recoveryManifests.filter(
    ({ disposition }) => disposition === 'valid',
  ).length
  const freshManifestCount = recoveryManifests.length - revalidatedManifestCount
  if (
    fixtureOptions?.allowSyntheticLineage === true &&
    process.env.NODE_ENV !== 'test'
  )
    throw new Error(
      'Synthetic recovery lineage is unavailable to live tooling.',
    )
  if (
    candidateReceiptSha256 ===
      candidateAcquisitionSpecification.candidateReceiptSha256 &&
    receipt.candidates.length === 7_958 &&
    manifests.length === 160 &&
    fixtureOptions?.allowSyntheticLineage !== true &&
    (revalidatedManifestCount !== 41 || freshManifestCount !== 119)
  )
    throw new Error(
      'Recovery collision audit does not preserve the accepted 41/119 lineage.',
    )
  const core = {
    schema:
      'zedarchive.anime-v2-candidate-predecessor-recovery-collision-audit' as const,
    version: 1 as const,
    candidateReceiptSha256,
    predecessorReviewResultSha256:
      predecessorAuthority.predecessorReviewResultSha256,
    retainedPredecessorIdentitySetSha256:
      predecessorAuthority.retainedPredecessorIdentitySetSha256,
    predecessorExclusionAuthoritySha256: predecessorAuthority.authoritySha256,
    candidateReviewRoundSha256: deriveCandidateReviewRoundSha256({
      candidateReceiptSha256,
      predecessorReviewResultSha256:
        predecessorAuthority.predecessorReviewResultSha256,
      retainedPredecessorIdentitySetSha256:
        predecessorAuthority.retainedPredecessorIdentitySetSha256,
      predecessorExclusionAuthoritySha256: predecessorAuthority.authoritySha256,
    }),
    records: receipt.candidates.length,
    ...collisionManifestEvidence(receipt, manifests, retainedPredecessorQids),
    manifests: recoveryManifests,
    revalidatedManifestCount,
    freshManifestCount,
  }
  return candidateRecoveryCollisionGeometrySchema.parse({
    ...core,
    auditSha256: discoverySha256(core),
  })
}

export function validateCandidateRecoveryCollisionGeometry(
  input: unknown,
  receipt: CandidateReceiptLike,
  candidateReceiptSha256: string,
  predecessorReviewResult: unknown,
  dispositionsInput?: readonly unknown[],
  fixtureOptions?: CandidateRecoveryCollisionGeometryFixtureOptions,
): CandidateRecoveryCollisionGeometry {
  const audit = candidateRecoveryCollisionGeometrySchema.parse(input)
  const derived = createCandidateRecoveryCollisionGeometry(
    receipt,
    candidateReceiptSha256,
    predecessorReviewResult,
    dispositionsInput ??
      audit.manifests.map(({ ordinal, manifestSha256, disposition }) => ({
        ordinal,
        manifestSha256,
        disposition,
      })),
    fixtureOptions,
  )
  if (JSON.stringify(audit) !== JSON.stringify(derived))
    throw new Error(
      'Recovery collision audit is not canonically derived from the frozen candidate and predecessor authorities.',
    )
  return derived
}

/** Test-only convenience constructor; live recovery writes the richer audited artifact. */
export function createCandidateRecoveryCollisionAudit(
  receipt: CandidateReceiptLike,
  candidateReceiptSha256: string,
  predecessorReviewResult: unknown,
  acquisitionSha256 = '0'.repeat(64),
  fixtureOptions?: CandidateRecoveryCollisionGeometryFixtureOptions,
): CandidateRecoveryCollisionAudit {
  if (process.env.NODE_ENV !== 'test')
    throw new Error(
      'Fixture recovery collision audit is unavailable to live tooling.',
    )
  const recoveryAudit = createCandidateRecoveryCollisionGeometry(
    receipt,
    candidateReceiptSha256,
    predecessorReviewResult,
    undefined,
    fixtureOptions,
  )
  const manifestResults = recoveryAudit.manifests.map((manifest) => ({
    ordinal: manifest.ordinal,
    manifestSha256: manifest.manifestSha256,
    collisionCount: manifest.expectedCollisionCount,
    collisionSetSha256: manifest.collisionSetSha256,
    verdictSha256: null,
    verdictBytes: null,
    completedResultSha256: null,
    completedResultBytes: null,
    lockedResultSha256: null,
    lockedResultBytes: null,
    status: manifest.disposition,
  }))
  const classifications = {
    missing: manifestResults.filter(({ status }) => status === 'missing')
      .length,
    valid: manifestResults.filter(({ status }) => status === 'valid').length,
    requiresQuarantine: manifestResults.filter(
      ({ status }) => status === 'requires-quarantine',
    ).length,
  }
  const core = {
    schema:
      'zedarchive.anime-v2-candidate-predecessor-collision-audit' as const,
    version: 1 as const,
    candidateReceiptSha256,
    acquisitionSha256,
    predecessorReviewResultSha256: recoveryAudit.predecessorReviewResultSha256,
    retainedPredecessorIdentitySetSha256:
      recoveryAudit.retainedPredecessorIdentitySetSha256,
    predecessorExclusionAuthoritySha256:
      recoveryAudit.predecessorExclusionAuthoritySha256,
    records: recoveryAudit.records,
    manifests: recoveryAudit.manifests.length,
    collisionRecords: recoveryAudit.collisionCount,
    collisionManifests: recoveryAudit.collisionManifestCount,
    artifactCounts: { verdicts: 0, completed: 0, locks: 0 },
    classifications,
    manifestResults,
    recoveryAudit,
  }
  return candidateRecoveryCollisionAuditSchema.parse({
    ...core,
    auditSha256: discoverySha256(core),
  })
}

export function validateCandidateRecoveryCollisionAudit(
  input: unknown,
  receipt: CandidateReceiptLike,
  candidateReceiptSha256: string,
  predecessorReviewResult: unknown,
  fixtureOptions?: CandidateRecoveryCollisionGeometryFixtureOptions,
): CandidateRecoveryCollisionAudit {
  const audit = candidateRecoveryCollisionAuditSchema.parse(input)
  const { auditSha256, ...core } = audit
  if (auditSha256 !== discoverySha256(core))
    throw new Error('Recovery collision audit hash does not match.')
  const geometry = validateCandidateRecoveryCollisionGeometry(
    audit.recoveryAudit,
    receipt,
    candidateReceiptSha256,
    predecessorReviewResult,
    audit.manifestResults.map(({ ordinal, manifestSha256, status }) => ({
      ordinal,
      manifestSha256,
      disposition: status,
    })),
    fixtureOptions,
  )
  const artifactCounts = { verdicts: 0, completed: 0, locks: 0 }
  const classifications = {
    missing: 0,
    valid: 0,
    requiresQuarantine: 0,
  }
  for (const row of audit.manifestResults) {
    const pairs = [
      ['verdicts', row.verdictSha256, row.verdictBytes],
      ['completed', row.completedResultSha256, row.completedResultBytes],
      ['locks', row.lockedResultSha256, row.lockedResultBytes],
    ] as const
    const present = pairs.filter(([, sha256]) => sha256 !== null).length
    if (
      pairs.some(
        ([, sha256, bytes]) => (sha256 === null) !== (bytes === null),
      ) ||
      (row.status === 'missing' && present !== 0) ||
      (row.status === 'valid' && present !== 3) ||
      (row.status === 'requires-quarantine' && present === 0)
    )
      throw new Error(
        'Recovery collision audit has inconsistent custody evidence.',
      )
    for (const [key, sha256] of pairs)
      if (sha256 !== null) artifactCounts[key] += 1
    if (row.status === 'requires-quarantine')
      classifications.requiresQuarantine += 1
    else classifications[row.status] += 1
  }
  if (
    audit.candidateReceiptSha256 !== candidateReceiptSha256 ||
    audit.records !== geometry.records ||
    audit.manifests !== geometry.manifests.length ||
    audit.collisionRecords !== geometry.collisionCount ||
    audit.collisionManifests !== geometry.collisionManifestCount ||
    audit.predecessorReviewResultSha256 !==
      geometry.predecessorReviewResultSha256 ||
    audit.retainedPredecessorIdentitySetSha256 !==
      geometry.retainedPredecessorIdentitySetSha256 ||
    audit.predecessorExclusionAuthoritySha256 !==
      geometry.predecessorExclusionAuthoritySha256 ||
    audit.manifestResults.length !== geometry.manifests.length ||
    JSON.stringify(audit.artifactCounts) !== JSON.stringify(artifactCounts) ||
    JSON.stringify(audit.classifications) !== JSON.stringify(classifications) ||
    JSON.stringify(
      audit.manifestResults.map(
        ({ ordinal, manifestSha256, collisionCount, collisionSetSha256 }) => ({
          ordinal,
          manifestSha256,
          collisionCount,
          collisionSetSha256,
        }),
      ),
    ) !==
      JSON.stringify(
        geometry.manifests.map(
          ({
            ordinal,
            manifestSha256,
            expectedCollisionCount,
            collisionSetSha256,
          }) => ({
            ordinal,
            manifestSha256,
            collisionCount: expectedCollisionCount,
            collisionSetSha256,
          }),
        ),
      )
  )
    throw new Error('Recovery collision audit changed its derived geometry.')
  if (
    candidateReceiptSha256 ===
      candidateAcquisitionSpecification.candidateReceiptSha256 &&
    receipt.candidates.length === 7_958 &&
    geometry.manifests.length === 160 &&
    (audit.artifactCounts.verdicts !== 115 ||
      audit.artifactCounts.completed !== 115 ||
      audit.artifactCounts.locks !== 100 ||
      audit.classifications.valid !== 41 ||
      audit.classifications.requiresQuarantine !== 74 ||
      audit.classifications.missing !== 45)
  )
    throw new Error(
      'Recovery collision audit does not satisfy the accepted 115/115/100 and 41/74/45 recovery scale.',
    )
  return audit
}

/**
 * Re-derives the complete post-review collision audit.  Its summaries are
 * outputs, never caller authority; it records hashes and counts only.
 */
export function createCandidateActiveCollisionAudit(
  receipt: CandidateReceiptLike,
  candidateReceiptSha256: string,
  predecessorReviewResult: unknown,
  recoveryAuditInput: unknown,
  locksInput: readonly unknown[],
): CandidateActiveCollisionAudit {
  const predecessorAuthority = resolvePredecessorExclusionAuthority(
    predecessorReviewResult,
  )
  const recoveryAudit = validateCandidateRecoveryCollisionAudit(
    recoveryAuditInput,
    receipt,
    candidateReceiptSha256,
    predecessorReviewResult,
  )
  const manifests = deriveCandidateManifests(receipt)
  const retainedPredecessorQids = new Set(predecessorAuthority.qids)
  const locks = locksInput.map((lock) => lockedManifestSchema.parse(lock))
  const lockByOrdinal = new Map(
    locks.map((lock) => [lock.manifest.ordinal, lock]),
  )
  if (
    locks.length !== manifests.length ||
    lockByOrdinal.size !== manifests.length ||
    JSON.stringify(locks.map((lock) => lock.manifest.ordinal)) !==
      JSON.stringify(manifests.map((manifest) => manifest.ordinal))
  )
    throw new Error('Active collision audit requires every exact v3 lock.')
  const evidence = collisionManifestEvidence(
    receipt,
    manifests,
    retainedPredecessorQids,
  )
  let correctlyRejectedCollisionCount = 0
  let violationCount = 0
  let revalidatedLockCount = 0
  let freshLockCount = 0
  const activeManifests = manifests.map((manifest, index) => {
    const lock = lockByOrdinal.get(manifest.ordinal)
    if (
      lock === undefined ||
      JSON.stringify(lock.manifest) !== JSON.stringify(manifest) ||
      lock.candidateReceiptSha256 !== candidateReceiptSha256 ||
      lock.predecessorReviewResultSha256 !==
        predecessorAuthority.predecessorReviewResultSha256 ||
      lock.retainedPredecessorIdentitySetSha256 !==
        predecessorAuthority.retainedPredecessorIdentitySetSha256 ||
      lock.predecessorExclusionAuthoritySha256 !==
        predecessorAuthority.authoritySha256 ||
      lock.predecessorCollisionAuditSha256 !== recoveryAudit.auditSha256 ||
      lock.candidateReviewRoundSha256 !==
        recoveryAudit.recoveryAudit.candidateReviewRoundSha256
    )
      throw new Error(
        'Active collision audit found a lock outside recovery authority.',
      )
    const lockCore = lockedCore({
      schema: lock.schema,
      version: lock.version,
      candidateReceiptSha256: lock.candidateReceiptSha256,
      predecessorReviewResultSha256: lock.predecessorReviewResultSha256,
      retainedPredecessorIdentitySetSha256:
        lock.retainedPredecessorIdentitySetSha256,
      predecessorExclusionAuthoritySha256:
        lock.predecessorExclusionAuthoritySha256,
      predecessorCollisionAuditSha256: lock.predecessorCollisionAuditSha256,
      candidateReviewRoundSha256: lock.candidateReviewRoundSha256,
      verdictSha256: lock.verdictSha256,
      completedResultSha256: lock.completedResultSha256,
      manifest: lock.manifest,
      records: lock.records,
    })
    if (lock.lockedResultSha256 !== discoverySha256(lockCore))
      throw new Error('Active collision audit found a lock hash mismatch.')
    if (
      lock.records.length !== manifest.qids.length ||
      JSON.stringify(lock.records.map(({ qid }) => qid)) !==
        JSON.stringify(manifest.qids)
    )
      throw new Error(
        'Active collision audit found a non-canonical lock record order.',
      )
    for (const record of lock.records)
      if (retainedPredecessorQids.has(record.qid)) {
        if (
          record.duplicate === 'rejected' &&
          record.primaryReview === 'rejected'
        )
          correctlyRejectedCollisionCount += 1
        else violationCount += 1
      }
    const recoveryManifest = recoveryAudit.recoveryAudit.manifests[index]
    if (
      recoveryManifest === undefined ||
      recoveryManifest.ordinal !== manifest.ordinal ||
      recoveryManifest.manifestSha256 !== manifest.manifestSha256
    )
      throw new Error(
        'Active collision audit changed recovery manifest lineage.',
      )
    const lineage =
      recoveryManifest.disposition === 'valid' ? 'revalidated' : 'fresh'
    if (lineage === 'revalidated') revalidatedLockCount += 1
    else freshLockCount += 1
    return {
      ...evidence.manifests[index]!,
      lockedResultSha256: lock.lockedResultSha256,
      lineage,
    }
  })
  if (
    candidateReceiptSha256 ===
      candidateAcquisitionSpecification.candidateReceiptSha256 &&
    receipt.candidates.length === 7_958 &&
    manifests.length === 160 &&
    (evidence.collisionCount !== 499 ||
      evidence.collisionManifestCount !== 154 ||
      correctlyRejectedCollisionCount !== 499 ||
      violationCount !== 0 ||
      revalidatedLockCount !== 41 ||
      freshLockCount !== 119)
  )
    throw new Error(
      'Active collision audit does not satisfy the accepted 7,958/160 collision invariant.',
    )
  const core = {
    schema:
      'zedarchive.anime-v2-candidate-predecessor-active-collision-audit' as const,
    version: 1 as const,
    recoveryAudit,
    candidateReceiptSha256,
    predecessorReviewResultSha256:
      predecessorAuthority.predecessorReviewResultSha256,
    retainedPredecessorIdentitySetSha256:
      predecessorAuthority.retainedPredecessorIdentitySetSha256,
    predecessorExclusionAuthoritySha256: predecessorAuthority.authoritySha256,
    candidateReviewRoundSha256:
      recoveryAudit.recoveryAudit.candidateReviewRoundSha256,
    records: receipt.candidates.length,
    manifests: activeManifests,
    collisionCount: evidence.collisionCount,
    collisionManifestCount: evidence.collisionManifestCount,
    correctlyRejectedCollisionCount,
    violationCount,
    revalidatedLockCount,
    freshLockCount,
  }
  return candidateActiveCollisionAuditSchema.parse({
    ...core,
    auditSha256: discoverySha256(core),
  })
}

export function validateCandidateActiveCollisionAudit(
  input: unknown,
  receipt: CandidateReceiptLike,
  candidateReceiptSha256: string,
  predecessorReviewResult: unknown,
  recoveryAuditInput: unknown,
  locksInput: readonly unknown[],
): CandidateActiveCollisionAudit {
  const audit = candidateActiveCollisionAuditSchema.parse(input)
  const derived = createCandidateActiveCollisionAudit(
    receipt,
    candidateReceiptSha256,
    predecessorReviewResult,
    recoveryAuditInput,
    locksInput,
  )
  if (JSON.stringify(audit) !== JSON.stringify(derived))
    throw new Error(
      'Active collision audit is not canonically derived from the complete v3 lock authority.',
    )
  return derived
}

function primaryAggregate(
  records: readonly z.infer<typeof reviewRecordSchema>[],
  retainedPredecessorQids: ReadonlySet<string>,
) {
  const approved = records
    .filter(
      (record) =>
        record.primaryReview === 'approved' &&
        !retainedPredecessorQids.has(record.qid),
    )
    .map(({ qid }) => qid)
  return {
    schema: 'zedarchive.anime-v2-primary-candidate-review' as const,
    version: 1 as const,
    records: records.map((record) => ({
      qid: record.qid,
      candidateSha256: record.candidateSha256,
      machineValidation: record.machineValidation,
      exactWorkIdentity: record.exactWorkIdentity,
      mediaScope: record.mediaScope,
      titleUsability: record.titleUsability,
      adultPublicationSafety:
        record.machineValidation === 'rejected'
          ? 'not-reviewed'
          : record.adultPublicationOutcome === 'cleared'
            ? 'approved'
            : 'rejected',
      primaryReview:
        record.machineValidation === 'rejected'
          ? 'not-reviewed'
          : record.primaryReview,
    })),
    orderedPrimaryApprovedQids: approved,
  }
}

const acceptedDirectFormatClasses = {
  tv: ['Q63952888', 'Q100269041'],
  movie: ['Q20650540'],
  ova: ['Q220898', 'Q113687694'],
  ona: ['Q113671041'],
  special: ['Q117209498'],
} as const

function reducedProjectionFormat(
  projection: ReducedCandidateProjection,
): keyof typeof acceptedDirectFormatClasses | undefined {
  const matches = Object.entries(acceptedDirectFormatClasses).filter(
    ([, qids]) =>
      projection.claims.P31.some(({ value }) => qids.includes(value as never)),
  )
  return matches.length === 1
    ? (matches[0]![0] as keyof typeof acceptedDirectFormatClasses)
    : undefined
}

function validateRecord(
  record: z.infer<typeof reviewRecordSchema>,
  outcome: CandidateAcquisitionOutcome,
  manifest: CandidateManifest,
  candidate: CandidateReceiptLike['candidates'][number],
  retainedPredecessorQids: ReadonlySet<string>,
  phaseObserver?: (phase: CandidatePrimaryAggregatePhase) => void,
) {
  phaseObserver?.('record-binding')
  if (
    record.candidateSha256 !== candidateCommitment(candidate) ||
    record.manifestSha256 !== manifest.manifestSha256 ||
    record.acquisitionOutcomeSha256 !== acquisitionOutcomeCommitment(outcome) ||
    record.reviewInputSha256 !== discoverySha256(reviewInput(record))
  )
    throw new Error(
      'Primary review record lost its acquired authority binding.',
    )
  phaseObserver?.('machine-disposition')
  if (outcome.disposition === 'machine-rejected') {
    if (
      record.projectionSha256 !== null ||
      record.machineValidation !== 'rejected' ||
      record.title !== null ||
      record.adultSignals.length !== 0 ||
      record.adultPublicationOutcome !== 'excluded' ||
      record.primaryReview !== 'rejected' ||
      [
        record.exactWorkIdentity,
        record.mediaScope,
        record.titleUsability,
        record.format,
        record.year,
        record.episode,
        record.status,
        record.maturity,
        record.duplicate,
        record.relationship,
      ].some((value) => value !== 'not-reviewed')
    )
      throw new Error(
        'Machine-rejected review record contains fabricated review evidence.',
      )
    return
  }
  const projection = outcome.projection
  phaseObserver?.('acquired-projection')
  if (record.projectionSha256 !== projection.projectionSha256) {
    throw new Error(
      'Primary review record changed acquired projection authority.',
    )
  }
  phaseObserver?.('retained-collision')
  if (
    retainedPredecessorQids.has(record.qid) &&
    (record.duplicate !== 'rejected' || record.primaryReview !== 'rejected')
  ) {
    throw new Error(
      'Retained predecessor collision must be duplicate-rejected and primary-rejected.',
    )
  }
  if (
    JSON.stringify(record.adultSignals) !==
    JSON.stringify(projection.adultSignals)
  )
    throw new Error('Primary review changed finite adult signals.')
  const title =
    record.title === null
      ? undefined
      : projection.titleCandidates.find(
          (candidateTitle) =>
            candidateTitle.source === record.title!.source &&
            candidateTitle.valueSha256 === record.title!.valueSha256,
        )
  if ((record.titleUsability === 'approved') !== (title !== undefined))
    throw new Error(
      'Primary review title outcome does not match the reduced title projection.',
    )
  const semantic = [
    record.exactWorkIdentity,
    record.mediaScope,
    record.titleUsability,
    record.format,
    record.year,
    record.episode,
    record.status,
    record.maturity,
    record.duplicate,
    record.relationship,
  ]
  phaseObserver?.('adult-outcome')
  if (record.machineValidation === 'rejected')
    throw new Error('Projected candidate cannot use a machine-rejected review.')
  if (
    projection.adultSignals.length === 0 &&
    record.adultPublicationOutcome !== 'cleared'
  ) {
    throw new Error(
      'Unsignalled new candidate must use the cleared adult publication outcome.',
    )
  }
  if (
    projection.adultSignals.length > 0 &&
    (record.adultPublicationOutcome !== 'excluded' ||
      record.primaryReview !== 'rejected')
  ) {
    throw new Error(
      'Signalled candidate cannot clear adult publication without issuer maturity evidence.',
    )
  }
  phaseObserver?.('semantic-completeness')
  if (semantic.some((outcome) => outcome === 'not-reviewed'))
    throw new Error('Machine-approved record has incomplete semantic review.')
  const fullyApproved =
    semantic.every((outcome) => outcome === 'approved') &&
    record.adultPublicationOutcome === 'cleared'
  phaseObserver?.('primary-approval')
  if ((record.primaryReview === 'approved') !== fullyApproved)
    throw new Error(
      'Primary approval does not match complete acquired review outcomes.',
    )
  phaseObserver?.('frozen-format-year')
  if (record.primaryReview === 'approved') {
    if (
      reducedProjectionFormat(projection) !== candidate.format ||
      projection.releaseYear !== candidate.releaseYear
    ) {
      throw new Error(
        'Primary approval conflicts with frozen candidate format or release year.',
      )
    }
  }
}

/** Validates an immutable complete review authority and derives the old selection aggregate. */
export function derivePrimaryCandidateReviewFromAuthority(
  receipt: CandidateReceiptLike,
  candidateReceiptSha256: string,
  input: unknown,
  predecessorReviewResult: unknown,
  phaseObserver?: (phase: CandidatePrimaryAggregatePhase) => void,
) {
  phaseObserver?.('authority-schema')
  const authority = candidateAcquisitionReviewAuthoritySchema.parse(input)
  phaseObserver?.('predecessor-authority')
  const predecessorAuthority = resolvePredecessorExclusionAuthority(
    predecessorReviewResult,
  )
  const retainedPredecessorQids = new Set(predecessorAuthority.qids)
  phaseObserver?.('receipt-binding')
  if (authority.candidateReceiptSha256 !== candidateReceiptSha256)
    throw new Error('Candidate review authority changed the frozen receipt.')
  phaseObserver?.('predecessor-binding')
  if (
    authority.predecessorReviewResultSha256 !==
      predecessorAuthority.predecessorReviewResultSha256 ||
    authority.retainedPredecessorIdentitySetSha256 !==
      predecessorAuthority.retainedPredecessorIdentitySetSha256 ||
    authority.predecessorExclusionAuthoritySha256 !==
      predecessorAuthority.authoritySha256 ||
    authority.candidateReviewRoundSha256 !==
      deriveCandidateReviewRoundSha256({
        candidateReceiptSha256,
        predecessorReviewResultSha256:
          predecessorAuthority.predecessorReviewResultSha256,
        retainedPredecessorIdentitySetSha256:
          predecessorAuthority.retainedPredecessorIdentitySetSha256,
        predecessorExclusionAuthoritySha256:
          predecessorAuthority.authoritySha256,
      })
  )
    throw new Error(
      'Candidate review authority is not bound to the re-derived predecessor exclusion authority.',
    )
  phaseObserver?.('manifest-baseline')
  const manifests = deriveCandidateManifests(receipt)
  assertLiteralCandidatePredecessorCollisionBaseline(
    receipt,
    candidateReceiptSha256,
    manifests,
    retainedPredecessorQids,
  )
  phaseObserver?.('source-receipt')
  const sourceReceipt = parseCandidateAcquisitionSourceReceiptForFixture(
    authority.sourceReceipt,
    receipt,
    candidateReceiptSha256,
  )
  phaseObserver?.('manifest-partition')
  if (JSON.stringify(authority.manifests) !== JSON.stringify(manifests))
    throw new Error(
      'Candidate manifests are not the exact frozen contiguous partition.',
    )
  phaseObserver?.('outcome-coverage')
  const outcomeByQid = new Map(
    authority.outcomes.map((outcome) => [outcome.qid, outcome]),
  )
  if (
    authority.outcomes.length !== receipt.candidates.length ||
    JSON.stringify(authority.outcomes.map(({ qid }) => qid)) !==
      JSON.stringify(receipt.candidates.map(({ qid }) => qid)) ||
    outcomeByQid.size !== receipt.candidates.length ||
    receipt.candidates.some(({ qid }) => !outcomeByQid.has(qid))
  )
    throw new Error('Candidate acquisition is incomplete.')
  phaseObserver?.('outcome-records')
  for (const [index, candidate] of receipt.candidates.entries()) {
    const manifest = manifests[Math.floor(index / 50)]!
    const outcome = outcomeByQid.get(candidate.qid)!
    if (
      outcome.candidateSha256 !== candidateCommitment(candidate) ||
      outcome.manifestSha256 !== manifest.manifestSha256 ||
      outcome.sourceReceiptSha256 !== sourceReceipt.sourceReceiptSha256
    )
      throw new Error(
        'Candidate acquisition outcome changed its frozen binding.',
      )
    if (
      outcome.revisionWitnessSha256 !==
        sourceReceipt.revisionWitnessSha256[index] ||
      outcome.reductionWitnessSha256 !==
        sourceReceipt.reductionWitnessSha256[index]
    )
      throw new Error(
        'Candidate acquisition outcome changed positional witnesses.',
      )
    if (outcome.disposition === 'machine-rejected') {
      const core = {
        qid: outcome.qid,
        candidateSha256: outcome.candidateSha256,
        manifestSha256: outcome.manifestSha256,
        sourceReceiptSha256: outcome.sourceReceiptSha256,
        revisionWitnessSha256: outcome.revisionWitnessSha256,
        reductionWitnessSha256: outcome.reductionWitnessSha256,
        disposition: outcome.disposition,
        category: outcome.category,
      }
      if (outcome.rejectionSha256 !== discoverySha256(core)) {
        throw new Error('Candidate machine rejection hash does not match.')
      }
    } else if (
      outcome.projection.qid !== candidate.qid ||
      outcome.revisionWitnessSha256 !==
        candidateRevisionWitnessSha256(candidate, outcome.projection.revision)
    ) {
      throw new Error('Candidate projection changed its requested QID.')
    }
    if (
      outcome.disposition === 'projected' &&
      outcome.reductionWitnessSha256 !==
        candidateReductionWitnessSha256(candidate, outcome)
    )
      throw new Error('Projected candidate reduction witness does not match.')
    if (
      outcome.disposition === 'machine-rejected' &&
      outcome.reductionWitnessSha256 !==
        candidateReductionWitnessSha256(candidate, outcome)
    )
      throw new Error('Machine rejection reduction witness does not match.')
  }
  phaseObserver?.('acquisition-binding')
  const acquisitionSha256 = discoverySha256({
    schema: 'zedarchive.anime-v2-candidate-acquisition',
    version: 2,
    candidateReceiptSha256,
    manifests: authority.manifests,
    outcomes: authority.outcomes,
    sourceReceipt: authority.sourceReceipt,
  })
  if (
    authority.activeCollisionAudit.recoveryAudit.acquisitionSha256 !==
    acquisitionSha256
  )
    throw new Error(
      'Recovery collision audit is not bound to the exact candidate acquisition authority.',
    )
  phaseObserver?.('lock-coverage')
  const lockByOrdinal = new Map(
    authority.lockedReviews.map((lock) => [lock.manifest.ordinal, lock]),
  )
  if (
    authority.lockedReviews.length !== manifests.length ||
    JSON.stringify(
      authority.lockedReviews.map((lock) => lock.manifest.ordinal),
    ) !== JSON.stringify(manifests.map(({ ordinal }) => ordinal)) ||
    lockByOrdinal.size !== manifests.length
  )
    throw new Error('Candidate primary review locks are incomplete.')
  const records: z.infer<typeof reviewRecordSchema>[] = []
  phaseObserver?.('lock-binding')
  for (const manifest of manifests) {
    const lock = lockByOrdinal.get(manifest.ordinal)
    if (
      !lock ||
      lock.candidateReceiptSha256 !== candidateReceiptSha256 ||
      JSON.stringify(lock.manifest) !== JSON.stringify(manifest)
    )
      throw new Error('Candidate review lock changed its manifest authority.')
    const core = lockedCore({
      schema: lock.schema,
      version: lock.version,
      candidateReceiptSha256: lock.candidateReceiptSha256,
      predecessorReviewResultSha256: lock.predecessorReviewResultSha256,
      retainedPredecessorIdentitySetSha256:
        lock.retainedPredecessorIdentitySetSha256,
      predecessorExclusionAuthoritySha256:
        lock.predecessorExclusionAuthoritySha256,
      predecessorCollisionAuditSha256: lock.predecessorCollisionAuditSha256,
      candidateReviewRoundSha256: lock.candidateReviewRoundSha256,
      verdictSha256: lock.verdictSha256,
      completedResultSha256: lock.completedResultSha256,
      manifest: lock.manifest,
      records: lock.records,
    })
    if (lock.lockedResultSha256 !== discoverySha256(core))
      throw new Error('Candidate review lock hash does not match.')
    if (
      lock.predecessorReviewResultSha256 !==
        predecessorAuthority.predecessorReviewResultSha256 ||
      lock.retainedPredecessorIdentitySetSha256 !==
        predecessorAuthority.retainedPredecessorIdentitySetSha256 ||
      lock.predecessorExclusionAuthoritySha256 !==
        predecessorAuthority.authoritySha256 ||
      lock.predecessorCollisionAuditSha256 !==
        authority.activeCollisionAudit.recoveryAudit.auditSha256 ||
      lock.candidateReviewRoundSha256 !== authority.candidateReviewRoundSha256
    )
      throw new Error(
        'Candidate review lock is not bound to the re-derived predecessor exclusion authority.',
      )
    if (
      lock.records.length !== manifest.qids.length ||
      JSON.stringify(lock.records.map(({ qid }) => qid)) !==
        JSON.stringify(manifest.qids)
    )
      throw new Error(
        'Candidate review lock is not one-to-one with its manifest.',
      )
    lock.records.forEach((record, index) => {
      validateRecord(
        record,
        outcomeByQid.get(record.qid)!,
        manifest,
        receipt.candidates.find(({ qid }) => qid === manifest.qids[index])!,
        retainedPredecessorQids,
        phaseObserver,
      )
      records.push(record)
    })
  }
  phaseObserver?.('active-collision-audit')
  validateCandidateActiveCollisionAudit(
    authority.activeCollisionAudit,
    receipt,
    candidateReceiptSha256,
    predecessorReviewResult,
    authority.activeCollisionAudit.recoveryAudit,
    authority.lockedReviews,
  )
  phaseObserver?.('aggregate-construction')
  const aggregate = primaryAggregate(records, retainedPredecessorQids)
  const orderedPrimaryApprovedQids = receipt.candidates
    .filter(({ qid }) => aggregate.orderedPrimaryApprovedQids.includes(qid))
    .sort((left, right) =>
      compareAudienceCandidates(
        left as Parameters<typeof compareAudienceCandidates>[0],
        right as Parameters<typeof compareAudienceCandidates>[1],
      ),
    )
    .map(({ qid }) => qid)
  const aggregateCore = {
    ...aggregate,
    candidateReceiptSha256,
    orderedPrimaryApprovedQids,
    orderedPrimaryApprovedQidsSha256: discoverySha256(
      orderedPrimaryApprovedQids,
    ),
  }
  const core = {
    schema: authority.schema,
    version: authority.version,
    candidateReceiptSha256: authority.candidateReceiptSha256,
    predecessorReviewResultSha256: authority.predecessorReviewResultSha256,
    retainedPredecessorIdentitySetSha256:
      authority.retainedPredecessorIdentitySetSha256,
    predecessorExclusionAuthoritySha256:
      authority.predecessorExclusionAuthoritySha256,
    candidateReviewRoundSha256: authority.candidateReviewRoundSha256,
    reviewRoundPromotionPlanSha256: authority.reviewRoundPromotionPlanSha256,
    activeCollisionAudit: authority.activeCollisionAudit,
    sourceReceipt: authority.sourceReceipt,
    manifests: authority.manifests,
    outcomes: authority.outcomes,
    lockedReviews: authority.lockedReviews,
    outcomeSetCommitmentSha256: authority.outcomeSetCommitmentSha256,
  }
  phaseObserver?.('outcome-set-commitment')
  const outcomeSetCommitmentSha256 = discoverySha256({
    version: 'candidate-acquisition-outcome-set.v1',
    outcomes: authority.outcomes.map(acquisitionOutcomeCommitment),
  })
  if (authority.outcomeSetCommitmentSha256 !== outcomeSetCommitmentSha256)
    throw new Error(
      'Candidate acquisition outcome-set commitment does not match.',
    )
  phaseObserver?.('authority-commitment')
  if (authority.authoritySha256 !== discoverySha256(core))
    throw new Error(
      'Candidate acquisition/review authority hash does not match.',
    )
  return aggregateCore
}

/** Pure seam used by the live aggregate parser and bounded fixtures alike. */
export function validatePrimaryCandidateReviewAuthorityForFixture(
  aggregate: unknown,
  receipt: CandidateReceiptLike,
  candidateReceiptSha256: string,
  authority: unknown,
  predecessorReviewResult: unknown,
) {
  const derived = derivePrimaryCandidateReviewFromAuthority(
    receipt,
    candidateReceiptSha256,
    authority,
    predecessorReviewResult,
  )
  if (JSON.stringify(aggregate) !== JSON.stringify(derived)) {
    throw new Error(
      'Primary candidate review aggregate is not derived from locked acquisition authority.',
    )
  }
  return derived
}

/** Checks the remaining-review reserve without selecting or approving anything. */
export function assertCandidateReviewReserveFeasibility(
  receipt: CandidateReceiptLike,
  records: readonly Readonly<{
    qid: string
    machineValidation: string
    primaryReview: string
  }>[],
  input: Readonly<{
    publishedTarget: number
    publishablePredecessorCount: number
    publishablePredecessorQids: readonly string[]
    retainedPredecessorQids: readonly string[]
    predecessorFormatCounts: Readonly<Record<string, number>>
    predecessorEraCounts: Readonly<Record<string, number>>
    predecessorAudienceCount: number
    predecessorUnknownYearCount: number
    audienceAnchorCount: number
    unknownYearMaximum: number
    formatFloors: Readonly<Record<string, number>>
    eraFloors: Readonly<Record<string, number>>
  }>,
): void {
  const publishablePredecessorQids = new Set(input.publishablePredecessorQids)
  const retainedPredecessorQids = new Set(input.retainedPredecessorQids)
  if (
    publishablePredecessorQids.size !==
      input.publishablePredecessorQids.length ||
    publishablePredecessorQids.size !== input.publishablePredecessorCount
  ) {
    throw new Error(
      'Publishable predecessor QIDs must be unique and match their supplied count.',
    )
  }
  if (
    retainedPredecessorQids.size !== input.retainedPredecessorQids.length ||
    retainedPredecessorQids.size !== 500 ||
    [...publishablePredecessorQids].some(
      (qid) => !retainedPredecessorQids.has(qid),
    )
  )
    throw new Error(
      'Retained predecessor QIDs must contain exactly 500 unique identities including every publishable predecessor.',
    )
  const byQid = new Map(records.map((record) => [record.qid, record]))
  const possible = receipt.candidates.filter((candidate) => {
    if (retainedPredecessorQids.has(candidate.qid)) return false
    const record = byQid.get(candidate.qid)
    return (
      record === undefined ||
      (record.machineValidation === 'approved' &&
        record.primaryReview === 'approved')
    )
  })
  if (
    possible.length + input.publishablePredecessorCount <
    input.publishedTarget
  ) {
    throw new Error(
      'Remaining candidate reserve cannot reach the published target.',
    )
  }
  const audience = possible.filter(
    ({ englishBand, japaneseBand }) =>
      englishBand !== 'unavailable' || japaneseBand !== 'unavailable',
  )
  if (
    audience.length + input.predecessorAudienceCount <
    input.audienceAnchorCount
  )
    throw new Error('Remaining reserve cannot supply every audience anchor.')
  const requiredCandidates =
    input.publishedTarget - input.publishablePredecessorCount
  const nonUnknown = possible.filter(({ era }) => era !== 'unknown').length
  const minimumNewUnknown = Math.max(0, requiredCandidates - nonUnknown)
  if (
    input.predecessorUnknownYearCount + minimumNewUnknown >
    input.unknownYearMaximum
  ) {
    throw new Error(
      'Remaining reserve cannot satisfy the unknown-year maximum.',
    )
  }
  for (const [format, floor] of Object.entries(input.formatFloors))
    if (
      possible.filter((candidate) => candidate.format === format).length +
        (input.predecessorFormatCounts[format] ?? 0) <
      floor
    )
      throw new Error('Remaining reserve cannot satisfy a format floor.')
  for (const [era, floor] of Object.entries(input.eraFloors))
    if (
      possible.filter((candidate) => candidate.era === era).length +
        (input.predecessorEraCounts[era] ?? 0) <
      floor
    )
      throw new Error('Remaining reserve cannot satisfy an era floor.')
}

export function createLockedCandidateReviewManifest(
  input: Omit<LockedCandidateReviewManifest, 'lockedResultSha256'>,
): LockedCandidateReviewManifest {
  const core = {
    schema: input.schema,
    version: input.version,
    candidateReceiptSha256: input.candidateReceiptSha256,
    predecessorReviewResultSha256: input.predecessorReviewResultSha256,
    retainedPredecessorIdentitySetSha256:
      input.retainedPredecessorIdentitySetSha256,
    predecessorExclusionAuthoritySha256:
      input.predecessorExclusionAuthoritySha256,
    predecessorCollisionAuditSha256: input.predecessorCollisionAuditSha256,
    candidateReviewRoundSha256: input.candidateReviewRoundSha256,
    verdictSha256: input.verdictSha256,
    completedResultSha256: input.completedResultSha256,
    manifest: input.manifest,
    records: input.records,
  }
  return lockedManifestSchema.parse({
    ...core,
    lockedResultSha256: discoverySha256(lockedCore(core)),
  })
}

export function createCandidateAcquisitionReviewAuthority(
  input: Omit<
    CandidateAcquisitionReviewAuthority,
    'authoritySha256' | 'outcomeSetCommitmentSha256'
  >,
): CandidateAcquisitionReviewAuthority {
  const complete = {
    schema: input.schema,
    version: input.version,
    candidateReceiptSha256: input.candidateReceiptSha256,
    predecessorReviewResultSha256: input.predecessorReviewResultSha256,
    retainedPredecessorIdentitySetSha256:
      input.retainedPredecessorIdentitySetSha256,
    predecessorExclusionAuthoritySha256:
      input.predecessorExclusionAuthoritySha256,
    candidateReviewRoundSha256: input.candidateReviewRoundSha256,
    reviewRoundPromotionPlanSha256: input.reviewRoundPromotionPlanSha256,
    activeCollisionAudit: input.activeCollisionAudit,
    sourceReceipt: input.sourceReceipt,
    manifests: input.manifests,
    outcomes: input.outcomes,
    lockedReviews: input.lockedReviews,
    outcomeSetCommitmentSha256: discoverySha256({
      version: 'candidate-acquisition-outcome-set.v1',
      outcomes: input.outcomes.map(acquisitionOutcomeCommitment),
    }),
  }
  return candidateAcquisitionReviewAuthoritySchema.parse({
    ...complete,
    authoritySha256: discoverySha256(complete),
  })
}

/** Fails closed unless the independently reviewed immutable commitments exist. */
export function assertAcceptedCandidateAcquisitionReviewAuthority(
  receipt: CandidateReceiptLike,
  candidateReceiptSha256: string,
  authority: unknown,
  predecessorReviewResult: unknown,
): CandidateAcquisitionReviewAuthority {
  const parsed = candidateAcquisitionReviewAuthoritySchema.parse(authority)
  derivePrimaryCandidateReviewFromAuthority(
    receipt,
    candidateReceiptSha256,
    parsed,
    predecessorReviewResult,
  )
  if (
    candidateReceiptSha256 !==
      candidateAcquisitionSpecification.candidateReceiptSha256 ||
    receipt.candidates.length !== 7_958 ||
    parsed.manifests.length !==
      candidateAcquisitionSpecification.manifestCount ||
    acceptedCandidateAcquisitionSourceReceiptSha256 === null ||
    acceptedCandidateAcquisitionReviewAuthoritySha256 === null ||
    acceptedCandidateRecoveryCollisionAuditSha256 === null ||
    acceptedCandidateReviewRoundTwoPromotionPlanSha256 === null ||
    parsed.sourceReceipt.sourceReceiptSha256 !==
      acceptedCandidateAcquisitionSourceReceiptSha256 ||
    parsed.authoritySha256 !==
      acceptedCandidateAcquisitionReviewAuthoritySha256 ||
    parsed.activeCollisionAudit.recoveryAudit.auditSha256 !==
      acceptedCandidateRecoveryCollisionAuditSha256 ||
    parsed.reviewRoundPromotionPlanSha256 !==
      acceptedCandidateReviewRoundTwoPromotionPlanSha256
  ) {
    throw new Error(
      'Candidate acquisition/review authority has not received independent acceptance.',
    )
  }
  return parsed
}

export function acceptedCandidateProjectionSha256(
  receipt: CandidateReceiptLike,
  candidateReceiptSha256: string,
  authority: unknown,
  predecessorReviewResult: unknown,
  qid: string,
): string {
  const accepted = assertAcceptedCandidateAcquisitionReviewAuthority(
    receipt,
    candidateReceiptSha256,
    authority,
    predecessorReviewResult,
  )
  const outcome = accepted.outcomes.find((value) => value.qid === qid)
  if (outcome?.disposition !== 'projected') {
    throw new Error(
      'Proposed identity has no accepted projected candidate authority.',
    )
  }
  return outcome.projection.projectionSha256
}

export const candidatePrimaryReviewRecordSchema = reviewRecordSchema

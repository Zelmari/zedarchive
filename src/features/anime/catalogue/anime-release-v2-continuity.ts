import { z } from '@/config/zod'
import { acceptedDiscoveryCandidateReceiptSha256 } from '@/features/anime/catalogue/anime-successor-predecessor-review'
import {
  deriveIndependentSampleSeed,
  replacementLineageSha256,
  validateReplacementLineage,
  type ReplacementLineageEntry,
} from '@/features/anime/catalogue/anime-release-v2-lineage'
import {
  compareAudienceCandidates,
  compareDiscoveryQids,
  discoverySha256,
  discoverySpecificationHashes,
  discoveryWindow,
} from '@/features/anime/catalogue/wikidata-anime-discovery'
import {
  assertAcceptedCandidateAcquisitionReviewAuthority,
  validatePrimaryCandidateReviewAuthorityForFixture,
} from '@/features/anime/catalogue/anime-v2-candidate-acquisition'
import {
  deriveCandidatePredecessorExclusionAuthority,
  predecessorReviewResultSchema,
} from '@/features/anime/catalogue/anime-successor-predecessor-review'
import {
  wikidataQidSchema,
  wikidataStatementSchema,
  type WikidataEntity,
} from '@/integrations/wikidata/wikidata-entity'

export const acceptedSelectionRubricV2Sha256 =
  'dc606cb0c7571e47c3ab6b632dcc3961fa92c4c5eb5a114909071d56a148c3da' as const

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const pageviewBandSchema = z.enum([
  'top-1-percent',
  'top-5-percent',
  'top-20-percent',
  'remainder',
  'unavailable',
])
const sitelinkBandSchema = z.enum(['50-plus', '20-to-49', '5-to-19', '0-to-4'])
const formatSchema = z.enum(['tv', 'movie', 'ova', 'ona', 'special'])
const eraSchema = z.enum([
  'before-1980',
  '1980-1989',
  '1990-1999',
  '2000-2009',
  '2010-2019',
  '2020-2026',
  'unknown',
  'after-2026',
])

const candidateSchema = z.strictObject({
  qid: wikidataQidSchema,
  format: formatSchema,
  releaseYear: z.number().int().min(1).max(9999).nullable(),
  era: eraSchema,
  englishArticle: z.string().nullable(),
  japaneseArticle: z.string().nullable(),
  englishTotal: z.number().int().nonnegative().nullable(),
  japaneseTotal: z.number().int().nonnegative().nullable(),
  englishBand: pageviewBandSchema,
  japaneseBand: pageviewBandSchema,
  sitelinkCount: z.number().int().nonnegative(),
  sitelinkBand: sitelinkBandSchema,
  englishMappingInputSha256: sha256Schema,
  japaneseMappingInputSha256: sha256Schema,
})
const identityBlockedSchema = z.strictObject({
  qid: wikidataQidSchema,
  disposition: z.literal('identity-blocked'),
  dispositionSha256: sha256Schema,
})
const requestEvidenceSchema = z.strictObject({
  attempts: z.number().int().nonnegative(),
  successfulPageviews: z.number().int().nonnegative(),
  retries: z.number().int().nonnegative(),
  pacingWaits: z.number().int().nonnegative(),
  pacingDelayMilliseconds: z.number().int().nonnegative(),
  elapsedMilliseconds: z.number().int().nonnegative(),
  maximumConcurrency: z.literal(1),
})

export const acceptedCandidateReceiptSchema = z.strictObject({
  schema: z.literal('zedarchive.anime-discovery-candidate-receipt'),
  version: z.literal(1),
  release: z.literal('anime-v2'),
  executedAt: z.iso.datetime(),
  window: z.strictObject({
    start: z.literal(discoveryWindow.start),
    end: z.literal(discoveryWindow.end),
  }),
  specificationHashes: z.strictObject({
    query: z.literal(discoverySpecificationHashes.query),
    mapping: z.literal(discoverySpecificationHashes.mapping),
    aggregation: z.literal(discoverySpecificationHashes.aggregation),
    bands: z.literal(discoverySpecificationHashes.bands),
    ordering: z.literal(discoverySpecificationHashes.ordering),
    reasonCodes: z.literal(discoverySpecificationHashes.reasonCodes),
  }),
  providerResponseSetSha256: sha256Schema,
  requestEvidence: requestEvidenceSchema,
  identityBlocked: z.array(identityBlockedSchema),
  candidates: z.array(candidateSchema),
})
export type AcceptedCandidateReceipt = z.infer<
  typeof acceptedCandidateReceiptSchema
>
export type AcceptedCandidate = z.infer<typeof candidateSchema>

export function parseAcceptedCandidateReceipt(
  input: unknown,
): AcceptedCandidateReceipt {
  const receipt = acceptedCandidateReceiptSchema.parse(input)
  if (discoverySha256(receipt) !== acceptedDiscoveryCandidateReceiptSha256) {
    throw new Error(
      'Candidate receipt does not match the accepted frozen receipt hash.',
    )
  }
  const qids = [
    ...receipt.candidates.map(({ qid }) => qid),
    ...receipt.identityBlocked.map(({ qid }) => qid),
  ]
  if (new Set(qids).size !== qids.length) {
    throw new Error('Accepted candidate receipt QIDs must be globally unique.')
  }
  return receipt
}

export function reducedCandidateCommitment(
  candidate: AcceptedCandidate,
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

const primaryCandidateRecordSchema = z.strictObject({
  qid: wikidataQidSchema,
  candidateSha256: sha256Schema,
  machineValidation: z.enum(['approved', 'rejected']),
  exactWorkIdentity: z.enum(['approved', 'rejected', 'not-reviewed']),
  mediaScope: z.enum(['approved', 'rejected', 'not-reviewed']),
  titleUsability: z.enum(['approved', 'rejected', 'not-reviewed']),
  adultPublicationSafety: z.enum(['approved', 'rejected', 'not-reviewed']),
  primaryReview: z.enum(['approved', 'rejected', 'not-reviewed']),
})
export const primaryCandidateReviewResultSchema = z.strictObject({
  schema: z.literal('zedarchive.anime-v2-primary-candidate-review'),
  version: z.literal(1),
  candidateReceiptSha256: z.literal(acceptedDiscoveryCandidateReceiptSha256),
  records: z.array(primaryCandidateRecordSchema),
  orderedPrimaryApprovedQids: z.array(wikidataQidSchema),
  orderedPrimaryApprovedQidsSha256: sha256Schema,
})
export type PrimaryCandidateReviewResult = z.infer<
  typeof primaryCandidateReviewResultSchema
>

export function parsePrimaryCandidateReviewResult(
  input: unknown,
  receiptInput: unknown,
  candidateAcquisitionReviewAuthority: unknown,
  predecessorReviewResult: unknown,
): PrimaryCandidateReviewResult {
  const receipt = parseAcceptedCandidateReceipt(receiptInput)
  const result = primaryCandidateReviewResultSchema.parse(input)
  assertAcceptedCandidateAcquisitionReviewAuthority(
    receipt,
    acceptedDiscoveryCandidateReceiptSha256,
    candidateAcquisitionReviewAuthority,
    predecessorReviewResult,
  )
  validatePrimaryCandidateReviewAuthorityForFixture(
    result,
    receipt,
    acceptedDiscoveryCandidateReceiptSha256,
    candidateAcquisitionReviewAuthority,
    predecessorReviewResult,
  )
  if (result.records.length !== receipt.candidates.length) {
    throw new Error(
      'Primary candidate review must cover every frozen candidate.',
    )
  }
  const candidates = new Map(
    receipt.candidates.map((candidate) => [candidate.qid, candidate]),
  )
  const recordQids = new Set<string>()
  const approved: AcceptedCandidate[] = []
  for (const record of result.records) {
    const candidate = candidates.get(record.qid)
    if (candidate === undefined || recordQids.has(record.qid)) {
      throw new Error(
        'Primary candidate review QIDs must map one-to-one to the receipt.',
      )
    }
    recordQids.add(record.qid)
    if (record.candidateSha256 !== reducedCandidateCommitment(candidate)) {
      throw new Error(
        'Primary candidate review candidate commitment does not match.',
      )
    }
    const fullyApproved =
      record.machineValidation === 'approved' &&
      record.exactWorkIdentity === 'approved' &&
      record.mediaScope === 'approved' &&
      record.titleUsability === 'approved' &&
      record.adultPublicationSafety === 'approved' &&
      record.primaryReview === 'approved'
    if (record.machineValidation === 'rejected') {
      if (
        record.exactWorkIdentity !== 'not-reviewed' ||
        record.mediaScope !== 'not-reviewed' ||
        record.titleUsability !== 'not-reviewed' ||
        record.adultPublicationSafety !== 'not-reviewed' ||
        record.primaryReview !== 'not-reviewed'
      ) {
        throw new Error(
          'Machine-rejected candidate contains fabricated semantic review.',
        )
      }
    } else if (!fullyApproved && record.primaryReview !== 'rejected') {
      throw new Error(
        'Non-approved machine candidate needs a closed primary rejection.',
      )
    }
    if (fullyApproved) approved.push(candidate)
  }
  const orderedApproved = [...approved]
    .sort(compareAudienceCandidates)
    .map(({ qid }) => qid)
  if (
    JSON.stringify(orderedApproved) !==
      JSON.stringify(result.orderedPrimaryApprovedQids) ||
    discoverySha256(orderedApproved) !== result.orderedPrimaryApprovedQidsSha256
  ) {
    throw new Error(
      'Primary-approved candidate commitment or audience order changed.',
    )
  }
  return result
}

const relationProperties = ['P155', 'P156'] as const
const reducedRelationEndpointSchema = z.strictObject({
  relatedQid: wikidataQidSchema,
  properties: z.array(z.enum(relationProperties)).min(1).max(2),
  reducedStatementProjectionSha256: sha256Schema,
})
const reducedAnchorResponseSchema = z.strictObject({
  anchorQid: wikidataQidSchema,
  revision: z.number().int().positive(),
  related: z.array(reducedRelationEndpointSchema).max(8),
})
export const reducedContinuityAcquisitionSchema = z.strictObject({
  schema: z.literal('zedarchive.anime-v2-continuity-acquisition'),
  version: z.literal(1),
  candidateReceiptSha256: z.literal(acceptedDiscoveryCandidateReceiptSha256),
  selectionRubricSha256: z.literal(acceptedSelectionRubricV2Sha256),
  anchorQids: z.array(wikidataQidSchema).length(250),
  responses: z.array(reducedAnchorResponseSchema).length(250),
  orderedRequestCommitmentSha256: sha256Schema,
  reducedResponseSetCommitmentSha256: sha256Schema,
  revisionSetCommitmentSha256: sha256Schema,
  acquisitionSha256: sha256Schema,
})
export type ReducedContinuityAcquisition = z.infer<
  typeof reducedContinuityAcquisitionSchema
>

function reducedEndpointProjection(
  anchorQid: string,
  relatedQid: string,
  properties: readonly (typeof relationProperties)[number][],
) {
  return { anchorQid, relatedQid, properties }
}

function acquisitionCommitments(
  anchorQids: readonly string[],
  responses: readonly z.infer<typeof reducedAnchorResponseSchema>[],
) {
  return {
    orderedRequestCommitmentSha256: discoverySha256({
      version: 'continuity-request.v1',
      anchorQids,
    }),
    reducedResponseSetCommitmentSha256: discoverySha256({
      version: 'continuity-reduced-response-set.v1',
      responses,
    }),
    revisionSetCommitmentSha256: discoverySha256({
      version: 'continuity-revision-set.v1',
      revisions: responses.map(({ anchorQid, revision }) => ({
        anchorQid,
        revision,
      })),
    }),
  }
}

export function createReducedContinuityAcquisition(
  input: Readonly<{
    anchorQids: readonly string[]
    entities: readonly WikidataEntity[]
  }>,
): ReducedContinuityAcquisition {
  const anchorQids = z
    .array(wikidataQidSchema)
    .length(250)
    .parse(input.anchorQids)
  if (new Set(anchorQids).size !== 250)
    throw new Error('Continuity acquisition anchors must be unique.')
  if (input.entities.length !== 250)
    throw new Error(
      'Continuity acquisition needs exactly one response per anchor.',
    )
  const entities = new Map(input.entities.map((entity) => [entity.id, entity]))
  if (entities.size !== 250 || anchorQids.some((qid) => !entities.has(qid)))
    throw new Error(
      'Continuity responses must map one-to-one to requested anchors.',
    )
  const responses = anchorQids.map((anchorQid) => {
    const entity = entities.get(anchorQid)!
    if (
      entity.missing !== undefined ||
      entity.redirect !== undefined ||
      entity.type !== 'item'
    )
      throw new Error(
        'Continuity anchor response must be a direct Wikidata item.',
      )
    if (!Number.isSafeInteger(entity.lastrevid) || (entity.lastrevid ?? 0) <= 0)
      throw new Error(
        'Continuity anchor response must include a positive revision.',
      )
    const related = new Map<string, Set<(typeof relationProperties)[number]>>()
    for (const property of relationProperties) {
      for (const raw of entity.claims[property] ?? []) {
        const statement = wikidataStatementSchema.parse(raw)
        if (statement.mainsnak.property !== property)
          throw new Error(
            'Continuity statement property changed its claim bucket.',
          )
        if (
          statement.rank === 'deprecated' ||
          statement.mainsnak.snaktype !== 'value'
        )
          continue
        const value = statement.mainsnak.datavalue?.value
        if (
          statement.mainsnak.datatype !== 'wikibase-item' ||
          statement.mainsnak.datavalue?.type !== 'wikibase-entityid' ||
          value === null ||
          typeof value !== 'object' ||
          !('entity-type' in value) ||
          (value as { 'entity-type': unknown })['entity-type'] !== 'item'
        )
          throw new Error(
            'Continuity value statement must directly name a Wikidata item.',
          )
        const relatedQid =
          'id' in value
            ? wikidataQidSchema.parse((value as { id: unknown }).id)
            : undefined
        if (relatedQid === undefined)
          throw new Error(
            'Continuity value statement must directly name a Wikidata item.',
          )
        const properties = related.get(relatedQid) ?? new Set()
        properties.add(property)
        related.set(relatedQid, properties)
      }
    }
    const endpoints = [...related]
      .sort(([left], [right]) => compareDiscoveryQids(left, right))
      .map(([relatedQid, propertySet]) => {
        const properties = [...propertySet].sort()
        return {
          relatedQid,
          properties,
          reducedStatementProjectionSha256: discoverySha256(
            reducedEndpointProjection(anchorQid, relatedQid, properties),
          ),
        }
      })
    if (endpoints.length > 8)
      throw new Error('Continuity anchor exceeded eight unique endpoints.')
    return { anchorQid, revision: entity.lastrevid!, related: endpoints }
  })
  const commitments = acquisitionCommitments(anchorQids, responses)
  const core = {
    schema: 'zedarchive.anime-v2-continuity-acquisition' as const,
    version: 1 as const,
    candidateReceiptSha256: acceptedDiscoveryCandidateReceiptSha256,
    selectionRubricSha256: acceptedSelectionRubricV2Sha256,
    anchorQids,
    responses,
    ...commitments,
  }
  return reducedContinuityAcquisitionSchema.parse({
    ...core,
    acquisitionSha256: discoverySha256(core),
  })
}

export function parseReducedContinuityAcquisition(
  input: unknown,
  expectedAnchorQids: readonly string[],
): ReducedContinuityAcquisition {
  const acquisition = reducedContinuityAcquisitionSchema.parse(input)
  if (
    JSON.stringify(acquisition.anchorQids) !==
      JSON.stringify(expectedAnchorQids) ||
    new Set(acquisition.anchorQids).size !== 250
  )
    throw new Error('Continuity acquisition changed the exact anchor sequence.')
  let pairCount = 0
  acquisition.responses.forEach((response, index) => {
    if (response.anchorQid !== acquisition.anchorQids[index])
      throw new Error('Continuity responses must retain request order.')
    const endpointQids = response.related.map(({ relatedQid }) => relatedQid)
    if (
      new Set(endpointQids).size !== endpointQids.length ||
      JSON.stringify([...endpointQids].sort(compareDiscoveryQids)) !==
        JSON.stringify(endpointQids)
    )
      throw new Error(
        'Reduced continuity endpoints must be unique and ordered.',
      )
    for (const endpoint of response.related) {
      if (
        JSON.stringify([...endpoint.properties].sort()) !==
          JSON.stringify(endpoint.properties) ||
        new Set(endpoint.properties).size !== endpoint.properties.length ||
        endpoint.reducedStatementProjectionSha256 !==
          discoverySha256(
            reducedEndpointProjection(
              response.anchorQid,
              endpoint.relatedQid,
              endpoint.properties,
            ),
          )
      )
        throw new Error(
          'Reduced continuity endpoint commitment does not match.',
        )
      pairCount += 1
    }
  })
  if (pairCount > 2_000)
    throw new Error('Continuity acquisition exceeded 2,000 pairs.')
  const commitments = acquisitionCommitments(
    acquisition.anchorQids,
    acquisition.responses,
  )
  if (
    acquisition.orderedRequestCommitmentSha256 !==
      commitments.orderedRequestCommitmentSha256 ||
    acquisition.reducedResponseSetCommitmentSha256 !==
      commitments.reducedResponseSetCommitmentSha256 ||
    acquisition.revisionSetCommitmentSha256 !==
      commitments.revisionSetCommitmentSha256
  )
    throw new Error(
      'Continuity acquisition aggregate commitment does not match.',
    )
  const { acquisitionSha256, ...core } = acquisition
  if (acquisitionSha256 !== discoverySha256(core))
    throw new Error('Continuity acquisition canonical hash does not match.')
  return acquisition
}

const continuityDispositionSchema = z.enum([
  'outside-frozen-receipt',
  'identity-blocked',
  'machine-rejected',
  'primary-review-rejected',
  'primary-approved',
  'predecessor-approved',
])
const relatedEndpointSchema = z.strictObject({
  relatedQid: wikidataQidSchema,
  properties: z
    .array(z.enum(['P155', 'P156']))
    .min(1)
    .max(2),
  reducedStatementProjectionSha256: sha256Schema,
  disposition: continuityDispositionSchema,
})
const anchorAuditSchema = z.strictObject({
  anchorQid: wikidataQidSchema,
  related: z.array(relatedEndpointSchema).max(8),
})
export const continuityPreparationSchema = z.strictObject({
  schema: z.literal('zedarchive.anime-v2-continuity-preparation'),
  version: z.literal(1),
  candidateReceiptSha256: z.literal(acceptedDiscoveryCandidateReceiptSha256),
  selectionRubricSha256: z.literal(acceptedSelectionRubricV2Sha256),
  primaryApprovedCandidateSetSha256: sha256Schema,
  continuityEligibleCandidateSetSha256: sha256Schema,
  acquisitionSha256: sha256Schema,
  anchorQids: z.array(wikidataQidSchema).length(250),
  anchorAudits: z.array(anchorAuditSchema).length(250),
  orderedRequestCommitmentSha256: sha256Schema,
  reducedResponseSetCommitmentSha256: sha256Schema,
  revisionSetCommitmentSha256: sha256Schema,
})
export type ContinuityPreparation = z.infer<typeof continuityPreparationSchema>

export function primaryApprovedContinuityQids(
  preparation: ContinuityPreparation,
): ReadonlySet<string> {
  return new Set(
    preparation.anchorAudits.flatMap(({ related }) =>
      related
        .filter(
          ({ disposition }) =>
            disposition === 'primary-approved' ||
            disposition === 'predecessor-approved',
        )
        .map(({ relatedQid }) => relatedQid),
    ),
  )
}

function endpointDisposition(
  qid: string,
  receipt: AcceptedCandidateReceipt,
  primary: PrimaryCandidateReviewResult,
  continuityEligibleQids: ReadonlySet<string>,
  receiptResidentPublishedPredecessorQids: ReadonlySet<string>,
): z.infer<typeof continuityDispositionSchema> {
  if (receipt.identityBlocked.some((candidate) => candidate.qid === qid)) {
    return 'identity-blocked'
  }
  if (!receipt.candidates.some((candidate) => candidate.qid === qid)) {
    return 'outside-frozen-receipt'
  }
  const review = primary.records.find((record) => record.qid === qid)!
  if (review.machineValidation === 'rejected') return 'machine-rejected'
  if (!continuityEligibleQids.has(qid)) return 'primary-review-rejected'
  return receiptResidentPublishedPredecessorQids.has(qid)
    ? 'predecessor-approved'
    : 'primary-approved'
}

function continuityEligibility(
  receipt: AcceptedCandidateReceipt,
  primary: PrimaryCandidateReviewResult,
  predecessorReviewResult: unknown,
) {
  const predecessorAuthority = deriveCandidatePredecessorExclusionAuthority(
    predecessorReviewResult,
  )
  const predecessorReview = predecessorReviewResultSchema.parse(
    predecessorReviewResult,
  )
  const retained = new Set(predecessorAuthority.qids)
  const receiptQids = new Set(receipt.candidates.map(({ qid }) => qid))
  const receiptResidentPublishedPredecessorQids = new Set(
    predecessorReview.records
      .filter(
        ({ sourceItemId, currentItem }) =>
          currentItem.catalogueState === 'published' &&
          receiptQids.has(sourceItemId),
      )
      .map(({ sourceItemId }) => sourceItemId),
  )
  if (receiptResidentPublishedPredecessorQids.size !== 436) {
    throw new Error(
      'Continuity eligibility must contain exactly 436 receipt-resident published predecessors.',
    )
  }
  const primaryApprovedNonPredecessors =
    primary.orderedPrimaryApprovedQids.filter((qid) => !retained.has(qid))
  if (
    primaryApprovedNonPredecessors.length !==
    primary.orderedPrimaryApprovedQids.length
  ) {
    throw new Error(
      'Retained predecessors cannot remain primary-approved continuity candidates.',
    )
  }
  const qids = [
    ...new Set([
      ...primaryApprovedNonPredecessors,
      ...receiptResidentPublishedPredecessorQids,
    ]),
  ].sort(compareAudienceCandidatesForReceipt(receipt))
  return {
    qids,
    receiptResidentPublishedPredecessorQids,
  }
}

function compareAudienceCandidatesForReceipt(
  receipt: AcceptedCandidateReceipt,
) {
  const candidates = new Map(
    receipt.candidates.map((candidate) => [candidate.qid, candidate]),
  )
  return (left: string, right: string) =>
    compareAudienceCandidates(candidates.get(left)!, candidates.get(right)!)
}

export function parseContinuityPreparation(
  input: unknown,
  receiptInput: unknown,
  primaryInput: unknown,
  acquisitionInput: unknown,
  candidateAcquisitionReviewAuthority: unknown,
  predecessorReviewResult: unknown,
): ContinuityPreparation {
  const receipt = parseAcceptedCandidateReceipt(receiptInput)
  const primary = parsePrimaryCandidateReviewResult(
    primaryInput,
    receipt,
    candidateAcquisitionReviewAuthority,
    predecessorReviewResult,
  )
  const eligibility = continuityEligibility(
    receipt,
    primary,
    predecessorReviewResult,
  )
  return validateContinuityPreparationAgainstAuthority(
    input,
    receipt,
    primary,
    acquisitionInput,
    eligibility.qids,
    eligibility.receiptResidentPublishedPredecessorQids,
  )
}

/** Pure seam for deterministic fixtures after receipt and review authentication. */
export function validateContinuityPreparationAgainstAuthority(
  input: unknown,
  receipt: AcceptedCandidateReceipt,
  primary: PrimaryCandidateReviewResult,
  acquisitionInput: unknown,
  continuityEligibleQidsInput: readonly string[] = primary.orderedPrimaryApprovedQids,
  receiptResidentPublishedPredecessorQidsInput: ReadonlySet<string> = new Set(),
): ContinuityPreparation {
  const preparation = continuityPreparationSchema.parse(input)
  if (
    preparation.primaryApprovedCandidateSetSha256 !==
    primary.orderedPrimaryApprovedQidsSha256
  ) {
    throw new Error('Continuity preparation changed the primary-approved set.')
  }
  const continuityEligibleQids = [...continuityEligibleQidsInput]
  if (new Set(continuityEligibleQids).size !== continuityEligibleQids.length) {
    throw new Error('Continuity eligibility QIDs must be unique.')
  }
  const audienceOrderedEligibility = [...continuityEligibleQids].sort(
    compareAudienceCandidatesForReceipt(receipt),
  )
  if (
    JSON.stringify(continuityEligibleQids) !==
    JSON.stringify(audienceOrderedEligibility)
  ) {
    throw new Error('Continuity eligibility must use canonical audience order.')
  }
  if (
    preparation.continuityEligibleCandidateSetSha256 !==
    discoverySha256(continuityEligibleQids)
  ) {
    throw new Error(
      'Continuity preparation changed the committed eligibility union.',
    )
  }
  const candidates = new Map(
    receipt.candidates.map((candidate) => [candidate.qid, candidate]),
  )
  const anchors = continuityEligibleQids
    .filter((qid) => {
      const candidate = candidates.get(qid)!
      return (
        candidate.englishBand !== 'unavailable' ||
        candidate.japaneseBand !== 'unavailable'
      )
    })
    .slice(0, 250)
  if (
    anchors.length !== 250 ||
    JSON.stringify(anchors) !== JSON.stringify(preparation.anchorQids)
  ) {
    throw new Error(
      'Continuity preparation must use the exact top 250 audience anchors.',
    )
  }
  const acquisition = parseReducedContinuityAcquisition(
    acquisitionInput,
    anchors,
  )
  if (preparation.acquisitionSha256 !== acquisition.acquisitionSha256)
    throw new Error('Continuity preparation changed acquisition authority.')
  if (
    preparation.orderedRequestCommitmentSha256 !==
      acquisition.orderedRequestCommitmentSha256 ||
    preparation.reducedResponseSetCommitmentSha256 !==
      acquisition.reducedResponseSetCommitmentSha256 ||
    preparation.revisionSetCommitmentSha256 !==
      acquisition.revisionSetCommitmentSha256
  )
    throw new Error('Continuity preparation aggregate commitment changed.')
  let pairCount = 0
  for (const [index, audit] of preparation.anchorAudits.entries()) {
    if (audit.anchorQid !== anchors[index]) {
      throw new Error('Continuity anchor audits must be complete and ordered.')
    }
    const acquired = acquisition.responses[index]!
    if (audit.related.length !== acquired.related.length)
      throw new Error('Continuity preparation changed acquired endpoints.')
    const relatedQids = new Set<string>()
    for (const [endpointIndex, endpoint] of audit.related.entries()) {
      const acquiredEndpoint = acquired.related[endpointIndex]!
      if (
        endpoint.relatedQid !== acquiredEndpoint.relatedQid ||
        JSON.stringify(endpoint.properties) !==
          JSON.stringify(acquiredEndpoint.properties) ||
        endpoint.reducedStatementProjectionSha256 !==
          acquiredEndpoint.reducedStatementProjectionSha256
      )
        throw new Error(
          'Continuity preparation changed acquired relation evidence.',
        )
      if (relatedQids.has(endpoint.relatedQid)) {
        throw new Error('Continuity endpoints must deduplicate per anchor.')
      }
      relatedQids.add(endpoint.relatedQid)
      const properties = [...endpoint.properties].sort()
      if (JSON.stringify(properties) !== JSON.stringify(endpoint.properties)) {
        throw new Error(
          'Continuity relationship properties must be sorted and unique.',
        )
      }
      if (
        endpoint.disposition !==
        endpointDisposition(
          endpoint.relatedQid,
          receipt,
          primary,
          new Set(continuityEligibleQids),
          receiptResidentPublishedPredecessorQidsInput,
        )
      ) {
        throw new Error(
          'Continuity endpoint disposition is not justified by frozen review authority.',
        )
      }
      pairCount += 1
    }
  }
  if (pairCount > 2_000)
    throw new Error('Continuity preparation exceeded 2,000 pairs.')
  return preparation
}

const finalizedOutcomeSchema = z.discriminatedUnion('outcome', [
  z.strictObject({
    relatedQid: wikidataQidSchema,
    outcome: z.literal('not-selected'),
  }),
  z.strictObject({
    relatedQid: wikidataQidSchema,
    outcome: z.literal('independent-approved'),
  }),
  z.strictObject({
    relatedQid: wikidataQidSchema,
    outcome: z.literal('independent-rejected'),
    replacementOutcome: z.enum([
      'independent-review-rejected',
      'selection-recomputed-after-correction',
    ]),
    replacementRound: z.number().int().positive(),
  }),
])
const replacementLineageEntrySchema = z.strictObject({
  version: z.literal('replacement-lineage.v1'),
  round: z.number().int().positive(),
  removedQids: z.array(wikidataQidSchema),
  addedQids: z.array(wikidataQidSchema),
  previousOrderedQidSequenceSha256: sha256Schema,
  currentOrderedQids: z.array(wikidataQidSchema),
  currentOrderedQidSequenceSha256: sha256Schema,
  roundSeed: sha256Schema,
})
export const finalizedContinuitySchema = z.strictObject({
  schema: z.literal('zedarchive.anime-v2-continuity-relations'),
  version: z.literal(1),
  candidateReceiptSha256: z.literal(acceptedDiscoveryCandidateReceiptSha256),
  selectionRubricSha256: z.literal(acceptedSelectionRubricV2Sha256),
  preparationSha256: sha256Schema,
  initialSelectedQids: z.array(wikidataQidSchema).length(5000),
  initialSelectedQidsSha256: sha256Schema,
  outcomes: z.array(finalizedOutcomeSchema),
  lineageOriginalSeed: sha256Schema,
  replacementLineage: z.array(replacementLineageEntrySchema),
  replacementLineageSha256: sha256Schema,
  finalSelectedQids: z.array(wikidataQidSchema).length(5000),
  finalSelectedQidsSha256: sha256Schema,
  independentReview: z.literal('approved'),
})
export type FinalizedContinuity = z.infer<typeof finalizedContinuitySchema>

export function parseFinalizedContinuity(
  input: unknown,
  preparationInput: unknown,
  receiptInput: unknown,
  primaryInput: unknown,
  acquisitionInput: unknown,
  initialSelectedQidsInput: readonly string[],
  predecessorCorpusSha256: string,
  candidateAcquisitionReviewAuthority: unknown,
  predecessorReviewResult: unknown,
): FinalizedContinuity {
  const preparation = parseContinuityPreparation(
    preparationInput,
    receiptInput,
    primaryInput,
    acquisitionInput,
    candidateAcquisitionReviewAuthority,
    predecessorReviewResult,
  )
  return validateFinalizedContinuityAgainstAuthority(
    input,
    preparation,
    initialSelectedQidsInput,
    predecessorCorpusSha256,
  )
}

/** Pure seam for deterministic fixtures after preparation authentication. */
export function validateFinalizedContinuityAgainstAuthority(
  input: unknown,
  preparation: ContinuityPreparation,
  initialSelectedQidsInput: readonly string[],
  predecessorCorpusSha256: string,
): FinalizedContinuity {
  const finalized = finalizedContinuitySchema.parse(input)
  if (finalized.preparationSha256 !== discoverySha256(preparation)) {
    throw new Error('Finalized continuity does not bind its preparation.')
  }
  const initialSelectedQids = [...initialSelectedQidsInput].sort(
    compareDiscoveryQids,
  )
  if (
    new Set(initialSelectedQids).size !== 5_000 ||
    JSON.stringify(initialSelectedQids) !==
      JSON.stringify(finalized.initialSelectedQids) ||
    discoverySha256(initialSelectedQids) !== finalized.initialSelectedQidsSha256
  )
    throw new Error('Finalized continuity changed initial canonical selection.')
  const continuityEligibleEndpointQids = [
    ...new Set(
      preparation.anchorAudits.flatMap(({ related }) =>
        related
          .filter(
            ({ disposition }) =>
              disposition === 'primary-approved' ||
              disposition === 'predecessor-approved',
          )
          .map(({ relatedQid }) => relatedQid),
      ),
    ),
  ].sort(compareDiscoveryQids)
  const outcomeQids = finalized.outcomes.map(({ relatedQid }) => relatedQid)
  if (
    new Set(outcomeQids).size !== outcomeQids.length ||
    JSON.stringify([...outcomeQids].sort(compareDiscoveryQids)) !==
      JSON.stringify(continuityEligibleEndpointQids)
  ) {
    throw new Error(
      'Finalized continuity outcomes must cover every primary-approved endpoint once.',
    )
  }
  const initialSet = new Set(initialSelectedQids)
  for (const outcome of finalized.outcomes) {
    if (outcome.outcome === 'not-selected') {
      if (initialSet.has(outcome.relatedQid))
        throw new Error(
          'Selected continuity endpoint cannot be marked not-selected.',
        )
    } else if (!initialSet.has(outcome.relatedQid)) {
      throw new Error(
        'Unselected continuity endpoint cannot receive independent review.',
      )
    }
  }
  const expectedOriginalSeed = deriveIndependentSampleSeed({
    canonicalCandidateReceiptSha256: acceptedDiscoveryCandidateReceiptSha256,
    predecessorCorpusSha256,
    orderedProposedPublishedQidSequenceSha256:
      finalized.initialSelectedQidsSha256,
  })
  if (finalized.lineageOriginalSeed !== expectedOriginalSeed)
    throw new Error('Finalized continuity changed the immutable original seed.')
  const lineageAuthority = {
    originalSeed: expectedOriginalSeed,
    initialOrderedQids: finalized.initialSelectedQids,
  }
  const finalQids = validateReplacementLineage(
    finalized.replacementLineage as readonly ReplacementLineageEntry[],
    lineageAuthority,
  )
  if (
    finalized.replacementLineageSha256 !==
      replacementLineageSha256(
        finalized.replacementLineage as readonly ReplacementLineageEntry[],
        lineageAuthority,
      ) ||
    JSON.stringify(finalQids) !== JSON.stringify(finalized.finalSelectedQids) ||
    discoverySha256(finalQids) !== finalized.finalSelectedQidsSha256
  )
    throw new Error(
      'Finalized continuity changed replacement lineage authority.',
    )
  const rejected = finalized.outcomes.filter(
    (
      outcome,
    ): outcome is Extract<
      (typeof finalized.outcomes)[number],
      { outcome: 'independent-rejected' }
    > => outcome.outcome === 'independent-rejected',
  )
  const removals = finalized.replacementLineage.flatMap((entry) =>
    entry.removedQids.map((qid) => ({ qid, round: entry.round })),
  )
  if (
    removals.length !== rejected.length ||
    rejected.some(
      (outcome) =>
        !removals.some(
          ({ qid, round }) =>
            qid === outcome.relatedQid && round === outcome.replacementRound,
        ),
    )
  )
    throw new Error(
      'Independent rejection must map exactly to replacement lineage removal.',
    )
  const finalSet = new Set(finalQids)
  if (
    finalized.outcomes.some(
      (outcome) =>
        (outcome.outcome === 'independent-approved') !==
        finalSet.has(outcome.relatedQid),
    )
  )
    throw new Error(
      'Final continuity selection must exactly match independent approval.',
    )
  return finalized
}

export function independentApprovedContinuityQids(
  finalized: FinalizedContinuity,
): ReadonlySet<string> {
  return new Set(
    finalized.outcomes
      .filter(({ outcome }) => outcome === 'independent-approved')
      .map(({ relatedQid }) => relatedQid),
  )
}

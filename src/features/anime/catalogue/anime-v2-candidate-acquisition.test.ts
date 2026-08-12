import { describe, expect, it, vi } from 'vitest'
import {
  assertCandidateReviewReserveFeasibility as assertCandidateReviewReserveFeasibilityDirect,
  assertAcceptedCandidateAcquisitionReviewAuthority,
  acceptedCandidateAcquisitionReviewAuthoritySha256,
  acceptedCandidateAcquisitionSourceReceiptSha256,
  acceptedCandidateRecoveryCollisionAuditSha256,
  acceptedCandidateReviewRoundTwoPromotionPlanSha256,
  acquisitionOutcomeCommitment,
  candidateCommitment,
  candidateAcquisitionSpecificationSha256,
  candidatePrimaryAggregatePhaseSchema,
  candidateReductionWitnessSha256,
  candidateRevisionWitnessSha256,
  createCandidateAcquisitionSourceReceipt,
  createCandidateAcquisitionReviewAuthority,
  createCandidateActiveCollisionAudit,
  createCandidateRecoveryCollisionAudit,
  createCandidateRecoveryCollisionGeometry,
  createLockedCandidateReviewManifest,
  deriveCandidateManifests,
  deriveCandidateReviewRoundSha256,
  derivePrimaryCandidateReviewFromAuthority as derivePrimaryCandidateReviewFromAuthorityDirect,
  parseCandidateAcquisitionSourceReceiptForFixture,
  reduceCandidateEntity,
  reduceCandidateEntitySafely,
  reducedCandidateProjectionSchema,
  validateCandidateActiveCollisionAudit,
  validateCandidateRecoveryCollisionAudit,
  validatePrimaryCandidateReviewAuthorityForFixture as validatePrimaryCandidateReviewAuthorityForFixtureDirect,
  type CandidateReceiptLike,
} from '@/features/anime/catalogue/anime-v2-candidate-acquisition'
import {
  adultPublicationSignalTokens,
  deriveCandidatePredecessorExclusionAuthority,
  deriveCandidatePredecessorExclusionAuthorityForFixture,
} from '@/features/anime/catalogue/anime-successor-predecessor-review'
import {
  acceptedCandidateReceiptSchema,
  acceptedSelectionRubricV2Sha256,
  createReducedContinuityAcquisition,
  validateContinuityPreparationAgainstAuthority,
  type AcceptedCandidateReceipt,
  type ContinuityPreparation,
  type PrimaryCandidateReviewResult,
} from '@/features/anime/catalogue/anime-release-v2-continuity'
import {
  releaseV2SelectionConstraints,
  parseSuccessorDiscoveryRecords,
  retainedPredecessorDiscoveryRecord,
  selectCanonicalReleaseV2ForFixture,
  type SelectionCandidate,
} from '@/features/anime/catalogue/anime-release-v2-selection'
import {
  discoverySha256,
  discoverySpecificationHashes,
  discoveryWindow,
} from '@/features/anime/catalogue/wikidata-anime-discovery'
import type { WikidataEntity } from '@/integrations/wikidata/wikidata-entity'

const receiptHash = 'a'.repeat(64)
const acceptedReceiptHash =
  'fa126f87e53ef4babfec7f0a5924c153e84aa03a638052157656537e71002c59'

const defaultFixturePredecessorAuthority =
  deriveCandidatePredecessorExclusionAuthorityForFixture(
    Array.from({ length: 500 }, (_, index) => `Q${900_000 + index}`),
  )

function derivePrimaryCandidateReviewFromAuthority(
  receipt: CandidateReceiptLike,
  candidateReceiptSha256: string,
  authority: unknown,
  predecessorAuthority = defaultFixturePredecessorAuthority,
) {
  return derivePrimaryCandidateReviewFromAuthorityDirect(
    receipt,
    candidateReceiptSha256,
    authority,
    predecessorAuthority,
  )
}

function validatePrimaryCandidateReviewAuthorityForFixture(
  aggregate: unknown,
  receipt: CandidateReceiptLike,
  candidateReceiptSha256: string,
  authority: unknown,
  predecessorAuthority = defaultFixturePredecessorAuthority,
) {
  return validatePrimaryCandidateReviewAuthorityForFixtureDirect(
    aggregate,
    receipt,
    candidateReceiptSha256,
    authority,
    predecessorAuthority,
  )
}

function assertCandidateReviewReserveFeasibility(
  receipt: CandidateReceiptLike,
  records: readonly Readonly<{
    qid: string
    machineValidation: string
    primaryReview: string
  }>[],
  input: Omit<
    Parameters<typeof assertCandidateReviewReserveFeasibilityDirect>[2],
    'retainedPredecessorQids'
  > & { retainedPredecessorQids?: readonly string[] },
) {
  return assertCandidateReviewReserveFeasibilityDirect(receipt, records, {
    ...input,
    retainedPredecessorQids:
      input.retainedPredecessorQids ??
      [
        ...input.publishablePredecessorQids,
        ...defaultFixturePredecessorAuthority.qids.filter(
          (qid) => !input.publishablePredecessorQids.includes(qid),
        ),
      ].slice(0, 500),
  })
}

function candidate(qid: string, index: number) {
  return {
    qid,
    format: index % 2 === 0 ? 'tv' : 'movie',
    releaseYear: 2020,
    era: '2020-2026',
    englishBand: index === 0 ? 'top-1-percent' : 'remainder',
    japaneseBand: 'unavailable',
    sitelinkBand: '0-to-4',
    englishMappingInputSha256: '1'.repeat(64),
    japaneseMappingInputSha256: '2'.repeat(64),
  }
}

function sourceReceipt(
  receipt: CandidateReceiptLike,
  manifests = deriveCandidateManifests(receipt),
  revisionWitnessSha256 = receipt.candidates.map((row) =>
    discoverySha256({ version: 'fixture-revision-witness.v1', qid: row.qid }),
  ),
  reductionWitnessSha256 = receipt.candidates.map((row) =>
    discoverySha256({ version: 'fixture-reduction-witness.v1', qid: row.qid }),
  ),
) {
  const manifestOrderSha256 = discoverySha256(
    manifests.map(({ ordinal, manifestSha256 }) => ({
      ordinal,
      manifestSha256,
    })),
  )
  const manifestSetSha256 = discoverySha256(
    manifests.map(({ manifestSha256 }) => manifestSha256).sort(),
  )
  const groups = Math.ceil(receipt.candidates.length / 25)
  const rawAttemptSha256 = Array.from({ length: groups }, (_, index) =>
    discoverySha256({ version: 'fixture-raw-attempt.v1', index }),
  )
  const commitment = (version: string, values: readonly unknown[]) =>
    discoverySha256({ version, values })
  return createCandidateAcquisitionSourceReceipt({
    schema: 'zedarchive.anime-v2-candidate-acquisition-source-receipt',
    version: 2,
    candidateReceiptSha256: receiptHash,
    candidateAcquisitionSpecificationSha256,
    manifestOrderSha256,
    manifestSetSha256,
    orderedRequestGroupCommitmentSha256: discoverySha256(
      Array.from({ length: groups }, (_, index) =>
        receipt.candidates
          .slice(index * 25, index * 25 + 25)
          .map(({ qid }) => qid),
      ),
    ),
    rawAttemptSha256,
    successfulAttemptOrdinalByRequestGroup: Array.from(
      { length: groups },
      (_, index) => index + 1,
    ),
    revisionWitnessSha256,
    reductionWitnessSha256,
    rawAttemptSetCommitmentSha256: commitment(
      'candidate-raw-attempt-set.v1',
      rawAttemptSha256,
    ),
    successfulAttemptOrdinalSetCommitmentSha256: commitment(
      'candidate-successful-attempt-ordinal-set.v1',
      Array.from({ length: groups }, (_, index) => index + 1),
    ),
    revisionWitnessSetCommitmentSha256: commitment(
      'candidate-revision-witness-set.v1',
      revisionWitnessSha256,
    ),
    reductionWitnessSetCommitmentSha256: commitment(
      'candidate-reduction-witness-set.v1',
      reductionWitnessSha256,
    ),
    requestEvidence: {
      requestGroupCount: Math.ceil(receipt.candidates.length / 25),
      successfulResponseGroupCount: Math.ceil(receipt.candidates.length / 25),
      attempts: Math.ceil(receipt.candidates.length / 25),
      retries: 0,
      pacingWaits: 0,
      pacingDelayMilliseconds: 0,
      elapsedMilliseconds: 0,
      maximumConcurrency: 1,
    },
  })
}

function entity(qid: string, revision = 1): WikidataEntity {
  return {
    id: qid,
    type: 'item',
    lastrevid: revision,
    labels: { en: { language: 'en', value: `Example ${qid}` } },
    aliases: {},
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
  }
}

function timeStatement(
  property: 'P577' | 'P580' | 'P582',
  year: number,
  precision = 11,
) {
  return {
    rank: 'normal',
    mainsnak: {
      snaktype: 'value',
      property,
      datatype: 'time',
      datavalue: {
        type: 'time',
        value: {
          time: `+${String(year).padStart(4, '0')}-01-01T00:00:00Z`,
          precision,
          calendarmodel: 'http://www.wikidata.org/entity/Q1985727',
        },
      },
    },
  }
}

function quantityStatement(amount: string, unit = '1') {
  return {
    rank: 'normal',
    mainsnak: {
      snaktype: 'value',
      property: 'P1113',
      datatype: 'quantity',
      datavalue: { type: 'quantity', value: { amount, unit } },
    },
  }
}

function itemStatement(property: 'P31' | 'P136', qid: string) {
  return {
    rank: 'normal',
    mainsnak: {
      snaktype: 'value',
      property,
      datatype: 'wikibase-item',
      datavalue: {
        type: 'wikibase-entityid',
        value: { id: qid, 'entity-type': 'item' },
      },
    },
  }
}

const directFormatClass = {
  tv: 'Q63952888',
  movie: 'Q20650540',
  ova: 'Q220898',
  ona: 'Q113671041',
  special: 'Q117209498',
} as const

const releaseYearForEra = {
  'before-1980': 1970,
  '1980-1989': 1985,
  '1990-1999': 1995,
  '2000-2009': 2005,
  '2010-2019': 2015,
  '2020-2026': 2020,
} as const

function realScaleReceiptCandidates(): CandidateReceiptLike['candidates'] {
  const formats = [
    ...Array.from({ length: 3_328 }, () => 'tv' as const),
    ...Array.from({ length: 850 }, () => 'movie' as const),
    ...Array.from({ length: 250 }, () => 'ova' as const),
    ...Array.from({ length: 100 }, () => 'ona' as const),
    ...Array.from({ length: 35 }, () => 'special' as const),
  ]
  const eras = [
    ...Array.from({ length: 100 }, () => 'before-1980' as const),
    ...Array.from({ length: 275 }, () => '1980-1989' as const),
    ...Array.from({ length: 450 }, () => '1990-1999' as const),
    ...Array.from({ length: 800 }, () => '2000-2009' as const),
    ...Array.from({ length: 1_200 }, () => '2010-2019' as const),
    ...Array.from({ length: 1_738 }, () => '2020-2026' as const),
  ]
  const preferred = formats.map((format, index) => {
    const era = eras[index]!
    return {
      qid: `Q${index + 1}`,
      format,
      releaseYear: releaseYearForEra[era],
      era,
      englishBand: 'top-1-percent',
      japaneseBand: 'unavailable',
      sitelinkBand: '0-to-4',
      englishMappingInputSha256: '1'.repeat(64),
      japaneseMappingInputSha256: '2'.repeat(64),
    }
  })
  const reserve = Array.from(
    { length: 7_958 - preferred.length },
    (_, index) => ({
      qid: `Q${5_000 + index}`,
      format: 'tv' as const,
      releaseYear: 2020,
      era: '2020-2026' as const,
      englishBand: 'remainder',
      japaneseBand: 'unavailable',
      sitelinkBand: '0-to-4',
      englishMappingInputSha256: '1'.repeat(64),
      japaneseMappingInputSha256: '2'.repeat(64),
    }),
  )
  return [...preferred, ...reserve]
}

function reviewRecord(
  candidateRow: CandidateReceiptLike['candidates'][number],
  manifestSha256: string,
  projectionSha256: string | null,
  acquisitionOutcomeSha256: string,
  title: { source: 'label.en'; valueSha256: string } | null,
  rejected = false,
  machineRejected = false,
  adultSignals: (typeof adultPublicationSignalTokens)[number][] = [],
  adultPublicationOutcome: 'cleared' | 'excluded' = 'cleared',
) {
  const core = {
    qid: candidateRow.qid,
    candidateSha256: candidateCommitment(candidateRow),
    manifestSha256,
    projectionSha256,
    acquisitionOutcomeSha256,
  }
  return {
    ...core,
    reviewInputSha256: discoverySha256({
      version: 'candidate-primary-review-input.v2',
      ...core,
    }),
    machineValidation: machineRejected
      ? ('rejected' as const)
      : ('approved' as const),
    exactWorkIdentity: machineRejected
      ? ('not-reviewed' as const)
      : ('approved' as const),
    mediaScope: machineRejected
      ? ('not-reviewed' as const)
      : ('approved' as const),
    title,
    titleUsability: machineRejected
      ? ('not-reviewed' as const)
      : ('approved' as const),
    adultSignals,
    adultPublicationOutcome: machineRejected
      ? ('excluded' as const)
      : adultPublicationOutcome,
    format: machineRejected ? ('not-reviewed' as const) : ('approved' as const),
    year: machineRejected ? ('not-reviewed' as const) : ('approved' as const),
    episode: machineRejected
      ? ('not-reviewed' as const)
      : ('approved' as const),
    status: machineRejected ? ('not-reviewed' as const) : ('approved' as const),
    maturity: machineRejected
      ? ('not-reviewed' as const)
      : ('approved' as const),
    duplicate: machineRejected
      ? ('not-reviewed' as const)
      : ('approved' as const),
    relationship: machineRejected
      ? ('not-reviewed' as const)
      : rejected
        ? ('rejected' as const)
        : ('approved' as const),
    primaryReview:
      machineRejected || rejected
        ? ('rejected' as const)
        : ('approved' as const),
  }
}

function authorityFixture(
  count = 3,
  lastMachineRejected = false,
  lastAdultSignalled = false,
  lastFormatDrift = false,
  candidatesInput?: CandidateReceiptLike['candidates'],
  predecessorAuthorityInput = defaultFixturePredecessorAuthority,
  enforceRetainedCollisions = false,
) {
  const predecessorAuthority = predecessorAuthorityInput
  const candidateReviewRoundSha256 = deriveCandidateReviewRoundSha256({
    candidateReceiptSha256: receiptHash,
    predecessorReviewResultSha256:
      predecessorAuthority.predecessorReviewResultSha256,
    retainedPredecessorIdentitySetSha256:
      predecessorAuthority.retainedPredecessorIdentitySetSha256,
    predecessorExclusionAuthoritySha256: predecessorAuthority.authoritySha256,
  })
  const receipt: CandidateReceiptLike = {
    candidates:
      candidatesInput ??
      Array.from({ length: count }, (_, index) =>
        candidate(`Q${index + 1}`, index),
      ),
  }
  const manifests = deriveCandidateManifests(receipt)
  const entities = receipt.candidates.map((candidateRow, index) => {
    const entityInput = entity(candidateRow.qid, index + 1)
    entityInput.claims.P31 = [
      itemStatement(
        'P31',
        lastFormatDrift && index === receipt.candidates.length - 1
          ? 'Q20650540'
          : (directFormatClass[
              candidateRow.format as keyof typeof directFormatClass
            ] ?? 'Q63952888'),
      ),
    ]
    entityInput.claims.P577 = [
      timeStatement('P577', candidateRow.releaseYear ?? 2020),
    ]
    if (lastMachineRejected && index === receipt.candidates.length - 1)
      entityInput.claims.P1113 = [quantityStatement('+12', 'Q199')]
    if (lastAdultSignalled && index === receipt.candidates.length - 1)
      entityInput.claims.P136 = [itemStatement('P136', 'Q172067')]
    return entityInput
  })
  const revisionWitnessSha256 = receipt.candidates.map((candidateRow, index) =>
    candidateRevisionWitnessSha256(candidateRow, entities[index]!.lastrevid),
  )
  const preliminary = receipt.candidates.map((candidateRow, index) => {
    const manifest = manifests[Math.floor(index / 50)]!
    return reduceCandidateEntitySafely({
      candidate: candidateRow,
      manifest,
      entity: entities[index]!,
      sourceReceiptSha256: '0'.repeat(64),
      revisionWitnessSha256: revisionWitnessSha256[index]!,
      reductionWitnessSha256: '0'.repeat(64),
    })
  })
  const reductionWitnessSha256 = preliminary.map((outcome, index) =>
    candidateReductionWitnessSha256(receipt.candidates[index]!, outcome),
  )
  const receiptEvidence = sourceReceipt(
    receipt,
    manifests,
    revisionWitnessSha256,
    reductionWitnessSha256,
  )
  const outcomes = receipt.candidates.map((candidateRow, index) => {
    const manifest = manifests[Math.floor(index / 50)]!
    return reduceCandidateEntitySafely({
      candidate: candidateRow,
      manifest,
      entity: entities[index]!,
      sourceReceiptSha256: receiptEvidence.sourceReceiptSha256,
      revisionWitnessSha256: revisionWitnessSha256[index]!,
      reductionWitnessSha256: reductionWitnessSha256[index]!,
    })
  })
  const outcomeByQid = new Map(outcomes.map((row) => [row.qid, row]))
  const acquisitionSha256 = discoverySha256({
    schema: 'zedarchive.anime-v2-candidate-acquisition',
    version: 2,
    candidateReceiptSha256: receiptHash,
    manifests,
    outcomes,
    sourceReceipt: receiptEvidence,
  })
  const recoveryAudit = createCandidateRecoveryCollisionAudit(
    receipt,
    receiptHash,
    predecessorAuthority,
    acquisitionSha256,
  )
  const lockedReviews = manifests.map((manifest) =>
    createLockedCandidateReviewManifest({
      schema: 'zedarchive.anime-v2-primary-candidate-review-lock',
      version: 3,
      candidateReceiptSha256: receiptHash,
      predecessorReviewResultSha256:
        predecessorAuthority.predecessorReviewResultSha256,
      retainedPredecessorIdentitySetSha256:
        predecessorAuthority.retainedPredecessorIdentitySetSha256,
      predecessorExclusionAuthoritySha256: predecessorAuthority.authoritySha256,
      predecessorCollisionAuditSha256: recoveryAudit.auditSha256,
      candidateReviewRoundSha256,
      verdictSha256: discoverySha256({
        version: 'fixture-candidate-verdict.v1',
        ordinal: manifest.ordinal,
      }),
      completedResultSha256: discoverySha256({
        version: 'fixture-candidate-completed-result.v1',
        ordinal: manifest.ordinal,
      }),
      manifest,
      records: manifest.qids.map((qid) => {
        const candidateRow = receipt.candidates.find((row) => row.qid === qid)!
        const outcome = outcomeByQid.get(qid)!
        const projection =
          outcome.disposition === 'projected' ? outcome.projection : undefined
        const record = reviewRecord(
          candidateRow,
          manifest.manifestSha256,
          projection?.projectionSha256 ?? null,
          acquisitionOutcomeCommitment(outcome),
          projection === undefined
            ? null
            : {
                source: 'label.en',
                valueSha256: projection.titleCandidates[0]!.valueSha256,
              },
          qid === receipt.candidates.at(-1)!.qid &&
            (!lastFormatDrift || lastAdultSignalled),
          outcome.disposition === 'machine-rejected',
          projection?.adultSignals ?? [],
          projection !== undefined && projection.adultSignals.length > 0
            ? 'excluded'
            : 'cleared',
        )
        return enforceRetainedCollisions &&
          predecessorAuthority.qids.includes(candidateRow.qid)
          ? {
              ...record,
              duplicate: 'rejected' as const,
              primaryReview: 'rejected' as const,
            }
          : record
      }),
    }),
  )
  const activeCollisionAudit = createCandidateActiveCollisionAudit(
    receipt,
    receiptHash,
    predecessorAuthority,
    recoveryAudit,
    lockedReviews,
  )
  return {
    receipt,
    authority: createCandidateAcquisitionReviewAuthority({
      schema: 'zedarchive.anime-v2-candidate-acquisition-review-authority',
      version: 3,
      candidateReceiptSha256: receiptHash,
      predecessorReviewResultSha256:
        predecessorAuthority.predecessorReviewResultSha256,
      retainedPredecessorIdentitySetSha256:
        predecessorAuthority.retainedPredecessorIdentitySetSha256,
      predecessorExclusionAuthoritySha256: predecessorAuthority.authoritySha256,
      candidateReviewRoundSha256,
      reviewRoundPromotionPlanSha256: 'd'.repeat(64),
      activeCollisionAudit,
      sourceReceipt: receiptEvidence,
      manifests,
      outcomes,
      lockedReviews,
    }),
    predecessorAuthority,
  }
}

describe('candidate-acquisition.v1 and primary-review.v2 authority', () => {
  it('pins only the independently accepted live authority and rejects structurally valid fixture authority', () => {
    const { receipt, authority } = authorityFixture()
    expect(acceptedCandidateAcquisitionSourceReceiptSha256).toBe(
      '1c16cdf422a3f6482d2efabd9665a241114d7cb858882faded14ef40995bad35',
    )
    expect(acceptedCandidateAcquisitionReviewAuthoritySha256).toBe(
      '224e830272c3f6867e63a926e8b484fce7e633fa07483d7d72c60a06e2f7fe6f',
    )
    expect(acceptedCandidateRecoveryCollisionAuditSha256).toBe(
      'adcf8ce342f7031becdeb2f15a0b2a6a51f6c249e8f313cd43d2eadd61a18bb8',
    )
    expect(acceptedCandidateReviewRoundTwoPromotionPlanSha256).toBe(
      '32bdb25c30ed48109d997e010318e91daab1a0c4e9b35d72fbfeb6a69c775eb9',
    )
    expect(() =>
      assertAcceptedCandidateAcquisitionReviewAuthority(
        receipt,
        receiptHash,
        authority,
        defaultFixturePredecessorAuthority,
      ),
    ).toThrow('independent acceptance')
  })

  it('derives one canonical v3 review-round commitment from every predecessor binding', () => {
    const input = {
      candidateReceiptSha256: receiptHash,
      predecessorReviewResultSha256:
        defaultFixturePredecessorAuthority.predecessorReviewResultSha256,
      retainedPredecessorIdentitySetSha256:
        defaultFixturePredecessorAuthority.retainedPredecessorIdentitySetSha256,
      predecessorExclusionAuthoritySha256:
        defaultFixturePredecessorAuthority.authoritySha256,
    }
    const round = deriveCandidateReviewRoundSha256(input)
    expect(round).toBe(
      'a4fd53e7d10a0a43b46f5d1f46d71e16dc5c2592800310f8b5ac388f5f520887',
    )
    expect(round).toBe(
      discoverySha256({
        version: 'candidate-primary-review-round.v3',
        ...input,
      }),
    )
    expect(
      deriveCandidateReviewRoundSha256({
        ...input,
        predecessorExclusionAuthoritySha256: 'f'.repeat(64),
      }),
    ).not.toBe(round)
  })

  it('rejects a self-consistent forged active collision-audit summary', () => {
    const fixture = authorityFixture(51)
    const { auditSha256: _auditSha256, ...core } =
      fixture.authority.activeCollisionAudit
    void _auditSha256
    const forged = {
      ...core,
      collisionCount: core.collisionCount + 1,
    }
    expect(() =>
      validateCandidateActiveCollisionAudit(
        { ...forged, auditSha256: discoverySha256(forged) },
        fixture.receipt,
        receiptHash,
        fixture.predecessorAuthority,
        fixture.authority.activeCollisionAudit.recoveryAudit,
        fixture.authority.lockedReviews,
      ),
    ).toThrow('canonically derived')
  })

  it('contains synthetic recovery lineage to test-only full-scale fixtures', () => {
    const spread = new Set(
      Array.from({ length: 154 }, (_, index) => `Q${index * 50 + 1}`),
    )
    const retained = [
      ...spread,
      ...Array.from({ length: 7_958 }, (_, index) => `Q${index + 1}`)
        .filter((qid) => !spread.has(qid))
        .slice(0, 345),
      'Q9999999',
    ]
    const predecessorAuthority =
      deriveCandidatePredecessorExclusionAuthorityForFixture(retained)
    const fixture = authorityFixture(
      7_958,
      false,
      false,
      false,
      undefined,
      predecessorAuthority,
      true,
    )
    expect(() =>
      createCandidateRecoveryCollisionGeometry(
        fixture.receipt,
        acceptedReceiptHash,
        predecessorAuthority,
      ),
    ).toThrow('41/119')
    expect(
      createCandidateRecoveryCollisionGeometry(
        fixture.receipt,
        acceptedReceiptHash,
        predecessorAuthority,
        undefined,
        { allowSyntheticLineage: true },
      ),
    ).toMatchObject({ collisionCount: 499, collisionManifestCount: 154 })
    const richAudit = createCandidateRecoveryCollisionAudit(
      fixture.receipt,
      acceptedReceiptHash,
      predecessorAuthority,
      '0'.repeat(64),
      { allowSyntheticLineage: true },
    )
    expect(() =>
      validateCandidateRecoveryCollisionAudit(
        richAudit,
        fixture.receipt,
        acceptedReceiptHash,
        predecessorAuthority,
        { allowSyntheticLineage: true },
      ),
    ).toThrow('115/115/100')
    vi.stubEnv('NODE_ENV', 'production')
    try {
      expect(() =>
        createCandidateRecoveryCollisionGeometry(
          fixture.receipt,
          acceptedReceiptHash,
          predecessorAuthority,
          undefined,
          { allowSyntheticLineage: true },
        ),
      ).toThrow('unavailable to live tooling')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('requires the exact accepted predecessor result and contains the fixture seam', () => {
    expect(() =>
      deriveCandidatePredecessorExclusionAuthority({
        schema: 'zedarchive.anime-v2-predecessor-review-result',
        version: 1,
        predecessorCorpusSha256: 'a'.repeat(64),
        predecessorReviewSha256: 'b'.repeat(64),
        preparationSha256: 'c'.repeat(64),
        records: [],
      }),
    ).toThrow()
    const forged = {
      ...defaultFixturePredecessorAuthority,
      qids: [...defaultFixturePredecessorAuthority.qids].reverse(),
    }
    expect(() =>
      derivePrimaryCandidateReviewFromAuthorityDirect(
        authorityFixture().receipt,
        receiptHash,
        authorityFixture().authority,
        forged,
      ),
    ).toThrow('not canonically derived')
  })

  it('rejects collision approvals, accepts explicit collision rejection, and keeps it out of the aggregate', () => {
    const predecessorAuthority =
      deriveCandidatePredecessorExclusionAuthorityForFixture([
        'Q1',
        ...Array.from({ length: 499 }, (_, index) => `Q${910_000 + index}`),
      ])
    const fixture = authorityFixture(
      3,
      false,
      false,
      false,
      undefined,
      predecessorAuthority,
    )
    expect(() =>
      derivePrimaryCandidateReviewFromAuthority(
        fixture.receipt,
        receiptHash,
        fixture.authority,
        predecessorAuthority,
      ),
    ).toThrow('collision')
    const first = fixture.authority.lockedReviews[0]!
    const corrected = createLockedCandidateReviewManifest({
      ...first,
      records: first.records.map((record, index) =>
        index === 0
          ? {
              ...record,
              duplicate: 'rejected' as const,
              primaryReview: 'rejected' as const,
            }
          : record,
      ),
    })
    const authority = createCandidateAcquisitionReviewAuthority({
      ...fixture.authority,
      lockedReviews: [corrected],
      activeCollisionAudit: createCandidateActiveCollisionAudit(
        fixture.receipt,
        receiptHash,
        predecessorAuthority,
        fixture.authority.activeCollisionAudit.recoveryAudit,
        [corrected],
      ),
    })
    const aggregate = derivePrimaryCandidateReviewFromAuthority(
      fixture.receipt,
      receiptHash,
      authority,
      predecessorAuthority,
    )
    expect(aggregate.orderedPrimaryApprovedQids).not.toContain('Q1')
  })

  it('rejects v2 candidate authority and excludes retained hidden or draft identities from reserve supply', () => {
    const predecessorAuthority =
      deriveCandidatePredecessorExclusionAuthorityForFixture([
        'Q1',
        'Q2',
        ...Array.from({ length: 498 }, (_, index) => `Q${920_000 + index}`),
      ])
    const fixture = authorityFixture(
      2,
      false,
      false,
      false,
      undefined,
      predecessorAuthority,
    )
    expect(() =>
      derivePrimaryCandidateReviewFromAuthorityDirect(
        fixture.receipt,
        receiptHash,
        { ...fixture.authority, version: 2 },
        predecessorAuthority,
      ),
    ).toThrow()
    expect(() =>
      assertCandidateReviewReserveFeasibilityDirect(fixture.receipt, [], {
        publishedTarget: 2,
        publishablePredecessorCount: 1,
        publishablePredecessorQids: ['Q1'],
        retainedPredecessorQids: predecessorAuthority.qids,
        predecessorFormatCounts: { tv: 1 },
        predecessorEraCounts: { '2020-2026': 1 },
        predecessorAudienceCount: 0,
        predecessorUnknownYearCount: 0,
        audienceAnchorCount: 0,
        unknownYearMaximum: 1,
        formatFloors: {},
        eraFloors: {},
      }),
    ).toThrow('published target')
  })

  it('rejects request-group and non-increasing successful-attempt witness substitutions', () => {
    const { receipt, authority } = authorityFixture(51)
    const source = authority.sourceReceipt
    expect(() =>
      parseCandidateAcquisitionSourceReceiptForFixture(
        { ...source, orderedRequestGroupCommitmentSha256: 'f'.repeat(64) },
        receipt,
        receiptHash,
      ),
    ).toThrow('positional witnesses')
    const ordinals = [2, 1]
    const { sourceReceiptSha256: _sourceReceiptSha256, ...sourceCore } = source
    void _sourceReceiptSha256
    const altered = createCandidateAcquisitionSourceReceipt({
      ...sourceCore,
      successfulAttemptOrdinalByRequestGroup: ordinals,
      successfulAttemptOrdinalSetCommitmentSha256: discoverySha256({
        version: 'candidate-successful-attempt-ordinal-set.v1',
        values: ordinals,
      }),
    })
    expect(() =>
      parseCandidateAcquisitionSourceReceiptForFixture(
        altered,
        receipt,
        receiptHash,
      ),
    ).toThrow('positional witnesses')
  })

  it('derives the complete bounded 7,958-candidate and 160-lock authority offline', () => {
    const { receipt, authority } = authorityFixture(7_958, true)
    const derived = derivePrimaryCandidateReviewFromAuthority(
      receipt,
      receiptHash,
      authority,
    )
    expect(authority.manifests).toHaveLength(160)
    expect(
      authority.manifests.slice(0, -1).every(({ qids }) => qids.length === 50),
    ).toBe(true)
    expect(authority.manifests.at(-1)?.qids).toHaveLength(8)
    expect(authority.outcomes).toHaveLength(7_958)
    expect(authority.lockedReviews).toHaveLength(160)
    expect(derived.records).toHaveLength(7_958)
    expect(derived.orderedPrimaryApprovedQids).toHaveLength(7_957)
    expect(authority.outcomes.at(-1)).toMatchObject({
      disposition: 'machine-rejected',
      category: 'claim-value',
    })
    expect(authority.lockedReviews.at(-1)?.records.at(-1)).toMatchObject({
      machineValidation: 'rejected',
      primaryReview: 'rejected',
      adultPublicationOutcome: 'excluded',
    })
    const fixedPredecessors = [
      ...Array.from({ length: 436 }, (_, index) => `Q${index + 1}`),
      'Q583684',
    ]
    const retainedPredecessors = [
      ...Array.from({ length: 498 }, (_, index) => `Q${index + 1}`),
      'Q583684',
      'Q9_999_999'.replaceAll('_', ''),
    ]
    assertCandidateReviewReserveFeasibility(receipt, derived.records, {
      publishedTarget: 5_000,
      publishablePredecessorCount: 437,
      publishablePredecessorQids: fixedPredecessors,
      retainedPredecessorQids: retainedPredecessors,
      predecessorFormatCounts: { tv: 437 },
      predecessorEraCounts: { '2020-2026': 437 },
      predecessorAudienceCount: 0,
      predecessorUnknownYearCount: 0,
      audienceAnchorCount: 250,
      unknownYearMaximum: 250,
      formatFloors: { tv: 2_500 },
      eraFloors: { '2020-2026': 1_200 },
    })
  }, 15_000)

  it('regression: primary-review authority validation uses the frozen on-disk key order', () => {
    const { receipt, authority } = authorityFixture(7_958, true)
    const derived = derivePrimaryCandidateReviewFromAuthority(
      receipt,
      receiptHash,
      authority,
    )
    const rawOrder = JSON.parse(JSON.stringify(derived))
    const rawKeys = Object.keys(rawOrder)
    expect(rawKeys.indexOf('records')).toBeLessThan(
      rawKeys.indexOf('candidateReceiptSha256'),
    )
    const schemaOrder = [
      'schema',
      'version',
      'candidateReceiptSha256',
      'records',
      'orderedPrimaryApprovedQids',
      'orderedPrimaryApprovedQidsSha256',
    ]
    const reordered = Object.fromEntries(
      schemaOrder.map((key) => [key, rawOrder[key]]),
    )
    expect(Object.keys(reordered).indexOf('records')).toBeGreaterThan(
      Object.keys(reordered).indexOf('candidateReceiptSha256'),
    )
    expect(() =>
      validatePrimaryCandidateReviewAuthorityForFixture(
        reordered,
        receipt,
        receiptHash,
        authority,
        defaultFixturePredecessorAuthority,
      ),
    ).toThrow('derived from locked acquisition authority')
    expect(() =>
      validatePrimaryCandidateReviewAuthorityForFixture(
        rawOrder,
        receipt,
        receiptHash,
        authority,
        defaultFixturePredecessorAuthority,
      ),
    ).not.toThrow()
  }, 15_000)

  it('enforces 499 retained predecessor collisions across the complete 160-manifest scale', () => {
    const predecessorAuthority =
      deriveCandidatePredecessorExclusionAuthorityForFixture([
        ...Array.from({ length: 498 }, (_, index) => `Q${index + 1}`),
        'Q7958',
        'Q9999999',
      ])
    const fixture = authorityFixture(
      7_958,
      false,
      false,
      false,
      undefined,
      predecessorAuthority,
      true,
    )
    const aggregate = derivePrimaryCandidateReviewFromAuthority(
      fixture.receipt,
      receiptHash,
      fixture.authority,
      predecessorAuthority,
    )
    expect(fixture.authority.lockedReviews).toHaveLength(160)
    expect(aggregate.orderedPrimaryApprovedQids).toHaveLength(7_459)
    expect(
      fixture.authority.lockedReviews.at(-1)?.records.at(-1),
    ).toMatchObject({
      qid: 'Q7958',
      duplicate: 'rejected',
      primaryReview: 'rejected',
    })
  }, 15_000)

  it('carries the real-scale fixture authority through continuity and canonical selection', () => {
    const { receipt, authority } = authorityFixture(
      7_958,
      false,
      false,
      false,
      realScaleReceiptCandidates(),
    )
    const derived = derivePrimaryCandidateReviewFromAuthority(
      receipt,
      receiptHash,
      authority,
    )
    const continuityReceipt = acceptedCandidateReceiptSchema.parse({
      schema: 'zedarchive.anime-discovery-candidate-receipt',
      version: 1,
      release: 'anime-v2',
      executedAt: '2026-08-01T00:00:00.000Z',
      window: {
        start: discoveryWindow.start,
        end: discoveryWindow.end,
      },
      specificationHashes: discoverySpecificationHashes,
      providerResponseSetSha256: '7'.repeat(64),
      requestEvidence: {
        attempts: 0,
        successfulPageviews: 0,
        retries: 0,
        pacingWaits: 0,
        pacingDelayMilliseconds: 0,
        elapsedMilliseconds: 0,
        maximumConcurrency: 1,
      },
      identityBlocked: [],
      candidates: receipt.candidates.map((row) => ({
        ...row,
        englishArticle: null,
        japaneseArticle: null,
        englishTotal: null,
        japaneseTotal: null,
        sitelinkCount: 0,
      })),
    }) as AcceptedCandidateReceipt
    const primary: PrimaryCandidateReviewResult = {
      schema: derived.schema,
      version: derived.version,
      candidateReceiptSha256: acceptedReceiptHash,
      records: derived.records.map(({ qid, candidateSha256 }) => ({
        qid,
        candidateSha256,
        machineValidation: 'approved',
        exactWorkIdentity: 'approved',
        mediaScope: 'approved',
        titleUsability: 'approved',
        adultPublicationSafety: 'approved',
        primaryReview: 'approved',
      })),
      orderedPrimaryApprovedQids: derived.orderedPrimaryApprovedQids,
      orderedPrimaryApprovedQidsSha256:
        derived.orderedPrimaryApprovedQidsSha256,
    }
    expect(primary.records.map(({ qid }) => qid)).toEqual(
      derived.records.map(({ qid }) => qid),
    )
    expect(primary.orderedPrimaryApprovedQidsSha256).toBe(
      derived.orderedPrimaryApprovedQidsSha256,
    )
    const anchorQids = primary.orderedPrimaryApprovedQids.slice(0, 250)
    const continuityAcquisition = createReducedContinuityAcquisition({
      anchorQids,
      entities: anchorQids.map((qid, index) => ({
        id: qid,
        type: 'item' as const,
        lastrevid: index + 1,
        labels: {},
        aliases: {},
        claims: { P155: [], P156: [] },
      })),
    })
    const preparation: ContinuityPreparation = {
      schema: 'zedarchive.anime-v2-continuity-preparation',
      version: 1,
      candidateReceiptSha256: acceptedReceiptHash,
      selectionRubricSha256: acceptedSelectionRubricV2Sha256,
      primaryApprovedCandidateSetSha256:
        primary.orderedPrimaryApprovedQidsSha256,
      continuityEligibleCandidateSetSha256: discoverySha256(
        primary.orderedPrimaryApprovedQids,
      ),
      acquisitionSha256: continuityAcquisition.acquisitionSha256,
      anchorQids,
      anchorAudits: continuityAcquisition.responses.map((response) => ({
        anchorQid: response.anchorQid,
        related: [],
      })),
      orderedRequestCommitmentSha256:
        continuityAcquisition.orderedRequestCommitmentSha256,
      reducedResponseSetCommitmentSha256:
        continuityAcquisition.reducedResponseSetCommitmentSha256,
      revisionSetCommitmentSha256:
        continuityAcquisition.revisionSetCommitmentSha256,
    }
    expect(
      validateContinuityPreparationAgainstAuthority(
        preparation,
        continuityReceipt,
        primary,
        continuityAcquisition,
      ),
    ).toEqual(preparation)

    const receiptResidentPredecessors = new Set(
      Array.from({ length: 436 }, (_, index) => `Q${index + 1}`),
    )
    const receiptByQid = new Map(
      continuityReceipt.candidates.map((row) => [row.qid, row]),
    )
    const candidates: SelectionCandidate[] =
      primary.orderedPrimaryApprovedQids.map((qid) => {
        const row = receiptByQid.get(qid)
        if (row === undefined)
          throw new Error('Fixture primary authority selected a missing QID.')
        return {
          qid: row.qid,
          format: row.format,
          era: row.era,
          englishBand: row.englishBand,
          japaneseBand: row.japaneseBand,
          sitelinkBand: row.sitelinkBand,
          source: 'frozen-primary-approved',
          publishablePredecessor: receiptResidentPredecessors.has(row.qid),
        }
      })
    expect(candidates.map(({ qid }) => qid)).toEqual(
      primary.orderedPrimaryApprovedQids,
    )
    candidates.push({
      qid: 'Q583684',
      format: 'tv',
      era: '2020-2026',
      englishBand: 'unavailable',
      japaneseBand: 'unavailable',
      sitelinkBand: '0-to-4',
      source: 'publishable-predecessor-only',
      publishablePredecessor: true,
    })
    const retainedNonPublishedPredecessors = parseSuccessorDiscoveryRecords(
      Array.from({ length: 63 }, (_, index) =>
        retainedPredecessorDiscoveryRecord({
          qid: `Q${900000 + index}`,
          catalogueItemId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
          predecessorSha256: 'a'.repeat(64),
          currentSha256: 'a'.repeat(64),
          state: 'draft',
          correctionDisposition: 'unchanged-non-published',
        }),
      ),
    )
    const selection = selectCanonicalReleaseV2ForFixture(candidates)
    const predecessorSelected = selection.selected.filter(
      ({ publishablePredecessor }) => publishablePredecessor,
    )
    const newSelected = selection.selected.filter(
      ({ publishablePredecessor }) => !publishablePredecessor,
    )
    expect(retainedNonPublishedPredecessors).toHaveLength(63)
    expect(
      retainedNonPublishedPredecessors.every(
        (record) => record.kind === 'retained-predecessor',
      ),
    ).toBe(true)
    expect(
      retainedNonPublishedPredecessors.some((record) =>
        selection.selected.some((candidate) => candidate.qid === record.qid),
      ),
    ).toBe(false)
    expect(selection.selected).toHaveLength(5_000)
    expect(predecessorSelected).toHaveLength(437)
    expect(newSelected).toHaveLength(4_563)
    expect(selection.audienceAnchors).toHaveLength(250)
    expect(
      selection.selected.filter(({ era }) => era === 'unknown'),
    ).toHaveLength(0)
    for (const [format, floor] of Object.entries(
      releaseV2SelectionConstraints.formatFloors,
    ))
      expect(
        selection.selected.filter((candidate) => candidate.format === format)
          .length,
      ).toBeGreaterThanOrEqual(floor)
    for (const [era, floor] of Object.entries(
      releaseV2SelectionConstraints.eraFloors,
    ))
      expect(
        selection.selected.filter((candidate) => candidate.era === era).length,
      ).toBeGreaterThanOrEqual(floor)
  }, 120_000)

  it('uses an exact contiguous <=50 QID manifest partition', () => {
    const receipt: CandidateReceiptLike = {
      candidates: Array.from({ length: 101 }, (_, index) =>
        candidate(`Q${index + 1}`, index),
      ),
    }
    const manifests = deriveCandidateManifests(receipt)
    const receiptEvidence = sourceReceipt(receipt, manifests)
    expect(manifests.map(({ qids }) => qids.length)).toEqual([50, 50, 1])
    expect(manifests.flatMap(({ qids }) => qids)).toEqual(
      receipt.candidates.map(({ qid }) => qid),
    )
    expect(() =>
      derivePrimaryCandidateReviewFromAuthority(receipt, receiptHash, {
        schema: 'zedarchive.anime-v2-candidate-acquisition-review-authority',
        version: 3,
        candidateReceiptSha256: receiptHash,
        predecessorReviewResultSha256:
          defaultFixturePredecessorAuthority.predecessorReviewResultSha256,
        retainedPredecessorIdentitySetSha256:
          defaultFixturePredecessorAuthority.retainedPredecessorIdentitySetSha256,
        predecessorExclusionAuthoritySha256:
          defaultFixturePredecessorAuthority.authoritySha256,
        candidateReviewRoundSha256: discoverySha256({
          version: 'candidate-primary-review-round.v3',
          candidateReceiptSha256: receiptHash,
          predecessorReviewResultSha256:
            defaultFixturePredecessorAuthority.predecessorReviewResultSha256,
          retainedPredecessorIdentitySetSha256:
            defaultFixturePredecessorAuthority.retainedPredecessorIdentitySetSha256,
          predecessorExclusionAuthoritySha256:
            defaultFixturePredecessorAuthority.authoritySha256,
        }),
        reviewRoundPromotionPlanSha256: 'd'.repeat(64),
        activeCollisionAudit:
          authorityFixture(101).authority.activeCollisionAudit,
        sourceReceipt: receiptEvidence,
        manifests: [...manifests].reverse(),
        outcomes: [],
        lockedReviews: [],
        outcomeSetCommitmentSha256: '0'.repeat(64),
        authoritySha256: '0'.repeat(64),
      }),
    ).toThrow('manifest')
  })

  it('retains only strict property-specific shapes and QID-safe provider fields', () => {
    const projection = reduceCandidateEntity({
      ...entity('Q1'),
      ignoredProviderField: { descriptions: 'discarded' },
      claims: {
        ...entity('Q1').claims,
        P31: [
          {
            rank: 'normal',
            mainsnak: {
              snaktype: 'value',
              property: 'P31',
              datatype: 'wikibase-item',
              datavalue: {
                type: 'wikibase-entityid',
                value: { id: 'Q5', 'entity-type': 'item' },
              },
            },
          },
        ],
        P577: [
          {
            rank: 'normal',
            mainsnak: {
              snaktype: 'value',
              property: 'P577',
              datatype: 'time',
              datavalue: {
                type: 'time',
                value: {
                  time: '+2020-01-01T00:00:00Z',
                  precision: 11,
                  calendarmodel: 'http://www.wikidata.org/entity/Q1985727',
                },
              },
            },
          },
        ],
      },
    } as WikidataEntity & { ignoredProviderField: unknown })
    expect(JSON.stringify(projection)).not.toContain('ignoredProviderField')
    expect(projection.claims.P31[0]!.value).toBe('Q5')
    expect(() =>
      reduceCandidateEntity({
        ...entity('Q1'),
        claims: {
          ...entity('Q1').claims,
          P31: [
            {
              rank: 'normal',
              mainsnak: {
                snaktype: 'value',
                property: 'P31',
                datatype: 'string',
                datavalue: { type: 'string', value: 'Q5' },
              },
            },
          ],
        },
      }),
    ).toThrow('datatype')
    expect(() =>
      reducedCandidateProjectionSchema.parse({
        ...projection,
        claims: {
          ...projection.claims,
          P31: [
            {
              rank: 'normal',
              value: {
                time: '+2020-01-01T00:00:00Z',
                precision: 11,
                calendarmodel: 'http://www.wikidata.org/entity/Q1985727',
              },
            },
          ],
        },
      }),
    ).toThrow()
  })

  it('machine-rejects mismatched label/alias language keys without retaining values', () => {
    const row = candidate('Q1', 0)
    const manifest = deriveCandidateManifests({ candidates: [row] })[0]!
    const result = reduceCandidateEntitySafely({
      candidate: row,
      manifest,
      sourceReceiptSha256: 'a'.repeat(64),
      entity: {
        ...entity('Q1'),
        labels: { en: { language: 'fr', value: 'Should not project' } },
        aliases: {},
      },
    })
    expect(result).toMatchObject({
      disposition: 'machine-rejected',
      category: 'claim-value',
    })
    expect(JSON.stringify(result)).not.toContain('Should not project')
  })

  it('rejects hidden publication outcomes for every new candidate', () => {
    const { receipt, authority } = authorityFixture()
    const lock = authority.lockedReviews[0]!
    const replacement = createLockedCandidateReviewManifest({
      ...lock,
      records: lock.records.map((record, index) =>
        index === 0
          ? { ...record, adultPublicationOutcome: 'hidden' as const }
          : record,
      ),
    })
    expect(() =>
      derivePrimaryCandidateReviewFromAuthority(
        receipt,
        receiptHash,
        createCandidateAcquisitionReviewAuthority({
          ...authority,
          lockedReviews: [replacement],
        }),
      ),
    ).toThrow('Unsignalled new candidate')
  })

  it('rejects duplicate, extra, and reordered outcome or lock arrays', () => {
    const { receipt, authority } = authorityFixture(51)
    const variants = [
      createCandidateAcquisitionReviewAuthority({
        ...authority,
        outcomes: [...authority.outcomes, authority.outcomes[0]!],
      }),
      createCandidateAcquisitionReviewAuthority({
        ...authority,
        outcomes: [...authority.outcomes].reverse(),
      }),
      createCandidateAcquisitionReviewAuthority({
        ...authority,
        lockedReviews: [
          ...authority.lockedReviews,
          authority.lockedReviews[0]!,
        ],
      }),
      createCandidateAcquisitionReviewAuthority({
        ...authority,
        lockedReviews: [...authority.lockedReviews].reverse(),
      }),
    ]
    for (const variant of variants) {
      expect(() =>
        derivePrimaryCandidateReviewFromAuthority(
          receipt,
          receiptHash,
          variant,
        ),
      ).toThrow()
    }
  })

  it('forces format/year drift and signalled adult records out of primary approval', () => {
    const drift = authorityFixture(3, false, false, true)
    expect(() =>
      derivePrimaryCandidateReviewFromAuthority(
        drift.receipt,
        receiptHash,
        drift.authority,
      ),
    ).toThrow('format or release year')
    const adult = authorityFixture(3, false, true)
    expect(
      derivePrimaryCandidateReviewFromAuthority(
        adult.receipt,
        receiptHash,
        adult.authority,
      ).records.at(-1),
    ).toMatchObject({
      primaryReview: 'rejected',
      adultPublicationSafety: 'rejected',
    })
    const lastLock = adult.authority.lockedReviews.at(-1)!
    const changedLock = createLockedCandidateReviewManifest({
      schema: lastLock.schema,
      version: lastLock.version,
      candidateReceiptSha256: lastLock.candidateReceiptSha256,
      predecessorReviewResultSha256: lastLock.predecessorReviewResultSha256,
      retainedPredecessorIdentitySetSha256:
        lastLock.retainedPredecessorIdentitySetSha256,
      predecessorExclusionAuthoritySha256:
        lastLock.predecessorExclusionAuthoritySha256,
      predecessorCollisionAuditSha256: lastLock.predecessorCollisionAuditSha256,
      candidateReviewRoundSha256: lastLock.candidateReviewRoundSha256,
      verdictSha256: lastLock.verdictSha256,
      completedResultSha256: lastLock.completedResultSha256,
      manifest: lastLock.manifest,
      records: lastLock.records.map((record, index) =>
        index === lastLock.records.length - 1
          ? { ...record, adultPublicationOutcome: 'cleared' as const }
          : record,
      ),
    })
    expect(() =>
      derivePrimaryCandidateReviewFromAuthority(
        adult.receipt,
        receiptHash,
        createCandidateAcquisitionReviewAuthority({
          ...adult.authority,
          lockedReviews: [
            ...adult.authority.lockedReviews.slice(0, -1),
            changedLock,
          ],
        }),
      ),
    ).toThrow('cannot clear adult publication')
  })

  it('derives release and episode evidence without substituting end dates', () => {
    const withDates = reduceCandidateEntity({
      ...entity('Q1'),
      claims: {
        ...entity('Q1').claims,
        P577: [timeStatement('P577', 2022), timeStatement('P577', 2020)],
        P580: [timeStatement('P580', 2018)],
        P582: [timeStatement('P582', 1900)],
        P1113: [quantityStatement('+12')],
      },
    })
    expect(withDates).toMatchObject({
      releaseYear: 2020,
      releaseYearSource: 'P577',
      episodeCount: 12,
      episodeCountEvidence: 'single-valid',
    })
    expect(
      reduceCandidateEntity({
        ...entity('Q1'),
        claims: { ...entity('Q1').claims, P580: [timeStatement('P580', 2018)] },
      }),
    ).toMatchObject({ releaseYear: 2018, releaseYearSource: 'P580' })
    expect(
      reduceCandidateEntity({
        ...entity('Q1'),
        claims: { ...entity('Q1').claims, P582: [timeStatement('P582', 1900)] },
      }),
    ).toMatchObject({ releaseYear: null, releaseYearSource: 'unavailable' })
    expect(
      reduceCandidateEntity({
        ...entity('Q1'),
        claims: {
          ...entity('Q1').claims,
          P577: [timeStatement('P577', 2020, 8)],
          P580: [timeStatement('P580', 2018)],
        },
      }),
    ).toMatchObject({ releaseYear: 2018, releaseYearSource: 'P580' })
    expect(
      reduceCandidateEntitySafely({
        candidate: candidate('Q1', 0),
        manifest: deriveCandidateManifests({
          candidates: [candidate('Q1', 0)],
        })[0]!,
        entity: {
          ...entity('Q1'),
          claims: {
            ...entity('Q1').claims,
            P1113: [quantityStatement('+12', 'Q199')],
          },
        },
        sourceReceiptSha256: 'a'.repeat(64),
      }),
    ).toMatchObject({
      disposition: 'machine-rejected',
      category: 'claim-value',
    })
    expect(
      reduceCandidateEntity({
        ...entity('Q1'),
        claims: {
          ...entity('Q1').claims,
          P1113: [quantityStatement('+12'), quantityStatement('+24')],
        },
      }),
    ).toMatchObject({ episodeCount: null, episodeCountEvidence: 'ambiguous' })
  })

  it('rejects a forged all-approved aggregate instead of trusting its caller', () => {
    const { receipt, authority } = authorityFixture()
    const derived = derivePrimaryCandidateReviewFromAuthority(
      receipt,
      receiptHash,
      authority,
    )
    expect(() =>
      validatePrimaryCandidateReviewAuthorityForFixture(
        {
          ...derived,
          records: derived.records.map((record) => ({
            ...record,
            primaryReview: 'approved',
          })),
        },
        receipt,
        receiptHash,
        authority,
      ),
    ).toThrow('not derived')
    expect(
      validatePrimaryCandidateReviewAuthorityForFixture(
        derived,
        receipt,
        receiptHash,
        authority,
      ),
    ).toEqual(derived)
  })

  it('observes the closed aggregate derivation sequence without changing its result', () => {
    expect(candidatePrimaryAggregatePhaseSchema.options).toEqual([
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
    const { receipt, authority, predecessorAuthority } = authorityFixture(1)
    const phases: string[] = []
    const observed = derivePrimaryCandidateReviewFromAuthorityDirect(
      receipt,
      receiptHash,
      authority,
      predecessorAuthority,
      (phase) => phases.push(phase),
    )
    expect(phases).toEqual(candidatePrimaryAggregatePhaseSchema.options)
    expect(observed).toEqual(
      derivePrimaryCandidateReviewFromAuthorityDirect(
        receipt,
        receiptHash,
        authority,
        predecessorAuthority,
      ),
    )
  })

  it('authenticates mixed projected and machine-rejected coverage without leaking values', () => {
    const { receipt, authority } = authorityFixture(3, true)
    const aggregate = derivePrimaryCandidateReviewFromAuthority(
      receipt,
      receiptHash,
      authority,
    )
    expect(aggregate.records.at(-1)).toMatchObject({
      machineValidation: 'rejected',
      exactWorkIdentity: 'not-reviewed',
      adultPublicationSafety: 'not-reviewed',
      primaryReview: 'not-reviewed',
    })
    const rejected = authority.outcomes.at(-1)!
    expect(rejected).toMatchObject({
      disposition: 'machine-rejected',
      category: 'claim-value',
    })
    expect(JSON.stringify(rejected)).not.toContain('Q199')
    expect(() =>
      derivePrimaryCandidateReviewFromAuthority(receipt, receiptHash, {
        ...authority,
        outcomes: authority.outcomes.map((outcome) =>
          outcome === rejected
            ? { ...outcome, category: 'entity-state' }
            : outcome,
        ),
      }),
    ).toThrow('rejection hash')
    expect(() =>
      derivePrimaryCandidateReviewFromAuthority(receipt, receiptHash, {
        ...authority,
        outcomes: authority.outcomes.map((outcome) =>
          outcome === rejected
            ? { ...outcome, providerValue: 'Q199' }
            : outcome,
        ),
      }),
    ).toThrow()
    if (rejected.disposition !== 'machine-rejected')
      throw new Error('Expected rejection fixture.')
    const core = {
      qid: rejected.qid,
      candidateSha256: rejected.candidateSha256,
      manifestSha256: rejected.manifestSha256,
      sourceReceiptSha256: rejected.sourceReceiptSha256,
      disposition: rejected.disposition,
      category: 'entity-state' as const,
    }
    const categoryChanged = authority.outcomes.map((outcome) =>
      outcome === rejected
        ? {
            ...outcome,
            category: core.category,
            rejectionSha256: discoverySha256(core),
          }
        : outcome,
    )
    expect(() =>
      derivePrimaryCandidateReviewFromAuthority(
        receipt,
        receiptHash,
        createCandidateAcquisitionReviewAuthority({
          ...authority,
          outcomes: categoryChanged,
        }),
      ),
    ).toThrow('rejection hash')
  })

  it('stops when the remaining reserve cannot reach count, anchors, or floors', () => {
    const { receipt } = authorityFixture(3)
    expect(() =>
      assertCandidateReviewReserveFeasibility(receipt, [], {
        publishedTarget: 5,
        publishablePredecessorCount: 2,
        publishablePredecessorQids: ['Q101', 'Q102'],
        predecessorFormatCounts: { tv: 2 },
        predecessorEraCounts: { '2020-2026': 2 },
        predecessorAudienceCount: 0,
        predecessorUnknownYearCount: 0,
        audienceAnchorCount: 3,
        unknownYearMaximum: 1,
        formatFloors: { tv: 5 },
        eraFloors: { '2020-2026': 4 },
      }),
    ).toThrow('format floor')
    expect(() =>
      assertCandidateReviewReserveFeasibility(receipt, [], {
        publishedTarget: 6,
        publishablePredecessorCount: 1,
        publishablePredecessorQids: ['Q101'],
        predecessorFormatCounts: {},
        predecessorEraCounts: {},
        predecessorAudienceCount: 0,
        predecessorUnknownYearCount: 0,
        audienceAnchorCount: 1,
        unknownYearMaximum: 1,
        formatFloors: {},
        eraFloors: {},
      }),
    ).toThrow('published target')
    expect(() =>
      assertCandidateReviewReserveFeasibility(receipt, [], {
        publishedTarget: 3,
        publishablePredecessorCount: 1,
        publishablePredecessorQids: ['Q101'],
        predecessorFormatCounts: {},
        predecessorEraCounts: {},
        predecessorAudienceCount: 0,
        predecessorUnknownYearCount: 2,
        audienceAnchorCount: 1,
        unknownYearMaximum: 1,
        formatFloors: {},
        eraFloors: {},
      }),
    ).toThrow('unknown-year')
    const mixed = authorityFixture(3, true)
    const aggregate = derivePrimaryCandidateReviewFromAuthority(
      mixed.receipt,
      receiptHash,
      mixed.authority,
    )
    expect(() =>
      assertCandidateReviewReserveFeasibility(
        mixed.receipt,
        aggregate.records,
        {
          publishedTarget: 3,
          publishablePredecessorCount: 0,
          publishablePredecessorQids: [],
          predecessorFormatCounts: {},
          predecessorEraCounts: {},
          predecessorAudienceCount: 0,
          predecessorUnknownYearCount: 0,
          audienceAnchorCount: 1,
          unknownYearMaximum: 1,
          formatFloors: {},
          eraFloors: {},
        },
      ),
    ).toThrow('published target')
  })

  it('counts receipt-resident publishable predecessors only through their fixed aggregates', () => {
    const fixedQids = Array.from({ length: 437 }, (_, index) => `Q${index + 1}`)
    const receipt: CandidateReceiptLike = {
      candidates: [
        ...fixedQids.slice(0, 436).map((qid, index) => candidate(qid, index)),
        ...Array.from({ length: 4562 }, (_, index) =>
          candidate(`Q${index + 1000}`, index),
        ),
      ],
    }
    const input = {
      publishedTarget: 5000,
      publishablePredecessorCount: 437,
      publishablePredecessorQids: fixedQids,
      predecessorFormatCounts: { tv: 437 },
      predecessorEraCounts: { '2020-2026': 437 },
      predecessorAudienceCount: 0,
      predecessorUnknownYearCount: 0,
      audienceAnchorCount: 0,
      unknownYearMaximum: 250,
      formatFloors: {},
      eraFloors: {},
    }
    expect(() =>
      assertCandidateReviewReserveFeasibility(receipt, [], input),
    ).toThrow('published target')

    const completeReceipt: CandidateReceiptLike = {
      candidates: [...receipt.candidates, candidate('Q999999', 0)],
    }
    expect(() =>
      assertCandidateReviewReserveFeasibility(completeReceipt, [], input),
    ).not.toThrow()
  })

  it('does not let receipt-resident predecessors inflate floors or audience anchors', () => {
    const receipt: CandidateReceiptLike = { candidates: [candidate('Q1', 0)] }
    const input = {
      publishedTarget: 1,
      publishablePredecessorCount: 1,
      publishablePredecessorQids: ['Q1'],
      predecessorFormatCounts: { tv: 1 },
      predecessorEraCounts: { '2020-2026': 1 },
      predecessorAudienceCount: 1,
      predecessorUnknownYearCount: 0,
      audienceAnchorCount: 2,
      unknownYearMaximum: 1,
      formatFloors: { tv: 2 },
      eraFloors: { '2020-2026': 2 },
    }
    expect(() =>
      assertCandidateReviewReserveFeasibility(receipt, [], input),
    ).toThrow('audience anchor')
    expect(() =>
      assertCandidateReviewReserveFeasibility(receipt, [], {
        ...input,
        audienceAnchorCount: 1,
      }),
    ).toThrow('format floor')
    expect(() =>
      assertCandidateReviewReserveFeasibility(receipt, [], {
        ...input,
        audienceAnchorCount: 1,
        formatFloors: { tv: 1 },
      }),
    ).toThrow('era floor')
  })

  it('rejects inconsistent publishable predecessor QID bindings', () => {
    const { receipt } = authorityFixture(3)
    const base = {
      publishedTarget: 3,
      predecessorFormatCounts: {},
      predecessorEraCounts: {},
      predecessorAudienceCount: 0,
      predecessorUnknownYearCount: 0,
      audienceAnchorCount: 0,
      unknownYearMaximum: 1,
      formatFloors: {},
      eraFloors: {},
    }
    expect(() =>
      assertCandidateReviewReserveFeasibility(receipt, [], {
        ...base,
        publishablePredecessorCount: 2,
        publishablePredecessorQids: ['Q101'],
      }),
    ).toThrow('unique and match')
    expect(() =>
      assertCandidateReviewReserveFeasibility(receipt, [], {
        ...base,
        publishablePredecessorCount: 2,
        publishablePredecessorQids: ['Q101', 'Q101'],
      }),
    ).toThrow('unique and match')
  })
})

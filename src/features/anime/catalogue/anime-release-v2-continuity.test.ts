import { describe, expect, it } from 'vitest'
import {
  acceptedCandidateReceiptSchema,
  acceptedSelectionRubricV2Sha256,
  createReducedContinuityAcquisition,
  parseAcceptedCandidateReceipt,
  parseReducedContinuityAcquisition,
  reducedCandidateCommitment,
  validateContinuityPreparationAgainstAuthority,
  validateFinalizedContinuityAgainstAuthority,
  type AcceptedCandidateReceipt,
  type ContinuityPreparation,
  type PrimaryCandidateReviewResult,
} from '@/features/anime/catalogue/anime-release-v2-continuity'
import {
  appendReplacementLineage,
  deriveIndependentSampleSeed,
  replacementLineageSha256,
} from '@/features/anime/catalogue/anime-release-v2-lineage'
import {
  selectCanonicalReleaseV2ForFixture,
  validateFinalizedContinuitySelectionForFixture,
  type SelectionCandidate,
  type SelectionConstraints,
} from '@/features/anime/catalogue/anime-release-v2-selection'
import {
  discoverySha256,
  discoverySpecificationHashes,
  discoveryWindow,
} from '@/features/anime/catalogue/wikidata-anime-discovery'
import type { WikidataEntity } from '@/integrations/wikidata/wikidata-entity'

const receiptSha =
  'fa126f87e53ef4babfec7f0a5924c153e84aa03a638052157656537e71002c59'

function candidate(qid: string, audience = true) {
  return {
    qid,
    format: 'tv' as const,
    releaseYear: 2020,
    era: '2020-2026' as const,
    englishArticle: null,
    japaneseArticle: null,
    englishTotal: null,
    japaneseTotal: null,
    englishBand: audience ? ('remainder' as const) : ('unavailable' as const),
    japaneseBand: 'unavailable' as const,
    sitelinkCount: 0,
    sitelinkBand: '0-to-4' as const,
    englishMappingInputSha256: '1'.repeat(64),
    japaneseMappingInputSha256: '2'.repeat(64),
  }
}

function fixture(audience250 = true) {
  const candidates = [
    ...Array.from({ length: 252 }, (_, index) =>
      candidate(`Q${index + 1}`, index !== 249 || audience250),
    ),
    candidate('Q6000'),
  ]
  const receipt = acceptedCandidateReceiptSchema.parse({
    schema: 'zedarchive.anime-discovery-candidate-receipt',
    version: 1,
    release: 'anime-v2',
    executedAt: '2026-07-31T00:00:00.000Z',
    window: { start: discoveryWindow.start, end: discoveryWindow.end },
    specificationHashes: discoverySpecificationHashes,
    providerResponseSetSha256: '3'.repeat(64),
    requestEvidence: {
      attempts: 1,
      successfulPageviews: 0,
      retries: 0,
      pacingWaits: 0,
      pacingDelayMilliseconds: 0,
      elapsedMilliseconds: 1,
      maximumConcurrency: 1,
    },
    identityBlocked: [
      {
        qid: 'Q9000',
        disposition: 'identity-blocked',
        dispositionSha256: '4'.repeat(64),
      },
    ],
    candidates,
  }) as AcceptedCandidateReceipt
  const records = candidates.map((row) => {
    const machineRejected = row.qid === 'Q251'
    const primaryRejected = row.qid === 'Q252'
    return {
      qid: row.qid,
      candidateSha256: reducedCandidateCommitment(row),
      machineValidation: machineRejected
        ? ('rejected' as const)
        : ('approved' as const),
      exactWorkIdentity: machineRejected
        ? ('not-reviewed' as const)
        : ('approved' as const),
      mediaScope: machineRejected
        ? ('not-reviewed' as const)
        : ('approved' as const),
      titleUsability: machineRejected
        ? ('not-reviewed' as const)
        : ('approved' as const),
      adultPublicationSafety: machineRejected
        ? ('not-reviewed' as const)
        : ('approved' as const),
      primaryReview: machineRejected
        ? ('not-reviewed' as const)
        : primaryRejected
          ? ('rejected' as const)
          : ('approved' as const),
    }
  })
  const approvedQids = [
    ...Array.from({ length: 250 }, (_, index) => `Q${index + 1}`),
    'Q6000',
  ]
  const primary: PrimaryCandidateReviewResult = {
    schema: 'zedarchive.anime-v2-primary-candidate-review',
    version: 1,
    candidateReceiptSha256: receiptSha,
    records,
    orderedPrimaryApprovedQids: approvedQids,
    orderedPrimaryApprovedQidsSha256: discoverySha256(approvedQids),
  }
  return { receipt, primary }
}

function statement(
  property: 'P155' | 'P156',
  relatedQid: string,
  rank = 'normal',
) {
  return {
    rank,
    mainsnak: {
      snaktype: 'value',
      property,
      datatype: 'wikibase-item',
      datavalue: {
        type: 'wikibase-entityid',
        value: { id: relatedQid, 'entity-type': 'item' },
      },
    },
  }
}

function entities(endpointCount = 0): WikidataEntity[] {
  return Array.from({ length: 250 }, (_, index) => {
    const qid = `Q${index + 1}`
    const relations =
      index === 0
        ? Array.from({ length: endpointCount }, (_, relationIndex) =>
            statement('P155', `Q${1000 + relationIndex}`),
          )
        : []
    return {
      id: qid,
      type: 'item',
      lastrevid: index + 1,
      labels: {},
      aliases: {},
      claims: { P155: relations, P156: [] },
    }
  })
}

function authorityArtifacts() {
  const { receipt, primary } = fixture()
  const anchorQids = Array.from({ length: 250 }, (_, index) => `Q${index + 1}`)
  const raw = entities()
  raw[0]!.claims = {
    P155: [
      statement('P155', 'Q249'),
      statement('P155', 'Q250'),
      statement('P155', 'Q6000'),
      statement('P155', 'Q9000'),
      statement('P155', 'Q251'),
      statement('P155', 'Q252'),
      statement('P155', 'Q9999'),
      statement('P155', 'Q7777', 'deprecated'),
    ],
    P156: [statement('P156', 'Q250')],
  }
  const acquisition = createReducedContinuityAcquisition({
    anchorQids,
    entities: raw,
  })
  const dispositions = new Map<
    string,
    ContinuityPreparation['anchorAudits'][number]['related'][number]['disposition']
  >([
    ['Q249', 'primary-approved'],
    ['Q250', 'primary-approved'],
    ['Q6000', 'primary-approved'],
    ['Q9000', 'identity-blocked'],
    ['Q251', 'machine-rejected'],
    ['Q252', 'primary-review-rejected'],
    ['Q9999', 'outside-frozen-receipt'],
  ] as const)
  const preparation: ContinuityPreparation = {
    schema: 'zedarchive.anime-v2-continuity-preparation',
    version: 1,
    candidateReceiptSha256: receiptSha,
    selectionRubricSha256: acceptedSelectionRubricV2Sha256,
    primaryApprovedCandidateSetSha256: primary.orderedPrimaryApprovedQidsSha256,
    continuityEligibleCandidateSetSha256:
      primary.orderedPrimaryApprovedQidsSha256,
    acquisitionSha256: acquisition.acquisitionSha256,
    anchorQids,
    anchorAudits: acquisition.responses.map(({ anchorQid, related }) => ({
      anchorQid,
      related: related.map((endpoint) => ({
        ...endpoint,
        disposition: dispositions.get(endpoint.relatedQid)!,
      })),
    })),
    orderedRequestCommitmentSha256: acquisition.orderedRequestCommitmentSha256,
    reducedResponseSetCommitmentSha256:
      acquisition.reducedResponseSetCommitmentSha256,
    revisionSetCommitmentSha256: acquisition.revisionSetCommitmentSha256,
  }
  return { receipt, primary, acquisition, preparation }
}

describe('continuity-relations.v1 acquisition authority', () => {
  it('produces a direct rank-free projection and recomputes every commitment', () => {
    const { acquisition } = authorityArtifacts()
    expect(
      acquisition.responses[0]!.related.find(
        ({ relatedQid }) => relatedQid === 'Q250',
      ),
    ).toMatchObject({
      properties: ['P155', 'P156'],
    })
    expect(JSON.stringify(acquisition)).not.toContain('deprecated')
    expect(JSON.stringify(acquisition)).not.toContain('rank')
    expect(() =>
      parseReducedContinuityAcquisition(acquisition, acquisition.anchorQids),
    ).not.toThrow()
    for (const field of [
      'orderedRequestCommitmentSha256',
      'reducedResponseSetCommitmentSha256',
      'revisionSetCommitmentSha256',
      'acquisitionSha256',
    ] as const) {
      expect(() =>
        parseReducedContinuityAcquisition(
          { ...acquisition, [field]: '0'.repeat(64) },
          acquisition.anchorQids,
        ),
      ).toThrow()
    }
  })

  it('enforces 250 unique ordered anchors and the 8/2,000 endpoint caps', () => {
    const anchorQids = Array.from(
      { length: 250 },
      (_, index) => `Q${index + 1}`,
    )
    expect(() =>
      createReducedContinuityAcquisition({ anchorQids, entities: entities(9) }),
    ).toThrow('eight')
    const eightEach = entities()
    eightEach.forEach((entity, index) => {
      entity.claims.P155 = Array.from({ length: 8 }, (_, relationIndex) =>
        statement('P155', `Q${10_000 + index * 8 + relationIndex}`),
      )
    })
    expect(
      createReducedContinuityAcquisition({ anchorQids, entities: eightEach })
        .responses,
    ).toHaveLength(250)
    expect(() =>
      createReducedContinuityAcquisition({
        anchorQids: [...anchorQids.slice(0, 249), 'Q1'],
        entities: entities(),
      }),
    ).toThrow('unique')
  })

  it('rejects non-item value projections instead of treating them as relations', () => {
    const anchorQids = Array.from(
      { length: 250 },
      (_, index) => `Q${index + 1}`,
    )
    const raw = entities()
    raw[0]!.claims.P155 = [
      {
        ...statement('P155', 'Q999'),
        mainsnak: {
          ...statement('P155', 'Q999').mainsnak,
          datatype: 'string',
        },
      },
    ]
    expect(() =>
      createReducedContinuityAcquisition({ anchorQids, entities: raw }),
    ).toThrow('directly name a Wikidata item')
  })

  it('requires a positive revision for every direct anchor response', () => {
    const anchorQids = Array.from(
      { length: 250 },
      (_, index) => `Q${index + 1}`,
    )
    const missingRevision = entities()
    delete missingRevision[0]!.lastrevid
    expect(() =>
      createReducedContinuityAcquisition({
        anchorQids,
        entities: missingRevision,
      }),
    ).toThrow('positive revision')

    const zeroRevision = entities()
    zeroRevision[0]!.lastrevid = 0
    expect(() =>
      createReducedContinuityAcquisition({
        anchorQids,
        entities: zeroRevision,
      }),
    ).toThrow('positive revision')

    const acquisition = createReducedContinuityAcquisition({
      anchorQids,
      entities: entities(),
    })
    const withoutRevision = {
      anchorQid: acquisition.responses[0]!.anchorQid,
      related: acquisition.responses[0]!.related,
    }
    expect(() =>
      parseReducedContinuityAcquisition(
        {
          ...acquisition,
          responses: [withoutRevision, ...acquisition.responses.slice(1)],
        },
        anchorQids,
      ),
    ).toThrow()
    expect(() =>
      parseReducedContinuityAcquisition(
        {
          ...acquisition,
          responses: acquisition.responses.map((response, index) =>
            index === 0 ? { ...response, revision: 0 } : response,
          ),
        },
        anchorQids,
      ),
    ).toThrow()
  })

  it('derives all closed dispositions and refuses non-audience anchor authority', () => {
    const { receipt, primary, acquisition, preparation } = authorityArtifacts()
    expect(
      validateContinuityPreparationAgainstAuthority(
        preparation,
        receipt,
        primary,
        acquisition,
      ).anchorAudits[0]!.related.map(({ disposition }) => disposition),
    ).toEqual([
      'primary-approved',
      'primary-approved',
      'machine-rejected',
      'primary-review-rejected',
      'primary-approved',
      'identity-blocked',
      'outside-frozen-receipt',
    ])
    const unavailable = fixture(false)
    expect(() =>
      validateContinuityPreparationAgainstAuthority(
        preparation,
        unavailable.receipt,
        unavailable.primary,
        acquisition,
      ),
    ).toThrow('Continuity eligibility')
  })

  it('commits receipt-resident published predecessors with their truthful disposition', () => {
    const { receipt, primary, acquisition, preparation } = authorityArtifacts()
    const eligibility = [
      ...Array.from({ length: 250 }, (_, index) => `Q${index + 1}`),
      'Q252',
      'Q6000',
    ]
    const predecessorPreparation = {
      ...preparation,
      continuityEligibleCandidateSetSha256: discoverySha256(eligibility),
      anchorAudits: preparation.anchorAudits.map((audit) => ({
        ...audit,
        related: audit.related.map((endpoint) =>
          endpoint.relatedQid === 'Q252'
            ? { ...endpoint, disposition: 'predecessor-approved' as const }
            : endpoint,
        ),
      })),
    }
    expect(
      validateContinuityPreparationAgainstAuthority(
        predecessorPreparation,
        receipt,
        primary,
        acquisition,
        eligibility,
        new Set(['Q252']),
      ).anchorAudits[0]!.related.find(({ relatedQid }) => relatedQid === 'Q252')
        ?.disposition,
    ).toBe('predecessor-approved')
    expect(() =>
      validateContinuityPreparationAgainstAuthority(
        {
          ...predecessorPreparation,
          continuityEligibleCandidateSetSha256: '0'.repeat(64),
        },
        receipt,
        primary,
        acquisition,
        eligibility,
        new Set(['Q252']),
      ),
    ).toThrow('eligibility union')
  })
})

describe('continuity-relations.v1 final review and lineage', () => {
  const selectionConstraints: SelectionConstraints = {
    publishedCount: 5_000,
    unknownYearMaximum: 5_000,
    formatFloors: { tv: 0, movie: 0, ova: 0, ona: 0, special: 0 },
    eraFloors: {
      'before-1980': 0,
      '1980-1989': 0,
      '1990-1999': 0,
      '2000-2009': 0,
      '2010-2019': 0,
      '2020-2026': 0,
    },
  }

  function selectionCandidates(): SelectionCandidate[] {
    return Array.from({ length: 5_002 }, (_, index) => ({
      qid: `Q${index + 1}`,
      format: 'tv',
      era: '2020-2026',
      englishBand: 'remainder',
      japaneseBand: 'unavailable',
      sitelinkBand: '0-to-4',
      source: 'frozen-primary-approved',
      publishablePredecessor: false,
    }))
  }

  function finalFixture(reject = false) {
    const { preparation } = authorityArtifacts()
    const initial = Array.from({ length: 5000 }, (_, index) => `Q${index + 1}`)
    const predecessorCorpusSha256 = '7'.repeat(64)
    const lineageAuthority = {
      originalSeed: deriveIndependentSampleSeed({
        canonicalCandidateReceiptSha256: receiptSha,
        predecessorCorpusSha256,
        orderedProposedPublishedQidSequenceSha256: discoverySha256(initial),
      }),
      initialOrderedQids: initial,
    }
    const lineage = reject
      ? appendReplacementLineage(
          [],
          { removedQids: ['Q249'], addedQids: ['Q5001'] },
          lineageAuthority,
        )
      : []
    const finalQids =
      lineage.length === 0 ? initial : lineage[0]!.currentOrderedQids
    const outcomes = [
      ...(reject
        ? [
            {
              relatedQid: 'Q249',
              outcome: 'independent-rejected' as const,
              replacementOutcome:
                'selection-recomputed-after-correction' as const,
              replacementRound: 1,
            },
          ]
        : [{ relatedQid: 'Q249', outcome: 'independent-approved' as const }]),
      { relatedQid: 'Q250', outcome: 'independent-approved' as const },
      { relatedQid: 'Q6000', outcome: 'not-selected' as const },
    ]
    const finalized = {
      schema: 'zedarchive.anime-v2-continuity-relations',
      version: 1,
      candidateReceiptSha256: receiptSha,
      selectionRubricSha256: acceptedSelectionRubricV2Sha256,
      preparationSha256: discoverySha256(preparation),
      initialSelectedQids: initial,
      initialSelectedQidsSha256: discoverySha256(initial),
      outcomes,
      lineageOriginalSeed: lineageAuthority.originalSeed,
      replacementLineage: lineage,
      replacementLineageSha256: replacementLineageSha256(
        lineage,
        lineageAuthority,
      ),
      finalSelectedQids: finalQids,
      finalSelectedQidsSha256: discoverySha256(finalQids),
      independentReview: 'approved',
    }
    return { preparation, initial, finalized, predecessorCorpusSha256 }
  }

  function multiRoundFinalFixture(swappedAdditions = false) {
    const { preparation } = authorityArtifacts()
    const candidates = selectionCandidates()
    const initialSelection = selectCanonicalReleaseV2ForFixture(candidates, {
      constraints: selectionConstraints,
      audienceAnchorCount: 1,
    })
    const initial = initialSelection.selected.map(({ qid }) => qid)
    const predecessorCorpusSha256 = '7'.repeat(64)
    const lineageAuthority = {
      originalSeed: deriveIndependentSampleSeed({
        canonicalCandidateReceiptSha256: receiptSha,
        predecessorCorpusSha256,
        orderedProposedPublishedQidSequenceSha256: discoverySha256(initial),
      }),
      initialOrderedQids: initial,
    }
    const firstLineage = appendReplacementLineage(
      [],
      {
        removedQids: ['Q249'],
        addedQids: [swappedAdditions ? 'Q5002' : 'Q5001'],
      },
      lineageAuthority,
    )
    const lineage = appendReplacementLineage(
      firstLineage,
      {
        removedQids: ['Q250'],
        addedQids: [swappedAdditions ? 'Q5001' : 'Q5002'],
      },
      lineageAuthority,
    )
    const finalQids = lineage[1]!.currentOrderedQids
    const finalized = {
      schema: 'zedarchive.anime-v2-continuity-relations' as const,
      version: 1 as const,
      candidateReceiptSha256: receiptSha,
      selectionRubricSha256: acceptedSelectionRubricV2Sha256,
      preparationSha256: discoverySha256(preparation),
      initialSelectedQids: initial,
      initialSelectedQidsSha256: discoverySha256(initial),
      outcomes: [
        {
          relatedQid: 'Q249',
          outcome: 'independent-rejected' as const,
          replacementOutcome: 'selection-recomputed-after-correction' as const,
          replacementRound: 1,
        },
        {
          relatedQid: 'Q250',
          outcome: 'independent-rejected' as const,
          replacementOutcome: 'selection-recomputed-after-correction' as const,
          replacementRound: 2,
        },
        { relatedQid: 'Q6000', outcome: 'not-selected' as const },
      ],
      lineageOriginalSeed: lineageAuthority.originalSeed,
      replacementLineage: lineage,
      replacementLineageSha256: replacementLineageSha256(
        lineage,
        lineageAuthority,
      ),
      finalSelectedQids: finalQids,
      finalSelectedQidsSha256: discoverySha256(finalQids),
      independentReview: 'approved' as const,
    }
    return {
      candidates,
      finalized,
      initial,
      initialSelection,
      preparation,
      predecessorCorpusSha256,
    }
  }

  it('distinguishes selected approval from unselected without fabricated review', () => {
    const { preparation, initial, finalized, predecessorCorpusSha256 } =
      finalFixture()
    expect(
      validateFinalizedContinuityAgainstAuthority(
        finalized,
        preparation,
        initial,
        predecessorCorpusSha256,
      ),
    ).toEqual(finalized)
    expect(() =>
      validateFinalizedContinuityAgainstAuthority(
        { ...finalized, lineageOriginalSeed: '8'.repeat(64) },
        preparation,
        initial,
        predecessorCorpusSha256,
      ),
    ).toThrow('immutable original seed')
    expect(() =>
      validateFinalizedContinuityAgainstAuthority(
        {
          ...finalized,
          outcomes: finalized.outcomes.map((outcome) =>
            outcome.relatedQid === 'Q6000'
              ? { relatedQid: 'Q6000', outcome: 'independent-approved' }
              : outcome,
          ),
        },
        preparation,
        initial,
        predecessorCorpusSha256,
      ),
    ).toThrow('Unselected')
  })

  it('requires every rejection to map exactly to validated replacement lineage', () => {
    const { preparation, initial, finalized, predecessorCorpusSha256 } =
      finalFixture(true)
    expect(
      validateFinalizedContinuityAgainstAuthority(
        finalized,
        preparation,
        initial,
        predecessorCorpusSha256,
      ),
    ).toEqual(finalized)
    const outcomes = finalized.outcomes.map((outcome) =>
      outcome.outcome === 'independent-rejected'
        ? { ...outcome, replacementRound: 2 }
        : outcome,
    )
    expect(() =>
      validateFinalizedContinuityAgainstAuthority(
        { ...finalized, outcomes },
        preparation,
        initial,
        predecessorCorpusSha256,
      ),
    ).toThrow('replacement lineage removal')
  })

  it('exactly recomputes each continuity replacement round with accumulated rejections', () => {
    const fixture = multiRoundFinalFixture()
    const finalized = validateFinalizedContinuityAgainstAuthority(
      fixture.finalized,
      fixture.preparation,
      fixture.initial,
      fixture.predecessorCorpusSha256,
    )
    expect(
      validateFinalizedContinuitySelectionForFixture({
        initialSelection: fixture.initialSelection,
        candidates: fixture.candidates,
        finalizedContinuity: finalized,
        constraints: selectionConstraints,
        audienceAnchorCount: 1,
      }).selected.map(({ qid }) => qid),
    ).toEqual(finalized.finalSelectedQids)
  })

  it('rejects swapped intermediate additions even when the final set and hash are exact', () => {
    const fixture = multiRoundFinalFixture(true)
    const finalized = validateFinalizedContinuityAgainstAuthority(
      fixture.finalized,
      fixture.preparation,
      fixture.initial,
      fixture.predecessorCorpusSha256,
    )
    expect(finalized.finalSelectedQids).toEqual(
      multiRoundFinalFixture().finalized.finalSelectedQids,
    )
    expect(() =>
      validateFinalizedContinuitySelectionForFixture({
        initialSelection: fixture.initialSelection,
        candidates: fixture.candidates,
        finalizedContinuity: finalized,
        constraints: selectionConstraints,
        audienceAnchorCount: 1,
      }),
    ).toThrow('exact canonical recomputation')
  })
})

describe('fixed public receipt boundary', () => {
  it('rejects synthetic and raw-provider receipt authority', () => {
    const { receipt } = fixture()
    expect(() => parseAcceptedCandidateReceipt(receipt)).toThrow(
      'accepted frozen receipt hash',
    )
    expect(() =>
      parseAcceptedCandidateReceipt({ ...receipt, raw: true }),
    ).toThrow()
  })
})

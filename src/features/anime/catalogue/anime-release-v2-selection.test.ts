import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  canonicalSelectionEvidence,
  createSuccessorRepresentationForFixture as createSuccessorRepresentation,
  predecessorOnlySelectedDiscoveryRecord,
  parseSuccessorDiscoveryRecords,
  parseCanonicalSelectionEvidence,
  reasonsForCandidate,
  releaseV2SelectionConstraints,
  selectAudienceAnchors,
  selectCanonicalReleaseV2ForFixture as selectCanonicalReleaseV2,
  selectMinimumCostSet,
  selectionCandidateCost,
  selectionRubricV2Sha256,
  selectionRubricV2Specification,
  selectionTierWeight,
  successorDiscoveryReasonOrder,
  validateDerivedSuccessorDiscoveryReasons,
  validateSuccessorRepresentation,
  validateSuccessorRepresentationAgainstValidatedPredecessor,
  validateIdentityReplacementLineageForFixture,
  type SelectionCandidate,
  type SelectionConstraints,
} from '@/features/anime/catalogue/anime-release-v2-selection'
import { validateSuccessorDiscoverySemantics } from '@/features/anime/catalogue/anime-release-v2-authority'
import {
  appendReplacementLineage,
  deriveIndependentSampleRoundSeed,
  deriveIndependentSampleSeed,
  validateReplacementLineage,
} from '@/features/anime/catalogue/anime-release-v2-lineage'
import {
  compareDiscoveryQids,
  discoverySha256,
} from '@/features/anime/catalogue/wikidata-anime-discovery'

function candidate(
  qid: string,
  overrides: Partial<SelectionCandidate> = {},
): SelectionCandidate {
  return {
    qid,
    format: 'tv',
    era: '2010-2019',
    englishBand: 'remainder',
    japaneseBand: 'unavailable',
    sitelinkBand: '0-to-4',
    source: 'frozen-primary-approved',
    publishablePredecessor: false,
    ...overrides,
  }
}

function constraints(
  publishedCount: number,
  options: Readonly<{
    unknownYearMaximum?: number
    formats?: Partial<SelectionConstraints['formatFloors']>
    eras?: Partial<SelectionConstraints['eraFloors']>
  }> = {},
): SelectionConstraints {
  return {
    publishedCount,
    unknownYearMaximum: options.unknownYearMaximum ?? publishedCount,
    formatFloors: {
      tv: 0,
      movie: 0,
      ova: 0,
      ona: 0,
      special: 0,
      ...options.formats,
    },
    eraFloors: {
      'before-1980': 0,
      '1980-1989': 0,
      '1990-1999': 0,
      '2000-2009': 0,
      '2010-2019': 0,
      '2020-2026': 0,
      ...options.eras,
    },
  }
}

function combinations<T>(values: readonly T[], count: number): T[][] {
  if (count === 0) return [[]]
  if (values.length < count) return []
  return values.flatMap((value, index) =>
    combinations(values.slice(index + 1), count - 1).map((tail) => [
      value,
      ...tail,
    ]),
  )
}

function feasible(
  selected: readonly SelectionCandidate[],
  limits: SelectionConstraints,
): boolean {
  if (
    selected.filter(({ era }) => era === 'unknown').length >
    limits.unknownYearMaximum
  )
    return false
  return (
    Object.entries(limits.formatFloors).every(
      ([format, floor]) =>
        selected.filter((row) => row.format === format).length >= floor,
    ) &&
    Object.entries(limits.eraFloors).every(
      ([era, floor]) =>
        selected.filter((row) => row.era === era).length >= floor,
    )
  )
}

function realScaleCandidates(): SelectionCandidate[] {
  const coreFormatCounts = [
    ['tv', 3_000],
    ['movie', 1_015],
    ['ova', 500],
    ['ona', 300],
    ['special', 185],
  ] as const
  const coreEraCounts = [
    ['before-1980', 300],
    ['1980-1989', 400],
    ['1990-1999', 600],
    ['2000-2009', 900],
    ['2010-2019', 1_300],
    ['2020-2026', 1_500],
  ] as const
  const coreFormats = coreFormatCounts.flatMap(([format, count]) =>
    Array.from({ length: count }, () => format),
  )
  const coreEras = coreEraCounts.flatMap(([era, count]) =>
    Array.from({ length: count }, () => era),
  )
  const core = coreFormats.map((format, index) =>
    candidate(`Q${index + 1}`, { format, era: coreEras[index]! }),
  )
  const extraFormats = ['tv', 'movie', 'ova', 'ona', 'special'] as const
  const extraEras = coreEraCounts.map(([era]) => era)
  const extras = Array.from({ length: 2_958 }, (_, index) =>
    candidate(`Q${5_001 + index}`, {
      format: extraFormats[index % extraFormats.length],
      era: extraEras[index % extraEras.length]!,
    }),
  )
  return [...core, ...extras]
}

function identityReplacementReview(
  input: Readonly<{
    candidateReceiptSha256: string
    canonicalSelectionEvidenceSha256: string
    originalSeed: string
    round: number
    previousSelectedQids: readonly string[]
    removedQids: readonly string[]
  }>,
) {
  const roundSeed = deriveIndependentSampleRoundSeed(
    input.originalSeed,
    input.round,
  )
  const reviewInput = {
    version: 'identity-replacement-review-input.v1',
    candidateReceiptSha256: input.candidateReceiptSha256,
    canonicalSelectionEvidenceSha256: input.canonicalSelectionEvidenceSha256,
    round: input.round,
    previousSelectedQidsSha256: discoverySha256(input.previousSelectedQids),
    roundSeed,
    reviewedQids: input.removedQids,
  }
  const removals = input.removedQids.map((qid) => ({
    qid,
    outcome: 'independent-review-rejected' as const,
  }))
  const resultCore = {
    ...reviewInput,
    schema: 'zedarchive.anime-v2-identity-replacement-review-result' as const,
    version: 1 as const,
    removals,
  }
  return {
    schema: resultCore.schema,
    version: resultCore.version,
    candidateReceiptSha256: resultCore.candidateReceiptSha256,
    canonicalSelectionEvidenceSha256:
      resultCore.canonicalSelectionEvidenceSha256,
    round: resultCore.round,
    previousSelectedQidsSha256: resultCore.previousSelectedQidsSha256,
    roundSeed,
    removals,
    reviewInputSha256: discoverySha256(reviewInput),
    resultSha256: discoverySha256(resultCore),
  }
}

describe('selection-rubric.v2 specification and ordering', () => {
  it('binds the accepted canonical dc606c specification exactly', () => {
    expect(discoverySha256(selectionRubricV2Specification)).toBe(
      selectionRubricV2Sha256,
    )
  })

  it('keeps the realistic 437 predecessor and 4,563 new-candidate boundary exact', () => {
    const newFormatCounts = [
      ['tv', 3328],
      ['movie', 850],
      ['ova', 250],
      ['ona', 100],
      ['special', 35],
    ] as const
    const newEraCounts = [
      ['before-1980', 100],
      ['1980-1989', 275],
      ['1990-1999', 450],
      ['2000-2009', 800],
      ['2010-2019', 1200],
      ['2020-2026', 1738],
    ] as const
    const formats = newFormatCounts.flatMap(([format, count]) =>
      Array.from({ length: count }, () => format),
    )
    const eras = newEraCounts.flatMap(([era, count]) =>
      Array.from({ length: count }, () => era),
    )
    const predecessors = Array.from({ length: 437 }, (_, index) =>
      candidate(index === 0 ? 'Q583684' : `Q${900000 + index}`, {
        source: 'publishable-predecessor-only',
        publishablePredecessor: true,
      }),
    )
    const newcomers = formats.map((format, index) =>
      candidate(`Q${100000 + index}`, {
        format,
        era: eras[index]!,
        source: 'frozen-primary-approved',
      }),
    )
    const published = [...predecessors, ...newcomers]
    const retained = Array.from(
      { length: 63 },
      (_, index) => `Q${800000 + index}`,
    )
    expect(newcomers).toHaveLength(4563)
    expect(published).toHaveLength(5000)
    expect(retained).toHaveLength(63)
    expect(published.find(({ qid }) => qid === 'Q583684')).toMatchObject({
      source: 'publishable-predecessor-only',
    })
    expect(selectAudienceAnchors(published)).toHaveLength(250)
    expect(published.filter(({ era }) => era === 'unknown')).toHaveLength(0)
    expect(
      published.filter((row) => row.format === 'tv').length,
    ).toBeGreaterThanOrEqual(2500)
    expect(
      published.filter((row) => row.format === 'movie').length,
    ).toBeGreaterThanOrEqual(850)
    expect(
      published.filter((row) => row.format === 'ova').length,
    ).toBeGreaterThanOrEqual(250)
    expect(
      published.filter((row) => row.format === 'ona').length,
    ).toBeGreaterThanOrEqual(100)
    expect(
      published.filter((row) => row.format === 'special').length,
    ).toBeGreaterThanOrEqual(35)
    for (const [era, floor] of Object.entries(
      releaseV2SelectionConstraints.eraFloors,
    ))
      expect(
        published.filter((row) => row.era === era).length,
      ).toBeGreaterThanOrEqual(floor)
  })

  it('requires the strongest 250 anchors to carry audience evidence', () => {
    const rows = Array.from({ length: 251 }, (_, index) =>
      candidate(`Q${index + 1}`, {
        englishBand: index === 250 ? 'unavailable' : 'remainder',
        japaneseBand: 'unavailable',
      }),
    )
    expect(
      selectAudienceAnchors([...rows].reverse()).map(({ qid }) => qid),
    ).toEqual(Array.from({ length: 250 }, (_, index) => `Q${index + 1}`))
    expect(() => selectAudienceAnchors(rows.slice(1))).toThrow('Fewer than 250')
  })

  it('orders, deduplicates and admits only closed preassigned reasons', () => {
    const row = candidate('Q1', {
      englishBand: 'top-20-percent',
      japaneseBand: 'remainder',
      sitelinkBand: '20-to-49',
      publishablePredecessor: true,
    })
    expect(
      reasonsForCandidate(row, {
        coverageWitness: true,
        independentlyApprovedContinuity: true,
      }),
    ).toEqual(successorDiscoveryReasonOrder)
    expect(
      reasonsForCandidate(
        candidate('Q2', {
          englishBand: 'unavailable',
          japaneseBand: 'unavailable',
        }),
      ),
    ).toEqual([])
  })

  it('makes one continuity tier dominate every possible ordinal difference', () => {
    const weight = selectionTierWeight(4, 7)
    expect(weight).toBe(BigInt(25))
    expect(selectionCandidateCost(true, 6, weight)).toBe(BigInt(6))
    expect(selectionCandidateCost(false, 0, weight)).toBe(BigInt(25))
  })

  it('binds selected, anchor, witness, reason and solver commitments together', () => {
    const result = selectCanonicalReleaseV2(
      [candidate('Q1'), candidate('Q2'), candidate('Q3')],
      { constraints: constraints(2), audienceAnchorCount: 1 },
    )
    const evidence = canonicalSelectionEvidence(result, 'f'.repeat(64))
    expect(parseCanonicalSelectionEvidence(evidence)).toEqual(evidence)
    expect(() =>
      parseCanonicalSelectionEvidence({
        ...evidence,
        reasonCodes: evidence.reasonCodes.map((record) =>
          record.qid === evidence.orderedSelectedQids[0]
            ? { ...record, reasons: [] }
            : record,
        ),
      }),
    ).toThrow()
  })
})

describe('integral exact selection', () => {
  it('matches brute force across all small two-dimensional floor fixtures', () => {
    const rows = [
      candidate('Q1', { format: 'tv', era: '2010-2019' }),
      candidate('Q2', { format: 'tv', era: '2020-2026' }),
      candidate('Q3', { format: 'movie', era: '2010-2019' }),
      candidate('Q4', { format: 'movie', era: '2020-2026' }),
      candidate('Q5', { format: 'ova', era: 'unknown' }),
    ]
    const costs = new Map(
      rows.map((row, index) => [row.qid, BigInt([4, 2, 2, 4, 0][index]!)]),
    )
    for (const tvFloor of [0, 1, 2]) {
      for (const movieFloor of [0, 1, 2]) {
        for (const eraFloor of [0, 1, 2]) {
          const limits = constraints(3, {
            unknownYearMaximum: 1,
            formats: { tv: tvFloor, movie: movieFloor },
            eras: { '2010-2019': eraFloor },
          })
          const brute = combinations(rows, 3)
            .filter((selection) => feasible(selection, limits))
            .map((selection) => ({
              selection: [...selection].sort((left, right) =>
                compareDiscoveryQids(left.qid, right.qid),
              ),
              cost: selection.reduce(
                (sum, row) => sum + costs.get(row.qid)!,
                BigInt(0),
              ),
            }))
            .sort((left, right) => {
              if (left.cost !== right.cost)
                return left.cost < right.cost ? -1 : 1
              return left.selection
                .map(({ qid }) => qid.padStart(5, '0'))
                .join('|')
                .localeCompare(
                  right.selection
                    .map(({ qid }) => qid.padStart(5, '0'))
                    .join('|'),
                )
            })[0]
          if (brute === undefined) {
            expect(() =>
              selectMinimumCostSet({
                candidates: rows,
                costs,
                fixedSelected: [],
                selectCount: 3,
                constraints: limits,
              }),
            ).toThrow('No feasible')
          } else {
            const actual = selectMinimumCostSet({
              candidates: rows,
              costs,
              fixedSelected: [],
              selectCount: 3,
              constraints: limits,
            })
            expect(actual.cost).toBe(brute.cost)
            expect(actual.selected.map(({ qid }) => qid)).toEqual(
              brute.selection.map(({ qid }) => qid),
            )
          }
        }
      }
    }
  })

  it('uses selected-set QID lexicography and is invariant to permutations', () => {
    const rows = [
      candidate('Q10'),
      candidate('Q2'),
      candidate('Q1'),
      candidate('Q20'),
    ]
    const costs = new Map(rows.map(({ qid }) => [qid, BigInt(1)]))
    for (const permutation of [
      rows,
      [...rows].reverse(),
      [rows[2]!, rows[0]!, rows[3]!, rows[1]!],
    ]) {
      expect(
        selectMinimumCostSet({
          candidates: permutation,
          costs,
          fixedSelected: [],
          selectCount: 2,
          constraints: constraints(2),
        }).selected.map(({ qid }) => qid),
      ).toEqual(['Q1', 'Q2'])
    }
  })

  it('fixes a minimal coverage witness that extends to the exact final set', () => {
    const rows = [
      candidate('Q1', { englishBand: 'top-1-percent' }),
      candidate('Q2', {
        format: 'movie',
        era: '2020-2026',
        englishBand: 'unavailable',
      }),
      candidate('Q3', { format: 'tv', era: '2020-2026' }),
      candidate('Q4', { format: 'tv', era: '2010-2019' }),
      candidate('Q5', { format: 'movie', era: '2010-2019' }),
    ]
    const result = selectCanonicalReleaseV2([...rows].reverse(), {
      audienceAnchorCount: 1,
      constraints: constraints(4, {
        formats: { movie: 1 },
        eras: { '2020-2026': 1 },
      }),
    })
    expect(result.audienceAnchors.map(({ qid }) => qid)).toEqual(['Q1'])
    expect(result.coverageWitness.map(({ qid }) => qid)).toEqual(['Q2'])
    expect(result.reasonCodes.get('Q2')).toEqual(['coverage-cell'])
    expect(result.selected).toHaveLength(4)
  })

  it('skips a cheaper dead-end witness for the next extendable optimum', () => {
    const rows = [
      candidate('Q1', { englishBand: 'top-1-percent' }),
      candidate('Q2', {
        format: 'movie',
        englishBand: 'top-5-percent',
      }),
      candidate('Q3', {
        format: 'movie',
        englishBand: 'unavailable',
        japaneseBand: 'unavailable',
        sitelinkBand: '0-to-4',
      }),
      candidate('Q4'),
    ]
    const result = selectCanonicalReleaseV2(rows, {
      audienceAnchorCount: 1,
      constraints: constraints(4, { formats: { movie: 1 } }),
    })
    expect(result.coverageWitness.map(({ qid }) => qid)).toEqual(['Q3'])
    expect(result.selected.map(({ qid }) => qid)).toEqual([
      'Q1',
      'Q2',
      'Q3',
      'Q4',
    ])
  })

  it(
    'keeps the frozen 7,958-candidate/exact-5,000 solver shape operationally bounded',
    { timeout: 20_000 },
    () => {
      const rows = realScaleCandidates()
      const startedAt = performance.now()
      const result = selectMinimumCostSet({
        candidates: [...rows].reverse(),
        costs: new Map(rows.map((row, index) => [row.qid, BigInt(index)])),
        fixedSelected: [],
        selectCount: 5_000,
        constraints: constraints(5_000, {
          unknownYearMaximum: 250,
          formats: {
            tv: 2_500,
            movie: 850,
            ova: 250,
            ona: 100,
            special: 35,
          },
          eras: {
            'before-1980': 100,
            '1980-1989': 275,
            '1990-1999': 450,
            '2000-2009': 800,
            '2010-2019': 1_200,
            '2020-2026': 1_200,
          },
        }),
      })
      const elapsedMilliseconds = performance.now() - startedAt
      expect(result.selected).toHaveLength(5_000)
      expect(
        feasible(
          result.selected,
          constraints(5_000, {
            unknownYearMaximum: 250,
            formats: { tv: 2_500, movie: 850, ova: 250, ona: 100, special: 35 },
            eras: {
              'before-1980': 100,
              '1980-1989': 275,
              '1990-1999': 450,
              '2000-2009': 800,
              '2010-2019': 1_200,
              '2020-2026': 1_200,
            },
          }),
        ),
      ).toBe(true)
      // A 15-second ceiling is intentionally coarse: it catches accidental
      // reintroduction of per-QID full solves while tolerating shared CI load.
      expect(elapsedMilliseconds).toBeLessThan(15_000)
    },
  )

  it(
    'keeps the complete canonical 7,958-to-5,000 path within its audited bound',
    { timeout: 40_000 },
    () => {
      const startedAt = performance.now()
      const result = selectCanonicalReleaseV2(realScaleCandidates())
      const elapsedMilliseconds = performance.now() - startedAt
      expect(result.selected).toHaveLength(5_000)
      expect(result.audienceAnchors).toHaveLength(250)
      expect(result.witnessPartitionsSolved).toBe(1)
      expect(
        feasible(
          result.selected,
          constraints(5_000, {
            unknownYearMaximum: 250,
            formats: { tv: 2_500, movie: 850, ova: 250, ona: 100, special: 35 },
            eras: {
              'before-1980': 100,
              '1980-1989': 275,
              '1990-1999': 450,
              '2000-2009': 800,
              '2010-2019': 1_200,
              '2020-2026': 1_200,
            },
          }),
        ),
      ).toBe(true)
      // This coarse ceiling covers the entire anchor, witness, extension and
      // final-fill path and remains far below the explicit 64-partition stop.
      expect(elapsedMilliseconds).toBeLessThan(30_000)
    },
  )
})

describe('successor representation and immutable sample lineage', () => {
  it('keeps the public semantic wrapper closed to synthetic receipts', () => {
    expect(() =>
      validateSuccessorDiscoverySemantics({
        records: [],
        representation: {
          publishedSelection: [],
          retainedPredecessors: [],
          completeCorpus: [],
        },
        candidateReceipt: {},
        primaryCandidateReview: {},
        candidateAcquisitionReviewAuthority: {},
        continuityAcquisition: {},
        continuityPreparation: {},
        finalizedContinuity: {},
        canonicalSelectionEvidence: {},
        predecessorReviewResult: {},
        predecessorCorpus: undefined as never,
        predecessorReviewLedger: undefined as never,
        predecessorIndex: undefined as never,
        predecessorPreparation: {},
        allocationLedger: [],
        allocationHistory: [],
      }),
    ).toThrow()
  })

  it('separates exactly published and retained predecessor records', () => {
    const published = [
      {
        qid: 'Q1',
        catalogueItemId: '00000000-0000-4000-8000-000000000001',
        state: 'published' as const,
      },
    ]
    const retained = [
      {
        qid: 'Q2',
        catalogueItemId: '00000000-0000-4000-8000-000000000002',
        predecessorSha256: '1'.repeat(64),
        currentSha256: '2'.repeat(64),
        state: 'hidden' as const,
        correctionDisposition: 'catalogue_state_identity_scope_hide' as const,
      },
    ]
    expect(
      createSuccessorRepresentation(published, retained, 1).completeCorpus,
    ).toHaveLength(2)
    expect(() =>
      createSuccessorRepresentation(
        published,
        [{ ...retained[0]!, qid: 'Q1' }],
        1,
      ),
    ).toThrow('QIDs')
    expect(() =>
      createSuccessorRepresentation(
        [
          {
            ...published[0]!,
            catalogueItemId: [published[0]!.catalogueItemId] as never,
          },
        ],
        retained,
        1,
      ),
    ).toThrow('UUID v4')
    expect(
      predecessorOnlySelectedDiscoveryRecord({
        qid: 'Q583684',
        catalogueItemId: '69269f92-4bfa-4657-95cf-0f71aa93ba0e',
        predecessorSha256: '3'.repeat(64),
        state: 'published',
      }).reasonCodes,
    ).toEqual(['predecessor'])
  })

  it('rejects an extra retained record outside exact predecessor authority', () => {
    const published = Array.from({ length: 5_000 }, (_, index) => ({
      qid: `Q${index + 1}`,
      catalogueItemId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      state: 'published' as const,
    }))
    const predecessorRecords = Array.from({ length: 63 }, (_, index) => ({
      sourceItemId: `Q${10_001 + index}`,
      catalogueItemId: `00000000-0000-4000-8000-${String(5_001 + index).padStart(12, '0')}`,
      predecessorNormalizedItemSha256: `${(index % 10).toString()}`.repeat(64),
      normalizedItemSha256: `${(index % 10).toString()}`.repeat(64),
      currentItem: { catalogueState: 'draft' as const },
      corrections: [],
    }))
    const retained = predecessorRecords.map((record) => ({
      qid: record.sourceItemId,
      catalogueItemId: record.catalogueItemId,
      predecessorSha256: record.predecessorNormalizedItemSha256,
      currentSha256: record.normalizedItemSha256,
      state: 'draft' as const,
      correctionDisposition: 'unchanged-non-published' as const,
    }))
    const representation = {
      publishedSelection: published,
      retainedPredecessors: retained,
      completeCorpus: [...published, ...retained],
    }
    expect(() => validateSuccessorRepresentation(representation)).not.toThrow()
    expect(() =>
      validateSuccessorRepresentationAgainstValidatedPredecessor(
        representation,
        predecessorRecords,
      ),
    ).not.toThrow()

    const extra = {
      qid: 'Q999999',
      catalogueItemId: '00000000-0000-4000-8000-000000999999',
      predecessorSha256: 'a'.repeat(64),
      currentSha256: 'a'.repeat(64),
      state: 'draft' as const,
      correctionDisposition: 'unchanged-non-published' as const,
    }
    const withExtra = {
      ...representation,
      retainedPredecessors: [...retained, extra],
      completeCorpus: [...published, ...retained, extra],
    }
    expect(() => validateSuccessorRepresentation(withExtra)).toThrow(
      'exactly 63 retained',
    )
    expect(() =>
      validateSuccessorRepresentationAgainstValidatedPredecessor(
        withExtra,
        predecessorRecords,
      ),
    ).toThrow('do not exactly match')
  })

  it('strictly parses the closed successor discovery-record union', () => {
    const records = [
      {
        kind: 'eligible-selected',
        qid: 'Q1',
        reasonCodes: ['audience-en'],
        englishBand: 'remainder',
        japaneseBand: 'unavailable',
        sitelinkBand: '0-to-4',
        englishMappingInputSha256: '1'.repeat(64),
        japaneseMappingInputSha256: '2'.repeat(64),
      },
      {
        kind: 'predecessor-only-selected',
        catalogueItemId: '69269f92-4bfa-4657-95cf-0f71aa93ba0e',
        qid: 'Q583684',
        predecessorSha256: '3'.repeat(64),
        state: 'published',
        reasonCodes: ['predecessor'],
      },
    ]
    expect(parseSuccessorDiscoveryRecords(records)).toEqual(records)
    expect(() =>
      parseSuccessorDiscoveryRecords([{ ...records[0]!, exactPageviews: 123 }]),
    ).toThrow('unknown fields')
    expect(() =>
      parseSuccessorDiscoveryRecords([
        { ...records[0]!, reasonCodes: ['coverage-cell'] },
      ]),
    ).toThrow('English audience reason')
    for (const correctionDisposition of [
      'catalogue_state_title_usability_hide',
      'catalogue_state_adult_publication_hide',
      'catalogue_state_identity_scope_hide',
    ] as const) {
      expect(
        parseSuccessorDiscoveryRecords([
          {
            kind: 'retained-predecessor',
            qid: 'Q2',
            catalogueItemId: '00000000-0000-4000-8000-000000000002',
            predecessorSha256: '3'.repeat(64),
            currentSha256: '4'.repeat(64),
            state: 'hidden',
            correctionDisposition,
          },
        ])[0],
      ).toMatchObject({ correctionDisposition })
    }
    for (const adversarial of [
      123,
      ['1'.repeat(64)],
      { hash: '1'.repeat(64) },
    ]) {
      expect(() =>
        parseSuccessorDiscoveryRecords([
          { ...records[0]!, englishMappingInputSha256: adversarial },
        ]),
      ).toThrow('hashes')
      expect(() =>
        parseSuccessorDiscoveryRecords([{ ...records[0]!, qid: adversarial }]),
      ).toThrow('QID')
      expect(() =>
        parseSuccessorDiscoveryRecords([
          { ...records[1]!, catalogueItemId: adversarial },
        ]),
      ).toThrow()
    }
  })

  it('validates derived semantic reasons, hides and the predecessor exception', () => {
    const published = [
      {
        qid: 'Q1',
        catalogueItemId: '00000000-0000-4000-8000-000000000001',
        state: 'published' as const,
      },
      {
        qid: 'Q2',
        catalogueItemId: '00000000-0000-4000-8000-000000000002',
        state: 'published' as const,
      },
      {
        qid: 'Q583684',
        catalogueItemId: '69269f92-4bfa-4657-95cf-0f71aa93ba0e',
        state: 'published' as const,
      },
    ]
    const retained = [
      {
        qid: 'Q114798266',
        catalogueItemId: '3ad12706-93ab-496e-9ca8-729fc79342e6',
        predecessorSha256: '3'.repeat(64),
        currentSha256: '4'.repeat(64),
        state: 'hidden' as const,
        correctionDisposition: 'catalogue_state_identity_scope_hide' as const,
      },
    ]
    const representation = createSuccessorRepresentation(published, retained, 3)
    const finalSelectionSha256 = discoverySha256(['Q1', 'Q2', 'Q583684'])
    const allocationLedger = [
      {
        version: 'identity-allocation.v1' as const,
        qid: 'Q2',
        catalogueItemId: '00000000-0000-4000-8000-000000000002',
        canonicalCandidateReceiptSha256: 'a'.repeat(64),
        reducedProjectionSha256: '8'.repeat(64),
        identityOutcome: 'approved-exact-work' as const,
        proposedSelectionSha256: '6'.repeat(64),
        allocationRound: 1,
      },
      {
        version: 'identity-allocation.v1' as const,
        qid: 'Q999',
        catalogueItemId: '00000000-0000-4000-8000-000000000999',
        canonicalCandidateReceiptSha256: 'a'.repeat(64),
        reducedProjectionSha256: '9'.repeat(64),
        identityOutcome: 'approved-exact-work' as const,
        proposedSelectionSha256: '7'.repeat(64),
        allocationRound: 2,
      },
    ]
    const allocationHistory = [
      {
        version: 'identity-allocation-history.v1' as const,
        event: 'allocated' as const,
        qid: 'Q2',
        catalogueItemId: '00000000-0000-4000-8000-000000000002',
        proposalSha256: '6'.repeat(64),
        reviewRound: 1,
        reducedProjectionSha256: '8'.repeat(64),
      },
      {
        version: 'identity-allocation-history.v1' as const,
        event: 'active' as const,
        qid: 'Q2',
        catalogueItemId: '00000000-0000-4000-8000-000000000002',
        proposalSha256: '6'.repeat(64),
        reviewRound: 1,
        reducedProjectionSha256: '8'.repeat(64),
        finalSelectionSha256,
      },
      {
        version: 'identity-allocation-history.v1' as const,
        event: 'allocated' as const,
        qid: 'Q999',
        catalogueItemId: '00000000-0000-4000-8000-000000000999',
        proposalSha256: '7'.repeat(64),
        reviewRound: 2,
        reducedProjectionSha256: '9'.repeat(64),
      },
      {
        version: 'identity-allocation-history.v1' as const,
        event: 'retired' as const,
        qid: 'Q999',
        catalogueItemId: '00000000-0000-4000-8000-000000000999',
        proposalSha256: '7'.repeat(64),
        reviewRound: 2,
        reducedProjectionSha256: '9'.repeat(64),
        finalSelectionSha256,
        reason: 'independent-review-rejected' as const,
      },
    ]
    const records = [
      {
        kind: 'eligible-selected',
        qid: 'Q1',
        reasonCodes: ['predecessor', 'audience-en'],
        englishBand: 'remainder',
        japaneseBand: 'unavailable',
        sitelinkBand: '0-to-4',
        englishMappingInputSha256: '1'.repeat(64),
        japaneseMappingInputSha256: '2'.repeat(64),
      },
      {
        kind: 'eligible-selected',
        qid: 'Q2',
        reasonCodes: ['audience-en', 'coverage-cell', 'franchise-continuity'],
        englishBand: 'remainder',
        japaneseBand: 'unavailable',
        sitelinkBand: '0-to-4',
        englishMappingInputSha256: '1'.repeat(64),
        japaneseMappingInputSha256: '2'.repeat(64),
      },
      {
        kind: 'predecessor-only-selected',
        catalogueItemId: '69269f92-4bfa-4657-95cf-0f71aa93ba0e',
        qid: 'Q583684',
        predecessorSha256: '5'.repeat(64),
        state: 'published',
        reasonCodes: ['predecessor'],
      },
      { kind: 'retained-predecessor', ...retained[0]! },
    ]
    const authority = {
      records,
      representation,
      expectedPublishedCount: 3,
      publishedPredecessorQids: ['Q1', 'Q583684'],
      coverageWitnessQids: ['Q2'],
      reviewedContinuityQids: ['Q2'],
      allocationLedger,
      allocationHistory,
    }
    const reasonAuthority = {
      records: authority.records,
      publishedPredecessorQids: authority.publishedPredecessorQids,
      coverageWitnessQids: authority.coverageWitnessQids,
      independentlyApprovedContinuityQids: authority.reviewedContinuityQids,
    }
    expect(
      validateDerivedSuccessorDiscoveryReasons(reasonAuthority),
    ).toHaveLength(4)
    expect(() =>
      validateDerivedSuccessorDiscoveryReasons({
        ...reasonAuthority,
        records: [
          records[0],
          { ...records[1]!, reasonCodes: ['audience-en'] },
          ...records.slice(2),
        ],
      }),
    ).toThrow('exactly match')
    expect(() =>
      createSuccessorRepresentation(
        published,
        [
          {
            ...retained[0]!,
            qid: 'Q3',
            correctionDisposition: 'unchanged-non-published',
          },
        ],
        3,
      ),
    ).not.toThrow()
    expect(() =>
      createSuccessorRepresentation(
        published,
        [{ ...retained[0]!, currentSha256: retained[0]!.predecessorSha256 }],
        3,
      ),
    ).toThrow('must change')
    expect(() =>
      validateDerivedSuccessorDiscoveryReasons({
        ...reasonAuthority,
        records: records.map((record) =>
          record.kind === 'predecessor-only-selected'
            ? {
                kind: 'eligible-selected',
                qid: 'Q583684',
                reasonCodes: ['predecessor'],
                englishBand: 'unavailable',
                japaneseBand: 'unavailable',
                sitelinkBand: '0-to-4',
                englishMappingInputSha256: '1'.repeat(64),
                japaneseMappingInputSha256: '2'.repeat(64),
              }
            : record,
        ),
      }),
    ).toThrow('predecessor-only')
  })

  it('recomputes every reviewed identity replacement round with accumulated exclusions', () => {
    const rows = Array.from({ length: 6 }, (_, index) =>
      candidate(`Q${index + 1}`),
    )
    const limits = constraints(3)
    const initial = selectCanonicalReleaseV2(rows, {
      constraints: limits,
      audienceAnchorCount: 1,
    })
    const candidateReceiptSha256 = 'a'.repeat(64)
    const predecessorCorpusSha256 = 'b'.repeat(64)
    const canonicalSelectionEvidenceSha256 = 'c'.repeat(64)
    const originalSeed = deriveIndependentSampleSeed({
      canonicalCandidateReceiptSha256: candidateReceiptSha256,
      predecessorCorpusSha256,
      orderedProposedPublishedQidSequenceSha256: discoverySha256(
        initial.selected.map(({ qid }) => qid),
      ),
    })
    const lineageAuthority = {
      originalSeed,
      initialOrderedQids: initial.selected.map(({ qid }) => qid),
    }
    const firstRemovedQid = initial.selected[1]!.qid
    const firstSelection = selectCanonicalReleaseV2(
      rows.filter(({ qid }) => qid !== firstRemovedQid),
      { constraints: limits, audienceAnchorCount: 1 },
    )
    const initialQids = initial.selected.map(({ qid }) => qid)
    const firstQids = firstSelection.selected.map(({ qid }) => qid)
    const firstAddedQids = firstQids.filter((qid) => !initialQids.includes(qid))
    const firstLineage = appendReplacementLineage(
      [],
      { removedQids: [firstRemovedQid], addedQids: firstAddedQids },
      lineageAuthority,
    )
    const secondRemovedQid = firstQids.find((qid) => qid !== firstAddedQids[0])!
    const excluded = new Set([firstRemovedQid, secondRemovedQid])
    const secondSelection = selectCanonicalReleaseV2(
      rows.filter(({ qid }) => !excluded.has(qid)),
      { constraints: limits, audienceAnchorCount: 1 },
    )
    const secondQids = secondSelection.selected.map(({ qid }) => qid)
    const secondAddedQids = secondQids.filter((qid) => !firstQids.includes(qid))
    const lineage = appendReplacementLineage(
      firstLineage,
      { removedQids: [secondRemovedQid], addedQids: secondAddedQids },
      lineageAuthority,
    )
    const reviewResults = [
      identityReplacementReview({
        candidateReceiptSha256,
        canonicalSelectionEvidenceSha256,
        originalSeed,
        round: 1,
        previousSelectedQids: initialQids,
        removedQids: [firstRemovedQid],
      }),
      identityReplacementReview({
        candidateReceiptSha256,
        canonicalSelectionEvidenceSha256,
        originalSeed,
        round: 2,
        previousSelectedQids: firstQids,
        removedQids: [secondRemovedQid],
      }),
    ]
    const authority = {
      initialSelection: initial,
      candidates: rows,
      independentlyApprovedContinuityQids: new Set<string>(),
      predecessorQids: [] as string[],
      candidateReceiptSha256,
      predecessorCorpusSha256,
      canonicalSelectionEvidenceSha256,
      lineage,
      reviewResults,
      constraints: limits,
      audienceAnchorCount: 1,
    }
    expect(
      validateIdentityReplacementLineageForFixture(authority),
    ).toMatchObject({
      originalSeed,
      currentSelectedQids: secondQids,
      latestAddedQids: secondAddedQids,
    })

    expect(() =>
      validateIdentityReplacementLineageForFixture({
        ...authority,
        predecessorQids: [firstRemovedQid],
      }),
    ).toThrow('cannot remove a predecessor')
    expect(() =>
      validateIdentityReplacementLineageForFixture({
        ...authority,
        reviewResults: [
          identityReplacementReview({
            candidateReceiptSha256,
            canonicalSelectionEvidenceSha256,
            originalSeed,
            round: 1,
            previousSelectedQids: initialQids,
            removedQids: ['Q999999'],
          }),
          reviewResults[1],
        ],
      }),
    ).toThrow('not currently selected')
    expect(() =>
      validateIdentityReplacementLineageForFixture({
        ...authority,
        reviewResults: [
          identityReplacementReview({
            candidateReceiptSha256,
            canonicalSelectionEvidenceSha256,
            originalSeed,
            round: 1,
            previousSelectedQids: initialQids,
            removedQids: ['q2'],
          }),
          reviewResults[1],
        ],
      }),
    ).toThrow('canonical QIDs')
    expect(() =>
      validateIdentityReplacementLineageForFixture({
        ...authority,
        reviewResults: [
          {
            ...reviewResults[0]!,
            removals: [
              {
                ...reviewResults[0]!.removals[0]!,
                outcome: 'approved',
              },
            ],
          },
          reviewResults[1],
        ],
      }),
    ).toThrow('outcome is not closed')
    expect(() =>
      validateIdentityReplacementLineageForFixture({
        ...authority,
        lineage: [
          {
            ...lineage[0]!,
            addedQids: ['Q6'],
            currentOrderedQids: initialQids
              .filter((qid) => qid !== firstRemovedQid)
              .concat('Q6')
              .sort(compareDiscoveryQids),
            currentOrderedQidSequenceSha256: discoverySha256(
              initialQids
                .filter((qid) => qid !== firstRemovedQid)
                .concat('Q6')
                .sort(compareDiscoveryQids),
            ),
          },
        ],
        reviewResults: [reviewResults[0]],
      }),
    ).toThrow('canonical recomputation')
    expect(() =>
      validateIdentityReplacementLineageForFixture({
        ...authority,
        lineage: [{ ...lineage[0]!, roundSeed: 'd'.repeat(64) }],
        reviewResults: [reviewResults[0]],
      }),
    ).toThrow('original seed')
  })

  it('rejects replacement removal when the fixed floors can no longer be met', () => {
    const rows = [
      candidate('Q1'),
      candidate('Q2', { format: 'movie' }),
      candidate('Q3'),
      candidate('Q4'),
    ]
    const limits = constraints(3, { formats: { movie: 1 } })
    const initial = selectCanonicalReleaseV2(rows, {
      constraints: limits,
      audienceAnchorCount: 1,
    })
    const candidateReceiptSha256 = 'a'.repeat(64)
    const predecessorCorpusSha256 = 'b'.repeat(64)
    const canonicalSelectionEvidenceSha256 = 'c'.repeat(64)
    const initialQids = initial.selected.map(({ qid }) => qid)
    const originalSeed = deriveIndependentSampleSeed({
      canonicalCandidateReceiptSha256: candidateReceiptSha256,
      predecessorCorpusSha256,
      orderedProposedPublishedQidSequenceSha256: discoverySha256(initialQids),
    })
    const lineage = appendReplacementLineage(
      [],
      { removedQids: ['Q2'], addedQids: ['Q4'] },
      { originalSeed, initialOrderedQids: initialQids },
    )
    expect(() =>
      validateIdentityReplacementLineageForFixture({
        initialSelection: initial,
        candidates: rows,
        independentlyApprovedContinuityQids: new Set<string>(),
        predecessorQids: [],
        candidateReceiptSha256,
        predecessorCorpusSha256,
        canonicalSelectionEvidenceSha256,
        lineage,
        reviewResults: [
          identityReplacementReview({
            candidateReceiptSha256,
            canonicalSelectionEvidenceSha256,
            originalSeed,
            round: 1,
            previousSelectedQids: initialQids,
            removedQids: ['Q2'],
          }),
        ],
        constraints: limits,
        audienceAnchorCount: 1,
      }),
    ).toThrow('No extendable canonical floor witness')
  })

  it('freezes the initial seed and derives ordered replacement rounds', () => {
    const inputs = {
      canonicalCandidateReceiptSha256: '1'.repeat(64),
      predecessorCorpusSha256: '2'.repeat(64),
      orderedProposedPublishedQidSequenceSha256: '3'.repeat(64),
    }
    const expected = createHash('sha256')
      .update(
        `m45-independent-sample.v1:${inputs.canonicalCandidateReceiptSha256}:${inputs.predecessorCorpusSha256}:${inputs.orderedProposedPublishedQidSequenceSha256}`,
      )
      .digest('hex')
    const seed = deriveIndependentSampleSeed(inputs)
    expect(seed).toBe(expected)
    const authority = {
      originalSeed: seed,
      initialOrderedQids: ['Q1', 'Q2', 'Q10'],
    }
    const lineage = appendReplacementLineage(
      [],
      {
        removedQids: ['Q10', 'Q2'],
        addedQids: ['Q20', 'Q3'],
      },
      authority,
    )
    expect(lineage[0]).toMatchObject({
      round: 1,
      removedQids: ['Q2', 'Q10'],
      addedQids: ['Q3', 'Q20'],
      previousOrderedQidSequenceSha256: discoverySha256(['Q1', 'Q2', 'Q10']),
      currentOrderedQids: ['Q1', 'Q3', 'Q20'],
      currentOrderedQidSequenceSha256: discoverySha256(['Q1', 'Q3', 'Q20']),
      roundSeed: deriveIndependentSampleRoundSeed(seed, 1),
    })
    expect(() =>
      appendReplacementLineage(
        [{ ...lineage[0]!, roundSeed: '0'.repeat(64) }],
        {
          removedQids: ['Q3'],
          addedQids: ['Q4'],
        },
        authority,
      ),
    ).toThrow('original seed')
    expect(() =>
      appendReplacementLineage(
        lineage,
        { removedQids: ['Q2'], addedQids: ['Q4'] },
        authority,
      ),
    ).toThrow('absent or re-removed')
    expect(() =>
      appendReplacementLineage(
        lineage,
        { removedQids: ['Q3'], addedQids: ['Q2'] },
        authority,
      ),
    ).toThrow('re-added')
    expect(() =>
      appendReplacementLineage(
        lineage,
        { removedQids: ['Q3'], addedQids: [] },
        authority,
      ),
    ).toThrow('cardinality')
    expect(() =>
      validateReplacementLineage(
        [
          {
            ...lineage[0]!,
            currentOrderedQidSequenceSha256: '9'.repeat(64),
          },
        ],
        authority,
      ),
    ).toThrow('current sequence hash')
    expect(() =>
      appendReplacementLineage(
        lineage,
        { removedQids: [3 as never], addedQids: ['Q4'] },
        authority,
      ),
    ).toThrow('canonical QIDs')
  })
})

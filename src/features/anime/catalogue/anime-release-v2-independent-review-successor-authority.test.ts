import { readdirSync, readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  deriveIndependentReviewRiskReasons,
  parseIndependentReviewPopulationAuthority,
  prepareIndependentReviewSample,
  type IndependentReviewPopulationRecord,
} from '@/features/anime/catalogue/anime-release-v2-independent-review'
import {
  deriveIndependentReviewSeriesSha256,
  independentReviewWorkingAllocationHistorySha256,
  parseIndependentReviewInitialAuthoritySnapshot,
  parseIndependentReviewSuccessorAuthoritySnapshotForFixture,
} from '@/features/anime/catalogue/anime-release-v2-independent-review-successor-authority'
import {
  identityAllocationHistoryVersion,
  identityAllocationLedgerSha256,
} from '@/features/anime/catalogue/anime-release-v2-identity-allocation'
import {
  createIndependentReviewExactEmptyRootFixture,
  createIndependentReviewExactEmptySuccessorFixture,
  createIndependentReviewRootFixtureVariant,
  createParsedSuccessorRounds,
  createParsedSuccessorRoundsForRemovals,
  createParsedSuccessorRoundsVariant,
  digest,
  identityFixture,
  initialRootSnapshot,
  mutatePredecessorProjection,
  rebindRecord,
  rehashRetainedRecordMutation,
  rehashSnapshotProof,
  root,
  uuid,
} from '@/features/anime/catalogue/test-support/anime-release-v2-independent-review-fixture'

describe('Decision 098 initial authority snapshot', () => {
  it('builds strict memoized 100/99 isolated threshold authorities', () => {
    const input = {
      mandatoryRiskQids: ['Q200'],
      isolatedCohorts: [
        {
          qids: Array.from({ length: 100 }, (_, index) => `Q${index + 1}`),
          acquisitionCohort: '159',
          selectionCohort: {
            discoveryReasons: ['audience-en', 'audience-ja'],
            format: 'tv',
            eraBucket: '2020-2026',
          },
        },
        {
          qids: Array.from({ length: 99 }, (_, index) => `Q${index + 101}`),
          acquisitionCohort: '160',
          selectionCohort: {
            discoveryReasons: ['multilingual-coverage', 'franchise-continuity'],
            format: 'tv',
            eraBucket: '2020-2026',
          },
        },
      ],
    } as const
    const variant = createIndependentReviewRootFixtureVariant(input)
    expect(createIndependentReviewRootFixtureVariant(input)).toBe(variant)
    expect(
      parseIndependentReviewInitialAuthoritySnapshot(variant.initialSnapshot),
    ).toEqual(variant.initialSnapshot)
    expect(variant.root.allocationLedger).toEqual(root.allocationLedger)
    expect(variant.root.allocationHistory).toEqual(root.allocationHistory)

    for (const [index, isolated] of input.isolatedCohorts.entries()) {
      const exactExpansionQids = variant.root.population.records
        .filter(
          (record) =>
            record.acquisitionCohort === isolated.acquisitionCohort ||
            JSON.stringify(record.selectionCohort) ===
              JSON.stringify(isolated.selectionCohort),
        )
        .map(({ qid }) => qid)
        .sort((left, right) => Number(left.slice(1)) - Number(right.slice(1)))
      expect(exactExpansionQids).toEqual(isolated.qids)
      expect(exactExpansionQids).toHaveLength(index === 0 ? 100 : 99)
    }
    const mandatory = variant.root.population.records.find(
      (record) => record.qid === 'Q200',
    )!
    expect(mandatory.riskTriggers.sourceFlag).toBe(true)
    expect(mandatory.mandatoryRiskReasons).toEqual(['source-flag'])

    expect(() =>
      createIndependentReviewRootFixtureVariant({
        ...input,
        mandatoryRiskQids: ['Q200', 'Q200'],
      }),
    ).toThrow(/unique/)
    expect(() =>
      createIndependentReviewRootFixtureVariant({
        ...input,
        mandatoryRiskQids: ['Q5000'],
      }),
    ).toThrow(/candidate/)
    expect(() =>
      createIndependentReviewRootFixtureVariant({ ...input, extra: true }),
    ).toThrow(/unknown fields/)
    expect(() =>
      createIndependentReviewRootFixtureVariant({
        ...input,
        isolatedCohorts: [
          input.isolatedCohorts[0],
          {
            ...input.isolatedCohorts[1],
            qids: ['Q100'],
          },
        ],
      }),
    ).toThrow(/disjoint/)
  }, 30_000)

  it('distributes synthetic candidates across bounded acquisition and selection cohorts', () => {
    const candidates = root.population.records.filter(
      (record) => record.projection.kind === 'new-candidate',
    )
    const predecessor = root.population.records.find(
      (record) => record.projection.kind === 'predecessor',
    )!
    const acquisitionSizes = new Map<string, number>()
    const selectionSizes = new Map<string, number>()
    for (const record of candidates) {
      acquisitionSizes.set(
        record.acquisitionCohort,
        (acquisitionSizes.get(record.acquisitionCohort) ?? 0) + 1,
      )
      const selectionKey = JSON.stringify(
        record.selectionCohort.discoveryReasons,
      )
      selectionSizes.set(
        selectionKey,
        (selectionSizes.get(selectionKey) ?? 0) + 1,
      )
    }

    expect([...acquisitionSizes.keys()].sort()).toEqual(
      Array.from({ length: 160 }, (_, index) =>
        String(index + 1).padStart(3, '0'),
      ),
    )
    expect([...acquisitionSizes.values()].sort((a, b) => a - b)).toEqual([
      ...Array.from({ length: 121 }, () => 31),
      ...Array.from({ length: 39 }, () => 32),
    ])
    expect([...selectionSizes.values()].sort((a, b) => a - b)).toEqual([
      833, 833, 833, 833, 833, 834,
    ])
    expect(
      Math.max(...acquisitionSizes.values()) +
        Math.max(...selectionSizes.values()),
    ).toBeLessThan(root.population.records.length)
    expect(predecessor.acquisitionCohort).toBe('predecessor-v1')
    expect(predecessor.selectionCohort.discoveryReasons).toEqual([
      'predecessor',
    ])
  })

  it('derives one root-series commitment from the complete parsed tuple', () => {
    const snapshot = initialRootSnapshot
    expect(snapshot.reviewSeriesSha256).toBe(
      deriveIndependentReviewSeriesSha256(
        root.seedAuthority,
        root.proposal,
        root.population,
      ),
    )
    expect(parseIndependentReviewInitialAuthoritySnapshot(snapshot)).toEqual(
      snapshot,
    )
  })

  it.each([
    'candidateReceiptSha256',
    'predecessorCorpusSha256',
    'orderedProposedPublishedQidSequenceSha256',
    'originalSeed',
    'seedAuthoritySha256',
  ])('rejects root seed mutation: %s', (field) => {
    const snapshot = initialRootSnapshot
    expect(() =>
      parseIndependentReviewInitialAuthoritySnapshot({
        ...snapshot,
        seedAuthority: { ...snapshot.seedAuthority, [field]: digest(field) },
      }),
    ).toThrow()
  })

  it.each([
    'proposalSha256',
    'orderedProposedPublishedQidSequenceSha256',
    'candidateAuthoritySha256',
  ])('rejects root proposal mutation: %s', (field) => {
    const snapshot = initialRootSnapshot
    expect(() =>
      parseIndependentReviewInitialAuthoritySnapshot({
        ...snapshot,
        proposal: { ...snapshot.proposal, [field]: digest(field) },
      }),
    ).toThrow()
  })

  it('rejects a root population substitution and snapshot hash substitution', () => {
    const snapshot = initialRootSnapshot
    const record = snapshot.population.records[0]!
    const changed = {
      ...record,
      identityReviewSha256: digest('substituted-review'),
    }
    expect(() =>
      parseIndependentReviewPopulationAuthority(
        {
          ...snapshot.population,
          records: [changed, ...snapshot.population.records.slice(1)],
        },
        snapshot.proposal,
        snapshot.seedAuthority,
      ),
    ).toThrow()
    expect(() =>
      parseIndependentReviewInitialAuthoritySnapshot({
        ...snapshot,
        authoritySnapshotSha256: digest('forged-snapshot'),
      }),
    ).toThrow(/snapshot commitment/)
  })

  it('keeps the successor module acyclic: it cannot import result/history', () => {
    const source = readFileSync(
      new URL(
        './anime-release-v2-independent-review-successor-authority.ts',
        import.meta.url,
      ),
      'utf8',
    )
    expect(source).not.toMatch(/independent-review-result/)
    expect(source).not.toMatch(
      /export function prepareIndependentReviewSuccessorSamplingCore/,
    )
  })

  it('preindexes replacement-edge QID evidence instead of rescanning populations per delta', () => {
    const source = readFileSync(
      new URL(
        './anime-release-v2-independent-review-successor-authority.ts',
        import.meta.url,
      ),
      'utf8',
    )
    expect(source).not.toMatch(/population\.records\.find\s*\(/)
    expect(source).not.toMatch(/priorPopulation\.records\.find\s*\(/)
    expect(source).not.toMatch(/expectedOutcomes\.find\s*\(/)
    expect(source).toContain('const populationByQid = new Map(')
    expect(source).toContain('const priorPopulationByQid = new Map(')
    expect(source).toContain('const expectedOutcomeByQid = new Map(')
    expect(source).toContain('const retiredHistoryByQid = new Map(')
  })

  it('keeps catalogue test-support unreachable from production source and scripts', () => {
    const repositoryRoot = new URL('../../../../', import.meta.url)
    const productionExtension = /\.(?:[cm]?[jt]s|tsx)$/
    const testOrSpec = /(?:^|\/)[^/]+\.(?:test|spec)\.(?:[cm]?[jt]s|tsx)$/
    const files = (directory: URL): string[] =>
      readdirSync(directory).flatMap((entry) => {
        const target = new URL(entry, directory)
        return statSync(target).isDirectory()
          ? files(new URL(`${entry}/`, directory))
          : productionExtension.test(target.pathname)
            ? [target.pathname]
            : []
      })
    const productionImports = ['src/', 'scripts/']
      .flatMap((root) => files(new URL(root, repositoryRoot)))
      .filter(
        (file) =>
          !testOrSpec.test(file) && !file.includes('/catalogue/test-support/'),
      )
      .filter((file) => readFileSync(file, 'utf8').includes('/test-support/'))
      .sort()

    expect(productionImports).toEqual([])
  })

  it('permits the fixture parser only through the runtime-gated result fixture boundary', () => {
    const catalogueDirectory = new URL('./', import.meta.url)
    const files = (directory: URL): string[] =>
      readdirSync(directory).flatMap((entry) => {
        const target = new URL(entry, directory)
        return statSync(target).isDirectory()
          ? files(new URL(`${entry}/`, directory))
          : target.pathname.endsWith('.ts')
            ? [target.pathname]
            : []
      })
    const productionImports = files(catalogueDirectory).filter((file) => {
      if (file.endsWith('.test.ts') || file.endsWith('.spec.ts')) return false
      const source = readFileSync(file, 'utf8')
      return (
        file !==
          new URL(
            './anime-release-v2-independent-review-successor-authority.ts',
            import.meta.url,
          ).pathname &&
        source.includes(
          'parseIndependentReviewSuccessorAuthoritySnapshotForFixture',
        )
      )
    })
    expect(productionImports).toEqual([
      new URL(
        './anime-release-v2-independent-review-result.ts',
        import.meta.url,
      ).pathname,
    ])
    const resultSource = readFileSync(productionImports[0]!, 'utf8')
    expect(resultSource).toMatch(
      /export function parseIndependentReviewSeriesForFixture[\s\S]*?process\.env\.NODE_ENV !== 'test'[\s\S]*?parseIndependentReviewSuccessorAuthoritySnapshotForFixture/,
    )
    expect(resultSource).toMatch(
      /export function prepareIndependentReviewFreshSampleForFixture[\s\S]*?process\.env\.NODE_ENV !== 'test'[\s\S]*?parseIndependentReviewSuccessorAuthoritySnapshotForFixture/,
    )
  })

  it('uses an append-only M45-07 working history and rejects premature active finalization', () => {
    expect(
      identityFixture('Q5001', digest('fixture-projection')).proposal
        .orderedQids,
    ).toEqual(['Q5001'])
    const allocated = {
      version: identityAllocationHistoryVersion,
      event: 'allocated' as const,
      qid: 'Q1',
      catalogueItemId: uuid(1),
      proposalSha256: digest('proposal'),
      reviewRound: 1,
      reducedProjectionSha256: digest('projection'),
    }
    expect(
      independentReviewWorkingAllocationHistorySha256([allocated]),
    ).toMatch(/^[a-f0-9]{64}$/)
    expect(() =>
      independentReviewWorkingAllocationHistorySha256([
        allocated,
        {
          ...allocated,
          event: 'active' as const,
          finalSelectionSha256: digest('final'),
        },
      ]),
    ).toThrow(/active allocations/)
  })

  it('binds the exact mixed root allocation pair and rejects custody mutations', () => {
    const snapshot = initialRootSnapshot
    expect(
      snapshot.population.records.filter(
        (record) => record.projection.kind === 'new-candidate',
      ),
    ).toHaveLength(4_999)
    expect(
      snapshot.population.records.filter(
        (record) => record.projection.kind === 'predecessor',
      ),
    ).toHaveLength(1)
    expect(snapshot.allocationLedger).toHaveLength(4_999)
    expect(snapshot.allocationHistory).toHaveLength(4_999)

    const reorderedLedger = [...snapshot.allocationLedger]
    ;[reorderedLedger[0], reorderedLedger[1]] = [
      reorderedLedger[1]!,
      reorderedLedger[0]!,
    ]
    const substitutions: unknown[] = [
      { ...snapshot, allocationLedger: reorderedLedger },
      {
        ...snapshot,
        allocationLedger: snapshot.allocationLedger.slice(1),
        allocationHistory: snapshot.allocationHistory.slice(1),
      },
      {
        ...snapshot,
        allocationLedger: [
          ...snapshot.allocationLedger,
          {
            ...snapshot.allocationLedger[0]!,
            qid: 'Q5000',
            catalogueItemId: uuid(5000),
          },
        ],
        allocationHistory: [
          ...snapshot.allocationHistory,
          {
            ...snapshot.allocationHistory[0]!,
            qid: 'Q5000',
            catalogueItemId: uuid(5000),
          },
        ],
      },
      {
        ...snapshot,
        allocationHistory: snapshot.allocationHistory.map((event, index) =>
          index === 0
            ? {
                ...event,
                event: 'active' as const,
                finalSelectionSha256: digest('premature-active'),
              }
            : event,
        ),
      },
      {
        ...snapshot,
        allocationHistory: snapshot.allocationHistory.map((event, index) =>
          index === 0
            ? {
                ...event,
                event: 'retired' as const,
                finalSelectionSha256: digest('premature-retired'),
                reason: 'independent-review-rejected' as const,
              }
            : event,
        ),
      },
      {
        ...snapshot,
        allocationLedgerSha256: digest('forged-root-ledger'),
      },
      {
        ...snapshot,
        allocationHistorySha256: digest('forged-root-history'),
      },
    ]
    for (const substitution of substitutions)
      expect(() =>
        parseIndependentReviewInitialAuthoritySnapshot(substitution),
      ).toThrow()
  }, 60_000)
})

describe('Decisions 098–100 successor authority', () => {
  it('builds the dedicated single-bridge exact-empty successor authority', () => {
    const exactRoot = createIndependentReviewExactEmptyRootFixture()
    const exactSample = prepareIndependentReviewSample({
      population: exactRoot.root.population,
      proposal: exactRoot.root.proposal,
      seedAuthority: exactRoot.root.seedAuthority,
      round: 'initial',
    })
    expect(exactSample.sampledCanonicalUuids).toContain(uuid(2016))
    const bridge = exactRoot.root.population.records.find(
      (record) => record.qid === 'Q2016',
    )!
    const bridgeExpansionQids = exactRoot.root.population.records
      .filter(
        (record) =>
          record.acquisitionCohort === bridge.acquisitionCohort ||
          JSON.stringify(record.selectionCohort) ===
            JSON.stringify(bridge.selectionCohort),
      )
      .map(({ qid }) => qid)
    expect(bridgeExpansionQids).toHaveLength(4_999)
    const predecessor = exactRoot.root.population.records.find(
      (record) => record.qid === 'Q5000',
    )!
    expect(predecessor.mandatoryRiskReasons).toEqual(['source-flag'])
    const cohortSizes = new Map<string, number>()
    for (const record of exactRoot.root.population.records.filter(
      (candidate) => candidate.projection.kind === 'new-candidate',
    ))
      cohortSizes.set(
        record.acquisitionCohort,
        (cohortSizes.get(record.acquisitionCohort) ?? 0) + 1,
      )
    expect(cohortSizes).toEqual(
      new Map([
        ['159', 2_500],
        ['160', 2_499],
      ]),
    )

    const input = { firstRemovedQid: 'Q2016', secondRemovedQid: 'Q2501' }
    const rounds = createIndependentReviewExactEmptySuccessorFixture(input)
    expect(createIndependentReviewExactEmptySuccessorFixture(input)).toBe(
      rounds,
    )
    expect(rounds.rootSnapshot).toEqual(exactRoot.initialSnapshot)
    const addition = rounds.firstSnapshot.population.records.find(
      (record) => record.qid === 'Q5001',
    )!
    expect(addition.mandatoryRiskReasons).toEqual(['source-flag'])
    expect(
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
        rounds.firstSnapshot,
        { rootSnapshot: rounds.rootSnapshot, priorSuccessorSnapshots: [] },
      ),
    ).toEqual(rounds.firstSnapshot)
    expect(() =>
      createIndependentReviewExactEmptySuccessorFixture({
        ...input,
        unexpected: true,
      }),
    ).toThrow(/unknown fields/)
  }, 30_000)

  it('rebuilds a strict successor chain with a mandatory added record', () => {
    const input = {
      firstRemovedQid: 'Q3',
      secondRemovedQid: 'Q4',
      mandatoryAddedRounds: [1],
    }
    const rounds = createParsedSuccessorRoundsVariant(input)
    expect(createParsedSuccessorRoundsVariant(input)).toBe(rounds)
    const firstAdded = rounds.firstSnapshot.population.records.find(
      (record) => record.qid === 'Q5001',
    )!
    const secondAdded = rounds.secondSnapshot.population.records.find(
      (record) => record.qid === 'Q5002',
    )!
    expect(firstAdded.riskTriggers.sourceFlag).toBe(true)
    expect(firstAdded.mandatoryRiskReasons).toEqual(['source-flag'])
    expect(secondAdded.mandatoryRiskReasons).toEqual([])
    expect(
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
        rounds.firstSnapshot,
        { rootSnapshot: rounds.rootSnapshot, priorSuccessorSnapshots: [] },
      ),
    ).toEqual(rounds.firstSnapshot)
    expect(
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
        rounds.secondSnapshot,
        {
          rootSnapshot: rounds.rootSnapshot,
          priorSuccessorSnapshots: [rounds.firstSnapshot],
        },
      ),
    ).toEqual(rounds.secondSnapshot)
    expect(() =>
      createParsedSuccessorRoundsVariant({
        ...input,
        mandatoryAddedRounds: [1, 1],
      }),
    ).toThrow(/unique ascending/)
    expect(() =>
      createParsedSuccessorRoundsVariant({ ...input, unexpected: true }),
    ).toThrow(/unknown fields/)
  }, 30_000)

  it('constructs and memoizes a strictly selected two-round removal chain', () => {
    const input = {
      firstRemovedQid: 'Q3',
      secondRemovedQid: 'Q5001',
    }
    const rounds = createParsedSuccessorRoundsForRemovals(input)
    expect(createParsedSuccessorRoundsForRemovals(input)).toBe(rounds)
    expect(rounds.firstSnapshot.replacementProof.removals).toHaveLength(1)
    expect(rounds.firstSnapshot.replacementProof.removals[0]!.qid).toBe('Q3')
    expect(rounds.secondSnapshot.replacementProof.removals).toHaveLength(1)
    expect(rounds.secondSnapshot.replacementProof.removals[0]!.qid).toBe(
      'Q5001',
    )
    expect(
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
        rounds.firstSnapshot,
        { rootSnapshot: rounds.rootSnapshot, priorSuccessorSnapshots: [] },
      ),
    ).toEqual(rounds.firstSnapshot)
    expect(
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
        rounds.secondSnapshot,
        {
          rootSnapshot: rounds.rootSnapshot,
          priorSuccessorSnapshots: [rounds.firstSnapshot],
        },
      ),
    ).toEqual(rounds.secondSnapshot)

    expect(() =>
      createParsedSuccessorRoundsForRemovals({
        firstRemovedQid: 'Q5000',
        secondRemovedQid: 'Q2',
      }),
    ).toThrow(/new-candidate/)
    expect(() =>
      createParsedSuccessorRoundsForRemovals({
        firstRemovedQid: 'Q3',
        secondRemovedQid: 'Q3',
      }),
    ).toThrow(/distinct/)
    expect(() =>
      createParsedSuccessorRoundsForRemovals({
        firstRemovedQid: 'Q3',
        secondRemovedQid: 'Q4',
        unexpected: true,
      } as never),
    ).toThrow(/not exact/)
  }, 60_000)

  it('parses genuine 5,000-record round-one and contiguous round-two successor snapshots', () => {
    const { rootSnapshot, firstSnapshot, secondSnapshot } =
      createParsedSuccessorRounds()
    expect(
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
        firstSnapshot,
        {
          rootSnapshot,
          priorSuccessorSnapshots: [],
        },
      ),
    ).toEqual(firstSnapshot)
    expect(
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
        secondSnapshot,
        {
          rootSnapshot,
          priorSuccessorSnapshots: [firstSnapshot],
        },
      ),
    ).toEqual(secondSnapshot)
  }, 30_000)

  it('uses Decision100 one-way proof-to-population binding and rejects the removed population proof field', () => {
    const { rootSnapshot, firstSnapshot } = createParsedSuccessorRounds()
    expect(() =>
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
        {
          ...firstSnapshot,
          population: {
            ...firstSnapshot.population,
            replacementProofSha256:
              firstSnapshot.replacementProof.replacementProofSha256,
          },
        },
        { rootSnapshot, priorSuccessorSnapshots: [] },
      ),
    ).toThrow(/unknown fields/)
    expect(() =>
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
        {
          ...firstSnapshot,
          replacementProof: {
            ...firstSnapshot.replacementProof,
            nextPopulationSha256: digest('swapped-population'),
          },
        },
        { rootSnapshot, priorSuccessorSnapshots: [] },
      ),
    ).toThrow(/detached authority commitments/)
  }, 30_000)

  it.each([
    'rootSeedAuthoritySha256',
    'reviewSeriesSha256',
    'priorAuthoritySnapshotSha256',
    'authoritySnapshotSha256',
  ])('rejects a successor snapshot commitment mutation: %s', (field) => {
    const { rootSnapshot, firstSnapshot } = createParsedSuccessorRounds()
    expect(() =>
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
        { ...firstSnapshot, [field]: digest(`mutated-${field}`) },
        { rootSnapshot, priorSuccessorSnapshots: [] },
      ),
    ).toThrow()
  }, 30_000)

  it.each([
    'proposalSha256',
    'orderedProposedPublishedQidSequenceSha256',
    'priorAuthoritySnapshotSha256',
    'populationSha256',
  ])('rejects a successor population commitment mutation: %s', (field) => {
    const { rootSnapshot, firstSnapshot } = createParsedSuccessorRounds()
    expect(() =>
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
        {
          ...firstSnapshot,
          population: {
            ...firstSnapshot.population,
            [field]: digest(`mutated-${field}`),
          },
        },
        { rootSnapshot, priorSuccessorSnapshots: [] },
      ),
    ).toThrow()
  }, 30_000)

  it.each([
    'priorProposalSha256',
    'priorPopulationSha256',
    'nextProposalSha256',
    'nextPopulationSha256',
    'replacementLineageSha256',
    'allocationLedgerSha256',
    'allocationHistorySha256',
    'replacementProofSha256',
  ])(
    'rejects a replacement proof commitment mutation: %s',
    (field) => {
      const { rootSnapshot, firstSnapshot } = createParsedSuccessorRounds()
      expect(() =>
        parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
          {
            ...firstSnapshot,
            replacementProof: {
              ...firstSnapshot.replacementProof,
              [field]: digest(`mutated-${field}`),
            },
          },
          { rootSnapshot, priorSuccessorSnapshots: [] },
        ),
      ).toThrow()
    },
    30_000,
  )

  it('requires a strict, non-empty, ordered triggering-defect table', () => {
    const { rootSnapshot, firstSnapshot } = createParsedSuccessorRounds()
    const parse = (replacementProof: unknown) =>
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
        rehashSnapshotProof(firstSnapshot, replacementProof as never),
        { rootSnapshot, priorSuccessorSnapshots: [] },
      )
    const defect = firstSnapshot.replacementProof.triggeringDefects[0]!
    expect(() =>
      parse({ ...firstSnapshot.replacementProof, triggeringDefects: [] }),
    ).toThrow(/non-empty/)
    expect(() =>
      parse({
        ...firstSnapshot.replacementProof,
        triggeringDefects: [{ ...defect, unexpected: true }],
      }),
    ).toThrow(/unknown fields/)
    expect(() =>
      parse({
        ...firstSnapshot.replacementProof,
        triggeringDefects: [{ ...defect, category: 'unknown-category' }],
      }),
    ).toThrow(/category/)
    expect(() =>
      parse({
        ...firstSnapshot.replacementProof,
        triggeringDefects: [defect, defect],
      }),
    ).toThrow(/unique/)
    expect(() =>
      parse({
        ...firstSnapshot.replacementProof,
        triggeringDefects: [{ ...defect, qid: 'Q2' }, defect],
      }),
    ).toThrow(/unique/)

    const secondDefect = {
      ...defect,
      planSha256: digest('second-trigger-plan'),
      inputSha256: digest('second-trigger-input'),
      resultSha256: digest('second-trigger-result'),
      recordCommitment: rootSnapshot.population.records[1]!.recordCommitment,
      qid: 'Q2',
      category: 'duplicate' as const,
    }
    expect(() =>
      parse({
        ...firstSnapshot.replacementProof,
        triggeringDefects: [{ ...secondDefect, qid: defect.qid }, defect],
      }),
    ).toThrow(/unique/)
    const ordered = [defect, secondDefect].sort((left, right) =>
      left.recordCommitment.localeCompare(right.recordCommitment, 'en'),
    )
    expect(
      parse({
        ...firstSnapshot.replacementProof,
        triggeringDefects: ordered,
      }),
    ).toMatchObject({
      replacementProof: { triggeringDefects: ordered },
    })
    expect(() =>
      parse({
        ...firstSnapshot.replacementProof,
        triggeringDefects: [...ordered].reverse(),
      }),
    ).toThrow(/ASCII/)
  }, 30_000)

  it('rejects superseded singular triggering hashes', () => {
    const { rootSnapshot, firstSnapshot } = createParsedSuccessorRounds()
    expect(() =>
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
        {
          ...firstSnapshot,
          replacementProof: {
            ...firstSnapshot.replacementProof,
            triggeringPlanSha256: digest('obsolete-trigger-plan'),
          },
        },
        { rootSnapshot, priorSuccessorSnapshots: [] },
      ),
    ).toThrow(/unknown fields/)
  }, 30_000)

  it('proves the exact four-member retained-record proposal rebind and rejects substantive drift', () => {
    const { rootSnapshot, firstSnapshot } = createParsedSuccessorRounds()
    const rootRecord = rootSnapshot.population.records.find(
      (record) => record.qid === 'Q3',
    )!
    const successorRecord = firstSnapshot.population.records.find(
      (record) => record.qid === 'Q3',
    )!
    expect(rootRecord.canonicalUuid).toBe(successorRecord.canonicalUuid)
    expect(rootRecord.proposalRecordSha256).not.toBe(
      successorRecord.proposalRecordSha256,
    )
    expect(rootRecord.projection.proposalRecordSha256).not.toBe(
      successorRecord.projection.proposalRecordSha256,
    )
    expect(rootRecord.projection.projectionSha256).not.toBe(
      successorRecord.projection.projectionSha256,
    )
    expect(rootRecord.recordCommitment).not.toBe(
      successorRecord.recordCommitment,
    )
    expect(() =>
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
        {
          ...firstSnapshot,
          population: {
            ...firstSnapshot.population,
            records: firstSnapshot.population.records.map((record) =>
              record.qid === 'Q3'
                ? {
                    ...record,
                    projection: {
                      ...record.projection,
                      proposedItem: {
                        ...record.projection.proposedItem,
                        titles: {
                          ...record.projection.proposedItem.titles,
                          english: 'substantive drift',
                        },
                      },
                    },
                  }
                : record,
            ),
          },
        },
        { rootSnapshot, priorSuccessorSnapshots: [] },
      ),
    ).toThrow()
  })

  it('rejects every rehashed nonpermitted retained record and projection layer mutation', () => {
    const { rootSnapshot, firstSnapshot } = createParsedSuccessorRounds()
    const projectionMutation = (
      record: IndependentReviewPopulationRecord,
      projection: Partial<IndependentReviewPopulationRecord['projection']>,
    ) =>
      ({
        ...record,
        projection: { ...record.projection, ...projection },
      }) as IndependentReviewPopulationRecord
    const cases: readonly Readonly<{
      name: string
      mutate: (
        record: IndependentReviewPopulationRecord,
      ) => IndependentReviewPopulationRecord
    }>[] = [
      {
        name: 'canonical UUID',
        mutate: (record) =>
          projectionMutation(
            { ...record, canonicalUuid: uuid(9000) },
            { canonicalUuid: uuid(9000) },
          ),
      },
      {
        name: 'QID',
        mutate: (record) =>
          projectionMutation({ ...record, qid: 'Q6000' }, { qid: 'Q6000' }),
      },
      {
        name: 'identity review',
        mutate: (record) => {
          const value = digest('changed-identity-review')
          return projectionMutation(
            { ...record, identityReviewSha256: value },
            { identityReviewSha256: value },
          )
        },
      },
      {
        name: 'identity allocation',
        mutate: (record) => {
          const value = digest('changed-identity-allocation')
          return projectionMutation(
            { ...record, identityAllocationSha256: value },
            { identityAllocationSha256: value },
          )
        },
      },
      {
        name: 'primary evidence',
        mutate: (record) => ({
          ...record,
          primaryReviewEvidenceSha256: digest('changed-primary-evidence'),
        }),
      },
      {
        name: 'primary required',
        mutate: (record) =>
          projectionMutation(
            { ...record, primaryReviewRequired: false },
            { primaryReviewRequired: false },
          ),
      },
      {
        name: 'primary complete',
        mutate: (record) =>
          projectionMutation(
            { ...record, primaryReviewComplete: false },
            { primaryReviewComplete: false },
          ),
      },
      {
        name: 'acquisition cohort',
        mutate: (record) => ({ ...record, acquisitionCohort: '002' }),
      },
      {
        name: 'selection cohort',
        mutate: (record) => ({
          ...record,
          selectionCohort: {
            ...record.selectionCohort,
            eraBucket: '2010-2019',
          },
        }),
      },
      {
        name: 'risk evidence',
        mutate: (record) => {
          const riskTriggers = { ...record.riskTriggers, sourceFlag: true }
          return {
            ...record,
            riskTriggers,
            mandatoryRiskReasons:
              deriveIndependentReviewRiskReasons(riskTriggers),
          }
        },
      },
      {
        name: 'proposed item',
        mutate: (record) =>
          projectionMutation(record, {
            proposedItem: {
              ...record.projection.proposedItem,
              titles: {
                ...record.projection.proposedItem.titles,
                english: 'Changed retained title',
              },
            },
          }),
      },
      {
        name: 'source projection',
        mutate: (record) =>
          projectionMutation(record, {
            sourceProjection: {
              ...record.projection.sourceProjection,
              revision: 2,
            },
          }),
      },
      {
        name: 'adult signals',
        mutate: (record) => {
          const riskTriggers = {
            ...record.riskTriggers,
            adultSafetySignal: true,
          }
          return projectionMutation(
            {
              ...record,
              riskTriggers,
              mandatoryRiskReasons:
                deriveIndependentReviewRiskReasons(riskTriggers),
            },
            { adultSignals: ['instance-hentai'] },
          )
        },
      },
      {
        name: 'continuity',
        mutate: (record) =>
          projectionMutation(record, { directContinuityQids: ['Q7'] }),
      },
      {
        name: 'machine review required',
        mutate: (record) =>
          projectionMutation(record, { machineReviewRequired: false }),
      },
      {
        name: 'machine review complete',
        mutate: (record) =>
          projectionMutation(record, { machineReviewComplete: false }),
      },
      ...[
        'candidateSha256',
        'manifestSha256',
        'acquisitionOutcomeSha256',
        'candidateProjectionSha256',
        'candidateReviewAuthoritySha256',
      ].map((field) => ({
        name: field,
        mutate: (record: IndependentReviewPopulationRecord) =>
          projectionMutation(record, {
            [field]: digest(`changed-${field}`),
          }),
      })),
    ]
    for (const testCase of cases) {
      const changed = rehashRetainedRecordMutation(
        firstSnapshot,
        'Q3',
        testCase.mutate,
      )
      expect(
        () =>
          parseIndependentReviewSuccessorAuthoritySnapshotForFixture(changed, {
            rootSnapshot,
            priorSuccessorSnapshots: [],
          }),
        testCase.name,
      ).toThrow()
    }
  }, 90_000)

  it('rejects every rehashed predecessor-specific retained mutation', () => {
    const { rootSnapshot, firstSnapshot } = createParsedSuccessorRounds()
    const cases: readonly Readonly<{
      name: string
      mutate: (
        record: IndependentReviewPopulationRecord,
      ) => IndependentReviewPopulationRecord
    }>[] = [
      {
        name: 'predecessor normalized item commitment',
        mutate: (record) =>
          mutatePredecessorProjection(record, (projection) => ({
            ...projection,
            predecessorNormalizedItemSha256: digest(
              'changed-predecessor-normalized-item',
            ),
          })),
      },
      {
        name: 'proposed normalized item commitment',
        mutate: (record) =>
          mutatePredecessorProjection(record, (projection) => ({
            ...projection,
            proposedNormalizedItemSha256: digest(
              'changed-proposed-normalized-item',
            ),
          })),
      },
      {
        name: 'predecessor projection commitment',
        mutate: (record) =>
          mutatePredecessorProjection(record, (projection) => ({
            ...projection,
            predecessorProjectionSha256: digest(
              'changed-predecessor-projection',
            ),
          })),
      },
      {
        name: 'predecessor review-result commitment',
        mutate: (record) =>
          mutatePredecessorProjection(record, (projection) => ({
            ...projection,
            predecessorReviewResultSha256: digest('changed-predecessor-review'),
          })),
      },
      {
        name: 'correction disposition',
        mutate: (record) =>
          mutatePredecessorProjection(record, (projection) => ({
            ...projection,
            correctionDisposition: 'catalogue_state_identity_scope_hide',
          })),
      },
      {
        name: 'correction commitments',
        mutate: (record) =>
          mutatePredecessorProjection(record, (projection) => ({
            ...projection,
            correctionCommitments: [
              {
                category: 'english_title_correction',
                predecessorNormalizedItemSha256:
                  projection.predecessorNormalizedItemSha256,
                proposedNormalizedItemSha256:
                  projection.proposedNormalizedItemSha256,
              },
            ],
          })),
      },
      {
        name: 'predecessor-valid zero source revision',
        mutate: (record) =>
          mutatePredecessorProjection(record, (projection) => ({
            ...projection,
            sourceProjection: {
              ...projection.sourceProjection,
              revision: 0,
            },
          })),
      },
    ]
    for (const testCase of cases) {
      const changed = rehashRetainedRecordMutation(
        firstSnapshot,
        'Q5000',
        testCase.mutate,
      )
      expect(
        () =>
          parseIndependentReviewSuccessorAuthoritySnapshotForFixture(changed, {
            rootSnapshot,
            priorSuccessorSnapshots: [],
          }),
        testCase.name,
      ).toThrow()
    }
  }, 60_000)

  it('rejects each independently forged allowed retained-rebind hash', () => {
    const { rootSnapshot, firstSnapshot } = createParsedSuccessorRounds()
    const recordIndex = firstSnapshot.population.records.findIndex(
      (record) => record.qid === 'Q3',
    )
    const record = firstSnapshot.population.records[recordIndex]!
    const forgeries = [
      { ...record, proposalRecordSha256: digest('forged-top-proposal') },
      {
        ...record,
        projection: {
          ...record.projection,
          proposalRecordSha256: digest('forged-projection-proposal'),
        },
      },
      {
        ...record,
        projection: {
          ...record.projection,
          projectionSha256: digest('forged-projection'),
        },
      },
      { ...record, recordCommitment: digest('forged-record') },
    ]
    for (const forged of forgeries)
      expect(() =>
        parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
          {
            ...firstSnapshot,
            population: {
              ...firstSnapshot.population,
              records: firstSnapshot.population.records.map((value, index) =>
                index === recordIndex ? forged : value,
              ),
            },
          },
          { rootSnapshot, priorSuccessorSnapshots: [] },
        ),
      ).toThrow()
  }, 30_000)

  it('does not permit added or removed rows to use retained-record rebinding', () => {
    const { rootSnapshot, firstSnapshot } = createParsedSuccessorRounds()
    const retained = firstSnapshot.population.records.find(
      (record) => record.qid === 'Q3',
    )!
    const forgedAddition = rehashRetainedRecordMutation(
      firstSnapshot,
      'Q5001',
      (record) =>
        ({
          ...record,
          identityReviewSha256: retained.identityReviewSha256,
          identityAllocationSha256: retained.identityAllocationSha256,
          projection: {
            ...record.projection,
            identityReviewSha256: retained.identityReviewSha256,
            identityAllocationSha256: retained.identityAllocationSha256,
          },
        }) as IndependentReviewPopulationRecord,
    )
    expect(() =>
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
        forgedAddition,
        { rootSnapshot, priorSuccessorSnapshots: [] },
      ),
    ).toThrow(/addition/)

    const removed = rootSnapshot.population.records.find(
      (record) => record.qid === 'Q1',
    )!
    expect(() =>
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
        {
          ...firstSnapshot,
          population: {
            ...firstSnapshot.population,
            records: firstSnapshot.population.records.map((record) =>
              record.qid === 'Q5001'
                ? rebindRecord(removed, firstSnapshot.proposal)
                : record,
            ),
          },
        },
        { rootSnapshot, priorSuccessorSnapshots: [] },
      ),
    ).toThrow(/outside its frozen proposal/)
  }, 30_000)

  it('rejects gaps, reordering, lineage prefix drift, ledger/history delta drift, and UUID/QID replay', () => {
    const { rootSnapshot, firstSnapshot, secondSnapshot } =
      createParsedSuccessorRounds()
    const parseSecond = (
      value: unknown,
      prior: readonly unknown[] = [firstSnapshot],
    ) =>
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(value, {
        rootSnapshot,
        priorSuccessorSnapshots: prior,
      })
    expect(() => parseSecond(secondSnapshot, [])).toThrow(
      /immediate root-series successor/,
    )
    expect(() => parseSecond(secondSnapshot, [secondSnapshot])).toThrow()
    expect(() =>
      parseSecond({
        ...secondSnapshot,
        replacementProof: {
          ...secondSnapshot.replacementProof,
          replacementLineage: [
            secondSnapshot.replacementProof.replacementLineage[1],
          ],
        },
      }),
    ).toThrow()
    expect(() =>
      parseSecond({
        ...secondSnapshot,
        replacementProof: {
          ...secondSnapshot.replacementProof,
          allocationLedger:
            secondSnapshot.replacementProof.allocationLedger.slice(1),
        },
      }),
    ).toThrow()
    expect(() =>
      parseSecond({
        ...secondSnapshot,
        replacementProof: {
          ...secondSnapshot.replacementProof,
          allocationHistory:
            secondSnapshot.replacementProof.allocationHistory.slice(1),
        },
      }),
    ).toThrow()
    expect(() =>
      parseSecond({
        ...secondSnapshot,
        population: {
          ...secondSnapshot.population,
          records: secondSnapshot.population.records.map((record) =>
            record.qid === 'Q5002'
              ? { ...record, canonicalUuid: uuid(1) }
              : record,
          ),
        },
      }),
    ).toThrow()
  }, 30_000)

  it('rejects predecessor removals and allocations, retired UUID reappearance, and swapped identity evidence', () => {
    const { rootSnapshot, firstSnapshot } = createParsedSuccessorRounds()
    const predecessor = {
      ...rootSnapshot.population.records[0]!,
      acquisitionCohort: 'predecessor-v1' as const,
      projection: {
        ...rootSnapshot.population.records[0]!.projection,
        kind: 'predecessor' as const,
      },
    }
    expect(predecessor.qid).toBe('Q1')
    expect(() =>
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
        {
          ...firstSnapshot,
          replacementProof: {
            ...firstSnapshot.replacementProof,
            additions: firstSnapshot.replacementProof.additions.map(
              (addition) => ({
                ...addition,
                primaryIdentityReviewResult: {
                  ...addition.primaryIdentityReviewResult,
                  qid: 'Q1',
                },
              }),
            ),
          },
        },
        { rootSnapshot, priorSuccessorSnapshots: [] },
      ),
    ).toThrow()
    expect(() =>
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
        {
          ...firstSnapshot,
          population: {
            ...firstSnapshot.population,
            records: [
              predecessor,
              ...firstSnapshot.population.records.slice(1),
            ],
          },
        },
        { rootSnapshot, priorSuccessorSnapshots: [] },
      ),
    ).toThrow()
  })

  it('rejects rehashed round-one root-prefix and round-two prior-prefix mutations', () => {
    const { rootSnapshot, firstSnapshot, secondSnapshot } =
      createParsedSuccessorRounds()
    const swapPrefix = (values: readonly unknown[]) => {
      const reordered = [...values]
      ;[reordered[0], reordered[1]] = [reordered[1], reordered[0]]
      return reordered
    }
    const firstLedger = swapPrefix(
      firstSnapshot.replacementProof.allocationLedger,
    ) as typeof firstSnapshot.replacementProof.allocationLedger
    const firstHistory = swapPrefix(
      firstSnapshot.replacementProof.allocationHistory,
    ) as typeof firstSnapshot.replacementProof.allocationHistory
    const changedFirst = rehashSnapshotProof(firstSnapshot, {
      ...firstSnapshot.replacementProof,
      allocationLedger: firstLedger,
      allocationLedgerSha256: identityAllocationLedgerSha256(firstLedger),
      allocationHistory: firstHistory,
      allocationHistorySha256:
        independentReviewWorkingAllocationHistorySha256(firstHistory),
    })
    expect(() =>
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(changedFirst, {
        rootSnapshot,
        priorSuccessorSnapshots: [],
      }),
    ).toThrow(/preserve complete prior ledger\/history bytes/)

    const secondLedger = swapPrefix(
      secondSnapshot.replacementProof.allocationLedger,
    ) as typeof secondSnapshot.replacementProof.allocationLedger
    const secondHistory = swapPrefix(
      secondSnapshot.replacementProof.allocationHistory,
    ) as typeof secondSnapshot.replacementProof.allocationHistory
    const changedSecond = rehashSnapshotProof(secondSnapshot, {
      ...secondSnapshot.replacementProof,
      allocationLedger: secondLedger,
      allocationLedgerSha256: identityAllocationLedgerSha256(secondLedger),
      allocationHistory: secondHistory,
      allocationHistorySha256:
        independentReviewWorkingAllocationHistorySha256(secondHistory),
    })
    expect(() =>
      parseIndependentReviewSuccessorAuthoritySnapshotForFixture(
        changedSecond,
        {
          rootSnapshot,
          priorSuccessorSnapshots: [firstSnapshot],
        },
      ),
    ).toThrow(/preserve complete prior ledger\/history bytes/)
  }, 30_000)
})

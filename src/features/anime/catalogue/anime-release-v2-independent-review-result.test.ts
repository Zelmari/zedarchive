import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { prepareIndependentReviewSample } from '@/features/anime/catalogue/anime-release-v2-independent-review'
import {
  independentReviewDefectCategories,
  independentReviewSeriesSchema,
  evaluateIndependentReviewSamplingStopsForFixture,
  parseIndependentReviewSeriesForFixture,
  prepareIndependentReviewFreshSampleForFixture,
} from '@/features/anime/catalogue/anime-release-v2-independent-review-result'
import {
  createIndependentReviewExactEmptyRootFixture,
  createIndependentReviewExactEmptySuccessorFixture,
  createIndependentReviewRootFixtureVariant,
  createParsedSuccessorRoundsForRemovals,
  initialRootSnapshot,
  rehashSnapshotProof,
  root,
} from '@/features/anime/catalogue/test-support/anime-release-v2-independent-review-fixture'
import {
  canonicalJson,
  compareDiscoveryQids,
  discoverySha256,
} from '@/features/anime/catalogue/wikidata-anime-discovery'

const hash = <T extends object>(core: T, key: string) => ({
  ...core,
  [key]: discoverySha256(core),
})
const compareAscii = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0

function planInputResult(
  planCore: Record<string, unknown>,
  records: readonly (typeof root.population.records)[number][],
  defects?: string | readonly Readonly<{ qid: string; category: string }>[],
) {
  const defectByQid = new Map(
    typeof defects === 'string'
      ? [[defects, 'work-identity']]
      : (defects ?? []).map(({ qid, category }) => [qid, category]),
  )
  const plan = hash(planCore, 'planSha256')
  const inputCore = {
    schema: 'zedarchive.anime-v2-independent-review-input',
    version: 1,
    populationSha256: planCore.populationSha256,
    proposalSha256: planCore.proposalSha256,
    planSha256: plan.planSha256,
    records: records.map((record) => ({
      recordCommitment: record.recordCommitment,
      canonicalUuid: record.canonicalUuid,
      projection: record.projection,
    })),
  }
  const input = hash(inputCore, 'inputSha256')
  const resultCore = {
    schema: 'zedarchive.anime-v2-independent-review-result',
    version: 1,
    populationSha256: planCore.populationSha256,
    proposalSha256: planCore.proposalSha256,
    planSha256: plan.planSha256,
    inputSha256: input.inputSha256,
    records: records.map((record) => ({
      recordCommitment: record.recordCommitment,
      canonicalUuid: record.canonicalUuid,
      outcome: defectByQid.has(record.qid) ? 'material-defect' : 'approved',
      category: defectByQid.get(record.qid) ?? null,
    })),
  }
  return { plan, input, result: hash(resultCore, 'resultSha256') }
}

function rootBundle() {
  const sample = prepareIndependentReviewSample({
    population: root.population,
    proposal: root.proposal,
    seedAuthority: root.seedAuthority,
    round: 'initial',
  })
  const removed = sample.sampled.find(
    (record) => record.projection.kind === 'new-candidate',
  )!
  const base = {
    schema: 'zedarchive.anime-v2-independent-review-plan',
    version: 1,
    round: 0,
    populationSha256: root.population.populationSha256,
    proposalSha256: root.proposal.proposalSha256,
    seedAuthoritySha256: root.seedAuthority.seedAuthoritySha256,
  }
  const mandatory = planInputResult(
    { ...base, kind: 'mandatory-review', recordCommitments: [] },
    [],
  )
  const original = planInputResult(
    {
      ...base,
      kind: 'original-sample',
      recordCommitments: sample.selectedRecordCommitments,
      roundSeed: sample.roundSeed,
      sampleSha256: sample.sampleSha256,
      lowRiskRecordCommitmentsSha256: discoverySha256(
        sample.lowRiskPopulation
          .map((record) => record.recordCommitment)
          .sort(),
      ),
      allocationSha256: discoverySha256(sample.allocations),
      sampleSize: sample.sampleSize,
      sampledCanonicalUuids: sample.sampledCanonicalUuids,
      sampledCanonicalUuidsSha256: sample.sampledCanonicalUuidsSha256,
    },
    sample.sampled
      .slice()
      .sort((a, b) => compareAscii(a.recordCommitment, b.recordCommitment)),
    removed.qid,
  )
  const cohort = root.population.records
    .filter(
      (record) =>
        record.acquisitionCohort === removed.acquisitionCohort ||
        canonicalJson(record.selectionCohort) ===
          canonicalJson(removed.selectionCohort),
    )
    .slice()
    .sort((a, b) => compareAscii(a.recordCommitment, b.recordCommitment))
  const expansion = planInputResult(
    {
      ...base,
      kind: 'expanded-cohort',
      recordCommitments: cohort.map((record) => record.recordCommitment),
      parentPlanSha256: original.plan.planSha256,
      parentInputSha256: original.input.inputSha256,
      parentResultSha256: original.result.resultSha256,
      triggerRecordCommitment: removed.recordCommitment,
      triggerCategory: 'work-identity',
      acquisitionCohort: removed.acquisitionCohort,
      selectionCohort: removed.selectionCohort,
    },
    cohort,
    removed.qid,
  )
  const lineage = hash(
    {
      schema:
        'zedarchive.anime-v2-independent-review-proposal-population-lineage',
      version: 1,
      kind: 'unchanged',
      previousProposalSha256: root.proposal.proposalSha256,
      nextProposalSha256: root.proposal.proposalSha256,
      previousPopulationSha256: root.population.populationSha256,
      nextPopulationSha256: root.population.populationSha256,
    },
    'lineageSha256',
  )
  const core = {
    schema: 'zedarchive.anime-v2-independent-review-round-bundle',
    version: 1,
    reviewSeriesSha256: initialRootSnapshot.reviewSeriesSha256,
    round: 0,
    populationSha256: root.population.populationSha256,
    proposalSha256: root.proposal.proposalSha256,
    seedAuthoritySha256: root.seedAuthority.seedAuthoritySha256,
    priorRoundBundleSha256: null,
    proposalPopulationLineage: lineage,
    members: [mandatory, original, expansion],
  }
  return { bundle: hash(core, 'roundBundleSha256'), removed, original }
}

let memoizedRootSeries: ReturnType<typeof createRootSeriesFixture> | undefined

function createRootSeriesFixture() {
  const { bundle, removed, original } = rootBundle()
  const core = {
    schema: independentReviewSeriesSchema,
    version: 1,
    initialSnapshot: initialRootSnapshot,
    successorSnapshots: [],
    bundles: [bundle],
    reviewSeriesSha256: initialRootSnapshot.reviewSeriesSha256,
  }
  return { series: hash(core, 'seriesSha256'), bundle, removed, original }
}

function rootSeriesFixture() {
  memoizedRootSeries ??= createRootSeriesFixture()
  return memoizedRootSeries
}

function stopSeriesFixture(
  input: Readonly<{
    fixtureRoot: typeof root
    snapshot: typeof initialRootSnapshot
    mandatoryDefectQids?: readonly string[]
    sampleDefects?: readonly Readonly<{ qid: string; category: string }>[]
  }>,
) {
  const sample = prepareIndependentReviewSample({
    population: input.fixtureRoot.population,
    proposal: input.fixtureRoot.proposal,
    seedAuthority: input.fixtureRoot.seedAuthority,
    round: 'initial',
  })
  const mandatoryRecords = input.fixtureRoot.population.records
    .filter((record) => record.mandatoryRiskReasons.length > 0)
    .sort((a, b) => compareAscii(a.recordCommitment, b.recordCommitment))
  const sampleRecords = sample.sampled
    .slice()
    .sort((a, b) => compareAscii(a.recordCommitment, b.recordCommitment))
  const base = {
    schema: 'zedarchive.anime-v2-independent-review-plan',
    version: 1,
    round: 0,
    populationSha256: input.fixtureRoot.population.populationSha256,
    proposalSha256: input.fixtureRoot.proposal.proposalSha256,
    seedAuthoritySha256: input.fixtureRoot.seedAuthority.seedAuthoritySha256,
  }
  const mandatory = planInputResult(
    {
      ...base,
      kind: 'mandatory-review',
      recordCommitments: mandatoryRecords.map(
        ({ recordCommitment }) => recordCommitment,
      ),
    },
    mandatoryRecords,
    (input.mandatoryDefectQids ?? []).map((qid) => ({
      qid,
      category: 'work-identity',
    })),
  )
  const original = planInputResult(
    {
      ...base,
      kind: 'original-sample',
      recordCommitments: sample.selectedRecordCommitments,
      roundSeed: sample.roundSeed,
      sampleSha256: sample.sampleSha256,
      lowRiskRecordCommitmentsSha256: discoverySha256(
        sample.lowRiskPopulation
          .map(({ recordCommitment }) => recordCommitment)
          .sort(compareAscii),
      ),
      allocationSha256: discoverySha256(sample.allocations),
      sampleSize: sample.sampleSize,
      sampledCanonicalUuids: sample.sampledCanonicalUuids,
      sampledCanonicalUuidsSha256: sample.sampledCanonicalUuidsSha256,
    },
    sampleRecords,
    input.sampleDefects,
  )
  const expansions = (input.sampleDefects ?? [])
    .map((defect) => {
      const trigger = input.fixtureRoot.population.records.find(
        ({ qid }) => qid === defect.qid,
      )!
      const cohort = input.fixtureRoot.population.records
        .filter(
          (record) =>
            record.acquisitionCohort === trigger.acquisitionCohort ||
            canonicalJson(record.selectionCohort) ===
              canonicalJson(trigger.selectionCohort),
        )
        .sort((a, b) => compareAscii(a.recordCommitment, b.recordCommitment))
      return planInputResult(
        {
          ...base,
          kind: 'expanded-cohort',
          recordCommitments: cohort.map(
            ({ recordCommitment }) => recordCommitment,
          ),
          parentPlanSha256: original.plan.planSha256,
          parentInputSha256: original.input.inputSha256,
          parentResultSha256: original.result.resultSha256,
          triggerRecordCommitment: trigger.recordCommitment,
          triggerCategory: defect.category,
          acquisitionCohort: trigger.acquisitionCohort,
          selectionCohort: trigger.selectionCohort,
        },
        cohort,
        (input.sampleDefects ?? []).filter((candidate) =>
          cohort.some(({ qid }) => qid === candidate.qid),
        ),
      )
    })
    .sort((left, right) =>
      compareAscii(
        String(left.plan.triggerRecordCommitment),
        String(right.plan.triggerRecordCommitment),
      ),
    )
  const lineage = hash(
    {
      schema:
        'zedarchive.anime-v2-independent-review-proposal-population-lineage',
      version: 1,
      kind: 'unchanged',
      previousProposalSha256: input.fixtureRoot.proposal.proposalSha256,
      nextProposalSha256: input.fixtureRoot.proposal.proposalSha256,
      previousPopulationSha256: input.fixtureRoot.population.populationSha256,
      nextPopulationSha256: input.fixtureRoot.population.populationSha256,
    },
    'lineageSha256',
  )
  const bundleCore = {
    schema: 'zedarchive.anime-v2-independent-review-round-bundle',
    version: 1,
    reviewSeriesSha256: input.snapshot.reviewSeriesSha256,
    round: 0,
    populationSha256: input.fixtureRoot.population.populationSha256,
    proposalSha256: input.fixtureRoot.proposal.proposalSha256,
    seedAuthoritySha256: input.fixtureRoot.seedAuthority.seedAuthoritySha256,
    priorRoundBundleSha256: null,
    proposalPopulationLineage: lineage,
    members: [mandatory, original, ...expansions],
  }
  const bundle = hash(bundleCore, 'roundBundleSha256')
  const seriesCore = {
    schema: independentReviewSeriesSchema,
    version: 1,
    initialSnapshot: input.snapshot,
    successorSnapshots: [],
    bundles: [bundle],
    reviewSeriesSha256: input.snapshot.reviewSeriesSha256,
  }
  return hash(seriesCore, 'seriesSha256')
}

function successorBundleFixture(
  input: Readonly<{
    snapshot: ReturnType<
      typeof createParsedSuccessorRoundsForRemovals
    >['firstSnapshot']
    fresh: ReturnType<typeof prepareIndependentReviewFreshSampleForFixture>
    priorBundleSha256: string
    defectQid: string
  }>,
) {
  const recordsByCommitment = new Map(
    input.snapshot.population.records.map((record) => [
      record.recordCommitment,
      record,
    ]),
  )
  const sampleRecords = input.fresh.selectedRecordCommitments.map(
    (commitment) => recordsByCommitment.get(commitment)!,
  )
  const freshMember = planInputResult(
    {
      schema: 'zedarchive.anime-v2-independent-review-plan',
      version: 1,
      kind: 'fresh-sample',
      round: input.snapshot.round,
      populationSha256: input.snapshot.population.populationSha256,
      proposalSha256: input.snapshot.proposal.proposalSha256,
      seedAuthoritySha256: input.snapshot.rootSeedAuthoritySha256,
      recordCommitments: input.fresh.selectedRecordCommitments,
      roundSeed: input.fresh.roundSeed,
      lowRiskRecordCommitmentsSha256:
        input.fresh.lowRiskRecordCommitmentsSha256,
      allocationSha256: input.fresh.allocationSha256,
      sampleSize: input.fresh.sampleSize,
      sampledCanonicalUuids: input.fresh.sampledCanonicalUuids,
      sampledCanonicalUuidsSha256: input.fresh.sampledCanonicalUuidsSha256,
    },
    sampleRecords,
    input.defectQid,
  )
  const trigger = input.snapshot.population.records.find(
    ({ qid }) => qid === input.defectQid,
  )!
  const cohort = input.snapshot.population.records
    .filter(
      (record) =>
        record.acquisitionCohort === trigger.acquisitionCohort ||
        canonicalJson(record.selectionCohort) ===
          canonicalJson(trigger.selectionCohort),
    )
    .sort((a, b) => compareAscii(a.recordCommitment, b.recordCommitment))
  const expansion = planInputResult(
    {
      schema: 'zedarchive.anime-v2-independent-review-plan',
      version: 1,
      kind: 'expanded-cohort',
      round: input.snapshot.round,
      populationSha256: input.snapshot.population.populationSha256,
      proposalSha256: input.snapshot.proposal.proposalSha256,
      seedAuthoritySha256: input.snapshot.rootSeedAuthoritySha256,
      recordCommitments: cohort.map(({ recordCommitment }) => recordCommitment),
      parentPlanSha256: freshMember.plan.planSha256,
      parentInputSha256: freshMember.input.inputSha256,
      parentResultSha256: freshMember.result.resultSha256,
      triggerRecordCommitment: trigger.recordCommitment,
      triggerCategory: 'work-identity',
      acquisitionCohort: trigger.acquisitionCohort,
      selectionCohort: trigger.selectionCohort,
    },
    cohort,
    input.defectQid,
  )
  const proof = input.snapshot.replacementProof
  const lineage = hash(
    {
      schema:
        'zedarchive.anime-v2-independent-review-proposal-population-lineage',
      version: 1,
      kind: 'replacement',
      previousProposalSha256: proof.priorProposalSha256,
      nextProposalSha256: proof.nextProposalSha256,
      previousPopulationSha256: proof.priorPopulationSha256,
      nextPopulationSha256: proof.nextPopulationSha256,
      replacementLineageSha256: proof.replacementLineageSha256,
      identityReplacementReviewResultSha256:
        proof.identityReplacementReviewResult.resultSha256,
    },
    'lineageSha256',
  )
  const bundle = hash(
    {
      schema: 'zedarchive.anime-v2-independent-review-round-bundle',
      version: 1,
      reviewSeriesSha256: input.snapshot.reviewSeriesSha256,
      round: input.snapshot.round,
      populationSha256: input.snapshot.population.populationSha256,
      proposalSha256: input.snapshot.proposal.proposalSha256,
      seedAuthoritySha256: input.snapshot.rootSeedAuthoritySha256,
      priorRoundBundleSha256: input.priorBundleSha256,
      proposalPopulationLineage: lineage,
      members: [freshMember, expansion],
    },
    'roundBundleSha256',
  )
  return { bundle, freshMember, trigger }
}

function emptySuccessorBundleFixture(
  input: Readonly<{
    snapshot: ReturnType<
      typeof createParsedSuccessorRoundsForRemovals
    >['firstSnapshot']
    fresh: ReturnType<typeof prepareIndependentReviewFreshSampleForFixture>
    priorBundleSha256: string
  }>,
) {
  const recordsByCommitment = new Map(
    input.snapshot.population.records.map((record) => [
      record.recordCommitment,
      record,
    ]),
  )
  const records = input.fresh.selectedRecordCommitments.map((commitment) =>
    recordsByCommitment.get(commitment)!,
  )
  const freshMember = planInputResult(
    {
      schema: 'zedarchive.anime-v2-independent-review-plan',
      version: 1,
      kind: 'fresh-sample',
      round: input.snapshot.round,
      populationSha256: input.snapshot.population.populationSha256,
      proposalSha256: input.snapshot.proposal.proposalSha256,
      seedAuthoritySha256: input.snapshot.rootSeedAuthoritySha256,
      recordCommitments: input.fresh.selectedRecordCommitments,
      roundSeed: input.fresh.roundSeed,
      lowRiskRecordCommitmentsSha256:
        input.fresh.lowRiskRecordCommitmentsSha256,
      allocationSha256: input.fresh.allocationSha256,
      sampleSize: input.fresh.sampleSize,
      sampledCanonicalUuids: input.fresh.sampledCanonicalUuids,
      sampledCanonicalUuidsSha256: input.fresh.sampledCanonicalUuidsSha256,
    },
    records,
  )
  const proof = input.snapshot.replacementProof
  const lineage = hash(
    {
      schema:
        'zedarchive.anime-v2-independent-review-proposal-population-lineage',
      version: 1,
      kind: 'replacement',
      previousProposalSha256: proof.priorProposalSha256,
      nextProposalSha256: proof.nextProposalSha256,
      previousPopulationSha256: proof.priorPopulationSha256,
      nextPopulationSha256: proof.nextPopulationSha256,
      replacementLineageSha256: proof.replacementLineageSha256,
      identityReplacementReviewResultSha256:
        proof.identityReplacementReviewResult.resultSha256,
    },
    'lineageSha256',
  )
  const bundle = hash(
    {
      schema: 'zedarchive.anime-v2-independent-review-round-bundle',
      version: 1,
      reviewSeriesSha256: input.snapshot.reviewSeriesSha256,
      round: input.snapshot.round,
      populationSha256: input.snapshot.population.populationSha256,
      proposalSha256: input.snapshot.proposal.proposalSha256,
      seedAuthoritySha256: input.snapshot.rootSeedAuthoritySha256,
      priorRoundBundleSha256: input.priorBundleSha256,
      proposalPopulationLineage: lineage,
      members: [freshMember],
    },
    'roundBundleSha256',
  )
  return { bundle, freshMember }
}

function rehashResult(
  result: Record<string, unknown>,
  records: readonly unknown[],
) {
  const { resultSha256: _resultSha256, ...core } = result
  void _resultSha256
  return hash({ ...core, records }, 'resultSha256')
}

function rehashBundle(
  bundle: Record<string, unknown>,
  members: readonly unknown[],
) {
  const { roundBundleSha256: _roundBundleSha256, ...core } = bundle
  void _roundBundleSha256
  return hash({ ...core, members }, 'roundBundleSha256')
}

function rehashSeries(
  series: Record<string, unknown>,
  bundles: readonly unknown[],
) {
  const { seriesSha256: _seriesSha256, ...core } = series
  void _seriesSha256
  return hash({ ...core, bundles }, 'seriesSha256')
}

describe(
  'anime release v2 independent-review result authority',
  { timeout: 240_000 },
  () => {
    it('parses a genuine 5,000-record root series and excludes every reviewed UUID', () => {
      const fixture = rootSeriesFixture()
      const parsed = parseIndependentReviewSeriesForFixture(fixture.series)
      expect(parsed.initialSnapshot.population.records).toHaveLength(5_000)
      expect(parsed.reviewedCanonicalUuids).toHaveLength(
        new Set(
          fixture.bundle.members.flatMap((member) =>
            member.result.records.map((record) => record.canonicalUuid),
          ),
        ).size,
      )
      expect(fixture.original.result.records[0]).not.toHaveProperty(
        'projection',
      )
      expect(
        evaluateIndependentReviewSamplingStopsForFixture(fixture.series),
      ).toEqual({
        mandatoryReconciliationRequired: false,
        samplingMaterialDefectCount: 1,
        sameCategoryDistinctRecordStop: false,
        threeMaterialFindingsStop: false,
        expandedCohortRateStop: false,
        stop: false,
      })
    })

    it('rejects strict series hash, ordering, gap, and unknown-field mutations', () => {
      const { series, bundle } = rootSeriesFixture()
      for (const mutation of [
        { ...series, seriesSha256: '0'.repeat(64) },
        { ...series, bundles: [] },
        { ...series, extra: true },
        { ...series, bundles: [{ ...bundle, round: 1 }] },
      ])
        expect(() => parseIndependentReviewSeriesForFixture(mutation)).toThrow()
    })

    it('binds a real sampled defect to the successor proof before fresh sampling', () => {
      const { series, removed, original } = rootSeriesFixture()
      const secondRemoved = root.population.records.find(
        (record) =>
          record.projection.kind === 'new-candidate' &&
          record.qid !== removed.qid,
      )!
      const rounds = createParsedSuccessorRoundsForRemovals({
        firstRemovedQid: removed.qid,
        secondRemovedQid: secondRemoved.qid,
      })
      const triggeringDefects = [
        {
          planSha256: original.plan.planSha256,
          inputSha256: original.input.inputSha256,
          resultSha256: original.result.resultSha256,
          recordCommitment: removed.recordCommitment,
          qid: removed.qid,
          category: 'work-identity' as const,
        },
      ]
      const successor = rehashSnapshotProof(rounds.firstSnapshot, {
        ...rounds.firstSnapshot.replacementProof,
        triggeringDefects,
      })
      const fresh = prepareIndependentReviewFreshSampleForFixture({
        priorSeries: series,
        successorSnapshot: successor,
      })
      expect(fresh.round).toBe(1)
      expect(fresh.sampleSize).toBeGreaterThan(0)
      expect(fresh.selectedRecordCommitments).toHaveLength(fresh.sampleSize)
      expect(fresh.sampledCanonicalUuids).toHaveLength(fresh.sampleSize)
      expect(fresh.sampledCanonicalUuidsSha256).toBe(
        discoverySha256(fresh.sampledCanonicalUuids),
      )
      expect(() =>
        prepareIndependentReviewFreshSampleForFixture({
          priorSeries: series,
          successorSnapshot: rehashSnapshotProof(successor, {
            ...successor.replacementProof,
            triggeringDefects: [
              {
                ...successor.replacementProof.triggeringDefects[0]!,
                qid: secondRemoved.qid,
              },
            ],
          }),
        }),
      ).toThrow()
      expect(() =>
        prepareIndependentReviewFreshSampleForFixture({
          priorSeries: series,
          successorSnapshot: successor,
          extra: true,
        }),
      ).toThrow(/unknown/i)
    })

    it('parses a completed two-round series against each own snapshot and rejects detached ordering', () => {
      const rootFixture = rootSeriesFixture()
      const arbitrarySecond = root.population.records.find(
        (record) =>
          record.projection.kind === 'new-candidate' &&
          record.qid !== rootFixture.removed.qid,
      )!
      let rounds = createParsedSuccessorRoundsForRemovals({
        firstRemovedQid: rootFixture.removed.qid,
        secondRemovedQid: arbitrarySecond.qid,
      })
      const trigger = [
        {
          planSha256: rootFixture.original.plan.planSha256,
          inputSha256: rootFixture.original.input.inputSha256,
          resultSha256: rootFixture.original.result.resultSha256,
          recordCommitment: rootFixture.removed.recordCommitment,
          qid: rootFixture.removed.qid,
          category: 'work-identity' as const,
        },
      ]
      let firstSnapshot = rehashSnapshotProof(rounds.firstSnapshot, {
        ...rounds.firstSnapshot.replacementProof,
        triggeringDefects: trigger,
      })
      let fresh = prepareIndependentReviewFreshSampleForFixture({
        priorSeries: rootFixture.series,
        successorSnapshot: firstSnapshot,
      })
      const roundOneDefect = firstSnapshot.population.records.find(
        (record) =>
          fresh.sampledCanonicalUuids.includes(record.canonicalUuid) &&
          record.projection.kind === 'new-candidate',
      )!
      rounds = createParsedSuccessorRoundsForRemovals({
        firstRemovedQid: rootFixture.removed.qid,
        secondRemovedQid: roundOneDefect.qid,
      })
      firstSnapshot = rehashSnapshotProof(rounds.firstSnapshot, {
        ...rounds.firstSnapshot.replacementProof,
        triggeringDefects: trigger,
      })
      fresh = prepareIndependentReviewFreshSampleForFixture({
        priorSeries: rootFixture.series,
        successorSnapshot: firstSnapshot,
      })
      const roundOne = successorBundleFixture({
        snapshot: firstSnapshot,
        fresh,
        priorBundleSha256: rootFixture.bundle.roundBundleSha256,
        defectQid: roundOneDefect.qid,
      })
      const core = {
        schema: independentReviewSeriesSchema,
        version: 1,
        initialSnapshot: initialRootSnapshot,
        successorSnapshots: [firstSnapshot],
        bundles: [rootFixture.bundle, roundOne.bundle],
        reviewSeriesSha256: initialRootSnapshot.reviewSeriesSha256,
      }
      const series = hash(core, 'seriesSha256')
      expect(
        parseIndependentReviewSeriesForFixture(series).bundles,
      ).toHaveLength(2)
      for (const mutation of [
        rehashSeries(series, [roundOne.bundle, rootFixture.bundle]),
        rehashSeries(series, [rootFixture.bundle]),
        rehashSeries(series, [
          rootFixture.bundle,
          { ...roundOne.bundle, priorRoundBundleSha256: '0'.repeat(64) },
        ]),
        hash({ ...core, successorSnapshots: [] }, 'seriesSha256'),
      ])
        expect(() => parseIndependentReviewSeriesForFixture(mutation)).toThrow()
    })

    it('rejects a complete table of proof, identity, lineage, and removal-set mutations', () => {
      const { series, removed, original } = rootSeriesFixture()
      const secondRemoved = root.population.records.find(
        (record) =>
          record.projection.kind === 'new-candidate' &&
          record.qid !== removed.qid,
      )!
      const rounds = createParsedSuccessorRoundsForRemovals({
        firstRemovedQid: removed.qid,
        secondRemovedQid: secondRemoved.qid,
      })

      {
        const variant = createIndependentReviewRootFixtureVariant({
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
                discoveryReasons: [
                  'multilingual-coverage',
                  'franchise-continuity',
                ],
                format: 'tv',
                eraBucket: '2020-2026',
              },
            },
          ],
        })
        const sample = prepareIndependentReviewSample({
          population: variant.root.population,
          proposal: variant.root.proposal,
          seedAuthority: variant.root.seedAuthority,
          round: 'initial',
        })
        const inSample = (minimum: number, maximum: number) =>
          sample.sampled.find((record) => {
            const number = Number(record.qid.slice(1))
            return number >= minimum && number <= maximum
          })!.qid

        expect(
          evaluateIndependentReviewSamplingStopsForFixture(
            stopSeriesFixture({
              fixtureRoot: variant.root,
              snapshot: variant.initialSnapshot,
              mandatoryDefectQids: ['Q200'],
            }),
          ),
        ).toMatchObject({
          mandatoryReconciliationRequired: true,
          samplingMaterialDefectCount: 0,
          stop: false,
        })

        const hundred = evaluateIndependentReviewSamplingStopsForFixture(
          stopSeriesFixture({
            fixtureRoot: variant.root,
            snapshot: variant.initialSnapshot,
            sampleDefects: [
              { qid: inSample(1, 100), category: 'work-identity' },
            ],
          }),
        )
        const ninetyNine = evaluateIndependentReviewSamplingStopsForFixture(
          stopSeriesFixture({
            fixtureRoot: variant.root,
            snapshot: variant.initialSnapshot,
            sampleDefects: [
              { qid: inSample(101, 199), category: 'work-identity' },
            ],
          }),
        )
        expect(hundred.expandedCohortRateStop).toBe(false)
        expect(hundred.samplingMaterialDefectCount).toBe(1)
        expect(ninetyNine.expandedCohortRateStop).toBe(true)

        const ordinarySample = prepareIndependentReviewSample({
          population: root.population,
          proposal: root.proposal,
          seedAuthority: root.seedAuthority,
          round: 'initial',
        }).sampled.filter(
          (record) => record.projection.kind === 'new-candidate',
        )
        const three = ordinarySample.slice(0, 3)
        expect(
          evaluateIndependentReviewSamplingStopsForFixture(
            stopSeriesFixture({
              fixtureRoot: root,
              snapshot: initialRootSnapshot,
              sampleDefects: [
                { qid: three[0]!.qid, category: 'work-identity' },
                { qid: three[1]!.qid, category: 'duplicate' },
                { qid: three[2]!.qid, category: 'invalid-provenance' },
              ],
            }),
          ).threeMaterialFindingsStop,
        ).toBe(true)
        expect(
          evaluateIndependentReviewSamplingStopsForFixture(
            stopSeriesFixture({
              fixtureRoot: root,
              snapshot: initialRootSnapshot,
              sampleDefects: [
                { qid: three[0]!.qid, category: 'duplicate' },
                { qid: three[1]!.qid, category: 'duplicate' },
              ],
            }),
          ).sameCategoryDistinctRecordStop,
        ).toBe(true)
      }
      const valid = rehashSnapshotProof(rounds.firstSnapshot, {
        ...rounds.firstSnapshot.replacementProof,
        triggeringDefects: [
          {
            planSha256: original.plan.planSha256,
            inputSha256: original.input.inputSha256,
            resultSha256: original.result.resultSha256,
            recordCommitment: removed.recordCommitment,
            qid: removed.qid,
            category: 'work-identity',
          },
        ],
      })
      const proof = valid.replacementProof
      const mutations = [
        { ...proof, triggeringDefects: [] },
        {
          ...proof,
          triggeringDefects: [
            ...proof.triggeringDefects,
            {
              ...proof.triggeringDefects[0]!,
              recordCommitment: '0'.repeat(64),
            },
          ],
        },
        { ...proof, replacementLineageSha256: '0'.repeat(64) },
        {
          ...proof,
          identityReplacementReviewResult: {
            ...proof.identityReplacementReviewResult,
            resultSha256: '0'.repeat(64),
          },
        },
        {
          ...proof,
          allocationHistory: proof.allocationHistory.slice(1),
        },
      ]
      for (const mutation of mutations)
        expect(() =>
          prepareIndependentReviewFreshSampleForFixture({
            priorSeries: series,
            successorSnapshot: rehashSnapshotProof(valid, mutation),
          }),
        ).toThrow()
    })

    it('rejects changed-category and illegal duplicate replay while accepting an expansion-only defect in root custody', () => {
      const { series, bundle } = rootSeriesFixture()
      const members = bundle.members as readonly Record<string, unknown>[]
      const expansion = members[2]!
      const expansionResult = expansion.result as Record<string, unknown>
      const expansionRecords = expansionResult.records as readonly Record<
        string,
        unknown
      >[]
      const trigger = expansionRecords.find(
        (record) => record.outcome === 'material-defect',
      )!
      const approvedTriggerResult = rehashResult(
        expansionResult,
        [
          ...expansionRecords.filter((record) => record !== trigger),
          { ...trigger, outcome: 'approved', category: null },
        ].sort((left, right) =>
          compareAscii(
            String(left.recordCommitment),
            String(right.recordCommitment),
          ),
        ),
      )
      expect(() =>
        parseIndependentReviewSeriesForFixture(
          rehashSeries(series, [
            rehashBundle(bundle, [
              members[0],
              members[1],
              { ...expansion, result: approvedTriggerResult },
            ]),
          ]),
        ),
      ).toThrow(/trigger|overlapping/i)
      const changedCategoryResult = rehashResult(
        expansionResult,
        [
          ...expansionRecords.filter((record) => record !== trigger),
          { ...trigger, category: 'duplicate' },
        ].sort((left, right) =>
          String(left.recordCommitment).localeCompare(
            String(right.recordCommitment),
          ),
        ),
      )
      const changedCategoryBundle = rehashBundle(bundle, [
        members[0],
        members[1],
        { ...expansion, result: changedCategoryResult },
      ])
      expect(() =>
        parseIndependentReviewSeriesForFixture(
          rehashSeries(series, [changedCategoryBundle]),
        ),
      ).toThrow()

      const original = members[1]!
      const originalResult = original.result as Record<string, unknown>
      const duplicateReplay = rehashResult(originalResult, [
        ...(originalResult.records as readonly Record<string, unknown>[]),
        (originalResult.records as readonly Record<string, unknown>[])[0]!,
      ])
      const duplicateBundle = rehashBundle(bundle, [
        members[0],
        { ...original, result: duplicateReplay },
        members[2],
      ])
      expect(() =>
        parseIndependentReviewSeriesForFixture(
          rehashSeries(series, [duplicateBundle]),
        ),
      ).toThrow()

      const originalUuids = new Set(
        (
          (members[1]!.result as Record<string, unknown>)
            .records as readonly Record<string, unknown>[]
        ).map((record) => record.canonicalUuid),
      )
      const overlappingApproved = expansionRecords.find(
        (record) =>
          record.outcome === 'approved' &&
          originalUuids.has(record.canonicalUuid),
      )!
      const contradictoryOverlapResult = rehashResult(
        expansionResult,
        [
          ...expansionRecords.filter(
            (record) => record !== overlappingApproved,
          ),
          {
            ...overlappingApproved,
            outcome: 'material-defect',
            category: 'unsupported-factual-value',
          },
        ].sort((left, right) =>
          compareAscii(
            String(left.recordCommitment),
            String(right.recordCommitment),
          ),
        ),
      )
      expect(() =>
        parseIndependentReviewSeriesForFixture(
          rehashSeries(series, [
            rehashBundle(bundle, [
              members[0],
              members[1],
              { ...expansion, result: contradictoryOverlapResult },
            ]),
          ]),
        ),
      ).toThrow(/overlapping/i)

      const extra = expansionRecords.find(
        (record) =>
          record.outcome === 'approved' &&
          !originalUuids.has(record.canonicalUuid),
      )!
      const expansionOnlyResult = rehashResult(
        expansionResult,
        [
          ...expansionRecords.filter((record) => record !== extra),
          {
            ...extra,
            outcome: 'material-defect',
            category: 'unsupported-factual-value',
          },
        ].sort((left, right) =>
          String(left.recordCommitment).localeCompare(
            String(right.recordCommitment),
          ),
        ),
      )
      const expansionOnlyBundle = rehashBundle(bundle, [
        members[0],
        members[1],
        { ...expansion, result: expansionOnlyResult },
      ])
      expect(
        parseIndependentReviewSeriesForFixture(
          rehashSeries(series, [expansionOnlyBundle]),
        ).bundles,
      ).toHaveLength(1)
    })

    it('requires consistent outcomes across overlapping legal expansions', () => {
      const sampled = prepareIndependentReviewSample({
        population: root.population,
        proposal: root.proposal,
        seedAuthority: root.seedAuthority,
        round: 'initial',
      }).sampled.filter((record) => record.projection.kind === 'new-candidate')
      const byAcquisition = new Map<string, typeof sampled>()
      for (const record of sampled) {
        const records = byAcquisition.get(record.acquisitionCohort) ?? []
        byAcquisition.set(record.acquisitionCohort, [...records, record])
      }
      const triggers = [...byAcquisition.values()]
        .find((records) => records.length >= 2)!
        .slice(0, 2)
      const series = stopSeriesFixture({
        fixtureRoot: root,
        snapshot: initialRootSnapshot,
        sampleDefects: [
          { qid: triggers[0]!.qid, category: 'work-identity' },
          { qid: triggers[1]!.qid, category: 'duplicate' },
        ],
      })
      expect(
        parseIndependentReviewSeriesForFixture(series).bundles,
      ).toHaveLength(1)

      const bundle = series.bundles[0] as Record<string, unknown>
      const members = bundle.members as readonly Record<string, unknown>[]
      const originalUuids = new Set(
        (
          (members[1]!.result as Record<string, unknown>)
            .records as readonly Record<string, unknown>[]
        ).map((record) => record.canonicalUuid),
      )
      const firstExpansion = members[2]!
      const secondExpansion = members[3]!
      const firstRecords = (firstExpansion.result as Record<string, unknown>)
        .records as readonly Record<string, unknown>[]
      const secondResult = secondExpansion.result as Record<string, unknown>
      const secondRecords = secondResult.records as readonly Record<
        string,
        unknown
      >[]
      const firstUuids = new Set(
        firstRecords.map((record) => record.canonicalUuid),
      )
      const replayedDefect = secondRecords.find(
        (record) =>
          record.outcome === 'material-defect' &&
          firstRecords.some(
            (candidate) =>
              candidate.canonicalUuid === record.canonicalUuid &&
              candidate.category === record.category,
          ),
      )!
      const replayedApproval = secondRecords.find(
        (record) =>
          record.outcome === 'approved' &&
          !originalUuids.has(record.canonicalUuid) &&
          firstUuids.has(record.canonicalUuid),
      )!

      const contradictions: readonly Record<string, unknown>[] = [
        { ...replayedDefect, outcome: 'approved', category: null },
        {
          ...replayedApproval,
          outcome: 'material-defect',
          category: 'unsupported-factual-value',
        },
      ]
      for (const changed of contradictions) {
        const changedResult = rehashResult(
          secondResult,
          [
            ...secondRecords.filter(
              (record) => record.canonicalUuid !== changed.canonicalUuid,
            ),
            changed,
          ].sort((left, right) =>
            compareAscii(
              String(left.recordCommitment),
              String(right.recordCommitment),
            ),
          ),
        )
        expect(() =>
          parseIndependentReviewSeriesForFixture(
            rehashSeries(series, [
              rehashBundle(bundle, [
                members[0],
                members[1],
                firstExpansion,
                { ...secondExpansion, result: changedResult },
              ]),
            ]),
          ),
        ).toThrow(/overlapping/i)
      }
    })

    it('accepts only a rederived exact-empty fresh plan', () => {
      const exact = createIndependentReviewExactEmptyRootFixture()
      const rootSeries = stopSeriesFixture({
        fixtureRoot: exact.root,
        snapshot: exact.initialSnapshot,
        sampleDefects: [{ qid: 'Q2016', category: 'work-identity' }],
      })
      const rootBundle = rootSeries.bundles[0] as Record<string, unknown>
      const rootMembers = rootBundle.members as readonly Record<
        string,
        unknown
      >[]
      const rootOriginal = rootMembers[1]!
      const removed = exact.root.population.records.find(
        ({ qid }) => qid === 'Q2016',
      )!
      const rounds = createIndependentReviewExactEmptySuccessorFixture({
        firstRemovedQid: 'Q2016',
        secondRemovedQid: 'Q2501',
      })
      const successor = rehashSnapshotProof(rounds.firstSnapshot, {
        ...rounds.firstSnapshot.replacementProof,
        triggeringDefects: [
          {
            planSha256: String(
              (rootOriginal.plan as Record<string, unknown>).planSha256,
            ),
            inputSha256: String(
              (rootOriginal.input as Record<string, unknown>).inputSha256,
            ),
            resultSha256: String(
              (rootOriginal.result as Record<string, unknown>).resultSha256,
            ),
            recordCommitment: removed.recordCommitment,
            qid: removed.qid,
            category: 'work-identity',
          },
        ],
      })
      const fresh = prepareIndependentReviewFreshSampleForFixture({
        priorSeries: rootSeries,
        successorSnapshot: successor,
      })
      expect(fresh).toMatchObject({
        sampleSize: 0,
        allocations: [],
        sampledCanonicalUuids: [],
        selectedRecordCommitments: [],
      })
      expect(fresh.allocationSha256).toBe(discoverySha256([]))
      expect(fresh.sampledCanonicalUuidsSha256).toBe(discoverySha256([]))

      const empty = emptySuccessorBundleFixture({
        snapshot: successor,
        fresh,
        priorBundleSha256: String(rootBundle.roundBundleSha256),
      })
      expect(empty.freshMember.plan.recordCommitments).toEqual([])
      expect(empty.freshMember.input.records).toEqual([])
      expect(empty.freshMember.result.records).toEqual([])
      const exactSeries = hash(
        {
          schema: independentReviewSeriesSchema,
          version: 1,
          initialSnapshot: exact.initialSnapshot,
          successorSnapshots: [successor],
          bundles: [rootBundle, empty.bundle],
          reviewSeriesSha256: exact.initialSnapshot.reviewSeriesSha256,
        },
        'seriesSha256',
      )
      expect(
        parseIndependentReviewSeriesForFixture(exactSeries).bundles,
      ).toHaveLength(2)

      const ordinary = rootSeriesFixture()
      const ordinarySecond = root.population.records.find(
        (record) =>
          record.projection.kind === 'new-candidate' &&
          record.qid !== ordinary.removed.qid,
      )!
      const ordinaryRounds = createParsedSuccessorRoundsForRemovals({
        firstRemovedQid: ordinary.removed.qid,
        secondRemovedQid: ordinarySecond.qid,
      })
      const ordinarySuccessor = rehashSnapshotProof(
        ordinaryRounds.firstSnapshot,
        {
          ...ordinaryRounds.firstSnapshot.replacementProof,
          triggeringDefects: [
            {
              planSha256: ordinary.original.plan.planSha256,
              inputSha256: ordinary.original.input.inputSha256,
              resultSha256: ordinary.original.result.resultSha256,
              recordCommitment: ordinary.removed.recordCommitment,
              qid: ordinary.removed.qid,
              category: 'work-identity',
            },
          ],
        },
      )
      const eligible = prepareIndependentReviewFreshSampleForFixture({
        priorSeries: ordinary.series,
        successorSnapshot: ordinarySuccessor,
      })
      expect(eligible.sampleSize).toBeGreaterThan(0)
      const forgedEmpty = {
        ...eligible,
        sampleSize: 0,
        allocations: [],
        allocationSha256: discoverySha256([]),
        sampledCanonicalUuids: [],
        sampledCanonicalUuidsSha256: discoverySha256([]),
        selectedRecordCommitments: [],
      }
      const forgedBundle = emptySuccessorBundleFixture({
        snapshot: ordinarySuccessor,
        fresh: forgedEmpty,
        priorBundleSha256: ordinary.bundle.roundBundleSha256,
      })
      const forgedSeries = hash(
        {
          schema: independentReviewSeriesSchema,
          version: 1,
          initialSnapshot: initialRootSnapshot,
          successorSnapshots: [ordinarySuccessor],
          bundles: [ordinary.bundle, forgedBundle.bundle],
          reviewSeriesSha256: initialRootSnapshot.reviewSeriesSha256,
        },
        'seriesSha256',
      )
      expect(() =>
        parseIndependentReviewSeriesForFixture(forgedSeries),
      ).toThrow(/reproduce/i)
    })

    it('keeps the defect vocabulary closed and fixture entry points test-only', () => {
      expect(independentReviewDefectCategories).toHaveLength(9)
      expect(
        ['Q10000000000000000', 'Q9007199254740993', 'Q9007199254740992'].sort(
          compareDiscoveryQids,
        ),
      ).toEqual([
        'Q9007199254740992',
        'Q9007199254740993',
        'Q10000000000000000',
      ])
      const sourceRoot = new URL('../../../../', import.meta.url).pathname
      for (const entry of readdirSync(join(sourceRoot, 'src'), {
        recursive: true,
        withFileTypes: true,
      })) {
        if (!entry.isFile() || entry.name.endsWith('.test.ts')) continue
        const file = join(entry.parentPath, entry.name)
        if (file.endsWith('anime-release-v2-independent-review-result.ts'))
          continue
        const source = readFileSync(file, 'utf8')
        expect(source).not.toContain('parseIndependentReviewSeriesForFixture')
        expect(source).not.toContain(
          'prepareIndependentReviewFreshSampleForFixture',
        )
        expect(source).not.toContain(
          'evaluateIndependentReviewSamplingStopsForFixture',
        )
      }
    })
  },
)

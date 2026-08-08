import { createHash } from 'node:crypto'

/**
 * Internal deterministic engine shared only by authenticated review wrappers.
 * It is not an authority boundary: callers must first derive candidates and
 * the round seed from a fully parsed Decision-097/098 authority.
 */
export type IndependentReviewSamplingCoreCandidate = Readonly<{
  canonicalUuid: string
  recordCommitment: string
  selectionCohort: Readonly<{
    format: string
    eraBucket: string
  }>
}>

export type IndependentReviewSamplingCoreAllocation = Readonly<{
  key: string
  population: number
  minimumAllocation: number
  hamiltonAllocation: number
  allocation: number
}>

export type IndependentReviewSamplingCoreResult<
  Candidate extends IndependentReviewSamplingCoreCandidate,
> = Readonly<{
  sampleSize: number
  allocations: readonly IndependentReviewSamplingCoreAllocation[]
  sampled: readonly Candidate[]
}>

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function independentReviewSamplingCoreSize(
  lowRiskPopulation: number,
): number {
  if (!Number.isSafeInteger(lowRiskPopulation) || lowRiskPopulation < 0)
    throw new Error('Low-risk population must be a non-negative safe integer.')
  return Math.min(
    lowRiskPopulation,
    Math.max(400, Math.ceil(lowRiskPopulation * 0.1)),
  )
}

function stratumKey(candidate: IndependentReviewSamplingCoreCandidate): string {
  return `${candidate.selectionCohort.format}:${candidate.selectionCohort.eraBucket}`
}

function rank(
  seed: string,
  candidate: IndependentReviewSamplingCoreCandidate,
): string {
  return createHash('sha256')
    .update(`${seed}:${candidate.canonicalUuid}`)
    .digest('hex')
}

export function prepareIndependentReviewSamplingCore<
  Candidate extends IndependentReviewSamplingCoreCandidate,
>(
  input: Readonly<{
    candidates: readonly Candidate[]
    roundSeed: string
  }>,
): IndependentReviewSamplingCoreResult<Candidate> {
  const sampleSize = independentReviewSamplingCoreSize(input.candidates.length)
  const groups = new Map<string, Candidate[]>()
  input.candidates.forEach((candidate) =>
    groups.set(stratumKey(candidate), [
      ...(groups.get(stratumKey(candidate)) ?? []),
      candidate,
    ]),
  )
  const minimums = [...groups.entries()]
    .sort(([left], [right]) => compareAscii(left, right))
    .map(([key, members]) => ({
      key,
      members,
      minimum: Math.min(10, members.length),
    }))
  const allocatedMinimum = minimums.reduce(
    (sum, group) => sum + group.minimum,
    0,
  )
  if (allocatedMinimum > sampleSize)
    throw new Error(
      'Independent-review minimum stratum allocations exceed sample size.',
    )
  const remainingSlots = sampleSize - allocatedMinimum
  const remainingPopulation = minimums.reduce(
    (sum, group) => sum + group.members.length - group.minimum,
    0,
  )
  if (remainingSlots > remainingPopulation)
    throw new Error('Independent-review strata cannot satisfy sample size.')
  const preliminary = minimums.map((group) => {
    const capacity = group.members.length - group.minimum
    const numerator = remainingSlots * capacity
    return {
      ...group,
      capacity,
      hamilton:
        remainingPopulation === 0
          ? 0
          : Math.floor(numerator / remainingPopulation),
      remainder:
        remainingPopulation === 0 ? 0 : numerator % remainingPopulation,
    }
  })
  let unallocated =
    remainingSlots - preliminary.reduce((sum, group) => sum + group.hamilton, 0)
  for (const group of [...preliminary].sort(
    (left, right) =>
      right.remainder - left.remainder || compareAscii(left.key, right.key),
  )) {
    if (unallocated === 0) break
    if (group.hamilton < group.capacity) {
      group.hamilton += 1
      unallocated -= 1
    }
  }
  if (unallocated !== 0)
    throw new Error(
      'Independent-review Hamilton allocation cannot satisfy capacity.',
    )
  const allocations = preliminary.map((group) => ({
    key: group.key,
    population: group.members.length,
    minimumAllocation: group.minimum,
    hamiltonAllocation: group.hamilton,
    allocation: group.minimum + group.hamilton,
  }))
  const sampled = preliminary.flatMap((group) =>
    group.members
      .slice()
      .sort(
        (left, right) =>
          compareAscii(
            rank(input.roundSeed, left),
            rank(input.roundSeed, right),
          ) || compareAscii(left.canonicalUuid, right.canonicalUuid),
      )
      .slice(0, group.minimum + group.hamilton),
  )
  if (sampled.length !== sampleSize)
    throw new Error('Independent-review sample has the wrong size.')
  return { sampleSize, allocations, sampled }
}

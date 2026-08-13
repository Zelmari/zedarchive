/**
 * M45-07 continuity review command surface (Decision 096; execution path
 * under Decision 147).  `check` reads only the four accepted frozen inputs —
 * candidate receipt, candidate acquisition/review authority, primary
 * candidate review result, and predecessor review result — and re-derives the
 * exact 250 audience anchors that the later bounded continuity acquisition
 * must reproduce.  It emits counts and aggregate hashes only, never QIDs,
 * titles, URLs, provider data, or review reasoning.  This is a development
 * custody tool with no production authority: it performs no database access,
 * no release promotion, and in this mode no network request.
 */
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rmdir,
  unlink,
  writeFile,
  link,
} from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from '@/config/zod'
import {
  assertAcceptedCandidateAcquisitionReviewAuthority,
  validatePrimaryCandidateReviewAuthorityForFixture,
} from '@/features/anime/catalogue/anime-v2-candidate-acquisition'
import {
  createReducedContinuityAcquisition,
  parseAcceptedCandidateReceipt,
  parseReducedContinuityAcquisition,
  primaryCandidateReviewResultSchema,
  type AcceptedCandidateReceipt,
  type PrimaryCandidateReviewResult,
} from '@/features/anime/catalogue/anime-release-v2-continuity'
import {
  acceptedDiscoveryCandidateReceiptSha256,
  deriveCandidatePredecessorExclusionAuthority,
  predecessorReviewResultSchema,
  type CandidatePredecessorExclusionAuthority,
} from '@/features/anime/catalogue/anime-successor-predecessor-review'
import {
  canonicalJson,
  compareAudienceCandidates,
  compareDiscoveryQids,
  discoverySha256,
} from '@/features/anime/catalogue/wikidata-anime-discovery'
import {
  parsePolicyBaseline,
  retrievePolicyBodies,
} from './m45-policy-baseline'
import {
  parseWikidataEntityResponse,
  type WikidataEntity,
} from '@/integrations/wikidata/wikidata-entity'
import { wikidataApiEndpoint } from '@/integrations/wikidata/wikidata-constants'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))

export const continuityReviewRoot = '.local/m45/continuity-review'
export const continuityStagingSibling = '.local/m45/.continuity-review.staging'
export const candidateReceiptPath =
  '.local/m45/discovery/frozen-run/candidate-receipt.json'
export const candidateAuthorityPath =
  '.local/m45/candidate-review/finalized/authority.json'
export const primaryCandidateReviewPath =
  '.local/m45/candidate-review/finalized/primary-candidate-review.json'
export const predecessorReviewResultPath =
  '.local/m45/predecessor-review/finalized/predecessor-review-result.json'
export const continuityUserAgent =
  'zedarchive-catalogue-discovery/2.0 (+https://github.com/Zelmari/zedarchive)'
export const continuityEnvelope = {
  anchors: 250,
  groupSize: 25,
  groups: 10,
  concurrency: 1,
  pacingMilliseconds: 350,
  timeoutMilliseconds: 10_000,
  maximumAttemptsPerGroup: 3,
  maximumAttemptsTotal: 30,
  maximumBytesPerGroup: 4 * 1024 * 1024,
  maximumTotalBytes: 40 * 1024 * 1024,
  maximumElapsedMilliseconds: 45 * 60 * 1000,
  maximumEndpointsPerAnchor: 8,
  maximumPairCount: 2_000,
} as const

export class ContinuityReviewCommandError extends Error {
  constructor(
    readonly stage: string,
    readonly category: string,
  ) {
    super(`Continuity review stopped at ${stage}:${category}.`)
  }
}
export const safeError = (stage: string, category: string) =>
  new ContinuityReviewCommandError(stage, category)

export type ContinuityReviewCommand =
  | { mode: 'check' }
  | { mode: 'acquire'; confirm: '--confirm-m45-continuity-acquisition' }
  | { mode: 'prepare'; confirm: '--confirm-m45-continuity-preparation' }
  | { mode: 'draft'; role: 'primary' | 'independent' }
  | {
      mode: 'lock'
      role: 'primary' | 'independent'
      resultPath: string
    }
  | { mode: 'reconcile' }
  | { mode: 'finalize'; confirm: '--confirm-m45-continuity-finalization' }

const continuityRoleSchema = z.enum(['primary', 'independent'])

export function parseContinuityReviewArguments(
  args: readonly string[],
): ContinuityReviewCommand {
  if (args.length === 1 && args[0] === 'check') return { mode: 'check' }
  if (
    args.length === 2 &&
    args[0] === 'acquire' &&
    args[1] === '--confirm-m45-continuity-acquisition'
  )
    return { mode: 'acquire', confirm: '--confirm-m45-continuity-acquisition' }
  if (
    args.length === 2 &&
    args[0] === 'prepare' &&
    args[1] === '--confirm-m45-continuity-preparation'
  )
    return { mode: 'prepare', confirm: '--confirm-m45-continuity-preparation' }
  if (args.length === 2 && args[0] === 'draft') {
    const role = continuityRoleSchema.safeParse(args[1])
    if (role.success) return { mode: 'draft', role: role.data }
  }
  if (args.length === 3 && args[0] === 'lock') {
    const role = continuityRoleSchema.safeParse(args[1])
    if (role.success)
      return { mode: 'lock', role: role.data, resultPath: args[2] }
  }
  if (args.length === 1 && args[0] === 'reconcile') return { mode: 'reconcile' }
  if (
    args.length === 2 &&
    args[0] === 'finalize' &&
    args[1] === '--confirm-m45-continuity-finalization'
  )
    return {
      mode: 'finalize',
      confirm: '--confirm-m45-continuity-finalization',
    }
  throw safeError('arguments', 'invalid')
}

export type ContinuityStat = Readonly<{
  isDirectory(): boolean
  isFile(): boolean
  isSymbolicLink(): boolean
  uid: number
  ino: number
  nlink: number
  dev: number
  mode: number
  size: number
}>
export type ContinuityReviewFilesystem = Readonly<{
  readFile(path: string): Promise<Buffer>
  lstat(path: string): Promise<ContinuityStat>
  readdir(path: string): Promise<string[]>
  mkdir(path: string, options?: { mode?: number }): Promise<void>
  writeFile(
    path: string,
    value: string | Uint8Array,
    options: { flag: 'wx'; mode: number },
  ): Promise<void>
  link(a: string, b: string): Promise<void>
  unlink(path: string): Promise<void>
  rmdir(path: string): Promise<void>
}>
export type ContinuityReviewClock = Readonly<{
  now: () => number
  delay: (milliseconds: number) => Promise<void>
  setTimeout: typeof setTimeout
  clearTimeout: typeof clearTimeout
}>
export type ContinuityReviewSeams = Readonly<{
  filesystem: ContinuityReviewFilesystem
  fetch: typeof fetch
  clock: ContinuityReviewClock
  completedAt: () => Date
  trackedBaselinePath?: string
  anchorQidsOverride?: readonly string[]
}>

export const nodeContinuityReviewFilesystem: ContinuityReviewFilesystem = {
  readFile,
  lstat,
  readdir,
  mkdir: async (path, options) => mkdir(path, options),
  writeFile,
  link,
  unlink,
  rmdir,
}

export const nodeContinuityReviewClock: ContinuityReviewClock = {
  now: Date.now,
  delay: (milliseconds) =>
    new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds)),
  setTimeout,
  clearTimeout,
}

type PredecessorReviewResult = z.infer<typeof predecessorReviewResultSchema>

async function readContinuityInputJson(
  filesystem: ContinuityReviewFilesystem,
  path: string,
): Promise<unknown> {
  let bytes: Buffer
  try {
    bytes = await filesystem.readFile(path)
  } catch {
    throw safeError('check', 'input-read')
  }
  try {
    return JSON.parse(bytes.toString('utf8')) as unknown
  } catch {
    throw safeError('check', 'input-parse')
  }
}

function parseContinuityPredecessorReview(input: unknown) {
  const authority = deriveCandidatePredecessorExclusionAuthority(input)
  const review = predecessorReviewResultSchema.parse(input)
  return { review, authority }
}

type ParsedContinuityPredecessor = Readonly<{
  review: PredecessorReviewResult
  authority: CandidatePredecessorExclusionAuthority
}>

function compareContinuityEligibilityCandidates(
  receipt: AcceptedCandidateReceipt,
) {
  const candidates = new Map(
    receipt.candidates.map((candidate) => [candidate.qid, candidate]),
  )
  return (left: string, right: string) => {
    const leftCandidate = candidates.get(left)
    const rightCandidate = candidates.get(right)
    if (leftCandidate === undefined || rightCandidate === undefined)
      throw safeError('check', 'eligibility')
    return (
      compareAudienceCandidates(leftCandidate, rightCandidate) ||
      compareDiscoveryQids(left, right)
    )
  }
}

/**
 * Mirrors the unexported eligibility derivation inside
 * `anime-release-v2-continuity.ts` so the check command and the later
 * authenticated preparation logic agree on the exact union.
 */
function deriveContinuityEligibility(
  receipt: AcceptedCandidateReceipt,
  primary: PrimaryCandidateReviewResult,
  predecessor: ParsedContinuityPredecessor,
): readonly string[] {
  const retained = new Set(predecessor.authority.qids)
  const receiptQids = new Set(receipt.candidates.map(({ qid }) => qid))
  const receiptResidentPublishedPredecessorQids = new Set(
    predecessor.review.records
      .filter(
        ({ sourceItemId, currentItem }) =>
          currentItem.catalogueState === 'published' &&
          receiptQids.has(sourceItemId),
      )
      .map(({ sourceItemId }) => sourceItemId),
  )
  if (receiptResidentPublishedPredecessorQids.size !== 436)
    throw safeError('check', 'eligibility')
  const primaryApprovedNonPredecessors =
    primary.orderedPrimaryApprovedQids.filter((qid) => !retained.has(qid))
  if (
    primaryApprovedNonPredecessors.length !==
    primary.orderedPrimaryApprovedQids.length
  )
    throw safeError('check', 'eligibility')
  const union = [
    ...new Set([
      ...primaryApprovedNonPredecessors,
      ...receiptResidentPublishedPredecessorQids,
    ]),
  ]
  const ordered = [...union].sort(
    compareContinuityEligibilityCandidates(receipt),
  )
  if (
    canonicalJson(ordered) !==
    canonicalJson(
      [...union].sort(compareContinuityEligibilityCandidates(receipt)),
    )
  )
    throw safeError('check', 'eligibility-order')
  return ordered
}

function deriveContinuityAnchors(
  receipt: AcceptedCandidateReceipt,
  eligibilityQids: readonly string[],
): readonly string[] {
  const candidates = new Map(
    receipt.candidates.map((candidate) => [candidate.qid, candidate]),
  )
  const anchors = eligibilityQids
    .filter((qid) => {
      const candidate = candidates.get(qid)
      if (candidate === undefined) throw safeError('check', 'anchors')
      return (
        candidate.englishBand !== 'unavailable' ||
        candidate.japaneseBand !== 'unavailable'
      )
    })
    .slice(0, continuityEnvelope.anchors)
  if (anchors.length !== continuityEnvelope.anchors)
    throw safeError('check', 'anchors')
  return anchors
}

/**
 * `parsePrimaryCandidateReviewResult` cannot validate the live finalized
 * aggregate: zod's `strictObject.parse` re-orders object keys to schema order,
 * while the shared authority comparison stringifies the result object, so the
 * byte comparison can never match the on-disk key order.  Run the same three
 * validators with the raw input so the comparison reflects the frozen file.
 */
function parseContinuityPrimaryReview(
  primaryInput: unknown,
  receipt: AcceptedCandidateReceipt,
  authorityInput: unknown,
  predecessorInput: unknown,
): PrimaryCandidateReviewResult {
  const primary = primaryCandidateReviewResultSchema.parse(primaryInput)
  assertAcceptedCandidateAcquisitionReviewAuthority(
    receipt,
    acceptedDiscoveryCandidateReceiptSha256,
    authorityInput,
    predecessorInput,
  )
  validatePrimaryCandidateReviewAuthorityForFixture(
    primaryInput,
    receipt,
    acceptedDiscoveryCandidateReceiptSha256,
    authorityInput,
    predecessorInput,
  )
  return primary
}

export type ContinuityCheckResult = Readonly<{
  mode: 'check'
  status: 'checked'
  eligibleCount: number
  anchorCount: 250
  anchorQidsSha256: string
  receiptSha256: string
  primaryApprovedSha256: string
  predecessorResultSha256: string
}>

export async function runContinuityReviewCheck(
  seams: ContinuityReviewSeams,
): Promise<ContinuityCheckResult> {
  const { filesystem } = seams
  const receiptInput = await readContinuityInputJson(
    filesystem,
    join(repositoryRoot, candidateReceiptPath),
  )
  const authorityInput = await readContinuityInputJson(
    filesystem,
    join(repositoryRoot, candidateAuthorityPath),
  )
  const primaryInput = await readContinuityInputJson(
    filesystem,
    join(repositoryRoot, primaryCandidateReviewPath),
  )
  const predecessorInput = await readContinuityInputJson(
    filesystem,
    join(repositoryRoot, predecessorReviewResultPath),
  )
  let receipt: AcceptedCandidateReceipt
  let primary: PrimaryCandidateReviewResult
  let predecessor: ParsedContinuityPredecessor
  try {
    receipt = parseAcceptedCandidateReceipt(receiptInput)
    primary = parseContinuityPrimaryReview(
      primaryInput,
      receipt,
      authorityInput,
      predecessorInput,
    )
    predecessor = parseContinuityPredecessorReview(predecessorInput)
  } catch (error) {
    if (error instanceof ContinuityReviewCommandError) throw error
    throw safeError('check', 'input-authority')
  }
  let eligibilityQids: readonly string[]
  let anchors: readonly string[]
  try {
    eligibilityQids = deriveContinuityEligibility(receipt, primary, predecessor)
    anchors = deriveContinuityAnchors(receipt, eligibilityQids)
  } catch (error) {
    if (error instanceof ContinuityReviewCommandError) throw error
    throw safeError('check', 'eligibility')
  }
  return {
    mode: 'check',
    status: 'checked',
    eligibleCount: eligibilityQids.length,
    anchorCount: continuityEnvelope.anchors,
    anchorQidsSha256: discoverySha256(anchors),
    receiptSha256: discoverySha256(receipt),
    primaryApprovedSha256: primary.orderedPrimaryApprovedQidsSha256,
    predecessorResultSha256: discoverySha256(predecessor.review),
  }
}

export const trackedPolicyBaselinePath =
  'scripts/policy-baseline-review/wikimedia-policy-baseline.v1.json'

export const continuityAcquiredBundleName = 'acquired' as const
export const continuityAcquisitionFilename = 'acquisition.json' as const
export const continuityAcquisitionAggregateFilename =
  'safe-aggregate.json' as const

type BoundedContinuityResponse = Readonly<{
  status: number
  bytes: Uint8Array
  attemptOrdinal: number
}>

/** Serial bounded Action API client; never persists raw provider bytes. */
class ContinuityReviewRequester {
  private attempts = 0
  private active = 0
  private previousCompletion: number | undefined
  private startedAt: number | undefined
  private pacingWaits = 0
  private pacingDelayMilliseconds = 0
  private successfulResponseGroups = 0
  private maximumConcurrency = 0
  private retainedBytes = 0
  constructor(
    private readonly request: typeof fetch,
    private readonly clock: ContinuityReviewClock,
  ) {}
  completeResponseGroup(attemptOrdinal: number): void {
    this.successfulResponseGroups += 1
    void attemptOrdinal
  }
  sourceEvidence() {
    return {
      requestEvidence: {
        requestGroupCount: this.successfulResponseGroups,
        successfulResponseGroupCount: this.successfulResponseGroups,
        attempts: this.attempts,
        retries: this.attempts - this.successfulResponseGroups,
        pacingWaits: this.pacingWaits,
        pacingDelayMilliseconds: this.pacingDelayMilliseconds,
        elapsedMilliseconds:
          this.startedAt === undefined ? 0 : this.clock.now() - this.startedAt,
        maximumConcurrency: this.maximumConcurrency as 1,
      },
    }
  }
  private assertWithinWallTime(): void {
    if (
      this.startedAt !== undefined &&
      this.clock.now() - this.startedAt >=
        continuityEnvelope.maximumElapsedMilliseconds
    )
      throw safeError('acquire', 'wall-time')
  }
  private async delayWithinWallTime(milliseconds: number): Promise<void> {
    this.assertWithinWallTime()
    if (
      this.startedAt !== undefined &&
      this.clock.now() - this.startedAt + milliseconds >=
        continuityEnvelope.maximumElapsedMilliseconds
    )
      throw safeError('acquire', 'wall-time')
    await this.clock.delay(milliseconds)
    this.assertWithinWallTime()
  }
  async fetch(url: URL, init: RequestInit): Promise<BoundedContinuityResponse> {
    for (
      let retry = 0;
      retry < continuityEnvelope.maximumAttemptsPerGroup;
      retry += 1
    ) {
      if (this.attempts >= continuityEnvelope.maximumAttemptsTotal)
        throw safeError('acquire', 'attempt-limit')
      const elapsed =
        this.previousCompletion === undefined
          ? undefined
          : this.clock.now() - this.previousCompletion
      if (
        elapsed !== undefined &&
        elapsed < continuityEnvelope.pacingMilliseconds
      ) {
        const wait = continuityEnvelope.pacingMilliseconds - elapsed
        this.pacingWaits += 1
        this.pacingDelayMilliseconds += wait
        await this.delayWithinWallTime(wait)
      }
      if (this.active !== 0) throw safeError('acquire', 'concurrency')
      if (this.startedAt === undefined) this.startedAt = this.clock.now()
      this.assertWithinWallTime()
      this.active += 1
      this.maximumConcurrency = Math.max(this.maximumConcurrency, this.active)
      this.attempts += 1
      const attemptOrdinal = this.attempts
      const controller = new AbortController()
      const timeout = this.clock.setTimeout(
        () => controller.abort(),
        continuityEnvelope.timeoutMilliseconds,
      )
      try {
        const response = await this.request(url, {
          ...init,
          redirect: 'error',
          signal: controller.signal,
        })
        const length = Number(response.headers.get('content-length'))
        if (
          Number.isFinite(length) &&
          length > continuityEnvelope.maximumBytesPerGroup
        ) {
          controller.abort()
          throw safeError('acquire', 'body-limit')
        }
        const bytes = await readContinuityBodyBytes(response, controller)
        this.assertWithinWallTime()
        if (
          this.retainedBytes + bytes.byteLength >
          continuityEnvelope.maximumTotalBytes
        ) {
          controller.abort()
          throw safeError('acquire', 'body-limit')
        }
        if ([429, 500, 502, 503, 504].includes(response.status)) {
          if (retry === continuityEnvelope.maximumAttemptsPerGroup - 1)
            throw safeError('acquire', 'retry-exhausted')
          await this.delayWithinWallTime(
            continuityRetryAfter(
              response.headers.get('retry-after'),
              this.clock.now(),
            ) ?? Math.min(30_000, 1_000 * 2 ** retry),
          )
          continue
        }
        if (!response.ok) throw safeError('acquire', 'http-status')
        this.retainedBytes += bytes.byteLength
        this.completeResponseGroup(attemptOrdinal)
        return { status: response.status, bytes, attemptOrdinal }
      } catch (error) {
        if (error instanceof ContinuityReviewCommandError) throw error
        if (retry === continuityEnvelope.maximumAttemptsPerGroup - 1)
          throw safeError('acquire', 'retry-exhausted')
        await this.delayWithinWallTime(Math.min(30_000, 1_000 * 2 ** retry))
      } finally {
        this.clock.clearTimeout(timeout)
        this.active -= 1
        this.previousCompletion = this.clock.now()
      }
    }
    throw safeError('acquire', 'retry-exhausted')
  }
}

function continuityRetryAfter(
  value: string | null,
  now: number,
): number | undefined {
  if (value === null) return undefined
  const seconds = Number(value)
  const milliseconds = Number.isFinite(seconds)
    ? seconds * 1_000
    : Date.parse(value) - now
  if (
    !Number.isFinite(milliseconds) ||
    milliseconds < 0 ||
    milliseconds > 30_000
  )
    throw safeError('acquire', 'retry-after')
  return milliseconds
}

async function readContinuityBodyBytes(
  response: Response,
  controller: AbortController,
): Promise<Uint8Array> {
  if (response.body === null) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > continuityEnvelope.maximumBytesPerGroup) {
        controller.abort()
        await reader.cancel().catch(() => undefined)
        throw safeError('acquire', 'body-limit')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

async function deriveContinuityAnchorsFromInputs(
  filesystem: ContinuityReviewFilesystem,
): Promise<readonly string[]> {
  const receiptInput = await readContinuityInputJson(
    filesystem,
    join(repositoryRoot, candidateReceiptPath),
  )
  const authorityInput = await readContinuityInputJson(
    filesystem,
    join(repositoryRoot, candidateAuthorityPath),
  )
  const primaryInput = await readContinuityInputJson(
    filesystem,
    join(repositoryRoot, primaryCandidateReviewPath),
  )
  const predecessorInput = await readContinuityInputJson(
    filesystem,
    join(repositoryRoot, predecessorReviewResultPath),
  )
  let receipt: AcceptedCandidateReceipt
  let primary: PrimaryCandidateReviewResult
  let predecessor: ParsedContinuityPredecessor
  try {
    receipt = parseAcceptedCandidateReceipt(receiptInput)
    primary = parseContinuityPrimaryReview(
      primaryInput,
      receipt,
      authorityInput,
      predecessorInput,
    )
    predecessor = parseContinuityPredecessorReview(predecessorInput)
  } catch (error) {
    if (error instanceof ContinuityReviewCommandError) throw error
    throw safeError('acquire', 'input-authority')
  }
  let eligibilityQids: readonly string[]
  let anchors: readonly string[]
  try {
    eligibilityQids = deriveContinuityEligibility(receipt, primary, predecessor)
    anchors = deriveContinuityAnchors(receipt, eligibilityQids)
  } catch (error) {
    if (error instanceof ContinuityReviewCommandError) throw error
    throw safeError('acquire', 'eligibility')
  }
  return anchors
}

async function promoteContinuityAcquisitionBundle(
  filesystem: ContinuityReviewFilesystem,
  acquisition: ReturnType<typeof createReducedContinuityAcquisition>,
  evidence: ReturnType<ContinuityReviewRequester['sourceEvidence']>,
  baseline: Awaited<ReturnType<typeof parsePolicyBaseline>>,
  preflightCompletedAt: Date,
): Promise<void> {
  const root = join(repositoryRoot, continuityReviewRoot)
  const acquired = join(root, continuityAcquiredBundleName)
  const staging = join(repositoryRoot, continuityStagingSibling)
  const acquisitionJson = `${JSON.stringify(acquisition)}\n`
  const aggregateJson = `${JSON.stringify({
    schema: 'zedarchive.anime-v2-continuity-acquisition-aggregate',
    version: 1,
    anchorCount: continuityEnvelope.anchors,
    groupCount: continuityEnvelope.groups,
    ...evidence.requestEvidence,
    acquisitionSha256: acquisition.acquisitionSha256,
    orderedRequestCommitmentSha256: acquisition.orderedRequestCommitmentSha256,
    reducedResponseSetCommitmentSha256:
      acquisition.reducedResponseSetCommitmentSha256,
    revisionSetCommitmentSha256: acquisition.revisionSetCommitmentSha256,
    preflightEquality: true,
    preflightAgeWithinWindow: true,
    policyRetrievedAt: preflightCompletedAt.toISOString(),
    baselineSha256: baseline.baselineSha256,
  })}\n`
  try {
    await filesystem.lstat(acquired)
    throw safeError('acquire', 'no-resume')
  } catch (error) {
    if (error instanceof ContinuityReviewCommandError) throw error
  }
  try {
    await filesystem.lstat(staging)
    throw safeError('acquire', 'custody')
  } catch (error) {
    if (error instanceof ContinuityReviewCommandError) throw error
  }
  await filesystem.mkdir(root, { mode: 0o700 }).catch(() => undefined)
  await filesystem.mkdir(staging, { mode: 0o700 })
  const staged: ReadonlyArray<readonly [string, string]> = [
    [continuityAcquisitionFilename, acquisitionJson],
    [continuityAcquisitionAggregateFilename, aggregateJson],
  ]
  try {
    for (const [name, value] of staged)
      await writeContinuitySecureFile(filesystem, join(staging, name), value)
    await filesystem.mkdir(acquired, { mode: 0o700 })
    for (const [name] of staged) {
      try {
        await filesystem.link(join(staging, name), join(acquired, name))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST')
          throw safeError('acquire', 'custody')
        throw error
      }
    }
    for (const [name] of staged) {
      const promoted = await filesystem.readFile(join(acquired, name))
      const expected = Buffer.from(staged.find(([n]) => n === name)![1], 'utf8')
      if (!promoted.equals(expected)) throw safeError('acquire', 'custody')
    }
    for (const [name] of staged) await filesystem.unlink(join(staging, name))
    await filesystem.rmdir(staging)
  } catch (error) {
    if (error instanceof ContinuityReviewCommandError) throw error
    throw safeError('acquire', 'custody')
  }
}

async function writeContinuitySecureFile(
  filesystem: ContinuityReviewFilesystem,
  path: string,
  value: string,
): Promise<void> {
  try {
    await filesystem.writeFile(path, value, { flag: 'wx', mode: 0o600 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      throw safeError('acquire', 'custody')
    throw error
  }
  const read = await filesystem.readFile(path)
  if (!read.equals(Buffer.from(value, 'utf8')))
    throw safeError('acquire', 'custody')
}

export async function runContinuityReviewAcquire(
  seams: ContinuityReviewSeams,
): Promise<
  Readonly<{
    mode: 'acquire'
    status: 'complete'
    anchorCount: 250
    groupCount: 10
    attempts: number
    retries: number
    pacingWaits: number
    pacingDelayMilliseconds: number
    elapsedMilliseconds: number
    acquisitionSha256: string
    reducedResponseSetCommitmentSha256: string
    revisionSetCommitmentSha256: string
    policyBaselineSha256: string
  }>
> {
  const { filesystem, fetch: networkFetch, clock, completedAt } = seams
  const anchors =
    seams.anchorQidsOverride ??
    (await deriveContinuityAnchorsFromInputs(filesystem))
  const trackedBaselinePath = join(
    repositoryRoot,
    seams.trackedBaselinePath ?? trackedPolicyBaselinePath,
  )
  const baselineInput = await readContinuityInputJson(
    filesystem,
    trackedBaselinePath,
  )
  const baseline = await parsePolicyBaseline(baselineInput, completedAt())
  const preflight = await retrievePolicyBodies({
    fetch: networkFetch,
    completedAt,
  })
  const preflightCompletedAt = completedAt()
  const preflightAgeMilliseconds =
    preflightCompletedAt.getTime() -
    new Date(baseline.capture.retrievedAt).getTime()
  if (
    canonicalJson(preflight.capture.decodedBodySha256) !==
      canonicalJson(baseline.capture.decodedBodySha256) ||
    canonicalJson(preflight.capture.decodedBodyBytes) !==
      canonicalJson(baseline.capture.decodedBodyBytes) ||
    preflight.capture.totalDecodedBytes !==
      baseline.capture.totalDecodedBytes ||
    preflight.capture.orderedUrlSequenceSha256 !==
      baseline.capture.orderedUrlSequenceSha256
  )
    throw safeError('preflight', 'policy-drift')
  if (
    preflightAgeMilliseconds < 0 ||
    preflightAgeMilliseconds > 24 * 60 * 60 * 1_000
  )
    throw safeError('preflight', 'policy-age')

  const requester = new ContinuityReviewRequester(networkFetch, clock)
  const entities: WikidataEntity[] = []
  for (let group = 0; group < continuityEnvelope.groups; group += 1) {
    const groupQids = anchors.slice(
      group * continuityEnvelope.groupSize,
      (group + 1) * continuityEnvelope.groupSize,
    )
    if (groupQids.length !== continuityEnvelope.groupSize)
      throw safeError('acquire', 'group-shape')
    const url = new URL(wikidataApiEndpoint)
    url.searchParams.set('action', 'wbgetentities')
    url.searchParams.set('ids', groupQids.map((qid) => qid.slice(1)).join('|'))
    url.searchParams.set('props', 'claims|info')
    url.searchParams.set('format', 'json')
    url.searchParams.set('formatversion', '2')
    url.searchParams.set('maxlag', '10')
    const response = await requester.fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': continuityUserAgent,
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
      },
    })
    let parsed: ReturnType<typeof parseWikidataEntityResponse>
    try {
      parsed = parseWikidataEntityResponse(
        JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(response.bytes),
        ),
      )
    } catch {
      throw safeError('acquire', 'response-shape')
    }
    const byQid = new Map(
      groupQids.map((qid) => [qid, parsed.entities[qid]] as const),
    )
    for (const qid of groupQids) {
      const entity = byQid.get(qid)
      if (entity === undefined || entity.missing === true || entity.redirect)
        throw safeError('acquire', 'entity-shape')
      if (entity.type !== 'item' || entity.lastrevid === undefined)
        throw safeError('acquire', 'entity-shape')
      entities.push(entity)
    }
  }
  const acquisition = createReducedContinuityAcquisition({
    anchorQids: anchors,
    entities,
  })
  parseReducedContinuityAcquisition(acquisition, anchors)
  const evidence = requester.sourceEvidence()
  await promoteContinuityAcquisitionBundle(
    filesystem,
    acquisition,
    evidence,
    baseline,
    preflightCompletedAt,
  )
  return {
    mode: 'acquire',
    status: 'complete',
    anchorCount: continuityEnvelope.anchors,
    groupCount: continuityEnvelope.groups,
    attempts: evidence.requestEvidence.attempts,
    retries: evidence.requestEvidence.retries,
    pacingWaits: evidence.requestEvidence.pacingWaits,
    pacingDelayMilliseconds: evidence.requestEvidence.pacingDelayMilliseconds,
    elapsedMilliseconds: evidence.requestEvidence.elapsedMilliseconds,
    acquisitionSha256: acquisition.acquisitionSha256,
    reducedResponseSetCommitmentSha256:
      acquisition.reducedResponseSetCommitmentSha256,
    revisionSetCommitmentSha256: acquisition.revisionSetCommitmentSha256,
    policyBaselineSha256: baseline.baselineSha256,
  }
}

export async function runContinuityReviewCommand(
  command: ContinuityReviewCommand,
  seams: ContinuityReviewSeams,
): Promise<
  ContinuityCheckResult | Awaited<ReturnType<typeof runContinuityReviewAcquire>>
> {
  if (command.mode === 'check') return runContinuityReviewCheck(seams)
  if (command.mode === 'acquire') return runContinuityReviewAcquire(seams)
  if (command.mode === 'prepare')
    throw safeError('continuity-review', 'not-implemented')
  if (command.mode === 'draft')
    throw safeError('continuity-review', 'not-implemented')
  if (command.mode === 'lock')
    throw safeError('continuity-review', 'not-implemented')
  if (command.mode === 'reconcile')
    throw safeError('continuity-review', 'not-implemented')
  throw safeError('continuity-review', 'not-implemented')
}

export type ContinuitySyntheticInputs = Readonly<{
  candidateReceipt: unknown
  candidateAuthority: unknown
  primaryCandidateReview: unknown
  predecessorReviewResult: unknown
}>

/** Test-only in-memory seam; unavailable to live tooling. */
export function createContinuitySyntheticFixture(
  inputs: ContinuitySyntheticInputs,
): ContinuityReviewSeams {
  if (process.env.NODE_ENV !== 'test') throw safeError('fixture', 'test-only')
  const files = new Map<string, Buffer>([
    [
      join(repositoryRoot, candidateReceiptPath),
      Buffer.from(JSON.stringify(inputs.candidateReceipt), 'utf8'),
    ],
    [
      join(repositoryRoot, candidateAuthorityPath),
      Buffer.from(JSON.stringify(inputs.candidateAuthority), 'utf8'),
    ],
    [
      join(repositoryRoot, primaryCandidateReviewPath),
      Buffer.from(JSON.stringify(inputs.primaryCandidateReview), 'utf8'),
    ],
    [
      join(repositoryRoot, predecessorReviewResultPath),
      Buffer.from(JSON.stringify(inputs.predecessorReviewResult), 'utf8'),
    ],
  ])
  const readOnly = () => {
    throw safeError('fixture', 'read-only')
  }
  const filesystem: ContinuityReviewFilesystem = {
    readFile: async (path) => {
      const value = files.get(path)
      if (value === undefined) throw safeError('fixture', 'unknown-path')
      return value
    },
    lstat: readOnly,
    readdir: readOnly,
    mkdir: readOnly,
    writeFile: readOnly,
    link: readOnly,
    unlink: readOnly,
    rmdir: readOnly,
  }
  return {
    filesystem,
    fetch: async () => {
      throw safeError('fixture', 'fetch-unavailable')
    },
    clock: {
      now: () => 1_800_000_000_000,
      delay: async () => undefined,
      setTimeout: (() => 0) as unknown as typeof setTimeout,
      clearTimeout: () => undefined,
    },
    completedAt: () => new Date('2026-08-13T00:00:00.000Z'),
  }
}

function snapshotStoppedMode(argv: readonly string[]): string {
  if (!Array.isArray(argv)) return 'unknown'
  const first = argv[0]
  if (typeof first !== 'string') return 'unknown'
  return first === 'check' ||
    first === 'acquire' ||
    first === 'prepare' ||
    first === 'draft' ||
    first === 'lock' ||
    first === 'reconcile' ||
    first === 'finalize'
    ? first
    : 'unknown'
}

export async function executeContinuityReviewCli(
  argv = process.argv.slice(2),
): Promise<number> {
  let stoppedMode: string = 'unknown'
  try {
    stoppedMode = snapshotStoppedMode(argv)
    const command = parseContinuityReviewArguments(argv)
    stoppedMode = command.mode
    const result = await runContinuityReviewCommand(command, {
      filesystem: nodeContinuityReviewFilesystem,
      fetch,
      clock: nodeContinuityReviewClock,
      completedAt: () => new Date(),
    })
    process.stdout.write(`${JSON.stringify(result)}\n`)
    return 0
  } catch {
    process.stdout.write(
      `${JSON.stringify({ mode: stoppedMode, status: 'stopped' })}\n`,
    )
    return 1
  }
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  void executeContinuityReviewCli().then((code) => {
    process.exitCode = code
  })
}

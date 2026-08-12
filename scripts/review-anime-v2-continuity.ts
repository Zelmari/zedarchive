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
  parseAcceptedCandidateReceipt,
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
export type ContinuityReviewSeams = Readonly<{
  filesystem: ContinuityReviewFilesystem
  completedAt: () => Date
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

export async function runContinuityReviewCommand(
  command: ContinuityReviewCommand,
  seams: ContinuityReviewSeams,
): Promise<ContinuityCheckResult> {
  if (command.mode === 'check') return runContinuityReviewCheck(seams)
  if (command.mode === 'acquire')
    throw safeError('continuity-review', 'not-implemented')
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

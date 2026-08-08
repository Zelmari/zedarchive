import { createHash } from 'node:crypto'
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { z } from '@/config/zod'
import {
  assertCandidateReviewReserveFeasibility,
  acquisitionOutcomeCommitment,
  acceptedCandidateRecoveryCollisionAuditSha256,
  acceptedCandidateReviewRoundTwoPromotionPlanSha256,
  candidateAcquisitionSpecificationSha256,
  candidateAcquisitionSpecification,
  candidateAcquisitionOutcomeSchema,
  candidateAcquisitionSourceReceiptSchema,
  candidateActiveCollisionAuditSchema,
  candidatePrimaryAggregatePhaseSchema,
  candidateRecoveryCollisionAuditSchema,
  createCandidateActiveCollisionAudit,
  createCandidateRecoveryCollisionGeometry,
  candidateManifestSchema,
  candidateReductionWitnessSha256,
  candidateRevisionWitnessSha256,
  createCandidateAcquisitionSourceReceipt,
  candidatePrimaryReviewRecordSchema,
  createCandidateAcquisitionReviewAuthority,
  createLockedCandidateReviewManifest,
  deriveCandidateReviewRoundSha256,
  deriveCandidateManifests,
  derivePrimaryCandidateReviewFromAuthority,
  parseCandidateAcquisitionSourceReceiptForFixture,
  reduceCandidateEntitySafely,
  validateCandidateRecoveryCollisionAudit,
  type CandidateActiveCollisionAudit,
  type CandidatePrimaryAggregatePhase,
  type CandidateRecoveryCollisionAudit,
  type CandidateAcquisitionOutcome,
  type CandidateManifest,
} from '@/features/anime/catalogue/anime-v2-candidate-acquisition'
import { acceptedCandidateReceiptSchema } from '@/features/anime/catalogue/anime-release-v2-continuity'
import {
  deriveCandidatePredecessorExclusionAuthority,
  deriveCandidatePredecessorExclusionAuthorityForFixture,
  predecessorReviewResultSchema,
  type CandidatePredecessorExclusionAuthority,
} from '@/features/anime/catalogue/anime-successor-predecessor-review'
import {
  discoveryCoverageFloors,
  discoverySha256,
} from '@/features/anime/catalogue/wikidata-anime-discovery'
import {
  wikidataApiEndpoint,
  wikidataImporterUserAgent,
} from '@/integrations/wikidata/wikidata-constants'
import {
  parseWikidataEntityResponse,
  type WikidataEntity,
} from '@/integrations/wikidata/wikidata-entity'

const root = fileURLToPath(new URL('../', import.meta.url))
const receiptPath = join(
  root,
  '.local/m45/discovery/frozen-run/candidate-receipt.json',
)
const predecessorPath = join(
  root,
  '.local/m45/predecessor-review/finalized/predecessor-review-result.json',
)
const outputDirectory = join(root, '.local/m45/candidate-review')
const maximumBodyBytes = 5 * 1024 * 1024
const maximumAttempts = 1_000
const expectedReceiptSha256 =
  'fa126f87e53ef4babfec7f0a5924c153e84aa03a638052157656537e71002c59' as const
const expectedPredecessorReviewResultSha256 =
  '2e46cd45c652e8303fa63f756d2d9efbcb63c6bcd20fcd564ee43fa2d7fe267c' as const
const expectedRetainedPredecessorIdentitySetSha256 =
  'b95511db075d5ff764beb4d273f9b1fad2ef2c418e70b9e624a8c775e71fa645' as const
const expectedCorrectedActiveAuditSha256 =
  'daceaeb3608f5d85f710f55f48a61d6a688631c316f3ef98a9a7b9c189fc0b5f' as const
const expectedCorrectedActiveAuditFileSha256 =
  'a29bb9bdabc6fafa775a006d6ced6e0c51235958d1585c7dce94fbb73f70bd26' as const
const expectedCorrectedClosureSha256 =
  '4f01cc7911ae9cbbebd626a3ee135d18b628bd7674049a9aa8af7482b676f824' as const
const expectedCorrectedClosureFileSha256 =
  '7b6042c1ba40148ee2fc8abd967b954fd2798d1af371f231b410c72a85737bde' as const

export class CandidateReviewCommandError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CandidateReviewCommandError'
  }
}

const usage =
  'Usage: review-anime-v2-candidates <check|prepare --confirm-wikimedia-live|complete <three-digit-manifest>|lock <three-digit-manifest>|verify-canonical <three-digit-manifest>|audit-active|verify-recovery|finalize|recover --confirm-decision-068>'
let terminalCommandStage:
  | 'check'
  | 'acquisition'
  | 'complete'
  | 'lock'
  | 'audit'
  | 'recovery'
  | 'finalize' = 'check'
let terminalDiagnosticWritten = false

export const candidateReviewLockTerminalPhaseSchema = z.enum([
  'recovery-clean',
  'prepared-authority',
  'predecessor-authority',
  'recovery-audit',
  'round-scaffold',
  'canonical-round-state',
  'target-admission',
  'verdict-materialization',
  'completed-canonical',
  'lock-construction',
  'existing-locks',
  'predecessor-reserve',
  'reserve-feasibility',
  'atomic-lock-write',
])
type CandidateReviewLockTerminalPhase = z.infer<
  typeof candidateReviewLockTerminalPhaseSchema
>
let terminalLockPhase: CandidateReviewLockTerminalPhase | undefined

export const candidateReviewCanonicalSubphaseSchema = z.enum([
  'persisted-revalidations',
  'fresh-vacancy',
  'fresh-verdict',
  'fresh-completed',
  'fresh-lock',
])
type CandidateReviewCanonicalSubphase = z.infer<
  typeof candidateReviewCanonicalSubphaseSchema
>
export const candidateReviewCanonicalSubphaseResultSchema = z.strictObject({
  outcome: z.enum(['completed', 'stopped']),
  subphase: candidateReviewCanonicalSubphaseSchema.optional(),
})

function setCandidateReviewLockTerminalPhase(
  phase: CandidateReviewLockTerminalPhase,
  observer?: (phase: CandidateReviewLockTerminalPhase) => void,
): void {
  terminalLockPhase = phase
  observer?.(phase)
}

export const candidateReviewFinalizeTerminalPhaseSchema = z.enum([
  'recovery-clean',
  'prepared-authority',
  'predecessor-authority',
  'canonical-locks',
  'active-collision-audit',
  'recovery-audit',
  'round-scaffold',
  'recovery-acceptance',
  'authority-construction',
  'aggregate-derivation',
  'destination-vacancy',
  'staging-create',
  'authority-write',
  'aggregate-write',
  'safe-aggregate-write',
  'atomic-publication',
])
type CandidateReviewFinalizeTerminalPhase = z.infer<
  typeof candidateReviewFinalizeTerminalPhaseSchema
>
let terminalFinalizePhase: CandidateReviewFinalizeTerminalPhase | undefined
let terminalAggregatePhase: CandidatePrimaryAggregatePhase | undefined

function setCandidateReviewFinalizeTerminalPhase(
  phase: CandidateReviewFinalizeTerminalPhase,
  observer?: (phase: CandidateReviewFinalizeTerminalPhase) => void,
): void {
  terminalFinalizePhase = phase
  observer?.(phase)
}

function setCandidatePrimaryAggregatePhase(
  phase: CandidatePrimaryAggregatePhase,
  observer?: (phase: CandidatePrimaryAggregatePhase) => void,
): void {
  terminalAggregatePhase = phase
  observer?.(phase)
}

export function parseCandidateReviewArguments(args: readonly string[]) {
  if (args.length === 1 && args[0] === 'check')
    return { mode: 'check' as const }
  if (
    args.length === 2 &&
    args[0] === 'prepare' &&
    args[1] === '--confirm-wikimedia-live'
  )
    return { mode: 'prepare' as const }
  if (args.length === 2 && args[0] === 'lock' && /^[0-9]{3}$/.test(args[1]!))
    return {
      mode: 'lock' as const,
      manifest: args[1]!,
    }
  if (
    args.length === 2 &&
    args[0] === 'verify-canonical' &&
    /^[0-9]{3}$/.test(args[1]!)
  )
    return {
      mode: 'verify-canonical' as const,
      manifest: args[1]!,
    }
  if (
    args.length === 2 &&
    args[0] === 'complete' &&
    /^[0-9]{3}$/.test(args[1]!)
  )
    return {
      mode: 'complete' as const,
      manifest: args[1]!,
    }
  if (
    args.length === 2 &&
    args[0] === 'recover' &&
    args[1] === '--confirm-decision-068'
  )
    return { mode: 'recover' as const }
  if (args.length === 1 && args[0] === 'finalize')
    return { mode: 'finalize' as const }
  if (args.length === 1 && args[0] === 'audit-active')
    return { mode: 'audit-active' as const }
  if (args.length === 1 && args[0] === 'verify-recovery')
    return { mode: 'verify-recovery' as const }
  throw new CandidateReviewCommandError(usage)
}

type Receipt = z.infer<typeof acceptedCandidateReceiptSchema>
type ReviewRecord = z.infer<typeof candidatePrimaryReviewRecordSchema>
const shaSchema = z.string().regex(/^[a-f0-9]{64}$/)
const legacyCompletedResultSchema = z.strictObject({
  schema: z.literal('zedarchive.anime-v2-primary-candidate-review-completed'),
  version: z.literal(2),
  candidateReceiptSha256: z.literal(expectedReceiptSha256),
  manifest: candidateManifestSchema,
  reviewInputSha256: shaSchema,
  records: z.array(candidatePrimaryReviewRecordSchema).min(1).max(50),
  completedResultSha256: shaSchema,
})
const completedResultSchema = z.strictObject({
  schema: z.literal('zedarchive.anime-v2-primary-candidate-review-completed'),
  version: z.literal(3),
  candidateReceiptSha256: z.literal(expectedReceiptSha256),
  predecessorReviewResultSha256: shaSchema,
  retainedPredecessorIdentitySetSha256: shaSchema,
  predecessorExclusionAuthoritySha256: shaSchema,
  candidateReviewRoundSha256: shaSchema,
  verdictSha256: shaSchema,
  manifest: candidateManifestSchema,
  reviewInputSha256: shaSchema,
  records: z.array(candidatePrimaryReviewRecordSchema).min(1).max(50),
  completedResultSha256: shaSchema,
})
const projectedVerdictSchema = z.strictObject({
  qid: z.string().regex(/^Q[1-9][0-9]*$/),
  machineValidation: z.literal('approved'),
  exactWorkIdentity: z.enum(['approved', 'rejected']),
  mediaScope: z.enum(['approved', 'rejected']),
  title: z.union([
    z.null(),
    z.strictObject({
      source: z.enum([
        'label.en',
        'alias.en',
        'claim.P1476.en',
        'label.ja-latn',
        'alias.ja-latn',
        'claim.P1476.ja-latn',
      ]),
      valueSha256: shaSchema,
    }),
  ]),
  titleUsability: z.enum(['approved', 'rejected']),
  adultPublicationOutcome: z.enum(['cleared', 'excluded']),
  format: z.enum(['approved', 'rejected']),
  year: z.enum(['approved', 'rejected']),
  episode: z.enum(['approved', 'rejected']),
  status: z.enum(['approved', 'rejected']),
  maturity: z.enum(['approved', 'rejected']),
  duplicate: z.enum(['approved', 'rejected']),
  relationship: z.enum(['approved', 'rejected']),
  primaryReview: z.enum(['approved', 'rejected']),
})
const machineRejectedVerdictSchema = z.strictObject({
  qid: z.string().regex(/^Q[1-9][0-9]*$/),
  machineValidation: z.literal('rejected'),
})
const verdictSchema = z.strictObject({
  schema: z.literal('zedarchive.anime-v2-candidate-primary-review-verdict'),
  version: z.literal(1),
  candidateReceiptSha256: z.literal(expectedReceiptSha256),
  manifest: candidateManifestSchema,
  records: z
    .array(z.union([projectedVerdictSchema, machineRejectedVerdictSchema]))
    .min(1)
    .max(50),
})
const roundVerdictSchema = verdictSchema.extend({
  version: z.literal(2),
  predecessorReviewResultSha256: shaSchema,
  retainedPredecessorIdentitySetSha256: shaSchema,
  predecessorExclusionAuthoritySha256: shaSchema,
  candidateReviewRoundSha256: shaSchema,
})

export const correctedCandidateClosureSchema = z.strictObject({
  schema: z.literal('zedarchive.anime-v2-frozen-format-year-closure-audit.v1'),
  version: z.literal(1),
  candidateReceiptSha256: shaSchema,
  receiptFileSha256: shaSchema,
  acquisitionSha256: shaSchema,
  acquisitionFileSha256: shaSchema,
  predecessorReviewResultSha256: shaSchema,
  recoveryAuditSha256: shaSchema,
  activeAuditSha256: shaSchema,
  activeAuditFileSha256: shaSchema,
  records: z.number().int().nonnegative(),
  manifests: z.number().int().nonnegative(),
  locks: z.number().int().nonnegative(),
  approved: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  mismatches: z.number().int().nonnegative(),
  formatMismatches: z.number().int().nonnegative(),
  yearMismatches: z.number().int().nonnegative(),
  combinedMismatches: z.number().int().nonnegative(),
  closureSha256: shaSchema,
})
type CorrectedCandidateClosure = z.infer<typeof correctedCandidateClosureSchema>

function correctedCandidateClosureCore(closure: CorrectedCandidateClosure) {
  const { closureSha256: _closureSha256, ...core } = closure
  void _closureSha256
  return core
}

function canonicalHash(value: unknown): string {
  return discoverySha256(value)
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown
}

async function readReceipt(path = receiptPath): Promise<Receipt> {
  const receipt = acceptedCandidateReceiptSchema.parse(await readJson(path))
  if (canonicalHash(receipt) !== expectedReceiptSha256)
    throw new CandidateReviewCommandError(
      'Candidate receipt is not the accepted frozen run.',
    )
  if (
    receipt.candidates.length !== 7_958 ||
    receipt.identityBlocked.length !== 57
  )
    throw new CandidateReviewCommandError(
      'Candidate receipt does not preserve the accepted population.',
    )
  const manifests = deriveCandidateManifests(receipt)
  if (
    manifests.length !== 160 ||
    manifests.some(
      (manifest, index) =>
        manifest.ordinal !== index + 1 ||
        manifest.qids.length !== (index === 159 ? 8 : 50),
    )
  )
    throw new CandidateReviewCommandError(
      'Candidate manifest partition is not the exact 160-partition.',
    )
  return receipt
}

function manifestName(ordinal: number): string {
  return String(ordinal).padStart(3, '0')
}
function preparedDirectory(directory = outputDirectory) {
  return join(directory, 'prepared')
}
function locksDirectory(directory = outputDirectory) {
  return join(directory, 'locks')
}
function legacyVerdictsDirectory(directory = outputDirectory) {
  return join(directory, 'verdicts')
}
function legacyCompletedDirectory(directory = outputDirectory) {
  return join(directory, 'completed')
}
function reviewRoundDirectory(directory = outputDirectory) {
  return join(directory, 'review-round-2')
}
function roundVerdictsDirectory(directory = outputDirectory) {
  return join(reviewRoundDirectory(directory), 'verdicts')
}
function roundCompletedDirectory(directory = outputDirectory) {
  return join(reviewRoundDirectory(directory), 'completed')
}
function roundLocksDirectory(directory = outputDirectory) {
  return join(reviewRoundDirectory(directory), 'locks')
}
function roundRevalidationsDirectory(directory = outputDirectory) {
  return join(reviewRoundDirectory(directory), 'revalidations')
}
function auditPath(directory = outputDirectory) {
  return join(directory, 'candidate-predecessor-collision-audit.v1.json')
}
function activeAuditPath(directory = outputDirectory) {
  return join(reviewRoundDirectory(directory), 'active-collision-audit.v1.json')
}
function activeAuditStagingPath(directory = outputDirectory) {
  return join(
    reviewRoundDirectory(directory),
    '.active-collision-audit.v1.staging.json',
  )
}
function correctedClosurePath(directory = outputDirectory) {
  return join(directory, 'frozen-format-year-closure-audit.v1.json')
}
function correctedClosureStagingPath(directory = outputDirectory) {
  return join(directory, '.frozen-format-year-closure-audit.v1.staging.json')
}
function recoveryJournalPath(directory = outputDirectory) {
  return join(directory, '.decision-068-recovery-journal.json')
}
function recoveryStagingDirectory(directory = outputDirectory) {
  return join(directory, '.decision-068-recovery-staging')
}
function canonicalRoundPaths(manifest: string, directory = outputDirectory) {
  return {
    verdict: join(roundVerdictsDirectory(directory), `${manifest}.json`),
    completed: join(roundCompletedDirectory(directory), `${manifest}.json`),
    lock: join(roundLocksDirectory(directory), `${manifest}.locked.json`),
    revalidation: join(
      roundRevalidationsDirectory(directory),
      `${manifest}.json`,
    ),
  }
}
function finalizedDirectory(directory = outputDirectory) {
  return join(directory, 'finalized')
}
function safeError(
  stage: string,
  category: string,
): CandidateReviewCommandError {
  return new CandidateReviewCommandError(
    `Candidate review stopped at ${stage}:${category}.`,
  )
}

/** Count/hash-only terminal evidence; it intentionally excludes provider and review data. */
export function createCandidateTerminalDiagnostic(
  input: Readonly<{
    stage:
      | 'check'
      | 'acquisition'
      | 'atomic-publication'
      | 'complete'
      | 'lock'
      | 'audit'
      | 'recovery'
      | 'finalize'
    outcome: 'completed' | 'stopped'
    candidates?: number
    manifests?: number
    locks?: number
    collisions?: number
    revalidated?: number
    quarantined?: number
    missing?: number
    correctlyRejectedCollisions?: number
    violations?: number
    sourceReceiptSha256?: string
    acquisitionSha256?: string
    authoritySha256?: string
    recoveryAuditSha256?: string
    promotionPlanSha256?: string
    phase?:
      CandidateReviewLockTerminalPhase | CandidateReviewFinalizeTerminalPhase
    aggregatePhase?: CandidatePrimaryAggregatePhase
    requestEvidence?: ReturnType<
      SequentialCandidateRequester['sourceEvidence']
    >['requestEvidence']
    rawAttemptSetCommitmentSha256?: string
  }>,
) {
  const phase =
    input.phase === undefined
      ? {}
      : parseCandidateReviewTerminalPhase(input.stage, input.phase)
  const aggregatePhase =
    input.aggregatePhase === undefined
      ? {}
      : parseCandidateReviewTerminalAggregatePhase(
          input.stage,
          input.phase,
          input.aggregatePhase,
        )
  return {
    schema: 'zedarchive.anime-v2-candidate-review-terminal-diagnostic',
    version: 2,
    ...input,
    ...phase,
    ...aggregatePhase,
  }
}

function parseCandidateReviewTerminalAggregatePhase(
  stage: Parameters<typeof createCandidateTerminalDiagnostic>[0]['stage'],
  phase:
    | CandidateReviewLockTerminalPhase
    | CandidateReviewFinalizeTerminalPhase
    | undefined,
  aggregatePhase: CandidatePrimaryAggregatePhase,
) {
  if (stage !== 'finalize' || phase !== 'aggregate-derivation')
    throw new CandidateReviewCommandError(
      'Aggregate phase is accepted only for finalize aggregate derivation.',
    )
  return {
    aggregatePhase: candidatePrimaryAggregatePhaseSchema.parse(aggregatePhase),
  }
}

function parseCandidateReviewTerminalPhase(
  stage:
    | 'check'
    | 'acquisition'
    | 'atomic-publication'
    | 'complete'
    | 'lock'
    | 'audit'
    | 'recovery'
    | 'finalize',
  phase:
    CandidateReviewLockTerminalPhase | CandidateReviewFinalizeTerminalPhase,
) {
  if (stage === 'lock')
    return { phase: candidateReviewLockTerminalPhaseSchema.parse(phase) }
  if (stage === 'finalize')
    return { phase: candidateReviewFinalizeTerminalPhaseSchema.parse(phase) }
  throw new CandidateReviewCommandError(
    'Terminal phase is only accepted for lock and finalize stages.',
  )
}

function writeCandidateTerminalDiagnostic(
  input: Parameters<typeof createCandidateTerminalDiagnostic>[0],
): void {
  terminalDiagnosticWritten = true
  console.log(JSON.stringify(createCandidateTerminalDiagnostic(input)))
}

export async function assertCandidateReviewOutputVacant(
  directory = outputDirectory,
) {
  try {
    const entries = await readdir(directory)
    if (entries.length > 0)
      throw new CandidateReviewCommandError(
        'Candidate review output already exists; no resume or overwrite is allowed.',
      )
  } catch (error) {
    if (
      error instanceof CandidateReviewCommandError ||
      (error as NodeJS.ErrnoException).code !== 'ENOENT'
    )
      throw error
  }
}

type RequestClock = Readonly<{
  now: () => number
  delay: (milliseconds: number) => Promise<void>
  setTimeout: typeof setTimeout
  clearTimeout: typeof clearTimeout
}>
type BoundedResponse = Readonly<{
  ok: boolean
  status: number
  headers: Headers
  bytes: Uint8Array
  attemptOrdinal: number
}>
const defaultClock: RequestClock = {
  now: Date.now,
  delay: (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  setTimeout,
  clearTimeout,
}

function retryAfter(value: string | null, now: number): number | undefined {
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
    throw safeError('acquisition', 'retry-after')
  return milliseconds
}
async function bodyBytes(
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
      if (size > maximumBodyBytes) {
        controller.abort()
        await reader.cancel().catch(() => undefined)
        throw safeError('acquisition', 'body-limit')
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

/** Serial bounded Action API client. It never persists raw provider bytes. */
export class SequentialCandidateRequester {
  private attempts = 0
  private active = 0
  private previousCompletion: number | undefined
  private startedAt: number | undefined
  private pacingWaits = 0
  private pacingDelayMilliseconds = 0
  private successfulResponseGroups = 0
  private maximumConcurrency = 0
  private readonly rawResponseSha256: string[] = []
  private readonly successfulAttemptOrdinalByRequestGroup: number[] = []
  constructor(
    private readonly request: typeof fetch = fetch,
    private readonly clock: RequestClock = defaultClock,
  ) {}
  get attemptCount() {
    return this.attempts
  }
  completeResponseGroup(attemptOrdinal: number): void {
    this.successfulResponseGroups += 1
    this.successfulAttemptOrdinalByRequestGroup.push(attemptOrdinal)
  }
  sourceEvidence() {
    return {
      rawAttemptSha256: this.rawResponseSha256,
      successfulAttemptOrdinalByRequestGroup:
        this.successfulAttemptOrdinalByRequestGroup,
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
        candidateAcquisitionSpecification.maximumElapsedMilliseconds
    )
      throw safeError('acquisition', 'wall-time')
  }
  private async delayWithinWallTime(milliseconds: number): Promise<void> {
    this.assertWithinWallTime()
    if (
      this.startedAt !== undefined &&
      this.clock.now() - this.startedAt + milliseconds >=
        candidateAcquisitionSpecification.maximumElapsedMilliseconds
    )
      throw safeError('acquisition', 'wall-time')
    await this.clock.delay(milliseconds)
    this.assertWithinWallTime()
  }
  async fetch(url: URL, init: RequestInit): Promise<BoundedResponse> {
    for (let retry = 0; retry < 3; retry += 1) {
      if (this.attempts >= maximumAttempts)
        throw safeError('acquisition', 'attempt-limit')
      const elapsed =
        this.previousCompletion === undefined
          ? undefined
          : this.clock.now() - this.previousCompletion
      if (elapsed !== undefined && elapsed < 350) {
        const wait = 350 - elapsed
        this.pacingWaits += 1
        this.pacingDelayMilliseconds += wait
        await this.delayWithinWallTime(wait)
      }
      if (this.active !== 0) throw safeError('acquisition', 'concurrency')
      if (this.startedAt === undefined) this.startedAt = this.clock.now()
      this.assertWithinWallTime()
      this.active += 1
      this.maximumConcurrency = Math.max(this.maximumConcurrency, this.active)
      this.attempts += 1
      const attemptOrdinal = this.attempts
      const controller = new AbortController()
      const timeout = this.clock.setTimeout(() => controller.abort(), 10_000)
      let retainedAttemptWitness = false
      try {
        const response = await this.request(url, {
          ...init,
          redirect: 'error',
          signal: controller.signal,
        })
        const length = Number(response.headers.get('content-length'))
        if (Number.isFinite(length) && length > maximumBodyBytes) {
          controller.abort()
          throw safeError('acquisition', 'body-limit')
        }
        const bytes = await bodyBytes(response, controller)
        this.rawResponseSha256.push(
          createHash('sha256').update(bytes).digest('hex'),
        )
        retainedAttemptWitness = true
        this.assertWithinWallTime()
        if ([429, 500, 502, 503, 504].includes(response.status)) {
          if (retry === 2) throw safeError('acquisition', 'retry-exhausted')
          await this.delayWithinWallTime(
            retryAfter(response.headers.get('retry-after'), this.clock.now()) ??
              Math.min(30_000, 1_000 * 2 ** retry),
          )
          continue
        }
        return {
          ok: response.ok,
          status: response.status,
          headers: response.headers,
          bytes,
          attemptOrdinal,
        }
      } catch (error) {
        if (!retainedAttemptWitness) {
          this.rawResponseSha256.push(
            canonicalHash({
              version: 'candidate-no-retained-body-attempt-witness.v1',
              attemptOrdinal,
            }),
          )
          retainedAttemptWitness = true
        }
        if (error instanceof CandidateReviewCommandError) throw error
        if (retry === 2) throw safeError('acquisition', 'retry-exhausted')
        await this.delayWithinWallTime(Math.min(30_000, 1_000 * 2 ** retry))
      } finally {
        this.clock.clearTimeout(timeout)
        this.active -= 1
        this.previousCompletion = this.clock.now()
      }
    }
    throw safeError('acquisition', 'retry-exhausted')
  }
}

export async function fetchCandidateEntitiesBounded(
  qids: readonly string[],
  requester: SequentialCandidateRequester,
): Promise<Record<string, WikidataEntity>> {
  const entities: Record<string, WikidataEntity> = {}
  for (let offset = 0; offset < qids.length; offset += 25) {
    const group = qids.slice(offset, offset + 25)
    const url = new URL(wikidataApiEndpoint)
    url.search = new URLSearchParams({
      action: 'wbgetentities',
      ids: group.join('|'),
      props: 'labels|aliases|claims|info',
      languages: 'en|ja-latn',
      format: 'json',
      formatversion: '2',
      maxlag: '10',
    }).toString()
    const response = await requester.fetch(url, {
      headers: {
        'User-Agent': wikidataImporterUserAgent,
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
      },
    })
    if (!response.ok) throw safeError('acquisition', 'http-status')
    const parsed = parseWikidataEntityResponse(
      JSON.parse(new TextDecoder().decode(response.bytes)) as unknown,
    )
    if (
      JSON.stringify(Object.keys(parsed.entities).sort()) !==
      JSON.stringify([...group].sort())
    )
      throw safeError('acquisition', 'returned-qids')
    for (const qid of group) {
      const entity = parsed.entities[qid]
      if (entity === undefined || entity.id !== qid)
        throw safeError('acquisition', 'returned-qids')
      entities[qid] = entity
    }
    requester.completeResponseGroup(response.attemptOrdinal)
  }
  return entities
}

const acquisitionSchema = z.strictObject({
  schema: z.literal('zedarchive.anime-v2-candidate-acquisition'),
  version: z.literal(2),
  candidateReceiptSha256: z.literal(expectedReceiptSha256),
  manifests: z.array(candidateManifestSchema),
  outcomes: z.array(candidateAcquisitionOutcomeSchema),
  sourceReceipt: candidateAcquisitionSourceReceiptSchema,
  acquisitionSha256: z.string().regex(/^[a-f0-9]{64}$/),
})
type Acquisition = z.infer<typeof acquisitionSchema>

function acquisitionCore(input: Omit<Acquisition, 'acquisitionSha256'>) {
  return {
    schema: input.schema,
    version: input.version,
    candidateReceiptSha256: input.candidateReceiptSha256,
    manifests: input.manifests,
    outcomes: input.outcomes,
    sourceReceipt: input.sourceReceipt,
  }
}
function sourceReceipt(
  receipt: Receipt,
  manifests: readonly CandidateManifest[],
  revisionWitnessSha256: readonly string[],
  reductionWitnessSha256: readonly string[],
  evidence?: ReturnType<SequentialCandidateRequester['sourceEvidence']>,
) {
  const groups = Array.from(
    { length: Math.ceil(receipt.candidates.length / 25) },
    (_, index) => receipt.candidates.slice(index * 25, index * 25 + 25),
  )
  const requestGroups = groups.map((group) => group.map(({ qid }) => qid))
  const requestEvidence = evidence?.requestEvidence ?? {
    requestGroupCount: groups.length,
    successfulResponseGroupCount: groups.length,
    attempts: groups.length,
    retries: 0,
    pacingWaits: Math.max(0, groups.length - 1),
    pacingDelayMilliseconds: Math.max(0, groups.length - 1) * 350,
    elapsedMilliseconds: Math.max(0, groups.length - 1) * 350,
    maximumConcurrency: 1,
  }
  const rawAttemptSha256 =
    evidence?.rawAttemptSha256 ??
    groups.map((_, index) =>
      canonicalHash({ version: 'fixture-raw-attempt.v1', index }),
    )
  const successfulAttemptOrdinalByRequestGroup =
    evidence?.successfulAttemptOrdinalByRequestGroup ??
    groups.map((_, index) => index + 1)
  const setCommitment = (version: string, values: readonly unknown[]) =>
    canonicalHash({ version, values })
  return createCandidateAcquisitionSourceReceipt({
    schema: 'zedarchive.anime-v2-candidate-acquisition-source-receipt',
    version: 2,
    candidateReceiptSha256: expectedReceiptSha256,
    candidateAcquisitionSpecificationSha256,
    manifestOrderSha256: canonicalHash(
      manifests.map(({ ordinal, manifestSha256 }) => ({
        ordinal,
        manifestSha256,
      })),
    ),
    manifestSetSha256: canonicalHash(
      manifests.map(({ manifestSha256 }) => manifestSha256).sort(),
    ),
    orderedRequestGroupCommitmentSha256: canonicalHash(requestGroups),
    rawAttemptSha256,
    successfulAttemptOrdinalByRequestGroup,
    revisionWitnessSha256: [...revisionWitnessSha256],
    reductionWitnessSha256: [...reductionWitnessSha256],
    rawAttemptSetCommitmentSha256: setCommitment(
      'candidate-raw-attempt-set.v1',
      rawAttemptSha256,
    ),
    successfulAttemptOrdinalSetCommitmentSha256: setCommitment(
      'candidate-successful-attempt-ordinal-set.v1',
      successfulAttemptOrdinalByRequestGroup,
    ),
    revisionWitnessSetCommitmentSha256: setCommitment(
      'candidate-revision-witness-set.v1',
      revisionWitnessSha256,
    ),
    reductionWitnessSetCommitmentSha256: setCommitment(
      'candidate-reduction-witness-set.v1',
      reductionWitnessSha256,
    ),
    requestEvidence,
  })
}

function makeDraft(outcome: CandidateAcquisitionOutcome) {
  const core = {
    qid: outcome.qid,
    candidateSha256: outcome.candidateSha256,
    manifestSha256: outcome.manifestSha256,
    projectionSha256:
      outcome.disposition === 'projected'
        ? outcome.projection.projectionSha256
        : null,
    acquisitionOutcomeSha256: acquisitionOutcomeCommitment(outcome),
  }
  const reviewInputSha256 = canonicalHash({
    version: 'candidate-primary-review-input.v2',
    ...core,
  })
  if (outcome.disposition === 'projected')
    return { ...core, reviewInputSha256, state: 'pending' as const }
  return {
    ...core,
    reviewInputSha256,
    machineValidation: 'rejected' as const,
    exactWorkIdentity: 'not-reviewed' as const,
    mediaScope: 'not-reviewed' as const,
    title: null,
    titleUsability: 'not-reviewed' as const,
    adultSignals: [],
    adultPublicationOutcome: 'excluded' as const,
    format: 'not-reviewed' as const,
    year: 'not-reviewed' as const,
    episode: 'not-reviewed' as const,
    status: 'not-reviewed' as const,
    maturity: 'not-reviewed' as const,
    duplicate: 'not-reviewed' as const,
    relationship: 'not-reviewed' as const,
    primaryReview: 'rejected' as const,
  }
}

export function buildCandidatePreparationArtifacts(
  receipt: Receipt,
  entities: Readonly<Record<string, WikidataEntity>>,
  evidence?: ReturnType<SequentialCandidateRequester['sourceEvidence']>,
) {
  const manifests = deriveCandidateManifests(receipt)
  const candidateByQid = new Map(
    receipt.candidates.map((candidate) => [candidate.qid, candidate]),
  )
  const manifestByQid = new Map(
    manifests.flatMap((manifest) =>
      manifest.qids.map((qid) => [qid, manifest] as const),
    ),
  )
  for (const candidate of receipt.candidates)
    candidateRevisionWitnessSha256(
      candidate,
      entities[candidate.qid]?.lastrevid,
    )
  const preliminary = receipt.candidates.map((candidate) =>
    reduceCandidateEntitySafely({
      candidate,
      manifest: manifestByQid.get(candidate.qid)!,
      entity: entities[candidate.qid]!,
      sourceReceiptSha256: '0'.repeat(64),
      revisionWitnessSha256: candidateRevisionWitnessSha256(
        candidate,
        entities[candidate.qid]!.lastrevid,
      ),
      reductionWitnessSha256: '0'.repeat(64),
    }),
  )
  const revisionWitnessSha256 = receipt.candidates.map((candidate) =>
    candidateRevisionWitnessSha256(
      candidate,
      entities[candidate.qid]!.lastrevid,
    ),
  )
  const reductionWitnessSha256 = preliminary.map((outcome, index) =>
    candidateReductionWitnessSha256(receipt.candidates[index]!, outcome),
  )
  const source = sourceReceipt(
    receipt,
    manifests,
    revisionWitnessSha256,
    reductionWitnessSha256,
    evidence,
  )
  const outcomes = receipt.candidates.map((candidate, index) =>
    reduceCandidateEntitySafely({
      candidate,
      manifest: manifestByQid.get(candidate.qid)!,
      entity: entities[candidate.qid]!,
      sourceReceiptSha256: source.sourceReceiptSha256,
      revisionWitnessSha256: revisionWitnessSha256[index]!,
      reductionWitnessSha256: reductionWitnessSha256[index]!,
    }),
  )
  const acquisitionCoreValue = {
    schema: 'zedarchive.anime-v2-candidate-acquisition' as const,
    version: 2 as const,
    candidateReceiptSha256: expectedReceiptSha256,
    manifests,
    outcomes,
    sourceReceipt: source,
  }
  const acquisition: Acquisition = {
    ...acquisitionCoreValue,
    acquisitionSha256: canonicalHash(acquisitionCore(acquisitionCoreValue)),
  }
  const inputs = manifests.map((manifest) => ({
    schema: 'zedarchive.anime-v2-primary-candidate-review-input',
    version: 2,
    candidateReceiptSha256: expectedReceiptSha256,
    manifest,
    records: manifest.qids.map((qid) => {
      const outcome = outcomes.find((value) => value.qid === qid)!
      return outcome.disposition === 'projected'
        ? {
            qid,
            candidateSha256: outcome.candidateSha256,
            manifestSha256: outcome.manifestSha256,
            projection: outcome.projection,
            projectionSha256: outcome.projection.projectionSha256,
            acquisitionOutcomeSha256:
              makeDraft(outcome).acquisitionOutcomeSha256,
          }
        : {
            qid,
            candidateSha256: outcome.candidateSha256,
            manifestSha256: outcome.manifestSha256,
            category: outcome.category,
            projectionSha256: null,
            acquisitionOutcomeSha256:
              makeDraft(outcome).acquisitionOutcomeSha256,
          }
    }),
  }))
  const inputWithHashes = inputs.map((input) => ({
    ...input,
    reviewInputSetSha256: canonicalHash(input),
  }))
  const drafts = manifests.map((manifest) => ({
    schema: 'zedarchive.anime-v2-primary-candidate-review-draft',
    version: 2,
    candidateReceiptSha256: expectedReceiptSha256,
    manifest,
    records: manifest.qids.map((qid) =>
      makeDraft(outcomes.find((outcome) => outcome.qid === qid)!),
    ),
  }))
  const safe = {
    schema: 'zedarchive.anime-v2-candidate-review-safe-aggregate',
    version: 2,
    candidates: receipt.candidates.length,
    manifests: manifests.length,
    projected: outcomes.filter(({ disposition }) => disposition === 'projected')
      .length,
    machineRejected: outcomes.filter(
      ({ disposition }) => disposition === 'machine-rejected',
    ).length,
    candidateReceiptSha256: expectedReceiptSha256,
    acquisitionSha256: acquisition.acquisitionSha256,
    manifestSetSha256: canonicalHash(manifests),
    sourceReceiptSha256: acquisition.sourceReceipt.sourceReceiptSha256,
  }
  return { acquisition, inputs: inputWithHashes, drafts, safe, candidateByQid }
}

async function writePreparedAtomically(
  files: ReturnType<typeof buildCandidatePreparationArtifacts>,
  directory = outputDirectory,
) {
  await mkdir(directory, { recursive: true })
  await assertCandidateReviewOutputVacant(directory)
  const staging = join(directory, '.prepare-staging')
  let created = false
  try {
    await mkdir(staging)
    created = true
    await mkdir(join(staging, 'manifests'))
    await writeFile(
      join(staging, 'acquisition.json'),
      `${JSON.stringify(files.acquisition, null, 2)}\n`,
      { flag: 'wx' },
    )
    await writeFile(
      join(staging, 'safe-aggregate.json'),
      `${JSON.stringify(files.safe, null, 2)}\n`,
      { flag: 'wx' },
    )
    for (const input of files.inputs) {
      const name = manifestName(input.manifest.ordinal)
      await writeFile(
        join(staging, 'manifests', `${name}-input.json`),
        `${JSON.stringify(input, null, 2)}\n`,
        { flag: 'wx' },
      )
      const draft = files.drafts[input.manifest.ordinal - 1]!
      await writeFile(
        join(staging, 'manifests', `${name}-draft.json`),
        `${JSON.stringify(draft, null, 2)}\n`,
        { flag: 'wx' },
      )
    }
    await rename(staging, preparedDirectory(directory))
  } catch (error) {
    if (created) await rm(staging, { recursive: true, force: true })
    throw error
  }
}

async function loadPrepared(
  directory = outputDirectory,
  fixtureReceipt?: Receipt,
) {
  const receipt = fixtureReceipt ?? (await readReceipt())
  let acquisition: Acquisition
  try {
    acquisition = acquisitionSchema.parse(
      await readJson(join(preparedDirectory(directory), 'acquisition.json')),
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw error
    throw safeError('prepared', 'acquisition-schema')
  }
  if (
    acquisition.candidateReceiptSha256 !== expectedReceiptSha256 ||
    canonicalHash(acquisitionCore(acquisition)) !==
      acquisition.acquisitionSha256
  )
    throw safeError('prepared', 'acquisition-hash')
  if (
    JSON.stringify(acquisition.manifests) !==
    JSON.stringify(deriveCandidateManifests(receipt))
  )
    throw safeError('prepared', 'manifest')
  const outcomes = acquisition.outcomes.map((outcome) =>
    candidateAcquisitionOutcomeSchema.parse(outcome),
  )
  if (
    outcomes.length !== receipt.candidates.length ||
    JSON.stringify(outcomes.map(({ qid }) => qid)) !==
      JSON.stringify(receipt.candidates.map(({ qid }) => qid))
  )
    throw safeError('prepared', 'outcomes')
  try {
    parseCandidateAcquisitionSourceReceiptForFixture(
      acquisition.sourceReceipt,
      receipt,
      expectedReceiptSha256,
    )
  } catch {
    throw safeError('prepared', 'source-receipt')
  }
  if (
    outcomes.some(
      (outcome) =>
        outcome.sourceReceiptSha256 !==
        acquisition.sourceReceipt.sourceReceiptSha256,
    )
  )
    throw safeError('prepared', 'outcome-source-receipt')
  return {
    receipt,
    acquisition: { ...acquisition, outcomes },
    manifests: deriveCandidateManifests(receipt),
  }
}

type PredecessorAuthorityContext = Readonly<{
  predecessorReviewResult: unknown
  exclusion: CandidatePredecessorExclusionAuthority
  candidateReviewRoundSha256: string
}>

function predecessorAuthorityFor(
  predecessorReviewResult: unknown,
  fixture = false,
): PredecessorAuthorityContext {
  const exclusion = fixture
    ? deriveCandidatePredecessorExclusionAuthorityForFixture(
        Array.isArray(predecessorReviewResult)
          ? predecessorReviewResult
          : Array.from({ length: 500 }, (_, index) => `Q${900_000 + index}`),
      )
    : deriveCandidatePredecessorExclusionAuthority(predecessorReviewResult)
  if (
    !fixture &&
    (exclusion.predecessorReviewResultSha256 !==
      expectedPredecessorReviewResultSha256 ||
      exclusion.retainedPredecessorIdentitySetSha256 !==
        expectedRetainedPredecessorIdentitySetSha256)
  )
    throw safeError('predecessor', 'accepted-result')
  return {
    predecessorReviewResult: fixture ? exclusion : predecessorReviewResult,
    exclusion,
    candidateReviewRoundSha256: deriveCandidateReviewRoundSha256({
      candidateReceiptSha256: expectedReceiptSha256,
      predecessorReviewResultSha256: exclusion.predecessorReviewResultSha256,
      retainedPredecessorIdentitySetSha256:
        exclusion.retainedPredecessorIdentitySetSha256,
      predecessorExclusionAuthoritySha256: exclusion.authoritySha256,
    }),
  }
}

async function loadAcceptedPredecessorAuthority(
  fixturePredecessorResult?: unknown,
): Promise<PredecessorAuthorityContext> {
  const fixture = fixturePredecessorResult !== undefined
  if (fixture && process.env.NODE_ENV !== 'test')
    throw new CandidateReviewCommandError(
      'Fixture predecessor authority is unavailable to live tooling.',
    )
  return predecessorAuthorityFor(
    fixture ? fixturePredecessorResult : await readJson(predecessorPath),
    fixture,
  )
}

function completedCore(value: z.infer<typeof completedResultSchema>) {
  return {
    schema: value.schema,
    version: value.version,
    candidateReceiptSha256: value.candidateReceiptSha256,
    predecessorReviewResultSha256: value.predecessorReviewResultSha256,
    retainedPredecessorIdentitySetSha256:
      value.retainedPredecessorIdentitySetSha256,
    predecessorExclusionAuthoritySha256:
      value.predecessorExclusionAuthoritySha256,
    candidateReviewRoundSha256: value.candidateReviewRoundSha256,
    verdictSha256: value.verdictSha256,
    manifest: value.manifest,
    reviewInputSha256: value.reviewInputSha256,
    records: value.records,
  }
}
function validateCompleted(
  result: unknown,
  manifest: CandidateManifest,
  predecessor: PredecessorAuthorityContext,
) {
  const completed = completedResultSchema.parse(result)
  if (
    JSON.stringify(completed.manifest) !== JSON.stringify(manifest) ||
    completed.predecessorReviewResultSha256 !==
      predecessor.exclusion.predecessorReviewResultSha256 ||
    completed.retainedPredecessorIdentitySetSha256 !==
      predecessor.exclusion.retainedPredecessorIdentitySetSha256 ||
    completed.predecessorExclusionAuthoritySha256 !==
      predecessor.exclusion.authoritySha256 ||
    completed.candidateReviewRoundSha256 !==
      predecessor.candidateReviewRoundSha256 ||
    completed.reviewInputSha256 !==
      canonicalHash(
        completed.records.map(({ reviewInputSha256 }) => reviewInputSha256),
      ) ||
    completed.completedResultSha256 !== canonicalHash(completedCore(completed))
  )
    throw safeError('lock', 'completed-hash')
  if (
    JSON.stringify(completed.records.map(({ qid }) => qid)) !==
    JSON.stringify(manifest.qids)
  )
    throw safeError('lock', 'record-order')
  for (const record of completed.records) {
    if (
      record.primaryReview === 'approved' &&
      record.machineValidation !== 'approved'
    )
      throw safeError('lock', 'auto-approval')
    if (
      predecessor.exclusion.qids.includes(record.qid) &&
      (record.duplicate !== 'rejected' || record.primaryReview !== 'rejected')
    )
      throw safeError('lock', 'predecessor-collision')
  }
  return completed
}
export function validateCandidateCompletedResultForFixture(
  result: unknown,
  manifest: CandidateManifest,
  predecessorReviewResult?: unknown,
) {
  if (predecessorReviewResult === undefined) {
    const completed = legacyCompletedResultSchema.parse(result)
    if (
      JSON.stringify(completed.manifest) !== JSON.stringify(manifest) ||
      completed.reviewInputSha256 !==
        canonicalHash(
          completed.records.map(({ reviewInputSha256 }) => reviewInputSha256),
        ) ||
      completed.completedResultSha256 !==
        canonicalHash(legacyCompletedCore(completed))
    )
      throw safeError('lock', 'completed-hash')
    if (
      completed.records.some(
        (record) =>
          record.primaryReview === 'approved' &&
          record.machineValidation !== 'approved',
      )
    )
      throw safeError('lock', 'auto-approval')
    return completed
  }
  return validateCompleted(
    result,
    manifest,
    predecessorAuthorityFor(predecessorReviewResult, true),
  )
}

async function materializeCandidateReviewManifest(
  manifestText: string,
  verdictInput: unknown,
  directory = outputDirectory,
  fixtureReceipt?: Receipt,
  fixturePredecessorResult?: unknown,
  predecessorOverride?: PredecessorAuthorityContext,
) {
  const prepared = await loadPrepared(directory, fixtureReceipt)
  const predecessor =
    predecessorOverride ??
    (await loadAcceptedPredecessorAuthority(fixturePredecessorResult))
  const manifest = prepared.manifests[Number(manifestText) - 1]
  if (!manifest || manifestName(manifest.ordinal) !== manifestText)
    throw safeError('complete', 'manifest')
  const verdict = roundVerdictSchema.parse(verdictInput)
  if (
    JSON.stringify(verdict.manifest) !== JSON.stringify(manifest) ||
    JSON.stringify(verdict.records.map(({ qid }) => qid)) !==
      JSON.stringify(manifest.qids)
  )
    throw safeError('complete', 'verdict-binding')
  if (
    verdict.predecessorReviewResultSha256 !==
      predecessor.exclusion.predecessorReviewResultSha256 ||
    verdict.retainedPredecessorIdentitySetSha256 !==
      predecessor.exclusion.retainedPredecessorIdentitySetSha256 ||
    verdict.predecessorExclusionAuthoritySha256 !==
      predecessor.exclusion.authoritySha256 ||
    verdict.candidateReviewRoundSha256 !==
      predecessor.candidateReviewRoundSha256
  )
    throw safeError('complete', 'predecessor-binding')
  const outcomes = new Map(
    prepared.acquisition.outcomes.map((outcome) => [outcome.qid, outcome]),
  )
  const records = verdict.records.map((decision) => {
    const outcome = outcomes.get(decision.qid)!
    const draft = makeDraft(outcome)
    if (outcome.disposition === 'machine-rejected') {
      if (decision.machineValidation !== 'rejected')
        throw safeError('complete', 'machine-rejected')
      if ('state' in draft) throw safeError('complete', 'machine-rejected')
      return draft
    }
    if (decision.machineValidation !== 'approved' || !('state' in draft))
      throw safeError('complete', 'machine-validation')
    const title =
      decision.title === null
        ? undefined
        : outcome.projection.titleCandidates.find(
            (candidate) =>
              candidate.source === decision.title!.source &&
              candidate.valueSha256 === decision.title!.valueSha256,
          )
    if ((decision.titleUsability === 'approved') !== (title !== undefined))
      throw safeError('complete', 'title')
    if (
      (outcome.projection.adultSignals.length === 0 &&
        decision.adultPublicationOutcome !== 'cleared') ||
      (outcome.projection.adultSignals.length > 0 &&
        decision.adultPublicationOutcome !== 'excluded')
    )
      throw safeError('complete', 'adult')
    const semantic = [
      decision.exactWorkIdentity,
      decision.mediaScope,
      decision.titleUsability,
      decision.format,
      decision.year,
      decision.episode,
      decision.status,
      decision.maturity,
      decision.duplicate,
      decision.relationship,
    ]
    const fullyApproved =
      semantic.every((value) => value === 'approved') &&
      decision.adultPublicationOutcome === 'cleared'
    if ((decision.primaryReview === 'approved') !== fullyApproved)
      throw safeError('complete', 'primary-review')
    if (
      predecessor.exclusion.qids.includes(decision.qid) &&
      (decision.duplicate !== 'rejected' ||
        decision.primaryReview !== 'rejected')
    )
      throw safeError('complete', 'predecessor-collision')
    const { state: _state, ...binding } = draft
    void _state
    return {
      ...binding,
      ...decision,
      adultSignals: outcome.projection.adultSignals,
    }
  })
  const core = {
    schema: 'zedarchive.anime-v2-primary-candidate-review-completed' as const,
    version: 3 as const,
    candidateReceiptSha256: expectedReceiptSha256,
    predecessorReviewResultSha256:
      predecessor.exclusion.predecessorReviewResultSha256,
    retainedPredecessorIdentitySetSha256:
      predecessor.exclusion.retainedPredecessorIdentitySetSha256,
    predecessorExclusionAuthoritySha256: predecessor.exclusion.authoritySha256,
    candidateReviewRoundSha256: predecessor.candidateReviewRoundSha256,
    verdictSha256: canonicalHash(verdict),
    manifest,
    reviewInputSha256: canonicalHash(
      records.map(({ reviewInputSha256 }) => reviewInputSha256),
    ),
    records,
  }
  const completed = { ...core, completedResultSha256: canonicalHash(core) }
  validateCompleted(completed, manifest, predecessor)
  return { completed, predecessor, manifest, verdict }
}

async function completeCandidateReviewManifestInternal(
  manifestText: string,
  directory = outputDirectory,
  fixtureReceipt?: Receipt,
  fixturePredecessorResult?: unknown,
) {
  await assertRecoveryClean(directory, 'complete')
  const prepared = await loadPrepared(directory, fixtureReceipt)
  const predecessor = await loadAcceptedPredecessorAuthority(
    fixturePredecessorResult,
  )
  const { audit } = await loadImmutableRecoveryAudit(
    directory,
    prepared,
    predecessor,
    'complete',
  )
  assertAcceptedRecoveryRound(
    audit,
    await validateRoundTwoScaffold(directory, audit, 'complete'),
    'complete',
  )
  await validateCanonicalRoundState(
    directory,
    prepared,
    predecessor,
    audit,
    'complete',
    Number(manifestText),
  )
  if (
    audit.recoveryAudit.manifests[Number(manifestText) - 1]?.disposition ===
    'valid'
  )
    throw safeError('complete', 'revalidated-manifest')
  const paths = canonicalRoundPaths(manifestText, directory)
  const materialized = await materializeCandidateReviewManifest(
    manifestText,
    await readJson(paths.verdict),
    directory,
    fixtureReceipt,
    fixturePredecessorResult,
  )
  await mkdir(roundCompletedDirectory(directory), { recursive: true })
  await writeFile(
    paths.completed,
    `${JSON.stringify(materialized.completed, null, 2)}\n`,
    { flag: 'wx' },
  )
}

export async function completeCandidateReviewManifest(manifest: string) {
  return completeCandidateReviewManifestInternal(manifest)
}
export async function completeCandidateReviewManifestForFixture(
  manifest: string,
  directoryOrVerdictPath: string,
  receiptOrCompletedPath: Receipt | string,
  predecessorOrDirectory?: unknown,
  legacyReceipt?: Receipt,
) {
  if (process.env.NODE_ENV !== 'test')
    throw new CandidateReviewCommandError(
      'Fixture candidate review completion is unavailable to live tooling.',
    )
  if (legacyReceipt !== undefined) {
    const verdict = verdictSchema.parse(await readJson(directoryOrVerdictPath))
    const directory = predecessorOrDirectory as string
    const authority = predecessorAuthorityFor({ fixture: true }, true)
    const materialized = await materializeCandidateReviewManifest(
      manifest,
      {
        ...verdict,
        version: 2,
        predecessorReviewResultSha256:
          authority.exclusion.predecessorReviewResultSha256,
        retainedPredecessorIdentitySetSha256:
          authority.exclusion.retainedPredecessorIdentitySetSha256,
        predecessorExclusionAuthoritySha256:
          authority.exclusion.authoritySha256,
        candidateReviewRoundSha256: authority.candidateReviewRoundSha256,
      },
      directory,
      legacyReceipt,
      { fixture: true },
    )
    await writeFile(
      receiptOrCompletedPath as string,
      `${JSON.stringify(materialized.completed, null, 2)}\n`,
      { flag: 'wx' },
    )
    return
  }
  return completeCandidateReviewManifestInternal(
    manifest,
    directoryOrVerdictPath,
    receiptOrCompletedPath as Receipt,
    predecessorOrDirectory,
  )
}

function predecessorReserveMetrics(
  predecessorResult: unknown,
  receipt: Receipt,
) {
  const predecessor = predecessorReviewResultSchema.parse(predecessorResult)
  const candidates = new Map(
    receipt.candidates.map((candidate) => [candidate.qid, candidate]),
  )
  const publishable = predecessor.records.filter(
    (record) =>
      record.currentItem.catalogueState === 'published' &&
      record.primaryReview === 'approved' &&
      record.independentReview === 'approved',
  )
  const formatCounts: Record<string, number> = {}
  const eraCounts: Record<string, number> = {}
  let unknown = 0
  let audience = 0
  for (const record of publishable) {
    const candidate = candidates.get(record.sourceItemId)
    if (candidate) {
      formatCounts[candidate.format] = (formatCounts[candidate.format] ?? 0) + 1
      eraCounts[candidate.era] = (eraCounts[candidate.era] ?? 0) + 1
      if (candidate.era === 'unknown') unknown += 1
      if (
        candidate.englishBand !== 'unavailable' ||
        candidate.japaneseBand !== 'unavailable'
      )
        audience += 1
    } else {
      formatCounts[record.currentItem.format] =
        (formatCounts[record.currentItem.format] ?? 0) + 1
      const year = record.currentItem.releaseYear
      const era =
        year === null
          ? 'unknown'
          : year < 1980
            ? 'before-1980'
            : year < 1990
              ? '1980-1989'
              : year < 2000
                ? '1990-1999'
                : year < 2010
                  ? '2000-2009'
                  : year < 2020
                    ? '2010-2019'
                    : year <= 2026
                      ? '2020-2026'
                      : 'after-2026'
      eraCounts[era] = (eraCounts[era] ?? 0) + 1
      if (era === 'unknown') unknown += 1
    }
  }
  return {
    qids: publishable.map(({ sourceItemId }) => sourceItemId),
    retainedQids: predecessor.records.map(({ sourceItemId }) => sourceItemId),
    formatCounts,
    eraCounts,
    unknown,
    audience,
  }
}

type FixtureLockOptions = Readonly<{
  receipt: Receipt
  predecessorMetrics: Omit<
    ReturnType<typeof predecessorReserveMetrics>,
    'retainedQids'
  > & {
    retainedQids?: string[]
  }
  predecessorReviewResult?: unknown
  predecessorCollisionAuditSha256?: string
  phaseObserver?: (phase: CandidateReviewLockTerminalPhase) => void
  reserve: Omit<
    Parameters<typeof assertCandidateReviewReserveFeasibility>[2],
    | 'publishablePredecessorCount'
    | 'publishablePredecessorQids'
    | 'predecessorFormatCounts'
    | 'predecessorEraCounts'
    | 'predecessorAudienceCount'
    | 'predecessorUnknownYearCount'
    | 'retainedPredecessorQids'
  >
}>

async function lockCandidateReviewManifestInternal(
  manifestText: string,
  directory = outputDirectory,
  fixture?: FixtureLockOptions,
) {
  setCandidateReviewLockTerminalPhase('recovery-clean', fixture?.phaseObserver)
  await assertRecoveryClean(directory, 'lock')
  const ordinal = Number(manifestText)
  setCandidateReviewLockTerminalPhase(
    'prepared-authority',
    fixture?.phaseObserver,
  )
  const prepared = await loadPrepared(directory, fixture?.receipt)
  setCandidateReviewLockTerminalPhase(
    'target-admission',
    fixture?.phaseObserver,
  )
  const manifest = prepared.manifests[ordinal - 1]
  if (!manifest || manifestName(manifest.ordinal) !== manifestText)
    throw safeError('lock', 'manifest')
  setCandidateReviewLockTerminalPhase(
    'predecessor-authority',
    fixture?.phaseObserver,
  )
  const predecessorForAudit = await loadAcceptedPredecessorAuthority(
    fixture?.predecessorReviewResult ??
      (fixture ? { fixture: true } : undefined),
  )
  setCandidateReviewLockTerminalPhase('recovery-audit', fixture?.phaseObserver)
  const { audit } = await loadImmutableRecoveryAudit(
    directory,
    prepared,
    predecessorForAudit,
    'lock',
  )
  setCandidateReviewLockTerminalPhase('round-scaffold', fixture?.phaseObserver)
  assertAcceptedRecoveryRound(
    audit,
    await validateRoundTwoScaffold(directory, audit, 'lock'),
    'lock',
  )
  setCandidateReviewLockTerminalPhase(
    'canonical-round-state',
    fixture?.phaseObserver,
  )
  await validateCanonicalRoundState(
    directory,
    prepared,
    predecessorForAudit,
    audit,
    'lock',
    ordinal,
  )
  setCandidateReviewLockTerminalPhase(
    'target-admission',
    fixture?.phaseObserver,
  )
  if (audit.recoveryAudit.manifests[ordinal - 1]?.disposition === 'valid')
    throw safeError('lock', 'revalidated-manifest')
  const paths = canonicalRoundPaths(manifestText, directory)
  const lockPath = paths.lock
  setCandidateReviewLockTerminalPhase('existing-locks', fixture?.phaseObserver)
  try {
    await readFile(lockPath)
    throw new CandidateReviewCommandError(
      'Candidate review lock already exists; no overwrite is allowed.',
    )
  } catch (error) {
    if (
      error instanceof CandidateReviewCommandError ||
      (error as NodeJS.ErrnoException).code !== 'ENOENT'
    )
      throw error
  }
  setCandidateReviewLockTerminalPhase(
    'verdict-materialization',
    fixture?.phaseObserver,
  )
  const materialized = await materializeCandidateReviewManifest(
    manifestText,
    await readJson(paths.verdict),
    directory,
    fixture?.receipt,
    fixture?.predecessorReviewResult ??
      (fixture ? { fixture: true } : undefined),
  )
  setCandidateReviewLockTerminalPhase(
    'completed-canonical',
    fixture?.phaseObserver,
  )
  const completedText = await readFile(paths.completed, 'utf8')
  if (completedText !== `${JSON.stringify(materialized.completed, null, 2)}\n`)
    throw safeError('lock', 'completed-canonical')
  const predecessor = materialized.predecessor
  const predecessorCollisionAuditSha256 = audit.auditSha256
  setCandidateReviewLockTerminalPhase(
    'lock-construction',
    fixture?.phaseObserver,
  )
  const completed = validateCompleted(
    JSON.parse(completedText) as unknown,
    manifest,
    predecessor,
  )
  const lock = createLockedCandidateReviewManifest({
    schema: 'zedarchive.anime-v2-primary-candidate-review-lock',
    version: 3,
    candidateReceiptSha256: expectedReceiptSha256,
    predecessorReviewResultSha256:
      predecessor.exclusion.predecessorReviewResultSha256,
    retainedPredecessorIdentitySetSha256:
      predecessor.exclusion.retainedPredecessorIdentitySetSha256,
    predecessorExclusionAuthoritySha256: predecessor.exclusion.authoritySha256,
    predecessorCollisionAuditSha256,
    candidateReviewRoundSha256: predecessor.candidateReviewRoundSha256,
    verdictSha256: canonicalHash(materialized.verdict),
    completedResultSha256: completed.completedResultSha256,
    manifest,
    records: completed.records,
  })
  setCandidateReviewLockTerminalPhase('existing-locks', fixture?.phaseObserver)
  const locked = await loadLockedRecords(
    prepared.manifests,
    directory,
    new Map([[ordinal, lock]]),
  )
  setCandidateReviewLockTerminalPhase(
    'predecessor-reserve',
    fixture?.phaseObserver,
  )
  const metrics =
    fixture?.predecessorMetrics ??
    predecessorReserveMetrics(
      predecessor.predecessorReviewResult,
      prepared.receipt,
    )
  setCandidateReviewLockTerminalPhase(
    'reserve-feasibility',
    fixture?.phaseObserver,
  )
  assertCandidateReviewReserveFeasibility(prepared.receipt, locked, {
    publishedTarget: fixture?.reserve.publishedTarget ?? 5_000,
    publishablePredecessorCount: metrics.qids.length,
    publishablePredecessorQids: metrics.qids,
    retainedPredecessorQids: metrics.retainedQids ?? predecessor.exclusion.qids,
    predecessorFormatCounts: metrics.formatCounts,
    predecessorEraCounts: metrics.eraCounts,
    predecessorAudienceCount: metrics.audience,
    predecessorUnknownYearCount: metrics.unknown,
    audienceAnchorCount: fixture?.reserve.audienceAnchorCount ?? 250,
    unknownYearMaximum: fixture?.reserve.unknownYearMaximum ?? 250,
    formatFloors:
      fixture?.reserve.formatFloors ?? discoveryCoverageFloors.formats,
    eraFloors: fixture?.reserve.eraFloors ?? discoveryCoverageFloors.eras,
  })
  setCandidateReviewLockTerminalPhase(
    'atomic-lock-write',
    fixture?.phaseObserver,
  )
  await mkdir(roundLocksDirectory(directory), { recursive: true })
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, {
    flag: 'wx',
  })
}

export async function lockCandidateReviewManifest(
  manifestText: string,
  directory = outputDirectory,
) {
  return lockCandidateReviewManifestInternal(manifestText, directory)
}

export async function lockCandidateReviewManifestForFixture(
  manifestText: string,
  directoryOrCompletedPath: string,
  fixtureOrDirectory: FixtureLockOptions | string,
  legacyFixture?: FixtureLockOptions,
) {
  if (process.env.NODE_ENV !== 'test')
    throw new CandidateReviewCommandError(
      'Fixture candidate review locking is unavailable to live tooling.',
    )
  if (legacyFixture !== undefined) {
    const completed = legacyCompletedResultSchema.parse(
      await readJson(directoryOrCompletedPath),
    )
    const directory = fixtureOrDirectory as string
    const path = join(
      roundLocksDirectory(directory),
      `${manifestText}.locked.json`,
    )
    await mkdir(roundLocksDirectory(directory), { recursive: true })
    const authority = predecessorAuthorityFor({ fixture: true }, true)
    const metrics = legacyFixture.predecessorMetrics
    assertCandidateReviewReserveFeasibility(
      legacyFixture.receipt,
      completed.records,
      {
        publishedTarget: legacyFixture.reserve.publishedTarget,
        publishablePredecessorCount: metrics.qids.length,
        publishablePredecessorQids: metrics.qids,
        retainedPredecessorQids:
          metrics.retainedQids ?? authority.exclusion.qids,
        predecessorFormatCounts: metrics.formatCounts,
        predecessorEraCounts: metrics.eraCounts,
        predecessorAudienceCount: metrics.audience,
        predecessorUnknownYearCount: metrics.unknown,
        audienceAnchorCount: legacyFixture.reserve.audienceAnchorCount,
        unknownYearMaximum: legacyFixture.reserve.unknownYearMaximum,
        formatFloors: legacyFixture.reserve.formatFloors,
        eraFloors: legacyFixture.reserve.eraFloors,
      },
    )
    const lock = createLockedCandidateReviewManifest({
      schema: 'zedarchive.anime-v2-primary-candidate-review-lock',
      version: 3,
      candidateReceiptSha256: expectedReceiptSha256,
      predecessorReviewResultSha256:
        authority.exclusion.predecessorReviewResultSha256,
      retainedPredecessorIdentitySetSha256:
        authority.exclusion.retainedPredecessorIdentitySetSha256,
      predecessorExclusionAuthoritySha256: authority.exclusion.authoritySha256,
      predecessorCollisionAuditSha256: canonicalHash({ fixture: true }),
      candidateReviewRoundSha256: authority.candidateReviewRoundSha256,
      verdictSha256: canonicalHash({ fixture: true, manifestText }),
      completedResultSha256: completed.completedResultSha256,
      manifest: completed.manifest,
      records: completed.records,
    })
    try {
      await writeFile(path, `${JSON.stringify(lock, null, 2)}\n`, {
        flag: 'wx',
      })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST')
        throw new CandidateReviewCommandError(
          'Candidate review lock already exists; no overwrite is allowed.',
        )
      throw error
    }
    return
  }
  return lockCandidateReviewManifestInternal(
    manifestText,
    directoryOrCompletedPath,
    fixtureOrDirectory as FixtureLockOptions,
  )
}

async function loadLockedRecords(
  manifests: readonly CandidateManifest[],
  directory: string,
  pending = new Map<
    number,
    ReturnType<typeof createLockedCandidateReviewManifest>
  >(),
) {
  const records: ReviewRecord[] = []
  for (const manifest of manifests) {
    const lock =
      pending.get(manifest.ordinal) ??
      (await (async () => {
        try {
          return JSON.parse(
            await readFile(
              join(
                roundLocksDirectory(directory),
                `${manifestName(manifest.ordinal)}.locked.json`,
              ),
              'utf8',
            ),
          ) as ReturnType<typeof createLockedCandidateReviewManifest>
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT')
            return undefined
          throw error
        }
      })())
    if (lock) records.push(...lock.records)
  }
  return records
}

type CollisionAuditManifest = Readonly<{
  ordinal: number
  manifestSha256: string
  collisionCount: number
  collisionSetSha256: string
  verdictSha256: string | null
  verdictBytes: number | null
  completedResultSha256: string | null
  completedResultBytes: number | null
  lockedResultSha256: string | null
  lockedResultBytes: number | null
  status: 'missing' | 'valid' | 'requires-quarantine'
}>

function byteSha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

async function optionalText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

async function assertFlatInventory(
  directory: string,
  suffix: string,
): Promise<Set<string>> {
  let entries: string[]
  try {
    entries = await readdir(directory)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Set()
    throw error
  }
  if (entries.some((entry) => !new RegExp(`^[0-9]{3}${suffix}$`).test(entry)))
    throw safeError('audit', 'unknown-file')
  return new Set(entries)
}

async function assertLegacyRootInventory(directory: string): Promise<void> {
  const entries = await readdir(directory)
  const allowed = new Set([
    'prepared',
    'verdicts',
    'completed',
    'locks',
    'rejected',
  ])
  if (entries.some((entry) => !allowed.has(entry)))
    throw safeError('audit', 'unknown-file')
}

function legacyCompletedCore(
  value: z.infer<typeof legacyCompletedResultSchema>,
) {
  return {
    schema: value.schema,
    version: value.version,
    candidateReceiptSha256: value.candidateReceiptSha256,
    manifest: value.manifest,
    reviewInputSha256: value.reviewInputSha256,
    records: value.records,
  }
}

async function materializeLegacyManifest(
  manifestText: string,
  prepared: Awaited<ReturnType<typeof loadPrepared>>,
  predecessor: PredecessorAuthorityContext,
  directory: string,
) {
  const manifest = prepared.manifests[Number(manifestText) - 1]
  if (!manifest) throw safeError('audit', 'manifest')
  const verdictText = await optionalText(
    join(legacyVerdictsDirectory(directory), `${manifestText}.json`),
  )
  const completedText = await optionalText(
    join(legacyCompletedDirectory(directory), `${manifestText}.json`),
  )
  const lockText = await optionalText(
    join(locksDirectory(directory), `${manifestText}.locked.json`),
  )
  if (
    (completedText !== undefined && verdictText === undefined) ||
    (lockText !== undefined && verdictText === undefined) ||
    (lockText !== undefined && completedText === undefined)
  )
    throw safeError('audit', 'legacy-partial')
  if (verdictText !== undefined) {
    const verdict = verdictSchema.parse(JSON.parse(verdictText) as unknown)
    if (JSON.stringify(verdict.manifest) !== JSON.stringify(manifest))
      throw safeError('audit', 'legacy-manifest')
    const roundVerdict = {
      ...verdict,
      version: 2 as const,
      predecessorReviewResultSha256:
        predecessor.exclusion.predecessorReviewResultSha256,
      retainedPredecessorIdentitySetSha256:
        predecessor.exclusion.retainedPredecessorIdentitySetSha256,
      predecessorExclusionAuthoritySha256:
        predecessor.exclusion.authoritySha256,
      candidateReviewRoundSha256: predecessor.candidateReviewRoundSha256,
    }
    const semanticPredecessor = {
      ...predecessor,
      exclusion: { ...predecessor.exclusion, qids: [] },
    }
    await materializeCandidateReviewManifest(
      manifestText,
      roundVerdict,
      directory,
      prepared.receipt,
      semanticPredecessor.predecessorReviewResult,
      semanticPredecessor,
    )
  }
  if (completedText !== undefined) {
    const completed = legacyCompletedResultSchema.parse(
      JSON.parse(completedText) as unknown,
    )
    if (
      JSON.stringify(completed.manifest) !== JSON.stringify(manifest) ||
      completed.completedResultSha256 !==
        canonicalHash(legacyCompletedCore(completed))
    )
      throw safeError('audit', 'legacy-completed')
  }
  if (lockText !== undefined) {
    const lock = z
      .strictObject({
        schema: z.literal('zedarchive.anime-v2-primary-candidate-review-lock'),
        version: z.literal(2),
        candidateReceiptSha256: z.literal(expectedReceiptSha256),
        manifest: candidateManifestSchema,
        records: z.array(candidatePrimaryReviewRecordSchema).min(1).max(50),
        lockedResultSha256: shaSchema,
      })
      .parse(JSON.parse(lockText) as unknown)
    const core = {
      schema: lock.schema,
      version: lock.version,
      candidateReceiptSha256: lock.candidateReceiptSha256,
      manifest: lock.manifest,
      records: lock.records,
    }
    if (
      JSON.stringify(lock.manifest) !== JSON.stringify(manifest) ||
      lock.lockedResultSha256 !== canonicalHash(core)
    )
      throw safeError('audit', 'legacy-lock')
  }
  if (!verdictText && !completedText && !lockText)
    return { manifest, verdictText, completedText, lockText, legacy: undefined }
  if (verdictText !== undefined && completedText !== undefined) {
    const verdict = verdictSchema.parse(JSON.parse(verdictText) as unknown)
    const completed = legacyCompletedResultSchema.parse(
      JSON.parse(completedText) as unknown,
    )
    const roundVerdict = {
      ...verdict,
      version: 2 as const,
      predecessorReviewResultSha256:
        predecessor.exclusion.predecessorReviewResultSha256,
      retainedPredecessorIdentitySetSha256:
        predecessor.exclusion.retainedPredecessorIdentitySetSha256,
      predecessorExclusionAuthoritySha256:
        predecessor.exclusion.authoritySha256,
      candidateReviewRoundSha256: predecessor.candidateReviewRoundSha256,
    }
    const semanticPredecessor = {
      ...predecessor,
      exclusion: { ...predecessor.exclusion, qids: [] },
    }
    const materialized = await materializeCandidateReviewManifest(
      manifestText,
      roundVerdict,
      directory,
      prepared.receipt,
      semanticPredecessor.predecessorReviewResult,
      semanticPredecessor,
    )
    if (
      completed.reviewInputSha256 !==
        materialized.completed.reviewInputSha256 ||
      JSON.stringify(completed.records.map(canonicalHash)) !==
        JSON.stringify(materialized.completed.records.map(canonicalHash))
    )
      throw safeError('audit', 'legacy-completed')
  }
  if (!verdictText || !completedText || !lockText)
    return { manifest, verdictText, completedText, lockText, legacy: undefined }
  const verdict = verdictSchema.parse(JSON.parse(verdictText) as unknown)
  const roundVerdict = {
    ...verdict,
    version: 2 as const,
    predecessorReviewResultSha256:
      predecessor.exclusion.predecessorReviewResultSha256,
    retainedPredecessorIdentitySetSha256:
      predecessor.exclusion.retainedPredecessorIdentitySetSha256,
    predecessorExclusionAuthoritySha256: predecessor.exclusion.authoritySha256,
    candidateReviewRoundSha256: predecessor.candidateReviewRoundSha256,
  }
  // Audit re-derives legacy bindings without granting a collision-invalid v2
  // record a v3 completion. The explicit collision outcome is classified below.
  const legacySemanticPredecessor = {
    ...predecessor,
    exclusion: { ...predecessor.exclusion, qids: [] },
  }
  const materialized = await materializeCandidateReviewManifest(
    manifestText,
    roundVerdict,
    directory,
    prepared.receipt,
    legacySemanticPredecessor.predecessorReviewResult,
    legacySemanticPredecessor,
  )
  const completed = legacyCompletedResultSchema.parse(
    JSON.parse(completedText) as unknown,
  )
  if (JSON.stringify(completed.manifest) !== JSON.stringify(manifest))
    throw safeError('audit', 'legacy-manifest')
  if (
    completed.completedResultSha256 !==
    canonicalHash(legacyCompletedCore(completed))
  )
    throw safeError('audit', 'legacy-completed-hash')
  for (const [index, record] of completed.records.entries())
    if (
      canonicalHash(record) !==
      canonicalHash(materialized.completed.records[index])
    )
      throw safeError('audit', `legacy-record-${index}`)
  const legacyLock = z
    .strictObject({
      schema: z.literal('zedarchive.anime-v2-primary-candidate-review-lock'),
      version: z.literal(2),
      candidateReceiptSha256: z.literal(expectedReceiptSha256),
      manifest: candidateManifestSchema,
      records: z.array(candidatePrimaryReviewRecordSchema).min(1).max(50),
      lockedResultSha256: shaSchema,
    })
    .parse(JSON.parse(lockText) as unknown)
  const legacyLockCore = {
    schema: legacyLock.schema,
    version: legacyLock.version,
    candidateReceiptSha256: legacyLock.candidateReceiptSha256,
    manifest: legacyLock.manifest,
    records: legacyLock.records,
  }
  if (
    legacyLock.lockedResultSha256 !== canonicalHash(legacyLockCore) ||
    JSON.stringify(legacyLock.manifest) !== JSON.stringify(manifest) ||
    JSON.stringify(legacyLock.records) !== JSON.stringify(completed.records)
  )
    throw safeError('audit', 'legacy-lock')
  return {
    manifest,
    verdictText,
    completedText,
    lockText,
    legacy: { verdict, completed, legacyLock, materialized },
  }
}

export async function auditCandidatePredecessorCollisionsForFixture(
  directory: string,
  receipt: Receipt,
  predecessorReviewResult: unknown,
) {
  if (process.env.NODE_ENV !== 'test')
    throw new CandidateReviewCommandError(
      'Fixture candidate review audit is unavailable to live tooling.',
    )
  return auditCandidatePredecessorCollisions(
    directory,
    receipt,
    predecessorReviewResult,
  )
}

async function auditCandidatePredecessorCollisions(
  directory = outputDirectory,
  fixtureReceipt?: Receipt,
  fixturePredecessorResult?: unknown,
) {
  const prepared = await loadPrepared(directory, fixtureReceipt)
  const predecessor = await loadAcceptedPredecessorAuthority(
    fixturePredecessorResult,
  )
  await assertLegacyRootInventory(directory)
  if (await pathExists(join(directory, 'verdict')))
    throw safeError('audit', 'unknown-file')
  const [verdicts, completed, locks] = await Promise.all([
    assertFlatInventory(legacyVerdictsDirectory(directory), '\\.json'),
    assertFlatInventory(legacyCompletedDirectory(directory), '\\.json'),
    assertFlatInventory(locksDirectory(directory), '\\.locked\\.json'),
  ])
  const rows: CollisionAuditManifest[] = []
  let collisionRecords = 0
  let collisionManifests = 0
  for (const manifest of prepared.manifests) {
    const text = manifestName(manifest.ordinal)
    const materialized = await materializeLegacyManifest(
      text,
      prepared,
      predecessor,
      directory,
    )
    const collisions = manifest.qids.filter((qid) =>
      predecessor.exclusion.qids.includes(qid),
    )
    collisionRecords += collisions.length
    if (collisions.length > 0) collisionManifests += 1
    const present = [
      materialized.verdictText,
      materialized.completedText,
      materialized.lockText,
    ].filter((value) => value !== undefined).length
    const collisionValid =
      materialized.legacy !== undefined &&
      materialized.legacy.completed.records
        .filter((record) => predecessor.exclusion.qids.includes(record.qid))
        .every(
          (record) =>
            record.duplicate === 'rejected' &&
            record.primaryReview === 'rejected',
        )
    rows.push({
      ordinal: manifest.ordinal,
      manifestSha256: manifest.manifestSha256,
      collisionCount: collisions.length,
      collisionSetSha256: canonicalHash(collisions),
      verdictSha256:
        materialized.verdictText === undefined
          ? null
          : byteSha256(materialized.verdictText),
      verdictBytes:
        materialized.verdictText === undefined
          ? null
          : Buffer.byteLength(materialized.verdictText),
      completedResultSha256:
        materialized.completedText === undefined
          ? null
          : byteSha256(materialized.completedText),
      completedResultBytes:
        materialized.completedText === undefined
          ? null
          : Buffer.byteLength(materialized.completedText),
      lockedResultSha256:
        materialized.lockText === undefined
          ? null
          : byteSha256(materialized.lockText),
      lockedResultBytes:
        materialized.lockText === undefined
          ? null
          : Buffer.byteLength(materialized.lockText),
      status:
        present === 0
          ? 'missing'
          : materialized.legacy !== undefined && collisionValid
            ? 'valid'
            : 'requires-quarantine',
    })
  }
  const expectedFiles = new Set(
    prepared.manifests.map((manifest) => manifestName(manifest.ordinal)),
  )
  for (const names of [verdicts, completed, locks])
    if ([...names].some((name) => !expectedFiles.has(name.slice(0, 3))))
      throw safeError('audit', 'unknown-file')
  if (
    !fixtureReceipt &&
    (collisionRecords !== 499 || collisionManifests !== 154)
  )
    throw safeError('audit', 'collision-count')
  const summary = {
    missing: rows.filter(({ status }) => status === 'missing').length,
    valid: rows.filter(({ status }) => status === 'valid').length,
    requiresQuarantine: rows.filter(
      ({ status }) => status === 'requires-quarantine',
    ).length,
  }
  if (
    !fixtureReceipt &&
    (verdicts.size !== 115 ||
      completed.size !== 115 ||
      locks.size !== 100 ||
      summary.valid !== 41 ||
      summary.requiresQuarantine !== 74 ||
      summary.missing !== 45)
  )
    throw safeError('audit', 'current-classification')
  const core = {
    schema:
      'zedarchive.anime-v2-candidate-predecessor-collision-audit' as const,
    version: 1 as const,
    candidateReceiptSha256: expectedReceiptSha256,
    acquisitionSha256: prepared.acquisition.acquisitionSha256,
    predecessorReviewResultSha256:
      predecessor.exclusion.predecessorReviewResultSha256,
    retainedPredecessorIdentitySetSha256:
      predecessor.exclusion.retainedPredecessorIdentitySetSha256,
    predecessorExclusionAuthoritySha256: predecessor.exclusion.authoritySha256,
    records: prepared.receipt.candidates.length,
    manifests: prepared.manifests.length,
    collisionRecords,
    collisionManifests,
    artifactCounts: {
      verdicts: verdicts.size,
      completed: completed.size,
      locks: locks.size,
    },
    classifications: summary,
    manifestResults: rows,
    recoveryAudit: createCandidateRecoveryCollisionGeometry(
      prepared.receipt,
      expectedReceiptSha256,
      predecessor.predecessorReviewResult,
      rows.map(({ ordinal, manifestSha256, status }) => ({
        ordinal,
        manifestSha256,
        disposition:
          status === 'valid'
            ? ('valid' as const)
            : status === 'requires-quarantine'
              ? ('requires-quarantine' as const)
              : ('missing' as const),
      })),
      fixtureReceipt === undefined
        ? undefined
        : { allowSyntheticLineage: true },
    ),
  }
  return candidateRecoveryCollisionAuditSchema.parse({
    ...core,
    auditSha256: canonicalHash(core),
  })
}

async function loadImmutableRecoveryAudit(
  directory: string,
  prepared: Awaited<ReturnType<typeof loadPrepared>>,
  predecessor: PredecessorAuthorityContext,
  stage = 'lock',
) {
  let audit: Awaited<ReturnType<typeof auditCandidatePredecessorCollisions>>
  try {
    audit = JSON.parse(
      await readFile(auditPath(directory), 'utf8'),
    ) as typeof audit
  } catch {
    throw safeError(stage, 'recovery-audit')
  }
  const { auditSha256, ...core } = audit
  if (
    auditSha256 !== canonicalHash(core) ||
    audit.candidateReceiptSha256 !== expectedReceiptSha256 ||
    audit.acquisitionSha256 !== prepared.acquisition.acquisitionSha256 ||
    audit.predecessorReviewResultSha256 !==
      predecessor.exclusion.predecessorReviewResultSha256 ||
    audit.retainedPredecessorIdentitySetSha256 !==
      predecessor.exclusion.retainedPredecessorIdentitySetSha256 ||
    audit.predecessorExclusionAuthoritySha256 !==
      predecessor.exclusion.authoritySha256
  )
    throw safeError(stage, 'recovery-audit')
  try {
    const recoveryAudit = validateCandidateRecoveryCollisionAudit(
      audit,
      prepared.receipt,
      expectedReceiptSha256,
      predecessor.predecessorReviewResult,
      process.env.NODE_ENV === 'test'
        ? { allowSyntheticLineage: true }
        : undefined,
    )
    if (
      recoveryAudit.recoveryAudit.candidateReviewRoundSha256 !==
      predecessor.candidateReviewRoundSha256
    )
      throw new Error('round mismatch')
    return { audit: recoveryAudit }
  } catch {
    throw safeError(stage, 'recovery-audit')
  }
}

type RecoveryCustodyFilePlan = Readonly<{
  name: 'verdict' | 'completed' | 'lock'
  sourcePath: string
  destinationPath: string
  sha256: string
  bytes: number
}>

type RecoveryCustodyPlan = Readonly<{
  ordinal: number
  manifestSha256: string
  destinationDirectory: string
  files: readonly RecoveryCustodyFilePlan[]
  ledgerSha256: string
}>

type RecoveryRevalidationPlan = Readonly<{
  ordinal: number
  lockPath: string
  lockSha256: string
  lockBytes: number
  revalidationPath: string
  revalidationSha256: string
  revalidationBytes: number
}>

type RecoveryJournal = Readonly<{
  schema: 'zedarchive.anime-v2-candidate-review-recovery-journal'
  version: 1
  auditSha256: string
  quarantineOrdinals: readonly number[]
  revalidateOrdinals: readonly number[]
  audit: Awaited<ReturnType<typeof auditCandidatePredecessorCollisions>>
  custody: readonly RecoveryCustodyPlan[]
  revalidations: readonly RecoveryRevalidationPlan[]
  journalSha256: string
}>

const recoveryJournalSchema = z.strictObject({
  schema: z.literal('zedarchive.anime-v2-candidate-review-recovery-journal'),
  version: z.literal(1),
  auditSha256: shaSchema,
  quarantineOrdinals: z.array(z.number().int().positive()),
  revalidateOrdinals: z.array(z.number().int().positive()),
  audit: candidateRecoveryCollisionAuditSchema,
  custody: z.array(
    z.strictObject({
      ordinal: z.number().int().positive(),
      manifestSha256: shaSchema,
      destinationDirectory: z.string(),
      files: z.array(
        z.strictObject({
          name: z.enum(['verdict', 'completed', 'lock']),
          sourcePath: z.string(),
          destinationPath: z.string(),
          sha256: shaSchema,
          bytes: z.number().int().nonnegative(),
        }),
      ),
      ledgerSha256: shaSchema,
    }),
  ),
  revalidations: z.array(
    z.strictObject({
      ordinal: z.number().int().positive(),
      lockPath: z.string(),
      lockSha256: shaSchema,
      lockBytes: z.number().int().nonnegative(),
      revalidationPath: z.string(),
      revalidationSha256: shaSchema,
      revalidationBytes: z.number().int().nonnegative(),
    }),
  ),
  journalSha256: shaSchema,
})

function parseRecoveryJournal(text: string): RecoveryJournal {
  try {
    const journal = recoveryJournalSchema.parse(JSON.parse(text))
    const { journalSha256, ...core } = journal
    if (journalSha256 !== canonicalHash(core))
      throw new Error('journal hash mismatch')
    return journal as RecoveryJournal
  } catch {
    throw safeError('recovery', 'frozen-plan')
  }
}

function recoveryJournalCore(journal: RecoveryJournal) {
  const { journalSha256: _hash, ...core } = journal
  void _hash
  return core
}

function validateFrozenRecoveryJournal(
  journal: RecoveryJournal,
  immutableAudit: Awaited<
    ReturnType<typeof auditCandidatePredecessorCollisions>
  >,
  prepared: Awaited<ReturnType<typeof loadPrepared>>,
  predecessor: PredecessorAuthorityContext,
) {
  try {
    const audit = validateCandidateRecoveryCollisionAudit(
      immutableAudit,
      prepared.receipt,
      expectedReceiptSha256,
      predecessor.predecessorReviewResult,
    )
    if (
      JSON.stringify(journal.audit) !== JSON.stringify(immutableAudit) ||
      audit.auditSha256 !== journal.auditSha256 ||
      audit.acquisitionSha256 !== prepared.acquisition.acquisitionSha256
    )
      throw new Error('journal authority mismatch')
  } catch {
    throw safeError('recovery', 'frozen-plan')
  }
}

function validateExpectedRecoveryJournal(
  journal: RecoveryJournal,
  expected: RecoveryJournal,
) {
  if (
    journal.journalSha256 !== canonicalHash(recoveryJournalCore(journal)) ||
    journal.auditSha256 !== expected.auditSha256 ||
    canonicalHash(journal.quarantineOrdinals) !==
      canonicalHash(expected.quarantineOrdinals) ||
    canonicalHash(journal.revalidateOrdinals) !==
      canonicalHash(expected.revalidateOrdinals) ||
    canonicalHash(journal.custody) !== canonicalHash(expected.custody) ||
    canonicalHash(journal.revalidations) !==
      canonicalHash(expected.revalidations)
  )
    throw safeError('recovery', 'frozen-plan')
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await readdir(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

type CorrectedFinalizationExpectation = Readonly<{
  activeAuditSha256: string
  activeAuditFileSha256: string
  closureSha256: string
  closureFileSha256: string
  candidateReceiptSha256: string
  predecessorReviewResultSha256: string
  records: number
  manifests: number
  locks: number
  approved: number
  rejected: number
  collisions: number
  revalidated: number
  fresh: number
}>

const liveCorrectedFinalizationExpectation: CorrectedFinalizationExpectation = {
  activeAuditSha256: expectedCorrectedActiveAuditSha256,
  activeAuditFileSha256: expectedCorrectedActiveAuditFileSha256,
  closureSha256: expectedCorrectedClosureSha256,
  closureFileSha256: expectedCorrectedClosureFileSha256,
  candidateReceiptSha256: expectedReceiptSha256,
  predecessorReviewResultSha256: expectedPredecessorReviewResultSha256,
  records: 7_958,
  manifests: 160,
  locks: 160,
  approved: 6_444,
  rejected: 1_514,
  collisions: 499,
  revalidated: 41,
  fresh: 119,
}

async function assertCorrectedCandidateFinalizationPreflightInternal(
  directory: string,
  expected: CorrectedFinalizationExpectation,
): Promise<void> {
  const [closureText, activeAuditText] = await Promise.all([
    optionalText(correctedClosurePath(directory)),
    optionalText(activeAuditPath(directory)),
  ])
  if (closureText === undefined || activeAuditText === undefined)
    throw safeError('finalize', 'corrected-authority')
  let closure: CorrectedCandidateClosure
  let activeAudit: CandidateActiveCollisionAudit
  try {
    closure = correctedCandidateClosureSchema.parse(JSON.parse(closureText))
    activeAudit = candidateActiveCollisionAuditSchema.parse(
      JSON.parse(activeAuditText),
    )
  } catch {
    throw safeError('finalize', 'corrected-authority')
  }
  if (
    byteSha256(closureText) !== expected.closureFileSha256 ||
    closure.closureSha256 !== expected.closureSha256 ||
    byteSha256(JSON.stringify(correctedCandidateClosureCore(closure))) !==
      expected.closureSha256 ||
    closure.candidateReceiptSha256 !== expected.candidateReceiptSha256 ||
    closure.predecessorReviewResultSha256 !==
      expected.predecessorReviewResultSha256 ||
    closure.activeAuditSha256 !== expected.activeAuditSha256 ||
    closure.activeAuditFileSha256 !== expected.activeAuditFileSha256 ||
    closure.records !== expected.records ||
    closure.manifests !== expected.manifests ||
    closure.locks !== expected.locks ||
    closure.approved !== expected.approved ||
    closure.rejected !== expected.rejected ||
    closure.mismatches !== 0 ||
    closure.formatMismatches !== 0 ||
    closure.yearMismatches !== 0 ||
    closure.combinedMismatches !== 0 ||
    byteSha256(activeAuditText) !== expected.activeAuditFileSha256 ||
    activeAudit.auditSha256 !== expected.activeAuditSha256 ||
    activeAudit.candidateReceiptSha256 !== expected.candidateReceiptSha256 ||
    activeAudit.predecessorReviewResultSha256 !==
      expected.predecessorReviewResultSha256 ||
    activeAudit.records !== expected.records ||
    activeAudit.manifests.length !== expected.manifests ||
    activeAudit.collisionCount !== expected.collisions ||
    activeAudit.correctlyRejectedCollisionCount !== expected.collisions ||
    activeAudit.violationCount !== 0 ||
    activeAudit.revalidatedLockCount !== expected.revalidated ||
    activeAudit.freshLockCount !== expected.fresh
  )
    throw safeError('finalize', 'corrected-authority')
  if (
    (await optionalText(activeAuditStagingPath(directory))) !== undefined ||
    (await optionalText(correctedClosureStagingPath(directory))) !==
      undefined ||
    (await pathExists(join(directory, '.finalize-staging'))) ||
    (await pathExists(finalizedDirectory(directory)))
  )
    throw safeError('finalize', 'corrected-custody')
}

export async function assertCorrectedCandidateFinalizationPreflightForFixture(
  directory: string,
  expected: CorrectedFinalizationExpectation,
): Promise<void> {
  if (process.env.NODE_ENV !== 'test')
    throw new CandidateReviewCommandError(
      'Fixture corrected finalization preflight is unavailable to live tooling.',
    )
  return assertCorrectedCandidateFinalizationPreflightInternal(
    directory,
    expected,
  )
}

async function assertRecoveryClean(
  directory: string,
  stage: string,
  allowActiveAuditStaging = false,
) {
  if (
    (await optionalText(recoveryJournalPath(directory))) !== undefined ||
    (await pathExists(recoveryStagingDirectory(directory))) ||
    (!allowActiveAuditStaging &&
      (await optionalText(activeAuditStagingPath(directory))) !== undefined)
  )
    throw safeError(stage, 'recovery-residue')
}

function createRecoveryCustodyPlan(
  ordinal: number,
  audit: Awaited<ReturnType<typeof auditCandidatePredecessorCollisions>>,
): RecoveryCustodyPlan {
  const row = audit.manifestResults[ordinal - 1]
  if (row === undefined) throw safeError('recovery', 'frozen-plan')
  const files = [
    {
      name: 'verdict' as const,
      sourcePath: `verdicts/${manifestName(ordinal)}.json`,
      sha256: row.verdictSha256,
      bytes: row.verdictBytes,
    },
    {
      name: 'completed' as const,
      sourcePath: `completed/${manifestName(ordinal)}.json`,
      sha256: row.completedResultSha256,
      bytes: row.completedResultBytes,
    },
    {
      name: 'lock' as const,
      sourcePath: `locks/${manifestName(ordinal)}.locked.json`,
      sha256: row.lockedResultSha256,
      bytes: row.lockedResultBytes,
    },
  ].filter(
    (file): file is Omit<RecoveryCustodyFilePlan, 'destinationPath'> =>
      file.sha256 !== null && file.bytes !== null,
  )
  if (files.length === 0) throw safeError('recovery', 'frozen-plan')
  const ledgerCore = {
    schema: 'zedarchive.anime-v2-candidate-review-custody-ledger' as const,
    version: 1 as const,
    reason: 'retained-predecessor-collision' as const,
    auditSha256: audit.auditSha256,
    ordinal,
    manifestSha256: row.manifestSha256,
    files: files.map(({ name, sha256, bytes }) => ({ name, sha256, bytes })),
  }
  const ledgerSha256 = canonicalHash(ledgerCore)
  const destinationDirectory = `quarantine/retained-predecessor-collision/${manifestName(ordinal)}-${ledgerSha256}`
  return {
    ordinal,
    manifestSha256: row.manifestSha256,
    destinationDirectory,
    files: files.map((file) => ({
      ...file,
      destinationPath: `${destinationDirectory}/${file.name}.json`,
    })),
    ledgerSha256,
  }
}

async function validateRecoveryCustodySources(
  directory: string,
  plan: RecoveryCustodyPlan,
) {
  for (const file of plan.files) {
    const text = await optionalText(join(directory, file.sourcePath))
    if (
      text === undefined ||
      byteSha256(text) !== file.sha256 ||
      Buffer.byteLength(text) !== file.bytes
    )
      throw safeError('recovery', 'frozen-plan')
  }
}

async function validateRecoveryCustodyMoveInputs(
  directory: string,
  staging: string,
  plan: RecoveryCustodyPlan,
) {
  for (const file of plan.files) {
    const text =
      (await optionalText(join(staging, `${file.name}.json`))) ??
      (await optionalText(join(directory, file.sourcePath)))
    if (
      text === undefined ||
      byteSha256(text) !== file.sha256 ||
      Buffer.byteLength(text) !== file.bytes
    )
      throw safeError('recovery', 'frozen-plan')
  }
}

async function validateRecoveryCustodyBundle(
  directory: string,
  audit: Awaited<ReturnType<typeof auditCandidatePredecessorCollisions>>,
  plan: RecoveryCustodyPlan,
) {
  const expected = createRecoveryCustodyPlan(plan.ordinal, audit)
  if (canonicalHash(plan) !== canonicalHash(expected))
    throw safeError('recovery', 'verification')
  const row = audit.manifestResults[plan.ordinal - 1]
  if (row === undefined) throw safeError('recovery', 'verification')
  const destination = join(directory, plan.destinationDirectory)
  let entries: string[]
  try {
    entries = (await readdir(destination)).sort()
  } catch {
    throw safeError('recovery', 'verification')
  }
  const expectedEntries = [
    ...plan.files.map(({ name }) => `${name}.json`),
    'custody-ledger.json',
  ].sort()
  if (JSON.stringify(entries) !== JSON.stringify(expectedEntries))
    throw safeError('recovery', 'verification')
  const ledgerCore = {
    schema: 'zedarchive.anime-v2-candidate-review-custody-ledger' as const,
    version: 1 as const,
    reason: 'retained-predecessor-collision' as const,
    auditSha256: audit.auditSha256,
    ordinal: plan.ordinal,
    manifestSha256: row.manifestSha256,
    files: plan.files.map(({ name, sha256, bytes }) => ({
      name,
      sha256,
      bytes,
    })),
  }
  const expectedLedger = `${JSON.stringify(
    { ...ledgerCore, custodySha256: canonicalHash(ledgerCore) },
    null,
    2,
  )}\n`
  if (
    (await optionalText(join(destination, 'custody-ledger.json'))) !==
    expectedLedger
  )
    throw safeError('recovery', 'verification')
  for (const file of plan.files) {
    const text = await optionalText(join(destination, `${file.name}.json`))
    if (
      text === undefined ||
      byteSha256(text) !== file.sha256 ||
      Buffer.byteLength(text) !== file.bytes
    )
      throw safeError('recovery', 'verification')
  }
}

async function writeRecoveryCustody(
  directory: string,
  audit: Awaited<ReturnType<typeof auditCandidatePredecessorCollisions>>,
  plan: RecoveryCustodyPlan,
  afterFileMove?: (
    ordinal: number,
    name: RecoveryCustodyFilePlan['name'],
  ) => Promise<void>,
) {
  const ordinal = plan.ordinal
  const expected = createRecoveryCustodyPlan(ordinal, audit)
  if (canonicalHash(plan) !== canonicalHash(expected))
    throw safeError('recovery', 'frozen-plan')
  const expectedFiles = plan.files
  const row = audit.manifestResults[ordinal - 1]!
  const core = {
    schema: 'zedarchive.anime-v2-candidate-review-custody-ledger' as const,
    version: 1 as const,
    reason: 'retained-predecessor-collision' as const,
    auditSha256: audit.auditSha256,
    ordinal,
    manifestSha256: row.manifestSha256,
    files: expectedFiles.map(({ name, sha256, bytes }) => ({
      name,
      sha256,
      bytes,
    })),
  }
  const custodySha256 = canonicalHash(core)
  const custodyRoot = join(
    directory,
    'quarantine',
    'retained-predecessor-collision',
  )
  let existingBundles: string[] = []
  try {
    existingBundles = (await readdir(custodyRoot)).filter((entry) =>
      entry.startsWith(`${manifestName(ordinal)}-`),
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const staging = join(
    recoveryStagingDirectory(directory),
    `custody-${manifestName(ordinal)}`,
  )
  const destinationName = `${manifestName(ordinal)}-${custodySha256}`
  if (
    custodySha256 !== plan.ledgerSha256 ||
    `quarantine/retained-predecessor-collision/${destinationName}` !==
      plan.destinationDirectory
  )
    throw safeError('recovery', 'frozen-plan')
  if (
    existingBundles.length > 1 ||
    (existingBundles.length === 1 && existingBundles[0] !== destinationName)
  )
    throw safeError('recovery', 'frozen-plan')
  const destination = join(custodyRoot, destinationName)
  if (existingBundles.length === 1) {
    const entries = (await readdir(destination)).sort()
    const expectedEntries = [
      ...expectedFiles.map(({ name }) => `${name}.json`),
      'custody-ledger.json',
    ].sort()
    if (JSON.stringify(entries) !== JSON.stringify(expectedEntries))
      throw safeError('recovery', 'frozen-plan')
    const ledger = await optionalText(join(destination, 'custody-ledger.json'))
    const expectedLedger = `${JSON.stringify(
      { ...core, custodySha256 },
      null,
      2,
    )}\n`
    if (ledger !== expectedLedger) throw safeError('recovery', 'frozen-plan')
    for (const file of expectedFiles) {
      const text = await readFile(
        join(destination, `${file.name}.json`),
        'utf8',
      )
      if (
        byteSha256(text) !== file.sha256 ||
        Buffer.byteLength(text) !== file.bytes
      )
        throw safeError('recovery', 'frozen-plan')
    }
    return
  }
  const stagingExists = await pathExists(staging)
  if (!stagingExists) await mkdir(staging, { recursive: false })
  else {
    const entries = await readdir(staging)
    const allowed = new Set([
      ...expectedFiles.map(({ name }) => `${name}.json`),
      'custody-ledger.json',
    ])
    if (entries.some((entry) => !allowed.has(entry)))
      throw safeError('recovery', 'frozen-plan')
  }
  await validateRecoveryCustodyMoveInputs(directory, staging, plan)
  for (const expected of expectedFiles) {
    const source = join(directory, expected.sourcePath)
    const name = expected.name
    const stagedPath = join(staging, `${name}.json`)
    let text = await optionalText(stagedPath)
    if (text === undefined) {
      text = await optionalText(source)
      if (text !== undefined) {
        await rename(source, stagedPath)
        await afterFileMove?.(ordinal, name)
      }
    }
    if (
      text === undefined ||
      byteSha256(text) !== expected.sha256 ||
      Buffer.byteLength(text) !== expected.bytes
    )
      throw safeError('recovery', 'frozen-plan')
  }
  const ledgerPath = join(staging, 'custody-ledger.json')
  const expectedLedger = `${JSON.stringify({ ...core, custodySha256 }, null, 2)}\n`
  const existingLedger = await optionalText(ledgerPath)
  if (existingLedger !== undefined && existingLedger !== expectedLedger)
    throw safeError('recovery', 'frozen-plan')
  if (existingLedger === undefined)
    await writeFile(ledgerPath, expectedLedger, { flag: 'wx' })
  await mkdir(custodyRoot, { recursive: true })
  await rename(staging, destination)
}

async function deriveRoundTwoRevalidationArtifacts(
  directory: string,
  ordinal: number,
  prepared: Awaited<ReturnType<typeof loadPrepared>>,
  predecessor: PredecessorAuthorityContext,
  audit: Awaited<ReturnType<typeof auditCandidatePredecessorCollisions>>,
) {
  const text = manifestName(ordinal)
  const legacy = await materializeLegacyManifest(
    text,
    prepared,
    predecessor,
    directory,
  )
  if (!legacy.legacy || !legacy.lockText)
    throw safeError('recovery', 'revalidation')
  const lock = createLockedCandidateReviewManifest({
    schema: 'zedarchive.anime-v2-primary-candidate-review-lock',
    version: 3,
    candidateReceiptSha256: expectedReceiptSha256,
    predecessorReviewResultSha256:
      predecessor.exclusion.predecessorReviewResultSha256,
    retainedPredecessorIdentitySetSha256:
      predecessor.exclusion.retainedPredecessorIdentitySetSha256,
    predecessorExclusionAuthoritySha256: predecessor.exclusion.authoritySha256,
    predecessorCollisionAuditSha256: audit.auditSha256,
    candidateReviewRoundSha256: predecessor.candidateReviewRoundSha256,
    verdictSha256: legacy.legacy.materialized.completed.verdictSha256,
    completedResultSha256:
      legacy.legacy.materialized.completed.completedResultSha256,
    manifest: legacy.manifest,
    records: legacy.legacy.completed.records,
  })
  const revalidationCore = {
    schema: 'zedarchive.anime-v2-candidate-v2-to-v3-revalidation' as const,
    version: 1 as const,
    ordinal,
    manifestSha256: legacy.manifest.manifestSha256,
    legacyLockedResultSha256: legacy.legacy.legacyLock.lockedResultSha256,
    legacyLockByteSha256: byteSha256(legacy.lockText),
    predecessorCollisionAuditSha256: audit.auditSha256,
    predecessorReviewResultSha256:
      predecessor.exclusion.predecessorReviewResultSha256,
    retainedPredecessorIdentitySetSha256:
      predecessor.exclusion.retainedPredecessorIdentitySetSha256,
    predecessorExclusionAuthoritySha256: predecessor.exclusion.authoritySha256,
    candidateReviewRoundSha256: predecessor.candidateReviewRoundSha256,
    v3LockedResultSha256: lock.lockedResultSha256,
  }
  return {
    lockText: `${JSON.stringify(lock, null, 2)}\n`,
    revalidationText: `${JSON.stringify({ ...revalidationCore, revalidationSha256: canonicalHash(revalidationCore) }, null, 2)}\n`,
  }
}

async function buildRoundTwoRevalidation(
  directory: string,
  ordinal: number,
  prepared: Awaited<ReturnType<typeof loadPrepared>>,
  predecessor: PredecessorAuthorityContext,
  audit: Awaited<ReturnType<typeof auditCandidatePredecessorCollisions>>,
  staging: string,
  plan: RecoveryRevalidationPlan,
) {
  const text = manifestName(ordinal)
  const paths = canonicalRoundPaths(text, staging)
  if (
    plan.ordinal !== ordinal ||
    plan.lockPath !== `locks/${text}.locked.json` ||
    plan.revalidationPath !== `revalidations/${text}.json`
  )
    throw safeError('recovery', 'frozen-plan')
  const artifacts = await deriveRoundTwoRevalidationArtifacts(
    directory,
    ordinal,
    prepared,
    predecessor,
    audit,
  )
  if (
    byteSha256(artifacts.lockText) !== plan.lockSha256 ||
    Buffer.byteLength(artifacts.lockText) !== plan.lockBytes ||
    byteSha256(artifacts.revalidationText) !== plan.revalidationSha256 ||
    Buffer.byteLength(artifacts.revalidationText) !== plan.revalidationBytes
  )
    throw safeError('recovery', 'frozen-plan')
  const existingLock = await optionalText(paths.lock)
  const existingRevalidation = await optionalText(paths.revalidation)
  if (existingLock !== undefined || existingRevalidation !== undefined) {
    if (
      existingLock !== artifacts.lockText ||
      existingRevalidation !== artifacts.revalidationText
    )
      throw safeError('recovery', 'frozen-plan')
    return
  }
  await mkdir(roundLocksDirectory(staging), { recursive: true })
  await mkdir(roundRevalidationsDirectory(staging), { recursive: true })
  await writeFile(paths.lock, artifacts.lockText, {
    flag: 'wx',
  })
  await writeFile(paths.revalidation, artifacts.revalidationText, {
    flag: 'wx',
  })
}

async function deriveRecoveryJournal(
  directory: string,
  audit: Awaited<ReturnType<typeof auditCandidatePredecessorCollisions>>,
  prepared: Awaited<ReturnType<typeof loadPrepared>>,
  predecessor: PredecessorAuthorityContext,
  validateCustodySources = false,
): Promise<RecoveryJournal> {
  const quarantineOrdinals = audit.manifestResults
    .filter(({ status }) => status === 'requires-quarantine')
    .map(({ ordinal }) => ordinal)
  const revalidateOrdinals = audit.manifestResults
    .filter(({ status }) => status === 'valid')
    .map(({ ordinal }) => ordinal)
  const custody = quarantineOrdinals.map((ordinal) =>
    createRecoveryCustodyPlan(ordinal, audit),
  )
  if (validateCustodySources)
    for (const plan of custody)
      await validateRecoveryCustodySources(directory, plan)
  const revalidations: RecoveryRevalidationPlan[] = []
  for (const ordinal of revalidateOrdinals) {
    const artifacts = await deriveRoundTwoRevalidationArtifacts(
      directory,
      ordinal,
      prepared,
      predecessor,
      audit,
    )
    const text = manifestName(ordinal)
    revalidations.push({
      ordinal,
      lockPath: `locks/${text}.locked.json`,
      lockSha256: byteSha256(artifacts.lockText),
      lockBytes: Buffer.byteLength(artifacts.lockText),
      revalidationPath: `revalidations/${text}.json`,
      revalidationSha256: byteSha256(artifacts.revalidationText),
      revalidationBytes: Buffer.byteLength(artifacts.revalidationText),
    })
  }
  const core = {
    schema: 'zedarchive.anime-v2-candidate-review-recovery-journal' as const,
    version: 1 as const,
    auditSha256: audit.auditSha256,
    quarantineOrdinals,
    revalidateOrdinals,
    audit,
    custody,
    revalidations,
  }
  return { ...core, journalSha256: canonicalHash(core) }
}

async function createRecoveryJournal(
  directory: string,
  audit: Awaited<ReturnType<typeof auditCandidatePredecessorCollisions>>,
  prepared: Awaited<ReturnType<typeof loadPrepared>>,
  predecessor: PredecessorAuthorityContext,
) {
  return deriveRecoveryJournal(directory, audit, prepared, predecessor, true)
}

async function ensurePersistedRecoveryAudit(
  directory: string,
  audit: Awaited<ReturnType<typeof auditCandidatePredecessorCollisions>>,
) {
  const expected = `${JSON.stringify(audit, null, 2)}\n`
  const existing = await optionalText(auditPath(directory))
  if (existing === undefined) {
    await writeFile(auditPath(directory), expected, { flag: 'wx' })
    return
  }
  if (existing !== expected) throw safeError('recovery', 'frozen-plan')
}

type RoundTwoPromotionPlan = Readonly<{
  schema: 'zedarchive.anime-v2-candidate-review-round-two-promotion-plan'
  version: 1
  auditSha256: string
  revalidateOrdinals: readonly number[]
  files: readonly { path: string; sha256: string; bytes: number }[]
  promotionPlanSha256: string
}>

function roundTwoPromotionPlanPath(directory: string) {
  return join(reviewRoundDirectory(directory), 'recovery-plan.json')
}

async function writeRoundTwoPromotionPlan(
  stagingDirectory: string,
  journal: RecoveryJournal,
) {
  const round = reviewRoundDirectory(stagingDirectory)
  const files: { path: string; sha256: string; bytes: number }[] = []
  for (const [folder, suffix] of [
    ['locks', '.locked.json'],
    ['revalidations', '.json'],
  ] as const) {
    const folderPath = join(round, folder)
    let entries: string[] = []
    try {
      entries = await readdir(folderPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    if (entries.some((entry) => !new RegExp(`^[0-9]{3}${suffix}$`).test(entry)))
      throw safeError('recovery', 'frozen-plan')
    for (const entry of entries.sort()) {
      const text = await readFile(join(folderPath, entry), 'utf8')
      files.push({
        path: `${folder}/${entry}`,
        sha256: byteSha256(text),
        bytes: Buffer.byteLength(text),
      })
    }
  }
  const expectedPaths = journal.revalidateOrdinals.flatMap((ordinal) => {
    const name = manifestName(ordinal)
    return [`locks/${name}.locked.json`, `revalidations/${name}.json`]
  })
  if (
    JSON.stringify(files.map(({ path }) => path).sort()) !==
    JSON.stringify(expectedPaths.sort())
  )
    throw safeError('recovery', 'frozen-plan')
  for (const plan of journal.revalidations) {
    const lock = files.find(({ path }) => path === plan.lockPath)
    const revalidation = files.find(
      ({ path }) => path === plan.revalidationPath,
    )
    if (
      lock?.sha256 !== plan.lockSha256 ||
      lock.bytes !== plan.lockBytes ||
      revalidation?.sha256 !== plan.revalidationSha256 ||
      revalidation.bytes !== plan.revalidationBytes
    )
      throw safeError('recovery', 'frozen-plan')
  }
  const core = {
    schema:
      'zedarchive.anime-v2-candidate-review-round-two-promotion-plan' as const,
    version: 1 as const,
    auditSha256: journal.auditSha256,
    revalidateOrdinals: journal.revalidateOrdinals,
    files,
  }
  await writeFile(
    roundTwoPromotionPlanPath(stagingDirectory),
    `${JSON.stringify(
      { ...core, promotionPlanSha256: canonicalHash(core) },
      null,
      2,
    )}\n`,
    { flag: 'wx' },
  )
}

async function validatePromotedRoundTwoPlan(
  directory: string,
  journal: RecoveryJournal,
) {
  const round = reviewRoundDirectory(directory)
  const plan = z
    .strictObject({
      schema: z.literal(
        'zedarchive.anime-v2-candidate-review-round-two-promotion-plan',
      ),
      version: z.literal(1),
      auditSha256: shaSchema,
      revalidateOrdinals: z.array(z.number().int().positive()),
      files: z.array(
        z.strictObject({
          path: z.string(),
          sha256: shaSchema,
          bytes: z.number().int().nonnegative(),
        }),
      ),
      promotionPlanSha256: shaSchema,
    })
    .parse(
      await readJson(roundTwoPromotionPlanPath(directory)),
    ) as RoundTwoPromotionPlan
  const core = {
    schema: plan.schema,
    version: plan.version,
    auditSha256: plan.auditSha256,
    revalidateOrdinals: plan.revalidateOrdinals,
    files: plan.files,
  }
  if (
    plan.promotionPlanSha256 !== canonicalHash(core) ||
    plan.auditSha256 !== journal.auditSha256 ||
    JSON.stringify(plan.revalidateOrdinals) !==
      JSON.stringify(journal.revalidateOrdinals)
  )
    throw safeError('recovery', 'frozen-plan')
  if (plan.files.length !== journal.revalidations.length * 2)
    throw safeError('recovery', 'frozen-plan')
  for (const frozen of journal.revalidations) {
    const lock = plan.files.find(({ path }) => path === frozen.lockPath)
    const revalidation = plan.files.find(
      ({ path }) => path === frozen.revalidationPath,
    )
    if (
      lock?.sha256 !== frozen.lockSha256 ||
      lock?.bytes !== frozen.lockBytes ||
      revalidation?.sha256 !== frozen.revalidationSha256 ||
      revalidation?.bytes !== frozen.revalidationBytes
    )
      throw safeError('recovery', 'frozen-plan')
  }
  const expectedEntries = new Set([
    'recovery-plan.json',
    ...(plan.files.length > 0 ? ['locks', 'revalidations'] : []),
  ])
  const entries = await readdir(round)
  if (entries.some((entry) => !expectedEntries.has(entry)))
    throw safeError('recovery', 'frozen-plan')
  for (const file of plan.files) {
    if (!/^(locks|revalidations)\/[0-9]{3}(\.locked)?\.json$/.test(file.path))
      throw safeError('recovery', 'frozen-plan')
    const text = await readFile(join(round, file.path), 'utf8')
    if (
      byteSha256(text) !== file.sha256 ||
      Buffer.byteLength(text) !== file.bytes
    )
      throw safeError('recovery', 'frozen-plan')
  }
  for (const [folder, suffix] of [
    ['locks', '.locked.json'],
    ['revalidations', '.json'],
  ] as const) {
    const entries = await assertFlatInventory(join(round, folder), suffix)
    const expected = new Set(
      plan.files
        .filter(({ path }) => path.startsWith(`${folder}/`))
        .map(({ path }) => path.slice(folder.length + 1)),
    )
    if (
      entries.size !== expected.size ||
      [...entries].some((entry) => !expected.has(entry))
    )
      throw safeError('recovery', 'frozen-plan')
  }
}

async function validateRoundTwoScaffold(
  directory: string,
  audit: CandidateRecoveryCollisionAudit,
  stage: string,
) {
  const round = reviewRoundDirectory(directory)
  const plan = z
    .strictObject({
      schema: z.literal(
        'zedarchive.anime-v2-candidate-review-round-two-promotion-plan',
      ),
      version: z.literal(1),
      auditSha256: shaSchema,
      revalidateOrdinals: z.array(z.number().int().positive()),
      files: z.array(
        z.strictObject({
          path: z.string(),
          sha256: shaSchema,
          bytes: z.number().int().nonnegative(),
        }),
      ),
      promotionPlanSha256: shaSchema,
    })
    .parse(
      await readJson(roundTwoPromotionPlanPath(directory)),
    ) as RoundTwoPromotionPlan
  const core = {
    schema: plan.schema,
    version: plan.version,
    auditSha256: plan.auditSha256,
    revalidateOrdinals: plan.revalidateOrdinals,
    files: plan.files,
  }
  const expectedOrdinals = audit.recoveryAudit.manifests
    .filter(({ disposition }) => disposition === 'valid')
    .map(({ ordinal }) => ordinal)
  const expectedPaths = expectedOrdinals.flatMap((ordinal) => {
    const name = manifestName(ordinal)
    return [`locks/${name}.locked.json`, `revalidations/${name}.json`]
  })
  if (
    plan.promotionPlanSha256 !== canonicalHash(core) ||
    plan.auditSha256 !== audit.auditSha256 ||
    JSON.stringify(plan.revalidateOrdinals) !==
      JSON.stringify(expectedOrdinals) ||
    plan.files.length !== expectedPaths.length ||
    new Set(plan.files.map(({ path }) => path)).size !== plan.files.length ||
    JSON.stringify(plan.files.map(({ path }) => path).sort()) !==
      JSON.stringify(expectedPaths.sort())
  )
    throw safeError(stage, 'recovery-plan')
  for (const file of plan.files) {
    const text = await readFile(join(round, file.path), 'utf8')
    if (
      byteSha256(text) !== file.sha256 ||
      Buffer.byteLength(text) !== file.bytes
    )
      throw safeError(stage, 'recovery-plan')
  }
  const revalidationFiles = await assertFlatInventory(
    join(round, 'revalidations'),
    '\\.json',
  )
  const expectedRevalidations = new Set(
    expectedPaths
      .filter((path) => path.startsWith('revalidations/'))
      .map((path) => path.slice('revalidations/'.length)),
  )
  if (
    revalidationFiles.size !== expectedRevalidations.size ||
    [...revalidationFiles].some((file) => !expectedRevalidations.has(file))
  )
    throw safeError(stage, 'recovery-plan')
  const lockFiles = await assertFlatInventory(
    join(round, 'locks'),
    '\\.locked\\.json',
  )
  const expectedLocks = new Set(
    expectedPaths
      .filter((path) => path.startsWith('locks/'))
      .map((path) => path.slice('locks/'.length)),
  )
  const allLocks = new Set(
    audit.recoveryAudit.manifests.map(
      ({ ordinal }) => `${manifestName(ordinal)}.locked.json`,
    ),
  )
  if (
    [...expectedLocks].some((file) => !lockFiles.has(file)) ||
    [...lockFiles].some((file) => !allLocks.has(file))
  )
    throw safeError(stage, 'recovery-plan')
  return plan
}

function assertAcceptedRecoveryRound(
  audit: CandidateRecoveryCollisionAudit,
  plan: RoundTwoPromotionPlan,
  stage: string,
) {
  const fixture = process.env.NODE_ENV === 'test'
  const acceptedAudit = fixture
    ? audit.auditSha256
    : acceptedCandidateRecoveryCollisionAuditSha256
  const acceptedPlan = fixture
    ? plan.promotionPlanSha256
    : acceptedCandidateReviewRoundTwoPromotionPlanSha256
  if (
    acceptedAudit === null ||
    acceptedPlan === null ||
    acceptedAudit !== audit.auditSha256 ||
    acceptedPlan !== plan.promotionPlanSha256
  )
    throw safeError(stage, 'recovery-not-accepted')
  return {
    recoveryAuditSha256: acceptedAudit,
    promotionPlanSha256: acceptedPlan,
  }
}

async function validatePersistedRevalidations(
  directory: string,
  prepared: Awaited<ReturnType<typeof loadPrepared>>,
  predecessor: PredecessorAuthorityContext,
  audit: CandidateRecoveryCollisionAudit,
  stage: string,
) {
  for (const manifest of audit.recoveryAudit.manifests) {
    if (manifest.disposition !== 'valid') continue
    const text = manifestName(manifest.ordinal)
    const expected = await deriveRoundTwoRevalidationArtifacts(
      directory,
      manifest.ordinal,
      prepared,
      predecessor,
      audit,
    )
    const paths = canonicalRoundPaths(text, directory)
    if (
      (await optionalText(paths.lock)) !== expected.lockText ||
      (await optionalText(paths.revalidation)) !== expected.revalidationText
    )
      throw safeError(stage, 'revalidation')
  }
}

async function validateCanonicalRoundState(
  directory: string,
  prepared: Awaited<ReturnType<typeof loadPrepared>>,
  predecessor: PredecessorAuthorityContext,
  audit: CandidateRecoveryCollisionAudit,
  stage: 'complete' | 'lock' | 'audit' | 'finalize' | 'verify-canonical',
  target?: number,
  subphaseObserver?: (subphase: CandidateReviewCanonicalSubphase) => void,
) {
  subphaseObserver?.('persisted-revalidations')
  await validatePersistedRevalidations(
    directory,
    prepared,
    predecessor,
    audit,
    stage,
  )
  for (const manifest of prepared.manifests) {
    const recovery = audit.recoveryAudit.manifests[manifest.ordinal - 1]
    if (recovery?.disposition === 'valid') continue
    const name = manifestName(manifest.ordinal)
    const paths = canonicalRoundPaths(name, directory)
    const [verdictText, completedText, lockText] = await Promise.all([
      optionalText(paths.verdict),
      optionalText(paths.completed),
      optionalText(paths.lock),
    ])
    subphaseObserver?.('fresh-vacancy')
    if (!verdictText && !completedText && !lockText) continue
    subphaseObserver?.('fresh-verdict')
    if (verdictText && !completedText && !lockText) {
      if (stage === 'complete' && manifest.ordinal === target) continue
      throw safeError(stage, 'round-state')
    }
    subphaseObserver?.('fresh-completed')
    if (verdictText && completedText && !lockText) {
      const materialized = await materializeCandidateReviewManifest(
        name,
        JSON.parse(verdictText),
        directory,
        prepared.receipt,
        undefined,
        predecessor,
      )
      if (
        completedText !== `${JSON.stringify(materialized.completed, null, 2)}\n`
      )
        throw safeError(stage, 'round-state')
      if (
        (stage === 'lock' || stage === 'verify-canonical') &&
        manifest.ordinal === target
      )
        continue
      throw safeError(stage, 'round-state')
    }
    if (!verdictText || !completedText || !lockText)
      throw safeError(stage, 'round-state')
    const materialized = await materializeCandidateReviewManifest(
      name,
      JSON.parse(verdictText),
      directory,
      prepared.receipt,
      undefined,
      predecessor,
    )
    if (
      completedText !== `${JSON.stringify(materialized.completed, null, 2)}\n`
    )
      throw safeError(stage, 'round-state')
    const expected = createLockedCandidateReviewManifest({
      schema: 'zedarchive.anime-v2-primary-candidate-review-lock',
      version: 3,
      candidateReceiptSha256: expectedReceiptSha256,
      predecessorReviewResultSha256:
        predecessor.exclusion.predecessorReviewResultSha256,
      retainedPredecessorIdentitySetSha256:
        predecessor.exclusion.retainedPredecessorIdentitySetSha256,
      predecessorExclusionAuthoritySha256:
        predecessor.exclusion.authoritySha256,
      predecessorCollisionAuditSha256: audit.auditSha256,
      candidateReviewRoundSha256: predecessor.candidateReviewRoundSha256,
      verdictSha256: canonicalHash(materialized.verdict),
      completedResultSha256: materialized.completed.completedResultSha256,
      manifest,
      records: materialized.completed.records,
    })
    subphaseObserver?.('fresh-lock')
    if (lockText !== `${JSON.stringify(expected, null, 2)}\n`)
      throw safeError(stage, 'round-state')
  }
}

type FixtureCanonicalSubphaseVerificationOptions = Readonly<{
  receipt: Receipt
  predecessorReviewResult?: unknown
  subphaseObserver?: (subphase: CandidateReviewCanonicalSubphase) => void
}>

function parseCanonicalSubphaseVerificationTarget(
  manifestText: string,
): number {
  if (!/^[0-9]{3}$/.test(manifestText))
    throw new CandidateReviewCommandError(usage)
  return Number(manifestText)
}

async function verifyCandidateCanonicalSubphaseInternal(
  manifestText: string,
  directory = outputDirectory,
  fixture?: FixtureCanonicalSubphaseVerificationOptions,
  subphaseObserver?: (subphase: CandidateReviewCanonicalSubphase) => void,
) {
  const ordinal = parseCanonicalSubphaseVerificationTarget(manifestText)
  await assertRecoveryClean(directory, 'verify-canonical')
  const prepared = await loadPrepared(directory, fixture?.receipt)
  const manifest = prepared.manifests[ordinal - 1]
  if (!manifest || manifestName(manifest.ordinal) !== manifestText)
    throw safeError('verify-canonical', 'manifest')
  const predecessor = await loadAcceptedPredecessorAuthority(
    fixture?.predecessorReviewResult ??
      (fixture ? { fixture: true } : undefined),
  )
  const { audit } = await loadImmutableRecoveryAudit(
    directory,
    prepared,
    predecessor,
    'verify-canonical',
  )
  assertAcceptedRecoveryRound(
    audit,
    await validateRoundTwoScaffold(directory, audit, 'verify-canonical'),
    'verify-canonical',
  )
  await validateCanonicalRoundState(
    directory,
    prepared,
    predecessor,
    audit,
    'verify-canonical',
    ordinal,
    subphaseObserver,
  )
}

async function runCandidateCanonicalSubphaseVerifier(
  manifestText: string,
  directory = outputDirectory,
  fixture?: FixtureCanonicalSubphaseVerificationOptions,
) {
  parseCanonicalSubphaseVerificationTarget(manifestText)
  let lastSubphase: CandidateReviewCanonicalSubphase | undefined
  try {
    await verifyCandidateCanonicalSubphaseInternal(
      manifestText,
      directory,
      fixture,
      (subphase) => {
        lastSubphase = subphase
        fixture?.subphaseObserver?.(subphase)
      },
    )
    return candidateReviewCanonicalSubphaseResultSchema.parse({
      outcome: 'completed',
      subphase: lastSubphase,
    })
  } catch {
    return candidateReviewCanonicalSubphaseResultSchema.parse({
      outcome: 'stopped',
      subphase: lastSubphase,
    })
  }
}

export async function verifyCandidateCanonicalSubphase(manifestText: string) {
  return runCandidateCanonicalSubphaseVerifier(manifestText)
}

export async function verifyCandidateCanonicalSubphaseForFixture(
  manifestText: string,
  directory: string,
  fixture: FixtureCanonicalSubphaseVerificationOptions,
) {
  if (process.env.NODE_ENV !== 'test')
    throw new CandidateReviewCommandError(
      'Fixture candidate canonical verification is unavailable to live tooling.',
    )
  return runCandidateCanonicalSubphaseVerifier(manifestText, directory, fixture)
}

export async function validateCandidateCanonicalRoundStateWithPreloadedContextForFixture(
  manifestText: string,
  directory: string,
  fixture: FixtureCanonicalSubphaseVerificationOptions,
) {
  if (process.env.NODE_ENV !== 'test')
    throw new CandidateReviewCommandError(
      'Fixture candidate canonical context validation is unavailable to live tooling.',
    )
  const ordinal = parseCanonicalSubphaseVerificationTarget(manifestText)
  const prepared = await loadPrepared(directory, fixture.receipt)
  const predecessor = await loadAcceptedPredecessorAuthority(
    fixture.predecessorReviewResult ?? { fixture: true },
  )
  const { audit } = await loadImmutableRecoveryAudit(
    directory,
    prepared,
    predecessor,
    'verify-canonical',
  )
  assertAcceptedRecoveryRound(
    audit,
    await validateRoundTwoScaffold(directory, audit, 'verify-canonical'),
    'verify-canonical',
  )
  const originalNodeEnv = process.env.NODE_ENV
  Object.defineProperty(process.env, 'NODE_ENV', {
    value: 'production',
    configurable: true,
    enumerable: true,
    writable: true,
  })
  try {
    await validateCanonicalRoundState(
      directory,
      prepared,
      predecessor,
      audit,
      'verify-canonical',
      ordinal,
    )
  } finally {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: originalNodeEnv,
      configurable: true,
      enumerable: true,
      writable: true,
    })
  }
}

async function recoverCandidateReviewRoundTwo(
  directory = outputDirectory,
  fixtureReceipt?: Receipt,
  fixturePredecessorResult?: unknown,
  beforePromotion?: () => Promise<void>,
  beforePlan?: () => Promise<void>,
  afterPromotion?: () => Promise<void>,
  afterJournal?: () => Promise<void>,
  afterCustodyFileMove?: (
    ordinal: number,
    name: RecoveryCustodyFilePlan['name'],
  ) => Promise<void>,
) {
  const journalPath = recoveryJournalPath(directory)
  const existingJournal = await optionalText(journalPath)
  if (await pathExists(reviewRoundDirectory(directory))) {
    if (!existingJournal) throw safeError('recovery', 'no-resume')
    const journal = parseRecoveryJournal(existingJournal)
    const prepared = await loadPrepared(directory, fixtureReceipt)
    const predecessor = await loadAcceptedPredecessorAuthority(
      fixturePredecessorResult,
    )
    const persistedAudit = await optionalText(auditPath(directory))
    // A post-promotion crash may occur after the round rename but before the
    // immutable audit is visible. Only the journal's already hash-checked
    // frozen audit may restore that absent file, and only with create-new
    // semantics. A changed file is never repaired or overwritten.
    if (persistedAudit === undefined)
      await ensurePersistedRecoveryAudit(directory, journal.audit)
    const { audit } = await loadImmutableRecoveryAudit(
      directory,
      prepared,
      predecessor,
      'recovery',
    )
    validateFrozenRecoveryJournal(journal, audit, prepared, predecessor)
    const expected = await deriveRecoveryJournal(
      directory,
      audit,
      prepared,
      predecessor,
    )
    validateExpectedRecoveryJournal(journal, expected)
    await validatePromotedRoundTwoPlan(directory, expected)
    for (const plan of expected.custody) {
      await validateRecoveryCustodyBundle(directory, audit, plan)
      for (const file of plan.files)
        if (
          (await optionalText(join(directory, file.sourcePath))) !== undefined
        )
          throw safeError('recovery', 'frozen-plan')
    }
    await rm(recoveryStagingDirectory(directory), {
      recursive: true,
      force: true,
    })
    await rm(journalPath, { force: true })
    return
  }
  if (!existingJournal) await beforePlan?.()
  if (
    !existingJournal &&
    (await optionalText(auditPath(directory))) !== undefined
  )
    throw safeError('recovery', 'no-resume')
  const prepared = await loadPrepared(directory, fixtureReceipt)
  const predecessor = await loadAcceptedPredecessorAuthority(
    fixturePredecessorResult,
  )
  const persistedAudit = await optionalText(auditPath(directory))
  const audit =
    persistedAudit === undefined
      ? await auditCandidatePredecessorCollisions(
          directory,
          fixtureReceipt,
          fixturePredecessorResult,
        )
      : (
          await loadImmutableRecoveryAudit(
            directory,
            prepared,
            predecessor,
            'recovery',
          )
        ).audit
  const journal: RecoveryJournal = existingJournal
    ? parseRecoveryJournal(existingJournal)
    : await createRecoveryJournal(directory, audit, prepared, predecessor)
  validateFrozenRecoveryJournal(journal, audit, prepared, predecessor)
  const expectedJournal = await deriveRecoveryJournal(
    directory,
    audit,
    prepared,
    predecessor,
  )
  validateExpectedRecoveryJournal(journal, expectedJournal)
  if (!existingJournal)
    await writeFile(journalPath, `${JSON.stringify(journal, null, 2)}\n`, {
      flag: 'wx',
    })
  if (!existingJournal) await afterJournal?.()
  await ensurePersistedRecoveryAudit(directory, audit)
  await mkdir(recoveryStagingDirectory(directory), { recursive: true })
  try {
    await mkdir(reviewRoundDirectory(recoveryStagingDirectory(directory)), {
      recursive: true,
    })
    for (const [index, ordinal] of journal.revalidateOrdinals.entries())
      await buildRoundTwoRevalidation(
        directory,
        ordinal,
        prepared,
        predecessor,
        audit,
        recoveryStagingDirectory(directory),
        journal.revalidations[index]!,
      )
    for (const [index, ordinal] of journal.quarantineOrdinals.entries()) {
      const plan = journal.custody[index]
      if (plan?.ordinal !== ordinal) throw safeError('recovery', 'frozen-plan')
      await writeRecoveryCustody(directory, audit, plan, afterCustodyFileMove)
    }
    if (
      (await optionalText(
        roundTwoPromotionPlanPath(recoveryStagingDirectory(directory)),
      )) === undefined
    )
      await writeRoundTwoPromotionPlan(
        recoveryStagingDirectory(directory),
        journal,
      )
    else
      await validatePromotedRoundTwoPlan(
        recoveryStagingDirectory(directory),
        journal,
      )
    await beforePromotion?.()
    await rename(
      reviewRoundDirectory(recoveryStagingDirectory(directory)),
      reviewRoundDirectory(directory),
    )
    await afterPromotion?.()
    await rm(recoveryStagingDirectory(directory), {
      recursive: true,
      force: true,
    })
    await rm(journalPath, { force: true })
  } catch (error) {
    // The frozen journal makes a later invocation a safe stop rather than a new plan.
    throw error
  }
}

export async function recoverCandidateReviewRoundTwoForFixture(
  directory: string,
  receipt: Receipt,
  predecessorReviewResult: unknown,
  beforePromotion?: () => Promise<void>,
  beforePlan?: () => Promise<void>,
  afterPromotion?: () => Promise<void>,
  afterJournal?: () => Promise<void>,
  afterCustodyFileMove?: (
    ordinal: number,
    name: RecoveryCustodyFilePlan['name'],
  ) => Promise<void>,
) {
  if (process.env.NODE_ENV !== 'test')
    throw new CandidateReviewCommandError(
      'Fixture candidate review recovery is unavailable to live tooling.',
    )
  return recoverCandidateReviewRoundTwo(
    directory,
    receipt,
    predecessorReviewResult,
    beforePromotion,
    beforePlan,
    afterPromotion,
    afterJournal,
    afterCustodyFileMove,
  )
}

const revalidationSchema = z.strictObject({
  schema: z.literal('zedarchive.anime-v2-candidate-v2-to-v3-revalidation'),
  version: z.literal(1),
  ordinal: z.number().int().positive(),
  manifestSha256: shaSchema,
  legacyLockedResultSha256: shaSchema,
  legacyLockByteSha256: shaSchema,
  predecessorCollisionAuditSha256: shaSchema,
  predecessorReviewResultSha256: shaSchema,
  retainedPredecessorIdentitySetSha256: shaSchema,
  predecessorExclusionAuthoritySha256: shaSchema,
  candidateReviewRoundSha256: shaSchema,
  v3LockedResultSha256: shaSchema,
  revalidationSha256: shaSchema,
})

function revalidationCore(revalidation: z.infer<typeof revalidationSchema>) {
  const { revalidationSha256: _hash, ...core } = revalidation
  void _hash
  return core
}

async function assertRoundTwoInventory(
  directory: string,
  manifests: readonly CandidateManifest[],
) {
  const round = reviewRoundDirectory(directory)
  const rootEntries = await readdir(round)
  const allowedRoots = new Set([
    'verdicts',
    'completed',
    'locks',
    'revalidations',
    'recovery-plan.json',
    'active-collision-audit.v1.json',
  ])
  if (rootEntries.some((entry) => !allowedRoots.has(entry)))
    throw safeError('audit', 'unknown-file')
  const expected = new Set(
    manifests.map(({ ordinal }) => manifestName(ordinal)),
  )
  for (const [folder, suffix] of [
    ['verdicts', '.json'],
    ['completed', '.json'],
    ['locks', '.locked.json'],
    ['revalidations', '.json'],
  ] as const) {
    const files = await assertFlatInventory(join(round, folder), suffix)
    if ([...files].some((name) => !expected.has(name.slice(0, 3))))
      throw safeError('audit', 'unknown-file')
  }
}

async function auditActiveCandidateReviewInternal(
  directory = outputDirectory,
  fixtureReceipt?: Receipt,
  fixturePredecessorResult?: unknown,
  validateExisting = false,
  afterStaging?: () => Promise<void>,
) {
  await assertRecoveryClean(directory, 'audit', true)
  const staging = activeAuditStagingPath(directory)
  // This file was never promoted. It cannot grant authority, so recovery
  // discards it and re-derives the audit from the immutable round instead.
  if ((await optionalText(staging)) !== undefined)
    await rm(staging, { force: true })
  const prepared = await loadPrepared(directory, fixtureReceipt)
  const predecessor = await loadAcceptedPredecessorAuthority(
    fixturePredecessorResult,
  )
  const { audit: recoveryAudit } = await loadImmutableRecoveryAudit(
    directory,
    prepared,
    predecessor,
    'audit',
  )
  const promotionPlan = await validateRoundTwoScaffold(
    directory,
    recoveryAudit,
    'audit',
  )
  assertAcceptedRecoveryRound(recoveryAudit, promotionPlan, 'audit')
  await validateCanonicalRoundState(
    directory,
    prepared,
    predecessor,
    recoveryAudit,
    'audit',
  )
  const destination = activeAuditPath(directory)
  const existing = await optionalText(destination)
  if (validateExisting && existing === undefined)
    throw safeError('audit', 'missing')
  await assertRoundTwoInventory(directory, prepared.manifests)
  const locks: unknown[] = []
  for (const manifest of prepared.manifests) {
    const name = manifestName(manifest.ordinal)
    const paths = canonicalRoundPaths(name, directory)
    const lockText = await optionalText(paths.lock)
    if (lockText === undefined) throw safeError('audit', 'incomplete-locks')
    let lock: ReturnType<typeof createLockedCandidateReviewManifest>
    try {
      lock = JSON.parse(lockText) as typeof lock
    } catch {
      throw safeError('audit', 'lock')
    }
    const revalidationText = await optionalText(paths.revalidation)
    const verdictText = await optionalText(paths.verdict)
    const completedText = await optionalText(paths.completed)
    const recoveryManifest =
      recoveryAudit.recoveryAudit.manifests[manifest.ordinal - 1]
    if (
      recoveryManifest === undefined ||
      recoveryManifest.ordinal !== manifest.ordinal ||
      recoveryManifest.manifestSha256 !== manifest.manifestSha256 ||
      (recoveryManifest.disposition === 'valid') !==
        (revalidationText !== undefined)
    )
      throw safeError('audit', 'lineage')
    if (revalidationText !== undefined) {
      if (verdictText !== undefined || completedText !== undefined)
        throw safeError('audit', 'mixed-lineage')
      try {
        const revalidation = revalidationSchema.parse(
          JSON.parse(revalidationText),
        )
        if (
          revalidation.revalidationSha256 !==
            canonicalHash(revalidationCore(revalidation)) ||
          revalidation.ordinal !== manifest.ordinal ||
          revalidation.manifestSha256 !== manifest.manifestSha256 ||
          revalidation.predecessorCollisionAuditSha256 !==
            recoveryAudit.auditSha256 ||
          revalidation.predecessorReviewResultSha256 !==
            predecessor.exclusion.predecessorReviewResultSha256 ||
          revalidation.retainedPredecessorIdentitySetSha256 !==
            predecessor.exclusion.retainedPredecessorIdentitySetSha256 ||
          revalidation.predecessorExclusionAuthoritySha256 !==
            predecessor.exclusion.authoritySha256 ||
          revalidation.candidateReviewRoundSha256 !==
            predecessor.candidateReviewRoundSha256 ||
          revalidation.v3LockedResultSha256 !== lock.lockedResultSha256
        )
          throw new Error('revalidation binding')
      } catch {
        throw safeError('audit', 'revalidation')
      }
    } else {
      if (verdictText === undefined || completedText === undefined)
        throw safeError('audit', 'fresh-lineage')
      const materialized = await materializeCandidateReviewManifest(
        name,
        await readJson(paths.verdict),
        directory,
        fixtureReceipt,
        fixturePredecessorResult,
      )
      if (
        completedText !== `${JSON.stringify(materialized.completed, null, 2)}\n`
      )
        throw safeError('audit', 'completed-canonical')
      if (
        lock.verdictSha256 !== canonicalHash(materialized.verdict) ||
        lock.completedResultSha256 !==
          materialized.completed.completedResultSha256
      )
        throw safeError('audit', 'fresh-lineage')
    }
    locks.push(lock)
  }
  let audit: CandidateActiveCollisionAudit
  try {
    audit = createCandidateActiveCollisionAudit(
      prepared.receipt,
      expectedReceiptSha256,
      predecessor.predecessorReviewResult,
      recoveryAudit,
      locks,
    )
  } catch {
    throw safeError('audit', 'active-collision')
  }
  const auditText = `${JSON.stringify(audit, null, 2)}\n`
  if (existing !== undefined) {
    if (existing !== auditText) throw safeError('audit', 'changed')
    return audit
  }
  try {
    await writeFile(staging, auditText, { flag: 'wx' })
    await afterStaging?.()
    await rename(staging, destination)
  } catch (error) {
    if (afterStaging === undefined) await rm(staging, { force: true })
    throw error
  }
  return audit
}

export async function auditActiveCandidateReviewForFixture(
  directory: string,
  receipt: Receipt,
  predecessorReviewResult: unknown,
  afterStaging?: () => Promise<void>,
) {
  if (process.env.NODE_ENV !== 'test')
    throw new CandidateReviewCommandError(
      'Fixture candidate active audit is unavailable to live tooling.',
    )
  return auditActiveCandidateReviewInternal(
    directory,
    receipt,
    predecessorReviewResult,
    false,
    afterStaging,
  )
}

export async function auditActiveCandidateReview(directory = outputDirectory) {
  return auditActiveCandidateReviewInternal(directory)
}

async function finalizeCandidateReviewInternal(
  directory = outputDirectory,
  fixtureReceipt?: Receipt,
  fixturePredecessorResult?: unknown,
  phaseObserver?: (phase: CandidateReviewFinalizeTerminalPhase) => void,
  aggregatePhaseObserver?: (phase: CandidatePrimaryAggregatePhase) => void,
) {
  setCandidateReviewFinalizeTerminalPhase('recovery-clean', phaseObserver)
  await assertRecoveryClean(directory, 'finalize')
  setCandidateReviewFinalizeTerminalPhase('prepared-authority', phaseObserver)
  const prepared = await loadPrepared(directory, fixtureReceipt)
  setCandidateReviewFinalizeTerminalPhase(
    'predecessor-authority',
    phaseObserver,
  )
  const predecessor = await loadAcceptedPredecessorAuthority(
    fixturePredecessorResult,
  )
  setCandidateReviewFinalizeTerminalPhase('canonical-locks', phaseObserver)
  const locks = []
  for (const manifest of prepared.manifests) {
    const path = join(
      roundLocksDirectory(directory),
      `${manifestName(manifest.ordinal)}.locked.json`,
    )
    try {
      locks.push(
        JSON.parse(await readFile(path, 'utf8')) as ReturnType<
          typeof createLockedCandidateReviewManifest
        >,
      )
    } catch {
      throw safeError('finalize', 'incomplete-locks')
    }
  }
  let activeCollisionAudit: CandidateActiveCollisionAudit
  setCandidateReviewFinalizeTerminalPhase(
    'active-collision-audit',
    phaseObserver,
  )
  try {
    activeCollisionAudit = await auditActiveCandidateReviewInternal(
      directory,
      fixtureReceipt,
      fixturePredecessorResult,
      true,
    )
  } catch {
    throw safeError('finalize', 'active-collision-audit')
  }
  setCandidateReviewFinalizeTerminalPhase('recovery-audit', phaseObserver)
  const { audit: recoveryAudit } = await loadImmutableRecoveryAudit(
    directory,
    prepared,
    predecessor,
    'finalize',
  )
  setCandidateReviewFinalizeTerminalPhase('round-scaffold', phaseObserver)
  const promotionPlan = await validateRoundTwoScaffold(
    directory,
    recoveryAudit,
    'finalize',
  )
  setCandidateReviewFinalizeTerminalPhase('recovery-acceptance', phaseObserver)
  const acceptedRound = assertAcceptedRecoveryRound(
    recoveryAudit,
    promotionPlan,
    'finalize',
  )
  setCandidateReviewFinalizeTerminalPhase(
    'authority-construction',
    phaseObserver,
  )
  const authority = createCandidateAcquisitionReviewAuthority({
    schema: 'zedarchive.anime-v2-candidate-acquisition-review-authority',
    version: 3,
    candidateReceiptSha256: expectedReceiptSha256,
    predecessorReviewResultSha256:
      predecessor.exclusion.predecessorReviewResultSha256,
    retainedPredecessorIdentitySetSha256:
      predecessor.exclusion.retainedPredecessorIdentitySetSha256,
    predecessorExclusionAuthoritySha256: predecessor.exclusion.authoritySha256,
    candidateReviewRoundSha256: predecessor.candidateReviewRoundSha256,
    reviewRoundPromotionPlanSha256: acceptedRound.promotionPlanSha256,
    activeCollisionAudit,
    sourceReceipt: prepared.acquisition.sourceReceipt,
    manifests: prepared.manifests,
    outcomes: prepared.acquisition.outcomes,
    lockedReviews: locks,
  })
  setCandidateReviewFinalizeTerminalPhase('aggregate-derivation', phaseObserver)
  const aggregate = derivePrimaryCandidateReviewFromAuthority(
    prepared.receipt,
    expectedReceiptSha256,
    authority,
    predecessor.predecessorReviewResult,
    (phase) => setCandidatePrimaryAggregatePhase(phase, aggregatePhaseObserver),
  )
  setCandidateReviewFinalizeTerminalPhase('destination-vacancy', phaseObserver)
  const destination = finalizedDirectory(directory)
  try {
    await readdir(destination)
    throw new CandidateReviewCommandError(
      'Candidate finalization already exists; no overwrite is allowed.',
    )
  } catch (error) {
    if (
      error instanceof CandidateReviewCommandError ||
      (error as NodeJS.ErrnoException).code !== 'ENOENT'
    )
      throw error
  }
  const staging = join(directory, '.finalize-staging')
  let created = false
  try {
    setCandidateReviewFinalizeTerminalPhase('staging-create', phaseObserver)
    await mkdir(staging)
    created = true
    const safe = {
      schema: 'zedarchive.anime-v2-candidate-review-final-safe-aggregate',
      version: 1,
      manifests: 160,
      records: aggregate.records.length,
      approved: aggregate.orderedPrimaryApprovedQids.length,
      candidateReceiptSha256: expectedReceiptSha256,
      acquisitionSha256: prepared.acquisition.acquisitionSha256,
      sourceReceiptSha256:
        prepared.acquisition.sourceReceipt.sourceReceiptSha256,
      authoritySha256: authority.authoritySha256,
      primaryAggregateSha256: canonicalHash(aggregate),
    }
    setCandidateReviewFinalizeTerminalPhase('authority-write', phaseObserver)
    await writeFile(
      join(staging, 'authority.json'),
      `${JSON.stringify(authority, null, 2)}\n`,
      { flag: 'wx' },
    )
    setCandidateReviewFinalizeTerminalPhase('aggregate-write', phaseObserver)
    await writeFile(
      join(staging, 'primary-candidate-review.json'),
      `${JSON.stringify(aggregate, null, 2)}\n`,
      { flag: 'wx' },
    )
    setCandidateReviewFinalizeTerminalPhase(
      'safe-aggregate-write',
      phaseObserver,
    )
    await writeFile(
      join(staging, 'safe-aggregate.json'),
      `${JSON.stringify(safe, null, 2)}\n`,
      { flag: 'wx' },
    )
    setCandidateReviewFinalizeTerminalPhase('atomic-publication', phaseObserver)
    await rename(staging, destination)
    return safe
  } catch (error) {
    if (created) await rm(staging, { recursive: true, force: true })
    throw error
  }
}
export async function finalizeCandidateReview(directory = outputDirectory) {
  return finalizeCandidateReviewInternal(directory)
}
export async function finalizeCandidateReviewForFixture(
  directory: string,
  receipt: Receipt,
  predecessorReviewResult: unknown = { fixture: true },
  phaseObserver?: (phase: CandidateReviewFinalizeTerminalPhase) => void,
  aggregatePhaseObserver?: (phase: CandidatePrimaryAggregatePhase) => void,
) {
  if (process.env.NODE_ENV !== 'test')
    throw new CandidateReviewCommandError(
      'Fixture candidate review finalization is unavailable to live tooling.',
    )
  return finalizeCandidateReviewInternal(
    directory,
    receipt,
    predecessorReviewResult,
    phaseObserver,
    aggregatePhaseObserver,
  )
}

async function verifyCandidateRecoveryInternal(
  directory = outputDirectory,
  fixtureReceipt?: Receipt,
  fixturePredecessorResult?: unknown,
) {
  await assertRecoveryClean(directory, 'recovery')
  const prepared = await loadPrepared(directory, fixtureReceipt)
  const predecessor = await loadAcceptedPredecessorAuthority(
    fixturePredecessorResult,
  )
  const { audit } = await loadImmutableRecoveryAudit(
    directory,
    prepared,
    predecessor,
    'recovery',
  )
  const plan = await validateRoundTwoScaffold(directory, audit, 'recovery')
  await validatePersistedRevalidations(
    directory,
    prepared,
    predecessor,
    audit,
    'recovery',
  )
  const expectedQuarantine = audit.manifestResults.filter(
    ({ status }) => status === 'requires-quarantine',
  )
  const custodyRoot = join(
    directory,
    'quarantine',
    'retained-predecessor-collision',
  )
  let bundles: string[] = []
  try {
    bundles = await readdir(custodyRoot)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const expectedBundles = new Set(
    expectedQuarantine.map(({ ordinal }) =>
      createRecoveryCustodyPlan(ordinal, audit)
        .destinationDirectory.split('/')
        .at(-1)!,
    ),
  )
  if (
    bundles.length !== expectedBundles.size ||
    bundles.some((bundle) => !expectedBundles.has(bundle)) ||
    (await optionalText(activeAuditPath(directory))) !== undefined ||
    (await pathExists(finalizedDirectory(directory))) ||
    (await pathExists(join(directory, '.finalize-staging')))
  )
    throw safeError('recovery', 'verification')
  const roundEntries = await readdir(reviewRoundDirectory(directory))
  const allowedRoundEntries = new Set([
    'recovery-plan.json',
    'locks',
    'revalidations',
  ])
  if (roundEntries.some((entry) => !allowedRoundEntries.has(entry)))
    throw safeError('recovery', 'verification')
  for (const row of expectedQuarantine) {
    const custodyPlan = createRecoveryCustodyPlan(row.ordinal, audit)
    await validateRecoveryCustodyBundle(directory, audit, custodyPlan)
    const name = manifestName(row.ordinal)
    const legacySources = await Promise.all([
      optionalText(join(legacyVerdictsDirectory(directory), `${name}.json`)),
      optionalText(join(legacyCompletedDirectory(directory), `${name}.json`)),
      optionalText(join(locksDirectory(directory), `${name}.locked.json`)),
    ])
    if (legacySources.some((source) => source !== undefined))
      throw safeError('recovery', 'verification')
  }
  for (const row of audit.manifestResults.filter(
    ({ status }) => status === 'missing',
  )) {
    const name = manifestName(row.ordinal)
    const legacySources = await Promise.all([
      optionalText(join(legacyVerdictsDirectory(directory), `${name}.json`)),
      optionalText(join(legacyCompletedDirectory(directory), `${name}.json`)),
      optionalText(join(locksDirectory(directory), `${name}.locked.json`)),
    ])
    if (legacySources.some((source) => source !== undefined))
      throw safeError('recovery', 'verification')
  }
  const [freshVerdicts, freshCompleted] = await Promise.all([
    assertFlatInventory(roundVerdictsDirectory(directory), '\\.json'),
    assertFlatInventory(roundCompletedDirectory(directory), '\\.json'),
  ])
  if (freshVerdicts.size !== 0 || freshCompleted.size !== 0)
    throw safeError('recovery', 'verification')
  const roundLocks = await assertFlatInventory(
    roundLocksDirectory(directory),
    '\\.locked\\.json',
  )
  const expectedRoundLocks = new Set(
    audit.recoveryAudit.manifests
      .filter(({ disposition }) => disposition === 'valid')
      .map(({ ordinal }) => `${manifestName(ordinal)}.locked.json`),
  )
  if (
    roundLocks.size !== expectedRoundLocks.size ||
    [...roundLocks].some((lock) => !expectedRoundLocks.has(lock))
  )
    throw safeError('recovery', 'verification')
  if (
    fixtureReceipt === undefined &&
    (audit.records !== 7_958 ||
      audit.manifests !== 160 ||
      audit.collisionRecords !== 499 ||
      audit.collisionManifests !== 154 ||
      audit.artifactCounts.verdicts !== 115 ||
      audit.artifactCounts.completed !== 115 ||
      audit.artifactCounts.locks !== 100 ||
      audit.classifications.valid !== 41 ||
      audit.classifications.requiresQuarantine !== 74 ||
      audit.classifications.missing !== 45 ||
      expectedBundles.size !== 74 ||
      plan.files.length !== 82)
  )
    throw safeError('recovery', 'verification')
  return {
    records: audit.records,
    manifests: audit.manifests,
    collisions: audit.collisionRecords,
    revalidated: audit.classifications.valid,
    quarantined: audit.classifications.requiresQuarantine,
    missing: audit.classifications.missing,
    recoveryAuditSha256: audit.auditSha256,
    promotionPlanSha256: plan.promotionPlanSha256,
  }
}

export async function verifyCandidateRecoveryForFixture(
  directory: string,
  receipt: Receipt,
  predecessorReviewResult: unknown,
) {
  if (process.env.NODE_ENV !== 'test')
    throw new CandidateReviewCommandError(
      'Fixture candidate recovery verification is unavailable to live tooling.',
    )
  return verifyCandidateRecoveryInternal(
    directory,
    receipt,
    predecessorReviewResult,
  )
}

export async function checkCandidateReviewContract(
  directory = outputDirectory,
) {
  await readReceipt()
  try {
    await loadPrepared(directory)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

type FixtureDependencies = Readonly<{
  directory?: string
  receipt?: Receipt
  entities?: Record<string, WikidataEntity>
  requester?: SequentialCandidateRequester
  predecessorReviewResult?: unknown
  lockPhaseObserver?: (phase: CandidateReviewLockTerminalPhase) => void
  finalizePhaseObserver?: (phase: CandidateReviewFinalizeTerminalPhase) => void
  aggregatePhaseObserver?: (phase: CandidatePrimaryAggregatePhase) => void
  canonicalSubphaseObserver?: (
    subphase: CandidateReviewCanonicalSubphase,
  ) => void
  terminalDiagnosticSink?: (
    diagnostic: ReturnType<typeof createCandidateTerminalDiagnostic>,
  ) => void
}>
export async function runCandidateReviewCommandForFixture(
  args: readonly string[],
  dependencies: FixtureDependencies,
) {
  const command = parseCandidateReviewArguments(args)
  const directory = dependencies.directory ?? outputDirectory
  if (command.mode === 'check') return checkCandidateReviewContract(directory)
  if (command.mode === 'prepare') {
    const receipt = dependencies.receipt ?? (await readReceipt())
    await assertCandidateReviewOutputVacant(directory)
    const requester =
      dependencies.requester ?? new SequentialCandidateRequester()
    try {
      const entities =
        dependencies.entities ??
        (await fetchCandidateEntitiesBounded(
          receipt.candidates.map(({ qid }) => qid),
          requester,
        ))
      return writePreparedAtomically(
        buildCandidatePreparationArtifacts(
          receipt,
          entities,
          dependencies.entities ? undefined : requester.sourceEvidence(),
        ),
        directory,
      )
    } catch (error) {
      const evidence = requester.sourceEvidence()
      dependencies.terminalDiagnosticSink?.(
        createCandidateTerminalDiagnostic({
          stage: 'acquisition',
          outcome: 'stopped',
          candidates: receipt.candidates.length,
          manifests: Math.ceil(receipt.candidates.length / 50),
          requestEvidence: evidence.requestEvidence,
          rawAttemptSetCommitmentSha256: canonicalHash({
            version: 'candidate-raw-attempt-set.v1',
            values: evidence.rawAttemptSha256,
          }),
        }),
      )
      throw error
    }
  }
  if (command.mode === 'recover')
    return recoverCandidateReviewRoundTwoForFixture(
      directory,
      dependencies.receipt ?? (await readReceipt()),
      dependencies.predecessorReviewResult ?? { fixture: true },
    )
  if (command.mode === 'verify-recovery')
    return verifyCandidateRecoveryForFixture(
      directory,
      dependencies.receipt ?? (await readReceipt()),
      dependencies.predecessorReviewResult ?? { fixture: true },
    )
  if (command.mode === 'verify-canonical')
    return verifyCandidateCanonicalSubphaseForFixture(
      command.manifest,
      directory,
      {
        receipt: dependencies.receipt ?? (await readReceipt()),
        predecessorReviewResult: dependencies.predecessorReviewResult ?? {
          fixture: true,
        },
        subphaseObserver: dependencies.canonicalSubphaseObserver,
      },
    )
  if (command.mode === 'lock') {
    terminalLockPhase = undefined
    try {
      const result = await lockCandidateReviewManifestForFixture(
        command.manifest,
        directory,
        {
          receipt: dependencies.receipt ?? (await readReceipt()),
          predecessorReviewResult: dependencies.predecessorReviewResult ?? {
            fixture: true,
          },
          phaseObserver: dependencies.lockPhaseObserver,
          predecessorMetrics: {
            qids: [],
            retainedQids: Array.from(
              { length: 500 },
              (_, index) => `Q${900_000 + index}`,
            ),
            formatCounts: {},
            eraCounts: {},
            unknown: 0,
            audience: 0,
          },
          reserve: {
            publishedTarget: 0,
            audienceAnchorCount: 0,
            unknownYearMaximum: 0,
            formatFloors: {},
            eraFloors: {},
          },
        },
      )
      dependencies.terminalDiagnosticSink?.(
        createCandidateTerminalDiagnostic({
          stage: 'lock',
          outcome: 'completed',
          phase: terminalLockPhase,
        }),
      )
      return result
    } catch (error) {
      dependencies.terminalDiagnosticSink?.(
        createCandidateTerminalDiagnostic({
          stage: 'lock',
          outcome: 'stopped',
          phase: terminalLockPhase,
        }),
      )
      throw error
    }
  }
  if (command.mode === 'complete')
    return completeCandidateReviewManifestForFixture(
      command.manifest,
      directory,
      dependencies.receipt ?? (await readReceipt()),
      dependencies.predecessorReviewResult ?? { fixture: true },
    )
  if (command.mode === 'audit-active')
    return auditActiveCandidateReviewForFixture(
      directory,
      dependencies.receipt ?? (await readReceipt()),
      dependencies.predecessorReviewResult ?? { fixture: true },
    )
  let safe: Awaited<ReturnType<typeof finalizeCandidateReviewForFixture>>
  terminalFinalizePhase = undefined
  terminalAggregatePhase = undefined
  try {
    safe = await finalizeCandidateReviewForFixture(
      directory,
      dependencies.receipt ?? (await readReceipt()),
      dependencies.predecessorReviewResult ?? { fixture: true },
      dependencies.finalizePhaseObserver,
      dependencies.aggregatePhaseObserver,
    )
  } catch (error) {
    dependencies.terminalDiagnosticSink?.(
      createCandidateTerminalDiagnostic({
        stage: 'finalize',
        outcome: 'stopped',
        phase: terminalFinalizePhase,
        ...(terminalFinalizePhase === 'aggregate-derivation' &&
        terminalAggregatePhase
          ? { aggregatePhase: terminalAggregatePhase }
          : {}),
      }),
    )
    throw error
  }
  dependencies.terminalDiagnosticSink?.(
    createCandidateTerminalDiagnostic({
      stage: 'finalize',
      outcome: 'completed',
      phase: terminalFinalizePhase,
      candidates: safe.records,
      manifests: safe.manifests,
      locks: safe.manifests,
      sourceReceiptSha256: safe.sourceReceiptSha256,
      acquisitionSha256: safe.acquisitionSha256,
      authoritySha256: safe.authoritySha256,
    }),
  )
  return safe
}

export async function runCandidateReviewCommand(args: readonly string[]) {
  const command = parseCandidateReviewArguments(args)
  if (command.mode === 'verify-canonical') {
    console.log(
      JSON.stringify(await verifyCandidateCanonicalSubphase(command.manifest)),
    )
    return
  }
  terminalLockPhase = undefined
  terminalFinalizePhase = undefined
  terminalAggregatePhase = undefined
  terminalCommandStage =
    command.mode === 'prepare'
      ? 'acquisition'
      : command.mode === 'recover'
        ? 'recovery'
        : command.mode === 'audit-active'
          ? 'audit'
          : command.mode === 'verify-recovery'
            ? 'recovery'
            : command.mode
  if (command.mode === 'check') {
    await checkCandidateReviewContract()
    writeCandidateTerminalDiagnostic({ stage: 'check', outcome: 'completed' })
    return
  }
  if (command.mode === 'prepare') {
    throw safeError('acquisition', 'not-authorized')
  }
  if (command.mode === 'lock') {
    await lockCandidateReviewManifest(command.manifest)
    writeCandidateTerminalDiagnostic({
      stage: 'lock',
      outcome: 'completed',
      phase: terminalLockPhase,
    })
    return
  }
  if (command.mode === 'complete') {
    await completeCandidateReviewManifest(command.manifest)
    writeCandidateTerminalDiagnostic({
      stage: 'complete',
      outcome: 'completed',
    })
    return
  }
  if (command.mode === 'recover') {
    await recoverCandidateReviewRoundTwo()
    const verification = await verifyCandidateRecoveryInternal()
    writeCandidateTerminalDiagnostic({
      stage: 'recovery',
      outcome: 'completed',
      candidates: verification.records,
      manifests: verification.manifests,
      collisions: verification.collisions,
      revalidated: verification.revalidated,
      quarantined: verification.quarantined,
      missing: verification.missing,
      recoveryAuditSha256: verification.recoveryAuditSha256,
      promotionPlanSha256: verification.promotionPlanSha256,
    })
    return
  }
  if (command.mode === 'verify-recovery') {
    const verification = await verifyCandidateRecoveryInternal()
    writeCandidateTerminalDiagnostic({
      stage: 'recovery',
      outcome: 'completed',
      candidates: verification.records,
      manifests: verification.manifests,
      collisions: verification.collisions,
      revalidated: verification.revalidated,
      quarantined: verification.quarantined,
      missing: verification.missing,
      recoveryAuditSha256: verification.recoveryAuditSha256,
      promotionPlanSha256: verification.promotionPlanSha256,
    })
    return
  }
  if (command.mode === 'audit-active') {
    const audit = await auditActiveCandidateReview()
    writeCandidateTerminalDiagnostic({
      stage: 'audit',
      outcome: 'completed',
      candidates: audit.records,
      manifests: audit.manifests.length,
      locks: audit.manifests.length,
      correctlyRejectedCollisions: audit.correctlyRejectedCollisionCount,
      violations: audit.violationCount,
      authoritySha256: audit.auditSha256,
    })
    return
  }
  await assertCorrectedCandidateFinalizationPreflightInternal(
    outputDirectory,
    liveCorrectedFinalizationExpectation,
  )
  const safe = await finalizeCandidateReview()
  writeCandidateTerminalDiagnostic({
    stage: 'finalize',
    outcome: 'completed',
    phase: terminalFinalizePhase,
    candidates: safe.records,
    manifests: safe.manifests,
    locks: safe.manifests,
    sourceReceiptSha256: safe.sourceReceiptSha256,
    acquisitionSha256: safe.acquisitionSha256,
    authoritySha256: safe.authoritySha256,
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  runCandidateReviewCommand(process.argv.slice(2)).catch(() => {
    if (!terminalDiagnosticWritten)
      console.error(
        JSON.stringify(
          createCandidateTerminalDiagnostic({
            stage: terminalCommandStage,
            outcome: 'stopped',
            ...(terminalCommandStage === 'lock' && terminalLockPhase
              ? { phase: terminalLockPhase }
              : {}),
            ...(terminalCommandStage === 'finalize' && terminalFinalizePhase
              ? { phase: terminalFinalizePhase }
              : {}),
            ...(terminalCommandStage === 'finalize' &&
            terminalFinalizePhase === 'aggregate-derivation' &&
            terminalAggregatePhase
              ? { aggregatePhase: terminalAggregatePhase }
              : {}),
          }),
        ),
      )
    process.exitCode = 1
  })

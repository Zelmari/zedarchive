import { createHash } from 'node:crypto'
import { constants as filesystemConstants } from 'node:fs'
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  realpath,
  readdir,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from '@/config/zod'
import {
  runPolicyNativeToolchainDerivation,
  runPolicyProvisionalBuildB,
  runPolicyProvisionalBuildC,
} from '@/../scripts/m45-policy-baseline-native-authority'
import { policyReviewerLaunchPolicy } from '@/../scripts/m45-policy-baseline-reviewer-launch-policy'
import {
  buildReviewedPolicyReviewerCommand,
  buildReviewedPolicyReviewerStdin,
  createReviewedPolicyReviewerLaunch,
} from '@/../scripts/m45-policy-baseline-reviewer-wrapper'
import {
  canonicalJson,
  discoverySha256,
  discoveryUserAgent,
} from '@/features/anime/catalogue/wikidata-anime-discovery'

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const byteCountSchema = z
  .number()
  .int()
  .positive()
  .max(1024 * 1024)
const canonicalTimestampSchema = z.iso
  .datetime()
  .refine((value) => new Date(value).toISOString() === value)

export const wikimediaPolicyUrls = [
  'https://www.wikidata.org/wiki/Wikidata:Licensing',
  'https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_API_Usage_Guidelines',
  'https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy',
  'https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/documentation/access-policy.html',
  'https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/reference/page-views.html',
] as const

export const policyReviewLimits = {
  urls: 5,
  timeoutMilliseconds: 10_000,
  maximumBytesPerBody: 1024 * 1024,
  maximumTotalBytes: 5 * 1024 * 1024,
  outputBytes: 4 * 1024,
  stdoutBytes: 256 * 1024,
  stderrBytes: 256 * 1024,
  combinedOutputBytes: 384 * 1024,
} as const

export const policyExclusivePromotionRoots = [
  '.local/m45/.policy-exclusive-promotion-build',
  '.local/m45/.policy-exclusive-promotion-preflight',
] as const
export const policyExclusivePromotionLockPath =
  '.local/m45/.policy-exclusive-promotion.lock' as const
export const policyDarwinFileFlags = {
  noFollow: 0x00000100,
  closeOnExec: 0x01000000,
  exclusiveLock: 0x00000020,
  nonblocking: 0x00000004,
} as const
export const policyReviewRoots = [
  '.local/m45/continuity-review',
  '.local/m45/identity-allocation',
  '.local/m45/independent-review',
  '.local/m45/policy-baseline-review',
  ...policyExclusivePromotionRoots,
] as const
export const policyReviewStagingSiblings = [
  '.local/m45/.continuity-review.staging',
  '.local/m45/.identity-allocation.staging',
  '.local/m45/.independent-review.staging',
  '.local/m45/.policy-baseline-review.staging',
] as const
export const orderedPolicyUrlSequenceSha256 =
  discoverySha256(wikimediaPolicyUrls)
const outcomeSchema = z.enum([
  'no-material-change',
  'licensing-material-change',
  'identification-material-change',
  'rate-or-concurrency-material-change',
  'access-or-auth-material-change',
  'republishing-material-change',
  'endpoint-or-retirement-material-change',
  'unexpected-policy-change',
])

type RetrievalCore = Readonly<{
  schema:
    | 'wikimedia-policy-baseline-capture.v1'
    | 'wikimedia-policy-semantic-review-retrieval.v1'
  version: 1
  retrievedAt: string
  orderedUrlSequenceSha256: string
  decodedBodySha256: readonly string[]
  decodedBodyBytes: readonly number[]
  totalDecodedBytes: number
  requests: 5
  successes: 5
  outcome: 'complete'
}>

const retrievalShape = {
  version: z.literal(1),
  retrievedAt: canonicalTimestampSchema,
  orderedUrlSequenceSha256: z.literal(orderedPolicyUrlSequenceSha256),
  decodedBodySha256: z.array(sha256Schema).length(5),
  decodedBodyBytes: z.array(byteCountSchema).length(5),
  totalDecodedBytes: z
    .number()
    .int()
    .positive()
    .max(policyReviewLimits.maximumTotalBytes),
  requests: z.literal(5),
  successes: z.literal(5),
  outcome: z.literal('complete'),
}

export const policyBaselineCaptureSchema = z.strictObject({
  schema: z.literal('wikimedia-policy-baseline-capture.v1'),
  ...retrievalShape,
  captureSha256: sha256Schema,
})
export const policySemanticReviewRetrievalSchema = z.strictObject({
  schema: z.literal('wikimedia-policy-semantic-review-retrieval.v1'),
  ...retrievalShape,
  semanticReviewRetrievalSha256: sha256Schema,
})

export type PolicyBaselineCapture = z.infer<typeof policyBaselineCaptureSchema>
export type PolicySemanticReviewRetrieval = z.infer<
  typeof policySemanticReviewRetrievalSchema
>

function assertRetrievalCore(core: RetrievalCore): void {
  const bytes = core.decodedBodyBytes
  if (
    bytes.some((value) => value > policyReviewLimits.maximumBytesPerBody) ||
    bytes.reduce((sum, value) => sum + value, 0) !== core.totalDecodedBytes
  )
    throw new PolicyBaselineError('policy-body-shape')
}

function captureCore(capture: PolicyBaselineCapture) {
  const { captureSha256: _hash, ...core } = capture
  void _hash
  return core
}
function retrievalCore(retrieval: PolicySemanticReviewRetrieval) {
  const { semanticReviewRetrievalSha256: _hash, ...core } = retrieval
  void _hash
  return core
}

export class PolicyBaselineError extends Error {
  constructor(readonly category: PolicyTerminalCategory) {
    super(`Policy baseline stopped safely: ${category}.`)
    this.name = 'PolicyBaselineError'
  }
}
export const policyTerminalCategories = [
  'policy-arguments',
  'policy-root-state',
  'policy-http',
  'policy-redirect',
  'policy-timeout',
  'policy-body-limit',
  'policy-body-shape',
  'policy-byte-drift',
  'policy-authority',
  'policy-role-output',
  'policy-wrapper-contract',
  'policy-wrapper-isolation',
  'policy-wrapper-output',
  'policy-exclusive-promotion-unavailable',
  'policy-custody',
] as const
export type PolicyTerminalCategory = (typeof policyTerminalCategories)[number]

export function createPolicyBaselineCapture(
  input: Omit<RetrievalCore, 'schema' | 'version'>,
): PolicyBaselineCapture {
  const core = {
    schema: 'wikimedia-policy-baseline-capture.v1' as const,
    version: 1 as const,
    ...input,
  }
  assertRetrievalCore(core)
  return policyBaselineCaptureSchema.parse({
    ...core,
    captureSha256: discoverySha256(core),
  })
}

export function parsePolicyBaselineCapture(
  input: unknown,
  now = new Date(),
): PolicyBaselineCapture {
  const capture = policyBaselineCaptureSchema.parse(input)
  assertRetrievalCore(capture)
  if (capture.captureSha256 !== discoverySha256(captureCore(capture)))
    throw new PolicyBaselineError('policy-authority')
  if (new Date(capture.retrievedAt) > now)
    throw new PolicyBaselineError('policy-authority')
  return capture
}

export function createPolicySemanticReviewRetrieval(
  input: Omit<RetrievalCore, 'schema' | 'version'>,
): PolicySemanticReviewRetrieval {
  const core = {
    schema: 'wikimedia-policy-semantic-review-retrieval.v1' as const,
    version: 1 as const,
    ...input,
  }
  assertRetrievalCore(core)
  return policySemanticReviewRetrievalSchema.parse({
    ...core,
    semanticReviewRetrievalSha256: discoverySha256(core),
  })
}

export function parsePolicySemanticReviewRetrieval(
  input: unknown,
  captureInput: unknown,
  now = new Date(),
): PolicySemanticReviewRetrieval {
  const capture = parsePolicyBaselineCapture(captureInput, now)
  const retrieval = policySemanticReviewRetrievalSchema.parse(input)
  assertRetrievalCore(retrieval)
  if (
    retrieval.semanticReviewRetrievalSha256 !==
      discoverySha256(retrievalCore(retrieval)) ||
    new Date(retrieval.retrievedAt) < new Date(capture.retrievedAt) ||
    new Date(retrieval.retrievedAt) > now ||
    canonicalJson({
      orderedUrlSequenceSha256: retrieval.orderedUrlSequenceSha256,
      decodedBodySha256: retrieval.decodedBodySha256,
      decodedBodyBytes: retrieval.decodedBodyBytes,
      totalDecodedBytes: retrieval.totalDecodedBytes,
    }) !==
      canonicalJson({
        orderedUrlSequenceSha256: capture.orderedUrlSequenceSha256,
        decodedBodySha256: capture.decodedBodySha256,
        decodedBodyBytes: capture.decodedBodyBytes,
        totalDecodedBytes: capture.totalDecodedBytes,
      })
  )
    throw new PolicyBaselineError('policy-byte-drift')
  return retrieval
}

export const policySemanticReviewRoleOutputSchema = z.strictObject({
  schema: z.literal('wikimedia-policy-semantic-review-role-output.v1'),
  version: z.literal(1),
  captureSha256: sha256Schema,
  semanticReviewRetrievalSha256: sha256Schema,
  reviewerContractSha256: sha256Schema,
  outcome: outcomeSchema,
})
export type PolicySemanticReviewRoleOutput = z.infer<
  typeof policySemanticReviewRoleOutputSchema
>

export function parsePolicyRoleOutputJson(
  text: string,
): PolicySemanticReviewRoleOutput {
  if (Buffer.byteLength(text) > policyReviewLimits.outputBytes)
    throw new PolicyBaselineError('policy-wrapper-output')
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new PolicyBaselineError('policy-role-output')
  }
  const output = policySemanticReviewRoleOutputSchema.parse(parsed)
  if (canonicalJson(output) !== text)
    throw new PolicyBaselineError('policy-role-output')
  return output
}

export const policySemanticReviewRoleResultSchema = z.strictObject({
  schema: z.literal('wikimedia-policy-semantic-review-role-result.v1'),
  version: z.literal(1),
  roleOutput: policySemanticReviewRoleOutputSchema,
  roleOutputSha256: sha256Schema,
  roleResultSha256: sha256Schema,
})
export type PolicySemanticReviewRoleResult = z.infer<
  typeof policySemanticReviewRoleResultSchema
>
function roleResultCore(result: PolicySemanticReviewRoleResult) {
  const { roleResultSha256: _hash, ...core } = result
  void _hash
  return core
}
export function createPolicySemanticReviewRoleResult(
  exactOutputJson: string,
): PolicySemanticReviewRoleResult {
  const roleOutput = parsePolicyRoleOutputJson(exactOutputJson)
  const core = {
    schema: 'wikimedia-policy-semantic-review-role-result.v1' as const,
    version: 1 as const,
    roleOutput,
    roleOutputSha256: sha256Bytes(Buffer.from(exactOutputJson)),
  }
  return policySemanticReviewRoleResultSchema.parse({
    ...core,
    roleResultSha256: discoverySha256(core),
  })
}
export function parsePolicySemanticReviewRoleResult(
  input: unknown,
): PolicySemanticReviewRoleResult {
  const result = policySemanticReviewRoleResultSchema.parse(input)
  if (
    result.roleResultSha256 !== discoverySha256(roleResultCore(result)) ||
    result.roleOutputSha256 !==
      sha256Bytes(Buffer.from(canonicalJson(result.roleOutput)))
  )
    throw new PolicyBaselineError('policy-role-output')
  return result
}

export const policySemanticReviewSchema = z.strictObject({
  schema: z.literal('wikimedia-policy-semantic-review.v1'),
  version: z.literal(1),
  capture: policyBaselineCaptureSchema,
  retrieval: policySemanticReviewRetrievalSchema,
  roleResult: policySemanticReviewRoleResultSchema,
  outcome: outcomeSchema,
  semanticReviewSha256: sha256Schema,
})
export type PolicySemanticReview = z.infer<typeof policySemanticReviewSchema>
function semanticReviewCore(value: PolicySemanticReview) {
  const { semanticReviewSha256: _hash, ...core } = value
  void _hash
  return core
}
export async function finalizePolicySemanticReview(
  input: Readonly<{
    capture: unknown
    retrieval: unknown
    roleResult: unknown
    now?: Date
  }>,
): Promise<PolicySemanticReview> {
  const contract = await createPolicyReviewerContract()
  const capture = parsePolicyBaselineCapture(input.capture, input.now)
  const retrieval = parsePolicySemanticReviewRetrieval(
    input.retrieval,
    capture,
    input.now,
  )
  const roleResult = parsePolicySemanticReviewRoleResult(input.roleResult)
  const output = roleResult.roleOutput
  if (
    output.captureSha256 !== capture.captureSha256 ||
    output.semanticReviewRetrievalSha256 !==
      retrieval.semanticReviewRetrievalSha256 ||
    output.reviewerContractSha256 !== contract.reviewerContractSha256
  )
    throw new PolicyBaselineError('policy-authority')
  const core = {
    schema: 'wikimedia-policy-semantic-review.v1' as const,
    version: 1 as const,
    capture,
    retrieval,
    roleResult,
    outcome: output.outcome,
  }
  return policySemanticReviewSchema.parse({
    ...core,
    semanticReviewSha256: discoverySha256(core),
  })
}

export const policyBaselineSchema = z.strictObject({
  schema: z.literal('wikimedia-policy-baseline.v1'),
  version: z.literal(1),
  capture: policyBaselineCaptureSchema,
  retrieval: policySemanticReviewRetrievalSchema,
  semanticReview: policySemanticReviewSchema,
  orderedUrlSequenceSha256: z.literal(orderedPolicyUrlSequenceSha256),
  decodedBodySha256: z.array(sha256Schema).length(5),
  decodedBodyBytes: z.array(byteCountSchema).length(5),
  totalDecodedBytes: z.number().int().positive(),
  outcome: z.literal('no-material-change'),
  reviewedAt: canonicalTimestampSchema,
  baselineSha256: sha256Schema,
})
export async function createPolicyBaseline(
  input: Readonly<{
    capture: unknown
    retrieval: unknown
    semanticReview: unknown
    now?: Date
  }>,
) {
  const semanticReview = policySemanticReviewSchema.parse(input.semanticReview)
  if (
    semanticReview.semanticReviewSha256 !==
    discoverySha256(semanticReviewCore(semanticReview))
  )
    throw new PolicyBaselineError('policy-authority')
  const review = await finalizePolicySemanticReview({
    capture: input.capture,
    retrieval: input.retrieval,
    roleResult: semanticReview.roleResult,
    now: input.now,
  })
  if (
    review.semanticReviewSha256 !== semanticReview.semanticReviewSha256 ||
    review.outcome !== 'no-material-change'
  )
    throw new PolicyBaselineError('policy-authority')
  const core = {
    schema: 'wikimedia-policy-baseline.v1' as const,
    version: 1 as const,
    capture: review.capture,
    retrieval: review.retrieval,
    semanticReview: review,
    orderedUrlSequenceSha256: review.capture.orderedUrlSequenceSha256,
    decodedBodySha256: review.capture.decodedBodySha256,
    decodedBodyBytes: review.capture.decodedBodyBytes,
    totalDecodedBytes: review.capture.totalDecodedBytes,
    outcome: review.outcome,
    reviewedAt: review.retrieval.retrievedAt,
  }
  return policyBaselineSchema.parse({
    ...core,
    baselineSha256: discoverySha256(core),
  })
}
export async function parsePolicyBaseline(input: unknown, now = new Date()) {
  const baseline = policyBaselineSchema.parse(input)
  const { baselineSha256: _hash, ...core } = baseline
  void _hash
  if (baseline.baselineSha256 !== discoverySha256(core))
    throw new PolicyBaselineError('policy-authority')
  const recomputed = await createPolicyBaseline({
    capture: baseline.capture,
    retrieval: baseline.retrieval,
    semanticReview: baseline.semanticReview,
    now,
  })
  if (canonicalJson(recomputed) !== canonicalJson(baseline))
    throw new PolicyBaselineError('policy-authority')
  return baseline
}

export type PolicyBody = Readonly<{
  bytes: Uint8Array
  sha256: string
  byteCount: number
}>
function sha256Bytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}
export function assertCanonicalUtf8(bytes: Uint8Array): void {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new PolicyBaselineError('policy-body-shape')
  }
  if (!Buffer.from(text, 'utf8').equals(Buffer.from(bytes)))
    throw new PolicyBaselineError('policy-body-shape')
}
export function buildPolicyReviewerStdin(
  bodies: readonly PolicyBody[],
  prompt: Uint8Array,
  commitments: Readonly<{
    captureSha256: string
    semanticReviewRetrievalSha256: string
    reviewerContractSha256: string
  }>,
): Uint8Array {
  try {
    return buildReviewedPolicyReviewerStdin(bodies, prompt, commitments)
  } catch {
    throw new PolicyBaselineError('policy-body-shape')
  }
}

export type PolicyFetch = (url: URL, init: RequestInit) => Promise<Response>
export async function retrievePolicyBodiesForFixture(
  input: Readonly<{
    fetch: PolicyFetch
    completedAt: () => Date
  }>,
): Promise<
  Readonly<{
    capture: Omit<RetrievalCore, 'schema' | 'version'>
    bodies: readonly PolicyBody[]
  }>
> {
  if (process.env.NODE_ENV !== 'test')
    throw new PolicyBaselineError('policy-wrapper-isolation')
  const bodies: PolicyBody[] = []
  for (const value of wikimediaPolicyUrls) {
    const response = await input.fetch(new URL(value), {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': discoveryUserAgent },
    })
    if (
      response.type === 'opaqueredirect' ||
      response.status < 200 ||
      response.status >= 300
    )
      throw new PolicyBaselineError(
        response.status >= 300 && response.status < 400
          ? 'policy-redirect'
          : 'policy-http',
      )
    const bytes = await readCompletePolicyBody(
      response,
      policyReviewLimits.maximumBytesPerBody,
    )
    bodies.push({
      bytes,
      byteCount: bytes.byteLength,
      sha256: sha256Bytes(bytes),
    })
  }
  const totalDecodedBytes = bodies.reduce(
    (sum, body) => sum + body.byteCount,
    0,
  )
  if (totalDecodedBytes > policyReviewLimits.maximumTotalBytes)
    throw new PolicyBaselineError('policy-body-limit')
  return {
    capture: {
      retrievedAt: input.completedAt().toISOString(),
      orderedUrlSequenceSha256: orderedPolicyUrlSequenceSha256,
      decodedBodySha256: bodies.map((body) => body.sha256),
      decodedBodyBytes: bodies.map((body) => body.byteCount),
      totalDecodedBytes,
      requests: 5,
      successes: 5,
      outcome: 'complete',
    },
    bodies,
  }
}
async function readCompletePolicyBody(
  response: Response,
  maximumBytes: number,
): Promise<Uint8Array> {
  if (response.body === null) throw new PolicyBaselineError('policy-body-shape')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (value === undefined)
        throw new PolicyBaselineError('policy-body-shape')
      bytes += value.byteLength
      if (bytes > maximumBytes)
        throw new PolicyBaselineError('policy-body-limit')
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  if (bytes === 0) throw new PolicyBaselineError('policy-body-shape')
  return Buffer.concat(chunks)
}

export const policyRoleOutputFilename = 'role-output.json' as const
export const policyReviewInventory = {
  capture: ['capture.json'],
  roleInput: [
    'body-01.bin',
    'body-02.bin',
    'body-03.bin',
    'body-04.bin',
    'body-05.bin',
    'manifest.json',
    'retrieval.json',
  ],
  roleResult: [policyRoleOutputFilename, 'role-result.json'],
} as const
const roleInputBodyFilenameSchema = z.enum([
  'body-01.bin',
  'body-02.bin',
  'body-03.bin',
  'body-04.bin',
  'body-05.bin',
])
const roleInputBodySchema = z.strictObject({
  name: roleInputBodyFilenameSchema,
  byteCount: byteCountSchema,
  sha256: sha256Schema,
})
export const policyRoleInputManifestSchema = z.strictObject({
  schema: z.literal('wikimedia-policy-semantic-review-role-input.v1'),
  version: z.literal(1),
  captureSha256: sha256Schema,
  semanticReviewRetrievalSha256: sha256Schema,
  bodies: z.array(roleInputBodySchema).length(5),
  manifestSha256: sha256Schema,
})
export type PolicyRoleInputManifest = z.infer<
  typeof policyRoleInputManifestSchema
>
function roleInputManifestCore(manifest: PolicyRoleInputManifest) {
  const { manifestSha256: _hash, ...core } = manifest
  void _hash
  return core
}
export function createPolicyRoleInputManifest(
  input: Omit<PolicyRoleInputManifest, 'schema' | 'version' | 'manifestSha256'>,
): PolicyRoleInputManifest {
  const core = {
    schema: 'wikimedia-policy-semantic-review-role-input.v1' as const,
    version: 1 as const,
    ...input,
  }
  return parsePolicyRoleInputManifest({
    ...core,
    manifestSha256: discoverySha256(core),
  })
}
export function parsePolicyRoleInputManifest(
  input: unknown,
): PolicyRoleInputManifest {
  const manifest = policyRoleInputManifestSchema.parse(input)
  if (
    manifest.manifestSha256 !==
      discoverySha256(roleInputManifestCore(manifest)) ||
    manifest.bodies.some(
      (body, index) => body.name !== policyReviewInventory.roleInput[index],
    ) ||
    new Set(manifest.bodies.map((body) => body.name)).size !== 5
  )
    throw new PolicyBaselineError('policy-custody')
  return manifest
}
export function validatePolicyRoleInputManifestAgainstAuthorities(
  input: unknown,
  captureInput: unknown,
  retrievalInput: unknown,
  now = new Date(),
): PolicyRoleInputManifest {
  const manifest = parsePolicyRoleInputManifest(input)
  const capture = parsePolicyBaselineCapture(captureInput, now)
  const retrieval = parsePolicySemanticReviewRetrieval(
    retrievalInput,
    capture,
    now,
  )
  if (
    manifest.captureSha256 !== capture.captureSha256 ||
    manifest.semanticReviewRetrievalSha256 !==
      retrieval.semanticReviewRetrievalSha256 ||
    manifest.bodies.reduce((sum, body) => sum + body.byteCount, 0) !==
      retrieval.totalDecodedBytes ||
    manifest.bodies.some(
      (body, index) =>
        body.sha256 !== retrieval.decodedBodySha256[index] ||
        body.byteCount !== retrieval.decodedBodyBytes[index],
    )
  )
    throw new PolicyBaselineError('policy-custody')
  return manifest
}
export const policyCustodyPhases = [
  'absent',
  'capture',
  'role-input',
  'role-result',
] as const
export type PolicyCustodyPhase = (typeof policyCustodyPhases)[number]
type PolicyBundleMetadata = Readonly<{
  name: 'capture' | 'role-input' | 'role-result'
  entries: readonly string[]
  mode: number
  device: number
  parentDevice: number
  linked: boolean
  fileModes: readonly number[]
}>
const custodyPhaseBundles: Readonly<
  Record<PolicyCustodyPhase, readonly PolicyBundleMetadata['name'][]>
> = {
  absent: [],
  capture: ['capture'],
  'role-input': ['capture', 'role-input'],
  'role-result': ['capture', 'role-input', 'role-result'],
}
const inventoryForBundle: Readonly<
  Record<PolicyBundleMetadata['name'], readonly string[]>
> = {
  capture: policyReviewInventory.capture,
  'role-input': policyReviewInventory.roleInput,
  'role-result': policyReviewInventory.roleResult,
}
export type PolicyPathState = Readonly<{
  exists: boolean
  directory?: boolean
  mode?: number
  nlink?: number
  device?: number
}>
export function assertPolicyReviewRootVacancy(
  states: Readonly<Record<(typeof policyReviewRoots)[number], PolicyPathState>>,
): void {
  for (const root of policyReviewRoots) {
    const state = states[root]
    if (
      state === undefined ||
      state.exists ||
      (state.nlink !== undefined && state.nlink !== 1)
    )
      throw new PolicyBaselineError('policy-root-state')
  }
}
export function assertPolicyBundleInventory(
  input: Readonly<{
    entries: readonly string[]
    expected: readonly string[]
    mode: number
    device: number
    parentDevice: number
    linked: boolean
  }>,
): void {
  if (
    input.mode !== 0o700 ||
    input.device !== input.parentDevice ||
    input.linked ||
    canonicalJson([...input.entries].sort()) !==
      canonicalJson([...input.expected].sort())
  )
    throw new PolicyBaselineError('policy-custody')
}
/** Valid interrupted bundles are only revalidated; this function never resumes I/O. */
export function assertPolicyCustodyPhase(
  input: Readonly<{
    phase: PolicyCustodyPhase
    rootMode: number
    rootDevice: number
    bundles: readonly PolicyBundleMetadata[]
    stagingEntries: readonly string[]
  }>,
): void {
  const expectedBundles = custodyPhaseBundles[input.phase]
  if (
    input.rootMode !== 0o700 ||
    input.stagingEntries.length !== 0 ||
    input.bundles.length !== expectedBundles.length ||
    input.bundles.some(
      (bundle, index) => bundle.name !== expectedBundles[index],
    )
  )
    throw new PolicyBaselineError('policy-custody')
  for (const bundle of input.bundles) {
    assertPolicyBundleInventory({
      entries: bundle.entries,
      expected: inventoryForBundle[bundle.name],
      mode: bundle.mode,
      device: bundle.device,
      parentDevice: input.rootDevice,
      linked: bundle.linked,
    })
    if (
      bundle.fileModes.length !== bundle.entries.length ||
      bundle.fileModes.some((mode) => mode !== 0o600)
    )
      throw new PolicyBaselineError('policy-custody')
  }
}

const assetDirectory = fileURLToPath(
  new URL('./policy-baseline-review/', import.meta.url),
)
export const policyReviewerAssetPaths = {
  prompt: `${assetDirectory}reviewer-prompt.txt`,
  outputSchema: `${assetDirectory}role-output.schema.json`,
  sandboxProfile: `${assetDirectory}reviewer-sandbox.sb`,
  framing: `${assetDirectory}stdin-framing.v1.txt`,
  wrapperSource: fileURLToPath(
    new URL('./m45-policy-baseline-reviewer-wrapper.ts', import.meta.url),
  ),
  launchPolicy: fileURLToPath(
    new URL('./m45-policy-baseline-reviewer-launch-policy.ts', import.meta.url),
  ),
} as const
export const policyExclusivePromotionHelperSourcePath = fileURLToPath(
  new URL(
    './policy-baseline-review/exclusive-promotion-helper.c',
    import.meta.url,
  ),
)
export const policyLockPreflightWorkerPath = fileURLToPath(
  new URL(
    './policy-baseline-review/lock-preflight-worker.mjs',
    import.meta.url,
  ),
)
export const policyNativeLaunchContractPath = fileURLToPath(
  new URL('./m45-policy-baseline-native-launch-contract.ts', import.meta.url),
)
export const policyNativeLauncherPath = fileURLToPath(
  new URL('./m45-policy-baseline-native-launcher.ts', import.meta.url),
)
export const policyNativeAuthorityPath = fileURLToPath(
  new URL('./m45-policy-baseline-native-authority.ts', import.meta.url),
)
export async function inspectPolicyNativeLaunchSources(): Promise<
  Readonly<{
    launchContractByteCount: number
    launchContractSha256: string
    launcherByteCount: number
    launcherSha256: string
    nativeAuthorityByteCount: number
    nativeAuthoritySha256: string
  }>
> {
  const [contract, launcher, nativeAuthority] = await Promise.all([
    readFile(policyNativeLaunchContractPath),
    readFile(policyNativeLauncherPath),
    readFile(policyNativeAuthorityPath),
  ])
  return {
    launchContractByteCount: contract.byteLength,
    launchContractSha256: sha256Bytes(contract),
    launcherByteCount: launcher.byteLength,
    launcherSha256: sha256Bytes(launcher),
    nativeAuthorityByteCount: nativeAuthority.byteLength,
    nativeAuthoritySha256: sha256Bytes(nativeAuthority),
  }
}
export async function inspectPolicyLockPreflightWorker(): Promise<
  Readonly<{ byteCount: number; sha256: string }>
> {
  const bytes = await readFile(policyLockPreflightWorkerPath)
  return { byteCount: bytes.byteLength, sha256: sha256Bytes(bytes) }
}
const policyToolchainAuthorityCoreSchema = z.strictObject({
  schema: z.literal('policy-toolchain-authority.v1'),
  version: z.literal(1),
  compilerPath: z.string().min(1),
  sdkRoot: z.string().min(1),
  xcrunSha256: sha256Schema,
  xcrunDevice: z.string().regex(/^(?:0|[1-9][0-9]*)$/),
  xcrunInode: z.string().regex(/^[1-9][0-9]*$/),
  sourceSha256: sha256Schema,
  compilerSha256: sha256Schema,
  compilerDevice: z.string().regex(/^(?:0|[1-9][0-9]*)$/),
  compilerInode: z.string().regex(/^[1-9][0-9]*$/),
  sdkIdentitySha256: sha256Schema,
  sdkDevice: z.string().regex(/^(?:0|[1-9][0-9]*)$/),
  sdkInode: z.string().regex(/^[1-9][0-9]*$/),
  headerSetSha256: sha256Schema,
  diagnosticSha256: sha256Schema,
  compileContractSha256: sha256Schema,
  launchContractSha256: sha256Schema,
  launcherSha256: sha256Schema,
  nativeAuthoritySha256: sha256Schema,
  lockPreflightWorkerSha256: sha256Schema,
})
export const policyToolchainAuthoritySchema = policyToolchainAuthorityCoreSchema
  .extend({ authorityPackageSha256: sha256Schema })
  .strict()
export type PolicyToolchainAuthority = z.infer<
  typeof policyToolchainAuthoritySchema
>
const productionPolicyToolchainAuthorityHashes = new Set<string>()
function createPolicyToolchainAuthorityFromCore(
  input: z.input<typeof policyToolchainAuthorityCoreSchema>,
): PolicyToolchainAuthority {
  let core: z.infer<typeof policyToolchainAuthorityCoreSchema>
  try {
    core = policyToolchainAuthorityCoreSchema.parse(input)
  } catch {
    throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
  }
  return {
    ...core,
    authorityPackageSha256: sha256Bytes(Buffer.from(canonicalJson(core))),
  }
}
export function createPolicyToolchainAuthorityForFixture(
  input: z.input<typeof policyToolchainAuthorityCoreSchema>,
): PolicyToolchainAuthority {
  if (process.env.NODE_ENV !== 'test')
    throw new PolicyBaselineError('policy-wrapper-isolation')
  return createPolicyToolchainAuthorityFromCore(input)
}
export function parsePolicyToolchainAuthority(
  input: unknown,
): PolicyToolchainAuthority {
  let value: PolicyToolchainAuthority
  try {
    value = policyToolchainAuthoritySchema.parse(input)
  } catch {
    throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
  }
  const { authorityPackageSha256, ...core } = value
  if (
    createPolicyToolchainAuthorityFromCore(core).authorityPackageSha256 !==
    authorityPackageSha256
  )
    throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
  return value
}

export async function derivePolicyToolchainAuthority(
  repositoryRootInput: string,
): Promise<Readonly<{ authority: PolicyToolchainAuthority }>> {
  const repositoryRoot = await realpath(repositoryRootInput)
  if (
    repositoryRoot !== repositoryRootInput ||
    resolve(repositoryRoot) !== repositoryRoot
  )
    throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
  const launch = await inspectPolicyNativeLaunchSources()
  const authority = parsePolicyToolchainAuthority(
    await runPolicyNativeToolchainDerivation({
      repositoryRoot,
      nativeAuthoritySha256: launch.nativeAuthoritySha256,
    }),
  )
  const launchAfter = await inspectPolicyNativeLaunchSources()
  if (launchAfter.nativeAuthoritySha256 !== authority.nativeAuthoritySha256)
    throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
  productionPolicyToolchainAuthorityHashes.add(authority.authorityPackageSha256)
  return { authority }
}

/**
 * The policy trust root consumes only the completed strict B result.  It does
 * not receive a candidate capability, helper descriptor, FD map, launch plan,
 * or any of the bridge's intermediate filesystem state.
 */
export async function derivePolicyProvisionalBuildB(
  input: Readonly<{
    repositoryRoot: string
    rootNonceSha256: string
    cleanedStageAPackage: unknown
  }>,
): Promise<
  Readonly<{
    preflight: PolicyExclusivePromotionPreflightAuthority
    package: PolicyPromotionPackage
  }>
> {
  const repositoryRoot = await realpath(input.repositoryRoot)
  if (
    repositoryRoot !== input.repositoryRoot ||
    resolve(repositoryRoot) !== repositoryRoot
  )
    throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
  const launch = await inspectPolicyNativeLaunchSources()
  const result = await runPolicyProvisionalBuildB({
    repositoryRoot,
    nativeAuthoritySha256: launch.nativeAuthoritySha256,
    rootNonceSha256: input.rootNonceSha256,
    cleanedStageAPackage: input.cleanedStageAPackage,
  })
  if (result === null || typeof result !== 'object')
    throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
  const { preflight, package: packageInput } = result as Record<string, unknown>
  const acceptedPreflight = assertPolicyExclusivePromotionPreflight(preflight)
  const acceptedPackage = parsePolicyPromotionPackage(packageInput)
  if (
    acceptedPackage.stage !== 'B' ||
    acceptedPackage.preflightAuthoritySha256 !==
      acceptedPreflight.preflightAuthoritySha256 ||
    acceptedPackage.material.nativeAuthoritySha256 !==
      launch.nativeAuthoritySha256
  )
    throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
  return Object.freeze({
    preflight: acceptedPreflight,
    package: acceptedPackage,
  })
}

/**
 * The trust root consumes only C's completed paired authority. It deliberately
 * cannot receive C's admission, helper, cleanup session, or checkpoint.
 */
export async function derivePolicyAcceptanceBuildC(
  input: Readonly<{
    repositoryRoot: string
    rootNonceSha256: string
    acceptedLiterals: unknown
    cleanedStageAPackage: unknown
    cleanedStageBPackage: unknown
  }>,
): Promise<
  Readonly<{
    preflight: PolicyExclusivePromotionPreflightAuthority
    package: PolicyPromotionPackage
  }>
> {
  const repositoryRoot = await realpath(input.repositoryRoot)
  if (
    repositoryRoot !== input.repositoryRoot ||
    resolve(repositoryRoot) !== repositoryRoot
  )
    throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
  const accepted = parsePolicyPromotionPackage(input.acceptedLiterals)
  if (accepted.stage !== 'accepted')
    throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
  const launch = await inspectPolicyNativeLaunchSources()
  const result = await runPolicyProvisionalBuildC({
    repositoryRoot,
    nativeAuthoritySha256: launch.nativeAuthoritySha256,
    rootNonceSha256: input.rootNonceSha256,
    acceptedLiterals: accepted,
    cleanedStageAPackage: input.cleanedStageAPackage,
    cleanedStageBPackage: input.cleanedStageBPackage,
  })
  if (result === null || typeof result !== 'object')
    throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
  const { preflight, package: packageInput } = result as Record<string, unknown>
  const cPreflight = assertPolicyExclusivePromotionPreflight(preflight)
  const cPackage = parsePolicyPromotionPackage(packageInput)
  try {
    await assertPolicyPromotionAcceptanceBuild({
      acceptanceBuild: cPackage,
      acceptedLiterals: accepted,
      provisionalRootIdentitySha256: [
        parsePolicyPromotionPackage(input.cleanedStageAPackage)
          .rootIdentitySha256!,
        parsePolicyPromotionPackage(input.cleanedStageBPackage)
          .rootIdentitySha256!,
      ],
      preflightAuthority: cPreflight,
    })
  } catch {
    throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
  }
  if (cPackage.material.nativeAuthoritySha256 !== launch.nativeAuthoritySha256)
    throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
  return Object.freeze({ preflight: cPreflight, package: cPackage })
}
export function assertPolicyDarwinNodeFlags(): void {
  if (
    process.platform !== 'darwin' ||
    filesystemConstants.O_NOFOLLOW !== policyDarwinFileFlags.noFollow ||
    filesystemConstants.O_NONBLOCK !== policyDarwinFileFlags.nonblocking
  )
    throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
}
export const policyCommandLockOpenContract = {
  create:
    filesystemConstants.O_RDWR |
    filesystemConstants.O_CREAT |
    filesystemConstants.O_EXCL |
    policyDarwinFileFlags.noFollow |
    policyDarwinFileFlags.closeOnExec |
    policyDarwinFileFlags.exclusiveLock |
    policyDarwinFileFlags.nonblocking,
  existing:
    filesystemConstants.O_RDWR |
    policyDarwinFileFlags.noFollow |
    policyDarwinFileFlags.closeOnExec |
    policyDarwinFileFlags.exclusiveLock |
    policyDarwinFileFlags.nonblocking,
  mode: 0o600,
  writesPermitted: false,
  persistent: true,
} as const
export async function createPolicyLockPreflightLaunchForFixture(
  repositoryRoot: string,
): Promise<
  Readonly<{
    command: readonly string[]
    environment: Readonly<Record<string, never>>
    stdoutByteLimit: 0
    stderrByteLimit: 0
    workerSha256: string
  }>
> {
  if (process.env.NODE_ENV !== 'test')
    throw new PolicyBaselineError('policy-wrapper-isolation')
  if (
    !/^\/(?:[A-Za-z0-9._+-]+\/)*[A-Za-z0-9._+-]+$/u.test(repositoryRoot) ||
    repositoryRoot.split('/').some((segment) => segment === '..')
  )
    throw new PolicyBaselineError('policy-custody')
  const worker = await inspectPolicyLockPreflightWorker()
  return {
    command: [
      process.execPath,
      policyLockPreflightWorkerPath,
      'lock-preflight',
      repositoryRoot,
    ],
    environment: {},
    stdoutByteLimit: 0,
    stderrByteLimit: 0,
    workerSha256: worker.sha256,
  }
}
const policyExclusivePromotionBuildRoot =
  '.local/m45/.policy-exclusive-promotion-build'
export const policyExclusivePromotionBuildContract = {
  platform: 'darwin',
  resolver: '/usr/bin/xcrun',
  compilerResolverCommand: ['/usr/bin/xcrun', '--find', 'clang'],
  sdkResolverCommand: ['/usr/bin/xcrun', '--sdk', 'macosx', '--show-sdk-path'],
  sourceSnapshot: `${policyExclusivePromotionBuildRoot}/exclusive-promotion-helper.c`,
  helper: `${policyExclusivePromotionBuildRoot}/exclusive-promotion-helper`,
  temporaryDirectory: `${policyExclusivePromotionBuildRoot}/tmp`,
  fixedCompilerArguments: [
    '-std=c17',
    '-Wall',
    '-Wextra',
    '-Werror',
    '-Wpedantic',
    '-O2',
  ],
  environment: {
    TMPDIR: `${policyExclusivePromotionBuildRoot}/tmp`,
  },
  timeoutMilliseconds: 30_000,
  stdoutByteLimit: 64 * 1024,
  stderrByteLimit: 64 * 1024,
  combinedOutputByteLimit: 96 * 1024,
  helperTimeoutMilliseconds: 5_000,
  helperOutputByteLimit: 0,
  sourceSnapshotMode: 0o400,
  helperMode: 0o500,
  rootMode: 0o700,
  fileMode: 0o600,
  shell: false,
  detachedProcessGroup: true,
} as const
export function createPolicyExclusivePromotionToolchainPlanForFixture(
  input: Readonly<{ compiler: string; sdkRoot: string }>,
): Readonly<{ compile: readonly string[]; diagnostic: readonly string[] }> {
  if (process.env.NODE_ENV !== 'test')
    throw new PolicyBaselineError('policy-wrapper-isolation')
  const safeAbsolutePath = /^\/(?:[A-Za-z0-9._+-]+\/)*[A-Za-z0-9._+-]+$/u
  if (
    !safeAbsolutePath.test(input.compiler) ||
    !safeAbsolutePath.test(input.sdkRoot) ||
    [input.compiler, input.sdkRoot].some((value) =>
      value.split('/').some((segment) => segment === '.' || segment === '..'),
    )
  )
    throw new PolicyBaselineError('policy-custody')
  const common = [
    input.compiler,
    ...policyExclusivePromotionBuildContract.fixedCompilerArguments,
  ]
  const suffix = [
    '-isysroot',
    input.sdkRoot,
    '-o',
    policyExclusivePromotionBuildContract.helper,
    policyExclusivePromotionBuildContract.sourceSnapshot,
  ]
  return {
    compile: [...common, ...suffix],
    diagnostic: [...common, '-###', ...suffix],
  }
}
export const policyExclusivePromotionLaunchContract = {
  sourceParentFd: 3,
  destinationParentFd: 4,
  parentOpenFlags: ['O_DIRECTORY', 'O_NOFOLLOW', 'O_CLOEXEC'],
  stdio: [
    'ignore',
    'pipe',
    'pipe',
    'source-parent-fd',
    'destination-parent-fd',
  ],
  environment: {},
  shell: false,
  detachedProcessGroup: true,
  timeoutMilliseconds: 5_000,
  stdoutByteLimit: 0,
  stderrByteLimit: 0,
} as const
export const policyMetadataRoles = {
  'build-root': { type: 'directory', mode: 0o700, links: 5, size: 'na' },
  'build-tmp': { type: 'directory', mode: 0o700, links: 2, size: 'na' },
  'build-source': { type: 'file', mode: 0o400, links: 1, size: 'positive' },
  'build-helper': { type: 'file', mode: 0o500, links: 1, size: 'positive' },
  'preflight-root': {
    type: 'directory',
    mode: 0o700,
    links: 'exact',
    size: 'na',
  },
  'preflight-directory': {
    type: 'directory',
    mode: 0o700,
    links: 'exact',
    size: 'na',
  },
  'preflight-file': { type: 'file', mode: 0o600, links: 1, size: 'positive' },
  'custody-file': { type: 'file', mode: 0o600, links: 1, size: 'positive' },
  'command-lock': { type: 'file', mode: 0o600, links: 1, size: 'zero' },
} as const
export type PolicyMetadataRole = keyof typeof policyMetadataRoles
type PolicyMetadataEvidence = Readonly<{
  uid: string
  device: string
  inode: string
  links: string
  mode: string
  size: string
}>
const unsignedDecimalPattern = /^(?:0|[1-9][0-9]*)$/u
function assertDecimalMetadataEvidence(evidence: PolicyMetadataEvidence): void {
  if (
    [
      evidence.uid,
      evidence.device,
      evidence.inode,
      evidence.links,
      evidence.mode,
    ].some((value) => !unsignedDecimalPattern.test(value)) ||
    evidence.inode === '0' ||
    evidence.links === '0'
  )
    throw new PolicyBaselineError('policy-custody')
}
export function createPolicyMetadataInvocationForFixture(
  role: PolicyMetadataRole,
  evidence: PolicyMetadataEvidence,
): Readonly<{ arguments: readonly string[]; highestChildFd: 3 }> {
  if (process.env.NODE_ENV !== 'test')
    throw new PolicyBaselineError('policy-wrapper-isolation')
  assertDecimalMetadataEvidence(evidence)
  const contract = policyMetadataRoles[role]
  if (
    contract === undefined ||
    Number(evidence.mode) !== contract.mode ||
    (typeof contract.links === 'number' &&
      Number(evidence.links) !== contract.links) ||
    (contract.size === 'na'
      ? evidence.size !== 'na'
      : !unsignedDecimalPattern.test(evidence.size) ||
        (contract.size === 'positive' && evidence.size === '0') ||
        (contract.size === 'zero' && evidence.size !== '0'))
  )
    throw new PolicyBaselineError('policy-custody')
  return {
    arguments: [
      'metadata-check',
      role,
      evidence.uid,
      evidence.device,
      evidence.inode,
      evidence.links,
      evidence.mode,
      evidence.size,
    ],
    highestChildFd: 3,
  }
}
export type PolicyDescriptorEvidence = Readonly<{
  fd: number
  kind: 'character-device' | 'directory' | 'file'
  distinctIdentity: string
}>
export function createPolicyNativeFdMapForFixture(
  mode: 'metadata' | 'acl-fixture' | 'promotion' | 'delete-entry',
  fillers: readonly PolicyDescriptorEvidence[],
  authority: readonly PolicyDescriptorEvidence[],
): readonly (string | number)[] {
  if (process.env.NODE_ENV !== 'test')
    throw new PolicyBaselineError('policy-wrapper-isolation')
  const requiredAuthority =
    mode === 'metadata' || mode === 'acl-fixture'
      ? 1
      : mode === 'promotion'
        ? 2
        : 3
  const highestTarget = requiredAuthority + 2
  const expectedAuthorityKinds =
    mode === 'acl-fixture'
      ? ['directory']
      : mode === 'promotion'
        ? ['directory', 'directory']
        : mode === 'delete-entry'
          ? ['file', 'directory', undefined]
          : [undefined]
  if (
    fillers.length !== 3 ||
    new Set(fillers.map((filler) => filler.fd)).size !== 3 ||
    fillers.some((filler) => filler.kind !== 'character-device') ||
    authority.length !== requiredAuthority ||
    new Set(authority.map((handle) => handle.fd)).size !== requiredAuthority ||
    new Set([...fillers, ...authority].map((handle) => handle.fd)).size !==
      fillers.length + authority.length ||
    new Set(authority.map((handle) => handle.distinctIdentity)).size !==
      requiredAuthority ||
    authority.some(
      (handle, index) =>
        handle.fd <= highestTarget ||
        (expectedAuthorityKinds[index] !== undefined &&
          handle.kind !== expectedAuthorityKinds[index]) ||
        ((mode === 'metadata' || (mode === 'delete-entry' && index === 2)) &&
          handle.kind !== 'file' &&
          handle.kind !== 'directory'),
    )
  )
    throw new PolicyBaselineError('policy-custody')
  return ['ignore', 'pipe', 'pipe', ...authority.map((handle) => handle.fd)]
}
const policyPreflightFixtureBytes = {
  'preflight-success-source-file':
    'zedarchive-m45-exclusive-success-source-v1\n',
  'preflight-success-destination-file':
    'zedarchive-m45-exclusive-success-destination-v1\n',
  'preflight-collision-source-file':
    'zedarchive-m45-exclusive-collision-source-v1\n',
  'preflight-collision-destination-file':
    'zedarchive-m45-exclusive-collision-destination-v1\n',
} as const
export const policyDeleteEntryRoles = [
  'build-source',
  'build-helper',
  'build-tmp',
  'build-root',
  'preflight-success-source-file',
  'preflight-success-destination-file',
  'preflight-collision-source-file',
  'preflight-collision-destination-file',
  'preflight-success-destination-promotion',
  'preflight-success-source-promotion',
  'preflight-collision-source-promotion',
  'preflight-collision-destination-promotion',
  'preflight-success-source-directory',
  'preflight-success-destination-directory',
  'preflight-collision-source-directory',
  'preflight-collision-destination-directory',
  'preflight-acl-fixture-directory',
  'preflight-root',
] as const
export type PolicyDeleteEntryRole = (typeof policyDeleteEntryRoles)[number]
export const policyDeleteEntryTransitions: Readonly<
  Record<
    PolicyDeleteEntryRole,
    Readonly<{ before: readonly string[]; after: readonly string[] }>
  >
> = {
  'build-source': {
    before: [
      'exclusive-promotion-helper.c',
      'exclusive-promotion-helper',
      'tmp',
    ],
    after: ['exclusive-promotion-helper', 'tmp'],
  },
  'build-helper': {
    before: ['exclusive-promotion-helper', 'tmp'],
    after: ['tmp'],
  },
  'build-tmp': {
    before: ['exclusive-promotion-helper', 'tmp'],
    after: ['exclusive-promotion-helper'],
  },
  'build-root': {
    before: [
      '.policy-exclusive-promotion.lock',
      '.policy-exclusive-promotion-build',
    ],
    after: ['.policy-exclusive-promotion.lock'],
  },
  'preflight-success-source-file': {
    before: ['fixture.bin'],
    after: [],
  },
  'preflight-success-destination-file': {
    before: ['fixture.bin'],
    after: [],
  },
  'preflight-collision-source-file': {
    before: ['fixture.bin'],
    after: [],
  },
  'preflight-collision-destination-file': {
    before: ['fixture.bin'],
    after: [],
  },
  'preflight-success-destination-promotion': {
    before: ['fixture.bin', 'promotion'],
    after: ['fixture.bin'],
  },
  'preflight-success-source-promotion': {
    before: ['fixture.bin', 'promotion'],
    after: ['fixture.bin'],
  },
  'preflight-collision-source-promotion': {
    before: ['fixture.bin', 'promotion'],
    after: ['fixture.bin'],
  },
  'preflight-collision-destination-promotion': {
    before: ['fixture.bin', 'promotion'],
    after: ['fixture.bin'],
  },
  'preflight-success-source-directory': {
    before: [
      'success-source',
      'success-destination',
      'collision-source',
      'collision-destination',
      'acl-fixture',
    ],
    after: [
      'success-destination',
      'collision-source',
      'collision-destination',
      'acl-fixture',
    ],
  },
  'preflight-success-destination-directory': {
    before: [
      'success-destination',
      'collision-source',
      'collision-destination',
      'acl-fixture',
    ],
    after: ['collision-source', 'collision-destination', 'acl-fixture'],
  },
  'preflight-collision-source-directory': {
    before: ['collision-source', 'collision-destination', 'acl-fixture'],
    after: ['collision-destination', 'acl-fixture'],
  },
  'preflight-collision-destination-directory': {
    before: ['collision-destination', 'acl-fixture'],
    after: ['acl-fixture'],
  },
  'preflight-acl-fixture-directory': {
    before: ['acl-fixture'],
    after: [],
  },
  'preflight-root': {
    before: [
      '.policy-exclusive-promotion.lock',
      '.policy-exclusive-promotion-preflight',
    ],
    after: ['.policy-exclusive-promotion.lock'],
  },
}
export function assertPolicyDeleteEntryTransitionForFixture(
  input: Readonly<{
    role: PolicyDeleteEntryRole
    beforeEntries: readonly string[]
    afterEntries: readonly string[]
    beforeLinks: number
    afterLinks: number
    preflightAuthority: unknown
  }>,
): void {
  if (process.env.NODE_ENV !== 'test')
    throw new PolicyBaselineError('policy-wrapper-isolation')
  const transition = policyDeleteEntryTransitions[input.role]
  const preflight = assertPolicyExclusivePromotionPreflight(
    input.preflightAuthority,
  )
  if (
    transition === undefined ||
    canonicalJson([...input.beforeEntries].sort()) !==
      canonicalJson([...transition.before].sort()) ||
    canonicalJson([...input.afterEntries].sort()) !==
      canonicalJson([...transition.after].sort()) ||
    input.beforeLinks !== 2 + transition.before.length ||
    input.afterLinks !== input.beforeLinks - 1 ||
    input.afterLinks !== 2 + transition.after.length ||
    preflight.apfsRegularFileDelete.beforeLinks !== 3 ||
    preflight.apfsRegularFileDelete.afterLinks !== 2 ||
    preflight.apfsDirectoryDelete.beforeLinks !== 3 ||
    preflight.apfsDirectoryDelete.afterLinks !== 2
  )
    throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
}
export function policyPreflightFixtureTable(): Readonly<
  Record<string, Readonly<{ byteCount: number; sha256: string }>>
> {
  return Object.fromEntries(
    Object.entries(policyPreflightFixtureBytes).map(([role, value]) => {
      const bytes = Buffer.from(value)
      return [role, { byteCount: bytes.byteLength, sha256: sha256Bytes(bytes) }]
    }),
  )
}
export function createPolicyDeleteEntryInvocationForFixture(
  role: PolicyDeleteEntryRole,
  parent: PolicyMetadataEvidence,
  child: PolicyMetadataEvidence,
): Readonly<{ arguments: readonly string[]; highestChildFd: 5 }> {
  if (process.env.NODE_ENV !== 'test')
    throw new PolicyBaselineError('policy-wrapper-isolation')
  if (!(policyDeleteEntryRoles as readonly string[]).includes(role))
    throw new PolicyBaselineError('policy-custody')
  assertDecimalMetadataEvidence(parent)
  assertDecimalMetadataEvidence(child)
  const directoryRoles = new Set<PolicyDeleteEntryRole>([
    'build-tmp',
    'build-root',
    'preflight-success-source-directory',
    'preflight-success-destination-directory',
    'preflight-collision-source-directory',
    'preflight-collision-destination-directory',
    'preflight-acl-fixture-directory',
    'preflight-root',
  ])
  const fileMode =
    role === 'build-source' ? 0o400 : role === 'build-helper' ? 0o500 : 0o600
  const fixture = policyPreflightFixtureTable()[role]
  const transition = policyDeleteEntryTransitions[role]
  if (
    parent.mode !== String(0o700) ||
    parent.size !== 'na' ||
    Number(parent.links) !== 2 + transition.before.length ||
    child.uid !== parent.uid ||
    child.device !== parent.device ||
    child.inode === parent.inode ||
    (directoryRoles.has(role)
      ? child.mode !== String(0o700) ||
        child.links !== '2' ||
        child.size !== 'na'
      : child.mode !== String(fileMode) ||
        child.links !== '1' ||
        !unsignedDecimalPattern.test(child.size) ||
        child.size === '0' ||
        (fixture !== undefined && Number(child.size) !== fixture.byteCount))
  )
    throw new PolicyBaselineError('policy-custody')
  return {
    arguments: [
      'delete-entry',
      role,
      parent.uid,
      parent.device,
      parent.inode,
      parent.links,
      parent.mode,
      parent.size,
      child.uid,
      child.device,
      child.inode,
      child.links,
      child.mode,
      child.size,
    ],
    highestChildFd: 5,
  }
}
export type PolicyNativeHeldHandle = Readonly<{
  fd: number
  role: 'filler' | 'authority' | 'command-lock'
  close: () => Promise<void>
}>
export async function openPolicyNativeFillersForFixture(
  openNull: () => Promise<PolicyNativeHeldHandle & PolicyDescriptorEvidence>,
): Promise<
  readonly [
    PolicyNativeHeldHandle & PolicyDescriptorEvidence,
    PolicyNativeHeldHandle & PolicyDescriptorEvidence,
    PolicyNativeHeldHandle & PolicyDescriptorEvidence,
  ]
> {
  if (process.env.NODE_ENV !== 'test')
    throw new PolicyBaselineError('policy-wrapper-isolation')
  const opened: (PolicyNativeHeldHandle & PolicyDescriptorEvidence)[] = []
  try {
    for (let index = 0; index < 3; index += 1) opened.push(await openNull())
    if (
      opened.some(
        (handle) =>
          handle.role !== 'filler' || handle.kind !== 'character-device',
      ) ||
      new Set(opened.map((handle) => handle.fd)).size !== 3
    )
      throw new PolicyBaselineError('policy-custody')
    return opened as [
      PolicyNativeHeldHandle & PolicyDescriptorEvidence,
      PolicyNativeHeldHandle & PolicyDescriptorEvidence,
      PolicyNativeHeldHandle & PolicyDescriptorEvidence,
    ]
  } catch (error) {
    for (const handle of opened.sort((a, b) => b.fd - a.fd))
      await handle.close()
    throw error
  }
}
export type PolicyNativeChild = Readonly<{
  pid: number | undefined
  waitForClose: () => Promise<
    Readonly<{
      code: number | null
      signal: string | null
      streamsClosed: boolean
      epipe: boolean
      spawnError: boolean
    }>
  >
  requestProcessGroupKill: () => void
  proveProcessGroupAbsent: () => Promise<boolean>
  closePipes: () => Promise<void>
}>
export async function runPolicyNativeProcessForFixture(
  input: Readonly<{
    stdoutLimit: number
    stderrLimit: number
    combinedLimit: number
    retainDiagnostics?: boolean
    fillers: readonly [
      PolicyNativeHeldHandle,
      PolicyNativeHeldHandle,
      PolicyNativeHeldHandle,
    ]
    authority: readonly PolicyNativeHeldHandle[]
    commandLock: PolicyNativeHeldHandle
    revalidateCommandLock: () => Promise<void>
    spawn: (
      onDiagnostic: (stream: 'stdout' | 'stderr', chunk: Uint8Array) => void,
    ) => Promise<PolicyNativeChild>
    armTimeout: (onTimeout: () => void) => () => void
  }>,
): Promise<
  Readonly<{
    stdoutBytes: number
    stderrBytes: number
    stdout: Buffer
    stderr: Buffer
  }>
> {
  if (process.env.NODE_ENV !== 'test')
    throw new PolicyBaselineError('policy-wrapper-isolation')
  if (
    ![input.stdoutLimit, input.stderrLimit, input.combinedLimit].every(
      (limit) => Number.isSafeInteger(limit) && limit >= 0,
    ) ||
    input.commandLock.role !== 'command-lock' ||
    input.fillers.some((handle) => handle.role !== 'filler') ||
    input.authority.some((handle) => handle.role !== 'authority')
  )
    throw new PolicyBaselineError('policy-custody')
  let child: PolicyNativeChild | undefined
  let stdoutBytes = 0
  let stderrBytes = 0
  let failed = false
  let killRequested = false
  let closeObserved = false
  const stdoutChunks: Buffer[] = []
  const stderrChunks: Buffer[] = []
  const requestKill = () => {
    failed = true
    if (killRequested || child?.pid === undefined || child.pid <= 0) return
    killRequested = true
    try {
      child.requestProcessGroupKill()
    } catch {
      failed = true
    }
  }
  const onDiagnostic = (stream: 'stdout' | 'stderr', chunk: Uint8Array) => {
    if (stream === 'stdout') stdoutBytes += chunk.byteLength
    else stderrBytes += chunk.byteLength
    if (
      stdoutBytes > input.stdoutLimit ||
      stderrBytes > input.stderrLimit ||
      stdoutBytes + stderrBytes > input.combinedLimit
    )
      requestKill()
    else if (input.retainDiagnostics) {
      if (stream === 'stdout') stdoutChunks.push(Buffer.from(chunk))
      else stderrChunks.push(Buffer.from(chunk))
    }
  }
  let cancelTimeout: () => void = () => undefined
  try {
    await input.revalidateCommandLock()
    child = await input.spawn(onDiagnostic)
    await input.revalidateCommandLock()
    if (child.pid === undefined || child.pid <= 0) failed = true
    if (failed) requestKill()
    cancelTimeout = input.armTimeout(requestKill)
    const outcome = await child.waitForClose()
    closeObserved = true
    cancelTimeout()
    await input.revalidateCommandLock()
    if (
      outcome.code !== 0 ||
      outcome.signal !== null ||
      !outcome.streamsClosed ||
      outcome.epipe ||
      outcome.spawnError
    )
      requestKill()
    if (child.pid !== undefined && child.pid > 0) {
      if (!(await child.proveProcessGroupAbsent())) {
        requestKill()
        if (!(await child.proveProcessGroupAbsent())) failed = true
      }
    }
  } catch {
    requestKill()
    failed = true
    if (child !== undefined && !closeObserved) {
      try {
        await child.waitForClose()
        closeObserved = true
      } catch {
        failed = true
      }
    }
    if (child?.pid !== undefined && child.pid > 0) {
      try {
        if (!(await child.proveProcessGroupAbsent())) failed = true
      } catch {
        failed = true
      }
    }
  } finally {
    cancelTimeout()
    try {
      await child?.closePipes()
    } catch {
      failed = true
    }
    for (const handle of [...input.authority].reverse()) {
      try {
        await handle.close()
      } catch {
        failed = true
      }
    }
    for (const handle of [...input.fillers].sort((a, b) => b.fd - a.fd)) {
      try {
        await handle.close()
      } catch {
        failed = true
      }
    }
    await input.revalidateCommandLock()
  }
  if (failed) throw new PolicyBaselineError('policy-custody')
  return {
    stdoutBytes,
    stderrBytes,
    stdout: Buffer.concat(stdoutChunks),
    stderr: Buffer.concat(stderrChunks),
  }
}
export async function readPolicyHeldFileForFixture(
  input: Readonly<{
    role: Extract<
      PolicyMetadataRole,
      'build-source' | 'build-helper' | 'preflight-file' | 'custody-file'
    >
    expected: Readonly<{
      uid: number
      device: number
      inode: number
      mode: number
      size: number
      sha256: string
    }>
    statHeld: () => Promise<PolicyStat>
    validateHeldAcl: () => Promise<void>
    readHeld: () => Promise<Buffer>
    validatePathIdentity: () => Promise<void>
  }>,
): Promise<Buffer> {
  if (process.env.NODE_ENV !== 'test')
    throw new PolicyBaselineError('policy-wrapper-isolation')
  const validate = async () => {
    const stat = await input.statHeld()
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.uid !== input.expected.uid ||
      stat.dev !== input.expected.device ||
      stat.ino !== input.expected.inode ||
      stat.nlink !== 1 ||
      (stat.mode & 0o7777) !== input.expected.mode ||
      stat.size !== input.expected.size
    )
      throw new PolicyBaselineError('policy-custody')
    await input.validateHeldAcl()
    await input.validatePathIdentity()
  }
  await validate()
  const bytes = await input.readHeld()
  if (
    bytes.byteLength !== input.expected.size ||
    sha256Bytes(bytes) !== input.expected.sha256
  )
    throw new PolicyBaselineError('policy-byte-drift')
  await validate()
  return bytes
}
export async function deletePolicyHeldFileForFixture(
  input: Readonly<{
    role: Extract<
      PolicyDeleteEntryRole,
      | 'build-source'
      | 'build-helper'
      | 'preflight-success-source-file'
      | 'preflight-success-destination-file'
      | 'preflight-collision-source-file'
      | 'preflight-collision-destination-file'
    >
    expected: Readonly<{ byteCount: number; sha256: string }>
    validateHeld: () => Promise<void>
    validateNameBoundBeforeDelete: () => Promise<void>
    readHeld: () => Promise<Buffer>
    invokeNativeDelete: () => Promise<void>
    proveNameAbsent: () => Promise<void>
    transition: Readonly<{
      beforeEntries: readonly string[]
      afterEntries: readonly string[]
      beforeLinks: number
      afterLinks: number
      preflightAuthority: unknown
    }>
  }>,
): Promise<void> {
  if (process.env.NODE_ENV !== 'test')
    throw new PolicyBaselineError('policy-wrapper-isolation')
  const authenticateHeldBytes = async () => {
    await input.validateHeld()
    const bytes = await input.readHeld()
    if (
      bytes.byteLength !== input.expected.byteCount ||
      sha256Bytes(bytes) !== input.expected.sha256
    )
      throw new PolicyBaselineError('policy-byte-drift')
    await input.validateHeld()
  }
  await input.validateNameBoundBeforeDelete()
  await authenticateHeldBytes()
  await input.invokeNativeDelete()
  await input.proveNameAbsent()
  await authenticateHeldBytes()
  assertPolicyDeleteEntryTransitionForFixture({
    role: input.role,
    ...input.transition,
  })
}

export type PolicyTerminalBuildState =
  | 'terminal-prestate'
  | 'terminal-helper-unlinked'
  | 'terminal-root-removed-unproved'
  | 'terminal-unclassifiable'
export const policyProductionBuildCleanupSequence = [
  'build-source',
  'build-tmp',
  'delete-build-terminal',
] as const

function classifyPolicyTerminalBuildState(
  input: Readonly<{
    helperShaMatches: boolean
    parentEntries: readonly string[]
    parentLinks: number
    buildEntries: readonly string[]
    buildLinks: number
    helperLinks: number
    helperNamePresent: boolean
    buildNamePresent: boolean
  }>,
): PolicyTerminalBuildState {
  if (!input.helperShaMatches) return 'terminal-unclassifiable'
  if (
    canonicalJson([...input.parentEntries].sort()) ===
      canonicalJson([
        '.policy-exclusive-promotion-build',
        '.policy-exclusive-promotion.lock',
      ]) &&
    input.parentLinks === 4 &&
    canonicalJson([...input.buildEntries].sort()) ===
      canonicalJson(['exclusive-promotion-helper']) &&
    input.buildLinks === 3 &&
    input.helperLinks === 1 &&
    input.helperNamePresent &&
    input.buildNamePresent
  )
    return 'terminal-prestate'
  if (
    canonicalJson([...input.parentEntries].sort()) ===
      canonicalJson([
        '.policy-exclusive-promotion-build',
        '.policy-exclusive-promotion.lock',
      ]) &&
    input.parentLinks === 4 &&
    input.buildEntries.length === 0 &&
    input.buildLinks === 2 &&
    input.helperLinks === 0 &&
    !input.helperNamePresent &&
    input.buildNamePresent
  )
    return 'terminal-helper-unlinked'
  if (
    canonicalJson([...input.parentEntries].sort()) ===
      canonicalJson(['.policy-exclusive-promotion.lock']) &&
    input.parentLinks === 3 &&
    input.buildEntries.length === 0 &&
    input.buildLinks === 0 &&
    input.helperLinks === 0 &&
    !input.helperNamePresent &&
    !input.buildNamePresent
  )
    return 'terminal-root-removed-unproved'
  return 'terminal-unclassifiable'
}

export function classifyPolicyTerminalBuildStateForFixture(
  input: Parameters<typeof classifyPolicyTerminalBuildState>[0],
): PolicyTerminalBuildState {
  if (process.env.NODE_ENV !== 'test')
    throw new PolicyBaselineError('policy-wrapper-isolation')
  return classifyPolicyTerminalBuildState(input)
}

export const policyExclusivePromotionPendingProvenance = {
  status: 'pending-provisional-builds-a-b-and-acceptance-c',
  compilerVersionSha256:
    '8aba89296f208c9232fc824fe84d935bad5793de6021f23082021859cf994335',
  xcrunSha256: null,
  xcrunDevice: null,
  xcrunInode: null,
  sourceSha256: null,
  compilerSha256: null,
  compilerDevice: null,
  compilerInode: null,
  sdkIdentitySha256: null,
  sdkDevice: null,
  sdkInode: null,
  headerSetSha256: null,
  diagnosticSha256: null,
  compileContractSha256: null,
  helperSha256: null,
  launchContractSha256: null,
  launcherSha256: null,
  nativeAuthoritySha256: null,
  lockPreflightWorkerSha256: null,
} as const
export const policyPromotionMaterialSchema = z.strictObject({
  xcrunSha256: sha256Schema,
  xcrunDevice: z.string().regex(/^(?:0|[1-9][0-9]*)$/),
  xcrunInode: z.string().regex(/^[1-9][0-9]*$/),
  sourceSha256: sha256Schema,
  compilerSha256: sha256Schema,
  compilerDevice: z.string().regex(/^(?:0|[1-9][0-9]*)$/),
  compilerInode: z.string().regex(/^[1-9][0-9]*$/),
  sdkIdentitySha256: sha256Schema,
  sdkDevice: z.string().regex(/^(?:0|[1-9][0-9]*)$/),
  sdkInode: z.string().regex(/^[1-9][0-9]*$/),
  headerSetSha256: sha256Schema,
  diagnosticSha256: sha256Schema,
  compileContractSha256: sha256Schema,
  launchContractSha256: sha256Schema,
  launcherSha256: sha256Schema,
  nativeAuthoritySha256: sha256Schema,
  lockPreflightWorkerSha256: sha256Schema,
  helperSha256: sha256Schema,
})
export type PolicyPromotionMaterial = z.infer<
  typeof policyPromotionMaterialSchema
>
const policyPromotionPackageCoreSchema = z.strictObject({
  schema: z.literal('policy-exclusive-promotion-provenance.v1'),
  version: z.literal(1),
  stage: z.enum(['A', 'B', 'candidate', 'accepted', 'C']),
  rootIdentitySha256: sha256Schema.nullable(),
  material: policyPromotionMaterialSchema,
  preflightAuthoritySha256: sha256Schema.nullable(),
  reviewAuthoritySha256: sha256Schema.nullable(),
  cleanupProved: z.literal(true),
})
export const policyPromotionPackageSchema = policyPromotionPackageCoreSchema
  .extend({ packageSha256: sha256Schema })
  .strict()
export type PolicyPromotionPackage = z.infer<
  typeof policyPromotionPackageSchema
>
function createPolicyPromotionPackageFromCore(
  input: z.input<typeof policyPromotionPackageCoreSchema>,
): PolicyPromotionPackage {
  let core: z.infer<typeof policyPromotionPackageCoreSchema>
  try {
    core = policyPromotionPackageCoreSchema.parse(input)
  } catch {
    throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
  }
  const validShape =
    (core.stage === 'A'
      ? core.rootIdentitySha256 !== null &&
        core.preflightAuthoritySha256 === null &&
        core.reviewAuthoritySha256 === null
      : core.stage === 'B'
        ? core.rootIdentitySha256 !== null &&
          core.preflightAuthoritySha256 !== null &&
          core.reviewAuthoritySha256 === null
        : core.stage === 'candidate'
          ? core.rootIdentitySha256 === null &&
            core.preflightAuthoritySha256 !== null &&
            core.reviewAuthoritySha256 === null
          : core.stage === 'accepted'
            ? core.rootIdentitySha256 === null &&
              core.preflightAuthoritySha256 !== null &&
              core.reviewAuthoritySha256 !== null
            : core.rootIdentitySha256 !== null &&
              core.preflightAuthoritySha256 !== null &&
              core.reviewAuthoritySha256 !== null) && core.cleanupProved
  if (!validShape)
    throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
  return {
    ...core,
    packageSha256: sha256Bytes(Buffer.from(canonicalJson(core))),
  }
}
export async function createPolicyPromotionPackage(
  input: Readonly<{
    stage: 'A' | 'B' | 'C'
    rootIdentitySha256: string
    toolchainAuthority: unknown
    helperBytes: Uint8Array
    preflightAuthority: unknown | null
    reviewAuthoritySha256: string | null
  }>,
): Promise<PolicyPromotionPackage> {
  if (process.env.NODE_ENV !== 'test')
    throw new PolicyBaselineError('policy-wrapper-isolation')
  const toolchain = parsePolicyToolchainAuthority(input.toolchainAuthority)
  const [source, launch, worker] = await Promise.all([
    inspectPolicyExclusivePromotionSource(),
    inspectPolicyNativeLaunchSources(),
    inspectPolicyLockPreflightWorker(),
  ])
  if (
    input.helperBytes.byteLength === 0 ||
    source.sha256 !== toolchain.sourceSha256 ||
    launch.launchContractSha256 !== toolchain.launchContractSha256 ||
    launch.launcherSha256 !== toolchain.launcherSha256 ||
    launch.nativeAuthoritySha256 !== toolchain.nativeAuthoritySha256 ||
    worker.sha256 !== toolchain.lockPreflightWorkerSha256
  )
    throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
  const preflightAuthority =
    input.stage === 'A'
      ? null
      : assertPolicyExclusivePromotionPreflight(input.preflightAuthority)
  if (
    (input.stage === 'A' && input.preflightAuthority !== null) ||
    (preflightAuthority !== null &&
      preflightAuthority.commandLock.workerSha256 !== worker.sha256)
  )
    throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
  return createPolicyPromotionPackageFromCore({
    schema: 'policy-exclusive-promotion-provenance.v1',
    version: 1,
    stage: input.stage,
    rootIdentitySha256: input.rootIdentitySha256,
    material: {
      xcrunSha256: toolchain.xcrunSha256,
      xcrunDevice: toolchain.xcrunDevice,
      xcrunInode: toolchain.xcrunInode,
      sourceSha256: toolchain.sourceSha256,
      compilerSha256: toolchain.compilerSha256,
      compilerDevice: toolchain.compilerDevice,
      compilerInode: toolchain.compilerInode,
      sdkIdentitySha256: toolchain.sdkIdentitySha256,
      sdkDevice: toolchain.sdkDevice,
      sdkInode: toolchain.sdkInode,
      headerSetSha256: toolchain.headerSetSha256,
      diagnosticSha256: toolchain.diagnosticSha256,
      compileContractSha256: toolchain.compileContractSha256,
      launchContractSha256: toolchain.launchContractSha256,
      launcherSha256: toolchain.launcherSha256,
      nativeAuthoritySha256: toolchain.nativeAuthoritySha256,
      lockPreflightWorkerSha256: toolchain.lockPreflightWorkerSha256,
      helperSha256: sha256Bytes(input.helperBytes),
    },
    preflightAuthoritySha256:
      preflightAuthority?.preflightAuthoritySha256 ?? null,
    reviewAuthoritySha256: input.reviewAuthoritySha256,
    cleanupProved: true,
  })
}
export function parsePolicyPromotionPackage(
  input: unknown,
): PolicyPromotionPackage {
  let value: PolicyPromotionPackage
  try {
    value = policyPromotionPackageSchema.parse(input)
  } catch {
    throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
  }
  const { packageSha256, ...core } = value
  const recreated = createPolicyPromotionPackageFromCore(core)
  if (recreated.packageSha256 !== packageSha256)
    throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
  return value
}
export async function createPolicyPromotionProvenanceCandidate(
  firstInput: unknown,
  secondInput: unknown,
): Promise<PolicyPromotionPackage> {
  const first = parsePolicyPromotionPackage(firstInput)
  const second = parsePolicyPromotionPackage(secondInput)
  if (
    first.stage !== 'A' ||
    second.stage !== 'B' ||
    first.rootIdentitySha256 === second.rootIdentitySha256 ||
    canonicalJson(first.material) !== canonicalJson(second.material)
  )
    throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
  const [source, launch, worker] = await Promise.all([
    inspectPolicyExclusivePromotionSource(),
    inspectPolicyNativeLaunchSources(),
    inspectPolicyLockPreflightWorker(),
  ])
  if (
    source.sha256 !== first.material.sourceSha256 ||
    launch.launchContractSha256 !== first.material.launchContractSha256 ||
    launch.launcherSha256 !== first.material.launcherSha256 ||
    launch.nativeAuthoritySha256 !== first.material.nativeAuthoritySha256 ||
    worker.sha256 !== first.material.lockPreflightWorkerSha256
  )
    throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
  return createPolicyPromotionPackageFromCore({
    schema: 'policy-exclusive-promotion-provenance.v1',
    version: 1,
    stage: 'candidate',
    rootIdentitySha256: null,
    material: first.material,
    preflightAuthoritySha256: second.preflightAuthoritySha256,
    reviewAuthoritySha256: null,
    cleanupProved: true,
  })
}
export async function createAcceptedPolicyPromotionLiterals(
  candidateInput: unknown,
  reviewAuthoritySha256: string,
): Promise<PolicyPromotionPackage> {
  const candidate = parsePolicyPromotionPackage(candidateInput)
  if (candidate.stage !== 'candidate')
    throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
  const [source, launch, worker] = await Promise.all([
    inspectPolicyExclusivePromotionSource(),
    inspectPolicyNativeLaunchSources(),
    inspectPolicyLockPreflightWorker(),
  ])
  if (
    source.sha256 !== candidate.material.sourceSha256 ||
    launch.launchContractSha256 !== candidate.material.launchContractSha256 ||
    launch.launcherSha256 !== candidate.material.launcherSha256 ||
    launch.nativeAuthoritySha256 !== candidate.material.nativeAuthoritySha256 ||
    worker.sha256 !== candidate.material.lockPreflightWorkerSha256
  )
    throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
  return createPolicyPromotionPackageFromCore({
    schema: 'policy-exclusive-promotion-provenance.v1',
    version: 1,
    stage: 'accepted',
    rootIdentitySha256: null,
    material: candidate.material,
    preflightAuthoritySha256: candidate.preflightAuthoritySha256,
    reviewAuthoritySha256,
    cleanupProved: true,
  })
}
export async function assertPolicyPromotionAcceptanceBuild(
  input: Readonly<{
    acceptanceBuild: unknown
    acceptedLiterals: unknown
    provisionalRootIdentitySha256: readonly [string, string]
    preflightAuthority: unknown
  }>,
): Promise<void> {
  const acceptance = parsePolicyPromotionPackage(input.acceptanceBuild)
  const accepted = parsePolicyPromotionPackage(input.acceptedLiterals)
  const preflight = assertPolicyExclusivePromotionPreflight(
    input.preflightAuthority,
  )
  if (
    acceptance.stage !== 'C' ||
    accepted.stage !== 'accepted' ||
    acceptance.rootIdentitySha256 === null ||
    input.provisionalRootIdentitySha256.includes(
      acceptance.rootIdentitySha256,
    ) ||
    acceptance.reviewAuthoritySha256 !== accepted.reviewAuthoritySha256 ||
    acceptance.preflightAuthoritySha256 !==
      preflight.preflightAuthoritySha256 ||
    acceptance.preflightAuthoritySha256 === accepted.preflightAuthoritySha256 ||
    canonicalJson(acceptance.material) !== canonicalJson(accepted.material)
  )
    throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
  const [source, launch, worker] = await Promise.all([
    inspectPolicyExclusivePromotionSource(),
    inspectPolicyNativeLaunchSources(),
    inspectPolicyLockPreflightWorker(),
  ])
  if (
    source.sha256 !== acceptance.material.sourceSha256 ||
    launch.launchContractSha256 !== acceptance.material.launchContractSha256 ||
    launch.launcherSha256 !== acceptance.material.launcherSha256 ||
    launch.nativeAuthoritySha256 !==
      acceptance.material.nativeAuthoritySha256 ||
    worker.sha256 !== acceptance.material.lockPreflightWorkerSha256
  )
    throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
}
export function assertPolicyPromotionBootstrapBoundary(
  evidence: Readonly<{
    stage: 'A' | 'B' | 'C'
    nodeLockPreflight: boolean
    helperMetadataPreflight: boolean
    helperFdPreflight: boolean
    acceptedLiteralsPresent: boolean
    policyCapability: boolean
  }>,
): void {
  const valid =
    evidence.nodeLockPreflight &&
    !evidence.policyCapability &&
    (evidence.stage === 'A'
      ? !evidence.helperMetadataPreflight &&
        !evidence.helperFdPreflight &&
        !evidence.acceptedLiteralsPresent
      : evidence.stage === 'B'
        ? evidence.helperMetadataPreflight &&
          evidence.helperFdPreflight &&
          !evidence.acceptedLiteralsPresent
        : evidence.helperMetadataPreflight &&
          evidence.helperFdPreflight &&
          evidence.acceptedLiteralsPresent)
  if (!valid)
    throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
}
export async function inspectPolicyExclusivePromotionSource(): Promise<
  Readonly<{ bytes: Buffer; byteCount: number; sha256: string }>
> {
  const bytes = await readFile(policyExclusivePromotionHelperSourcePath)
  return { bytes, byteCount: bytes.byteLength, sha256: sha256Bytes(bytes) }
}
export function assertPolicyExclusivePromotionProvenanceAccepted(): never {
  throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
}
export function mapPolicyExclusivePromotionHelperResult(
  result: Readonly<{
    code: number | null
    signal: string | null
    stdoutBytes: number
    stderrBytes: number
    timedOut: boolean
  }>,
): 'success' {
  if (
    result.signal !== null ||
    result.timedOut ||
    result.stdoutBytes !== 0 ||
    result.stderrBytes !== 0 ||
    result.code === null
  )
    throw new PolicyBaselineError('policy-custody')
  if (result.code === 0) return 'success'
  if (result.code === 11)
    throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
  throw new PolicyBaselineError('policy-custody')
}
const policyExclusivePromotionPreflightCoreSchema = z.strictObject({
  schema: z.literal('policy-exclusive-promotion-preflight.v1'),
  version: z.literal(1),
  platform: z.literal('darwin'),
  device: z.string().regex(/^(?:0|[1-9][0-9]*)$/),
  volumeCapability: z.strictObject({
    validRenameExclusive: z.literal(1),
    supportedRenameExclusive: z.literal(1),
  }),
  metadataRoleResults: z.tuple([
    z.strictObject({ role: z.literal('build-root'), exitCode: z.literal(0) }),
    z.strictObject({ role: z.literal('build-tmp'), exitCode: z.literal(0) }),
    z.strictObject({ role: z.literal('build-source'), exitCode: z.literal(0) }),
    z.strictObject({ role: z.literal('build-helper'), exitCode: z.literal(0) }),
    z.strictObject({
      role: z.literal('preflight-root'),
      exitCode: z.literal(0),
    }),
    z.strictObject({
      role: z.literal('preflight-directory'),
      exitCode: z.literal(0),
    }),
    z.strictObject({
      role: z.literal('preflight-file'),
      exitCode: z.literal(0),
    }),
    z.strictObject({ role: z.literal('command-lock'), exitCode: z.literal(0) }),
  ]),
  fdPreflight: z.strictObject({
    singleAuthorityTargets: z.tuple([z.literal(3)]),
    doubleAuthorityTargets: z.tuple([z.literal(3), z.literal(4)]),
    tripleAuthorityTargets: z.tuple([z.literal(3), z.literal(4), z.literal(5)]),
    quadAuthorityTargets: z.tuple([
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
    ]),
    unexpectedDescriptorCount: z.literal(0),
  }),
  aclFixture: z.strictObject({
    installExitCode: z.literal(0),
    metadataRejectExitCode: z.literal(15),
    removeExitCode: z.literal(0),
  }),
  promotion: z.strictObject({
    successExitCode: z.literal(0),
    collisionExitCode: z.literal(10),
    collisionSourceBeforeSha256: sha256Schema,
    collisionSourceAfterSha256: sha256Schema,
    collisionDestinationBeforeSha256: sha256Schema,
    collisionDestinationAfterSha256: sha256Schema,
  }),
  apfsRegularFileDelete: z.strictObject({
    beforeEntryCount: z.literal(1),
    beforeLinks: z.literal(3),
    afterEntryCount: z.literal(0),
    afterLinks: z.literal(2),
  }),
  apfsDirectoryDelete: z.strictObject({
    beforeEntryCount: z.literal(1),
    beforeLinks: z.literal(3),
    afterEntryCount: z.literal(0),
    afterLinks: z.literal(2),
  }),
  commandLock: z.strictObject({
    workerSha256: sha256Schema,
    before: z.strictObject({
      device: z.string().regex(/^(?:0|[1-9][0-9]*)$/),
      inode: z.string().regex(/^[1-9][0-9]*$/),
      mode: z.literal(0o600),
      links: z.literal(1),
      bytes: z.literal(0),
    }),
    heldContender: z.strictObject({
      exitCode: z.literal(20),
      stdoutBytes: z.literal(0),
      stderrBytes: z.literal(0),
      processGroupAbsent: z.literal(true),
      streamsClosed: z.literal(true),
    }),
    releasedContender: z.strictObject({
      exitCode: z.literal(0),
      stdoutBytes: z.literal(0),
      stderrBytes: z.literal(0),
      processGroupAbsent: z.literal(true),
      streamsClosed: z.literal(true),
    }),
    after: z.strictObject({
      device: z.string().regex(/^(?:0|[1-9][0-9]*)$/),
      inode: z.string().regex(/^[1-9][0-9]*$/),
      mode: z.literal(0o600),
      links: z.literal(1),
      bytes: z.literal(0),
    }),
    retentionIntervals: z.tuple([
      z.literal('held-through-contender-close'),
      z.literal('held-through-terminal-custody-decision'),
    ]),
  }),
  cleanup: z.strictObject({
    remainingEntryCount: z.literal(0),
    rootAbsent: z.literal(true),
  }),
})
export const policyExclusivePromotionPreflightSchema =
  policyExclusivePromotionPreflightCoreSchema
    .extend({ preflightAuthoritySha256: sha256Schema })
    .strict()
export type PolicyExclusivePromotionPreflightAuthority = z.infer<
  typeof policyExclusivePromotionPreflightSchema
>
function createPolicyExclusivePromotionPreflightAuthorityFromCore(
  input: z.input<typeof policyExclusivePromotionPreflightCoreSchema>,
): PolicyExclusivePromotionPreflightAuthority {
  let core: z.infer<typeof policyExclusivePromotionPreflightCoreSchema>
  try {
    core = policyExclusivePromotionPreflightCoreSchema.parse(input)
  } catch {
    throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
  }
  if (
    core.promotion.collisionSourceBeforeSha256 !==
      core.promotion.collisionSourceAfterSha256 ||
    core.promotion.collisionDestinationBeforeSha256 !==
      core.promotion.collisionDestinationAfterSha256 ||
    canonicalJson(core.commandLock.before) !==
      canonicalJson(core.commandLock.after) ||
    core.commandLock.before.device !== core.device
  )
    throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
  return {
    ...core,
    preflightAuthoritySha256: sha256Bytes(Buffer.from(canonicalJson(core))),
  }
}
export function createPolicyExclusivePromotionPreflightAuthorityForFixture(
  input: z.input<typeof policyExclusivePromotionPreflightCoreSchema>,
): PolicyExclusivePromotionPreflightAuthority {
  if (process.env.NODE_ENV !== 'test')
    throw new PolicyBaselineError('policy-wrapper-isolation')
  return createPolicyExclusivePromotionPreflightAuthorityFromCore(input)
}
export function assertPolicyExclusivePromotionPreflight(
  evidence: unknown,
): PolicyExclusivePromotionPreflightAuthority {
  let parsed: PolicyExclusivePromotionPreflightAuthority
  try {
    parsed = policyExclusivePromotionPreflightSchema.parse(evidence)
  } catch {
    throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
  }
  const { preflightAuthoritySha256, ...core } = parsed
  if (
    createPolicyExclusivePromotionPreflightAuthorityFromCore(core)
      .preflightAuthoritySha256 !== preflightAuthoritySha256
  )
    throw new PolicyBaselineError('policy-exclusive-promotion-unavailable')
  return parsed
}
export function assertPolicyExclusivePromotionParentEvidence(
  evidence: Readonly<{
    phase: PolicyExclusivePromotionRequest['phase']
    effectiveOwner: number
    sourceOwner: number
    destinationOwner: number
    sourceMode: number
    destinationMode: number
    sourceDevice: number
    destinationDevice: number
    sourceLinks: number
    expectedSourceLinksFromInventory: number
    destinationLinks: number
    sourceAclTrivial: boolean
    destinationAclTrivial: boolean
  }>,
): void {
  const expectedDestinationLinks =
    evidence.phase === 'capture' ? 2 : evidence.phase === 'role-input' ? 3 : 4
  if (
    evidence.sourceOwner !== evidence.effectiveOwner ||
    evidence.destinationOwner !== evidence.effectiveOwner ||
    evidence.sourceMode !== 0o700 ||
    evidence.destinationMode !== 0o700 ||
    evidence.sourceDevice !== evidence.destinationDevice ||
    evidence.sourceLinks !== evidence.expectedSourceLinksFromInventory ||
    evidence.destinationLinks !== expectedDestinationLinks ||
    !evidence.sourceAclTrivial ||
    !evidence.destinationAclTrivial
  )
    throw new PolicyBaselineError('policy-custody')
}
export function assertPolicyExclusivePromotionBuildInventory(
  evidence: Readonly<{
    owner: number
    effectiveOwner: number
    mode: number
    links: number
    aclTrivial: boolean
    entries: readonly string[]
    source: Readonly<{
      owner: number
      mode: number
      links: number
      device: number
      parentDevice: number
      sha256: string
      aclTrivial: boolean
    }>
    helper: Readonly<{
      owner: number
      mode: number
      links: number
      device: number
      parentDevice: number
      sha256: string
      aclTrivial: boolean
    }>
    temporaryDirectory: Readonly<{
      owner: number
      mode: number
      links: number
      device: number
      parentDevice: number
      aclTrivial: boolean
      entries: readonly string[]
    }>
  }>,
): void {
  if (
    evidence.owner !== evidence.effectiveOwner ||
    evidence.mode !== 0o700 ||
    evidence.links !== 5 ||
    !evidence.aclTrivial ||
    canonicalJson([...evidence.entries].sort()) !==
      canonicalJson([
        'exclusive-promotion-helper',
        'exclusive-promotion-helper.c',
        'tmp',
      ]) ||
    evidence.source.owner !== evidence.effectiveOwner ||
    evidence.source.mode !== 0o400 ||
    evidence.source.links !== 1 ||
    evidence.source.device !== evidence.source.parentDevice ||
    !evidence.source.aclTrivial ||
    !sha256Schema.safeParse(evidence.source.sha256).success ||
    evidence.helper.owner !== evidence.effectiveOwner ||
    evidence.helper.mode !== 0o500 ||
    evidence.helper.links !== 1 ||
    evidence.helper.device !== evidence.helper.parentDevice ||
    !evidence.helper.aclTrivial ||
    !sha256Schema.safeParse(evidence.helper.sha256).success ||
    evidence.temporaryDirectory.owner !== evidence.effectiveOwner ||
    evidence.temporaryDirectory.mode !== 0o700 ||
    evidence.temporaryDirectory.links !== 2 ||
    evidence.temporaryDirectory.device !==
      evidence.temporaryDirectory.parentDevice ||
    !evidence.temporaryDirectory.aclTrivial ||
    evidence.temporaryDirectory.entries.length !== 0
  )
    throw new PolicyBaselineError('policy-custody')
}
export async function snapshotPolicyExclusivePromotionSourceForFixture(
  buildRoot: string,
  filesystem: PolicyFilesystem = nodePolicyFilesystem,
): Promise<Readonly<{ byteCount: number; sha256: string }>> {
  if (process.env.NODE_ENV !== 'test')
    throw new PolicyBaselineError('policy-wrapper-isolation')
  const root = await assertSecureDirectory(filesystem, buildRoot)
  if (root.nlink !== 2) throw new PolicyBaselineError('policy-custody')
  if ((await filesystem.readdir(buildRoot)).length !== 0)
    throw new PolicyBaselineError('policy-custody')
  const tracked = await inspectPolicyExclusivePromotionSource()
  const snapshot = join(buildRoot, 'exclusive-promotion-helper.c')
  await writeSecureFile(filesystem, snapshot, tracked.bytes)
  await filesystem.chmod(snapshot, 0o400)
  const snapshotStat = await assertSecureFile(
    filesystem,
    snapshot,
    root.dev,
    0o400,
  )
  const reRead = await filesystem.readFile(snapshot)
  if (
    reRead.byteLength !== tracked.byteCount ||
    sha256Bytes(reRead) !== tracked.sha256
  )
    throw new PolicyBaselineError('policy-byte-drift')
  await assertSecureFile(
    filesystem,
    snapshot,
    root.dev,
    0o400,
    snapshotStat.ino,
  )
  return { byteCount: tracked.byteCount, sha256: tracked.sha256 }
}
export async function cleanupPolicyExclusivePromotionBuildForFixture(
  buildRoot: string,
  expected: Readonly<{ sourceSha256: string; helperSha256: string }>,
  deleteEntry: (
    role: 'build-source' | 'build-helper' | 'build-tmp' | 'build-root',
  ) => Promise<void>,
  filesystem: PolicyFilesystem = nodePolicyFilesystem,
): Promise<void> {
  if (process.env.NODE_ENV !== 'test')
    throw new PolicyBaselineError('policy-wrapper-isolation')
  const root = await assertSecureDirectory(filesystem, buildRoot)
  if (root.nlink !== 5) throw new PolicyBaselineError('policy-custody')
  const entries = [...(await filesystem.readdir(buildRoot))].sort()
  if (
    canonicalJson(entries) !==
    canonicalJson([
      'exclusive-promotion-helper',
      'exclusive-promotion-helper.c',
      'tmp',
    ])
  )
    throw new PolicyBaselineError('policy-custody')
  const source = join(buildRoot, 'exclusive-promotion-helper.c')
  const helper = join(buildRoot, 'exclusive-promotion-helper')
  const temporaryDirectory = join(buildRoot, 'tmp')
  const sourceStat = await assertSecureFile(filesystem, source, root.dev, 0o400)
  const helperStat = await assertSecureFile(filesystem, helper, root.dev, 0o500)
  const temporaryStat = await assertSecureDirectory(
    filesystem,
    temporaryDirectory,
    root.dev,
  )
  if (temporaryStat.nlink !== 2) throw new PolicyBaselineError('policy-custody')
  if ((await filesystem.readdir(temporaryDirectory)).length !== 0)
    throw new PolicyBaselineError('policy-custody')
  const sourceBytes = await filesystem.readFile(source)
  const helperBytes = await filesystem.readFile(helper)
  if (
    sha256Bytes(sourceBytes) !== expected.sourceSha256 ||
    sha256Bytes(helperBytes) !== expected.helperSha256
  )
    throw new PolicyBaselineError('policy-byte-drift')
  await assertSecureFile(filesystem, source, root.dev, 0o400, sourceStat.ino)
  await deleteEntry('build-source')
  await assertAbsent(filesystem, source)
  await assertSecureFile(filesystem, helper, root.dev, 0o500, helperStat.ino)
  await deleteEntry('build-helper')
  await assertAbsent(filesystem, helper)
  const temporaryBeforeRemoval = await assertSecureDirectory(
    filesystem,
    temporaryDirectory,
    root.dev,
    temporaryStat.ino,
  )
  if (
    temporaryBeforeRemoval.nlink !== 2 ||
    (await filesystem.readdir(temporaryDirectory)).length !== 0
  )
    throw new PolicyBaselineError('policy-custody')
  await deleteEntry('build-tmp')
  await assertAbsent(filesystem, temporaryDirectory)
  const rootBeforeRemoval = await assertSecureDirectory(
    filesystem,
    buildRoot,
    root.dev,
    root.ino,
  )
  if (
    rootBeforeRemoval.dev !== root.dev ||
    rootBeforeRemoval.nlink !== 2 ||
    (await filesystem.readdir(buildRoot)).length !== 0
  )
    throw new PolicyBaselineError('policy-custody')
  await deleteEntry('build-root')
  await assertAbsent(filesystem, buildRoot)
}
export const acceptedPolicyReviewerContractSha256 =
  'aea8bda83abe762e5f243e5604a900a975118fe8d9a3457f3424d9604a8f7d26' as const
export async function createPolicyReviewerContract(): Promise<
  Readonly<{
    schema: 'wikimedia-policy-reviewer-contract.v1'
    version: 1
    model: string
    reasoning: string
    cli: string
    promptSha256: string
    outputSchemaSha256: string
    wrapperSourceSha256: string
    launchPolicySha256: string
    sandboxProfileSha256: string
    framingSha256: string
    roleOutputSchema: string
    roleOutputVersion: 1
    reviewerContractSha256: string
  }>
> {
  const [
    prompt,
    outputSchema,
    sandboxProfile,
    framing,
    wrapperSource,
    launchPolicy,
  ] = await Promise.all(
    Object.values(policyReviewerAssetPaths).map((path) => readFile(path)),
  )
  const core = {
    schema: 'wikimedia-policy-reviewer-contract.v1' as const,
    version: 1 as const,
    model: policyReviewerLaunchPolicy.model,
    reasoning: 'high',
    cli: policyReviewerLaunchPolicy.cli,
    promptSha256: sha256Bytes(prompt),
    outputSchemaSha256: sha256Bytes(outputSchema),
    wrapperSourceSha256: sha256Bytes(wrapperSource),
    launchPolicySha256: sha256Bytes(launchPolicy),
    sandboxProfileSha256: sha256Bytes(sandboxProfile),
    framingSha256: sha256Bytes(framing),
    roleOutputSchema: 'wikimedia-policy-semantic-review-role-output.v1',
    roleOutputVersion: 1 as const,
  }
  const reviewerContractSha256 = discoverySha256(core)
  if (reviewerContractSha256 !== acceptedPolicyReviewerContractSha256)
    throw new PolicyBaselineError('policy-wrapper-contract')
  return { ...core, reviewerContractSha256 }
}
export function renderPolicyReviewerSandboxProfile(
  template: string,
  input: Readonly<{ outputSchemaPath: string; resultPath: string }>,
): string {
  const safeAbsolutePathPattern = /^\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/u
  for (const path of Object.values(input)) {
    if (
      !safeAbsolutePathPattern.test(path) ||
      path.split('/').some((segment) => segment === '.' || segment === '..')
    )
      throw new PolicyBaselineError('policy-wrapper-isolation')
  }
  if (
    template.split('__OUTPUT_SCHEMA_PATH__').length !== 2 ||
    template.split('__RESULT_PATH__').length !== 2
  )
    throw new PolicyBaselineError('policy-wrapper-contract')
  const rendered = template
    .replace('__OUTPUT_SCHEMA_PATH__', input.outputSchemaPath)
    .replace('__RESULT_PATH__', input.resultPath)
  if (
    rendered.includes('__OUTPUT_SCHEMA_PATH__') ||
    rendered.includes('__RESULT_PATH__')
  )
    throw new PolicyBaselineError('policy-wrapper-contract')
  return rendered
}
export function buildPolicyReviewerCommand(
  input: Readonly<{
    renderedSandboxProfilePath: string
    outputSchemaPath: string
    resultPath: string
    workingDirectory: string
  }>,
) {
  try {
    return buildReviewedPolicyReviewerCommand(input)
  } catch {
    throw new PolicyBaselineError('policy-wrapper-isolation')
  }
}
export function createPolicyReviewerLaunch(
  input: Readonly<{
    renderedSandboxProfilePath: string
    outputSchemaPath: string
    resultPath: string
    workingDirectory: string
  }>,
): Readonly<{
  command: readonly string[]
  environment: Readonly<Record<string, string>>
  detachedProcessGroup: true
  stdoutByteLimit: 262144
  stderrByteLimit: 262144
  combinedOutputByteLimit: 393216
  resultByteLimit: 4096
  permitToolExecution: false
}> {
  try {
    return createReviewedPolicyReviewerLaunch(input)
  } catch {
    throw new PolicyBaselineError('policy-wrapper-isolation')
  }
}

export type PolicyBaselineCommand =
  | Readonly<{ mode: 'check' }>
  | Readonly<{ mode: 'capture' }>
  | Readonly<{ mode: 'prepare-review' }>
  | Readonly<{ mode: 'submit-review' }>
  | Readonly<{ mode: 'finalize' }>
export function parsePolicyBaselineArguments(
  args: readonly string[],
): PolicyBaselineCommand {
  if (args.length === 1 && args[0] === 'check') return { mode: 'check' }
  if (
    args.length === 2 &&
    args[0] === 'capture' &&
    args[1] === '--confirm-wikimedia-policy-baseline'
  )
    return { mode: 'capture' }
  if (args.length === 1 && args[0] === 'prepare-review')
    return { mode: 'prepare-review' }
  if (args.length === 1 && args[0] === 'submit-review')
    return { mode: 'submit-review' }
  if (args.length === 1 && args[0] === 'finalize') return { mode: 'finalize' }
  throw new PolicyBaselineError('policy-arguments')
}

type PolicyStat = Readonly<{
  isDirectory: () => boolean
  isFile: () => boolean
  isSymbolicLink: () => boolean
  uid: number
  ino: number
  nlink: number
  dev: number
  mode: number
  size: number
}>
export type PolicyFilesystem = Readonly<{
  lstat: (path: string) => Promise<PolicyStat>
  readdir: (path: string) => Promise<readonly string[]>
  mkdir: (path: string, options?: { mode?: number }) => Promise<void>
  chmod: (path: string, mode: number) => Promise<void>
  readFile: (path: string) => Promise<Buffer>
  writeFile: (
    path: string,
    value: string | Uint8Array,
    options: Readonly<{ flag: 'wx'; mode: number }>,
  ) => Promise<void>
  promoteExclusive: (request: PolicyExclusivePromotionRequest) => Promise<void>
}>
const nodePolicyFilesystem: PolicyFilesystem = {
  lstat,
  readdir,
  mkdir: async (path, options) => mkdir(path, options),
  chmod,
  readFile,
  writeFile,
  promoteExclusive: async () => {
    throw new PolicyBaselineError('policy-custody')
  },
}
type PolicyCustodyPaths = Readonly<{
  root: string
  capture: string
  roleInput: string
  roleResult: string
  staging: string
}>
type PolicyPromotionFile<Name extends string> = Readonly<{
  name: Name
  byteCount: number
  sha256: string
}>
export type PolicyExclusivePromotionRequest =
  | Readonly<{
      phase: 'capture'
      files: readonly [PolicyPromotionFile<'capture.json'>]
    }>
  | Readonly<{
      phase: 'role-input'
      files: readonly [
        PolicyPromotionFile<'body-01.bin'>,
        PolicyPromotionFile<'body-02.bin'>,
        PolicyPromotionFile<'body-03.bin'>,
        PolicyPromotionFile<'body-04.bin'>,
        PolicyPromotionFile<'body-05.bin'>,
        PolicyPromotionFile<'manifest.json'>,
        PolicyPromotionFile<'retrieval.json'>,
      ]
    }>
  | Readonly<{
      phase: 'role-result'
      files: readonly [
        PolicyPromotionFile<'role-output.json'>,
        PolicyPromotionFile<'role-result.json'>,
      ]
    }>
const policyExclusivePromotionTuples = {
  capture: {
    sourceParentRole: '.local/m45',
    destinationParentRole: 'policy-review-root',
    sourceName: '.policy-baseline-review.staging',
    destinationName: 'capture',
  },
  'role-input': {
    sourceParentRole: '.local/m45',
    destinationParentRole: 'policy-review-root',
    sourceName: '.policy-baseline-review.staging',
    destinationName: 'role-input',
  },
  'role-result': {
    sourceParentRole: '.local/m45',
    destinationParentRole: 'policy-review-root',
    sourceName: '.policy-baseline-review.staging',
    destinationName: 'role-result',
  },
} as const
function assertClosedPolicyPromotionRequest(
  request: PolicyExclusivePromotionRequest,
): void {
  const expected = inventoryForBundle[request.phase]
  if (
    canonicalJson(request.files.map((file) => file.name)) !==
      canonicalJson(expected) ||
    request.files.some(
      (file) =>
        file.byteCount <= 0 || !sha256Schema.safeParse(file.sha256).success,
    )
  )
    throw new PolicyBaselineError('policy-custody')
}
export function createPolicyExclusivePromotionInvocationForFixture(
  request: PolicyExclusivePromotionRequest,
  identity: Readonly<{
    sourceParent: Readonly<{ device: string; inode: string; links: string }>
    destinationParent: Readonly<{
      device: string
      inode: string
      links: string
    }>
    staging: Readonly<{ device: string; inode: string }>
  }>,
): Readonly<{
  executable: string
  arguments: readonly string[]
  sourceParentFd: 3
  destinationParentFd: 4
}> {
  if (process.env.NODE_ENV !== 'test')
    throw new PolicyBaselineError('policy-wrapper-isolation')
  assertClosedPolicyPromotionRequest(request)
  const decimalEvidence = [
    identity.sourceParent.device,
    identity.sourceParent.inode,
    identity.sourceParent.links,
    identity.destinationParent.device,
    identity.destinationParent.inode,
    identity.destinationParent.links,
    identity.staging.device,
    identity.staging.inode,
  ]
  if (
    decimalEvidence.some((value) => !/^[1-9][0-9]*$/u.test(value)) ||
    identity.sourceParent.device !== identity.destinationParent.device ||
    identity.sourceParent.device !== identity.staging.device
  )
    throw new PolicyBaselineError('policy-custody')
  const tuple = policyExclusivePromotionTuples[request.phase]
  return {
    executable: policyExclusivePromotionBuildContract.helper,
    arguments: [
      request.phase,
      tuple.sourceName,
      tuple.destinationName,
      identity.sourceParent.device,
      identity.sourceParent.inode,
      identity.sourceParent.links,
      identity.destinationParent.device,
      identity.destinationParent.inode,
      identity.destinationParent.links,
      identity.staging.device,
      identity.staging.inode,
    ],
    sourceParentFd: 3,
    destinationParentFd: 4,
  }
}
function policyCustodyPaths(root: string): PolicyCustodyPaths {
  return {
    root,
    capture: join(root, 'capture'),
    roleInput: join(root, 'role-input'),
    roleResult: join(root, 'role-result'),
    staging: join(dirname(root), `.${basename(root)}.staging`),
  }
}
function fixedVacanciesForPolicyRoot(root: string): readonly string[] {
  if (root !== '.local/m45/policy-baseline-review') return []
  return [
    ...policyReviewRoots.filter((candidate) => candidate !== root),
    ...policyReviewStagingSiblings,
  ]
}
async function pathStatOrAbsent(
  filesystem: PolicyFilesystem,
  path: string,
): Promise<PolicyStat | undefined> {
  try {
    return await filesystem.lstat(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}
async function assertAbsent(
  filesystem: PolicyFilesystem,
  path: string,
): Promise<void> {
  if ((await pathStatOrAbsent(filesystem, path)) !== undefined)
    throw new PolicyBaselineError('policy-custody')
}
async function assertSecureDirectory(
  filesystem: PolicyFilesystem,
  path: string,
  expectedDevice?: number,
  expectedInode?: number,
): Promise<PolicyStat> {
  const stat = await pathStatOrAbsent(filesystem, path)
  const effectiveOwner = process.geteuid?.()
  if (
    stat === undefined ||
    effectiveOwner === undefined ||
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== effectiveOwner ||
    stat.ino <= 0 ||
    stat.nlink <= 0 ||
    (stat.mode & 0o7777) !== 0o700 ||
    (expectedDevice !== undefined && stat.dev !== expectedDevice) ||
    (expectedInode !== undefined && stat.ino !== expectedInode)
  )
    throw new PolicyBaselineError('policy-custody')
  return stat
}
async function assertExactDirectoryInventory(
  filesystem: PolicyFilesystem,
  path: string,
  expected: readonly string[],
  device: number,
): Promise<void> {
  await assertSecureDirectory(filesystem, path, device)
  const entries = [...(await filesystem.readdir(path))].sort()
  if (canonicalJson(entries) !== canonicalJson([...expected].sort()))
    throw new PolicyBaselineError('policy-custody')
  for (const entry of expected) {
    await assertSecureFile(filesystem, join(path, entry), device)
  }
}
async function assertSecureFile(
  filesystem: PolicyFilesystem,
  path: string,
  expectedDevice?: number,
  expectedMode = 0o600,
  expectedInode?: number,
): Promise<PolicyStat> {
  const stat = await pathStatOrAbsent(filesystem, path)
  const effectiveOwner = process.geteuid?.()
  if (
    stat === undefined ||
    effectiveOwner === undefined ||
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.uid !== effectiveOwner ||
    stat.ino <= 0 ||
    stat.nlink !== 1 ||
    (expectedDevice !== undefined && stat.dev !== expectedDevice) ||
    (expectedInode !== undefined && stat.ino !== expectedInode) ||
    (stat.mode & 0o7777) !== expectedMode
  )
    throw new PolicyBaselineError('policy-custody')
  return stat
}
async function writeSecureFile(
  filesystem: PolicyFilesystem,
  path: string,
  value: string | Uint8Array,
): Promise<void> {
  await filesystem.writeFile(path, value, { flag: 'wx', mode: 0o600 })
  const stat = await assertSecureFile(filesystem, path)
  const read = await filesystem.readFile(path)
  const expected = Buffer.from(value)
  if (!read.equals(expected)) throw new PolicyBaselineError('policy-custody')
  await assertSecureFile(filesystem, path, stat.dev, 0o600, stat.ino)
}
function policyPromotionFileTable(
  files: Readonly<Record<string, string | Uint8Array>>,
): readonly PolicyPromotionFile<string>[] {
  return Object.entries(files).map(([name, value]) => {
    const bytes = Buffer.from(value)
    return {
      name,
      byteCount: bytes.byteLength,
      sha256: sha256Bytes(bytes),
    }
  })
}
async function assertExactBundleBytes(
  filesystem: PolicyFilesystem,
  directory: string,
  table: readonly PolicyPromotionFile<string>[],
): Promise<void> {
  for (const expected of table) {
    const stat = await assertSecureFile(
      filesystem,
      join(directory, expected.name),
    )
    const bytes = await filesystem.readFile(join(directory, expected.name))
    if (
      bytes.byteLength !== expected.byteCount ||
      sha256Bytes(bytes) !== expected.sha256
    )
      throw new PolicyBaselineError('policy-byte-drift')
    await assertSecureFile(
      filesystem,
      join(directory, expected.name),
      stat.dev,
      0o600,
      stat.ino,
    )
  }
}
async function promoteBundle(
  filesystem: PolicyFilesystem,
  paths: PolicyCustodyPaths,
  destination: string,
  phase: PolicyExclusivePromotionRequest['phase'],
  files: Readonly<Record<string, string | Uint8Array>>,
): Promise<void> {
  await assertAbsent(filesystem, paths.staging)
  await assertAbsent(filesystem, destination)
  const rootStat = await assertSecureDirectory(filesystem, paths.root)
  await filesystem.mkdir(paths.staging, { mode: 0o700 })
  try {
    const stagingStat = await assertSecureDirectory(
      filesystem,
      paths.staging,
      rootStat.dev,
    )
    if (stagingStat.dev !== rootStat.dev)
      throw new PolicyBaselineError('policy-custody')
    for (const [name, value] of Object.entries(files))
      await writeSecureFile(filesystem, join(paths.staging, name), value)
    await assertExactDirectoryInventory(
      filesystem,
      paths.staging,
      Object.keys(files),
      rootStat.dev,
    )
    const table = policyPromotionFileTable(files)
    await assertExactBundleBytes(filesystem, paths.staging, table)
    await assertAbsent(filesystem, destination)
    const request = { phase, files: table } as PolicyExclusivePromotionRequest
    assertClosedPolicyPromotionRequest(request)
    await filesystem.promoteExclusive(request)
    await assertAbsent(filesystem, paths.staging)
    await assertExactDirectoryInventory(
      filesystem,
      destination,
      Object.keys(files),
      rootStat.dev,
    )
    await assertExactBundleBytes(filesystem, destination, table)
  } catch (error) {
    // A failed promotion deliberately leaves the invocation staging path in
    // place.  A later invocation treats it as residue rather than deleting a
    // path it cannot prove still belongs to this invocation after a race.
    throw error
  }
}

async function assertPolicyPhaseAndVacancies(
  root: string,
  phase: PolicyCustodyPhase,
  filesystem: PolicyFilesystem,
  requiredVacancies: readonly string[],
): Promise<void> {
  for (const path of requiredVacancies) await assertAbsent(filesystem, path)
  const paths = policyCustodyPaths(root)
  await assertAbsent(filesystem, paths.staging)
  if (phase === 'absent') {
    await assertAbsent(filesystem, paths.root)
    return
  }
  const rootStat = await assertSecureDirectory(filesystem, paths.root)
  const expected = custodyPhaseBundles[phase]
  const entries = [...(await filesystem.readdir(paths.root))].sort()
  if (canonicalJson(entries) !== canonicalJson([...expected].sort()))
    throw new PolicyBaselineError('policy-custody')
  for (const bundle of expected)
    await assertExactDirectoryInventory(
      filesystem,
      paths[
        bundle === 'role-input'
          ? 'roleInput'
          : bundle === 'role-result'
            ? 'roleResult'
            : 'capture'
      ],
      inventoryForBundle[bundle],
      rootStat.dev,
    )
}

export async function assertPolicyCustodyVacanciesForFixture(
  paths: readonly string[],
  filesystem: PolicyFilesystem = nodePolicyFilesystem,
): Promise<void> {
  if (process.env.NODE_ENV !== 'test')
    throw new PolicyBaselineError('policy-wrapper-isolation')
  for (const path of paths) await assertAbsent(filesystem, path)
}

export async function writePolicyCaptureForFixture(
  root: string,
  captureInput: unknown,
  filesystem: PolicyFilesystem = nodePolicyFilesystem,
  requiredVacancies = fixedVacanciesForPolicyRoot(root),
): Promise<void> {
  if (process.env.NODE_ENV !== 'test')
    throw new PolicyBaselineError('policy-wrapper-isolation')
  const capture = parsePolicyBaselineCapture(captureInput)
  const paths = policyCustodyPaths(root)
  await assertPolicyPhaseAndVacancies(
    root,
    'absent',
    filesystem,
    requiredVacancies,
  )
  await filesystem.mkdir(paths.root, { mode: 0o700 })
  await assertSecureDirectory(filesystem, paths.root)
  await promoteBundle(filesystem, paths, paths.capture, 'capture', {
    'capture.json': `${JSON.stringify(capture)}\n`,
  })
}
export async function writePolicyRoleInputForFixture(
  root: string,
  input: Readonly<{
    capture: unknown
    retrieval: unknown
    bodies: readonly PolicyBody[]
  }>,
  filesystem: PolicyFilesystem = nodePolicyFilesystem,
  requiredVacancies = fixedVacanciesForPolicyRoot(root),
): Promise<PolicyRoleInputManifest> {
  if (process.env.NODE_ENV !== 'test')
    throw new PolicyBaselineError('policy-wrapper-isolation')
  const capture = parsePolicyBaselineCapture(input.capture)
  const retrieval = parsePolicySemanticReviewRetrieval(input.retrieval, capture)
  if (input.bodies.length !== 5) throw new PolicyBaselineError('policy-custody')
  const bodies = input.bodies.map((body) => {
    if (
      body.byteCount !== body.bytes.byteLength ||
      body.byteCount === 0 ||
      body.byteCount > policyReviewLimits.maximumBytesPerBody ||
      body.sha256 !== sha256Bytes(body.bytes)
    )
      throw new PolicyBaselineError('policy-byte-drift')
    assertCanonicalUtf8(body.bytes)
    return body
  })
  const manifest = createPolicyRoleInputManifest({
    captureSha256: capture.captureSha256,
    semanticReviewRetrievalSha256: retrieval.semanticReviewRetrievalSha256,
    bodies: bodies.map((body, index) => ({
      name: policyReviewInventory.roleInput[
        index
      ] as PolicyRoleInputManifest['bodies'][number]['name'],
      byteCount: body.byteCount,
      sha256: body.sha256,
    })),
  })
  validatePolicyRoleInputManifestAgainstAuthorities(
    manifest,
    capture,
    retrieval,
  )
  const paths = policyCustodyPaths(root)
  await assertPolicyPhaseAndVacancies(
    root,
    'capture',
    filesystem,
    requiredVacancies,
  )
  await promoteBundle(filesystem, paths, paths.roleInput, 'role-input', {
    ...Object.fromEntries(
      bodies.map((body, index) => [
        policyReviewInventory.roleInput[index]!,
        body.bytes,
      ]),
    ),
    'manifest.json': `${JSON.stringify(manifest)}\n`,
    'retrieval.json': `${JSON.stringify(retrieval)}\n`,
  })
  return manifest
}
export async function assertPolicyCustodyForFixture(
  root: string,
  phase: PolicyCustodyPhase,
  filesystem: PolicyFilesystem = nodePolicyFilesystem,
): Promise<void> {
  if (process.env.NODE_ENV !== 'test')
    throw new PolicyBaselineError('policy-wrapper-isolation')
  await assertPolicyPhaseAndVacancies(root, phase, filesystem, [])
}
export type PolicyReviewerProcess = Readonly<{
  writeStdin: (value: Uint8Array) => Promise<void>
  endStdin: () => Promise<void>
  wait: (
    onDiagnostic: (stream: 'stdout' | 'stderr', chunk: Uint8Array) => void,
  ) => Promise<
    Readonly<{
      code: number
      groupAlive: boolean
      openDescriptors: number
    }>
  >
  terminateProcessGroup: () => Promise<void>
}>
export type PolicyReviewerSpawner = (
  launch: ReturnType<typeof createPolicyReviewerLaunch>,
) => Promise<PolicyReviewerProcess>
/** Test-only lifecycle seam; live launch remains unavailable until host preflight. */
export async function runPolicyReviewerForFixture(
  input: Readonly<{
    launch: Parameters<typeof createPolicyReviewerLaunch>[0]
    bodies: readonly PolicyBody[]
    prompt: Uint8Array
    commitments: Readonly<{
      captureSha256: string
      semanticReviewRetrievalSha256: string
      reviewerContractSha256: string
    }>
    spawn: PolicyReviewerSpawner
    filesystem?: PolicyFilesystem
  }>,
): Promise<PolicySemanticReviewRoleResult> {
  if (process.env.NODE_ENV !== 'test')
    throw new PolicyBaselineError('policy-wrapper-isolation')
  const launch = createPolicyReviewerLaunch(input.launch)
  const filesystem = input.filesystem ?? nodePolicyFilesystem
  await assertAbsent(filesystem, input.launch.resultPath)
  const reviewerProcess = await input.spawn(launch)
  try {
    await reviewerProcess.writeStdin(
      buildPolicyReviewerStdin(input.bodies, input.prompt, input.commitments),
    )
    await reviewerProcess.endStdin()
    let stdoutBytes = 0
    let stderrBytes = 0
    const outcome = await reviewerProcess.wait((stream, chunk) => {
      if (stream === 'stdout') stdoutBytes += chunk.byteLength
      else stderrBytes += chunk.byteLength
      if (
        stdoutBytes > launch.stdoutByteLimit ||
        stderrBytes > launch.stderrByteLimit ||
        stdoutBytes + stderrBytes > launch.combinedOutputByteLimit
      )
        throw new PolicyBaselineError('policy-wrapper-output')
    })
    if (
      outcome.code !== 0 ||
      outcome.groupAlive ||
      outcome.openDescriptors !== 0
    )
      throw new PolicyBaselineError('policy-wrapper-output')
    await assertSecureFile(filesystem, input.launch.resultPath)
    const result = await filesystem.readFile(input.launch.resultPath)
    if (result.byteLength === 0 || result.byteLength > launch.resultByteLimit)
      throw new PolicyBaselineError('policy-wrapper-output')
    const text = new TextDecoder('utf-8', { fatal: true }).decode(result)
    return createPolicySemanticReviewRoleResult(text)
  } catch (error) {
    await reviewerProcess.terminateProcessGroup()
    if (error instanceof PolicyBaselineError) throw error
    throw new PolicyBaselineError('policy-wrapper-output')
  }
}

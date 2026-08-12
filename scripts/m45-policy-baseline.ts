import { createHash } from 'node:crypto'
import {
  chmod,
  link,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  rmdir,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from '@/config/zod'
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
} as const

export const policyReviewRoots = [
  '.local/m45/continuity-review',
  '.local/m45/identity-allocation',
  '.local/m45/independent-review',
  '.local/m45/policy-baseline-review',
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
  'policy-wrapper-output',
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

export type PolicyFetch = (url: URL, init: RequestInit) => Promise<Response>
export async function retrievePolicyBodies(
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
  const bodies: PolicyBody[] = []
  for (const value of wikimediaPolicyUrls) {
    let response: Response
    try {
      response = await input.fetch(new URL(value), {
        method: 'GET',
        redirect: 'manual',
        headers: { 'User-Agent': discoveryUserAgent },
        signal: AbortSignal.timeout(policyReviewLimits.timeoutMilliseconds),
      })
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.name === 'TimeoutError')
      )
        throw new PolicyBaselineError('policy-timeout')
      throw error
    }
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
    assertCanonicalUtf8(bytes)
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
  roleResult: [policyRoleOutputFilename],
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
  executionSpec: `${assetDirectory}reviewer-execution-spec.txt`,
} as const
export const policyReviewerExecutionSpecPath = `${assetDirectory}reviewer-execution-spec.txt`
export const acceptedPolicyReviewerContractSha256 =
  '33761c81728e17b86e04605679c6dc6f2f0a7bcc3022c2b332021f059be43cee' as const
export async function createPolicyReviewerContract(): Promise<
  Readonly<{
    schema: 'wikimedia-policy-reviewer-contract.v1'
    version: 1
    promptSha256: string
    outputSchemaSha256: string
    executionSpecSha256: string
    roleOutputSchema: string
    roleOutputVersion: 1
    reviewerContractSha256: string
  }>
> {
  const [prompt, outputSchema, executionSpec] = await Promise.all([
    readFile(policyReviewerAssetPaths.prompt),
    readFile(policyReviewerAssetPaths.outputSchema),
    readFile(policyReviewerAssetPaths.executionSpec),
  ])
  const core = {
    schema: 'wikimedia-policy-reviewer-contract.v1' as const,
    version: 1 as const,
    promptSha256: sha256Bytes(prompt),
    outputSchemaSha256: sha256Bytes(outputSchema),
    executionSpecSha256: sha256Bytes(executionSpec),
    roleOutputSchema: 'wikimedia-policy-semantic-review-role-output.v1',
    roleOutputVersion: 1 as const,
  }
  const reviewerContractSha256 = discoverySha256(core)
  if (reviewerContractSha256 !== acceptedPolicyReviewerContractSha256)
    throw new PolicyBaselineError('policy-wrapper-contract')
  return { ...core, reviewerContractSha256 }
}

export type PolicyBaselineCommand =
  | Readonly<{ mode: 'check' }>
  | Readonly<{ mode: 'capture' }>
  | Readonly<{ mode: 'prepare-review' }>
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
  if (
    args.length === 2 &&
    args[0] === 'prepare-review' &&
    args[1] === '--confirm-wikimedia-policy-baseline'
  )
    return { mode: 'prepare-review' }
  if (
    args.length === 2 &&
    args[0] === 'finalize' &&
    args[1] === '--confirm-wikimedia-policy-baseline'
  )
    return { mode: 'finalize' }
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
  link: (staged: string, destination: string) => Promise<void>
  unlink: (path: string) => Promise<void>
  rmdir: (path: string) => Promise<void>
  removeDirectory: (path: string) => Promise<void>
}>
const nodePolicyFilesystem: PolicyFilesystem = {
  lstat,
  readdir,
  mkdir: async (path, options) => mkdir(path, options),
  chmod,
  readFile,
  writeFile,
  link,
  unlink,
  rmdir,
  removeDirectory: async (path) => rm(path, { recursive: true }),
}
type PolicyCustodyPaths = Readonly<{
  root: string
  capture: string
  roleInput: string
  roleResult: string
  staging: string
}>
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
  try {
    await filesystem.writeFile(path, value, { flag: 'wx', mode: 0o600 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      throw new PolicyBaselineError('policy-custody')
    throw error
  }
  const stat = await assertSecureFile(filesystem, path)
  const read = await filesystem.readFile(path)
  const expected = Buffer.from(value)
  if (!read.equals(expected)) throw new PolicyBaselineError('policy-custody')
  await assertSecureFile(filesystem, path, stat.dev, 0o600, stat.ino)
}
function policyPromotionFileTable(
  files: Readonly<Record<string, string | Uint8Array>>,
): readonly Readonly<{ name: string; byteCount: number; sha256: string }>[] {
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
  table: readonly Readonly<{
    name: string
    byteCount: number
    sha256: string
  }>[],
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
    try {
      await filesystem.mkdir(destination, { mode: 0o700 })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST')
        throw new PolicyBaselineError('policy-custody')
      throw error
    }
    const destinationStat = await assertSecureDirectory(
      filesystem,
      destination,
      rootStat.dev,
    )
    if (destinationStat.dev !== rootStat.dev)
      throw new PolicyBaselineError('policy-custody')
    for (const expected of table) {
      try {
        await filesystem.link(
          join(paths.staging, expected.name),
          join(destination, expected.name),
        )
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST')
          throw new PolicyBaselineError('policy-custody')
        throw error
      }
    }
    // The destination entries are hard links to the staged files (nlink 2)
    // until staging is removed, so byte equality is verified against the
    // staged content first; full secure re-assertion follows staging removal.
    for (const expected of table) {
      const bytes = await filesystem.readFile(join(destination, expected.name))
      if (
        bytes.byteLength !== expected.byteCount ||
        sha256Bytes(bytes) !== expected.sha256
      )
        throw new PolicyBaselineError('policy-byte-drift')
    }
    for (const expected of table)
      await filesystem.unlink(join(paths.staging, expected.name))
    await filesystem.rmdir(paths.staging)
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
    // place.  The fixed staging name cannot be proven invocation-owned after
    // a race, so a later invocation treats it as residue rather than deleting
    // a path it cannot prove still belongs to this invocation.
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

export type PolicyBaselineSeams = Readonly<{
  filesystem: PolicyFilesystem
  root: string
  fetch: PolicyFetch
  completedAt: () => Date
  vacancies?: readonly string[]
}>

function assertPolicyBaselineContractLiterals(): void {
  if (
    wikimediaPolicyUrls.length !== 5 ||
    policyReviewLimits.urls !== 5 ||
    policyReviewLimits.timeoutMilliseconds !== 10_000 ||
    policyReviewLimits.maximumBytesPerBody !== 1024 * 1024 ||
    policyReviewLimits.maximumTotalBytes !== 5 * 1024 * 1024 ||
    policyReviewLimits.outputBytes !== 4 * 1024
  )
    throw new PolicyBaselineError('policy-arguments')
}

export async function runPolicyBaselineCheck(): Promise<
  Readonly<{ mode: 'check'; status: 'checked' }>
> {
  assertPolicyBaselineContractLiterals()
  return { mode: 'check', status: 'checked' }
}

export async function runPolicyBaselineCapture(
  seams: PolicyBaselineSeams,
): Promise<
  Readonly<{
    mode: 'capture'
    status: 'complete'
    captureSha256: string
    urls: 5
    requests: 5
    bytes: number
    retrievedAt: string
  }>
> {
  const paths = policyCustodyPaths(seams.root)
  const vacancies = seams.vacancies ?? fixedVacanciesForPolicyRoot(seams.root)
  await assertPolicyPhaseAndVacancies(
    seams.root,
    'absent',
    seams.filesystem,
    vacancies,
  )
  const retrieved = await retrievePolicyBodies({
    fetch: seams.fetch,
    completedAt: seams.completedAt,
  })
  const capture = createPolicyBaselineCapture(retrieved.capture)
  await seams.filesystem.mkdir(seams.root, { mode: 0o700 })
  await assertSecureDirectory(seams.filesystem, seams.root)
  await promoteBundle(seams.filesystem, paths, paths.capture, {
    'capture.json': `${JSON.stringify(capture)}\n`,
  })
  const reread = parsePolicyBaselineCapture(
    JSON.parse(
      (
        await seams.filesystem.readFile(join(paths.capture, 'capture.json'))
      ).toString('utf8'),
    ),
    seams.completedAt(),
  )
  if (reread.captureSha256 !== capture.captureSha256)
    throw new PolicyBaselineError('policy-authority')
  return {
    mode: 'capture',
    status: 'complete',
    captureSha256: capture.captureSha256,
    urls: 5,
    requests: 5,
    bytes: capture.totalDecodedBytes,
    retrievedAt: capture.retrievedAt,
  }
}

export async function runPolicyBaselinePrepareReview(
  seams: PolicyBaselineSeams,
): Promise<
  Readonly<{
    mode: 'prepare-review'
    status: 'complete'
    retrievalSha256: string
    manifestSha256: string
    bytes: number
  }>
> {
  const paths = policyCustodyPaths(seams.root)
  const vacancies = seams.vacancies ?? fixedVacanciesForPolicyRoot(seams.root)
  await assertPolicyPhaseAndVacancies(
    seams.root,
    'capture',
    seams.filesystem,
    vacancies,
  )
  const capture = parsePolicyBaselineCapture(
    JSON.parse(
      (
        await seams.filesystem.readFile(join(paths.capture, 'capture.json'))
      ).toString('utf8'),
    ),
    seams.completedAt(),
  )
  const retrieved = await retrievePolicyBodies({
    fetch: seams.fetch,
    completedAt: seams.completedAt,
  })
  const retrieval = parsePolicySemanticReviewRetrieval(
    createPolicySemanticReviewRetrieval(retrieved.capture),
    capture,
    seams.completedAt(),
  )
  const manifest = createPolicyRoleInputManifest({
    captureSha256: capture.captureSha256,
    semanticReviewRetrievalSha256: retrieval.semanticReviewRetrievalSha256,
    bodies: retrieved.bodies.map((body, index) => ({
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
    seams.completedAt(),
  )
  await promoteBundle(seams.filesystem, paths, paths.roleInput, {
    ...Object.fromEntries(
      retrieved.bodies.map((body, index) => [
        policyReviewInventory.roleInput[index]!,
        body.bytes,
      ]),
    ),
    'manifest.json': `${JSON.stringify(manifest)}\n`,
    'retrieval.json': `${JSON.stringify(retrieval)}\n`,
  })
  const rereadManifest = parsePolicyRoleInputManifest(
    JSON.parse(
      (
        await seams.filesystem.readFile(join(paths.roleInput, 'manifest.json'))
      ).toString('utf8'),
    ),
  )
  if (rereadManifest.manifestSha256 !== manifest.manifestSha256)
    throw new PolicyBaselineError('policy-custody')
  return {
    mode: 'prepare-review',
    status: 'complete',
    retrievalSha256: retrieval.semanticReviewRetrievalSha256,
    manifestSha256: manifest.manifestSha256,
    bytes: retrieval.totalDecodedBytes,
  }
}

export async function runPolicyBaselineFinalize(
  seams: PolicyBaselineSeams,
): Promise<
  Readonly<{
    mode: 'finalize'
    status: 'complete'
    outcome: 'no-material-change'
    reviewedAt: string
    semanticReview: PolicySemanticReview
    baseline: Awaited<ReturnType<typeof createPolicyBaseline>>
  }>
> {
  const paths = policyCustodyPaths(seams.root)
  const vacancies = seams.vacancies ?? fixedVacanciesForPolicyRoot(seams.root)
  const now = seams.completedAt()
  await assertPolicyPhaseAndVacancies(
    seams.root,
    'role-result',
    seams.filesystem,
    vacancies,
  )
  const capture = parsePolicyBaselineCapture(
    JSON.parse(
      (
        await seams.filesystem.readFile(join(paths.capture, 'capture.json'))
      ).toString('utf8'),
    ),
    now,
  )
  const retrieval = parsePolicySemanticReviewRetrieval(
    JSON.parse(
      (
        await seams.filesystem.readFile(join(paths.roleInput, 'retrieval.json'))
      ).toString('utf8'),
    ),
    capture,
    now,
  )
  const manifest = validatePolicyRoleInputManifestAgainstAuthorities(
    JSON.parse(
      (
        await seams.filesystem.readFile(join(paths.roleInput, 'manifest.json'))
      ).toString('utf8'),
    ),
    capture,
    retrieval,
    now,
  )
  for (const entry of manifest.bodies) {
    const bytes = await seams.filesystem.readFile(
      join(paths.roleInput, entry.name),
    )
    if (
      bytes.byteLength !== entry.byteCount ||
      sha256Bytes(bytes) !== entry.sha256
    )
      throw new PolicyBaselineError('policy-byte-drift')
  }
  const roleOutputBytes = await seams.filesystem.readFile(
    join(paths.roleResult, policyRoleOutputFilename),
  )
  if (roleOutputBytes.byteLength > policyReviewLimits.outputBytes)
    throw new PolicyBaselineError('policy-wrapper-output')
  let roleOutputText: string
  try {
    roleOutputText = new TextDecoder('utf-8', { fatal: true }).decode(
      roleOutputBytes,
    )
  } catch {
    throw new PolicyBaselineError('policy-wrapper-output')
  }
  const roleResult = createPolicySemanticReviewRoleResult(roleOutputText)
  const semanticReview = await finalizePolicySemanticReview({
    capture,
    retrieval,
    roleResult,
    now,
  })
  // A material-change verdict stops here and preserves the review root as
  // evidence; the root is removed only for the accepted no-material-change
  // outcome, and authority emission always follows removal and absence proof.
  if (semanticReview.outcome !== 'no-material-change')
    throw new PolicyBaselineError('policy-authority')
  await assertSecureDirectory(seams.filesystem, seams.root)
  await seams.filesystem.removeDirectory(seams.root)
  await assertAbsent(seams.filesystem, seams.root)
  await assertAbsent(seams.filesystem, paths.staging)
  const baseline = await createPolicyBaseline({
    capture,
    retrieval,
    semanticReview,
    now,
  })
  return {
    mode: 'finalize',
    status: 'complete',
    outcome: semanticReview.outcome,
    reviewedAt: baseline.reviewedAt,
    semanticReview,
    baseline,
  }
}

export async function runPolicyBaselineMode(
  command: PolicyBaselineCommand,
  seams: PolicyBaselineSeams,
): Promise<
  | ReturnType<typeof runPolicyBaselineCheck>
  | Awaited<ReturnType<typeof runPolicyBaselineCapture>>
  | Awaited<ReturnType<typeof runPolicyBaselinePrepareReview>>
  | Awaited<ReturnType<typeof runPolicyBaselineFinalize>>
> {
  if (command.mode === 'check') return runPolicyBaselineCheck()
  if (command.mode === 'capture') return runPolicyBaselineCapture(seams)
  if (command.mode === 'prepare-review')
    return runPolicyBaselinePrepareReview(seams)
  return runPolicyBaselineFinalize(seams)
}

const policyBaselineReviewRoot = '.local/m45/policy-baseline-review' as const

function snapshotStoppedMode(argv: readonly string[]): string {
  if (!Array.isArray(argv)) return 'unknown'
  const first = argv[0]
  if (typeof first !== 'string') return 'unknown'
  return first === 'check' ||
    first === 'capture' ||
    first === 'prepare-review' ||
    first === 'finalize'
    ? first
    : 'unknown'
}

export async function executePolicyBaselineCli(
  argv = process.argv.slice(2),
): Promise<number> {
  let stoppedMode: string = 'unknown'
  try {
    stoppedMode = snapshotStoppedMode(argv)
    const command = parsePolicyBaselineArguments(argv)
    stoppedMode = command.mode
    const result = await runPolicyBaselineMode(command, {
      filesystem: nodePolicyFilesystem,
      root: policyBaselineReviewRoot,
      fetch,
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
  void executePolicyBaselineCli().then((code) => {
    process.exitCode = code
  })
}

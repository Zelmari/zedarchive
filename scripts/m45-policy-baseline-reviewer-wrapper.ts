import { createHash } from 'node:crypto'
import { policyReviewerLaunchPolicy } from './m45-policy-baseline-reviewer-launch-policy'

export const policyReviewerWrapperSourceVersion =
  'm45-policy-reviewer-wrapper.v1' as const

export function buildReviewedPolicyReviewerCommand(
  input: Readonly<{
    renderedSandboxProfilePath: string
    outputSchemaPath: string
    resultPath: string
    workingDirectory: string
  }>,
): readonly string[] {
  const paths = Object.values(input)
  if (paths.some((path) => !isSafeAbsolutePath(path)))
    throw new Error('Unsafe policy reviewer path.')
  return [
    policyReviewerLaunchPolicy.outerExecutable,
    policyReviewerLaunchPolicy.outerProfileFlag,
    input.renderedSandboxProfilePath,
    policyReviewerLaunchPolicy.executable,
    policyReviewerLaunchPolicy.subcommand,
    '--model',
    policyReviewerLaunchPolicy.model,
    '--config',
    policyReviewerLaunchPolicy.reasoningConfig,
    '--ephemeral',
    '--ignore-user-config',
    '--sandbox',
    policyReviewerLaunchPolicy.sandbox,
    '--cd',
    input.workingDirectory,
    '--output-schema',
    input.outputSchemaPath,
    '--output-last-message',
    input.resultPath,
  ]
}

type ReviewedPolicyBody = Readonly<{
  bytes: Uint8Array
  sha256: string
  byteCount: number
}>
type ReviewedCommitments = Readonly<{
  captureSha256: string
  semanticReviewRetrievalSha256: string
  reviewerContractSha256: string
}>
const sha256Pattern = /^[a-f0-9]{64}$/u
const safeAbsolutePathPattern = /^\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/u
function isSafeAbsolutePath(value: string): boolean {
  return (
    safeAbsolutePathPattern.test(value) &&
    value.split('/').every((segment) => segment !== '.' && segment !== '..')
  )
}
function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}
function assertCanonicalUtf8(bytes: Uint8Array): void {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error('Invalid policy body encoding.')
  }
  if (!Buffer.from(text, 'utf8').equals(Buffer.from(bytes)))
    throw new Error('Invalid policy body encoding.')
}
export function buildReviewedPolicyReviewerStdin(
  bodies: readonly ReviewedPolicyBody[],
  prompt: Uint8Array,
  commitments: ReviewedCommitments,
): Uint8Array {
  if (
    bodies.length !== 5 ||
    Object.values(commitments).some((value) => !sha256Pattern.test(value))
  )
    throw new Error('Invalid policy reviewer framing.')
  let totalBytes = 0
  for (const body of bodies) {
    if (
      body.byteCount !== body.bytes.byteLength ||
      body.byteCount === 0 ||
      body.byteCount > 1024 * 1024 ||
      body.sha256 !== sha256(body.bytes)
    )
      throw new Error('Invalid policy reviewer body.')
    totalBytes += body.byteCount
    assertCanonicalUtf8(body.bytes)
  }
  if (totalBytes > 5 * 1024 * 1024)
    throw new Error('Policy reviewer body limit exceeded.')
  const chunks: Uint8Array[] = [
    prompt,
    Buffer.from(
      `\ncapture-sha256:${commitments.captureSha256}\nsemantic-review-retrieval-sha256:${commitments.semanticReviewRetrievalSha256}\nreviewer-contract-sha256:${commitments.reviewerContractSha256}\nbody-count:5\n`,
    ),
  ]
  for (const [index, body] of bodies.entries()) {
    chunks.push(
      Buffer.from(
        `body:index=${index + 1};bytes=${body.byteCount};sha256=${body.sha256}\n`,
      ),
      body.bytes,
      Buffer.from('\n'),
    )
  }
  chunks.push(Buffer.from('end:policy-review-stdin.v1\n'))
  return Buffer.concat(chunks)
}
export function createReviewedPolicyReviewerLaunch(
  input: Readonly<{
    renderedSandboxProfilePath: string
    outputSchemaPath: string
    resultPath: string
    workingDirectory: string
  }>,
) {
  return {
    command: buildReviewedPolicyReviewerCommand(input),
    environment: {},
    detachedProcessGroup: policyReviewerLaunchPolicy.detachedProcessGroup,
    stdoutByteLimit: policyReviewerLaunchPolicy.stdoutByteLimit,
    stderrByteLimit: policyReviewerLaunchPolicy.stderrByteLimit,
    combinedOutputByteLimit: policyReviewerLaunchPolicy.combinedOutputByteLimit,
    resultByteLimit: policyReviewerLaunchPolicy.resultByteLimit,
    permitToolExecution: policyReviewerLaunchPolicy.permitToolExecution,
  } as const
}

import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const sha256 = (value: Uint8Array | string) =>
  createHash('sha256').update(value).digest('hex')

/**
 * Decision 147 retires the A/B/C native policy bootstrap architecture.  Every
 * mode literal of the retired production grammar is removed: no invocation can
 * reach host, tracked, or custody reads.  The committed source remains as
 * historical evidence; the production command always stops closed, and the
 * historical synthetic fixture survives only behind the NODE_ENV === 'test'
 * fixture seam (Decision 140 mechanical-retirement pattern).
 */
export const retiredPolicyNativeDerivationModes = [
  'check',
  'preflight',
  'recover-preflight',
  'diagnose-a',
  'diagnose-a-residue',
  'diagnose-a-fd-map',
  'derive-a',
  'derive-b',
  'review-candidate',
] as const
export type RetiredPolicyNativeDerivationMode =
  (typeof retiredPolicyNativeDerivationModes)[number]

export type PolicyNativeDerivationResult = Readonly<{
  mode: RetiredPolicyNativeDerivationMode | 'retired' | 'unknown'
  status: 'stopped'
}>

function snapshotStoppedMode(
  argv: readonly string[],
): RetiredPolicyNativeDerivationMode | 'retired' | 'unknown' {
  if (!Array.isArray(argv)) return 'unknown'
  const first = argv[0]
  if (typeof first !== 'string') return 'unknown'
  return (retiredPolicyNativeDerivationModes as readonly string[]).includes(
    first,
  )
    ? 'retired'
    : 'unknown'
}

/**
 * Production grammar: every retired mode literal and every other argument
 * sequence is rejected with a closed stopped result.  This function performs
 * no host, tracked, or custody read of any kind.
 */
export function runPolicyNativeDerivationCommand(
  argv: readonly string[],
): PolicyNativeDerivationResult {
  const mode = snapshotStoppedMode(argv)
  return Object.freeze({ mode, status: 'stopped' })
}

export type PolicyNativeDerivationFixture = Readonly<{
  residue: Readonly<{
    root: Readonly<{
      uid: number
      dev: number
      ino: number
      mode: number
      nlink: number
      size: number
    }>
    lockOnlyRoot: Readonly<{
      uid: number
      dev: number
      ino: number
      mode: number
      nlink: number
      size: number
    }>
    buildResidueRoot: Readonly<{
      uid: number
      dev: number
      ino: number
      mode: number
      nlink: number
      size: number
    }>
    control: Readonly<{
      uid: number
      dev: number
      ino: number
      mode: number
      nlink: number
      size: number
    }>
    siblings: Readonly<Record<string, unknown>>
    baseline: Readonly<{
      uid: number
      dev: number
      ino: number
      mode: number
      nlink: number
      size: number
      sha256: string
    }>
    lock: Readonly<{
      uid: number
      dev: number
      ino: number
      mode: number
      nlink: number
      size: number
    }>
    baselineBytes: Buffer
    tracked: Readonly<Record<string, string>>
  }>
  run: (argv: readonly string[]) => PolicyNativeDerivationResult
}>

const syntheticTracked = Object.freeze({
  commit: 'c'.repeat(40),
  runnerSha256: '1'.repeat(64),
  sourceSha256: '2'.repeat(64),
  launchContractSha256: '3'.repeat(64),
  launcherSha256: '4'.repeat(64),
  nativeAuthoritySha256: '5'.repeat(64),
  lockPreflightWorkerSha256: '6'.repeat(64),
})

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`
  return JSON.stringify(value)
}

function createArtifact(schema: string, core: Record<string, unknown>): string {
  const value = {
    schema,
    version: 1,
    ...core,
  }
  return `${canonical({ ...value, artifactSha256: sha256(canonical(value)) })}\n`
}

/** Historical synthetic residue; test-only, unreachable from production argv. */
export function createPolicySyntheticNativeDerivationFixture(): PolicyNativeDerivationFixture {
  if (process.env.NODE_ENV !== 'test') throw new Error('test-only')
  const directory = (ino: number, entryCount: number, requiredMode = 0o755) =>
    Object.freeze({
      uid: 501,
      dev: 9,
      ino,
      mode: requiredMode,
      nlink: 2 + entryCount,
      size: 32 + entryCount * 32,
      file: false,
      directory: true,
      symbolicLink: false,
    })
  const root = directory(100, 4, 0o700)
  const controlCreated = directory(104, 0, 0o700)
  const control = { ...controlCreated, nlink: 3, size: 64 }
  const siblings = Object.freeze({
    'candidate-review': directory(101, 0),
    discovery: directory(102, 0),
    'predecessor-review': directory(103, 0),
  })
  const bytes = Buffer.from(
    createArtifact('m45-policy-native-shared-root-baseline.v1.v1', {
      sharedRootOriginal: { ...root, mode: 0o755, nlink: 5 },
      sharedRootSecured: root,
      preservedSiblings: siblings,
      controlRoot: controlCreated,
      tracked: syntheticTracked,
    }),
  )
  const baseline = Object.freeze({
    uid: 501,
    dev: 9,
    ino: 105,
    mode: 0o600,
    nlink: 1,
    size: bytes.byteLength,
    sha256: sha256(bytes),
    file: true,
    directory: false,
    symbolicLink: false,
  })
  const lock = Object.freeze({
    uid: 501,
    dev: 9,
    ino: 106,
    mode: 0o600,
    nlink: 1,
    size: 0,
  })
  const lockOnlyRoot = Object.freeze({
    ...root,
    nlink: 7,
    size: root.size + 32,
  })
  const buildResidueRoot = Object.freeze({
    ...lockOnlyRoot,
    nlink: 8,
    size: lockOnlyRoot.size + 32,
  })
  const residue = Object.freeze({
    root,
    lockOnlyRoot,
    buildResidueRoot,
    control: Object.freeze(control),
    siblings,
    baseline,
    lock,
    baselineBytes: Buffer.from(bytes),
    tracked: syntheticTracked,
  })
  return Object.freeze({
    residue,
    run: (argv: readonly string[]) => runPolicyNativeDerivationCommand(argv),
  })
}

export async function executePolicyNativeDerivationCli(
  argv = process.argv.slice(2),
): Promise<number> {
  const result = runPolicyNativeDerivationCommand(argv)
  process.stdout.write(`${JSON.stringify(result)}\n`)
  return 1
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  void executePolicyNativeDerivationCli().then((code) => {
    process.exitCode = code
  })
}

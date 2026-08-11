import { createHash, randomBytes } from 'node:crypto'
import { execFile } from 'node:child_process'
import { constants as fsConstants } from 'node:fs'
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  writeFile,
} from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createPolicyPromotionProvenanceCandidate,
  derivePolicyProvisionalBuildA,
  derivePolicyProvisionalBuildB,
  inspectPolicyLockPreflightWorker,
  inspectPolicyNativeLaunchSources,
  inspectPolicyExclusivePromotionSource,
  parsePolicyPromotionPackage,
} from './m45-policy-baseline'
import {
  diagnosePolicyProvisionalABuildResidue,
  diagnosePolicyProvisionalBuildAPrebuild,
  policySdkProtectionStops,
  recoverPolicyProvisionalAFdMapScratch,
} from './m45-policy-baseline-native-authority'

const confirmation = '--confirm-m45-policy-native-derivation-v1'
const diagnosticConfirmation = '--confirm-m45-policy-native-a-diagnostic-v10'
const residueDiagnosticConfirmation =
  '--confirm-m45-policy-native-a-residue-diagnostic-v2'
const fdMapScratchRecoveryConfirmation =
  '--confirm-m45-policy-native-a-fd-map-scratch-recovery-v1'
const reviewConfirmation = '--confirm-m45-policy-native-review-v1'
const recoveryConfirmation = '--confirm-m45-policy-native-recovery-v1'
const controlName = 'policy-native-derivation'
const baselineName = 'shared-root-baseline.v1.json'
const stageAName = 'stage-a.v1.json'
const stageBName = 'stage-b.v1.json'
const candidateName = 'candidate.v1.json'
const reviewInputName = 'review-input.v1.json'
const commandLockName = '.policy-exclusive-promotion.lock'
const buildRootName = '.policy-exclusive-promotion-build'
const darwinNoFollow = 0x00000100
const darwinCloseOnExec = 0x01000000
const preservedSiblings = [
  'candidate-review',
  'discovery',
  'predecessor-review',
] as const
const policyNode = '/opt/homebrew/Cellar/node@24/24.18.1/bin/node'
const maxHeldArtifactBytes = 16 * 1024 * 1024
const sha256 = (value: Uint8Array | string) =>
  createHash('sha256').update(value).digest('hex')

export type PolicyNativeDerivationMode =
  | 'check'
  | 'preflight'
  | 'recover-preflight'
  | 'diagnose-a'
  | 'diagnose-a-residue'
  | 'recover-a-fd-map-scratch'
  | 'derive-a'
  | 'derive-b'
  | 'review-candidate'

export type PolicyNativeDerivationResult = Readonly<{
  mode: PolicyNativeDerivationMode | 'unknown'
  status:
    | 'checked'
    | 'preflight-ready'
    | 'preflight-recovered'
    | 'diagnostic-complete'
    | 'diagnostic-stopped'
    | 'a-build-residue-diagnosed'
    | 'a-fd-map-scratch-recovered'
    | 'a-derived'
    | 'a-residue-preserved'
    | 'b-derived'
    | 'review-ready'
    | 'stopped'
  commitments?: Readonly<Record<string, string>>
  lastSuccessfulBoundary?: PolicyProvisionalAPrebuildBoundary
  derivationLockCycleClosed?: true
  sdkProtectionStop?: PolicySdkProtectionStop
  helperExitCode?: number
}>

export const policyProvisionalAPrebuildBoundaries = [
  'entry-custody',
  'lock-capability',
  'derivation-lock-open',
  'xcrun-compiler-resolution',
  'xcrun-sdk-child',
  'xcrun-sdk-output',
  'xcrun-sdk-resolution',
  'compiler-resource-resolution',
  'toolchain-input-attestation',
  'prediagnostic-inputs',
  'compiler-diagnostic-child',
  'compiler-diagnostic-semantics',
  'linker-attestation',
  'diagnostic-postchecks',
  'compiler-diagnostic',
  'toolchain-authority',
  'derivation-lock-cycle-closed',
] as const

export type PolicyProvisionalAPrebuildBoundary =
  (typeof policyProvisionalAPrebuildBoundaries)[number]

type PolicyProvisionalAPrebuildDiagnostic = Readonly<{
  lastSuccessfulBoundary: PolicyProvisionalAPrebuildBoundary
  derivationLockCycleClosed?: true
  authorityPackageSha256?: string
  sdkProtectionStop?: PolicySdkProtectionStop
}>

type PolicySdkProtectionStop = (typeof policySdkProtectionStops)[number]

type Metadata = Readonly<{
  uid: number
  dev: number
  ino: number
  mode: number
  nlink: number
  size: number
  file: boolean
  directory: boolean
  symbolicLink: boolean
}>

type RunnerFilesystem = Readonly<{
  lstat: (path: string) => Promise<Metadata>
  readdir: (path: string) => Promise<readonly string[]>
  readFile: (path: string) => Promise<Buffer>
  realpath: (path: string) => Promise<string>
  mkdir: (path: string, options: { mode: number }) => Promise<void>
  writeFile: (
    path: string,
    contents: string,
    options: { flag: string; mode: number },
  ) => Promise<void>
  heldDirectory: (path: string) => Promise<{
    before: Metadata
    entries: readonly string[]
    after: Metadata
    pathAfter: Metadata
  }>
  withHeldDirectory: <T>(
    path: string,
    readEntries: boolean,
    postEntries:
      readonly string[] | (() => readonly string[] | undefined) | undefined,
    operation: (
      metadata: Metadata,
      entries: readonly string[] | undefined,
      revalidate: (expectedEntries?: readonly string[]) => Promise<void>,
    ) => Promise<T>,
  ) => Promise<T>
  withHeldFile: <T>(
    path: string,
    expectedSize: number | undefined,
    operation: (
      metadata: Metadata,
      bytes: Buffer,
      revalidate: () => Promise<void>,
    ) => Promise<T>,
  ) => Promise<T>
  withHeldMetadataFile: <T>(
    path: string,
    operation: (
      metadata: Metadata,
      revalidate: () => Promise<void>,
    ) => Promise<T>,
  ) => Promise<T>
  chmodHeldDirectory: (
    path: string,
    mode: number,
    expected: Metadata,
  ) => Promise<Metadata>
}>

type TrackedCommitments = Readonly<{
  commit: string
  runnerSha256: string
  sourceSha256: string
  launchContractSha256: string
  launcherSha256: string
  nativeAuthoritySha256: string
  lockPreflightWorkerSha256: string
  fdAdmissionProbeSourceSha256: string
}>

type HistoricalTrackedCommitments = Omit<
  TrackedCommitments,
  'fdAdmissionProbeSourceSha256'
>

const legacyResidue = Object.freeze({
  root: Object.freeze({
    uid: 501,
    dev: 16777231,
    ino: 9973053,
    mode: 0o700,
    nlink: 6,
    size: 192,
  }),
  lockOnlyRoot: Object.freeze({
    uid: 501,
    dev: 16777231,
    ino: 9973053,
    mode: 0o700,
    nlink: 7,
    size: 224,
  }),
  buildResidueRoot: Object.freeze({
    uid: 501,
    dev: 16777231,
    ino: 9973053,
    mode: 0o700,
    nlink: 8,
    size: 256,
  }),
  control: Object.freeze({
    uid: 501,
    dev: 16777231,
    ino: 13087256,
    mode: 0o700,
    nlink: 3,
    size: 96,
  }),
  baseline: Object.freeze({
    uid: 501,
    dev: 16777231,
    ino: 13087257,
    mode: 0o600,
    nlink: 1,
    size: 1634,
    sha256: 'b5eee8c0e7ba784b7dcaebb42d20ab252a81703ebdaa3188058b177548a34e7c',
  }),
  lock: Object.freeze({
    uid: 501,
    dev: 16777231,
    ino: 13221608,
    mode: 0o600,
    nlink: 1,
    size: 0,
  }),
  tracked: Object.freeze({
    commit: '0b5877f4560cb56749a585b60a337e909e9f3947',
    runnerSha256:
      '510a0c2bc8b3602cd2c4a4383ac9729b5097672ce869298ae8cf00bcde4cda22',
    sourceSha256:
      '6c30a868dc8599854aa9ed075de15dd9341f3700c2c0b9c1e0bd1b6958e6020d',
    launchContractSha256:
      '383d9c0ae2586860607961461db62098000127306e82d899d642e743c2a6b143',
    launcherSha256:
      '63506e24818967f2a015767a48e87a89253668a76bded43b95b97ec0d835f17a',
    nativeAuthoritySha256:
      '46d089cfb264f46951c4c0353b1edebf3f33ce0a400f9794fcf8c6e0baac7f41',
    lockPreflightWorkerSha256:
      '6477481e06242a4da4db2f2ce9e3b793f59f25c3db27a2eb3b4296043ffe1112',
  }),
})

export type PolicyNativeDerivationSeams = Readonly<{
  filesystem: RunnerFilesystem
  platform: string
  nodeVersion: string
  executablePath: string
  npmUserAgent: string
  effectiveUid: number
  cwd: string
  tracked: (repositoryRoot: string) => Promise<TrackedCommitments>
  revalidateTracked: (
    repositoryRoot: string,
    expected: TrackedCommitments,
  ) => Promise<TrackedCommitments>
  nonce: () => string
  deriveA: (input: {
    repositoryRoot: string
    rootNonceSha256: string
    sharedTerminal: unknown
    commandLock: unknown
  }) => Promise<unknown>
  deriveB: (input: {
    repositoryRoot: string
    rootNonceSha256: string
    cleanedStageAPackage: unknown
    sharedTerminal: unknown
  }) => Promise<Readonly<{ preflight: unknown; package: unknown }>>
  diagnoseA: (input: {
    repositoryRoot: string
    nativeAuthoritySha256: string
    commandLock: unknown
  }) => Promise<PolicyProvisionalAPrebuildDiagnostic>
  diagnoseAResidue: (input: {
    repositoryRoot: string
    nativeAuthoritySha256: string
    rootNonceSha256: string
    commandLock: unknown
  }) => Promise<Readonly<{ helperExitCode: number }>>
  recoverAFdMapScratch: (input: {
    repositoryRoot: string
    nativeAuthoritySha256: string
    rootNonceSha256: string
    commandLock: unknown
    scratchUid: number
    scratchDevice: number
    scratchInode: number
    scratchMode: number
    scratchLinks: number
    revalidateOuter: () => Promise<void>
  }) => Promise<Readonly<{ scratchRecovered: true }>>
}>

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`
  return JSON.stringify(value)
}

function mode(metadata: Metadata): number {
  return metadata.mode & 0o7777
}

function exactEntries(
  observed: readonly string[],
  expected: readonly string[],
): boolean {
  return canonical([...observed].sort()) === canonical([...expected].sort())
}

function parseArguments(argv: readonly string[]): PolicyNativeDerivationMode {
  if (argv.length === 1 && argv[0] === 'check') return 'check'
  if (argv.length !== 2) throw new Error('arguments')
  const [operation, literal] = argv
  if (operation === 'recover-preflight' && literal === recoveryConfirmation)
    return operation
  if (
    (operation === 'preflight' ||
      operation === 'derive-a' ||
      operation === 'derive-b') &&
    literal === confirmation
  )
    return operation
  if (
    operation === 'recover-a-fd-map-scratch' &&
    literal === fdMapScratchRecoveryConfirmation
  )
    return operation
  if (operation === 'diagnose-a' && literal === diagnosticConfirmation)
    return operation
  if (
    operation === 'diagnose-a-residue' &&
    literal === residueDiagnosticConfirmation
  )
    return operation
  if (operation === 'review-candidate' && literal === reviewConfirmation)
    return operation
  throw new Error('arguments')
}

function publicCommitments(
  tracked: TrackedCommitments,
): Readonly<Record<string, string>> {
  return Object.freeze({
    commit: tracked.commit,
    runnerSha256: tracked.runnerSha256,
    sourceSha256: tracked.sourceSha256,
    launchContractSha256: tracked.launchContractSha256,
    launcherSha256: tracked.launcherSha256,
    nativeAuthoritySha256: tracked.nativeAuthoritySha256,
    lockPreflightWorkerSha256: tracked.lockPreflightWorkerSha256,
    fdAdmissionProbeSourceSha256: tracked.fdAdmissionProbeSourceSha256,
  })
}

function assertMetadata(
  metadata: Metadata,
  kind: 'file' | 'directory',
  owner: number,
  requiredMode: number,
  device?: number,
): void {
  if (
    metadata.symbolicLink ||
    metadata.uid !== owner ||
    mode(metadata) !== requiredMode ||
    metadata.nlink < 1 ||
    metadata.size < 0 ||
    (kind === 'file' ? !metadata.file : !metadata.directory) ||
    (device !== undefined && metadata.dev !== device)
  )
    throw new Error('metadata')
}

function parseSelfHashedArtifact(
  bytes: Buffer,
  expectedSchema: string,
): Record<string, unknown> {
  const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  if (!decoded.endsWith('\n') || decoded.slice(0, -1).includes('\n'))
    throw new Error('artifact')
  const value: unknown = JSON.parse(decoded)
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('artifact')
  const record = value as Record<string, unknown>
  const artifactSha256 = record.artifactSha256
  if (
    record.schema !== expectedSchema ||
    typeof artifactSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(artifactSha256)
  )
    throw new Error('artifact')
  const core = { ...record }
  delete core.artifactSha256
  if (sha256(canonical(core)) !== artifactSha256) throw new Error('artifact')
  return record
}

function createArtifact(schema: string, core: Record<string, unknown>): string {
  const value = {
    schema,
    version: 1,
    ...core,
  }
  return `${canonical({ ...value, artifactSha256: sha256(canonical(value)) })}\n`
}

const syntheticTracked = Object.freeze({
  commit: 'c'.repeat(40),
  runnerSha256: '1'.repeat(64),
  sourceSha256: '2'.repeat(64),
  launchContractSha256: '3'.repeat(64),
  launcherSha256: '4'.repeat(64),
  nativeAuthoritySha256: '5'.repeat(64),
  lockPreflightWorkerSha256: '6'.repeat(64),
  fdAdmissionProbeSourceSha256: '7'.repeat(64),
})
const syntheticHistoricalTracked = Object.freeze({
  commit: syntheticTracked.commit,
  runnerSha256: syntheticTracked.runnerSha256,
  sourceSha256: syntheticTracked.sourceSha256,
  launchContractSha256: syntheticTracked.launchContractSha256,
  launcherSha256: syntheticTracked.launcherSha256,
  nativeAuthoritySha256: syntheticTracked.nativeAuthoritySha256,
  lockPreflightWorkerSha256: syntheticTracked.lockPreflightWorkerSha256,
})

function createPolicySyntheticLegacyResidue() {
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
    createArtifact(`m45-policy-native-${baselineName}.v1`, {
      sharedRootOriginal: { ...root, mode: 0o755, nlink: 5 },
      sharedRootSecured: root,
      preservedSiblings: siblings,
      controlRoot: controlCreated,
      tracked: syntheticHistoricalTracked,
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
  return Object.freeze({
    root,
    lockOnlyRoot,
    buildResidueRoot,
    control: Object.freeze(control),
    siblings,
    baseline,
    lock,
    baselineBytes: Buffer.from(bytes),
    tracked: syntheticHistoricalTracked,
  })
}

async function absent(
  filesystem: RunnerFilesystem,
  path: string,
): Promise<void> {
  try {
    await filesystem.lstat(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  throw new Error('residue')
}

async function heldArtifact(
  filesystem: RunnerFilesystem,
  path: string,
  schema: string,
  rootDevice: number,
  owner: number,
): Promise<Record<string, unknown>> {
  return withHeldArtifact(
    filesystem,
    path,
    schema,
    rootDevice,
    owner,
    async (artifact) => artifact,
  )
}

async function withHeldArtifact<T>(
  filesystem: RunnerFilesystem,
  path: string,
  schema: string,
  rootDevice: number,
  owner: number,
  operation: (
    artifact: Record<string, unknown>,
    revalidate: () => Promise<void>,
  ) => Promise<T>,
): Promise<T> {
  return filesystem.withHeldFile(
    path,
    undefined,
    async (metadata, bytes, revalidate) => {
      assertMetadata(metadata, 'file', owner, 0o600, rootDevice)
      if (
        metadata.nlink !== 1 ||
        metadata.size === 0 ||
        bytes.byteLength !== metadata.size
      )
        throw new Error('artifact')
      return operation(parseSelfHashedArtifact(bytes, schema), revalidate)
    },
  )
}

async function validateControl(
  filesystem: RunnerFilesystem,
  controlRoot: string,
  rootDevice: number,
  owner: number,
  entries: readonly string[],
): Promise<void> {
  const held = await filesystem.heldDirectory(controlRoot)
  if (
    canonical(held.before) !== canonical(held.after) ||
    canonical(held.before) !== canonical(held.pathAfter)
  )
    throw new Error('control')
  const metadata = held.before
  assertMetadata(metadata, 'directory', owner, 0o700, rootDevice)
  if (metadata.nlink !== 2 + entries.length) throw new Error('control')
  if (!exactEntries(held.entries, entries)) throw new Error('control')
}

async function writeArtifact(
  filesystem: RunnerFilesystem,
  controlRoot: string,
  filename: string,
  content: string,
  rootDevice: number,
  owner: number,
): Promise<Record<string, unknown>> {
  const path = join(controlRoot, filename)
  await absent(filesystem, path)
  await filesystem.writeFile(path, content, { flag: 'wx', mode: 0o600 })
  return heldArtifact(
    filesystem,
    path,
    `m45-policy-native-${filename}.v1`,
    rootDevice,
    owner,
  )
}

async function currentSharedRoot(
  filesystem: RunnerFilesystem,
  root: string,
  owner: number,
  requiredMode: number,
  controlPresent = false,
): Promise<
  Readonly<{ root: Metadata; siblings: Readonly<Record<string, Metadata>> }>
> {
  const held = await filesystem.heldDirectory(root)
  if (
    canonical(held.before) !== canonical(held.after) ||
    canonical(held.before) !== canonical(held.pathAfter)
  )
    throw new Error('shared-root')
  const metadata = held.before
  assertMetadata(metadata, 'directory', owner, requiredMode)
  const expectedEntries = controlPresent
    ? [...preservedSiblings, controlName]
    : preservedSiblings
  if (
    metadata.nlink !== 2 + expectedEntries.length ||
    !exactEntries(held.entries, expectedEntries)
  )
    throw new Error('shared-root')
  const siblings: Record<string, Metadata> = {}
  for (const name of preservedSiblings) {
    const sibling = await filesystem.lstat(join(root, name))
    if (
      sibling.symbolicLink ||
      sibling.uid !== owner ||
      !sibling.directory ||
      sibling.dev !== metadata.dev ||
      sibling.nlink < 2
    )
      throw new Error('sibling-metadata')
    siblings[name] = sibling
  }
  return { root: metadata, siblings: Object.freeze(siblings) }
}

function assertSameSiblings(
  baseline: Record<string, unknown>,
  siblings: Readonly<Record<string, Metadata>>,
): void {
  if (canonical(baseline.preservedSiblings) !== canonical(siblings))
    throw new Error('sibling-drift')
}

function exactRecordKeys(value: unknown, keys: readonly string[]): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('legacy-baseline')
  if (!exactEntries(Object.keys(value as Record<string, unknown>), keys))
    throw new Error('legacy-baseline')
}

function parseASeamResult(
  input: unknown,
  expectedNativeAuthoritySha256: string,
): ReturnType<typeof parsePolicyPromotionPackage> {
  const packageResult = parsePolicyPromotionPackage(input)
  if (
    packageResult.stage !== 'A' ||
    packageResult.material.nativeAuthoritySha256 !==
      expectedNativeAuthoritySha256
  )
    throw new Error('a-seam-outcome')
  return packageResult
}

function assertLegacyMetadata(
  metadata: Metadata,
  expected: Readonly<{
    uid: number
    dev: number
    ino: number
    mode: number
    nlink: number
    size: number
  }>,
  kind: 'file' | 'directory',
): void {
  assertMetadata(metadata, kind, expected.uid, expected.mode, expected.dev)
  if (
    metadata.ino !== expected.ino ||
    metadata.nlink !== expected.nlink ||
    metadata.size !== expected.size
  )
    throw new Error('legacy-baseline')
}

function assertStableDirectoryIdentity(
  value: unknown,
  observed: Metadata,
): void {
  exactRecordKeys(value, [
    'uid',
    'dev',
    'ino',
    'mode',
    'nlink',
    'size',
    'file',
    'directory',
    'symbolicLink',
  ])
  const sealed = value as Record<string, unknown>
  if (
    sealed.uid !== observed.uid ||
    sealed.dev !== observed.dev ||
    sealed.ino !== observed.ino ||
    sealed.mode !== observed.mode ||
    sealed.file !== false ||
    sealed.directory !== true ||
    sealed.symbolicLink !== false
  )
    throw new Error('legacy-baseline')
}

type LegacyBaseline = Readonly<{
  artifact: Record<string, unknown>
  rawSha256: string
}>

type ResidueProfile = Readonly<{
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
  tracked: HistoricalTrackedCommitments
}>

type LegacyCustody = Readonly<{
  root: Metadata
  control: Metadata
  siblings: Readonly<Record<string, Metadata>>
  baseline: LegacyBaseline
  commandLock?: Metadata
  revalidate: (
    controlEntries: readonly string[],
    rootEntries: readonly string[],
  ) => Promise<void>
  setPostControlEntries: (entries: readonly string[]) => void
}>

const baseRootEntries = Object.freeze([...preservedSiblings, controlName])
const lockedRootEntries = Object.freeze([...baseRootEntries, commandLockName])
const buildResidueRootEntries = Object.freeze([
  ...lockedRootEntries,
  buildRootName,
])

async function withHeldCommandLock<T>(
  filesystem: RunnerFilesystem,
  m45: string,
  root: Metadata,
  owner: number,
  operation: (lock: Metadata, revalidate: () => Promise<void>) => Promise<T>,
): Promise<T> {
  return filesystem.withHeldMetadataFile(
    join(m45, commandLockName),
    async (lock, revalidate) => {
      assertMetadata(lock, 'file', owner, 0o600, root.dev)
      if (lock.nlink !== 1 || lock.size !== 0) throw new Error('command-lock')
      return operation(lock, revalidate)
    },
  )
}

function parseLegacyBaseline(
  metadata: Metadata,
  bytes: Buffer,
  profile: ResidueProfile,
): LegacyBaseline {
  assertLegacyMetadata(metadata, profile.baseline, 'file')
  if (bytes.byteLength !== profile.baseline.size)
    throw new Error('legacy-baseline')
  const rawSha256 = sha256(bytes)
  if (rawSha256 !== profile.baseline.sha256) throw new Error('legacy-baseline')
  const artifact = parseSelfHashedArtifact(
    bytes,
    `m45-policy-native-${baselineName}.v1`,
  )
  exactRecordKeys(artifact, [
    'schema',
    'version',
    'sharedRootOriginal',
    'sharedRootSecured',
    'preservedSiblings',
    'controlRoot',
    'tracked',
    'artifactSha256',
  ])
  if (canonical(artifact.tracked) !== canonical(profile.tracked))
    throw new Error('legacy-baseline')
  return Object.freeze({ artifact, rawSha256 })
}

async function withLegacyCustody<T>(
  filesystem: RunnerFilesystem,
  m45: string,
  controlRoot: string,
  profile: ResidueProfile,
  exactRoot: ResidueProfile['root'],
  owner: number,
  expectedRootEntries: readonly string[],
  postRootEntries: readonly string[],
  controlEntries: readonly string[],
  postControlEntries: readonly string[] | undefined,
  holdCommandLock: boolean,
  exactResidue: boolean,
  operation: (custody: LegacyCustody) => Promise<T>,
): Promise<T> {
  let finalControlEntries = postControlEntries
  return filesystem.withHeldDirectory(
    m45,
    true,
    postRootEntries,
    async (root, observedRootEntries, revalidateRoot) => {
      assertMetadata(root, 'directory', owner, 0o700, profile.root.dev)
      if (
        root.uid !== profile.root.uid ||
        root.ino !== profile.root.ino ||
        root.nlink !== 2 + expectedRootEntries.length ||
        !exactEntries(observedRootEntries ?? [], expectedRootEntries) ||
        (exactResidue &&
          (root.nlink !== exactRoot.nlink || root.size !== exactRoot.size))
      )
        throw new Error('legacy-baseline')
      return filesystem.withHeldDirectory(
        controlRoot,
        true,
        () => finalControlEntries,
        async (control, observedControlEntries, revalidateControl) => {
          assertMetadata(control, 'directory', owner, 0o700, root.dev)
          if (
            control.ino !== profile.control.ino ||
            control.nlink !== 2 + controlEntries.length ||
            !exactEntries(observedControlEntries ?? [], controlEntries) ||
            (exactResidue &&
              (control.nlink !== profile.control.nlink ||
                control.size !== profile.control.size))
          )
            throw new Error('legacy-baseline')
          return filesystem.withHeldFile(
            join(controlRoot, baselineName),
            profile.baseline.size,
            async (baselineMetadata, bytes, revalidateBaseline) => {
              const baseline = parseLegacyBaseline(
                baselineMetadata,
                bytes,
                profile,
              )
              assertStableDirectoryIdentity(
                baseline.artifact.sharedRootSecured,
                root,
              )
              assertStableDirectoryIdentity(
                baseline.artifact.controlRoot,
                control,
              )
              const sealedSiblings = baseline.artifact.preservedSiblings
              exactRecordKeys(sealedSiblings, preservedSiblings)
              const siblings: Record<string, Metadata> = {}
              const siblingRevalidators: Array<() => Promise<void>> = []
              const holdSibling = async (index: number): Promise<T> => {
                if (index === preservedSiblings.length) {
                  assertSameSiblings(baseline.artifact, siblings)
                  const invokeOperation = (
                    commandLock?: Metadata,
                    revalidateLock?: () => Promise<void>,
                  ) =>
                    operation({
                      root,
                      control,
                      siblings: Object.freeze({ ...siblings }),
                      baseline,
                      commandLock,
                      revalidate: async (
                        expectedControlEntries,
                        revalidatedRootEntries,
                      ) => {
                        await revalidateRoot(revalidatedRootEntries)
                        await revalidateControl(expectedControlEntries)
                        await revalidateBaseline()
                        for (const revalidateSibling of siblingRevalidators)
                          await revalidateSibling()
                        await revalidateLock?.()
                      },
                      setPostControlEntries: (entries) => {
                        finalControlEntries = entries
                      },
                    })
                  return holdCommandLock
                    ? withHeldCommandLock(
                        filesystem,
                        m45,
                        root,
                        owner,
                        (commandLock, revalidateLock) => {
                          assertLegacyMetadata(
                            commandLock,
                            profile.lock,
                            'file',
                          )
                          return invokeOperation(commandLock, revalidateLock)
                        },
                      )
                    : invokeOperation()
                }
                const name = preservedSiblings[index]!
                return filesystem.withHeldDirectory(
                  join(m45, name),
                  false,
                  undefined,
                  async (sibling, entries, revalidateSibling) => {
                    if (entries !== undefined)
                      throw new Error('sibling-contents')
                    assertMetadata(
                      sibling,
                      'directory',
                      root.uid,
                      mode(sibling),
                      root.dev,
                    )
                    if (
                      canonical(sibling) !==
                      canonical(
                        (sealedSiblings as Record<string, unknown>)[name],
                      )
                    )
                      throw new Error('sibling-drift')
                    siblings[name] = sibling
                    siblingRevalidators.push(revalidateSibling)
                    return holdSibling(index + 1)
                  },
                )
              }
              return holdSibling(0)
            },
          )
        },
      )
    },
  )
}

function assertLegacyBinding(
  artifact: Record<string, unknown>,
  baseline: LegacyBaseline,
): void {
  if (artifact.legacyBaselineRawSha256 !== baseline.rawSha256)
    throw new Error('legacy-baseline')
}

function terminalEvidence(
  metadata: Metadata,
): Readonly<Record<string, string>> {
  return Object.freeze({
    uid: String(metadata.uid),
    device: String(metadata.dev),
    inode: String(metadata.ino),
    links: String(metadata.nlink),
    mode: String(mode(metadata)),
    size: metadata.directory ? 'na' : String(metadata.size),
  })
}

function defaultFilesystem(): RunnerFilesystem {
  const runnerHeldOpenFlags = (base: number): number => {
    const exposedCloseOnExec = (
      fsConstants as typeof fsConstants & { O_CLOEXEC?: number }
    ).O_CLOEXEC
    if (
      process.platform !== 'darwin' ||
      fsConstants.O_NOFOLLOW !== darwinNoFollow ||
      (exposedCloseOnExec !== undefined &&
        exposedCloseOnExec !== darwinCloseOnExec)
    )
      throw new Error('policy-native-file-flags')
    return base | darwinNoFollow | darwinCloseOnExec
  }
  const metadata = async (path: string): Promise<Metadata> => {
    const value = await lstat(path)
    return {
      uid: value.uid,
      dev: value.dev,
      ino: value.ino,
      mode: value.mode,
      nlink: value.nlink,
      size: value.size,
      file: value.isFile(),
      directory: value.isDirectory(),
      symbolicLink: value.isSymbolicLink(),
    }
  }
  return {
    lstat: metadata,
    readdir,
    readFile,
    realpath,
    mkdir,
    writeFile,
    heldDirectory: async (path) => {
      const handle = await open(
        path,
        runnerHeldOpenFlags(fsConstants.O_RDONLY | fsConstants.O_DIRECTORY),
      )
      try {
        const toMetadata = (
          value: Awaited<ReturnType<typeof handle.stat>>,
        ): Metadata => ({
          uid: Number(value.uid),
          dev: Number(value.dev),
          ino: Number(value.ino),
          mode: Number(value.mode),
          nlink: Number(value.nlink),
          size: Number(value.size),
          file: value.isFile(),
          directory: value.isDirectory(),
          symbolicLink: value.isSymbolicLink(),
        })
        const before = toMetadata(await handle.stat())
        const entries = await readdir(path)
        const after = toMetadata(await handle.stat())
        return { before, entries, after, pathAfter: await metadata(path) }
      } finally {
        await handle.close()
      }
    },
    withHeldDirectory: async (path, readEntries, postEntries, operation) => {
      const handle = await open(
        path,
        runnerHeldOpenFlags(fsConstants.O_RDONLY | fsConstants.O_DIRECTORY),
      )
      try {
        const toMetadata = (
          value: Awaited<ReturnType<typeof handle.stat>>,
        ): Metadata => ({
          uid: Number(value.uid),
          dev: Number(value.dev),
          ino: Number(value.ino),
          mode: Number(value.mode),
          nlink: Number(value.nlink),
          size: Number(value.size),
          file: value.isFile(),
          directory: value.isDirectory(),
          symbolicLink: value.isSymbolicLink(),
        })
        const before = toMetadata(await handle.stat())
        const entries = readEntries ? await readdir(path) : undefined
        const revalidate = async (
          expectedEntries = (typeof postEntries === 'function'
            ? postEntries()
            : postEntries) ??
            entries ??
            [],
        ) => {
          const after = toMetadata(await handle.stat())
          const pathAfter = await metadata(path)
          const afterEntries = readEntries ? await readdir(path) : undefined
          if (
            before.uid !== after.uid ||
            before.dev !== after.dev ||
            before.ino !== after.ino ||
            before.mode !== after.mode ||
            before.file !== after.file ||
            before.directory !== after.directory ||
            before.symbolicLink !== after.symbolicLink ||
            canonical(after) !== canonical(pathAfter) ||
            (!readEntries && canonical(before) !== canonical(after)) ||
            (readEntries &&
              (!exactEntries(expectedEntries, afterEntries ?? []) ||
                after.nlink !== 2 + expectedEntries.length))
          )
            throw new Error('held-directory-drift')
        }
        const result = await operation(before, entries, revalidate)
        await revalidate()
        return result
      } finally {
        await handle.close()
      }
    },
    withHeldFile: async (path, expectedSize, operation) => {
      const handle = await open(path, runnerHeldOpenFlags(fsConstants.O_RDONLY))
      try {
        const toMetadata = (
          value: Awaited<ReturnType<typeof handle.stat>>,
        ): Metadata => ({
          uid: Number(value.uid),
          dev: Number(value.dev),
          ino: Number(value.ino),
          mode: Number(value.mode),
          nlink: Number(value.nlink),
          size: Number(value.size),
          file: value.isFile(),
          directory: value.isDirectory(),
          symbolicLink: value.isSymbolicLink(),
        })
        const before = toMetadata(await handle.stat())
        if (
          !Number.isSafeInteger(before.size) ||
          before.size <= 0 ||
          before.size > maxHeldArtifactBytes ||
          (expectedSize !== undefined && before.size !== expectedSize)
        )
          throw new Error('held-file-size')
        const readHeldBytes = async (size: number) => {
          const bytes = Buffer.alloc(size)
          const read = await handle.read(bytes, 0, size, 0)
          const trailing = await handle.read(Buffer.alloc(1), 0, 1, size)
          if (read.bytesRead !== size || trailing.bytesRead !== 0)
            throw new Error('held-file-read')
          return bytes
        }
        const bytes = await readHeldBytes(before.size)
        const revalidate = async () => {
          const after = toMetadata(await handle.stat())
          const pathAfter = await metadata(path)
          if (canonical(before) !== canonical(after))
            throw new Error('held-file-drift')
          const afterBytes = await readHeldBytes(before.size)
          if (
            !bytes.equals(afterBytes) ||
            canonical(before) !== canonical(pathAfter)
          )
            throw new Error('held-file-drift')
        }
        const result = await operation(before, bytes, revalidate)
        await revalidate()
        return result
      } finally {
        await handle.close()
      }
    },
    withHeldMetadataFile: async (path, operation) => {
      const handle = await open(path, runnerHeldOpenFlags(fsConstants.O_RDONLY))
      try {
        const toMetadata = (
          value: Awaited<ReturnType<typeof handle.stat>>,
        ): Metadata => ({
          uid: Number(value.uid),
          dev: Number(value.dev),
          ino: Number(value.ino),
          mode: Number(value.mode),
          nlink: Number(value.nlink),
          size: Number(value.size),
          file: value.isFile(),
          directory: value.isDirectory(),
          symbolicLink: value.isSymbolicLink(),
        })
        const before = toMetadata(await handle.stat())
        const revalidate = async () => {
          const after = toMetadata(await handle.stat())
          const pathAfter = await metadata(path)
          if (
            canonical(before) !== canonical(after) ||
            canonical(before) !== canonical(pathAfter)
          )
            throw new Error('held-file-drift')
        }
        const result = await operation(before, revalidate)
        await revalidate()
        return result
      } finally {
        await handle.close()
      }
    },
    chmodHeldDirectory: async (path, requiredMode, expected) => {
      const handle = await open(
        path,
        runnerHeldOpenFlags(fsConstants.O_RDONLY | fsConstants.O_DIRECTORY),
      )
      try {
        const before = await handle.stat()
        const beforeMetadata: Metadata = {
          uid: Number(before.uid),
          dev: Number(before.dev),
          ino: Number(before.ino),
          mode: Number(before.mode),
          nlink: Number(before.nlink),
          size: Number(before.size),
          file: before.isFile(),
          directory: before.isDirectory(),
          symbolicLink: before.isSymbolicLink(),
        }
        if (canonical(beforeMetadata) !== canonical(expected))
          throw new Error('root-substitution')
        await handle.chmod(requiredMode)
        const value = await handle.stat()
        return {
          uid: Number(value.uid),
          dev: Number(value.dev),
          ino: Number(value.ino),
          mode: Number(value.mode),
          nlink: Number(value.nlink),
          size: Number(value.size),
          file: value.isFile(),
          directory: value.isDirectory(),
          symbolicLink: value.isSymbolicLink(),
        }
      } finally {
        await handle.close()
      }
    },
  }
}

async function git(args: readonly string[], cwd: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      '/usr/bin/git',
      [...args],
      { cwd, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (error || stderr !== '') return reject(new Error('tracked'))
        resolvePromise(stdout)
      },
    )
  })
}

async function defaultTracked(
  repositoryRoot: string,
): Promise<TrackedCommitments> {
  const status = await git(
    ['status', '--porcelain=v1', '--untracked-files=all'],
    repositoryRoot,
  )
  if (status !== '') throw new Error('tracked')
  const commit = (await git(['rev-parse', 'HEAD'], repositoryRoot)).trim()
  if (!/^[a-f0-9]{40}$/u.test(commit)) throw new Error('tracked')
  const [source, launches, worker, runner, probeSource] = await Promise.all([
    inspectPolicyExclusivePromotionSource(),
    inspectPolicyNativeLaunchSources(),
    inspectPolicyLockPreflightWorker(),
    readFile(fileURLToPath(import.meta.url)),
    readFile(
      join(
        repositoryRoot,
        'scripts/policy-baseline-review/fd-admission-probe.c',
      ),
    ),
  ])
  return {
    commit,
    runnerSha256: sha256(runner),
    sourceSha256: source.sha256,
    launchContractSha256: launches.launchContractSha256,
    launcherSha256: launches.launcherSha256,
    nativeAuthoritySha256: launches.nativeAuthoritySha256,
    lockPreflightWorkerSha256: worker.sha256,
    fdAdmissionProbeSourceSha256: sha256(probeSource),
  }
}

async function defaultRevalidateTracked(
  _repositoryRoot: string,
  expected: TrackedCommitments,
): Promise<TrackedCommitments> {
  // The pre-seam clean-HEAD gate owns commit identity. Failure classification
  // launches no child and grants no authority, so it rehashes only the
  // security-critical source graph while retaining that already-gated commit.
  const [source, launches, worker, runner, probeSource] = await Promise.all([
    inspectPolicyExclusivePromotionSource(),
    inspectPolicyNativeLaunchSources(),
    inspectPolicyLockPreflightWorker(),
    readFile(fileURLToPath(import.meta.url)),
    readFile(
      join(
        _repositoryRoot,
        'scripts/policy-baseline-review/fd-admission-probe.c',
      ),
    ),
  ])
  return {
    commit: expected.commit,
    runnerSha256: sha256(runner),
    sourceSha256: source.sha256,
    launchContractSha256: launches.launchContractSha256,
    launcherSha256: launches.launcherSha256,
    nativeAuthoritySha256: launches.nativeAuthoritySha256,
    lockPreflightWorkerSha256: worker.sha256,
    fdAdmissionProbeSourceSha256: sha256(probeSource),
  }
}

function defaultSeams(): PolicyNativeDerivationSeams {
  return {
    filesystem: defaultFilesystem(),
    platform: process.platform,
    nodeVersion: process.versions.node,
    executablePath: process.execPath,
    npmUserAgent: process.env.npm_config_user_agent ?? '',
    effectiveUid: process.geteuid?.() ?? -1,
    cwd: process.cwd(),
    tracked: defaultTracked,
    revalidateTracked: defaultRevalidateTracked,
    nonce: () => sha256(randomBytes(32)),
    deriveA: derivePolicyProvisionalBuildA,
    deriveB: derivePolicyProvisionalBuildB,
    diagnoseA: diagnosePolicyProvisionalBuildAPrebuild,
    diagnoseAResidue: diagnosePolicyProvisionalABuildResidue,
    recoverAFdMapScratch: recoverPolicyProvisionalAFdMapScratch,
  }
}

function assertHost(
  seams: PolicyNativeDerivationSeams,
  repositoryRoot: string,
): void {
  if (
    seams.platform !== 'darwin' ||
    seams.nodeVersion !== '24.18.1' ||
    seams.executablePath !== policyNode ||
    !/^npm\/11\.18\.0 node\/v24\.18\.1 /u.test(seams.npmUserAgent) ||
    seams.effectiveUid < 0 ||
    resolve(seams.cwd) !== repositoryRoot ||
    seams.cwd !== repositoryRoot
  )
    throw new Error('host')
}

type AEntry = 'fresh-base' | 'lock-only-reentry'

async function selectAEntry(
  filesystem: RunnerFilesystem,
  m45: string,
): Promise<AEntry> {
  const held = await filesystem.heldDirectory(m45)
  if (
    canonical(held.before) !== canonical(held.after) ||
    canonical(held.before) !== canonical(held.pathAfter)
  )
    throw new Error('a-entry')
  if (exactEntries(held.entries, baseRootEntries)) return 'fresh-base'
  if (exactEntries(held.entries, lockedRootEntries)) return 'lock-only-reentry'
  throw new Error('a-entry')
}

async function assertTrackedUnchanged(
  seams: PolicyNativeDerivationSeams,
  repositoryRoot: string,
  expected: TrackedCommitments,
): Promise<void> {
  if (
    canonical(await seams.revalidateTracked(repositoryRoot, expected)) !==
    canonical(expected)
  )
    throw new Error('tracked-drift')
}

function parseProvisionalAPrebuildDiagnostic(
  value: unknown,
): PolicyProvisionalAPrebuildDiagnostic {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('diagnostic')
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  const allowed = [
    'authorityPackageSha256',
    'derivationLockCycleClosed',
    'lastSuccessfulBoundary',
    'sdkProtectionStop',
  ].sort()
  if (
    !keys.includes('lastSuccessfulBoundary') ||
    !keys.every((key) => allowed.includes(key)) ||
    typeof record.lastSuccessfulBoundary !== 'string' ||
    !policyProvisionalAPrebuildBoundaries.includes(
      record.lastSuccessfulBoundary as PolicyProvisionalAPrebuildBoundary,
    )
  )
    throw new Error('diagnostic')
  if (
    record.derivationLockCycleClosed !== undefined &&
    record.derivationLockCycleClosed !== true
  )
    throw new Error('diagnostic')
  if (
    record.authorityPackageSha256 !== undefined &&
    (typeof record.authorityPackageSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(record.authorityPackageSha256))
  )
    throw new Error('diagnostic')
  if (
    record.sdkProtectionStop !== undefined &&
    (typeof record.sdkProtectionStop !== 'string' ||
      !policySdkProtectionStops.includes(
        record.sdkProtectionStop as PolicySdkProtectionStop,
      ))
  )
    throw new Error('diagnostic')
  const complete =
    record.lastSuccessfulBoundary === 'derivation-lock-cycle-closed'
  const lockOpened =
    policyProvisionalAPrebuildBoundaries.indexOf(
      record.lastSuccessfulBoundary as PolicyProvisionalAPrebuildBoundary,
    ) >= policyProvisionalAPrebuildBoundaries.indexOf('derivation-lock-open')
  if (
    complete !== (record.authorityPackageSha256 !== undefined) ||
    !lockOpened ||
    record.derivationLockCycleClosed !== true ||
    (record.sdkProtectionStop !== undefined &&
      (complete ||
        record.lastSuccessfulBoundary !== 'xcrun-sdk-output' ||
        record.authorityPackageSha256 !== undefined))
  )
    throw new Error('diagnostic')
  return Object.freeze({
    lastSuccessfulBoundary:
      record.lastSuccessfulBoundary as PolicyProvisionalAPrebuildBoundary,
    ...(record.derivationLockCycleClosed === true
      ? { derivationLockCycleClosed: true as const }
      : {}),
    ...(record.authorityPackageSha256 === undefined
      ? {}
      : { authorityPackageSha256: record.authorityPackageSha256 }),
    ...(record.sdkProtectionStop === undefined
      ? {}
      : {
          sdkProtectionStop:
            record.sdkProtectionStop as PolicySdkProtectionStop,
        }),
  })
}

async function runPolicyNativeDerivationCommandWithProfile(
  argv: readonly string[],
  overrides: Partial<PolicyNativeDerivationSeams>,
  profile: ResidueProfile,
): Promise<PolicyNativeDerivationResult> {
  const seams = { ...defaultSeams(), ...overrides }
  const mode = parseArguments(argv)
  const repositoryRoot = await seams.filesystem.realpath(seams.cwd)
  if (
    repositoryRoot !== seams.cwd ||
    resolve(repositoryRoot) !== repositoryRoot
  )
    throw new Error('root')
  assertHost(seams, repositoryRoot)
  const repositoryMetadata = await seams.filesystem.lstat(repositoryRoot)
  if (
    repositoryMetadata.symbolicLink ||
    !repositoryMetadata.directory ||
    repositoryMetadata.uid !== seams.effectiveUid ||
    repositoryMetadata.nlink < 2
  )
    throw new Error('root')
  const tracked = await seams.tracked(repositoryRoot)
  const commitments = publicCommitments(tracked)
  if (mode === 'check') return { mode, status: 'checked', commitments }

  const m45 = join(repositoryRoot, '.local/m45')
  const controlRoot = join(m45, controlName)
  if (mode === 'preflight') {
    const shared = await currentSharedRoot(
      seams.filesystem,
      m45,
      seams.effectiveUid,
      0o755,
    )
    const secured = await seams.filesystem.chmodHeldDirectory(
      m45,
      0o700,
      shared.root,
    )
    assertMetadata(secured, 'directory', seams.effectiveUid, 0o700)
    if (secured.dev !== shared.root.dev || secured.ino !== shared.root.ino)
      throw new Error('root')
    const securedPath = await seams.filesystem.lstat(m45)
    if (canonical(securedPath) !== canonical(secured)) throw new Error('root')
    await absent(seams.filesystem, controlRoot)
    await seams.filesystem.mkdir(controlRoot, { mode: 0o700 })
    await validateControl(
      seams.filesystem,
      controlRoot,
      secured.dev,
      seams.effectiveUid,
      [],
    )
    const baseline = await writeArtifact(
      seams.filesystem,
      controlRoot,
      baselineName,
      createArtifact(`m45-policy-native-${baselineName}.v1`, {
        sharedRootOriginal: shared.root,
        sharedRootSecured: secured,
        preservedSiblings: shared.siblings,
        controlRoot: await seams.filesystem.lstat(controlRoot),
        tracked: commitments,
      }),
      secured.dev,
      seams.effectiveUid,
    )
    if (baseline.schema === undefined) throw new Error('baseline')
    await validateControl(
      seams.filesystem,
      controlRoot,
      secured.dev,
      seams.effectiveUid,
      [baselineName],
    )
    return { mode, status: 'preflight-ready', commitments }
  }

  if (mode === 'recover-preflight') {
    return withLegacyCustody(
      seams.filesystem,
      m45,
      controlRoot,
      profile,
      profile.root,
      seams.effectiveUid,
      baseRootEntries,
      baseRootEntries,
      [baselineName],
      undefined,
      false,
      true,
      async (recovered) => ({
        mode,
        status: 'preflight-recovered',
        commitments: {
          ...commitments,
          immutableBaselineRawSha256: recovered.baseline.rawSha256,
        },
      }),
    )
  }

  if (mode === 'diagnose-a') {
    return withLegacyCustody(
      seams.filesystem,
      m45,
      controlRoot,
      profile,
      profile.lockOnlyRoot,
      seams.effectiveUid,
      lockedRootEntries,
      lockedRootEntries,
      [baselineName],
      [baselineName],
      true,
      true,
      async (recovered) => {
        await assertTrackedUnchanged(seams, repositoryRoot, tracked)
        await recovered.revalidate([baselineName], lockedRootEntries)
        const diagnostic = parseProvisionalAPrebuildDiagnostic(
          await seams.diagnoseA({
            repositoryRoot,
            nativeAuthoritySha256: tracked.nativeAuthoritySha256,
            commandLock: terminalEvidence(recovered.commandLock!),
          }),
        )
        await assertTrackedUnchanged(seams, repositoryRoot, tracked)
        await recovered.revalidate([baselineName], lockedRootEntries)
        return {
          mode,
          status:
            diagnostic.authorityPackageSha256 === undefined
              ? ('diagnostic-stopped' as const)
              : ('diagnostic-complete' as const),
          lastSuccessfulBoundary: diagnostic.lastSuccessfulBoundary,
          ...(diagnostic.derivationLockCycleClosed === true
            ? { derivationLockCycleClosed: true as const }
            : {}),
          ...(diagnostic.sdkProtectionStop === undefined
            ? {}
            : { sdkProtectionStop: diagnostic.sdkProtectionStop }),
          commitments: {
            ...commitments,
            ...(diagnostic.authorityPackageSha256 === undefined
              ? {}
              : {
                  toolchainAuthorityPackageSha256:
                    diagnostic.authorityPackageSha256,
                }),
          },
        }
      },
    )
  }

  if (mode === 'diagnose-a-residue') {
    return withLegacyCustody(
      seams.filesystem,
      m45,
      controlRoot,
      profile,
      profile.buildResidueRoot,
      seams.effectiveUid,
      buildResidueRootEntries,
      buildResidueRootEntries,
      [baselineName],
      [baselineName],
      true,
      true,
      async (recovered) => {
        await assertTrackedUnchanged(seams, repositoryRoot, tracked)
        await recovered.revalidate([baselineName], buildResidueRootEntries)
        const result = await seams.diagnoseAResidue({
          repositoryRoot,
          nativeAuthoritySha256: tracked.nativeAuthoritySha256,
          rootNonceSha256: seams.nonce(),
          commandLock: terminalEvidence(recovered.commandLock!),
        })
        exactRecordKeys(result, ['helperExitCode'])
        if (
          !Number.isSafeInteger(result.helperExitCode) ||
          ![0, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].includes(
            result.helperExitCode,
          )
        )
          throw new Error('a-residue-diagnostic')
        await assertTrackedUnchanged(seams, repositoryRoot, tracked)
        await recovered.revalidate([baselineName], buildResidueRootEntries)
        return {
          mode,
          status: 'a-build-residue-diagnosed',
          helperExitCode: result.helperExitCode,
          commitments,
        }
      },
    )
  }

  if (mode === 'recover-a-fd-map-scratch') {
    return withLegacyCustody(
      seams.filesystem,
      m45,
      controlRoot,
      profile,
      profile.buildResidueRoot,
      seams.effectiveUid,
      buildResidueRootEntries,
      buildResidueRootEntries,
      [baselineName],
      [baselineName],
      true,
      true,
      async (recovered) => {
        await assertTrackedUnchanged(seams, repositoryRoot, tracked)
        await recovered.revalidate([baselineName], buildResidueRootEntries)
        const result = await seams.recoverAFdMapScratch({
          repositoryRoot,
          nativeAuthoritySha256: tracked.nativeAuthoritySha256,
          rootNonceSha256: seams.nonce(),
          commandLock: terminalEvidence(recovered.commandLock!),
          scratchUid: 501,
          scratchDevice: 16777231,
          scratchInode: 13940765,
          scratchMode: 0o700,
          scratchLinks: 2,
          revalidateOuter: async () => {
            await assertTrackedUnchanged(seams, repositoryRoot, tracked)
            await recovered.revalidate([baselineName], buildResidueRootEntries)
          },
        })
        exactRecordKeys(result, ['scratchRecovered'])
        if (result.scratchRecovered !== true)
          throw new Error('a-fd-map-scratch-recovery')
        await assertTrackedUnchanged(seams, repositoryRoot, tracked)
        await recovered.revalidate([baselineName], buildResidueRootEntries)
        return {
          mode,
          status: 'a-fd-map-scratch-recovered',
          commitments,
        }
      },
    )
  }

  if (mode === 'derive-a') {
    const entry = await selectAEntry(seams.filesystem, m45)
    const expectedRootEntries =
      entry === 'fresh-base' ? baseRootEntries : lockedRootEntries
    return withLegacyCustody(
      seams.filesystem,
      m45,
      controlRoot,
      profile,
      entry === 'lock-only-reentry' ? profile.lockOnlyRoot : profile.root,
      seams.effectiveUid,
      expectedRootEntries,
      lockedRootEntries,
      [baselineName],
      [baselineName, stageAName],
      entry === 'lock-only-reentry',
      true,
      async (recovered) => {
        let seamEntered = false
        try {
          await assertTrackedUnchanged(seams, repositoryRoot, tracked)
          await recovered.revalidate([baselineName], expectedRootEntries)
          const aInput = {
            repositoryRoot,
            rootNonceSha256: seams.nonce(),
            sharedTerminal: {
              phase: 'shared-a',
              siblings: Object.freeze({
                'candidate-review': terminalEvidence(
                  recovered.siblings['candidate-review']!,
                ),
                discovery: terminalEvidence(recovered.siblings.discovery!),
                'predecessor-review': terminalEvidence(
                  recovered.siblings['predecessor-review']!,
                ),
                'policy-native-derivation': terminalEvidence(recovered.control),
              }),
            },
            commandLock:
              entry === 'lock-only-reentry'
                ? terminalEvidence(recovered.commandLock!)
                : null,
          }
          seamEntered = true
          const stageA = parseASeamResult(
            await seams.deriveA(aInput),
            tracked.nativeAuthoritySha256,
          )
          await assertTrackedUnchanged(seams, repositoryRoot, tracked)
          await recovered.revalidate([baselineName], lockedRootEntries)
          const write = async (revalidateLock: () => Promise<void>) => {
            await recovered.revalidate([baselineName], lockedRootEntries)
            await revalidateLock()
            const artifact = await writeArtifact(
              seams.filesystem,
              controlRoot,
              stageAName,
              createArtifact(`m45-policy-native-${stageAName}.v1`, {
                package: stageA,
                tracked: commitments,
                legacyBaselineRawSha256: recovered.baseline.rawSha256,
              }),
              recovered.root.dev,
              seams.effectiveUid,
            )
            await revalidateLock()
            await recovered.revalidate(
              [baselineName, stageAName],
              lockedRootEntries,
            )
            await validateControl(
              seams.filesystem,
              controlRoot,
              recovered.root.dev,
              seams.effectiveUid,
              [baselineName, stageAName],
            )
            return {
              mode,
              status: 'a-derived' as const,
              commitments: {
                ...commitments,
                stageASha256: String(artifact.artifactSha256),
              },
            }
          }
          return await (recovered.commandLock === undefined
            ? withHeldCommandLock(
                seams.filesystem,
                m45,
                recovered.root,
                seams.effectiveUid,
                (_commandLock, revalidateLock) => write(revalidateLock),
              )
            : write(async () => undefined))
        } catch (error) {
          if (!seamEntered) throw error
          try {
            await assertTrackedUnchanged(seams, repositoryRoot, tracked)
            await recovered.revalidate([baselineName], lockedRootEntries)
            await absent(seams.filesystem, join(controlRoot, stageAName))
            recovered.setPostControlEntries([baselineName])
            return {
              mode,
              status: 'a-residue-preserved' as const,
              commitments,
            }
          } catch {
            try {
              await recovered.revalidate(
                [baselineName, stageAName],
                lockedRootEntries,
              )
              recovered.setPostControlEntries([baselineName, stageAName])
              return {
                mode,
                status: 'a-residue-preserved' as const,
                commitments,
              }
            } catch {
              throw error
            }
          }
        }
      },
    )
  }

  if (mode === 'derive-b') {
    return withLegacyCustody(
      seams.filesystem,
      m45,
      controlRoot,
      profile,
      profile.root,
      seams.effectiveUid,
      lockedRootEntries,
      lockedRootEntries,
      [baselineName, stageAName],
      [baselineName, stageAName, stageBName, candidateName],
      true,
      false,
      async (shared) =>
        withHeldArtifact(
          seams.filesystem,
          join(controlRoot, stageAName),
          `m45-policy-native-${stageAName}.v1`,
          shared.root.dev,
          seams.effectiveUid,
          async (stageA, revalidateStageA) => {
            if (canonical(stageA.tracked) !== canonical(commitments))
              throw new Error('tracked-drift')
            assertLegacyBinding(stageA, shared.baseline)
            const output = await seams.deriveB({
              repositoryRoot,
              rootNonceSha256: seams.nonce(),
              cleanedStageAPackage: stageA.package,
              sharedTerminal: {
                phase: 'shared-b',
                siblings: Object.freeze({
                  'candidate-review': terminalEvidence(
                    shared.siblings['candidate-review']!,
                  ),
                  discovery: terminalEvidence(shared.siblings.discovery!),
                  'predecessor-review': terminalEvidence(
                    shared.siblings['predecessor-review']!,
                  ),
                  'policy-native-derivation': terminalEvidence(shared.control),
                }),
              },
            })
            await revalidateStageA()
            await shared.revalidate(
              [baselineName, stageAName],
              lockedRootEntries,
            )
            const stageBPackage = parsePolicyPromotionPackage(output.package)
            const candidate = await createPolicyPromotionProvenanceCandidate(
              stageA.package,
              stageBPackage,
            )
            await revalidateStageA()
            await shared.revalidate(
              [baselineName, stageAName],
              lockedRootEntries,
            )
            const stageB = await writeArtifact(
              seams.filesystem,
              controlRoot,
              stageBName,
              createArtifact(`m45-policy-native-${stageBName}.v1`, {
                package: stageBPackage,
                preflight: output.preflight,
                tracked: commitments,
                legacyBaselineRawSha256: shared.baseline.rawSha256,
                stageAArtifactSha256: stageA.artifactSha256,
              }),
              shared.root.dev,
              seams.effectiveUid,
            )
            await revalidateStageA()
            await shared.revalidate(
              [baselineName, stageAName, stageBName],
              lockedRootEntries,
            )
            await validateControl(
              seams.filesystem,
              controlRoot,
              shared.root.dev,
              seams.effectiveUid,
              [baselineName, stageAName, stageBName],
            )
            const candidateArtifact = await writeArtifact(
              seams.filesystem,
              controlRoot,
              candidateName,
              createArtifact(`m45-policy-native-${candidateName}.v1`, {
                package: candidate,
                stageAArtifactSha256: stageA.artifactSha256,
                stageBArtifactSha256: stageB.artifactSha256,
                tracked: commitments,
                legacyBaselineRawSha256: shared.baseline.rawSha256,
              }),
              shared.root.dev,
              seams.effectiveUid,
            )
            await revalidateStageA()
            await shared.revalidate(
              [baselineName, stageAName, stageBName, candidateName],
              lockedRootEntries,
            )
            await validateControl(
              seams.filesystem,
              controlRoot,
              shared.root.dev,
              seams.effectiveUid,
              [baselineName, stageAName, stageBName, candidateName],
            )
            return {
              mode,
              status: 'b-derived',
              commitments: {
                ...commitments,
                candidateSha256: String(candidateArtifact.artifactSha256),
              },
            }
          },
        ),
    )
  }

  return withLegacyCustody(
    seams.filesystem,
    m45,
    controlRoot,
    profile,
    profile.root,
    seams.effectiveUid,
    lockedRootEntries,
    lockedRootEntries,
    [baselineName, stageAName, stageBName, candidateName],
    [baselineName, stageAName, stageBName, candidateName, reviewInputName],
    true,
    false,
    async (shared) =>
      withHeldArtifact(
        seams.filesystem,
        join(controlRoot, stageAName),
        `m45-policy-native-${stageAName}.v1`,
        shared.root.dev,
        seams.effectiveUid,
        async (stageA, revalidateStageA) =>
          withHeldArtifact(
            seams.filesystem,
            join(controlRoot, stageBName),
            `m45-policy-native-${stageBName}.v1`,
            shared.root.dev,
            seams.effectiveUid,
            async (stageB, revalidateStageB) =>
              withHeldArtifact(
                seams.filesystem,
                join(controlRoot, candidateName),
                `m45-policy-native-${candidateName}.v1`,
                shared.root.dev,
                seams.effectiveUid,
                async (candidate, revalidateCandidate) => {
                  if (
                    [stageA, stageB, candidate].some(
                      (artifact) =>
                        canonical(artifact.tracked) !== canonical(commitments),
                    )
                  )
                    throw new Error('tracked-drift')
                  for (const artifact of [stageA, stageB, candidate])
                    assertLegacyBinding(artifact, shared.baseline)
                  if (
                    stageB.stageAArtifactSha256 !== stageA.artifactSha256 ||
                    candidate.stageAArtifactSha256 !== stageA.artifactSha256 ||
                    candidate.stageBArtifactSha256 !== stageB.artifactSha256
                  )
                    throw new Error('artifact-binding')
                  await revalidateStageA()
                  await revalidateStageB()
                  await revalidateCandidate()
                  await shared.revalidate(
                    [baselineName, stageAName, stageBName, candidateName],
                    lockedRootEntries,
                  )
                  const review = await writeArtifact(
                    seams.filesystem,
                    controlRoot,
                    reviewInputName,
                    createArtifact(`m45-policy-native-${reviewInputName}.v1`, {
                      candidate: candidate.package,
                      stageA: stageA.package,
                      stageB: stageB.package,
                      tracked: commitments,
                      legacyBaselineRawSha256: shared.baseline.rawSha256,
                      stageAArtifactSha256: stageA.artifactSha256,
                      stageBArtifactSha256: stageB.artifactSha256,
                      candidateArtifactSha256: candidate.artifactSha256,
                      reviewScope: 'm45-policy-native-candidate-v1',
                      reviewerContractVersion:
                        'm45-policy-reviewer-contract-v1',
                    }),
                    shared.root.dev,
                    seams.effectiveUid,
                  )
                  await revalidateStageA()
                  await revalidateStageB()
                  await revalidateCandidate()
                  await shared.revalidate(
                    [
                      baselineName,
                      stageAName,
                      stageBName,
                      candidateName,
                      reviewInputName,
                    ],
                    lockedRootEntries,
                  )
                  await validateControl(
                    seams.filesystem,
                    controlRoot,
                    shared.root.dev,
                    seams.effectiveUid,
                    [
                      baselineName,
                      stageAName,
                      stageBName,
                      candidateName,
                      reviewInputName,
                    ],
                  )
                  return {
                    mode,
                    status: 'review-ready',
                    commitments: {
                      ...commitments,
                      candidateSha256: String(candidate.artifactSha256),
                      reviewInputSha256: String(review.artifactSha256),
                    },
                  }
                },
              ),
          ),
      ),
  )
}

export async function runPolicyNativeDerivationCommand(
  argv: readonly string[],
  overrides: Partial<PolicyNativeDerivationSeams> = {},
): Promise<PolicyNativeDerivationResult> {
  return runPolicyNativeDerivationCommandWithProfile(
    argv,
    overrides,
    legacyResidue,
  )
}

export function createPolicySyntheticNativeDerivationFixture() {
  if (process.env.NODE_ENV !== 'test') throw new Error('test-only')
  const residue = createPolicySyntheticLegacyResidue()
  const profile: ResidueProfile = residue
  return Object.freeze({
    residue,
    run: (
      argv: readonly string[],
      overrides: Partial<PolicyNativeDerivationSeams> = {},
    ) => runPolicyNativeDerivationCommandWithProfile(argv, overrides, profile),
  })
}

export async function executePolicyNativeDerivationCli(
  argv = process.argv.slice(2),
): Promise<number> {
  try {
    const result = await runPolicyNativeDerivationCommand(argv)
    process.stdout.write(`${JSON.stringify(result)}\n`)
    return 0
  } catch {
    const mode =
      argv[0] === 'check' ||
      argv[0] === 'preflight' ||
      argv[0] === 'recover-preflight' ||
      argv[0] === 'diagnose-a' ||
      argv[0] === 'diagnose-a-residue' ||
      argv[0] === 'diagnose-a-fd-map' ||
      argv[0] === 'recover-a-fd-map-scratch' ||
      argv[0] === 'derive-a' ||
      argv[0] === 'derive-b' ||
      argv[0] === 'review-candidate'
        ? argv[0]
        : 'unknown'
    process.stdout.write(`${JSON.stringify({ mode, status: 'stopped' })}\n`)
    return 1
  }
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  void executePolicyNativeDerivationCli().then((code) => {
    process.exitCode = code
  })
}

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

const confirmation = '--confirm-m45-policy-native-derivation-v1'
const reviewConfirmation = '--confirm-m45-policy-native-review-v1'
const controlName = 'policy-native-derivation'
const baselineName = 'shared-root-baseline.v1.json'
const stageAName = 'stage-a.v1.json'
const stageBName = 'stage-b.v1.json'
const candidateName = 'candidate.v1.json'
const reviewInputName = 'review-input.v1.json'
const preservedSiblings = [
  'candidate-review',
  'discovery',
  'predecessor-review',
] as const
const policyNode = '/opt/homebrew/Cellar/node@24/24.18.1/bin/node'
const sha256 = (value: Uint8Array | string) =>
  createHash('sha256').update(value).digest('hex')

export type PolicyNativeDerivationMode =
  'check' | 'preflight' | 'derive-a' | 'derive-b' | 'review-candidate'

export type PolicyNativeDerivationResult = Readonly<{
  mode: PolicyNativeDerivationMode | 'unknown'
  status:
    | 'checked'
    | 'preflight-ready'
    | 'a-derived'
    | 'b-derived'
    | 'review-ready'
    | 'stopped'
  commitments?: Readonly<Record<string, string>>
}>

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
  heldRead: (path: string) => Promise<{
    before: Metadata
    bytes: Buffer
    after: Metadata
  }>
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
}>

export type PolicyNativeDerivationSeams = Readonly<{
  filesystem: RunnerFilesystem
  platform: string
  nodeVersion: string
  executablePath: string
  npmUserAgent: string
  effectiveUid: number
  cwd: string
  tracked: (repositoryRoot: string) => Promise<TrackedCommitments>
  nonce: () => string
  deriveA: (input: {
    repositoryRoot: string
    rootNonceSha256: string
    sharedTerminal: unknown
  }) => Promise<unknown>
  deriveB: (input: {
    repositoryRoot: string
    rootNonceSha256: string
    cleanedStageAPackage: unknown
    sharedTerminal: unknown
  }) => Promise<Readonly<{ preflight: unknown; package: unknown }>>
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
  if (
    (operation === 'preflight' ||
      operation === 'derive-a' ||
      operation === 'derive-b') &&
    literal === confirmation
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
  const held = await filesystem.heldRead(path)
  const { before, bytes, after } = held
  assertMetadata(before, 'file', owner, 0o600, rootDevice)
  if (before.nlink !== 1 || before.size === 0) throw new Error('artifact')
  if (bytes.byteLength !== before.size) throw new Error('artifact')
  if (canonical(before) !== canonical(after)) throw new Error('artifact')
  return parseSelfHashedArtifact(bytes, schema)
}

async function validateControl(
  filesystem: RunnerFilesystem,
  controlRoot: string,
  rootDevice: number,
  owner: number,
  entries: readonly string[],
): Promise<void> {
  const metadata = await filesystem.lstat(controlRoot)
  assertMetadata(metadata, 'directory', owner, 0o700, rootDevice)
  if (metadata.nlink !== 2) throw new Error('control')
  if (!exactEntries(await filesystem.readdir(controlRoot), entries))
    throw new Error('control')
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
  const metadata = await filesystem.lstat(root)
  assertMetadata(metadata, 'directory', owner, requiredMode)
  if (
    !exactEntries(
      await filesystem.readdir(root),
      controlPresent ? [...preservedSiblings, controlName] : preservedSiblings,
    )
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

async function sharedTerminalInput(
  filesystem: RunnerFilesystem,
  controlRoot: string,
  phase: 'shared-a' | 'shared-b',
  siblings: Readonly<Record<string, Metadata>>,
): Promise<Readonly<Record<string, unknown>>> {
  const control = await filesystem.lstat(controlRoot)
  return Object.freeze({
    phase,
    siblings: Object.freeze({
      'candidate-review': terminalEvidence(siblings['candidate-review']!),
      discovery: terminalEvidence(siblings.discovery!),
      'predecessor-review': terminalEvidence(siblings['predecessor-review']!),
      'policy-native-derivation': terminalEvidence(control),
    }),
  })
}

function defaultFilesystem(): RunnerFilesystem {
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
    heldRead: async (path) => {
      const handle = await open(
        path,
        fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
      )
      try {
        const beforeStat = await handle.stat()
        const bytes = await handle.readFile()
        const afterStat = await handle.stat()
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
        return {
          before: toMetadata(beforeStat),
          bytes,
          after: toMetadata(afterStat),
        }
      } finally {
        await handle.close()
      }
    },
    chmodHeldDirectory: async (path, requiredMode, expected) => {
      const handle = await open(
        path,
        fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
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
  const [source, launches, worker, runner] = await Promise.all([
    inspectPolicyExclusivePromotionSource(),
    inspectPolicyNativeLaunchSources(),
    inspectPolicyLockPreflightWorker(),
    readFile(fileURLToPath(import.meta.url)),
  ])
  return {
    commit,
    runnerSha256: sha256(runner),
    sourceSha256: source.sha256,
    launchContractSha256: launches.launchContractSha256,
    launcherSha256: launches.launcherSha256,
    nativeAuthoritySha256: launches.nativeAuthoritySha256,
    lockPreflightWorkerSha256: worker.sha256,
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
    nonce: () => sha256(randomBytes(32)),
    deriveA: derivePolicyProvisionalBuildA,
    deriveB: derivePolicyProvisionalBuildB,
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

export async function runPolicyNativeDerivationCommand(
  argv: readonly string[],
  overrides: Partial<PolicyNativeDerivationSeams> = {},
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

  const shared = await currentSharedRoot(
    seams.filesystem,
    m45,
    seams.effectiveUid,
    0o700,
    true,
  )
  const baseline = await heldArtifact(
    seams.filesystem,
    join(controlRoot, baselineName),
    `m45-policy-native-${baselineName}.v1`,
    shared.root.dev,
    seams.effectiveUid,
  )
  if (canonical(baseline.tracked) !== canonical(commitments))
    throw new Error('tracked-drift')
  assertSameSiblings(baseline, shared.siblings)

  if (mode === 'derive-a') {
    await validateControl(
      seams.filesystem,
      controlRoot,
      shared.root.dev,
      seams.effectiveUid,
      [baselineName],
    )
    const stageA = parsePolicyPromotionPackage(
      await seams.deriveA({
        repositoryRoot,
        rootNonceSha256: seams.nonce(),
        sharedTerminal: await sharedTerminalInput(
          seams.filesystem,
          controlRoot,
          'shared-a',
          shared.siblings,
        ),
      }),
    )
    const artifact = await writeArtifact(
      seams.filesystem,
      controlRoot,
      stageAName,
      createArtifact(`m45-policy-native-${stageAName}.v1`, {
        package: stageA,
        tracked: commitments,
      }),
      shared.root.dev,
      seams.effectiveUid,
    )
    if (artifact.schema === undefined) throw new Error('stage-a')
    return {
      mode,
      status: 'a-derived',
      commitments: {
        ...commitments,
        stageASha256: String(artifact.artifactSha256),
      },
    }
  }

  const stageA = await heldArtifact(
    seams.filesystem,
    join(controlRoot, stageAName),
    `m45-policy-native-${stageAName}.v1`,
    shared.root.dev,
    seams.effectiveUid,
  )
  if (canonical(stageA.tracked) !== canonical(commitments))
    throw new Error('tracked-drift')
  if (mode === 'derive-b') {
    await validateControl(
      seams.filesystem,
      controlRoot,
      shared.root.dev,
      seams.effectiveUid,
      [baselineName, stageAName],
    )
    const output = await seams.deriveB({
      repositoryRoot,
      rootNonceSha256: seams.nonce(),
      cleanedStageAPackage: stageA.package,
      sharedTerminal: await sharedTerminalInput(
        seams.filesystem,
        controlRoot,
        'shared-b',
        shared.siblings,
      ),
    })
    const stageBPackage = parsePolicyPromotionPackage(output.package)
    const candidate = await createPolicyPromotionProvenanceCandidate(
      stageA.package,
      stageBPackage,
    )
    const stageB = await writeArtifact(
      seams.filesystem,
      controlRoot,
      stageBName,
      createArtifact(`m45-policy-native-${stageBName}.v1`, {
        package: stageBPackage,
        preflight: output.preflight,
        tracked: commitments,
      }),
      shared.root.dev,
      seams.effectiveUid,
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
      }),
      shared.root.dev,
      seams.effectiveUid,
    )
    return {
      mode,
      status: 'b-derived',
      commitments: {
        ...commitments,
        candidateSha256: String(candidateArtifact.artifactSha256),
      },
    }
  }

  const stageB = await heldArtifact(
    seams.filesystem,
    join(controlRoot, stageBName),
    `m45-policy-native-${stageBName}.v1`,
    shared.root.dev,
    seams.effectiveUid,
  )
  const candidate = await heldArtifact(
    seams.filesystem,
    join(controlRoot, candidateName),
    `m45-policy-native-${candidateName}.v1`,
    shared.root.dev,
    seams.effectiveUid,
  )
  if (
    canonical(stageB.tracked) !== canonical(commitments) ||
    canonical(candidate.tracked) !== canonical(commitments)
  )
    throw new Error('tracked-drift')
  await validateControl(
    seams.filesystem,
    controlRoot,
    shared.root.dev,
    seams.effectiveUid,
    [baselineName, stageAName, stageBName, candidateName],
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
      reviewScope: 'm45-policy-native-candidate-v1',
      reviewerContractVersion: 'm45-policy-reviewer-contract-v1',
    }),
    shared.root.dev,
    seams.effectiveUid,
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

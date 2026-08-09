import { createHash } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  readdir,
  writeFile,
} from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initializePolicyNativeOperationBroker } from './m45-policy-baseline-native-launcher'

const broker = initializePolicyNativeOperationBroker()
const sha256Pattern = /^[a-f0-9]{64}$/u
const safeAbsolutePathPattern = /^\/(?:[A-Za-z0-9._+@-]+\/)*[A-Za-z0-9._+@-]+$/u
const helperSourcePath = fileURLToPath(
  new URL(
    './policy-baseline-review/exclusive-promotion-helper.c',
    import.meta.url,
  ),
)
const launchContractPath = fileURLToPath(
  new URL('./m45-policy-baseline-native-launch-contract.ts', import.meta.url),
)
const launcherPath = fileURLToPath(
  new URL('./m45-policy-baseline-native-launcher.ts', import.meta.url),
)
const nativeAuthorityPath = fileURLToPath(import.meta.url)
const lockWorkerPath = fileURLToPath(
  new URL(
    './policy-baseline-review/lock-preflight-worker.mjs',
    import.meta.url,
  ),
)
const xcrunPath = '/usr/bin/xcrun'
const darwinFlags = {
  noFollow: 0x00000100,
  closeOnExec: 0x01000000,
  exclusiveLock: 0x00000020,
  nonblocking: 0x00000004,
} as const
const lockCreateFlags =
  fsConstants.O_RDWR |
  fsConstants.O_CREAT |
  fsConstants.O_EXCL |
  darwinFlags.noFollow |
  darwinFlags.closeOnExec |
  darwinFlags.exclusiveLock |
  darwinFlags.nonblocking
const lockExistingFlags =
  fsConstants.O_RDWR |
  darwinFlags.noFollow |
  darwinFlags.closeOnExec |
  darwinFlags.exclusiveLock |
  darwinFlags.nonblocking
const sdkHeaderPaths = [
  'usr/include/sys/types.h',
  'usr/include/sys/stat.h',
  'usr/include/sys/attr.h',
  'usr/include/sys/acl.h',
  'usr/include/sys/stdio.h',
  'usr/include/fcntl.h',
  'usr/include/errno.h',
  'usr/include/stdint.h',
  'usr/include/stdlib.h',
  'usr/include/unistd.h',
  'usr/include/string.h',
  'usr/include/stdbool.h',
] as const

function exactObject(
  value: unknown,
  keys: readonly string[],
): asserts value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')
  )
    throw new Error('policy-native-authority')
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`
  return JSON.stringify(value)
}
function hash(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex')
}
function hashAuthority(value: unknown): string {
  return hash(Buffer.from(canonical(value)))
}
function safeRoot(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !safeAbsolutePathPattern.test(value) ||
    value.split('/').some((segment) => segment === '.' || segment === '..') ||
    resolve(value) !== value
  )
    throw new Error('policy-native-authority')
  return value
}
function sha256(value: unknown): string {
  if (typeof value !== 'string' || !sha256Pattern.test(value))
    throw new Error('policy-native-authority')
  return value
}
function parseResolverOutput(bytes: Buffer): string {
  const text = bytes.toString('utf8')
  if (
    !text.endsWith('\n') ||
    text.slice(0, -1).includes('\n') ||
    text.includes('\r') ||
    text.includes('\0')
  )
    throw new Error('policy-native-authority')
  return safeRoot(text.slice(0, -1))
}
async function inspectProtectedPath(path: string, kind: 'file' | 'directory') {
  const canonicalPath = await realpath(path)
  if (canonicalPath !== path) throw new Error('policy-native-authority')
  let cursor = '/'
  for (const segment of path.split('/').filter(Boolean)) {
    cursor = join(cursor, segment)
    const metadata = await lstat(cursor)
    if (
      metadata.isSymbolicLink() ||
      metadata.uid !== 0 ||
      (metadata.mode & 0o7022) !== 0
    )
      throw new Error('policy-native-authority')
  }
  const metadata = await lstat(path)
  if (
    (kind === 'file' ? !metadata.isFile() : !metadata.isDirectory()) ||
    metadata.nlink < 1
  )
    throw new Error('policy-native-authority')
  return metadata
}
function successfulDiagnostic(result: {
  code: number
  stdout: Buffer
  stderr: Buffer
  processGroupAbsent: true
  streamsClosed: true
}) {
  if (result.code !== 0 || !result.processGroupAbsent || !result.streamsClosed)
    throw new Error('policy-native-authority')
  return result
}
/**
 * Complete high-level toolchain derivation. The parent trust root supplies only
 * its externally computed bridge commitment; executable selection and every
 * child launch remain private to this module.
 */
export async function runPolicyNativeToolchainDerivation(
  input: unknown,
): Promise<Readonly<Record<string, unknown>>> {
  exactObject(input, ['repositoryRoot', 'nativeAuthoritySha256'])
  const repositoryRoot = safeRoot(input.repositoryRoot)
  if ((await realpath(repositoryRoot)) !== repositoryRoot)
    throw new Error('policy-native-authority')
  const nativeAuthoritySha256 = sha256(input.nativeAuthoritySha256)
  const [source, launchContract, launcher, worker] = await Promise.all([
    readFile(helperSourcePath),
    readFile(launchContractPath),
    readFile(launcherPath),
    readFile(lockWorkerPath),
  ])
  const xcrunBefore = await inspectProtectedPath(xcrunPath, 'file')
  const xcrunBytesBefore = await readFile(xcrunPath)
  const compilerResolution = successfulDiagnostic(
    await broker.runXcrunCompilerPath({ repositoryRoot }),
  )
  const sdkResolution = successfulDiagnostic(
    await broker.runXcrunSdkPath({ repositoryRoot }),
  )
  if (
    compilerResolution.stderr.byteLength !== 0 ||
    sdkResolution.stderr.byteLength !== 0
  )
    throw new Error('policy-native-authority')
  const compilerPath = parseResolverOutput(compilerResolution.stdout)
  const sdkRoot = parseResolverOutput(sdkResolution.stdout)
  const [compilerBefore, sdkBefore] = await Promise.all([
    inspectProtectedPath(compilerPath, 'file'),
    inspectProtectedPath(sdkRoot, 'directory'),
  ])
  const [compilerBytes, headers] = await Promise.all([
    readFile(compilerPath),
    Promise.all(
      sdkHeaderPaths.map(async (relativePath) => {
        const path = join(sdkRoot, relativePath)
        const metadata = await inspectProtectedPath(path, 'file')
        const bytes = await readFile(path)
        return {
          relativePath,
          device: String(metadata.dev),
          inode: String(metadata.ino),
          byteCount: bytes.byteLength,
          sha256: hash(bytes),
        }
      }),
    ),
  ])
  const buildRoot = join(
    repositoryRoot,
    '.local/m45/.policy-exclusive-promotion-build',
  )
  const compileContractSha256 = hashAuthority({
    arguments: [
      '-std=c17',
      '-Wall',
      '-Wextra',
      '-Werror',
      '-Wpedantic',
      '-O2',
      '-isysroot',
      sdkRoot,
      '-o',
      join(buildRoot, 'exclusive-promotion-helper'),
      join(buildRoot, 'exclusive-promotion-helper.c'),
    ],
    environment: { TMPDIR: join(buildRoot, 'tmp') },
  })
  const preliminary = {
    schema: 'policy-toolchain-authority.v1',
    version: 1,
    compilerPath,
    sdkRoot,
    xcrunSha256: hash(xcrunBytesBefore),
    xcrunDevice: String(xcrunBefore.dev),
    xcrunInode: String(xcrunBefore.ino),
    sourceSha256: hash(source),
    compilerSha256: hash(compilerBytes),
    compilerDevice: String(compilerBefore.dev),
    compilerInode: String(compilerBefore.ino),
    sdkIdentitySha256: hashAuthority({
      path: sdkRoot,
      device: String(sdkBefore.dev),
      inode: String(sdkBefore.ino),
    }),
    sdkDevice: String(sdkBefore.dev),
    sdkInode: String(sdkBefore.ino),
    headerSetSha256: hashAuthority(headers),
    diagnosticSha256: '0'.repeat(64),
    compileContractSha256,
    launchContractSha256: hash(launchContract),
    launcherSha256: hash(launcher),
    nativeAuthoritySha256,
    lockPreflightWorkerSha256: hash(worker),
  }
  const diagnostic = successfulDiagnostic(
    await broker.runCompilerDiagnostic({
      repositoryRoot,
      compilerPath,
      sdkRoot,
      authorityPackage: {
        ...preliminary,
        authorityPackageSha256: hashAuthority(preliminary),
      },
    }),
  )
  const [
    xcrunAfter,
    xcrunBytesAfter,
    sourceAfter,
    contractAfter,
    launcherAfter,
    workerAfter,
    compilerAfter,
    sdkAfter,
  ] = await Promise.all([
    inspectProtectedPath(xcrunPath, 'file'),
    readFile(xcrunPath),
    readFile(helperSourcePath),
    readFile(launchContractPath),
    readFile(launcherPath),
    readFile(lockWorkerPath),
    inspectProtectedPath(compilerPath, 'file'),
    inspectProtectedPath(sdkRoot, 'directory'),
  ])
  if (
    xcrunAfter.dev !== xcrunBefore.dev ||
    xcrunAfter.ino !== xcrunBefore.ino ||
    hash(xcrunBytesAfter) !== preliminary.xcrunSha256 ||
    hash(sourceAfter) !== preliminary.sourceSha256 ||
    hash(contractAfter) !== preliminary.launchContractSha256 ||
    hash(launcherAfter) !== preliminary.launcherSha256 ||
    hash(workerAfter) !== preliminary.lockPreflightWorkerSha256 ||
    compilerAfter.dev !== compilerBefore.dev ||
    compilerAfter.ino !== compilerBefore.ino ||
    sdkAfter.dev !== sdkBefore.dev ||
    sdkAfter.ino !== sdkBefore.ino
  )
    throw new Error('policy-native-authority')
  const core = {
    ...preliminary,
    diagnosticSha256: hashAuthority({
      stdout: diagnostic.stdout.toString('base64'),
      stderr: diagnostic.stderr.toString('base64'),
    }),
  }
  return Object.freeze({
    ...core,
    authorityPackageSha256: hashAuthority(core),
  })
}
// D111 keeps all lower-level build, contender, helper, candidate, and cleanup
// operations private. The complete A/B/C workflows are added below this trust
// root; no low-level broker method is re-exported.

type LockIdentity = Readonly<{
  uid: number
  device: string
  inode: string
  mode: 384
  links: 1
  bytes: 0
}>
function lockIdentity(
  metadata: Awaited<ReturnType<FileHandle['stat']>>,
): LockIdentity {
  const uid = process.geteuid?.()
  if (
    process.platform !== 'darwin' ||
    fsConstants.O_NOFOLLOW !== darwinFlags.noFollow ||
    fsConstants.O_NONBLOCK !== darwinFlags.nonblocking ||
    uid === undefined ||
    !metadata.isFile() ||
    metadata.uid !== uid ||
    metadata.nlink !== 1 ||
    metadata.size !== 0 ||
    (Number(metadata.mode) & 0o7777) !== 0o600
  )
    throw new Error('policy-native-authority')
  return {
    uid,
    device: String(metadata.dev),
    inode: String(metadata.ino),
    mode: 384,
    links: 1,
    bytes: 0,
  }
}
async function validateNamedLock(
  handle: FileHandle,
  lockPath: string,
  expected: LockIdentity,
): Promise<void> {
  const [held, named] = await Promise.all([handle.stat(), lstat(lockPath)])
  const heldIdentity = lockIdentity(held)
  if (
    canonical(heldIdentity) !== canonical(expected) ||
    !named.isFile() ||
    named.uid !== expected.uid ||
    String(named.dev) !== expected.device ||
    String(named.ino) !== expected.inode ||
    named.nlink !== 1 ||
    named.size !== 0 ||
    (named.mode & 0o7777) !== 0o600
  )
    throw new Error('policy-native-authority')
}
async function openCommandLock(lockPath: string): Promise<FileHandle> {
  try {
    return await open(lockPath, lockCreateFlags, 0o600)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    return open(lockPath, lockExistingFlags)
  }
}
function closedContender(
  result: Awaited<ReturnType<typeof broker.runLockContender>>,
  expectedCode: 0 | 20,
) {
  if (
    result.code !== expectedCode ||
    result.stdoutBytes !== 0 ||
    result.stderrBytes !== 0 ||
    !result.processGroupAbsent ||
    !result.streamsClosed
  )
    throw new Error('policy-native-authority')
  return {
    exitCode: expectedCode,
    stdoutBytes: 0 as const,
    stderrBytes: 0 as const,
    processGroupAbsent: true as const,
    streamsClosed: true as const,
  }
}
async function commandLockCapabilityProbe(
  repositoryRoot: string,
  workerSha256: string,
) {
  const lockPath = join(
    repositoryRoot,
    '.local/m45/.policy-exclusive-promotion.lock',
  )
  const held = await openCommandLock(lockPath)
  let before: LockIdentity
  try {
    before = lockIdentity(await held.stat())
    await validateNamedLock(held, lockPath, before)
    const contender = closedContender(
      await broker.runLockContender(
        { repositoryRoot, workerSha256 },
        workerSha256,
      ),
      20,
    )
    await validateNamedLock(held, lockPath, before)
    await held.close()
    const released = closedContender(
      await broker.runLockContender(
        { repositoryRoot, workerSha256 },
        workerSha256,
      ),
      0,
    )
    const afterMetadata = await lstat(lockPath)
    const after: LockIdentity = {
      uid: before.uid,
      device: String(afterMetadata.dev),
      inode: String(afterMetadata.ino),
      mode: 384,
      links: 1,
      bytes: 0,
    }
    if (
      !afterMetadata.isFile() ||
      afterMetadata.uid !== before.uid ||
      afterMetadata.nlink !== 1 ||
      afterMetadata.size !== 0 ||
      (afterMetadata.mode & 0o7777) !== 0o600 ||
      canonical(after) !== canonical(before)
    )
      throw new Error('policy-native-authority')
    const core = {
      schema: 'policy-command-lock-capability-preflight.v1',
      version: 1,
      path: '.local/m45/.policy-exclusive-promotion.lock',
      workerSha256,
      before,
      heldContender: contender,
      releasedContender: released,
      after,
    }
    return Object.freeze({
      ...core,
      capabilityProbeSha256: hashAuthority(core),
    })
  } catch (error) {
    try {
      await held.close()
    } catch {
      // The closed privacy-safe failure remains the only observable outcome.
    }
    throw error
  }
}

type PositioningFixtureHarness = Readonly<{
  expectedFillerIdentity: FillerIdentity
  openFiller: () => Promise<FileHandle>
  inspectFiller: (handle: FileHandle) => Promise<FillerIdentity>
  openLock: () => Promise<FileHandle>
  validateLock: () => Promise<void>
}>

async function openDerivationLock(
  repositoryRoot: string,
  fixtureHarness?: PositioningFixtureHarness,
) {
  const positioningFillers: FileHandle[] = []
  let lock: FileHandle | undefined
  let positioningAmbiguous = false
  const lockPath = join(
    repositoryRoot,
    '.local/m45/.policy-exclusive-promotion.lock',
  )
  const attempted = new Set<FileHandle>()
  const closeRemainingDescending = async (handles: readonly FileHandle[]) => {
    let closeFailure: unknown
    for (const handle of [...handles].sort(
      (left, right) => right.fd - left.fd,
    )) {
      if (attempted.has(handle)) continue
      attempted.add(handle)
      try {
        await handle.close()
      } catch (error) {
        closeFailure ??= error
        positioningAmbiguous = true
      }
    }
    if (closeFailure !== undefined) throw closeFailure
  }
  try {
    const expectedFillerIdentity =
      fixtureHarness?.expectedFillerIdentity ??
      (await expectedDevNullIdentity())
    for (let index = 0; index < 4; index += 1)
      await openCheckedFiller(
        expectedFillerIdentity,
        fixtureHarness?.openFiller ??
          (() =>
            open(
              '/dev/null',
              fsConstants.O_RDONLY |
                darwinFlags.noFollow |
                darwinFlags.closeOnExec,
            )),
        fixtureHarness?.inspectFiller ?? inspectNativeFiller,
        (handle) => positioningFillers.push(handle),
      )
    if (
      canonical(
        positioningFillers.map(({ fd }) => fd).sort((a, b) => a - b),
      ) !== canonical([3, 4, 5, 6])
    )
      throw new Error('policy-native-authority')
    lock = fixtureHarness
      ? await fixtureHarness.openLock()
      : await open(lockPath, lockExistingFlags)
    if (lock.fd <= 6) throw new Error('policy-native-authority')
    const identity = fixtureHarness
      ? ({} as LockIdentity)
      : lockIdentity(await lock.stat())
    if (fixtureHarness) await fixtureHarness.validateLock()
    else await validateNamedLock(lock, lockPath, identity)
    await closeRemainingDescending(positioningFillers)
    if (fixtureHarness) await fixtureHarness.validateLock()
    else await validateNamedLock(lock, lockPath, identity)
    return { lock, lockPath, identity }
  } catch (error) {
    // Each known positioning filler is attempted exactly once, even after an
    // earlier close failure. Once acquired, the lock remains held through
    // this ambiguity classification and closes last.
    await closeRemainingDescending(positioningFillers).catch(() => {})
    if (lock !== undefined) {
      if (fixtureHarness) await fixtureHarness.validateLock().catch(() => {})
      else
        await validateNamedLock(
          lock,
          lockPath,
          lockIdentity(await lock.stat()),
        ).catch(() => {})
      await lock.close().catch(() => {})
    }
    if (positioningAmbiguous)
      throw new Error('policy-native-positioning-ambiguous', { cause: error })
    throw error
  }
}

async function closeDerivationLock(
  custody: Awaited<ReturnType<typeof openDerivationLock>>,
  validateForFixture?: () => Promise<void>,
) {
  let validationFailure: unknown
  let closeFailure: unknown
  try {
    if (validateForFixture) await validateForFixture()
    else
      await validateNamedLock(custody.lock, custody.lockPath, custody.identity)
  } catch (error) {
    validationFailure = error
  }
  try {
    await custody.lock.close()
  } catch (error) {
    closeFailure = error
  }
  if (validationFailure !== undefined && closeFailure !== undefined)
    throw new Error('policy-native-lock-finalization-ambiguous', {
      cause: { validationFailure, closeFailure },
    })
  if (validationFailure !== undefined) throw validationFailure
  if (closeFailure !== undefined) throw closeFailure
}

type ChildFdHandle = Readonly<{ fd: number; close: () => Promise<void> }>
type FillerIdentity = Readonly<{ device: string; inode: string }>

async function expectedDevNullIdentity(): Promise<FillerIdentity> {
  const metadata = await lstat('/dev/null')
  if (!metadata.isCharacterDevice()) throw new Error('policy-native-authority')
  return { device: String(metadata.dev), inode: String(metadata.ino) }
}
async function inspectNativeFiller(
  handle: FileHandle,
): Promise<FillerIdentity> {
  const metadata = await handle.stat()
  if (!metadata.isCharacterDevice()) throw new Error('policy-native-authority')
  return { device: String(metadata.dev), inode: String(metadata.ino) }
}
async function openCheckedFiller<Handle extends ChildFdHandle>(
  expected: FillerIdentity,
  openFiller: () => Promise<Handle>,
  inspectFiller: (handle: Handle) => Promise<FillerIdentity>,
  register: (handle: Handle) => void,
): Promise<Handle> {
  const handle = await openFiller()
  register(handle)
  const actual = await inspectFiller(handle)
  if (canonical(actual) !== canonical(expected))
    throw new Error('policy-native-authority')
  return handle
}

type ChildFdCustody<Handle extends ChildFdHandle> = Readonly<{
  lock: Handle
  lockPath: string
  identity: LockIdentity
}>
type ChildFdLifecycleHarness<Handle extends ChildFdHandle> = Readonly<{
  open: (path: string, flags: number) => Promise<Handle>
  validate: (custody: ChildFdCustody<Handle>) => Promise<void>
  expectedFillerIdentity: FillerIdentity
  inspectFiller: (handle: Handle) => Promise<FillerIdentity>
}>

async function withChildFillers<T, Handle extends ChildFdHandle = FileHandle>(
  custody: ChildFdCustody<Handle>,
  highestChildAuthorityTarget: 3 | 6,
  operation: (
    openChildAuthority: (path: string, flags: number) => Promise<Handle>,
  ) => Promise<T>,
  harness?: ChildFdLifecycleHarness<Handle>,
): Promise<T> {
  const expected = highestChildAuthorityTarget === 6 ? [3, 4, 5, 6] : [3, 4, 5]
  const fillers: Handle[] = []
  const authorities: Handle[] = []
  const validate = async () =>
    harness === undefined
      ? validateNamedLock(
          custody.lock as unknown as FileHandle,
          custody.lockPath,
          custody.identity,
        )
      : harness.validate(custody)
  const expectedFillerIdentity =
    harness?.expectedFillerIdentity ?? (await expectedDevNullIdentity())
  const inspectFiller =
    harness === undefined
      ? (handle: Handle) => inspectNativeFiller(handle as unknown as FileHandle)
      : harness.inspectFiller
  let failure: unknown
  const closeDescending = async (handles: readonly Handle[]) => {
    let closeFailure: unknown
    for (const handle of [...handles].sort(
      (left, right) => right.fd - left.fd,
    )) {
      try {
        await handle.close()
      } catch (error) {
        closeFailure ??= error
      }
    }
    if (closeFailure !== undefined) throw closeFailure
  }
  try {
    await validate()
    for (let index = 0; index < expected.length; index += 1)
      await openCheckedFiller(
        expectedFillerIdentity,
        async () =>
          harness === undefined
            ? ((await open(
                '/dev/null',
                fsConstants.O_RDONLY |
                  darwinFlags.noFollow |
                  darwinFlags.closeOnExec,
              )) as unknown as Handle)
            : harness.open(
                '/dev/null',
                fsConstants.O_RDONLY |
                  darwinFlags.noFollow |
                  darwinFlags.closeOnExec,
              ),
        inspectFiller,
        (handle) => fillers.push(handle),
      )
    if (
      canonical(
        fillers.map(({ fd }) => fd).sort((left, right) => left - right),
      ) !== canonical(expected) ||
      custody.lock.fd <= highestChildAuthorityTarget
    )
      throw new Error('policy-native-authority')
    const openChildAuthority = async (path: string, flags: number) => {
      const handle =
        harness === undefined
          ? ((await open(path, flags)) as unknown as Handle)
          : await harness.open(path, flags)
      authorities.push(handle)
      if (
        handle.fd <= highestChildAuthorityTarget ||
        handle.fd === custody.lock.fd ||
        fillers.some((filler) => filler.fd === handle.fd) ||
        authorities.filter(({ fd }) => fd === handle.fd).length !== 1
      )
        throw new Error('policy-native-authority')
      return handle
    }
    const result = await operation(openChildAuthority)
    await validate()
    return result
  } catch (error) {
    failure = error
    throw error
  } finally {
    let teardownFailure: unknown
    try {
      await closeDescending(fillers)
    } catch (error) {
      teardownFailure ??= error
    }
    try {
      await closeDescending(authorities)
    } catch (error) {
      teardownFailure ??= error
    }
    try {
      await validate()
    } catch (error) {
      teardownFailure ??= error
    }
    if (failure === undefined && teardownFailure !== undefined)
      throw teardownFailure
  }
}

/**
 * Test-only D112 lifecycle harness. It exposes neither a launch plan nor a
 * native authority: tests supply inert descriptors and exercise the exact
 * production filler/authority ordering implementation above.
 */
export async function runPolicyNativeChildFdLifecycleForFixture(
  input: Readonly<{
    highestChildAuthorityTarget: 3 | 6
    lock: ChildFdHandle
    open: (path: string, flags: number) => Promise<ChildFdHandle>
    validate: () => Promise<void>
    expectedFillerIdentity?: FillerIdentity
    inspectFiller?: (handle: ChildFdHandle) => Promise<FillerIdentity>
    run: (
      openChildAuthority: (
        path: string,
        flags: number,
      ) => Promise<ChildFdHandle>,
    ) => Promise<void>
  }>,
): Promise<void> {
  if (process.env.NODE_ENV !== 'test')
    throw new Error('policy-wrapper-isolation')
  await withChildFillers(
    {
      lock: input.lock,
      lockPath: '/test-only-policy-native-child-fd-lifecycle',
      identity: {} as LockIdentity,
    },
    input.highestChildAuthorityTarget,
    input.run,
    {
      open: input.open,
      validate: async () => input.validate(),
      expectedFillerIdentity: input.expectedFillerIdentity ?? {
        device: 'test-dev-null',
        inode: 'test-dev-null',
      },
      inspectFiller:
        input.inspectFiller ??
        (async () => ({ device: 'test-dev-null', inode: 'test-dev-null' })),
    },
  )
}

/** Test-only access to the exact production positioning/lock lifecycle. */
export async function runPolicyNativePositioningForFixture(
  input: Readonly<{
    openFiller: () => Promise<ChildFdHandle>
    inspectFiller: (handle: ChildFdHandle) => Promise<FillerIdentity>
    openLock: () => Promise<ChildFdHandle>
    validateLock: () => Promise<void>
    validateFinalLock?: () => Promise<void>
  }>,
): Promise<void> {
  if (process.env.NODE_ENV !== 'test')
    throw new Error('policy-wrapper-isolation')
  const custody = await openDerivationLock(
    '/test-only-policy-native-positioning',
    {
      expectedFillerIdentity: {
        device: 'test-dev-null',
        inode: 'test-dev-null',
      },
      openFiller: input.openFiller as () => Promise<FileHandle>,
      inspectFiller: input.inspectFiller as (
        handle: FileHandle,
      ) => Promise<FillerIdentity>,
      openLock: input.openLock as () => Promise<FileHandle>,
      validateLock: input.validateLock,
    },
  )
  await closeDerivationLock(
    custody,
    input.validateFinalLock ?? input.validateLock,
  )
}

type CandidatePreparedOperation = Readonly<{
  operation: unknown
  postcheck: () => Promise<void>
}>
type CandidateChildAuthority = (
  path: string,
  flags: number,
) => Promise<FileHandle>
type CandidateLifecycleResult = Readonly<{
  code: number
  stdoutBytes: number
  stderrBytes: number
  processGroupAbsent: boolean
  streamsClosed: boolean
}>

/**
 * The one child lifecycle shared by B's ordinary and cleanup-only sessions.
 * It intentionally knows neither paths nor policy state: the bridge supplies
 * the fixed operation and owns the only subsequent checkpoint transition.
 */
async function runBCandidateOperation(
  input: Readonly<{
    highest: 3 | 6
    cleanupOnly: boolean
    withChild: (
      highest: 3 | 6,
      run: (
        openChildAuthority: CandidateChildAuthority,
      ) => Promise<CandidateLifecycleResult>,
    ) => Promise<CandidateLifecycleResult>
    prepare: (openChildAuthority: CandidateChildAuthority) => Promise<unknown>
    runOperation: (
      operation: unknown,
      cleanupOnly: boolean,
    ) => Promise<CandidateLifecycleResult>
    validateLock: () => Promise<void>
    onStart: () => void
    onOperation: (operation: unknown) => void
    onLaunched: () => void
    onClosed: (result: CandidateLifecycleResult) => void
    accepted?: number
  }>,
): Promise<CandidateLifecycleResult> {
  input.onStart()
  const result = await input.withChild(
    input.highest,
    async (openChildAuthority) => {
      const prepared = await input.prepare(openChildAuthority)
      const wrapped =
        prepared !== null &&
        typeof prepared === 'object' &&
        'operation' in prepared &&
        'postcheck' in prepared
          ? (prepared as CandidatePreparedOperation)
          : undefined
      const operation = wrapped?.operation ?? prepared
      input.onOperation(operation)
      input.onLaunched()
      const current = await input.runOperation(operation, input.cleanupOnly)
      input.onClosed(current)
      await wrapped?.postcheck()
      await input.validateLock()
      return current
    },
  )
  if (
    result.code !== (input.accepted ?? 0) ||
    result.stdoutBytes !== 0 ||
    result.stderrBytes !== 0 ||
    !result.processGroupAbsent ||
    !result.streamsClosed
  )
    throw new Error('policy-native-authority')
  return result
}

type BCandidateCleanupBroker = Readonly<{
  beginBCandidateCleanup: (session: object, admission: unknown) => object
}>

function transitionBCandidateToCleanup(
  input: Readonly<{
    broker: BCandidateCleanupBroker
    session: object
    checkpoint: string
    checkpointSha256: string
    childLaunched: boolean
    failedOperationFamily: string
    failedOperationIndex: number
  }>,
): object {
  return input.broker.beginBCandidateCleanup(input.session, {
    checkpoint: input.checkpoint,
    checkpointSha256: input.checkpointSha256,
    childLaunched: input.childLaunched,
    failedOperationFamily: input.failedOperationFamily,
    failedOperationIndex: input.failedOperationIndex,
    lifecycleClosed: true,
  })
}

/**
 * Test-only high-level B lifecycle driver. It uses the production child
 * runner and cleanup admission transition above, while every filesystem,
 * broker, and child result is inert caller-supplied evidence.
 */
export async function runPolicyBCandidateLifecycleForFixture(
  input: Readonly<{
    operations: readonly Readonly<{
      name: string
      highest: 3 | 6
      operation: unknown
    }>[]
    cleanupSuffix: readonly Readonly<{
      name: string
      highest: 3 | 6
      operation: unknown
    }>[]
    failAt?: Readonly<{
      operationIndex: number
      phase: 'before' | 'after'
    }>
    lifecycleFailure?:
      | 'spawn'
      | 'exit'
      | 'stdout'
      | 'stderr'
      | 'timeout'
      | 'signal'
      | 'stream'
      | 'group'
      | 'postcheck'
    dependencies: Readonly<{
      withChild: (
        highest: 3 | 6,
        run: (
          openChildAuthority: CandidateChildAuthority,
        ) => Promise<CandidateLifecycleResult>,
      ) => Promise<CandidateLifecycleResult>
      runOperation: (
        phase: 'active' | 'cleanup',
        session: object,
        operation: unknown,
        lifecycleFailure?: NonNullable<typeof input.lifecycleFailure>,
      ) => Promise<CandidateLifecycleResult>
      beginActive: (session: object) => void
      beginCleanup: (session: object, admission: unknown) => object
      closeCleanup: (session: object) => void
      validateLock: () => Promise<void>
      closeLock: () => Promise<void>
    }>
  }>,
): Promise<
  Readonly<{
    outcome:
      | 'completed-no-authority'
      | 'cleaned-no-authority'
      | 'retained-no-authority'
    events: readonly string[]
    registrationPermitted: false
  }>
> {
  if (process.env.NODE_ENV !== 'test')
    throw new Error('policy-wrapper-isolation')
  const events: string[] = []
  const active = Object.freeze({})
  input.dependencies.beginActive(active)
  let cleanup: object | undefined
  let launched = false
  let operationIndex = 0
  const run = async (
    phase: 'active' | 'cleanup',
    session: object,
    entry: (typeof input.operations)[number],
    failure?: NonNullable<typeof input.lifecycleFailure>,
  ) =>
    runBCandidateOperation({
      highest: entry.highest,
      cleanupOnly: phase === 'cleanup',
      withChild: input.dependencies.withChild,
      prepare: async () => {
        if (
          phase === 'active' &&
          input.failAt?.operationIndex === operationIndex &&
          input.failAt.phase === 'before'
        )
          throw new Error('fixture-before-operation')
        return {
          operation: entry.operation,
          postcheck: async () => {
            if (failure === 'postcheck') throw new Error('fixture-postcheck')
          },
        }
      },
      runOperation: async (operation) =>
        input.dependencies.runOperation(phase, session, operation, failure),
      validateLock: input.dependencies.validateLock,
      onStart: () => {
        launched = false
      },
      onOperation: () => events.push(`${phase}:operation:${entry.name}`),
      onLaunched: () => {
        launched = true
        events.push(`${phase}:launched:${entry.name}`)
      },
      onClosed: () => events.push(`${phase}:closed:${entry.name}`),
    })
  try {
    for (const entry of input.operations) {
      const failure =
        input.failAt?.operationIndex === operationIndex &&
        input.failAt.phase === 'after'
          ? input.lifecycleFailure
          : undefined
      await run('active', active, entry, failure)
      operationIndex += 1
    }
    events.push('active:complete')
    return {
      outcome: 'completed-no-authority',
      events,
      registrationPermitted: false,
    }
  } catch {
    const failed = input.operations[operationIndex]
    if (failed === undefined) throw new Error('policy-native-authority')
    cleanup = transitionBCandidateToCleanup({
      broker: { beginBCandidateCleanup: input.dependencies.beginCleanup },
      session: active,
      checkpoint: 'O2',
      checkpointSha256: 'a'.repeat(64),
      childLaunched: launched,
      failedOperationFamily: failed.name,
      failedOperationIndex: operationIndex,
    })
    events.push(
      `cleanup:admitted:${failed.name}:${launched ? 'launched' : 'not-launched'}`,
    )
    try {
      for (const entry of input.cleanupSuffix)
        await run('cleanup', cleanup, entry)
      input.dependencies.closeCleanup(cleanup)
      cleanup = undefined
      events.push('cleanup:complete')
      return {
        outcome: 'cleaned-no-authority',
        events,
        registrationPermitted: false,
      }
    } catch {
      events.push('cleanup:retained')
      return {
        outcome: 'retained-no-authority',
        events,
        registrationPermitted: false,
      }
    }
  } finally {
    await input.dependencies.closeLock()
    events.push('lock:closed-last')
  }
}

/**
 * Decision 114 reuses the same production child lifecycle rather than copying
 * it. The injected C driver has a distinct exported name solely so tests can
 * prove that C hands a separately branded active/cleanup token to that shared
 * runner; no production token crosses this fixture boundary.
 */
export async function runPolicyCAcceptedLifecycleForFixture(
  input: Parameters<typeof runPolicyBCandidateLifecycleForFixture>[0],
) {
  return runPolicyBCandidateLifecycleForFixture(input)
}

const bCleanupInitialRows = [
  'R01i',
  'R02',
  'R03',
  'R04',
  'R05',
  'R06',
  'R07',
  'R08',
  'R09',
  'R10',
  'R11',
  'R12',
  'R13',
  'R14',
  'R15',
  'R16',
] as const
const bCleanupSuccessRows = ['R01s', ...bCleanupInitialRows.slice(1)] as const
export const policyBCleanupCheckpointIds = [
  'B0',
  'B1',
  'B2',
  'B3',
  'B4',
  ...Array.from({ length: 13 }, (_, index) => `P${index + 1}`),
  'O1',
  'O2',
  'O3',
  ...bCleanupInitialRows,
  'R01s',
  'T0',
  'T1',
  'T2',
  'TX',
] as const

/** Test-only projection of Decision 113's production-private transition table. */
export function runPolicyBCandidateFailureLifecycleForFixture(input: {
  checkpoint: string
  observedState: 'prestate' | 'poststate' | 'ambiguous'
  childLaunched: boolean
}) {
  if (process.env.NODE_ENV !== 'test')
    throw new Error('policy-wrapper-isolation')
  if (!policyBCleanupCheckpointIds.includes(input.checkpoint as never))
    throw new Error('policy-native-candidate-cleanup')
  const closed = (category: string) => ({
    transition: 'active-to-closed' as const,
    category,
    permittedSuffix: [] as readonly string[],
    registrationPermitted: false as const,
  })
  if (input.observedState === 'ambiguous' || input.checkpoint === 'TX')
    return closed('ambiguous-residue-preserved')
  if (/^B[0-4]$/u.test(input.checkpoint)) return closed('b-build-prefix')
  if (/^P(?:[1-9]|1[0-2])$/u.test(input.checkpoint))
    return closed('b-preflight-setup-prefix')
  if (input.checkpoint === 'T1') return closed('b-terminal-helper-unlinked')
  if (input.checkpoint === 'T2')
    return closed('b-terminal-root-removed-unproved')
  let suffix: readonly string[]
  if (input.checkpoint === 'P13') suffix = bCleanupInitialRows
  else if (input.checkpoint === 'O1')
    suffix = ['ACL-remove', ...bCleanupInitialRows]
  else if (input.checkpoint === 'O2' || input.checkpoint === 'O3')
    suffix = bCleanupSuccessRows
  else if (input.checkpoint === 'T0') suffix = ['R16']
  else {
    const branch =
      input.checkpoint === 'R01s' ? bCleanupSuccessRows : bCleanupInitialRows
    const index = branch.indexOf(input.checkpoint as never)
    if (index < 0) return closed('ambiguous-residue-preserved')
    if (input.observedState === 'poststate') suffix = branch.slice(index + 1)
    else if (!input.childLaunched) suffix = branch.slice(index)
    else return closed('b-cleanup-row-retained')
  }
  if (input.checkpoint === 'T0' && input.childLaunched)
    return closed('b-cleanup-row-retained')
  return {
    transition: 'active-to-cleanup-only' as const,
    category: null,
    permittedSuffix: [...suffix],
    registrationPermitted: false as const,
  }
}

export function runPolicyCAcceptedFailureLifecycleForFixture(input: {
  checkpoint: string
  observedState: 'prestate' | 'poststate' | 'ambiguous'
  childLaunched: boolean
}) {
  const result = runPolicyBCandidateFailureLifecycleForFixture(input)
  const category = result.category
  if (category === null || category === 'ambiguous-residue-preserved')
    return result
  return {
    ...result,
    category: category.replace(/^b-/u, 'c-'),
  }
}

function metadataEvidence(metadata: Awaited<ReturnType<FileHandle['stat']>>) {
  return {
    uid: String(metadata.uid),
    device: String(metadata.dev),
    inode: String(metadata.ino),
    links: String(metadata.nlink),
    mode: String(Number(metadata.mode) & 0o7777),
    size: metadata.isDirectory() ? ('na' as const) : String(metadata.size),
  }
}
async function completeHeldBytes(handle: FileHandle, size: number) {
  const bytes = Buffer.alloc(size)
  const first = await handle.read(bytes, 0, size, 0)
  const trailing = await handle.read(Buffer.alloc(1), 0, 1, size)
  if (first.bytesRead !== size || trailing.bytesRead !== 0)
    throw new Error('policy-native-authority')
  return bytes
}

type BCandidateCheckpoint =
  | 'B0'
  | 'B1'
  | 'B2'
  | 'B3'
  | 'B4'
  | `P${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13}`
  | 'O1'
  | 'O2'
  | 'O3'
  | 'R01i'
  | 'R01s'
  | `R0${2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`
  | `R1${0 | 1 | 2 | 3 | 4 | 5 | 6}`
  | 'T0'
  | 'T1'
  | 'T2'
  | 'TX'

type BCandidateCheckpointEvidence = Readonly<{
  checkpoint: BCandidateCheckpoint
  checkpointSha256: string
}>

function checkpointAuthoritySha256(
  workflow: 'B-candidate' | 'C-accepted',
  core: Readonly<Record<string, unknown>>,
): string {
  return hashAuthority({
    schema:
      workflow === 'B-candidate'
        ? 'policy-b-candidate-checkpoint.v1'
        : 'policy-c-accepted-checkpoint.v1',
    workflow,
    ...core,
  })
}

function classifyClosedCollisionCheckpoint(
  checkpoint: BCandidateCheckpointEvidence,
  failedOperationFamily: string,
  lastChildExitCode: number | undefined,
  workflow: 'B-candidate' | 'C-accepted' = 'B-candidate',
): BCandidateCheckpointEvidence {
  if (
    checkpoint.checkpoint !== 'O2' ||
    failedOperationFamily !== 'preflight-promotion' ||
    lastChildExitCode !== 10
  )
    return checkpoint
  return {
    checkpoint: 'O3',
    checkpointSha256: checkpointAuthoritySha256(workflow, {
      reopenedCheckpointSha256: checkpoint.checkpointSha256,
      collisionLifecycle: 'closed-exit-10',
    }),
  }
}

const fixtureBytes = Object.freeze({
  'success-source/fixture.bin': 'zedarchive-m45-exclusive-success-source-v1\n',
  'success-destination/fixture.bin':
    'zedarchive-m45-exclusive-success-destination-v1\n',
  'collision-source/fixture.bin':
    'zedarchive-m45-exclusive-collision-source-v1\n',
  'collision-destination/fixture.bin':
    'zedarchive-m45-exclusive-collision-destination-v1\n',
})

/**
 * Reopens the complete finite B surface before a recovery decision.  The
 * returned digest is deliberately a digest of observed held/path identities,
 * inventories, ACL probe result, and bytes — never a digest of a row label.
 * A failed reopen, changed identity, extra entry, or unrecognised ACL maps to
 * `undefined`, which is the caller's closed ambiguous-residue outcome.
 */
async function reopenBCandidateCheckpoint(
  input: Readonly<{
    workflow?: 'B-candidate' | 'C-accepted'
    repositoryRoot: string
    custody: Awaited<ReturnType<typeof openDerivationLock>>
    helperSha256: string
    sourceSha256: string
    cleanupPhase: boolean
    terminalLaunched: boolean
    failedOperationFamily: string
    failedCleanupTargetPath: string | undefined
    zeroAcl: (
      role: string,
      path: string,
      evidence: Readonly<Record<string, unknown>>,
    ) => Promise<boolean>
    acl: () => Promise<'empty' | 'fixture' | 'ambiguous'>
    /**
     * This is private production plumbing for the test-only reopen harness
     * below. Production calls never provide either hook.
     */
    fixture?: Readonly<{
      validateLock: () => Promise<void>
      evidence: (
        role: string,
        kind: 'file' | 'directory',
        entries: readonly string[],
        value: Readonly<Record<string, unknown>>,
      ) => Readonly<Record<string, unknown>>
      beforeNamed: (role: string, path: string) => Promise<void>
    }>
  }>,
): Promise<BCandidateCheckpointEvidence | undefined> {
  const m45Path = join(input.repositoryRoot, '.local/m45')
  const buildPath = join(m45Path, '.policy-exclusive-promotion-build')
  const preflightPath = join(m45Path, '.policy-exclusive-promotion-preflight')
  const paths = [
    ['build', buildPath, 'directory'],
    ['tmp', join(buildPath, 'tmp'), 'directory'],
    ['source', join(buildPath, 'exclusive-promotion-helper.c'), 'file'],
    ['helper', join(buildPath, 'exclusive-promotion-helper'), 'file'],
    ['preflight', preflightPath, 'directory'],
    ['success-source', join(preflightPath, 'success-source'), 'directory'],
    [
      'success-source/promotion',
      join(preflightPath, 'success-source/promotion'),
      'directory',
    ],
    [
      'success-source/fixture.bin',
      join(preflightPath, 'success-source/fixture.bin'),
      'file',
    ],
    [
      'success-destination',
      join(preflightPath, 'success-destination'),
      'directory',
    ],
    [
      'success-destination/promotion',
      join(preflightPath, 'success-destination/promotion'),
      'directory',
    ],
    [
      'success-destination/fixture.bin',
      join(preflightPath, 'success-destination/fixture.bin'),
      'file',
    ],
    ['collision-source', join(preflightPath, 'collision-source'), 'directory'],
    [
      'collision-source/promotion',
      join(preflightPath, 'collision-source/promotion'),
      'directory',
    ],
    [
      'collision-source/fixture.bin',
      join(preflightPath, 'collision-source/fixture.bin'),
      'file',
    ],
    [
      'collision-destination',
      join(preflightPath, 'collision-destination'),
      'directory',
    ],
    [
      'collision-destination/promotion',
      join(preflightPath, 'collision-destination/promotion'),
      'directory',
    ],
    [
      'collision-destination/fixture.bin',
      join(preflightPath, 'collision-destination/fixture.bin'),
      'file',
    ],
    ['acl-fixture', join(preflightPath, 'acl-fixture'), 'directory'],
  ] as const
  const observed: Record<string, unknown> = {}
  const inventories: Record<string, readonly string[] | 'absent'> = {}
  try {
    for (const [role, path, kind] of paths) {
      let pathStat: Awaited<ReturnType<typeof lstat>>
      try {
        pathStat = await lstat(path)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          observed[role] = 'absent'
          inventories[role] = 'absent'
          continue
        }
        throw error
      }
      if (pathStat.isSymbolicLink()) return undefined
      const handle = await open(
        path,
        fsConstants.O_RDONLY |
          (kind === 'directory' ? fsConstants.O_DIRECTORY : 0) |
          darwinFlags.noFollow |
          darwinFlags.closeOnExec,
      )
      try {
        const held = await handle.stat()
        await input.fixture?.beforeNamed(role, path)
        const named = await lstat(path)
        if (
          held.dev !== pathStat.dev ||
          held.ino !== pathStat.ino ||
          named.dev !== held.dev ||
          named.ino !== held.ino ||
          (kind === 'directory' ? !held.isDirectory() : !held.isFile())
        )
          return undefined
        const bytes =
          kind === 'file'
            ? hash(await completeHeldBytes(handle, held.size))
            : null
        let evidence: Readonly<Record<string, unknown>> = {
          ...metadataEvidence(held),
          kind,
          specialMode: String(Number(held.mode) & 0o7000),
          sha256: bytes,
        }
        if (kind === 'directory') {
          const entries = (await readdir(path)).sort()
          const after = await lstat(path)
          if (after.dev !== held.dev || after.ino !== held.ino) return undefined
          inventories[role] = entries
          evidence =
            input.fixture?.evidence(role, kind, entries, evidence) ?? evidence
        } else inventories[role] = []
        if (kind === 'file')
          evidence =
            input.fixture?.evidence(role, kind, [], evidence) ?? evidence
        observed[role] = evidence
      } finally {
        await handle.close()
      }
    }
    if (input.fixture) await input.fixture.validateLock()
    else
      await validateNamedLock(
        input.custody.lock,
        input.custody.lockPath,
        input.custody.identity,
      )
    const m45 = await open(
      m45Path,
      fsConstants.O_RDONLY |
        fsConstants.O_DIRECTORY |
        darwinFlags.noFollow |
        darwinFlags.closeOnExec,
    )
    try {
      const before = await m45.stat()
      inventories.m45 = (await readdir(m45Path)).sort()
      const after = await lstat(m45Path)
      if (after.dev !== before.dev || after.ino !== before.ino) return undefined
      let evidence: Readonly<Record<string, unknown>> = {
        ...metadataEvidence(before),
        kind: 'directory',
        specialMode: String(Number(before.mode) & 0o7000),
        sha256: null,
      }
      evidence =
        input.fixture?.evidence(
          'm45',
          'directory',
          inventories.m45,
          evidence,
        ) ?? evidence
      observed.m45 = evidence
    } finally {
      await m45.close()
    }
  } catch {
    return undefined
  }
  for (const [role, path] of paths) {
    if (role === 'acl-fixture' || observed[role] === 'absent') continue
    if (
      !(await input.zeroAcl(
        role,
        path,
        observed[role] as Record<string, unknown>,
      ))
    )
      return undefined
  }
  if (
    !(await input.zeroAcl(
      'm45',
      m45Path,
      observed.m45 as Record<string, unknown>,
    )) ||
    !(await input.zeroAcl('command-lock', input.custody.lockPath, {
      ...input.custody.identity,
      uid: String(input.custody.identity.uid),
      mode: String(input.custody.identity.mode),
      links: String(input.custody.identity.links),
      size: String(input.custody.identity.bytes),
    }))
  )
    return undefined

  const exact = (role: string, entries: readonly string[]) =>
    canonical(inventories[role]) === canonical([...entries].sort())
  const absent = (role: string) => observed[role] === 'absent'
  const expectedUid = String(process.geteuid?.())
  const m45Evidence = observed.m45 as Record<string, unknown>
  const commonDevice = m45Evidence.device
  // Decision 108 binds APFS directory links to the complete immediate entry
  // inventory, not merely the subdirectory count.
  const expectedDirectoryLinks = (_role: string, entries: readonly string[]) =>
    2 + entries.length
  const canonicalMetadata = (
    role: string,
    kind: 'file' | 'directory',
    mode: string,
    links: string,
  ) => {
    const value = observed[role] as
      Record<string, unknown> | 'absent' | undefined
    return (
      value !== undefined &&
      value !== 'absent' &&
      value.kind === kind &&
      value.uid === expectedUid &&
      value.device === commonDevice &&
      value.mode === mode &&
      value.links === links &&
      value.specialMode === '0'
    )
  }
  const file = (role: string, mode: string, digest: string) => {
    const value = observed[role] as
      Record<string, unknown> | 'absent' | undefined
    return (
      value !== undefined &&
      value !== 'absent' &&
      canonicalMetadata(role, 'file', mode, '1') &&
      value.size !== '0' &&
      value.sha256 === digest
    )
  }
  const directory = (role: string, entries: readonly string[]) => {
    const value = observed[role] as
      Record<string, unknown> | 'absent' | undefined
    return (
      value !== undefined &&
      value !== 'absent' &&
      canonicalMetadata(
        role,
        'directory',
        '448',
        String(expectedDirectoryLinks(role, entries)),
      ) &&
      exact(role, entries)
    )
  }
  const m45Directory = (entries: readonly string[]) =>
    canonicalMetadata('m45', 'directory', '448', String(2 + entries.length)) &&
    exact('m45', entries)
  const allAbsent = (...roles: readonly string[]) => roles.every(absent)
  const preflightRoles = paths.slice(4).map(([role]) => role)
  const buildCore =
    directory('build', [
      'exclusive-promotion-helper',
      'exclusive-promotion-helper.c',
      'tmp',
    ]) &&
    directory('tmp', []) &&
    file('source', '256', input.sourceSha256) &&
    file('helper', '320', input.helperSha256)
  const lockOnly = m45Directory(['.policy-exclusive-promotion.lock'])
  const buildOnly = m45Directory([
    '.policy-exclusive-promotion-build',
    '.policy-exclusive-promotion.lock',
  ])
  const buildAndPreflight = m45Directory([
    '.policy-exclusive-promotion-build',
    '.policy-exclusive-promotion-preflight',
    '.policy-exclusive-promotion.lock',
  ])
  const noPreflight = allAbsent(...preflightRoles)
  const acl =
    buildAndPreflight && observed['acl-fixture'] !== 'absent'
      ? await input.acl()
      : 'not-applicable'
  const initialTree =
    directory('preflight', [
      'acl-fixture',
      'collision-destination',
      'collision-source',
      'success-destination',
      'success-source',
    ]) &&
    directory('success-source', ['fixture.bin', 'promotion']) &&
    directory('success-destination', ['fixture.bin']) &&
    directory('collision-source', ['fixture.bin', 'promotion']) &&
    directory('collision-destination', ['fixture.bin', 'promotion']) &&
    directory('acl-fixture', [])
  const successTree =
    directory('preflight', [
      'acl-fixture',
      'collision-destination',
      'collision-source',
      'success-destination',
      'success-source',
    ]) &&
    directory('success-source', ['fixture.bin']) &&
    directory('success-destination', ['fixture.bin', 'promotion']) &&
    directory('collision-source', ['fixture.bin', 'promotion']) &&
    directory('collision-destination', ['fixture.bin', 'promotion']) &&
    directory('acl-fixture', [])
  const fixtureFiles = Object.entries(fixtureBytes).every(([role, bytes]) =>
    file(role, '384', hash(Buffer.from(bytes))),
  )
  const successSourceReady =
    directory('success-source', ['fixture.bin', 'promotion']) &&
    file(
      'success-source/fixture.bin',
      '384',
      hash(Buffer.from(fixtureBytes['success-source/fixture.bin'])),
    )
  const successDestinationReady =
    successSourceReady &&
    directory('success-destination', ['fixture.bin']) &&
    file(
      'success-destination/fixture.bin',
      '384',
      hash(Buffer.from(fixtureBytes['success-destination/fixture.bin'])),
    )
  const collisionSourceReady =
    successDestinationReady &&
    directory('collision-source', ['fixture.bin', 'promotion']) &&
    file(
      'collision-source/fixture.bin',
      '384',
      hash(Buffer.from(fixtureBytes['collision-source/fixture.bin'])),
    )
  const collisionDestinationReady =
    collisionSourceReady &&
    directory('collision-destination', ['fixture.bin', 'promotion']) &&
    file(
      'collision-destination/fixture.bin',
      '384',
      hash(Buffer.from(fixtureBytes['collision-destination/fixture.bin'])),
    )
  const state = (): BCandidateCheckpoint | undefined => {
    if (
      !input.cleanupPhase &&
      lockOnly &&
      allAbsent('build', 'tmp', 'source', 'helper', ...preflightRoles)
    )
      return 'B0'
    if (
      !input.cleanupPhase &&
      buildOnly &&
      directory('build', []) &&
      allAbsent('tmp', 'source', 'helper', ...preflightRoles)
    )
      return 'B1'
    if (
      !input.cleanupPhase &&
      buildOnly &&
      directory('build', ['tmp']) &&
      directory('tmp', []) &&
      allAbsent('source', 'helper', ...preflightRoles)
    )
      return 'B2'
    if (
      !input.cleanupPhase &&
      buildOnly &&
      directory('build', ['exclusive-promotion-helper.c', 'tmp']) &&
      directory('tmp', []) &&
      file('source', '256', input.sourceSha256) &&
      allAbsent('helper', ...preflightRoles)
    )
      return 'B3'
    if (buildOnly && buildCore && noPreflight)
      return input.cleanupPhase ||
        input.failedCleanupTargetPath?.endsWith(
          '/.policy-exclusive-promotion-preflight',
        )
        ? 'R14'
        : 'B4'
    if (
      buildOnly &&
      directory('build', ['exclusive-promotion-helper', 'tmp']) &&
      directory('tmp', []) &&
      file('helper', '320', input.helperSha256) &&
      allAbsent('source', ...preflightRoles)
    )
      return 'R15'
    if (
      buildOnly &&
      directory('build', ['exclusive-promotion-helper']) &&
      file('helper', '320', input.helperSha256) &&
      allAbsent('tmp', 'source', ...preflightRoles)
    )
      return input.failedOperationFamily === 'delete-build-terminal'
        ? 'T0'
        : 'R16'
    if (
      input.cleanupPhase &&
      directory('build', []) &&
      buildOnly &&
      allAbsent('tmp', 'source', 'helper', ...preflightRoles)
    )
      return 'T1'
    if (
      input.cleanupPhase &&
      input.terminalLaunched &&
      lockOnly &&
      allAbsent('build', 'tmp', 'source', 'helper', ...preflightRoles)
    )
      return 'T2'
    if (!buildAndPreflight || !buildCore) return undefined
    if (!input.cleanupPhase) {
      if (directory('preflight', []) && allAbsent(...preflightRoles.slice(1)))
        return 'P1'
      if (
        directory('preflight', ['success-source']) &&
        directory('success-source', []) &&
        allAbsent(
          ...preflightRoles.filter(
            (role) => role !== 'preflight' && role !== 'success-source',
          ),
        )
      )
        return 'P2'
      if (
        directory('preflight', ['success-source']) &&
        directory('success-source', ['fixture.bin']) &&
        file(
          'success-source/fixture.bin',
          '384',
          hash(Buffer.from(fixtureBytes['success-source/fixture.bin'])),
        ) &&
        allAbsent(
          ...preflightRoles.filter(
            (role) =>
              role !== 'preflight' && !role.startsWith('success-source'),
          ),
        )
      )
        return 'P3'
      if (
        directory('preflight', ['success-source']) &&
        directory('success-source', ['fixture.bin', 'promotion']) &&
        file(
          'success-source/fixture.bin',
          '384',
          hash(Buffer.from(fixtureBytes['success-source/fixture.bin'])),
        ) &&
        allAbsent(
          ...preflightRoles.filter(
            (role) =>
              role !== 'preflight' && !role.startsWith('success-source'),
          ),
        )
      )
        return 'P4'
      if (
        directory('preflight', ['success-destination', 'success-source']) &&
        successSourceReady &&
        directory('success-destination', []) &&
        allAbsent(
          ...preflightRoles.filter(
            (role) => role !== 'preflight' && !role.startsWith('success-'),
          ),
        )
      )
        return 'P5'
      if (
        directory('preflight', ['success-destination', 'success-source']) &&
        successDestinationReady &&
        allAbsent(
          ...preflightRoles.filter(
            (role) => role !== 'preflight' && !role.startsWith('success-'),
          ),
        )
      )
        return 'P6'
      if (
        directory('preflight', [
          'collision-source',
          'success-destination',
          'success-source',
        ]) &&
        successDestinationReady &&
        directory('collision-source', []) &&
        allAbsent(
          ...preflightRoles.filter(
            (role) =>
              role.startsWith('collision-') &&
              !role.startsWith('collision-source'),
          ),
        )
      )
        return 'P7'
      if (
        directory('preflight', [
          'collision-source',
          'success-destination',
          'success-source',
        ]) &&
        successDestinationReady &&
        directory('collision-source', ['fixture.bin']) &&
        file(
          'collision-source/fixture.bin',
          '384',
          hash(Buffer.from(fixtureBytes['collision-source/fixture.bin'])),
        ) &&
        allAbsent(
          ...preflightRoles.filter(
            (role) =>
              role.startsWith('collision-') &&
              !role.startsWith('collision-source'),
          ),
        )
      )
        return 'P8'
      if (
        directory('preflight', [
          'collision-source',
          'success-destination',
          'success-source',
        ]) &&
        collisionSourceReady &&
        allAbsent(
          ...preflightRoles.filter(
            (role) =>
              role.startsWith('collision-') &&
              !role.startsWith('collision-source'),
          ),
        )
      )
        return 'P9'
      if (
        directory('preflight', [
          'collision-destination',
          'collision-source',
          'success-destination',
          'success-source',
        ]) &&
        collisionSourceReady &&
        directory('collision-destination', []) &&
        allAbsent(
          ...preflightRoles.filter((role) =>
            role.startsWith('collision-destination/'),
          ),
        )
      )
        return 'P10'
      if (
        directory('preflight', [
          'collision-destination',
          'collision-source',
          'success-destination',
          'success-source',
        ]) &&
        collisionSourceReady &&
        directory('collision-destination', ['fixture.bin']) &&
        file(
          'collision-destination/fixture.bin',
          '384',
          hash(Buffer.from(fixtureBytes['collision-destination/fixture.bin'])),
        ) &&
        allAbsent(
          ...preflightRoles.filter(
            (role) => role === 'collision-destination/promotion',
          ),
        )
      )
        return 'P11'
      if (
        directory('preflight', [
          'collision-destination',
          'collision-source',
          'success-destination',
          'success-source',
        ]) &&
        collisionDestinationReady &&
        allAbsent('acl-fixture')
      )
        return 'P12'
    }
    if (initialTree && fixtureFiles && acl === 'fixture') return 'O1'
    if (!input.cleanupPhase && initialTree && fixtureFiles && acl === 'empty')
      return 'P13'
    // The same concrete tree is O2 before cleanup admission and R01s after
    // the one-way D113 transition.  Cleanup may never re-enter O2.
    if (!input.cleanupPhase && successTree && fixtureFiles && acl === 'empty')
      return 'O2'
    const cleanupTree = (
      expected: Readonly<{
        root: readonly string[]
        source: readonly string[] | null
        destination: readonly string[] | null
        collisionSource: readonly string[] | null
        collisionDestination: readonly string[] | null
        acl: boolean
      }>,
    ) =>
      directory('preflight', expected.root) &&
      (expected.source === null
        ? absent('success-source')
        : directory('success-source', expected.source)) &&
      (expected.destination === null
        ? absent('success-destination')
        : directory('success-destination', expected.destination)) &&
      (expected.collisionSource === null
        ? absent('collision-source')
        : directory('collision-source', expected.collisionSource)) &&
      (expected.collisionDestination === null
        ? absent('collision-destination')
        : directory('collision-destination', expected.collisionDestination)) &&
      (expected.acl ? directory('acl-fixture', []) : absent('acl-fixture')) &&
      acl === 'empty'
    const base = {
      source: ['fixture.bin'] as const,
      destination: ['fixture.bin'] as const,
      collisionSource: ['fixture.bin'] as const,
      collisionDestination: ['fixture.bin'] as const,
      acl: true,
    }
    if (
      cleanupTree({
        ...base,
        root: [
          'acl-fixture',
          'collision-destination',
          'collision-source',
          'success-destination',
          'success-source',
        ],
        source: ['fixture.bin', 'promotion'],
        collisionSource: ['fixture.bin', 'promotion'],
        collisionDestination: ['fixture.bin', 'promotion'],
      })
    )
      return 'R01i'
    if (
      cleanupTree({
        ...base,
        root: [
          'acl-fixture',
          'collision-destination',
          'collision-source',
          'success-destination',
          'success-source',
        ],
        destination: ['fixture.bin', 'promotion'],
        collisionSource: ['fixture.bin', 'promotion'],
        collisionDestination: ['fixture.bin', 'promotion'],
      })
    )
      return 'R01s'
    if (
      cleanupTree({
        ...base,
        root: [
          'acl-fixture',
          'collision-destination',
          'collision-source',
          'success-destination',
          'success-source',
        ],
        collisionSource: ['fixture.bin', 'promotion'],
        collisionDestination: ['fixture.bin', 'promotion'],
      })
    )
      return 'R02'
    if (
      cleanupTree({
        ...base,
        root: [
          'acl-fixture',
          'collision-destination',
          'collision-source',
          'success-destination',
          'success-source',
        ],
        collisionDestination: ['fixture.bin', 'promotion'],
      })
    )
      return 'R03'
    if (
      cleanupTree({
        ...base,
        root: [
          'acl-fixture',
          'collision-destination',
          'collision-source',
          'success-destination',
          'success-source',
        ],
      })
    )
      return 'R04'
    if (
      cleanupTree({
        ...base,
        root: [
          'acl-fixture',
          'collision-destination',
          'collision-source',
          'success-destination',
          'success-source',
        ],
        source: [],
      })
    )
      return 'R05'
    if (
      cleanupTree({
        ...base,
        root: [
          'acl-fixture',
          'collision-destination',
          'collision-source',
          'success-destination',
          'success-source',
        ],
        source: [],
        destination: [],
      })
    )
      return 'R06'
    if (
      cleanupTree({
        ...base,
        root: [
          'acl-fixture',
          'collision-destination',
          'collision-source',
          'success-destination',
          'success-source',
        ],
        source: [],
        destination: [],
        collisionSource: [],
      })
    )
      return 'R07'
    if (
      cleanupTree({
        ...base,
        root: [
          'acl-fixture',
          'collision-destination',
          'collision-source',
          'success-destination',
          'success-source',
        ],
        source: [],
        destination: [],
        collisionSource: [],
        collisionDestination: [],
      })
    )
      return 'R08'
    if (
      cleanupTree({
        ...base,
        root: [
          'acl-fixture',
          'collision-destination',
          'collision-source',
          'success-destination',
        ],
        source: null,
        destination: [],
        collisionSource: [],
        collisionDestination: [],
      })
    )
      return 'R09'
    if (
      cleanupTree({
        ...base,
        root: ['acl-fixture', 'collision-destination', 'collision-source'],
        source: null,
        destination: null,
        collisionSource: [],
        collisionDestination: [],
      })
    )
      return 'R10'
    if (
      cleanupTree({
        ...base,
        root: ['acl-fixture', 'collision-destination'],
        source: null,
        destination: null,
        collisionSource: null,
        collisionDestination: [],
      })
    )
      return 'R11'
    if (
      cleanupTree({
        ...base,
        root: ['acl-fixture'],
        source: null,
        destination: null,
        collisionSource: null,
        collisionDestination: null,
      })
    )
      return 'R12'
    if (
      directory('preflight', []) &&
      allAbsent(
        'success-source',
        'success-source/promotion',
        'success-source/fixture.bin',
        'success-destination',
        'success-destination/promotion',
        'success-destination/fixture.bin',
        'collision-source',
        'collision-source/promotion',
        'collision-source/fixture.bin',
        'collision-destination',
        'collision-destination/promotion',
        'collision-destination/fixture.bin',
        'acl-fixture',
      ) &&
      acl === 'not-applicable'
    )
      return 'R13'
    return undefined
  }
  const checkpoint = state()
  if (checkpoint === undefined) return undefined
  const checkpointCore = {
    evidence: observed,
    inventories,
    acl,
    commandLock: input.custody.identity,
    classifiedCheckpoint: checkpoint,
  }
  return {
    checkpoint,
    checkpointSha256: checkpointAuthoritySha256(
      input.workflow ?? 'B-candidate',
      checkpointCore,
    ),
  }
}

/**
 * Test-only entry to the production reopened-state classifier. It exists
 * because the accepted checkpoint link-count rule is APFS-specific while the
 * portable test runner uses a different directory-link implementation. The
 * harness replaces only that host representation after the production
 * no-follow opens, held/path identity checks, byte reads, and inventories have
 * completed; it never exposes a production cleanup capability or plan.
 */
export async function reopenPolicyBCandidateCheckpointForFixture(input: {
  repositoryRoot: string
  helperSha256: string
  sourceSha256: string
  cleanupPhase?: boolean
  terminalLaunched?: boolean
  failedOperationFamily?: string
  lastChildExitCode?: number
  failedCleanupTargetPath?: string
  zeroAcl?: (
    role: string,
    path: string,
    evidence: Readonly<Record<string, unknown>>,
  ) => Promise<boolean>
  acl?: () => Promise<'empty' | 'fixture' | 'ambiguous'>
  amendEvidence?: (
    role: string,
    kind: 'file' | 'directory',
    entries: readonly string[],
    evidence: Readonly<Record<string, unknown>>,
  ) => Readonly<Record<string, unknown>>
  beforeNamed?: (role: string, path: string) => Promise<void>
}): Promise<Readonly<{ checkpoint: string; checkpointSha256: string }> | null> {
  if (process.env.NODE_ENV !== 'test')
    throw new Error('policy-wrapper-isolation')
  const euid = process.geteuid?.()
  if (euid === undefined) throw new Error('policy-native-authority')
  const value = await reopenBCandidateCheckpoint({
    repositoryRoot: input.repositoryRoot,
    custody: {
      lock: {} as FileHandle,
      lockPath: join(
        input.repositoryRoot,
        '.local/m45/.policy-exclusive-promotion.lock',
      ),
      identity: {
        uid: euid,
        device: 'fixture-lock-device',
        inode: 'fixture-lock-inode',
        mode: 384,
        links: 1,
        bytes: 0,
      },
    } as Awaited<ReturnType<typeof openDerivationLock>>,
    helperSha256: input.helperSha256,
    sourceSha256: input.sourceSha256,
    cleanupPhase: input.cleanupPhase ?? false,
    terminalLaunched: input.terminalLaunched ?? false,
    failedOperationFamily: input.failedOperationFamily ?? 'fixture',
    failedCleanupTargetPath: input.failedCleanupTargetPath,
    zeroAcl: input.zeroAcl ?? (async () => true),
    acl: input.acl ?? (async () => 'empty'),
    fixture: {
      validateLock: async () => {},
      evidence: (role, kind, entries, evidence) =>
        input.amendEvidence?.(
          role,
          kind,
          entries,
          kind === 'directory'
            ? { ...evidence, links: String(2 + entries.length) }
            : evidence,
        ) ??
        (kind === 'directory'
          ? { ...evidence, links: String(2 + entries.length) }
          : evidence),
      beforeNamed: input.beforeNamed ?? (async () => {}),
    },
  })
  return value === undefined
    ? null
    : classifyClosedCollisionCheckpoint(
        value,
        input.failedOperationFamily ?? 'fixture',
        input.lastChildExitCode,
      )
}

function successfulHelper(
  result: Awaited<ReturnType<typeof broker.runHelper>>,
) {
  if (
    result.code !== 0 ||
    result.stdoutBytes !== 0 ||
    result.stderrBytes !== 0 ||
    !result.processGroupAbsent ||
    !result.streamsClosed
  )
    throw new Error('policy-native-authority')
}
async function runAcceptedHelper(
  custody: Awaited<ReturnType<typeof openDerivationLock>>,
  capability: unknown,
  highest: 3 | 6,
  prepare: (
    openChildAuthority: (path: string, flags: number) => Promise<FileHandle>,
  ) => Promise<unknown>,
) {
  return withChildFillers(custody, highest, async (openChildAuthority) => {
    const prepared = await prepare(openChildAuthority)
    const wrapped =
      prepared !== null &&
      typeof prepared === 'object' &&
      'operation' in prepared &&
      'postcheck' in prepared
        ? (prepared as {
            operation: unknown
            postcheck: () => Promise<void>
          })
        : undefined
    const operation = wrapped?.operation ?? prepared
    const result = await broker.runHelper(capability, operation)
    await wrapped?.postcheck()
    await validateNamedLock(custody.lock, custody.lockPath, custody.identity)
    return result
  })
}
async function deleteBuildEntry(
  custody: Awaited<ReturnType<typeof openDerivationLock>>,
  capability: unknown,
  buildPath: string,
  role: 'build-source' | 'build-tmp',
) {
  const name = role === 'build-source' ? 'exclusive-promotion-helper.c' : 'tmp'
  successfulHelper(
    await runAcceptedHelper(
      custody,
      capability,
      3,
      async (openChildAuthority) => {
        const parent = await openChildAuthority(
          buildPath,
          fsConstants.O_RDONLY |
            fsConstants.O_DIRECTORY |
            darwinFlags.noFollow |
            darwinFlags.closeOnExec,
        )
        const child = await openChildAuthority(
          join(buildPath, name),
          fsConstants.O_RDONLY |
            (role === 'build-tmp' ? fsConstants.O_DIRECTORY : 0) |
            darwinFlags.noFollow |
            darwinFlags.closeOnExec,
        )
        const [parentStat, childStat] = await Promise.all([
          parent.stat(),
          child.stat(),
        ])
        return {
          kind: 'delete-entry',
          role,
          parent: metadataEvidence(parentStat),
          child: metadataEvidence(childStat),
          commandLockFd: custody.lock.fd,
          parentFd: parent.fd,
          childFd: child.fd,
        }
      },
    ),
  )
}

async function buildAndCleanupA(
  repositoryRoot: string,
  rootNonceSha256: string,
  authority: Readonly<Record<string, unknown>>,
  custody: Awaited<ReturnType<typeof openDerivationLock>>,
) {
  const m45Path = join(repositoryRoot, '.local/m45')
  const buildPath = join(m45Path, '.policy-exclusive-promotion-build')
  const tmpPath = join(buildPath, 'tmp')
  const sourcePath = join(buildPath, 'exclusive-promotion-helper.c')
  const helperPath = join(buildPath, 'exclusive-promotion-helper')
  await mkdir(buildPath, { mode: 0o700 })
  await chmod(buildPath, 0o700)
  await mkdir(tmpPath, { mode: 0o700 })
  await chmod(tmpPath, 0o700)
  const source = await readFile(helperSourcePath)
  await writeFile(sourcePath, source, { flag: 'wx', mode: 0o400 })
  await chmod(sourcePath, 0o400)
  const compilerPath = safeRoot(authority.compilerPath)
  const sdkRoot = safeRoot(authority.sdkRoot)
  const buildResult = await broker.runCompilerBuild({
    repositoryRoot,
    compilerPath,
    sdkRoot,
    authorityPackage: authority,
  })
  if (
    buildResult.code !== 0 ||
    !buildResult.processGroupAbsent ||
    !buildResult.streamsClosed
  )
    throw new Error('policy-native-authority')
  await validateNamedLock(custody.lock, custody.lockPath, custody.identity)
  await chmod(helperPath, 0o500)
  const [buildStat, tmpStat, sourceStat, helperStat] = await Promise.all([
    lstat(buildPath),
    lstat(tmpPath),
    lstat(sourcePath),
    lstat(helperPath),
  ])
  if (
    !buildStat.isDirectory() ||
    buildStat.nlink !== 5 ||
    (buildStat.mode & 0o7777) !== 0o700 ||
    !tmpStat.isDirectory() ||
    tmpStat.nlink !== 2 ||
    !sourceStat.isFile() ||
    sourceStat.nlink !== 1 ||
    (sourceStat.mode & 0o7777) !== 0o400 ||
    !helperStat.isFile() ||
    helperStat.nlink !== 1 ||
    helperStat.size <= 0 ||
    (helperStat.mode & 0o7777) !== 0o500 ||
    canonical((await readdir(buildPath)).sort()) !==
      canonical([
        'exclusive-promotion-helper',
        'exclusive-promotion-helper.c',
        'tmp',
      ])
  )
    throw new Error('policy-native-authority')
  const helperHandle = await open(
    helperPath,
    fsConstants.O_RDONLY | darwinFlags.noFollow | darwinFlags.closeOnExec,
  )
  const buildHandle = await open(
    buildPath,
    fsConstants.O_RDONLY |
      fsConstants.O_DIRECTORY |
      darwinFlags.noFollow |
      darwinFlags.closeOnExec,
  )
  const m45Handle = await open(
    m45Path,
    fsConstants.O_RDONLY |
      fsConstants.O_DIRECTORY |
      darwinFlags.noFollow |
      darwinFlags.closeOnExec,
  )
  try {
    const helperBytes = await completeHeldBytes(helperHandle, helperStat.size)
    const material = {
      xcrunSha256: authority.xcrunSha256,
      xcrunDevice: authority.xcrunDevice,
      xcrunInode: authority.xcrunInode,
      sourceSha256: authority.sourceSha256,
      compilerSha256: authority.compilerSha256,
      compilerDevice: authority.compilerDevice,
      compilerInode: authority.compilerInode,
      sdkIdentitySha256: authority.sdkIdentitySha256,
      sdkDevice: authority.sdkDevice,
      sdkInode: authority.sdkInode,
      headerSetSha256: authority.headerSetSha256,
      diagnosticSha256: authority.diagnosticSha256,
      compileContractSha256: authority.compileContractSha256,
      launchContractSha256: authority.launchContractSha256,
      launcherSha256: authority.launcherSha256,
      nativeAuthoritySha256: authority.nativeAuthoritySha256,
      lockPreflightWorkerSha256: authority.lockPreflightWorkerSha256,
      helperSha256: hash(helperBytes),
    }
    const rootIdentitySha256 = hashAuthority({
      nonce: rootNonceSha256,
      device: String(buildStat.dev),
      inode: String(buildStat.ino),
    })
    const packageCore = {
      schema: 'policy-exclusive-promotion-provenance.v1',
      version: 1,
      stage: 'A',
      rootIdentitySha256,
      material,
      preflightAuthoritySha256: null,
      reviewAuthoritySha256: null,
      cleanupProved: true,
    }
    const stageAPackage = {
      ...packageCore,
      packageSha256: hashAuthority(packageCore),
    }
    const heldCore = {
      helperPath,
      helperSha256: material.helperSha256,
      device: String(helperStat.dev),
      inode: String(helperStat.ino),
      byteCount: helperStat.size,
    }
    const capability = {
      repositoryRoot,
      helperPath,
      device: String(helperStat.dev),
      inode: String(helperStat.ino),
      byteCount: helperStat.size,
      provenancePackage: stageAPackage,
      heldEvidenceSha256: hashAuthority(heldCore),
    }
    successfulHelper(
      await runAcceptedHelper(custody, capability, 3, async () => ({
        kind: 'metadata-check',
        role: 'command-lock',
        evidence: {
          uid: String(custody.identity.uid),
          device: custody.identity.device,
          inode: custody.identity.inode,
          links: '1',
          mode: '384',
          size: '0',
        },
        authorityFd: custody.lock.fd,
      })),
    )
    await deleteBuildEntry(custody, capability, buildPath, 'build-source')
    await deleteBuildEntry(custody, capability, buildPath, 'build-tmp')
    successfulHelper(
      await runAcceptedHelper(
        custody,
        capability,
        6,
        async (openChildAuthority) => {
          const parent = await openChildAuthority(
            m45Path,
            fsConstants.O_RDONLY |
              fsConstants.O_DIRECTORY |
              darwinFlags.noFollow |
              darwinFlags.closeOnExec,
          )
          const buildRoot = await openChildAuthority(
            buildPath,
            fsConstants.O_RDONLY |
              fsConstants.O_DIRECTORY |
              darwinFlags.noFollow |
              darwinFlags.closeOnExec,
          )
          const helper = await openChildAuthority(
            helperPath,
            fsConstants.O_RDONLY |
              darwinFlags.noFollow |
              darwinFlags.closeOnExec,
          )
          const [parentBefore, buildBefore, helperBefore] = await Promise.all([
            parent.stat(),
            buildRoot.stat(),
            helper.stat(),
          ])
          if (
            hash(await completeHeldBytes(helper, helperBefore.size)) !==
            material.helperSha256
          )
            throw new Error('policy-native-authority')
          return {
            operation: {
              kind: 'delete-build-terminal',
              parent: metadataEvidence(parentBefore),
              buildRoot: metadataEvidence(buildBefore),
              helper: metadataEvidence(helperBefore),
              commandLockFd: custody.lock.fd,
              parentFd: parent.fd,
              buildRootFd: buildRoot.fd,
              helperFd: helper.fd,
            },
            postcheck: async () => {
              if (
                hash(await completeHeldBytes(helper, helperBefore.size)) !==
                material.helperSha256
              )
                throw new Error('policy-native-authority')
            },
          }
        },
      ),
    )
    try {
      await lstat(buildPath)
      throw new Error('policy-native-authority')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    return stageAPackage
  } finally {
    await helperHandle.close()
    await buildHandle.close()
    await m45Handle.close()
  }
}

export async function runPolicyProvisionalBuildA(
  input: unknown,
): Promise<Readonly<Record<string, unknown>>> {
  exactObject(input, [
    'repositoryRoot',
    'nativeAuthoritySha256',
    'rootNonceSha256',
  ])
  const repositoryRoot = safeRoot(input.repositoryRoot)
  const nativeAuthoritySha256 = sha256(input.nativeAuthoritySha256)
  const rootNonceSha256 = sha256(input.rootNonceSha256)
  const workerSha256 = hash(await readFile(lockWorkerPath))
  await commandLockCapabilityProbe(repositoryRoot, workerSha256)
  const custody = await openDerivationLock(repositoryRoot)
  try {
    await validateNamedLock(custody.lock, custody.lockPath, custody.identity)
    const authority = await runPolicyNativeToolchainDerivation({
      repositoryRoot,
      nativeAuthoritySha256,
    })
    await validateNamedLock(custody.lock, custody.lockPath, custody.identity)
    const result = await buildAndCleanupA(
      repositoryRoot,
      rootNonceSha256,
      authority,
      custody,
    )
    await validateNamedLock(custody.lock, custody.lockPath, custody.identity)
    return Object.freeze(result)
  } finally {
    await closeDerivationLock(custody)
  }
}

/**
 * Decision 111 B is deliberately one bridge-owned command.  The returned
 * object is a completed, structural authority result; callers never receive
 * the temporary candidate capability, its session, a helper capability, or a
 * launch plan.
 */
async function runPolicyProvisionalBuildWorkflow(
  input: unknown,
  workflow: 'B-candidate' | 'C-accepted',
): Promise<Readonly<Record<string, unknown>>> {
  exactObject(
    input,
    workflow === 'B-candidate'
      ? [
          'repositoryRoot',
          'nativeAuthoritySha256',
          'rootNonceSha256',
          'cleanedStageAPackage',
        ]
      : [
          'repositoryRoot',
          'nativeAuthoritySha256',
          'rootNonceSha256',
          'acceptedLiterals',
          'cleanedStageAPackage',
          'cleanedStageBPackage',
        ],
  )
  const repositoryRoot = safeRoot(input.repositoryRoot)
  const nativeAuthoritySha256 = sha256(input.nativeAuthoritySha256)
  const rootNonceSha256 = sha256(input.rootNonceSha256)
  const comparison =
    workflow === 'B-candidate'
      ? input.cleanedStageAPackage
      : input.acceptedLiterals
  exactObject(comparison, [
    'schema',
    'version',
    'stage',
    'rootIdentitySha256',
    'material',
    'preflightAuthoritySha256',
    'reviewAuthoritySha256',
    'cleanupProved',
    'packageSha256',
  ])
  const { packageSha256: comparisonHash, ...stageACore } = comparison
  if (
    stageACore.schema !== 'policy-exclusive-promotion-provenance.v1' ||
    stageACore.version !== 1 ||
    stageACore.stage !== (workflow === 'B-candidate' ? 'A' : 'accepted') ||
    (workflow === 'B-candidate'
      ? stageACore.preflightAuthoritySha256 !== null ||
        stageACore.reviewAuthoritySha256 !== null
      : stageACore.preflightAuthoritySha256 === null ||
        stageACore.reviewAuthoritySha256 === null) ||
    stageACore.cleanupProved !== true ||
    (workflow === 'B-candidate' &&
      sha256(stageACore.rootIdentitySha256) === rootNonceSha256) ||
    sha256(comparisonHash) !== hashAuthority(stageACore)
  )
    throw new Error('policy-native-authority')
  let aRootIdentitySha256 =
    workflow === 'B-candidate'
      ? sha256(stageACore.rootIdentitySha256)
      : '0'.repeat(64)
  let bRootIdentitySha256: string | undefined
  if (workflow === 'C-accepted') {
    for (const [value, stage] of [
      [input.cleanedStageAPackage, 'A'],
      [input.cleanedStageBPackage, 'B'],
    ] as const) {
      exactObject(value, [
        'schema',
        'version',
        'stage',
        'rootIdentitySha256',
        'material',
        'preflightAuthoritySha256',
        'reviewAuthoritySha256',
        'cleanupProved',
        'packageSha256',
      ])
      const { packageSha256, ...core } = value
      if (
        core.schema !== 'policy-exclusive-promotion-provenance.v1' ||
        core.version !== 1 ||
        core.stage !== stage ||
        core.rootIdentitySha256 === null ||
        core.cleanupProved !== true ||
        (stage === 'A'
          ? core.preflightAuthoritySha256 !== null ||
            core.reviewAuthoritySha256 !== null
          : core.preflightAuthoritySha256 !==
              stageACore.preflightAuthoritySha256 ||
            core.reviewAuthoritySha256 !== null) ||
        canonical(core.material) !== canonical(stageACore.material) ||
        sha256(packageSha256) !== hashAuthority(core)
      )
        throw new Error('policy-native-authority')
      if (stage === 'A') aRootIdentitySha256 = sha256(core.rootIdentitySha256)
      else bRootIdentitySha256 = sha256(core.rootIdentitySha256)
    }
  }

  // This is the distinct, ephemeral D106 command.  It is intentionally
  // complete before the derivation lock is opened; its core is consumed only
  // by the immediately following B command below.
  const workerSha256 = hash(await readFile(lockWorkerPath))
  const capabilityProbe = await commandLockCapabilityProbe(
    repositoryRoot,
    workerSha256,
  )
  const custody = await openDerivationLock(repositoryRoot)
  const m45Path = join(repositoryRoot, '.local/m45')
  const buildPath = join(m45Path, '.policy-exclusive-promotion-build')
  const tmpPath = join(buildPath, 'tmp')
  const sourcePath = join(buildPath, 'exclusive-promotion-helper.c')
  const helperPath = join(buildPath, 'exclusive-promotion-helper')
  const preflightPath = join(m45Path, '.policy-exclusive-promotion-preflight')
  let session: object | undefined
  let cleanupSession: object | undefined
  let checkpoint = 'B0'
  let cleanupFailure: (() => Promise<void>) | undefined
  let lastChildExitCode: number | undefined
  let terminalHelperByteDrift = false
  let aclMutationInFlight = false
  let lastOperationFamily = 'setup'
  let lastOperationIndex = 0
  let lastChildLaunched = false
  let lastCleanupTargetPath: string | undefined
  let candidateHelperSha256: string | undefined
  let candidateSourceSha256: string | undefined
  let cleanupPhase = false
  let terminalLaunched = false
  let recoveryCheckpointSha256: string | undefined
  let cleanupRowPoststate = false
  const safeFailure = (
    status:
      | 'cleaned-no-authority'
      | 'classified-residue-preserved'
      | 'ambiguous-residue-preserved'
      | 'cleanup-close-ambiguous-process-termination-required',
    category?:
      | 'b-build-prefix'
      | 'b-preflight-setup-prefix'
      | 'b-preflight-initial'
      | 'b-cleanup-row-retained'
      | 'b-terminal-helper-unlinked'
      | 'b-terminal-root-removed-unproved'
      | 'c-build-prefix'
      | 'c-preflight-setup-prefix'
      | 'c-preflight-initial'
      | 'c-cleanup-row-retained'
      | 'c-terminal-helper-unlinked'
      | 'c-terminal-root-removed-unproved',
  ) =>
    Object.freeze({
      schema:
        workflow === 'B-candidate'
          ? 'policy-b-safe-outcome.v1'
          : 'policy-c-safe-outcome.v1',
      status,
      category,
    })
  const workflowCategory = (value: string) =>
    (workflow === 'B-candidate' ? value : value.replace(/^b-/u, 'c-')) as
      | 'b-build-prefix'
      | 'b-preflight-setup-prefix'
      | 'b-preflight-initial'
      | 'b-cleanup-row-retained'
      | 'b-terminal-helper-unlinked'
      | 'b-terminal-root-removed-unproved'
      | 'c-build-prefix'
      | 'c-preflight-setup-prefix'
      | 'c-preflight-initial'
      | 'c-cleanup-row-retained'
      | 'c-terminal-helper-unlinked'
      | 'c-terminal-root-removed-unproved'
  try {
    await validateNamedLock(custody.lock, custody.lockPath, custody.identity)
    const heldContender = closedContender(
      await broker.runLockContender(
        { repositoryRoot, workerSha256 },
        workerSha256,
      ),
      20,
    )
    await validateNamedLock(custody.lock, custody.lockPath, custody.identity)

    const authority = await runPolicyNativeToolchainDerivation({
      repositoryRoot,
      nativeAuthoritySha256,
    })
    const materialKeys = [
      'xcrunSha256',
      'xcrunDevice',
      'xcrunInode',
      'sourceSha256',
      'compilerSha256',
      'compilerDevice',
      'compilerInode',
      'sdkIdentitySha256',
      'sdkDevice',
      'sdkInode',
      'headerSetSha256',
      'diagnosticSha256',
      'compileContractSha256',
      'launchContractSha256',
      'launcherSha256',
      'nativeAuthoritySha256',
      'lockPreflightWorkerSha256',
    ] as const
    for (const key of materialKeys)
      if (
        authority[key] !== (stageACore.material as Record<string, unknown>)[key]
      )
        throw new Error('policy-native-authority')
    if (authority.lockPreflightWorkerSha256 !== workerSha256)
      throw new Error('policy-native-authority')

    await mkdir(buildPath, { mode: 0o700 })
    await chmod(buildPath, 0o700)
    checkpoint = 'B1'
    await mkdir(tmpPath, { mode: 0o700 })
    await chmod(tmpPath, 0o700)
    checkpoint = 'B2'
    const source = await readFile(helperSourcePath)
    await writeFile(sourcePath, source, { flag: 'wx', mode: 0o400 })
    await chmod(sourcePath, 0o400)
    checkpoint = 'B3'
    const build = await broker.runCompilerBuild({
      repositoryRoot,
      compilerPath: safeRoot(authority.compilerPath),
      sdkRoot: safeRoot(authority.sdkRoot),
      authorityPackage: authority,
    })
    if (build.code !== 0 || !build.processGroupAbsent || !build.streamsClosed)
      throw new Error('policy-native-authority')
    await validateNamedLock(custody.lock, custody.lockPath, custody.identity)
    await chmod(helperPath, 0o500)
    const [buildStat, tmpStat, sourceStat, helperStat] = await Promise.all([
      lstat(buildPath),
      lstat(tmpPath),
      lstat(sourcePath),
      lstat(helperPath),
    ])
    if (
      !buildStat.isDirectory() ||
      buildStat.nlink !== 5 ||
      (buildStat.mode & 0o7777) !== 0o700 ||
      !tmpStat.isDirectory() ||
      tmpStat.nlink !== 2 ||
      !sourceStat.isFile() ||
      sourceStat.nlink !== 1 ||
      (sourceStat.mode & 0o7777) !== 0o400 ||
      !helperStat.isFile() ||
      helperStat.nlink !== 1 ||
      helperStat.size <= 0 ||
      (helperStat.mode & 0o7777) !== 0o500 ||
      canonical((await readdir(buildPath)).sort()) !==
        canonical([
          'exclusive-promotion-helper',
          'exclusive-promotion-helper.c',
          'tmp',
        ])
    )
      throw new Error('policy-native-authority')

    let helper: FileHandle | undefined = await open(
      helperPath,
      fsConstants.O_RDONLY | darwinFlags.noFollow | darwinFlags.closeOnExec,
    )
    try {
      const helperBytes = await completeHeldBytes(helper, helperStat.size)
      const helperSha256 = hash(helperBytes)
      if (
        helperSha256 !==
        (stageACore.material as Record<string, unknown>).helperSha256
      )
        throw new Error('policy-native-authority')
      const heldEvidence = {
        'command-lock': {
          role: 'command-lock',
          path: custody.lockPath,
          ...metadataEvidence(await custody.lock.stat()),
          sha256: null,
        },
        'build-root': {
          role: 'build-root',
          path: buildPath,
          ...metadataEvidence(buildStat),
          sha256: null,
        },
        'build-tmp': {
          role: 'build-tmp',
          path: tmpPath,
          ...metadataEvidence(tmpStat),
          sha256: null,
        },
        'build-source': {
          role: 'build-source',
          path: sourcePath,
          ...metadataEvidence(sourceStat),
          sha256: hash(await readFile(sourcePath)),
        },
        'build-helper': {
          role: 'build-helper',
          path: helperPath,
          ...metadataEvidence(helperStat),
          sha256: helperSha256,
        },
      }
      const heldWithHashes = Object.fromEntries(
        Object.entries(heldEvidence).map(([role, value]) => {
          const core = value as Record<string, unknown>
          return [role, { ...core, evidenceSha256: hashAuthority(core) }]
        }),
      )
      const freshRootIdentitySha256 = hashAuthority({
        nonce: rootNonceSha256,
        device: String(buildStat.dev),
        inode: String(buildStat.ino),
      })
      if (
        freshRootIdentitySha256 === aRootIdentitySha256 ||
        freshRootIdentitySha256 === bRootIdentitySha256
      )
        throw new Error('policy-native-authority')
      const trackedCommitments = {
        sourceSha256: authority.sourceSha256,
        launchContractSha256: authority.launchContractSha256,
        launcherSha256: authority.launcherSha256,
        nativeAuthoritySha256: authority.nativeAuthoritySha256,
        lockPreflightWorkerSha256: authority.lockPreflightWorkerSha256,
      }
      const buildInventorySha256 = hashAuthority([
        'exclusive-promotion-helper',
        'exclusive-promotion-helper.c',
        'tmp',
      ])
      if (workflow === 'B-candidate') {
        const candidateCore = {
          schema: 'policy-b-candidate-helper-launch.v1',
          version: 1,
          stage: 'B-candidate',
          repositoryRoot,
          cleanedStageAPackage: comparison,
          bRootIdentitySha256: freshRootIdentitySha256,
          heldEvidence: heldWithHashes,
          buildInventorySha256,
          trackedCommitments,
        }
        session = broker.beginBCandidateSession({
          ...candidateCore,
          candidateHelperSha256: hashAuthority(candidateCore),
        })
      } else {
        const cCore = {
          schema: 'policy-c-accepted-helper-launch.v1',
          version: 1,
          workflow,
          repositoryRoot,
          acceptedLiterals: comparison,
          aRootIdentitySha256,
          bRootIdentitySha256,
          cRootIdentitySha256: freshRootIdentitySha256,
          heldEvidence: heldWithHashes,
          buildInventorySha256,
          trackedCommitments,
        }
        session = broker.beginCAcceptedSession({
          ...cCore,
          cAcceptedHelperLaunchSha256: hashAuthority(cCore),
        })
      }
      candidateHelperSha256 = helperSha256
      candidateSourceSha256 = sha256(authority.sourceSha256)
      checkpoint = 'B4'
      await helper.close()
      helper = undefined

      // The candidate can only execute the closed preflight/cleanup matrix.
      const runCandidateWith = async (
        activeSession: object,
        cleanupOnly: boolean,
        highest: 3 | 6,
        prepare: (
          openChildAuthority: (
            path: string,
            flags: number,
          ) => Promise<FileHandle>,
        ) => Promise<unknown>,
        accepted = 0,
      ) =>
        runBCandidateOperation({
          highest,
          cleanupOnly,
          withChild: (target, run) => withChildFillers(custody, target, run),
          prepare,
          runOperation: async (operation, cleanup) =>
            workflow === 'B-candidate'
              ? cleanup
                ? broker.runBCandidateCleanup(activeSession, operation)
                : broker.runBCandidateHelper(activeSession, operation)
              : cleanup
                ? broker.runCAcceptedCleanup(activeSession, operation)
                : broker.runCAcceptedHelper(activeSession, operation),
          validateLock: () =>
            validateNamedLock(custody.lock, custody.lockPath, custody.identity),
          onStart: () => {
            lastChildExitCode = undefined
            lastChildLaunched = false
          },
          onOperation: (operation) => {
            lastOperationFamily =
              operation !== null &&
              typeof operation === 'object' &&
              'kind' in operation &&
              typeof operation.kind === 'string'
                ? operation.kind
                : 'unknown'
            lastOperationIndex += 1
          },
          onLaunched: () => {
            lastChildLaunched = true
          },
          onClosed: (current) => {
            lastChildExitCode = current.code
          },
          accepted,
        })
      const runCandidate = (
        highest: 3 | 6,
        prepare: Parameters<typeof runCandidateWith>[3],
        accepted = 0,
      ) => {
        if (session === undefined) throw new Error('policy-native-authority')
        return runCandidateWith(session, false, highest, prepare, accepted)
      }
      const runCleanupCandidate = (
        highest: 3 | 6,
        prepare: Parameters<typeof runCandidateWith>[3],
        accepted = 0,
      ) => {
        if (cleanupSession === undefined)
          throw new Error('policy-native-authority')
        return runCandidateWith(
          cleanupSession,
          true,
          highest,
          prepare,
          accepted,
        )
      }
      const childReadFlags =
        fsConstants.O_RDONLY | darwinFlags.noFollow | darwinFlags.closeOnExec
      const childDirectoryFlags = childReadFlags | fsConstants.O_DIRECTORY
      for (const [role, path, flags] of [
        ['command-lock', undefined, undefined],
        ['build-root', buildPath, childDirectoryFlags],
        ['build-tmp', tmpPath, childDirectoryFlags],
        ['build-source', sourcePath, childReadFlags],
        ['build-helper', helperPath, childReadFlags],
      ] as const)
        await runCandidate(3, async (openChildAuthority) => {
          const handle =
            path === undefined || flags === undefined
              ? custody.lock
              : await openChildAuthority(path, flags)
          return {
            kind: 'metadata-check',
            role,
            evidence: metadataEvidence(await handle.stat()),
            authorityFd: handle.fd,
          }
        })

      // The following public fixture root is the only B preflight mutation.
      // Its fixed names and bytes are duplicated here (not caller input).
      await mkdir(preflightPath, { mode: 0o700 })
      await chmod(preflightPath, 0o700)
      checkpoint = 'P1'
      const addFixtureDirectory = async (
        name: string,
        contents: string,
        directoryCheckpoint: string,
        fixtureCheckpoint: string,
      ) => {
        const directory = join(preflightPath, name)
        await mkdir(directory, { mode: 0o700 })
        await chmod(directory, 0o700)
        checkpoint = directoryCheckpoint
        await writeFile(join(directory, 'fixture.bin'), contents, {
          flag: 'wx',
          mode: 0o600,
        })
        await chmod(join(directory, 'fixture.bin'), 0o600)
        checkpoint = fixtureCheckpoint
      }
      await addFixtureDirectory(
        'success-source',
        'zedarchive-m45-exclusive-success-source-v1\n',
        'P2',
        'P3',
      )
      await mkdir(join(preflightPath, 'success-source/promotion'), {
        mode: 0o700,
      })
      checkpoint = 'P4'
      await addFixtureDirectory(
        'success-destination',
        'zedarchive-m45-exclusive-success-destination-v1\n',
        'P5',
        'P6',
      )
      await addFixtureDirectory(
        'collision-source',
        'zedarchive-m45-exclusive-collision-source-v1\n',
        'P7',
        'P8',
      )
      await mkdir(join(preflightPath, 'collision-source/promotion'), {
        mode: 0o700,
      })
      checkpoint = 'P9'
      await addFixtureDirectory(
        'collision-destination',
        'zedarchive-m45-exclusive-collision-destination-v1\n',
        'P10',
        'P11',
      )
      await mkdir(join(preflightPath, 'collision-destination/promotion'), {
        mode: 0o700,
      })
      checkpoint = 'P12'
      const aclPath = join(preflightPath, 'acl-fixture')
      await mkdir(aclPath, { mode: 0o700 })
      await chmod(aclPath, 0o700)
      checkpoint = 'P13'
      const runPreflightMetadata = async (
        role: 'preflight-root' | 'preflight-directory' | 'preflight-file',
        path: string,
        flags: number,
        accepted = 0,
      ) =>
        runCandidate(
          3,
          async (openChildAuthority) => {
            const handle = await openChildAuthority(path, flags)
            return {
              kind: 'metadata-check',
              role,
              evidence: metadataEvidence(await handle.stat()),
              authorityFd: handle.fd,
            }
          },
          accepted,
        )
      const runAclFixture = async (action: 'install' | 'remove') =>
        runCandidate(3, async (openChildAuthority) => {
          const handle = await openChildAuthority(aclPath, childDirectoryFlags)
          const stat = await handle.stat()
          return {
            kind: 'acl-fixture',
            action,
            uid: String(stat.uid),
            device: String(stat.dev),
            inode: String(stat.ino),
            authorityFd: handle.fd,
          }
        })
      // The native preflight mode owns the exact four-FD map. Every authority
      // descriptor is opened only after its fresh FD-6 fillers are in place.
      const promotion = async (outcome: 'success' | 'collision') => {
        const sourceName =
          outcome === 'success' ? 'success-source' : 'collision-source'
        const destinationName =
          outcome === 'success'
            ? 'success-destination'
            : 'collision-destination'
        await runCandidate(
          6,
          async (openChildAuthority) => {
            const sourceParent = await openChildAuthority(
              join(preflightPath, sourceName),
              childDirectoryFlags,
            )
            const destinationParent = await openChildAuthority(
              join(preflightPath, destinationName),
              childDirectoryFlags,
            )
            const sourcePromotion = await openChildAuthority(
              join(preflightPath, `${sourceName}/promotion`),
              childDirectoryFlags,
            )
            const sourceFixture = await openChildAuthority(
              join(preflightPath, `${sourceName}/fixture.bin`),
              childReadFlags,
            )
            const destinationFixture = await openChildAuthority(
              join(preflightPath, `${destinationName}/fixture.bin`),
              childReadFlags,
            )
            const [sourceStat, destinationStat, promotionStat] =
              await Promise.all([
                sourceParent.stat(),
                destinationParent.stat(),
                sourcePromotion.stat(),
              ])
            const [sourceFixtureStat, destinationFixtureStat] =
              await Promise.all([
                sourceFixture.stat(),
                destinationFixture.stat(),
              ])
            const expectedSource = hash(
              await completeHeldBytes(sourceFixture, sourceFixtureStat.size),
            )
            const expectedDestination = hash(
              await completeHeldBytes(
                destinationFixture,
                destinationFixtureStat.size,
              ),
            )
            const collision =
              outcome === 'collision'
                ? await lstat(
                    join(preflightPath, `${destinationName}/promotion`),
                  )
                : undefined
            return {
              operation: {
                kind: 'preflight-promotion',
                outcome,
                sourceParent: {
                  device: String(sourceStat.dev),
                  inode: String(sourceStat.ino),
                  beforeLinks: String(sourceStat.nlink),
                  afterLinks:
                    outcome === 'success' ? '3' : String(sourceStat.nlink),
                },
                destinationParent: {
                  device: String(destinationStat.dev),
                  inode: String(destinationStat.ino),
                  beforeLinks: String(destinationStat.nlink),
                  afterLinks:
                    outcome === 'success' ? '4' : String(destinationStat.nlink),
                },
                sourcePromotion: {
                  device: String(promotionStat.dev),
                  inode: String(promotionStat.ino),
                  links: String(promotionStat.nlink),
                },
                collisionDestination: collision
                  ? {
                      device: String(collision.dev),
                      inode: String(collision.ino),
                      links: String(collision.nlink),
                    }
                  : { device: '0', inode: '0', links: '0' },
                commonDevice: String(sourceStat.dev),
                commandLockFd: custody.lock.fd,
                sourceParentFd: sourceParent.fd,
                destinationParentFd: destinationParent.fd,
                sourcePromotionFd: sourcePromotion.fd,
              },
              postcheck: async () => {
                if (
                  hash(
                    await completeHeldBytes(
                      sourceFixture,
                      sourceFixtureStat.size,
                    ),
                  ) !== expectedSource ||
                  hash(
                    await completeHeldBytes(
                      destinationFixture,
                      destinationFixtureStat.size,
                    ),
                  ) !== expectedDestination ||
                  (
                    await lstat(
                      join(preflightPath, `${sourceName}/fixture.bin`),
                    )
                  ).ino !== sourceFixtureStat.ino ||
                  (
                    await lstat(
                      join(preflightPath, `${destinationName}/fixture.bin`),
                    )
                  ).ino !== destinationFixtureStat.ino
                )
                  throw new Error('policy-native-authority')
              },
            }
          },
          outcome === 'success' ? 0 : 10,
        )
      }
      // Fail closed: deletion rows are delegated to the helper, so any stale
      // public fixture is a terminal error rather than a JavaScript cleanup.
      const deleteRow = async (
        role: string,
        parentPath: string,
        childName: string,
        runner = runCandidate,
      ) =>
        runner(3, async (openChildAuthority) => {
          lastCleanupTargetPath = join(parentPath, childName)
          const parent = await openChildAuthority(
            parentPath,
            childDirectoryFlags,
          )
          const child = await openChildAuthority(
            join(parentPath, childName),
            childReadFlags |
              (childName === 'promotion' ? fsConstants.O_DIRECTORY : 0),
          )
          return {
            kind: 'delete-entry',
            role,
            parent: metadataEvidence(await parent.stat()),
            child: metadataEvidence(await child.stat()),
            commandLockFd: custody.lock.fd,
            parentFd: parent.fd,
            childFd: child.fd,
          }
        })
      const preflightCleanupRows = [
        [
          'preflight-success-destination-promotion',
          'success-destination',
          'promotion',
        ],
        [
          'preflight-collision-source-promotion',
          'collision-source',
          'promotion',
        ],
        [
          'preflight-collision-destination-promotion',
          'collision-destination',
          'promotion',
        ],
        ['preflight-success-source-file', 'success-source', 'fixture.bin'],
        [
          'preflight-success-destination-file',
          'success-destination',
          'fixture.bin',
        ],
        ['preflight-collision-source-file', 'collision-source', 'fixture.bin'],
        [
          'preflight-collision-destination-file',
          'collision-destination',
          'fixture.bin',
        ],
        ['preflight-success-source-directory', '', 'success-source'],
        ['preflight-success-destination-directory', '', 'success-destination'],
        ['preflight-collision-source-directory', '', 'collision-source'],
        [
          'preflight-collision-destination-directory',
          '',
          'collision-destination',
        ],
        ['preflight-acl-fixture-directory', '', 'acl-fixture'],
        ['preflight-root', '..', '.policy-exclusive-promotion-preflight'],
      ] as const
      const runPreflightCleanupRows = async (
        rows: readonly (readonly [string, string, string])[],
        runner = runCandidate,
        checkpoints: readonly string[] = [
          'R01s',
          'R02',
          'R03',
          'R04',
          'R05',
          'R06',
          'R07',
          'R08',
          'R09',
          'R10',
          'R11',
          'R12',
          'R13',
        ],
      ) => {
        for (const [index, [role, parent, child]] of rows.entries()) {
          checkpoint = checkpoints[index] ?? checkpoint
          await deleteRow(
            role,
            parent === '..'
              ? m45Path
              : parent === ''
                ? preflightPath
                : join(preflightPath, parent),
            child,
            runner,
          )
        }
      }

      const deleteCandidateBuild = async (
        role: 'build-source' | 'build-tmp',
        runner = runCandidate,
      ) => {
        const name =
          role === 'build-source' ? 'exclusive-promotion-helper.c' : 'tmp'
        lastCleanupTargetPath = join(buildPath, name)
        await runner(3, async (openChildAuthority) => {
          const parent = await openChildAuthority(
            buildPath,
            childDirectoryFlags,
          )
          const child = await openChildAuthority(
            join(buildPath, name),
            childReadFlags |
              (role === 'build-tmp' ? fsConstants.O_DIRECTORY : 0),
          )
          return {
            kind: 'delete-entry',
            role,
            parent: metadataEvidence(await parent.stat()),
            child: metadataEvidence(await child.stat()),
            commandLockFd: custody.lock.fd,
            parentFd: parent.fd,
            childFd: child.fd,
          }
        })
      }
      const runTerminalCleanup = async (runner = runCandidate) =>
        runner(6, async (openChildAuthority) => {
          terminalLaunched = true
          const parent = await openChildAuthority(m45Path, childDirectoryFlags)
          const buildRootForChild = await openChildAuthority(
            buildPath,
            childDirectoryFlags,
          )
          const helperForChild = await openChildAuthority(
            helperPath,
            childReadFlags,
          )
          const [parentBefore, buildBefore, helperBefore] = await Promise.all([
            parent.stat(),
            buildRootForChild.stat(),
            helperForChild.stat(),
          ])
          if (
            hash(await completeHeldBytes(helperForChild, helperBefore.size)) !==
            helperSha256
          ) {
            terminalHelperByteDrift = true
            throw new Error('policy-native-authority')
          }
          return {
            operation: {
              kind: 'delete-build-terminal',
              parent: metadataEvidence(parentBefore),
              buildRoot: metadataEvidence(buildBefore),
              helper: metadataEvidence(helperBefore),
              commandLockFd: custody.lock.fd,
              parentFd: parent.fd,
              buildRootFd: buildRootForChild.fd,
              helperFd: helperForChild.fd,
            },
            postcheck: async () => {
              if (
                hash(
                  await completeHeldBytes(helperForChild, helperBefore.size),
                ) !== helperSha256
              ) {
                terminalHelperByteDrift = true
                throw new Error('policy-native-authority')
              }
            },
          }
        })

      const initialCleanupRows = [
        ['preflight-success-source-promotion', 'success-source', 'promotion'],
        ...preflightCleanupRows.slice(1),
      ] as const
      cleanupFailure = async () => {
        if (recoveryCheckpointSha256 === undefined)
          throw new Error('policy-native-authority')
        const cleanupCheckpoint =
          checkpoint === 'P13' || checkpoint === 'O1'
            ? checkpoint
            : checkpoint === 'O2' || checkpoint === 'O3'
              ? checkpoint
              : checkpoint
        if (cleanupSession === undefined) {
          if (session === undefined) throw new Error('policy-native-authority')
          cleanupSession =
            workflow === 'B-candidate'
              ? transitionBCandidateToCleanup({
                  broker,
                  session,
                  checkpoint: cleanupCheckpoint,
                  checkpointSha256: recoveryCheckpointSha256,
                  childLaunched: lastChildLaunched,
                  failedOperationFamily: lastOperationFamily,
                  failedOperationIndex: lastOperationIndex,
                })
              : broker.beginCAcceptedCleanup(session, {
                  workflow: 'C-accepted',
                  checkpoint: cleanupCheckpoint,
                  checkpointSha256: recoveryCheckpointSha256,
                  checkpointWorkflow: 'C-accepted',
                  childLaunched: lastChildLaunched,
                  failedOperationFamily: lastOperationFamily,
                  failedOperationIndex: lastOperationIndex,
                  lifecycleClosed: true,
                })
          session = undefined
          cleanupPhase = true
        }
        if (cleanupCheckpoint === 'O1') {
          await runCleanupCandidate(3, async (openChildAuthority) => {
            const handle = await openChildAuthority(
              aclPath,
              childDirectoryFlags,
            )
            const stat = await handle.stat()
            return {
              kind: 'acl-fixture',
              action: 'remove',
              uid: String(stat.uid),
              device: String(stat.dev),
              inode: String(stat.ino),
              authorityFd: handle.fd,
            }
          })
          checkpoint = 'P13'
        }
        if (checkpoint === 'P13')
          await runPreflightCleanupRows(
            initialCleanupRows,
            runCleanupCandidate,
            [
              'R01i',
              'R02',
              'R03',
              'R04',
              'R05',
              'R06',
              'R07',
              'R08',
              'R09',
              'R10',
              'R11',
              'R12',
              'R13',
            ],
          )
        else if (checkpoint === 'O2' || checkpoint === 'O3')
          await runPreflightCleanupRows(
            preflightCleanupRows,
            runCleanupCandidate,
          )
        else if (/^R(?:01s|0[2-9]|1[0-3])$/u.test(checkpoint)) {
          const rowIds = [
            'R01s',
            'R02',
            'R03',
            'R04',
            'R05',
            'R06',
            'R07',
            'R08',
            'R09',
            'R10',
            'R11',
            'R12',
            'R13',
          ]
          const start = rowIds.indexOf(checkpoint)
          await runPreflightCleanupRows(
            preflightCleanupRows.slice(start),
            runCleanupCandidate,
            rowIds.slice(start),
          )
        } else if (!['R14', 'R15', 'R16', 'T0'].includes(checkpoint))
          throw new Error('policy-native-authority')
        if (!['R15', 'R16', 'T0'].includes(checkpoint)) {
          checkpoint = 'R14'
          await deleteCandidateBuild('build-source', runCleanupCandidate)
        }
        if (!['R16', 'T0'].includes(checkpoint)) {
          checkpoint = 'R15'
          await deleteCandidateBuild('build-tmp', runCleanupCandidate)
        }
        checkpoint = 'T0'
        await runTerminalCleanup(runCleanupCandidate)
        if (workflow === 'B-candidate')
          broker.closeBCandidateCleanup(cleanupSession)
        else broker.closeCAcceptedCleanup(cleanupSession)
        cleanupSession = undefined
        checkpoint = 'clean'
      }

      await runPreflightMetadata(
        'preflight-root',
        preflightPath,
        childDirectoryFlags,
      )
      await runPreflightMetadata(
        'preflight-directory',
        aclPath,
        childDirectoryFlags,
      )
      await runPreflightMetadata(
        'preflight-file',
        join(preflightPath, 'success-source/fixture.bin'),
        childReadFlags,
      )
      aclMutationInFlight = true
      await runAclFixture('install')
      aclMutationInFlight = false
      checkpoint = 'O1'
      await runPreflightMetadata(
        'preflight-directory',
        aclPath,
        childDirectoryFlags,
        15,
      )
      aclMutationInFlight = true
      await runAclFixture('remove')
      aclMutationInFlight = false
      checkpoint = 'P13'
      await promotion('success')
      checkpoint = 'O2'
      await promotion('collision')
      checkpoint = 'O3'

      checkpoint = 'R01s'
      await runPreflightCleanupRows(preflightCleanupRows)
      checkpoint = 'R14'
      await deleteCandidateBuild('build-source')
      checkpoint = 'R15'
      await deleteCandidateBuild('build-tmp')
      checkpoint = 'T0'
      await runTerminalCleanup()
      checkpoint = 'clean'
      if (workflow === 'B-candidate') broker.closeBCandidateSession(session)
      else broker.closeCAcceptedSession(session)
      session = undefined
      await validateNamedLock(custody.lock, custody.lockPath, custody.identity)
      for (const absentPath of [buildPath, preflightPath]) {
        try {
          await lstat(absentPath)
          throw new Error('policy-native-authority')
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
      }
      const [
        sourceAfter,
        contractAfter,
        launcherAfter,
        nativeAuthorityAfter,
        workerAfter,
      ] = await Promise.all([
        readFile(helperSourcePath),
        readFile(launchContractPath),
        readFile(launcherPath),
        readFile(nativeAuthorityPath),
        readFile(lockWorkerPath),
      ])
      if (
        hash(sourceAfter) !== authority.sourceSha256 ||
        hash(contractAfter) !== authority.launchContractSha256 ||
        hash(launcherAfter) !== authority.launcherSha256 ||
        hash(nativeAuthorityAfter) !== nativeAuthoritySha256 ||
        hash(workerAfter) !== authority.lockPreflightWorkerSha256 ||
        nativeAuthoritySha256 !== authority.nativeAuthoritySha256
      )
        throw new Error('policy-native-authority')
      const preflightCore = {
        schema: 'policy-exclusive-promotion-preflight.v1',
        version: 1,
        platform: 'darwin',
        device: custody.identity.device,
        volumeCapability: {
          validRenameExclusive: 1,
          supportedRenameExclusive: 1,
        },
        metadataRoleResults: [
          'build-root',
          'build-tmp',
          'build-source',
          'build-helper',
          'preflight-root',
          'preflight-directory',
          'preflight-file',
          'command-lock',
        ].map((role) => ({ role, exitCode: 0 })),
        fdPreflight: {
          singleAuthorityTargets: [3],
          doubleAuthorityTargets: [3, 4],
          tripleAuthorityTargets: [3, 4, 5],
          quadAuthorityTargets: [3, 4, 5, 6],
          unexpectedDescriptorCount: 0,
        },
        aclFixture: {
          installExitCode: 0,
          metadataRejectExitCode: 15,
          removeExitCode: 0,
        },
        promotion: {
          successExitCode: 0,
          collisionExitCode: 10,
          collisionSourceBeforeSha256: hash(
            Buffer.from('zedarchive-m45-exclusive-collision-source-v1\n'),
          ),
          collisionSourceAfterSha256: hash(
            Buffer.from('zedarchive-m45-exclusive-collision-source-v1\n'),
          ),
          collisionDestinationBeforeSha256: hash(
            Buffer.from('zedarchive-m45-exclusive-collision-destination-v1\n'),
          ),
          collisionDestinationAfterSha256: hash(
            Buffer.from('zedarchive-m45-exclusive-collision-destination-v1\n'),
          ),
        },
        apfsRegularFileDelete: {
          beforeEntryCount: 1,
          beforeLinks: 3,
          afterEntryCount: 0,
          afterLinks: 2,
        },
        apfsDirectoryDelete: {
          beforeEntryCount: 1,
          beforeLinks: 3,
          afterEntryCount: 0,
          afterLinks: 2,
        },
        commandLock: {
          workerSha256,
          before: custody.identity,
          heldContender,
          releasedContender: capabilityProbe.releasedContender,
          after: custody.identity,
          retentionIntervals: [
            'held-through-contender-close',
            'held-through-terminal-custody-decision',
          ],
        },
        cleanup: { remainingEntryCount: 0, rootAbsent: true },
      }
      const preflightAuthoritySha256 = hashAuthority(preflightCore)
      const resultCore = {
        schema: 'policy-exclusive-promotion-provenance.v1',
        version: 1,
        stage: workflow === 'B-candidate' ? 'B' : 'C',
        rootIdentitySha256: freshRootIdentitySha256,
        material: { ...(stageACore.material as Record<string, unknown>) },
        preflightAuthoritySha256,
        reviewAuthoritySha256:
          workflow === 'B-candidate' ? null : stageACore.reviewAuthoritySha256,
        cleanupProved: true,
      }
      if (
        workflow === 'C-accepted' &&
        preflightAuthoritySha256 === stageACore.preflightAuthoritySha256
      )
        throw new Error('policy-native-authority')
      return Object.freeze({
        preflight: { ...preflightCore, preflightAuthoritySha256 },
        package: { ...resultCore, packageSha256: hashAuthority(resultCore) },
      })
    } finally {
      await helper?.close()
    }
  } catch {
    // A branded cleanup session is admitted before reopening an eligible
    // post-child state. Its inspection prefix is read-only and does not advance
    // the fixed destructive suffix; generic helper capabilities never inspect
    // B or C failure state.
    if (
      session !== undefined &&
      !aclMutationInFlight &&
      (['P13', 'O1', 'O2', 'O3'].includes(checkpoint) ||
        /^(?:R|T0)/u.test(checkpoint))
    ) {
      const admission = {
        workflow,
        checkpoint,
        checkpointSha256: checkpointAuthoritySha256(workflow, {
          provisionalCheckpoint: checkpoint,
        }),
        checkpointWorkflow: workflow,
        childLaunched: lastChildLaunched,
        failedOperationFamily: lastOperationFamily,
        failedOperationIndex: lastOperationIndex,
        lifecycleClosed: true as const,
      }
      cleanupSession =
        workflow === 'B-candidate'
          ? transitionBCandidateToCleanup({
              broker,
              session,
              ...admission,
            })
          : broker.beginCAcceptedCleanup(session, admission)
      session = undefined
      cleanupPhase = true
    }
    const runBrandedInspection = async (
      prepare: (
        openChildAuthority: CandidateChildAuthority,
      ) => Promise<unknown>,
    ) => {
      if (cleanupSession === undefined)
        throw new Error('policy-native-authority')
      const result = await withChildFillers(
        custody,
        3,
        async (openChildAuthority) => {
          const operation = await prepare(openChildAuthority)
          return workflow === 'B-candidate'
            ? broker.runBCandidateCleanupInspection(cleanupSession!, operation)
            : broker.runCAcceptedCleanupInspection(cleanupSession!, operation)
        },
      )
      if (
        result.stdoutBytes !== 0 ||
        result.stderrBytes !== 0 ||
        !result.processGroupAbsent ||
        !result.streamsClosed
      )
        throw new Error('policy-native-authority')
      await validateNamedLock(custody.lock, custody.lockPath, custody.identity)
      return result
    }
    const zeroAcl = async (
      role: string,
      path: string,
      evidence: Readonly<Record<string, unknown>>,
    ): Promise<boolean> => {
      if (cleanupSession === undefined) return false
      const metadataRole =
        role === 'build'
          ? 'build-root'
          : role === 'tmp'
            ? 'build-tmp'
            : role === 'source'
              ? 'build-source'
              : role === 'helper'
                ? 'build-helper'
                : role === 'preflight'
                  ? 'preflight-root'
                  : role === 'command-lock'
                    ? 'command-lock'
                    : role.endsWith('.bin')
                      ? 'preflight-file'
                      : 'preflight-directory'
      const kind =
        role === 'command-lock' || evidence.kind === 'file'
          ? 'file'
          : 'directory'
      const expected = {
        uid: String(evidence.uid),
        device: String(evidence.device),
        inode: String(evidence.inode),
        links: String(evidence.links),
        mode: String(evidence.mode),
        size: String(evidence.size),
      }
      try {
        const result = await runBrandedInspection(
          async (openChildAuthority) => {
            const handle = await openChildAuthority(
              path,
              fsConstants.O_RDONLY |
                (kind === 'directory' ? fsConstants.O_DIRECTORY : 0) |
                darwinFlags.noFollow |
                darwinFlags.closeOnExec,
            )
            if (
              canonical(metadataEvidence(await handle.stat())) !==
              canonical(expected)
            )
              throw new Error('policy-native-authority')
            return {
              kind: 'metadata-check',
              role: metadataRole,
              evidence: expected,
              authorityFd: handle.fd,
            }
          },
        )
        return (
          result.code === 0 &&
          result.stdoutBytes === 0 &&
          result.stderrBytes === 0 &&
          result.processGroupAbsent &&
          result.streamsClosed
        )
      } catch {
        return false
      }
    }
    const inspectAcl = async (): Promise<'empty' | 'fixture' | 'ambiguous'> => {
      if (cleanupSession === undefined) return 'ambiguous'
      const aclPath = join(preflightPath, 'acl-fixture')
      const inspect = async (
        action: 'inspect-empty' | 'inspect-fixture',
      ): Promise<number | undefined> => {
        try {
          const result = await runBrandedInspection(
            async (openChildAuthority) => {
              const handle = await openChildAuthority(
                aclPath,
                fsConstants.O_RDONLY |
                  fsConstants.O_DIRECTORY |
                  darwinFlags.noFollow |
                  darwinFlags.closeOnExec,
              )
              const stat = await handle.stat()
              return {
                kind: 'acl-fixture',
                action,
                uid: String(stat.uid),
                device: String(stat.dev),
                inode: String(stat.ino),
                authorityFd: handle.fd,
              }
            },
          )
          if (
            result.stdoutBytes !== 0 ||
            result.stderrBytes !== 0 ||
            !result.processGroupAbsent ||
            !result.streamsClosed
          )
            return undefined
          return result.code
        } catch {
          return undefined
        }
      }
      if ((await inspect('inspect-empty')) === 0) return 'empty'
      return (await inspect('inspect-fixture')) === 0 ? 'fixture' : 'ambiguous'
    }
    const reopened =
      candidateHelperSha256 === undefined || candidateSourceSha256 === undefined
        ? undefined
        : await reopenBCandidateCheckpoint({
            workflow,
            repositoryRoot,
            custody,
            helperSha256: candidateHelperSha256,
            sourceSha256: candidateSourceSha256,
            cleanupPhase,
            terminalLaunched,
            failedOperationFamily: lastOperationFamily,
            failedCleanupTargetPath: lastCleanupTargetPath,
            zeroAcl,
            acl: inspectAcl,
          })
    if (reopened !== undefined) {
      const checkpointBeforeRecovery = checkpoint
      const recovered = classifyClosedCollisionCheckpoint(
        reopened,
        lastOperationFamily,
        lastChildExitCode,
        workflow,
      )
      checkpoint = recovered.checkpoint
      recoveryCheckpointSha256 = recovered.checkpointSha256
      cleanupRowPoststate =
        cleanupPhase && checkpointBeforeRecovery !== reopened.checkpoint
      if (cleanupSession !== undefined) {
        if (workflow === 'B-candidate')
          broker.rebaseBCandidateCleanup(cleanupSession, checkpoint)
        else
          broker.rebaseCAcceptedCleanup(
            cleanupSession,
            checkpoint,
            recoveryCheckpointSha256,
          )
      }
    }
    if (
      cleanupFailure !== undefined &&
      recoveryCheckpointSha256 !== undefined &&
      !aclMutationInFlight &&
      (['P13', 'O1', 'O2', 'O3'].includes(checkpoint) ||
        ((!lastChildLaunched || cleanupRowPoststate) &&
          /^(?:R|T0)/u.test(checkpoint)))
    ) {
      try {
        await cleanupFailure()
        await validateNamedLock(
          custody.lock,
          custody.lockPath,
          custody.identity,
        )
        return safeFailure('cleaned-no-authority')
      } catch {
        const checkpointBeforeCleanupRecovery = checkpoint
        const cleanupReopened =
          candidateHelperSha256 === undefined ||
          candidateSourceSha256 === undefined
            ? undefined
            : await reopenBCandidateCheckpoint({
                workflow,
                repositoryRoot,
                custody,
                helperSha256: candidateHelperSha256,
                sourceSha256: candidateSourceSha256,
                cleanupPhase: true,
                terminalLaunched,
                failedOperationFamily: lastOperationFamily,
                failedCleanupTargetPath: lastCleanupTargetPath,
                zeroAcl,
                acl: inspectAcl,
              })
        if (
          cleanupReopened !== undefined &&
          cleanupReopened.checkpoint !== checkpointBeforeCleanupRecovery
        ) {
          checkpoint = cleanupReopened.checkpoint
          recoveryCheckpointSha256 = cleanupReopened.checkpointSha256
          cleanupRowPoststate = true
          if (cleanupSession !== undefined) {
            if (workflow === 'B-candidate')
              broker.rebaseBCandidateCleanup(cleanupSession, checkpoint)
            else
              broker.rebaseCAcceptedCleanup(
                cleanupSession,
                checkpoint,
                recoveryCheckpointSha256,
              )
          }
          try {
            await cleanupFailure()
            await validateNamedLock(
              custody.lock,
              custody.lockPath,
              custody.identity,
            )
            return safeFailure('cleaned-no-authority')
          } catch {
            // The next failed row is retained below; it is not retried.
          }
        }
        if (cleanupSession !== undefined) {
          try {
            if (workflow === 'B-candidate')
              broker.abortBCandidateCleanup(cleanupSession)
            else broker.abortCAcceptedCleanup(cleanupSession)
          } catch {
            // A failed cleanup child may already have terminally closed it.
          }
          cleanupSession = undefined
        }
        return cleanupReopened === undefined
          ? safeFailure('ambiguous-residue-preserved')
          : safeFailure(
              'classified-residue-preserved',
              workflow === 'B-candidate'
                ? 'b-cleanup-row-retained'
                : 'c-cleanup-row-retained',
            )
      }
    }
    if (session !== undefined) {
      try {
        if (workflow === 'B-candidate') broker.abortBCandidateSession(session)
        else broker.abortCAcceptedSession(session)
      } catch {
        // A failed helper child may already have invalidated the active token.
      }
      session = undefined
    }
    if (aclMutationInFlight) return safeFailure('ambiguous-residue-preserved')
    if (/^B[0-4]$/u.test(checkpoint))
      return safeFailure(
        'classified-residue-preserved',
        workflowCategory('b-build-prefix'),
      )
    if (/^P(?:[1-9]|1[0-2])$/u.test(checkpoint))
      return safeFailure(
        'classified-residue-preserved',
        workflowCategory('b-preflight-setup-prefix'),
      )
    if (checkpoint === 'P13' || checkpoint === 'O1')
      return safeFailure(
        'classified-residue-preserved',
        workflowCategory('b-preflight-initial'),
      )
    if (checkpoint === 'T0' && !terminalHelperByteDrift) {
      if (lastChildExitCode === 18)
        return safeFailure(
          'classified-residue-preserved',
          workflowCategory('b-terminal-helper-unlinked'),
        )
      if (lastChildExitCode === 19)
        return safeFailure(
          'classified-residue-preserved',
          workflowCategory('b-terminal-root-removed-unproved'),
        )
    }
    if (/^(?:O[23]|R|T0)/u.test(checkpoint))
      return safeFailure(
        terminalHelperByteDrift
          ? 'ambiguous-residue-preserved'
          : 'classified-residue-preserved',
        terminalHelperByteDrift
          ? undefined
          : workflowCategory('b-cleanup-row-retained'),
      )
    return safeFailure('ambiguous-residue-preserved')
  } finally {
    try {
      await closeDerivationLock(custody)
    } catch {
      // This is terminal containment: the caller receives the exact D113
      // outcome and this process performs no subsequent child operation.
      return safeFailure('cleanup-close-ambiguous-process-termination-required')
    }
  }
}

export async function runPolicyProvisionalBuildB(
  input: unknown,
): Promise<Readonly<Record<string, unknown>>> {
  return runPolicyProvisionalBuildWorkflow(input, 'B-candidate')
}

/** Decision 114's fresh acceptance build shares only physical predicates. */
export async function runPolicyProvisionalBuildC(
  input: unknown,
): Promise<Readonly<Record<string, unknown>>> {
  return runPolicyProvisionalBuildWorkflow(input, 'C-accepted')
}

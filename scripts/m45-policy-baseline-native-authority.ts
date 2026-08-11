import { createHash } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readlink,
  realpath,
  readdir,
  rmdir,
  unlink,
  writeFile,
} from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
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
const fdAdmissionProbeSourcePath = fileURLToPath(
  new URL('./policy-baseline-review/fd-admission-probe.c', import.meta.url),
)
const fdAdmissionProbeScratchRoot =
  '/private/tmp/zedarchive-m45-fd-admission-probe'
const maxFdAdmissionProbeBytes = 16 * 1024 * 1024
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
const provisionalABuildResidue = Object.freeze({
  device: 16777231,
  build: Object.freeze({ inode: 13734817, mode: 0o700, links: 5, size: 160 }),
  source: Object.freeze({
    inode: 13734819,
    mode: 0o400,
    links: 1,
    size: 50_951,
    sha256: '74b743c5831911de3cc966307aef0aff6cf105678157b5b4ac66f49035110d37',
  }),
  helper: Object.freeze({
    inode: 13734827,
    mode: 0o500,
    links: 1,
    size: 53_736,
    sha256: '981a19d6b514e20892b4fedda6273d97f32712aac60c6943369de29bdeeaca99',
  }),
  tmp: Object.freeze({ inode: 13734818, mode: 0o700, links: 2, size: 64 }),
})
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
  'usr/include/sys/file.h',
  'usr/include/sys/stdio.h',
  'usr/include/dirent.h',
  'usr/include/fcntl.h',
  'usr/include/errno.h',
  'usr/include/stdint.h',
  'usr/include/stdlib.h',
  'usr/include/unistd.h',
  'usr/include/string.h',
] as const
const compilerResourceHeaderPaths = [
  'include/stdbool.h',
  'include/stdint.h',
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
    assertProtectedPathMetadata(metadata)
  }
  const metadata = await lstat(path)
  assertProtectedPathMetadata(metadata, kind)
  return metadata
}

export const policySdkProtectionStops = [
  'realpath-unavailable',
  'resolver-alias',
  'ancestor-symlink',
  'ancestor-owner',
  'ancestor-mode',
  'sdk-owner',
  'sdk-mode',
  'sdk-type',
  'sdk-link-count',
] as const

type SdkProtectionStop = (typeof policySdkProtectionStops)[number]

class SdkProtectedPathStopError extends Error {
  constructor(readonly stop: SdkProtectionStop) {
    super('policy-native-sdk-protection-stop')
  }
}

const sdkAliasFixtureCases = [
  'protected-alias',
  'protected-absolute-alias',
  'alias-owner',
  'alias-mode',
  'alias-links',
  'alias-target-empty',
  'alias-target-long',
  'alias-target-control',
  'alias-target-drift',
  'alias-identity-drift',
  'canonical-owner',
  'canonical-mode',
  'canonical-type',
  'canonical-identity-drift',
] as const

type SdkAliasFixtureCase = (typeof sdkAliasFixtureCases)[number]

export async function inspectPolicySdkProtectedPathForFixture(input: unknown) {
  if (
    process.env.NODE_ENV !== 'test' ||
    (input !== null &&
      (typeof input !== 'string' ||
        (!sdkAliasFixtureCases.includes(input as SdkAliasFixtureCase) &&
          !policySdkProtectionStops.includes(input as SdkProtectionStop))))
  )
    throw new Error('test-only')
  const fault = input as SdkProtectionStop | SdkAliasFixtureCase | null
  const sdkPath = '/fixture/sdk'
  const canonicalSdkPath = '/fixture/sdk-canonical'
  const aliasFixture =
    fault !== null &&
    sdkAliasFixtureCases.includes(fault as SdkAliasFixtureCase)
  const resolverSymlink = aliasFixture || fault === 'sdk-link-count'
  const statReads = new Map<string, number>()
  const metadata = (path: string) => {
    const statRead = (statReads.get(path) ?? 0) + 1
    statReads.set(path, statRead)
    const ancestor = path === '/fixture'
    const resolver = path === sdkPath
    const canonical = path === canonicalSdkPath
    const affected =
      fault !== null &&
      (ancestor ? fault.startsWith('ancestor-') : fault.startsWith('sdk-'))
    return {
      uid:
        (affected && (fault === 'ancestor-owner' || fault === 'sdk-owner')) ||
        (resolver && fault === 'alias-owner') ||
        (canonical && fault === 'canonical-owner')
          ? 501
          : 0,
      dev: 1,
      ino:
        (resolver && fault === 'alias-identity-drift' && statRead === 2) ||
        (canonical && fault === 'canonical-identity-drift' && statRead === 2)
          ? 2
          : 1,
      mode:
        resolverSymlink && resolver
          ? fault === 'alias-mode'
            ? 0o120755
            : 0o120777
          : (affected && (fault === 'ancestor-mode' || fault === 'sdk-mode')) ||
              (canonical && fault === 'canonical-mode')
            ? 0o40777
            : 0o40555,
      nlink:
        (fault === 'sdk-link-count' && !ancestor) ||
        (resolver && fault === 'alias-links')
          ? 2
          : 1,
      isSymbolicLink: () =>
        (affected && fault === 'ancestor-symlink') ||
        (resolverSymlink && resolver),
      isDirectory: () =>
        !(fault === 'sdk-type' && !ancestor) &&
        !(canonical && fault === 'canonical-type') &&
        !(resolverSymlink && resolver),
      isFile: () => fault === 'sdk-type' && !ancestor,
    } as Awaited<ReturnType<typeof lstat>>
  }
  let linkReads = 0
  try {
    const resolution = await inspectSdkProtectedPath(sdkPath, {
      realpath: (async () => {
        if (fault === 'realpath-unavailable') throw new Error('fixture')
        return fault === 'resolver-alias' || resolverSymlink
          ? canonicalSdkPath
          : sdkPath
      }) as unknown as typeof realpath,
      lstat: (async (path: string) => metadata(path)) as typeof lstat,
      readlink: (async () => {
        linkReads += 1
        if (fault === 'alias-target-empty') return ''
        if (fault === 'alias-target-long') return 'x'.repeat(4097)
        if (fault === 'alias-target-control') return 'sdk\ncanonical'
        if (fault === 'alias-target-drift' && linkReads === 2)
          return 'sdk-other'
        return fault === 'protected-absolute-alias'
          ? canonicalSdkPath
          : 'sdk-canonical'
      }) as unknown as typeof readlink,
    })
    return aliasFixture ? resolution.sdkRoot : null
  } catch (error) {
    if (error instanceof SdkProtectedPathStopError) return error.stop
    throw error
  }
}

async function inspectSdkProtectedPath(
  path: string,
  runtime: Readonly<{
    realpath: typeof realpath
    lstat: typeof lstat
    readlink: typeof readlink
  }> = { realpath, lstat, readlink },
) {
  const segments = path.split('/').filter(Boolean)
  let cursor = '/'
  for (const segment of segments.slice(0, -1)) {
    cursor = join(cursor, segment)
    const metadata = await runtime.lstat(cursor)
    if (metadata.isSymbolicLink())
      throw new SdkProtectedPathStopError('ancestor-symlink')
    if (Number(metadata.uid) !== 0)
      throw new SdkProtectedPathStopError('ancestor-owner')
    if ((Number(metadata.mode) & 0o7022) !== 0)
      throw new SdkProtectedPathStopError('ancestor-mode')
  }

  const resolverMetadata = await runtime.lstat(path)
  if (Number(resolverMetadata.uid) !== 0)
    throw new SdkProtectedPathStopError('sdk-owner')
  if (
    (resolverMetadata.isSymbolicLink() &&
      Number(resolverMetadata.nlink) !== 1) ||
    (resolverMetadata.isDirectory() && Number(resolverMetadata.nlink) < 1)
  )
    throw new SdkProtectedPathStopError('sdk-link-count')
  if (!resolverMetadata.isDirectory() && !resolverMetadata.isSymbolicLink())
    throw new SdkProtectedPathStopError('sdk-type')
  if (
    resolverMetadata.isDirectory() &&
    (Number(resolverMetadata.mode) & 0o7022) !== 0
  )
    throw new SdkProtectedPathStopError('sdk-mode')

  let resolverLinkSha256: string | null = null
  let linkBefore: string | undefined
  if (resolverMetadata.isSymbolicLink()) {
    linkBefore = await runtime.readlink(path, { encoding: 'utf8' })
    if (
      linkBefore.length === 0 ||
      Buffer.byteLength(linkBefore) > 4096 ||
      /[\0\r\n]/u.test(linkBefore)
    )
      throw new Error('policy-native-authority')
    resolverLinkSha256 = hash(Buffer.from(linkBefore))
  }

  let canonicalPath: string
  try {
    canonicalPath = safeRoot(await runtime.realpath(path))
  } catch (error) {
    if (error instanceof SdkProtectedPathStopError) throw error
    throw new SdkProtectedPathStopError('realpath-unavailable')
  }
  if (!resolverMetadata.isSymbolicLink() && canonicalPath !== path)
    throw new SdkProtectedPathStopError('resolver-alias')
  if (resolverMetadata.isSymbolicLink() && canonicalPath === path)
    throw new Error('policy-native-authority')

  let canonicalCursor = '/'
  let canonicalMetadataBefore: Awaited<ReturnType<typeof lstat>> | undefined
  for (const segment of canonicalPath.split('/').filter(Boolean)) {
    canonicalCursor = join(canonicalCursor, segment)
    const metadata = await runtime.lstat(canonicalCursor)
    assertProtectedPathMetadata(
      metadata,
      canonicalCursor === canonicalPath ? 'directory' : undefined,
    )
    if (canonicalCursor === canonicalPath) canonicalMetadataBefore = metadata
  }
  const sdkMetadata = await runtime.lstat(canonicalPath)
  assertProtectedPathMetadata(sdkMetadata, 'directory')
  if (
    canonicalMetadataBefore === undefined ||
    sdkMetadata.dev !== canonicalMetadataBefore.dev ||
    sdkMetadata.ino !== canonicalMetadataBefore.ino ||
    sdkMetadata.uid !== canonicalMetadataBefore.uid ||
    sdkMetadata.mode !== canonicalMetadataBefore.mode ||
    sdkMetadata.nlink !== canonicalMetadataBefore.nlink
  )
    throw new Error('policy-native-authority')

  if (linkBefore !== undefined) {
    const linkAfter = await runtime.readlink(path, { encoding: 'utf8' })
    if (linkAfter !== linkBefore) throw new Error('policy-native-authority')
  }
  const resolverAfter = await runtime.lstat(path)
  if (
    resolverAfter.dev !== resolverMetadata.dev ||
    resolverAfter.ino !== resolverMetadata.ino ||
    resolverAfter.uid !== resolverMetadata.uid ||
    resolverAfter.mode !== resolverMetadata.mode ||
    resolverAfter.nlink !== resolverMetadata.nlink ||
    resolverAfter.isSymbolicLink() !== resolverMetadata.isSymbolicLink() ||
    resolverAfter.isDirectory() !== resolverMetadata.isDirectory()
  )
    throw new Error('policy-native-authority')

  return Object.freeze({
    resolverPath: path,
    resolverKind: resolverMetadata.isSymbolicLink()
      ? ('symlink' as const)
      : ('directory' as const),
    resolverDevice: String(resolverMetadata.dev),
    resolverInode: String(resolverMetadata.ino),
    resolverMode: String(resolverMetadata.mode),
    resolverLinks: String(resolverMetadata.nlink),
    resolverLinkSha256,
    sdkRoot: canonicalPath,
    sdkMetadata,
  })
}

function sameSdkResolution(
  left: Awaited<ReturnType<typeof inspectSdkProtectedPath>>,
  right: Awaited<ReturnType<typeof inspectSdkProtectedPath>>,
): boolean {
  return (
    left.resolverPath === right.resolverPath &&
    left.resolverKind === right.resolverKind &&
    left.resolverDevice === right.resolverDevice &&
    left.resolverInode === right.resolverInode &&
    left.resolverMode === right.resolverMode &&
    left.resolverLinks === right.resolverLinks &&
    left.resolverLinkSha256 === right.resolverLinkSha256 &&
    left.sdkRoot === right.sdkRoot &&
    left.sdkMetadata.uid === right.sdkMetadata.uid &&
    left.sdkMetadata.dev === right.sdkMetadata.dev &&
    left.sdkMetadata.ino === right.sdkMetadata.ino &&
    left.sdkMetadata.mode === right.sdkMetadata.mode &&
    left.sdkMetadata.nlink === right.sdkMetadata.nlink
  )
}

function assertProtectedPathMetadata(
  metadata: Pick<
    Awaited<ReturnType<typeof lstat>>,
    'uid' | 'mode' | 'nlink' | 'isSymbolicLink' | 'isFile' | 'isDirectory'
  >,
  kind?: 'file' | 'directory',
): void {
  if (
    metadata.isSymbolicLink() ||
    Number(metadata.uid) !== 0 ||
    (Number(metadata.mode) & 0o7022) !== 0 ||
    (kind === 'file' && !metadata.isFile()) ||
    (kind === 'directory' && !metadata.isDirectory()) ||
    (kind !== undefined && Number(metadata.nlink) < 1)
  )
    throw new Error('policy-native-authority')
}
function successfulDiagnostic(result: {
  code: number
  stdout: Buffer
  stderr: Buffer
  processGroupAbsent: boolean
  streamsClosed: boolean
}) {
  if (result.code !== 0 || !result.processGroupAbsent || !result.streamsClosed)
    throw new Error('policy-native-authority')
  return result
}

type ProtectedHeaderRecord = Readonly<{
  namespace: 'sdk' | 'compiler-resource'
  relativePath: string
  rootDevice: string
  rootInode: string
  uid: string
  device: string
  inode: string
  mode: string
  links: string
  byteCount: number
  sha256: string
}>

function hashProtectedHeaderSet(
  records: readonly ProtectedHeaderRecord[],
): string {
  return hashAuthority({
    schema: 'policy-direct-header-set.v1',
    version: 1,
    records,
  })
}

async function readProtectedHeaders(
  runtime: Pick<
    ProvisionalAPrebuildToolchainHarness,
    'inspectProtectedPath' | 'readFile'
  >,
  namespace: ProtectedHeaderRecord['namespace'],
  root: string,
  rootMetadata: Awaited<ReturnType<typeof inspectProtectedPath>>,
  paths: readonly string[],
): Promise<readonly ProtectedHeaderRecord[]> {
  return Promise.all(
    paths.map(async (relativePath) => {
      const path = join(root, relativePath)
      const metadata = await runtime.inspectProtectedPath(path, 'file')
      const bytes = await runtime.readFile(path)
      if (metadata.size !== bytes.byteLength)
        throw new Error('policy-native-authority')
      return Object.freeze({
        namespace,
        relativePath,
        rootDevice: String(rootMetadata.dev),
        rootInode: String(rootMetadata.ino),
        uid: String(metadata.uid),
        device: String(metadata.dev),
        inode: String(metadata.ino),
        mode: String(metadata.mode & 0o7777),
        links: String(metadata.nlink),
        byteCount: bytes.byteLength,
        sha256: hash(bytes),
      })
    }),
  )
}

function tokenizeClangCommand(line: string): readonly string[] {
  const tokens: string[] = []
  let index = 0
  while (index < line.length) {
    if (index > 0) {
      if (line[index] !== ' ') throw new Error('policy-native-authority')
      while (line[index] === ' ') index += 1
    }
    if (line[index] !== '"') throw new Error('policy-native-authority')
    index += 1
    let token = ''
    let closed = false
    while (index < line.length) {
      const character = line[index]
      index += 1
      if (character === '"') {
        closed = true
        break
      }
      if (character === '\\') {
        const escaped = line[index]
        index += 1
        if (escaped !== '\\' && escaped !== '"')
          throw new Error('policy-native-authority')
        token += escaped
      } else token += character
    }
    if (!closed || token.length === 0)
      throw new Error('policy-native-authority')
    tokens.push(token)
    if (index < line.length && line[index] !== ' ')
      throw new Error('policy-native-authority')
  }
  if (tokens.length === 0) throw new Error('policy-native-authority')
  return Object.freeze(tokens)
}

function oneFlag(tokens: readonly string[], flag: string): string {
  const indexes = tokens.flatMap((token, index) =>
    token === flag ? [index] : [],
  )
  if (indexes.length !== 1 || indexes[0] + 1 >= tokens.length)
    throw new Error('policy-native-authority')
  return tokens[indexes[0] + 1]
}

function flagValues(
  tokens: readonly string[],
  flag: string,
): readonly string[] {
  const values = tokens.flatMap((token, index) =>
    token === flag && index + 1 < tokens.length ? [tokens[index + 1]] : [],
  )
  if (values.length === 0) throw new Error('policy-native-authority')
  return values
}

function oneToken(tokens: readonly string[], token: string): void {
  if (tokens.filter((value) => value === token).length !== 1)
    throw new Error('policy-native-authority')
}

type ClangDiagnosticProjection = Readonly<{
  schema: 'policy-clang-diagnostic-semantic.v1'
  version: 1
  frontend: Readonly<{
    executable: string
    resourceRoot: string
    resourceInclude: string
    sdkRoot: string
    sourcePath: string
    temporaryObjectDirectory: string
    language: 'c17'
    optimization: 'O2'
    warnings: readonly ['Wall', 'Wextra', 'Werror', 'Wpedantic']
  }>
  linker: Readonly<{
    executable: string
    sdkRoot: string
    outputPath: string
  }>
}>

type ClangDiagnosticEvidence = Readonly<{
  projection: ClangDiagnosticProjection
  normalizedDiagnosticSha256: string
  temporaryObjectPath: string
}>

function parseClangDiagnostic(
  diagnostic: ProvisionalAPrebuildChildResult,
  expected: Readonly<{
    compilerPath: string
    compilerResourceRoot: string
    sdkRoot: string
    sourcePath: string
    outputPath: string
    temporaryDirectory: string
  }>,
): ClangDiagnosticEvidence {
  if (diagnostic.stdout.byteLength !== 0)
    throw new Error('policy-native-authority')
  const text = new TextDecoder('utf-8', { fatal: true }).decode(
    diagnostic.stderr,
  )
  if (text.includes('\0') || text.includes('\r') || !text.endsWith('\n'))
    throw new Error('policy-native-authority')
  const commandLines: string[] = []
  for (const line of text.slice(0, -1).split('\n')) {
    if (line.startsWith(' "')) commandLines.push(line.slice(1))
    else if (line.startsWith('"')) commandLines.push(line)
    else {
      const installedDirectory = line.startsWith('InstalledDir: ')
        ? line.slice('InstalledDir: '.length)
        : null
      if (
        !/^(?:Apple clang version [^\r\n]+|Target: [A-Za-z0-9._+-]+|Thread model: [A-Za-z0-9._+-]+|InstalledDir: \/[A-Za-z0-9._+@\/-]+| \(in-process\))$/u.test(
          line,
        ) ||
        (installedDirectory !== null &&
          safeRoot(installedDirectory) !== installedDirectory)
      )
        throw new Error('policy-native-authority')
    }
  }
  if (commandLines.length !== 2) throw new Error('policy-native-authority')
  const records = commandLines.map(tokenizeClangCommand)
  const frontend = records.find((tokens) => tokens.includes('-cc1'))
  const linker = records.find((tokens) => !tokens.includes('-cc1'))
  if (frontend === undefined || linker === undefined)
    throw new Error('policy-native-authority')
  if (frontend[0] !== expected.compilerPath)
    throw new Error('policy-native-authority')
  const decisiveFlags = [
    '-resource-dir',
    '-internal-isystem',
    '-isysroot',
    '-o',
  ] as const
  if (
    [...frontend, ...linker].some((token) =>
      decisiveFlags.some((flag) => token.startsWith(`${flag}=`)),
    )
  )
    throw new Error('policy-native-authority')
  if (frontend.filter((token) => token === expected.compilerPath).length !== 1)
    throw new Error('policy-native-authority')
  oneToken(frontend, '-cc1')
  oneToken(frontend, '-std=c17')
  oneToken(frontend, '-O2')
  for (const warning of ['-Wall', '-Wextra', '-Werror', '-Wpedantic'])
    oneToken(frontend, warning)
  if (
    oneFlag(frontend, '-resource-dir') !== expected.compilerResourceRoot ||
    oneFlag(frontend, '-isysroot') !== expected.sdkRoot ||
    frontend.filter((token) => token === expected.sourcePath).length !== 1 ||
    frontend.some(
      (token) =>
        token !== expected.sourcePath &&
        safeAbsolutePathPattern.test(token) &&
        token.endsWith('.c'),
    )
  )
    throw new Error('policy-native-authority')
  const internalSystemIncludes = flagValues(frontend, '-internal-isystem')
  const expectedResourceInclude = join(expected.compilerResourceRoot, 'include')
  if (
    internalSystemIncludes.filter((path) => path === expectedResourceInclude)
      .length !== 1 ||
    internalSystemIncludes.some(
      (path) =>
        path !== expectedResourceInclude &&
        path.startsWith(`${expected.compilerResourceRoot}/`),
    )
  )
    throw new Error('policy-native-authority')
  const temporaryObjectPath = oneFlag(frontend, '-o')
  if (
    dirname(temporaryObjectPath) !== expected.temporaryDirectory ||
    !temporaryObjectPath.endsWith('.o') ||
    !safeAbsolutePathPattern.test(temporaryObjectPath) ||
    frontend.filter((token) => token === temporaryObjectPath).length !== 1
  )
    throw new Error('policy-native-authority')
  const linkerPath = safeRoot(linker[0])
  if (
    oneFlag(linker, '-syslibroot') !== expected.sdkRoot ||
    oneFlag(linker, '-o') !== expected.outputPath ||
    linker.filter((token) => token === linkerPath).length !== 1 ||
    linker.filter((token) => token === temporaryObjectPath).length !== 1 ||
    linker.some(
      (token) =>
        token !== temporaryObjectPath &&
        token.startsWith(`${expected.temporaryDirectory}/`) &&
        token.endsWith('.o'),
    )
  )
    throw new Error('policy-native-authority')
  const projection = Object.freeze({
    schema: 'policy-clang-diagnostic-semantic.v1',
    version: 1,
    frontend: Object.freeze({
      executable: expected.compilerPath,
      resourceRoot: expected.compilerResourceRoot,
      resourceInclude: join(expected.compilerResourceRoot, 'include'),
      sdkRoot: expected.sdkRoot,
      sourcePath: expected.sourcePath,
      temporaryObjectDirectory: expected.temporaryDirectory,
      language: 'c17',
      optimization: 'O2',
      warnings: Object.freeze([
        'Wall',
        'Wextra',
        'Werror',
        'Wpedantic',
      ] as const),
    }),
    linker: Object.freeze({
      executable: linkerPath,
      sdkRoot: expected.sdkRoot,
      outputPath: expected.outputPath,
    }),
  })
  const normalizedDiagnosticSha256 = hashAuthority({
    schema: 'policy-clang-diagnostic-normalized.v1',
    version: 1,
    stdout: diagnostic.stdout.toString('base64'),
    stderr: Buffer.from(
      text.split(temporaryObjectPath).join('<temporary-object>'),
    ).toString('base64'),
  })
  return Object.freeze({
    projection,
    normalizedDiagnosticSha256,
    temporaryObjectPath,
  })
}

async function inspectDiagnosticControlState(
  repositoryRoot: string,
  absentPaths: readonly string[],
): Promise<void> {
  const controlRoot = join(
    repositoryRoot,
    '.local/m45/policy-native-derivation',
  )
  if (
    canonical((await readdir(controlRoot)).sort()) !==
    canonical(['shared-root-baseline.v1.json'])
  )
    throw new Error('policy-native-authority')
  for (const path of absentPaths) {
    if (dirname(path) !== controlRoot)
      throw new Error('policy-native-authority')
    try {
      await lstat(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
    throw new Error('policy-native-authority')
  }
}

export async function inspectPolicyDiagnosticControlStateForFixture(
  input: unknown,
): Promise<void> {
  if (process.env.NODE_ENV !== 'test') throw new Error('test-only')
  exactObject(input, ['repositoryRoot', 'absentPaths'])
  if (
    typeof input.repositoryRoot !== 'string' ||
    !Array.isArray(input.absentPaths) ||
    !input.absentPaths.every((path) => typeof path === 'string')
  )
    throw new Error('test-only')
  await inspectDiagnosticControlState(
    safeRoot(input.repositoryRoot),
    input.absentPaths as string[],
  )
}

export function inspectPolicyDirectHeaderTablesForFixture() {
  if (process.env.NODE_ENV !== 'test') throw new Error('test-only')
  return Object.freeze({
    sdk: Object.freeze([...sdkHeaderPaths]),
    compilerResource: Object.freeze([...compilerResourceHeaderPaths]),
  })
}

export function parsePolicyCompilerResourceOutputForFixture(input: unknown) {
  if (process.env.NODE_ENV !== 'test' || !Buffer.isBuffer(input))
    throw new Error('test-only')
  return parseResolverOutput(input)
}

export function inspectPolicyProtectedPathMetadataForFixture(input: unknown) {
  if (process.env.NODE_ENV !== 'test') throw new Error('test-only')
  exactObject(input, [
    'kind',
    'uid',
    'mode',
    'links',
    'symbolicLink',
    'file',
    'directory',
  ])
  if (
    (input.kind !== 'file' && input.kind !== 'directory') ||
    !Number.isSafeInteger(input.uid) ||
    !Number.isSafeInteger(input.mode) ||
    !Number.isSafeInteger(input.links) ||
    typeof input.symbolicLink !== 'boolean' ||
    typeof input.file !== 'boolean' ||
    typeof input.directory !== 'boolean'
  )
    throw new Error('test-only')
  assertProtectedPathMetadata(
    {
      uid: Number(input.uid),
      mode: Number(input.mode),
      nlink: Number(input.links),
      isSymbolicLink: () => Boolean(input.symbolicLink),
      isFile: () => Boolean(input.file),
      isDirectory: () => Boolean(input.directory),
    },
    input.kind,
  )
}

export function inspectPolicyHeaderSetMutationForFixture(input: unknown) {
  if (process.env.NODE_ENV !== 'test') throw new Error('test-only')
  exactObject(input, ['mutation'])
  const mutation = input.mutation
  const fields = [
    'namespace',
    'relativePath',
    'rootDevice',
    'rootInode',
    'uid',
    'device',
    'inode',
    'mode',
    'links',
    'byteCount',
    'sha256',
  ] as const
  if (
    mutation !== 'missing' &&
    mutation !== 'duplicate' &&
    mutation !== 'reorder' &&
    !fields.includes(mutation as (typeof fields)[number])
  )
    throw new Error('test-only')
  const records: ProtectedHeaderRecord[] = [
    {
      namespace: 'sdk',
      relativePath: 'usr/include/stdint.h',
      rootDevice: '1',
      rootInode: '2',
      uid: '0',
      device: '1',
      inode: '3',
      mode: '292',
      links: '1',
      byteCount: 1,
      sha256: 'a'.repeat(64),
    },
    {
      namespace: 'compiler-resource',
      relativePath: 'include/stdint.h',
      rootDevice: '1',
      rootInode: '4',
      uid: '0',
      device: '1',
      inode: '5',
      mode: '292',
      links: '1',
      byteCount: 1,
      sha256: 'b'.repeat(64),
    },
  ]
  const expected = hashProtectedHeaderSet(records)
  if (mutation === 'missing') records.pop()
  else if (mutation === 'duplicate') records.push(records[0])
  else if (mutation === 'reorder') records.reverse()
  else {
    const record = { ...records[0] }
    if (mutation === 'namespace') record.namespace = 'compiler-resource'
    else if (mutation === 'byteCount') record.byteCount += 1
    else
      (record as unknown as Record<string, unknown>)[mutation as string] =
        mutation === 'sha256' ? 'c'.repeat(64) : '9'
    records[0] = record
  }
  return Object.freeze({
    matches: hashProtectedHeaderSet(records) === expected,
  })
}

export function parsePolicyClangDiagnosticForFixture(input: unknown) {
  if (process.env.NODE_ENV !== 'test') throw new Error('test-only')
  exactObject(input, ['stdout', 'stderr'])
  if (!Buffer.isBuffer(input.stdout) || !Buffer.isBuffer(input.stderr))
    throw new Error('test-only')
  const evidence = parseClangDiagnostic(
    {
      code: 0,
      stdout: input.stdout,
      stderr: input.stderr,
      processGroupAbsent: true,
      streamsClosed: true,
    },
    {
      compilerPath: '/fixture/clang',
      compilerResourceRoot: '/fixture/resource',
      sdkRoot: '/fixture/sdk',
      sourcePath:
        '/fixture/repository/scripts/policy-baseline-review/exclusive-promotion-helper.c',
      outputPath:
        '/fixture/repository/.local/m45/policy-native-derivation/.policy-compiler-diagnostic-output',
      temporaryDirectory:
        '/fixture/repository/.local/m45/policy-native-derivation',
    },
  )
  return Object.freeze({
    diagnosticSha256: evidence.normalizedDiagnosticSha256,
    diagnosticSemanticSha256: hashAuthority(evidence.projection),
    linkerPath: evidence.projection.linker.executable,
  })
}

type ProvisionalAPrebuildBoundary =
  | 'xcrun-compiler-resolution'
  | 'xcrun-sdk-child'
  | 'xcrun-sdk-output'
  | 'xcrun-sdk-resolution'
  | 'compiler-resource-resolution'
  | 'toolchain-input-attestation'
  | 'prediagnostic-inputs'
  | 'compiler-diagnostic-child'
  | 'compiler-diagnostic-semantics'
  | 'linker-attestation'
  | 'diagnostic-postchecks'
  | 'compiler-diagnostic'
  | 'toolchain-authority'

type ProvisionalAPrebuildObserver = (
  boundary: ProvisionalAPrebuildBoundary,
) => void

type ProvisionalAPrebuildChildResult = Readonly<{
  code: number
  stdout: Buffer
  stderr: Buffer
  processGroupAbsent: boolean
  streamsClosed: boolean
}>

type ProvisionalAPrebuildToolchainHarness = Readonly<{
  realpath: typeof realpath
  readFile: typeof readFile
  inspectProtectedPath: typeof inspectProtectedPath
  inspectSdkProtectedPath: typeof inspectSdkProtectedPath
  runXcrunCompilerPath: (
    input: Parameters<typeof broker.runXcrunCompilerPath>[0],
  ) => Promise<ProvisionalAPrebuildChildResult>
  runXcrunSdkPath: (
    input: Parameters<typeof broker.runXcrunSdkPath>[0],
  ) => Promise<ProvisionalAPrebuildChildResult>
  runCompilerResourceDir: (
    input: Parameters<typeof broker.runCompilerResourceDir>[0],
  ) => Promise<ProvisionalAPrebuildChildResult>
  runCompilerDiagnostic: (
    input: Parameters<typeof broker.runCompilerDiagnostic>[0],
  ) => Promise<ProvisionalAPrebuildChildResult>
  inspectDiagnosticControlState: (
    repositoryRoot: string,
    absentPaths: readonly string[],
  ) => Promise<void>
  beforeAuthority?: () => void
}>

async function runPolicyNativeToolchainDerivationWithObserver(
  input: unknown,
  observe?: ProvisionalAPrebuildObserver,
  harness?: ProvisionalAPrebuildToolchainHarness,
): Promise<Readonly<Record<string, unknown>>> {
  const runtime: ProvisionalAPrebuildToolchainHarness =
    harness ??
    Object.freeze({
      realpath,
      readFile,
      inspectProtectedPath,
      inspectSdkProtectedPath,
      runXcrunCompilerPath: broker.runXcrunCompilerPath,
      runXcrunSdkPath: broker.runXcrunSdkPath,
      runCompilerResourceDir: broker.runCompilerResourceDir,
      runCompilerDiagnostic: broker.runCompilerDiagnostic,
      inspectDiagnosticControlState,
    })
  exactObject(input, ['repositoryRoot', 'nativeAuthoritySha256'])
  const repositoryRoot = safeRoot(input.repositoryRoot)
  if ((await runtime.realpath(repositoryRoot)) !== repositoryRoot)
    throw new Error('policy-native-authority')
  const nativeAuthoritySha256 = sha256(input.nativeAuthoritySha256)
  const [source, launchContract, launcher, worker] = await Promise.all([
    runtime.readFile(helperSourcePath),
    runtime.readFile(launchContractPath),
    runtime.readFile(launcherPath),
    runtime.readFile(lockWorkerPath),
  ])
  const xcrunBefore = await runtime.inspectProtectedPath(xcrunPath, 'file')
  const xcrunBytesBefore = await runtime.readFile(xcrunPath)
  const compilerResolution = successfulDiagnostic(
    await runtime.runXcrunCompilerPath({ repositoryRoot }),
  )
  if (compilerResolution.stderr.byteLength !== 0)
    throw new Error('policy-native-authority')
  const compilerPath = parseResolverOutput(compilerResolution.stdout)
  const compilerBefore = await runtime.inspectProtectedPath(
    compilerPath,
    'file',
  )
  const compilerBytes = await runtime.readFile(compilerPath)
  observe?.('xcrun-compiler-resolution')
  const sdkResolution = successfulDiagnostic(
    await runtime.runXcrunSdkPath({ repositoryRoot }),
  )
  if (sdkResolution.stderr.byteLength !== 0)
    throw new Error('policy-native-authority')
  observe?.('xcrun-sdk-child')
  const sdkResolverPath = parseResolverOutput(sdkResolution.stdout)
  observe?.('xcrun-sdk-output')
  const sdkResolutionBefore =
    await runtime.inspectSdkProtectedPath(sdkResolverPath)
  const { sdkRoot, sdkMetadata: sdkBefore } = sdkResolutionBefore
  observe?.('xcrun-sdk-resolution')
  const compilerEvidenceCore = {
    schema: 'policy-compiler-resource-resolver.v1',
    version: 1,
    repositoryRoot,
    compilerPath,
    compilerSha256: hash(compilerBytes),
    compilerDevice: String(compilerBefore.dev),
    compilerInode: String(compilerBefore.ino),
  }
  const compilerImmediatelyBefore = await runtime.inspectProtectedPath(
    compilerPath,
    'file',
  )
  const compilerBytesImmediatelyBefore = await runtime.readFile(compilerPath)
  if (
    compilerImmediatelyBefore.dev !== compilerBefore.dev ||
    compilerImmediatelyBefore.ino !== compilerBefore.ino ||
    hash(compilerBytesImmediatelyBefore) !== compilerEvidenceCore.compilerSha256
  )
    throw new Error('policy-native-authority')
  const resourceResolution = successfulDiagnostic(
    await runtime.runCompilerResourceDir({
      ...compilerEvidenceCore,
      compilerEvidenceSha256: hashAuthority(compilerEvidenceCore),
    }),
  )
  if (resourceResolution.stderr.byteLength !== 0)
    throw new Error('policy-native-authority')
  const compilerResourceRoot = parseResolverOutput(resourceResolution.stdout)
  const [compilerImmediatelyAfter, compilerBytesImmediatelyAfter] =
    await Promise.all([
      runtime.inspectProtectedPath(compilerPath, 'file'),
      runtime.readFile(compilerPath),
    ])
  if (
    compilerImmediatelyAfter.dev !== compilerBefore.dev ||
    compilerImmediatelyAfter.ino !== compilerBefore.ino ||
    hash(compilerBytesImmediatelyAfter) !== compilerEvidenceCore.compilerSha256
  )
    throw new Error('policy-native-authority')
  const compilerResourceBefore = await runtime.inspectProtectedPath(
    compilerResourceRoot,
    'directory',
  )
  observe?.('compiler-resource-resolution')
  const [sdkHeaders, compilerResourceHeaders] = await Promise.all([
    readProtectedHeaders(runtime, 'sdk', sdkRoot, sdkBefore, sdkHeaderPaths),
    readProtectedHeaders(
      runtime,
      'compiler-resource',
      compilerResourceRoot,
      compilerResourceBefore,
      compilerResourceHeaderPaths,
    ),
  ])
  const headers = Object.freeze([...sdkHeaders, ...compilerResourceHeaders])
  const buildRoot = join(
    repositoryRoot,
    '.local/m45/.policy-exclusive-promotion-build',
  )
  // D118 records only a hypothesis: the `-###` plan names these staged paths,
  // but that driver mode need not open or compile the staged source.
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
  const diagnosticCapabilityCore = {
    schema: 'policy-compiler-diagnostic-capability.v1',
    version: 1,
    repositoryRoot,
    compilerPath,
    sdkRoot,
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
    compilerResourceRoot,
    compilerResourceIdentitySha256: hashAuthority({
      path: compilerResourceRoot,
      device: String(compilerResourceBefore.dev),
      inode: String(compilerResourceBefore.ino),
    }),
    compilerResourceDevice: String(compilerResourceBefore.dev),
    compilerResourceInode: String(compilerResourceBefore.ino),
    headerSetSha256: hashProtectedHeaderSet(headers),
    compileContractSha256,
    launchContractSha256: hash(launchContract),
    launcherSha256: hash(launcher),
    nativeAuthoritySha256,
    lockPreflightWorkerSha256: hash(worker),
  }
  observe?.('toolchain-input-attestation')
  const [compilerBeforeDiagnostic, compilerBytesBeforeDiagnostic] =
    await Promise.all([
      runtime.inspectProtectedPath(compilerPath, 'file'),
      runtime.readFile(compilerPath),
    ])
  if (
    compilerBeforeDiagnostic.dev !== compilerBefore.dev ||
    compilerBeforeDiagnostic.ino !== compilerBefore.ino ||
    hash(compilerBytesBeforeDiagnostic) !==
      diagnosticCapabilityCore.compilerSha256
  )
    throw new Error('policy-native-authority')
  const sdkResolutionBeforeDiagnostic =
    await runtime.inspectSdkProtectedPath(sdkResolverPath)
  if (!sameSdkResolution(sdkResolutionBefore, sdkResolutionBeforeDiagnostic))
    throw new Error('policy-native-authority')
  const diagnosticControlRoot = join(
    repositoryRoot,
    '.local/m45/policy-native-derivation',
  )
  const outputPath = join(
    diagnosticControlRoot,
    '.policy-compiler-diagnostic-output',
  )
  await runtime.inspectDiagnosticControlState(repositoryRoot, [outputPath])
  observe?.('prediagnostic-inputs')
  const diagnostic = successfulDiagnostic(
    await runtime.runCompilerDiagnostic({
      repositoryRoot,
      diagnosticCapability: {
        ...diagnosticCapabilityCore,
        diagnosticCapabilitySha256: hashAuthority(diagnosticCapabilityCore),
      },
    }),
  )
  observe?.('compiler-diagnostic-child')
  const sourcePath = join(
    repositoryRoot,
    'scripts/policy-baseline-review/exclusive-promotion-helper.c',
  )
  const temporaryDirectory = diagnosticControlRoot
  const diagnosticEvidence = parseClangDiagnostic(diagnostic, {
    compilerPath,
    compilerResourceRoot,
    sdkRoot,
    sourcePath,
    outputPath,
    temporaryDirectory,
  })
  const diagnosticProjection = diagnosticEvidence.projection
  await runtime.inspectDiagnosticControlState(repositoryRoot, [
    outputPath,
    diagnosticEvidence.temporaryObjectPath,
  ])
  observe?.('compiler-diagnostic-semantics')
  const linkerPath = diagnosticProjection.linker.executable
  const linkerBefore = await runtime.inspectProtectedPath(linkerPath, 'file')
  const linkerBytes = await runtime.readFile(linkerPath)
  observe?.('linker-attestation')
  const [
    xcrunAfter,
    xcrunBytesAfter,
    sourceAfter,
    contractAfter,
    launcherAfter,
    workerAfter,
    compilerAfter,
    compilerBytesAfter,
    sdkResolutionAfter,
    compilerResourceAfter,
    sdkHeadersAfter,
    compilerResourceHeadersAfter,
    linkerAfter,
    linkerBytesAfter,
  ] = await Promise.all([
    runtime.inspectProtectedPath(xcrunPath, 'file'),
    runtime.readFile(xcrunPath),
    runtime.readFile(helperSourcePath),
    runtime.readFile(launchContractPath),
    runtime.readFile(launcherPath),
    runtime.readFile(lockWorkerPath),
    runtime.inspectProtectedPath(compilerPath, 'file'),
    runtime.readFile(compilerPath),
    runtime.inspectSdkProtectedPath(sdkResolverPath),
    runtime.inspectProtectedPath(compilerResourceRoot, 'directory'),
    readProtectedHeaders(runtime, 'sdk', sdkRoot, sdkBefore, sdkHeaderPaths),
    readProtectedHeaders(
      runtime,
      'compiler-resource',
      compilerResourceRoot,
      compilerResourceBefore,
      compilerResourceHeaderPaths,
    ),
    runtime.inspectProtectedPath(linkerPath, 'file'),
    runtime.readFile(linkerPath),
  ])
  if (
    xcrunAfter.dev !== xcrunBefore.dev ||
    xcrunAfter.ino !== xcrunBefore.ino ||
    hash(xcrunBytesAfter) !== hash(xcrunBytesBefore) ||
    hash(sourceAfter) !== hash(source) ||
    hash(contractAfter) !== diagnosticCapabilityCore.launchContractSha256 ||
    hash(launcherAfter) !== diagnosticCapabilityCore.launcherSha256 ||
    hash(workerAfter) !== diagnosticCapabilityCore.lockPreflightWorkerSha256 ||
    compilerAfter.dev !== compilerBefore.dev ||
    compilerAfter.ino !== compilerBefore.ino ||
    hash(compilerBytesAfter) !== diagnosticCapabilityCore.compilerSha256 ||
    !sameSdkResolution(sdkResolutionBefore, sdkResolutionAfter) ||
    compilerResourceAfter.dev !== compilerResourceBefore.dev ||
    compilerResourceAfter.ino !== compilerResourceBefore.ino ||
    hashProtectedHeaderSet([
      ...sdkHeadersAfter,
      ...compilerResourceHeadersAfter,
    ]) !== diagnosticCapabilityCore.headerSetSha256 ||
    linkerAfter.dev !== linkerBefore.dev ||
    linkerAfter.ino !== linkerBefore.ino ||
    hash(linkerBytesAfter) !== hash(linkerBytes)
  )
    throw new Error('policy-native-authority')
  observe?.('diagnostic-postchecks')
  observe?.('compiler-diagnostic')
  const core = {
    schema: 'policy-toolchain-authority.v1',
    version: 1,
    compilerPath,
    sdkRoot,
    xcrunSha256: hash(xcrunBytesBefore),
    xcrunDevice: String(xcrunBefore.dev),
    xcrunInode: String(xcrunBefore.ino),
    sourceSha256: hash(source),
    compilerSha256: diagnosticCapabilityCore.compilerSha256,
    compilerDevice: diagnosticCapabilityCore.compilerDevice,
    compilerInode: diagnosticCapabilityCore.compilerInode,
    sdkIdentitySha256: diagnosticCapabilityCore.sdkIdentitySha256,
    sdkDevice: diagnosticCapabilityCore.sdkDevice,
    sdkInode: diagnosticCapabilityCore.sdkInode,
    compilerResourceRoot,
    compilerResourceIdentitySha256:
      diagnosticCapabilityCore.compilerResourceIdentitySha256,
    compilerResourceDevice: diagnosticCapabilityCore.compilerResourceDevice,
    compilerResourceInode: diagnosticCapabilityCore.compilerResourceInode,
    headerSetSha256: diagnosticCapabilityCore.headerSetSha256,
    diagnosticSha256: diagnosticEvidence.normalizedDiagnosticSha256,
    diagnosticSemanticSha256: hashAuthority(diagnosticProjection),
    linkerPath,
    linkerIdentitySha256: hashAuthority({
      path: linkerPath,
      device: String(linkerBefore.dev),
      inode: String(linkerBefore.ino),
    }),
    linkerSha256: hash(linkerBytes),
    linkerDevice: String(linkerBefore.dev),
    linkerInode: String(linkerBefore.ino),
    compileContractSha256,
    launchContractSha256: diagnosticCapabilityCore.launchContractSha256,
    launcherSha256: diagnosticCapabilityCore.launcherSha256,
    nativeAuthoritySha256,
    lockPreflightWorkerSha256:
      diagnosticCapabilityCore.lockPreflightWorkerSha256,
  }
  const authority = Object.freeze({
    ...core,
    authorityPackageSha256: hashAuthority(core),
  })
  runtime.beforeAuthority?.()
  observe?.('toolchain-authority')
  return authority
}

async function runPolicyFdAdmissionProbeToolchainDerivation(
  input: unknown,
): Promise<Readonly<Record<string, unknown>>> {
  exactObject(input, [
    'repositoryRoot',
    'nativeAuthoritySha256',
    'probeSourceSha256',
    'beforeChild',
  ])
  const repositoryRoot = safeRoot(input.repositoryRoot)
  const nativeAuthoritySha256 = sha256(input.nativeAuthoritySha256)
  const probeSourceSha256 = sha256(input.probeSourceSha256)
  if (typeof input.beforeChild !== 'function')
    throw new Error('policy-native-authority')
  const beforeChild = input.beforeChild as () => Promise<void>
  if ((await realpath(repositoryRoot)) !== repositoryRoot)
    throw new Error('policy-native-authority')
  const [probeSource, launchContract, launcher, worker] = await Promise.all([
    readFile(fdAdmissionProbeSourcePath),
    readFile(launchContractPath),
    readFile(launcherPath),
    readFile(lockWorkerPath),
  ])
  if (hash(probeSource) !== probeSourceSha256)
    throw new Error('policy-native-authority')
  const xcrunBefore = await inspectProtectedPath(xcrunPath, 'file')
  const xcrunBytesBefore = await readFile(xcrunPath)
  await beforeChild()
  const compilerResolutionChecked = successfulDiagnostic(
    await broker.runXcrunCompilerPath({ repositoryRoot }),
  )
  if (compilerResolutionChecked.stderr.byteLength !== 0)
    throw new Error('policy-native-authority')
  const compilerPath = parseResolverOutput(compilerResolutionChecked.stdout)
  const compilerBefore = await inspectProtectedPath(compilerPath, 'file')
  const compilerBytes = await readFile(compilerPath)
  await beforeChild()
  const sdkResolutionChecked = successfulDiagnostic(
    await broker.runXcrunSdkPath({ repositoryRoot }),
  )
  if (sdkResolutionChecked.stderr.byteLength !== 0)
    throw new Error('policy-native-authority')
  const sdkResolverPath = parseResolverOutput(sdkResolutionChecked.stdout)
  const sdkResolutionBefore = await inspectSdkProtectedPath(sdkResolverPath)
  const { sdkRoot, sdkMetadata: sdkBefore } = sdkResolutionBefore
  const compilerEvidenceCore = {
    schema: 'policy-compiler-resource-resolver.v1',
    version: 1,
    repositoryRoot,
    compilerPath,
    compilerSha256: hash(compilerBytes),
    compilerDevice: String(compilerBefore.dev),
    compilerInode: String(compilerBefore.ino),
  }
  const [compilerImmediatelyBefore, compilerBytesImmediatelyBefore] =
    await Promise.all([
      inspectProtectedPath(compilerPath, 'file'),
      readFile(compilerPath),
    ])
  if (
    compilerImmediatelyBefore.dev !== compilerBefore.dev ||
    compilerImmediatelyBefore.ino !== compilerBefore.ino ||
    hash(compilerBytesImmediatelyBefore) !== compilerEvidenceCore.compilerSha256
  )
    throw new Error('policy-native-authority')
  await beforeChild()
  const resourceResolutionChecked = successfulDiagnostic(
    await broker.runCompilerResourceDir({
      ...compilerEvidenceCore,
      compilerEvidenceSha256: hashAuthority(compilerEvidenceCore),
    }),
  )
  if (resourceResolutionChecked.stderr.byteLength !== 0)
    throw new Error('policy-native-authority')
  const compilerResourceRoot = parseResolverOutput(
    resourceResolutionChecked.stdout,
  )
  const [compilerImmediatelyAfter, compilerBytesImmediatelyAfter] =
    await Promise.all([
      inspectProtectedPath(compilerPath, 'file'),
      readFile(compilerPath),
    ])
  if (
    compilerImmediatelyAfter.dev !== compilerBefore.dev ||
    compilerImmediatelyAfter.ino !== compilerBefore.ino ||
    hash(compilerBytesImmediatelyAfter) !== compilerEvidenceCore.compilerSha256
  )
    throw new Error('policy-native-authority')
  const compilerResourceBefore = await inspectProtectedPath(
    compilerResourceRoot,
    'directory',
  )
  const [sdkHeaders, compilerResourceHeaders] = await Promise.all([
    readProtectedHeaders(
      { inspectProtectedPath, readFile },
      'sdk',
      sdkRoot,
      sdkBefore,
      sdkHeaderPaths,
    ),
    readProtectedHeaders(
      { inspectProtectedPath, readFile },
      'compiler-resource',
      compilerResourceRoot,
      compilerResourceBefore,
      compilerResourceHeaderPaths,
    ),
  ])
  const headers = Object.freeze([...sdkHeaders, ...compilerResourceHeaders])
  const scratchRoot = fdAdmissionProbeScratchRoot
  const probePath = `${scratchRoot}/probe`
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
      probePath,
      fdAdmissionProbeSourcePath,
    ],
    environment: { TMPDIR: scratchRoot },
  })
  const diagnosticCapabilityCore = {
    schema: 'policy-fd-admission-probe-compiler-diagnostic-capability.v1',
    version: 1,
    repositoryRoot,
    compilerPath,
    sdkRoot,
    compilerResourceRoot,
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
    compilerResourceIdentitySha256: hashAuthority({
      path: compilerResourceRoot,
      device: String(compilerResourceBefore.dev),
      inode: String(compilerResourceBefore.ino),
    }),
    compilerResourceDevice: String(compilerResourceBefore.dev),
    compilerResourceInode: String(compilerResourceBefore.ino),
    headerSetSha256: hashProtectedHeaderSet(headers),
    probeSourceSha256,
    compileContractSha256,
    launchContractSha256: hash(launchContract),
    launcherSha256: hash(launcher),
    nativeAuthoritySha256,
    lockPreflightWorkerSha256: hash(worker),
  }
  const [compilerBeforeDiagnostic, compilerBytesBeforeDiagnostic] =
    await Promise.all([
      inspectProtectedPath(compilerPath, 'file'),
      readFile(compilerPath),
    ])
  if (
    compilerBeforeDiagnostic.dev !== compilerBefore.dev ||
    compilerBeforeDiagnostic.ino !== compilerBefore.ino ||
    hash(compilerBytesBeforeDiagnostic) !==
      diagnosticCapabilityCore.compilerSha256
  )
    throw new Error('policy-native-authority')
  const sdkResolutionBeforeDiagnostic =
    await inspectSdkProtectedPath(sdkResolverPath)
  if (!sameSdkResolution(sdkResolutionBefore, sdkResolutionBeforeDiagnostic))
    throw new Error('policy-native-authority')
  await beforeChild()
  const diagnosticChecked = successfulDiagnostic(
    await broker.runFdAdmissionProbeCompilerDiagnostic({
      repositoryRoot,
      diagnosticCapability: {
        ...diagnosticCapabilityCore,
        diagnosticCapabilitySha256: hashAuthority(diagnosticCapabilityCore),
      },
    }),
  )
  if (diagnosticChecked.stderr.byteLength === 0)
    throw new Error('policy-native-authority')
  const diagnosticEvidence = parseClangDiagnostic(diagnosticChecked, {
    compilerPath,
    compilerResourceRoot,
    sdkRoot,
    sourcePath: fdAdmissionProbeSourcePath,
    outputPath: probePath,
    temporaryDirectory: scratchRoot,
  })
  const diagnosticProjection = diagnosticEvidence.projection
  const linkerPath = diagnosticProjection.linker.executable
  const linkerBefore = await inspectProtectedPath(linkerPath, 'file')
  const linkerBytes = await readFile(linkerPath)
  const [
    xcrunAfter,
    xcrunBytesAfter,
    sourceAfter,
    contractAfter,
    launcherAfter,
    workerAfter,
    compilerAfter,
    compilerBytesAfter,
    sdkResolutionAfter,
    compilerResourceAfter,
    sdkHeadersAfter,
    compilerResourceHeadersAfter,
    linkerAfter,
    linkerBytesAfter,
  ] = await Promise.all([
    inspectProtectedPath(xcrunPath, 'file'),
    readFile(xcrunPath),
    readFile(fdAdmissionProbeSourcePath),
    readFile(launchContractPath),
    readFile(launcherPath),
    readFile(lockWorkerPath),
    inspectProtectedPath(compilerPath, 'file'),
    readFile(compilerPath),
    inspectSdkProtectedPath(sdkResolverPath),
    inspectProtectedPath(compilerResourceRoot, 'directory'),
    readProtectedHeaders(
      { inspectProtectedPath, readFile },
      'sdk',
      sdkRoot,
      sdkBefore,
      sdkHeaderPaths,
    ),
    readProtectedHeaders(
      { inspectProtectedPath, readFile },
      'compiler-resource',
      compilerResourceRoot,
      compilerResourceBefore,
      compilerResourceHeaderPaths,
    ),
    inspectProtectedPath(linkerPath, 'file'),
    readFile(linkerPath),
  ])
  if (
    xcrunAfter.dev !== xcrunBefore.dev ||
    xcrunAfter.ino !== xcrunBefore.ino ||
    hash(xcrunBytesAfter) !== hash(xcrunBytesBefore) ||
    hash(sourceAfter) !== probeSourceSha256 ||
    hash(contractAfter) !== diagnosticCapabilityCore.launchContractSha256 ||
    hash(launcherAfter) !== diagnosticCapabilityCore.launcherSha256 ||
    hash(workerAfter) !== diagnosticCapabilityCore.lockPreflightWorkerSha256 ||
    compilerAfter.dev !== compilerBefore.dev ||
    compilerAfter.ino !== compilerBefore.ino ||
    hash(compilerBytesAfter) !== diagnosticCapabilityCore.compilerSha256 ||
    !sameSdkResolution(sdkResolutionBefore, sdkResolutionAfter) ||
    compilerResourceAfter.dev !== compilerResourceBefore.dev ||
    compilerResourceAfter.ino !== compilerResourceBefore.ino ||
    hashProtectedHeaderSet([
      ...sdkHeadersAfter,
      ...compilerResourceHeadersAfter,
    ]) !== diagnosticCapabilityCore.headerSetSha256 ||
    linkerAfter.dev !== linkerBefore.dev ||
    linkerAfter.ino !== linkerBefore.ino ||
    hash(linkerBytesAfter) !== hash(linkerBytes)
  )
    throw new Error('policy-native-authority')
  const core = {
    schema: 'policy-fd-admission-probe-toolchain-authority.v1',
    version: 1,
    compilerPath,
    sdkRoot,
    xcrunSha256: hash(xcrunBytesBefore),
    xcrunDevice: String(xcrunBefore.dev),
    xcrunInode: String(xcrunBefore.ino),
    probeSourceSha256,
    compilerSha256: diagnosticCapabilityCore.compilerSha256,
    compilerDevice: diagnosticCapabilityCore.compilerDevice,
    compilerInode: diagnosticCapabilityCore.compilerInode,
    sdkIdentitySha256: diagnosticCapabilityCore.sdkIdentitySha256,
    sdkDevice: diagnosticCapabilityCore.sdkDevice,
    sdkInode: diagnosticCapabilityCore.sdkInode,
    compilerResourceRoot,
    compilerResourceIdentitySha256:
      diagnosticCapabilityCore.compilerResourceIdentitySha256,
    compilerResourceDevice: diagnosticCapabilityCore.compilerResourceDevice,
    compilerResourceInode: diagnosticCapabilityCore.compilerResourceInode,
    headerSetSha256: diagnosticCapabilityCore.headerSetSha256,
    diagnosticSha256: diagnosticEvidence.normalizedDiagnosticSha256,
    diagnosticSemanticSha256: hashAuthority(diagnosticProjection),
    linkerPath,
    linkerIdentitySha256: hashAuthority({
      path: linkerPath,
      device: String(linkerBefore.dev),
      inode: String(linkerBefore.ino),
    }),
    linkerSha256: hash(linkerBytes),
    linkerDevice: String(linkerBefore.dev),
    linkerInode: String(linkerBefore.ino),
    compileContractSha256,
    launchContractSha256: diagnosticCapabilityCore.launchContractSha256,
    launcherSha256: diagnosticCapabilityCore.launcherSha256,
    nativeAuthoritySha256,
    lockPreflightWorkerSha256:
      diagnosticCapabilityCore.lockPreflightWorkerSha256,
  }
  return Object.freeze({
    ...core,
    authorityPackageSha256: hashAuthority(core),
  })
}
/**
 * Complete high-level toolchain derivation. The parent trust root supplies only
 * its externally computed bridge commitment; executable selection and every
 * child launch remain private to this module.
 */
export async function runPolicyNativeToolchainDerivation(
  input: unknown,
): Promise<Readonly<Record<string, unknown>>> {
  return runPolicyNativeToolchainDerivationWithObserver(input)
}

async function revalidatePolicyToolchainAuthority(
  authority: Readonly<Record<string, unknown>>,
): Promise<void> {
  const compilerPath = safeRoot(authority.compilerPath)
  const sdkRoot = safeRoot(authority.sdkRoot)
  const compilerResourceRoot = safeRoot(authority.compilerResourceRoot)
  const linkerPath = safeRoot(authority.linkerPath)
  const [compiler, compilerBytes, sdk, compilerResource, linker, linkerBytes] =
    await Promise.all([
      inspectProtectedPath(compilerPath, 'file'),
      readFile(compilerPath),
      inspectProtectedPath(sdkRoot, 'directory'),
      inspectProtectedPath(compilerResourceRoot, 'directory'),
      inspectProtectedPath(linkerPath, 'file'),
      readFile(linkerPath),
    ])
  const [sdkHeaders, compilerResourceHeaders] = await Promise.all([
    readProtectedHeaders(
      { inspectProtectedPath, readFile },
      'sdk',
      sdkRoot,
      sdk,
      sdkHeaderPaths,
    ),
    readProtectedHeaders(
      { inspectProtectedPath, readFile },
      'compiler-resource',
      compilerResourceRoot,
      compilerResource,
      compilerResourceHeaderPaths,
    ),
  ])
  if (
    String(compiler.dev) !== authority.compilerDevice ||
    String(compiler.ino) !== authority.compilerInode ||
    hash(compilerBytes) !== authority.compilerSha256 ||
    hashAuthority({
      path: sdkRoot,
      device: String(sdk.dev),
      inode: String(sdk.ino),
    }) !== authority.sdkIdentitySha256 ||
    String(sdk.dev) !== authority.sdkDevice ||
    String(sdk.ino) !== authority.sdkInode ||
    hashAuthority({
      path: compilerResourceRoot,
      device: String(compilerResource.dev),
      inode: String(compilerResource.ino),
    }) !== authority.compilerResourceIdentitySha256 ||
    String(compilerResource.dev) !== authority.compilerResourceDevice ||
    String(compilerResource.ino) !== authority.compilerResourceInode ||
    hashProtectedHeaderSet([...sdkHeaders, ...compilerResourceHeaders]) !==
      authority.headerSetSha256 ||
    hashAuthority({
      path: linkerPath,
      device: String(linker.dev),
      inode: String(linker.ino),
    }) !== authority.linkerIdentitySha256 ||
    String(linker.dev) !== authority.linkerDevice ||
    String(linker.ino) !== authority.linkerInode ||
    hash(linkerBytes) !== authority.linkerSha256
  )
    throw new Error('policy-native-authority')
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
function reentryLockIdentity(value: unknown): LockIdentity | null {
  if (value === null) return null
  exactObject(value, ['uid', 'device', 'inode', 'links', 'mode', 'size'])
  for (const key of ['uid', 'device', 'inode', 'links', 'mode'] as const)
    if (
      typeof value[key] !== 'string' ||
      !/^(?:0|[1-9][0-9]*)$/u.test(value[key])
    )
      throw new Error('policy-native-authority')
  if (
    value.links !== '1' ||
    value.mode !== '384' ||
    value.size !== '0' ||
    !Number.isSafeInteger(Number(value.uid))
  )
    throw new Error('policy-native-authority')
  const uid = value.uid
  const device = value.device
  const inode = value.inode
  if (
    typeof uid !== 'string' ||
    typeof device !== 'string' ||
    typeof inode !== 'string'
  )
    throw new Error('policy-native-authority')
  return Object.freeze({
    uid: Number(uid),
    device,
    inode,
    mode: 384,
    links: 1,
    bytes: 0,
  })
}
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
async function openCommandLock(
  lockPath: string,
  mustExist: boolean,
): Promise<FileHandle> {
  if (mustExist) return open(lockPath, lockExistingFlags)
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
  expectedReentryLock: LockIdentity | null = null,
  beforeChild?: () => Promise<void>,
) {
  const lockPath = join(
    repositoryRoot,
    '.local/m45/.policy-exclusive-promotion.lock',
  )
  const held = await openCommandLock(lockPath, expectedReentryLock !== null)
  let before: LockIdentity
  try {
    before = lockIdentity(await held.stat())
    if (
      expectedReentryLock !== null &&
      canonical(before) !== canonical(expectedReentryLock)
    )
      throw new Error('policy-native-authority')
    await validateNamedLock(held, lockPath, before)
    await beforeChild?.()
    const contender = closedContender(
      await broker.runLockContender(
        { repositoryRoot, workerSha256 },
        workerSha256,
      ),
      20,
    )
    await validateNamedLock(held, lockPath, before)
    await held.close()
    await beforeChild?.()
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
  expectedReentryLock?: LockIdentity | null,
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
    const positioningFds = positioningFillers.map(({ fd }) => fd)
    if (
      positioningFds.length !== 4 ||
      new Set(positioningFds).size !== 4 ||
      positioningFds.some((fd) => !isSafeParentFd(fd, 6))
    )
      throw new Error('policy-native-authority')
    lock = fixtureHarness
      ? await fixtureHarness.openLock()
      : await open(lockPath, lockExistingFlags)
    if (!isSafeParentFd(lock.fd, 6) || positioningFds.includes(lock.fd))
      throw new Error('policy-native-authority')
    const identity = fixtureHarness
      ? ({} as LockIdentity)
      : lockIdentity(await lock.stat())
    if (
      !fixtureHarness &&
      expectedReentryLock !== undefined &&
      expectedReentryLock !== null &&
      canonical(identity) !== canonical(expectedReentryLock)
    )
      throw new Error('policy-native-authority')
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

const provisionalAPrebuildBoundaries = [
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

type ProvisionalAPrebuildJournalBoundary =
  (typeof provisionalAPrebuildBoundaries)[number]

type ProvisionalAPrebuildDiagnosticResult = Readonly<{
  lastSuccessfulBoundary: ProvisionalAPrebuildJournalBoundary
  derivationLockCycleClosed?: true
  authorityPackageSha256?: string
  sdkProtectionStop?: SdkProtectionStop
}>

type ProvisionalAPrebuildDiagnosticOperations = Readonly<{
  probeLockCapability: () => Promise<void>
  openLock: () => Promise<unknown>
  deriveToolchain: (observe: ProvisionalAPrebuildObserver) => Promise<string>
  closeLock: (custody: unknown) => Promise<void>
}>

type ProvisionalAPrebuildNativeOperations = Readonly<{
  readWorker: () => Promise<Buffer>
  probeLockCapability: (
    repositoryRoot: string,
    workerSha256: string,
    expectedReentryLock: LockIdentity,
  ) => Promise<void>
  openLock: (
    repositoryRoot: string,
    expectedReentryLock: LockIdentity,
  ) => Promise<unknown>
  deriveToolchain: (
    repositoryRoot: string,
    nativeAuthoritySha256: string,
    observe: ProvisionalAPrebuildObserver,
  ) => Promise<Readonly<Record<string, unknown>>>
  closeLock: (custody: unknown) => Promise<void>
}>

class ProvisionalAPrebuildJournalError extends Error {}

async function runPolicyProvisionalAPrebuildDiagnosticBridge(
  operations: ProvisionalAPrebuildDiagnosticOperations,
): Promise<ProvisionalAPrebuildDiagnosticResult> {
  const journal: ProvisionalAPrebuildJournalBoundary[] = []
  const append = (boundary: ProvisionalAPrebuildJournalBoundary) => {
    if (provisionalAPrebuildBoundaries[journal.length] !== boundary)
      throw new ProvisionalAPrebuildJournalError()
    journal.push(boundary)
  }
  const result = (
    derivationLockCycleClosed?: true,
    authorityPackageSha256?: string,
    sdkProtectionStop?: SdkProtectionStop,
  ): ProvisionalAPrebuildDiagnosticResult =>
    Object.freeze({
      lastSuccessfulBoundary: journal.at(-1)!,
      ...(derivationLockCycleClosed === true
        ? { derivationLockCycleClosed }
        : {}),
      ...(authorityPackageSha256 === undefined
        ? {}
        : { authorityPackageSha256 }),
      ...(sdkProtectionStop === undefined ? {} : { sdkProtectionStop }),
    })

  append('entry-custody')
  // A failed capability probe may have an uncertain contender/lock closure, so
  // it deliberately produces no diagnostic result for the runner to expose.
  await operations.probeLockCapability()
  append('lock-capability')

  // A partial positioning failure is likewise non-reportable: the public
  // stopped result must not overstate derivation-lock lifecycle closure.
  const custody = await operations.openLock()
  append('derivation-lock-open')
  let authorityPackageSha256: string | undefined
  let diagnosticFailure: unknown
  let sdkProtectionStop: SdkProtectionStop | undefined
  try {
    authorityPackageSha256 = await operations.deriveToolchain(append)
  } catch (error) {
    diagnosticFailure = error
    if (error instanceof SdkProtectedPathStopError)
      sdkProtectionStop = error.stop
  }

  // A typed stopped result is safe only once the held named lock has passed its
  // final identity check and closed. Any ambiguity throws to the outer generic
  // stopped path instead.
  await operations.closeLock(custody)
  if (diagnosticFailure !== undefined) {
    if (diagnosticFailure instanceof ProvisionalAPrebuildJournalError)
      throw diagnosticFailure
    if (
      sdkProtectionStop !== undefined &&
      journal.at(-1) === 'xcrun-sdk-output'
    )
      return result(true, undefined, sdkProtectionStop)
    return result(true)
  }
  if (
    authorityPackageSha256 === undefined ||
    !sha256Pattern.test(authorityPackageSha256)
  )
    throw new Error('policy-native-authority')
  append('derivation-lock-cycle-closed')
  return result(true, authorityPackageSha256)
}

/**
 * D118's sole diagnostic bridge. It keeps the compiler's raw plan private and
 * never enters a package-builder or repository-mutating authority.
 */
async function diagnosePolicyProvisionalBuildAPrebuildWithOperations(
  input: unknown,
  operations: ProvisionalAPrebuildNativeOperations,
): Promise<ProvisionalAPrebuildDiagnosticResult> {
  exactObject(input, ['repositoryRoot', 'nativeAuthoritySha256', 'commandLock'])
  const repositoryRoot = safeRoot(input.repositoryRoot)
  const nativeAuthoritySha256 = sha256(input.nativeAuthoritySha256)
  const expectedReentryLock = reentryLockIdentity(input.commandLock)
  if (expectedReentryLock === null) throw new Error('policy-native-authority')
  const workerSha256 = hash(await operations.readWorker())
  return runPolicyProvisionalAPrebuildDiagnosticBridge({
    probeLockCapability: async () => {
      await operations.probeLockCapability(
        repositoryRoot,
        workerSha256,
        expectedReentryLock,
      )
    },
    openLock: () => operations.openLock(repositoryRoot, expectedReentryLock),
    deriveToolchain: async (observe) => {
      const authority = await operations.deriveToolchain(
        repositoryRoot,
        nativeAuthoritySha256,
        observe,
      )
      const authorityPackageSha256 = authority.authorityPackageSha256
      if (
        typeof authorityPackageSha256 !== 'string' ||
        !sha256Pattern.test(authorityPackageSha256)
      )
        throw new Error('policy-native-authority')
      return authorityPackageSha256
    },
    closeLock: operations.closeLock,
  })
}

export async function diagnosePolicyProvisionalBuildAPrebuild(
  input: unknown,
): Promise<ProvisionalAPrebuildDiagnosticResult> {
  return diagnosePolicyProvisionalBuildAPrebuildWithOperations(input, {
    readWorker: () => readFile(lockWorkerPath),
    probeLockCapability: async (
      repositoryRoot,
      workerSha256,
      expectedReentryLock,
    ) => {
      await commandLockCapabilityProbe(
        repositoryRoot,
        workerSha256,
        expectedReentryLock,
      )
    },
    openLock: openDerivationLock,
    deriveToolchain: (repositoryRoot, nativeAuthoritySha256, observe) =>
      runPolicyNativeToolchainDerivationWithObserver(
        { repositoryRoot, nativeAuthoritySha256 },
        observe,
      ),
    closeLock: (custody) =>
      closeDerivationLock(
        custody as Awaited<ReturnType<typeof openDerivationLock>>,
      ),
  })
}

const provisionalAPrebuildFixtureFaults = [
  'capability-open',
  'held-contender-child',
  'held-contender-lifecycle',
  'held-contender-postcheck',
  'released-contender-child',
  'released-contender-lifecycle',
  'released-contender-postcheck',
  'derivation-lock-open',
  'compiler-child',
  'compiler-lifecycle',
  'compiler-output',
  'sdk-child',
  'sdk-lifecycle',
  'sdk-stderr',
  'sdk-output',
  'sdk-protected-stat',
  'resource-child',
  'resource-lifecycle',
  'resource-output',
  'resource-protected-stat',
  'resource-protected-read',
  'attestation-protected-stat',
  'attestation-protected-read',
  'diagnostic-child',
  'diagnostic-lifecycle',
  'diagnostic-output',
  'linker-protected-stat',
  'linker-protected-read',
  'prediagnostic-compiler',
  'prediagnostic-compiler-bytes',
  'prediagnostic-sdk',
  'diagnostic-control-before',
  'diagnostic-control-after',
  'postcheck-tracked-source',
  'postcheck-xcrun',
  'postcheck-compiler',
  'postcheck-compiler-bytes',
  'postcheck-sdk',
  'postcheck-sdk-headers',
  'postcheck-resource',
  'postcheck-resource-headers',
  'postcheck-linker',
  'postcheck-linker-bytes',
  'authority-package',
  'lock-final-validation',
  'lock-close',
  'journal-duplicate',
  'journal-omission',
  'journal-reorder',
] as const

type ProvisionalAPrebuildFixtureFault =
  (typeof provisionalAPrebuildFixtureFaults)[number]

/** Test-only execution of the exact D118 bridge with closed fake operations. */
export async function runPolicyProvisionalAPrebuildDiagnosticForFixture(
  input: unknown,
) {
  if (process.env.NODE_ENV !== 'test') throw new Error('test-only')
  exactObject(input, ['faultAt'])
  const faultAt = input.faultAt
  if (
    faultAt !== null &&
    (typeof faultAt !== 'string' ||
      !provisionalAPrebuildFixtureFaults.includes(
        faultAt as ProvisionalAPrebuildFixtureFault,
      ))
  )
    throw new Error('test-only')
  const fault = faultAt as ProvisionalAPrebuildFixtureFault | null
  const childOrder: string[] = []
  const lifecycle: string[] = []
  const boundaryOrder: ProvisionalAPrebuildJournalBoundary[] = ['entry-custody']
  let toolchainCompleted = false
  const stopAt = (point: ProvisionalAPrebuildFixtureFault) => {
    lifecycle.push(point)
    if (fault === point) throw new Error('fixture-fault')
  }
  let result: ProvisionalAPrebuildDiagnosticResult | undefined
  let genericStopped = false
  try {
    result = await diagnosePolicyProvisionalBuildAPrebuildWithOperations(
      {
        repositoryRoot: '/fixture/repository',
        nativeAuthoritySha256: 'b'.repeat(64),
        commandLock: {
          uid: '501',
          device: '1',
          inode: '2',
          mode: '384',
          links: '1',
          size: '0',
        },
      },
      {
        readWorker: async () => Buffer.from('fixture-worker'),
        probeLockCapability: async () => {
          stopAt('capability-open')
          childOrder.push('held-lock-contender')
          stopAt('held-contender-child')
          stopAt('held-contender-lifecycle')
          stopAt('held-contender-postcheck')
          childOrder.push('released-lock-contender')
          stopAt('released-contender-child')
          stopAt('released-contender-lifecycle')
          stopAt('released-contender-postcheck')
          boundaryOrder.push('lock-capability')
        },
        openLock: async () => {
          stopAt('derivation-lock-open')
          boundaryOrder.push('derivation-lock-open')
          return Object.freeze({ fixture: 'held-lock' })
        },
        deriveToolchain: async (
          _repositoryRoot,
          _nativeAuthoritySha256,
          observe,
        ) => {
          const compilerPath = '/fixture/clang'
          const sdkResolverPath = '/fixture/sdk-alias'
          const sdkRoot = '/fixture/sdk'
          const compilerResourceRoot = '/fixture/resource'
          const linkerPath = '/fixture/ld'
          const readCounts = new Map<string, number>()
          const inspectCounts = new Map<string, number>()
          let attestationReadObserved = false
          let attestationStatObserved = false
          let sdkHeaderPostcheckObserved = false
          let resourceHeaderPostcheckObserved = false
          let resourceReadObserved = false
          const metadata = (path: string) =>
            ({
              uid: 0,
              dev:
                path === sdkRoot
                  ? 3
                  : path === compilerPath
                    ? 2
                    : path === compilerResourceRoot
                      ? 4
                      : path === linkerPath
                        ? 5
                        : 1,
              ino:
                path === sdkRoot
                  ? 30
                  : path === compilerPath
                    ? 20
                    : path === compilerResourceRoot
                      ? 40
                      : path === linkerPath
                        ? 50
                        : 10,
              mode: 0o100444,
              nlink: 1,
              size: Buffer.byteLength(`fixture:${path}`),
            }) as Awaited<ReturnType<typeof inspectProtectedPath>>
          const closedChild = (
            stdout: string,
            lifecycleFault = false,
            stderrFault = false,
          ) => ({
            code: 0,
            stdout: Buffer.from(stdout),
            stderr: stderrFault
              ? Buffer.from('fixture-stderr')
              : Buffer.alloc(0),
            processGroupAbsent: lifecycleFault
              ? (false as const)
              : (true as const),
            streamsClosed: true as const,
          })
          const harness: ProvisionalAPrebuildToolchainHarness = {
            realpath: (async (path: string) => path) as typeof realpath,
            readFile: (async (path: string) => {
              const count = (readCounts.get(path) ?? 0) + 1
              readCounts.set(path, count)
              if (path === compilerPath && !attestationReadObserved) {
                attestationReadObserved = true
                stopAt('attestation-protected-read')
              }
              if (path === helperSourcePath && count === 2)
                stopAt('postcheck-tracked-source')
              if (path === xcrunPath && count === 2) stopAt('postcheck-xcrun')
              if (path === compilerPath && count === 4)
                stopAt('prediagnostic-compiler-bytes')
              if (path === compilerPath && count === 5)
                stopAt('postcheck-compiler-bytes')
              if (
                path.startsWith(`${sdkRoot}/`) &&
                count === 2 &&
                !sdkHeaderPostcheckObserved
              ) {
                sdkHeaderPostcheckObserved = true
                stopAt('postcheck-sdk-headers')
              }
              if (
                path.startsWith(`${compilerResourceRoot}/`) &&
                count === 1 &&
                !resourceReadObserved
              ) {
                resourceReadObserved = true
                stopAt('resource-protected-read')
              }
              if (
                path.startsWith(`${compilerResourceRoot}/`) &&
                count === 2 &&
                !resourceHeaderPostcheckObserved
              ) {
                resourceHeaderPostcheckObserved = true
                stopAt('postcheck-resource-headers')
              }
              if (path === linkerPath && count === 2)
                stopAt('postcheck-linker-bytes')
              if (path === linkerPath && count === 1)
                stopAt('linker-protected-read')
              return Buffer.from(`fixture:${path}`)
            }) as typeof readFile,
            inspectProtectedPath: async (path) => {
              const count = (inspectCounts.get(path) ?? 0) + 1
              inspectCounts.set(path, count)
              if (
                (path === compilerPath || path === sdkRoot) &&
                count === 1 &&
                !attestationStatObserved
              ) {
                attestationStatObserved = true
                stopAt('attestation-protected-stat')
              }
              if (path === compilerPath && count === 4)
                stopAt('prediagnostic-compiler')
              if (path === compilerPath && count === 5)
                stopAt('postcheck-compiler')
              if (path === sdkRoot && count === 1) stopAt('sdk-protected-stat')
              if (path === compilerResourceRoot && count === 1)
                stopAt('resource-protected-stat')
              if (path === compilerResourceRoot && count === 2)
                stopAt('postcheck-resource')
              if (path === linkerPath && count === 1)
                stopAt('linker-protected-stat')
              if (path === linkerPath && count === 2) stopAt('postcheck-linker')
              return metadata(path)
            },
            inspectSdkProtectedPath: async (path) => {
              const count = (inspectCounts.get(path) ?? 0) + 1
              inspectCounts.set(path, count)
              if (count === 1) lifecycle.push('sdk-protected-stat')
              if (fault === 'sdk-protected-stat' && count === 1)
                throw new SdkProtectedPathStopError('sdk-owner')
              if (count === 2) stopAt('prediagnostic-sdk')
              if (count === 3) stopAt('postcheck-sdk')
              const resolverMetadata = metadata(path)
              const sdkMetadata = metadata(sdkRoot)
              return Object.freeze({
                resolverPath: path,
                resolverKind: 'symlink' as const,
                resolverDevice: String(resolverMetadata.dev),
                resolverInode: String(resolverMetadata.ino),
                resolverMode: String(resolverMetadata.mode),
                resolverLinks: String(resolverMetadata.nlink),
                resolverLinkSha256: 'f'.repeat(64),
                sdkRoot,
                sdkMetadata,
              })
            },
            runXcrunCompilerPath: async () => {
              childOrder.push('xcrun-compiler-resolver')
              stopAt('compiler-child')
              lifecycle.push('compiler-lifecycle')
              const output =
                fault === 'compiler-output' ? compilerPath : `${compilerPath}\n`
              lifecycle.push('compiler-output')
              return closedChild(output, fault === 'compiler-lifecycle')
            },
            runXcrunSdkPath: async () => {
              childOrder.push('xcrun-sdk-resolver')
              stopAt('sdk-child')
              lifecycle.push('sdk-lifecycle')
              const output =
                fault === 'sdk-output'
                  ? sdkResolverPath
                  : `${sdkResolverPath}\n`
              lifecycle.push('sdk-output')
              return closedChild(
                output,
                fault === 'sdk-lifecycle',
                fault === 'sdk-stderr',
              )
            },
            runCompilerResourceDir: async () => {
              childOrder.push('compiler-resource-resolver')
              stopAt('resource-child')
              lifecycle.push('resource-lifecycle')
              const output =
                fault === 'resource-output'
                  ? compilerResourceRoot
                  : `${compilerResourceRoot}\n`
              lifecycle.push('resource-output')
              return closedChild(output, fault === 'resource-lifecycle')
            },
            inspectDiagnosticControlState: async () => {
              const point = lifecycle.includes('diagnostic-lifecycle')
                ? ('diagnostic-control-after' as const)
                : ('diagnostic-control-before' as const)
              stopAt(point)
            },
            runCompilerDiagnostic: async () => {
              childOrder.push('compiler-diagnostic')
              stopAt('diagnostic-child')
              lifecycle.push('diagnostic-lifecycle')
              const sourcePath =
                '/fixture/repository/scripts/policy-baseline-review/exclusive-promotion-helper.c'
              const outputPath =
                '/fixture/repository/.local/m45/policy-native-derivation/.policy-compiler-diagnostic-output'
              const temporaryObject =
                '/fixture/repository/.local/m45/policy-native-derivation/fixture.o'
              const quote = (value: string) => `"${value}"`
              const frontend = [
                compilerPath,
                '-cc1',
                '-std=c17',
                '-Wall',
                '-Wextra',
                '-Werror',
                '-Wpedantic',
                '-O2',
                '-resource-dir',
                compilerResourceRoot,
                '-internal-isystem',
                `${compilerResourceRoot}/include`,
                '-isysroot',
                sdkRoot,
                '-o',
                temporaryObject,
                sourcePath,
              ]
                .map(quote)
                .join(' ')
              const linker = [
                linkerPath,
                '-syslibroot',
                sdkRoot,
                '-o',
                outputPath,
                temporaryObject,
              ]
                .map(quote)
                .join(' ')
              lifecycle.push('diagnostic-output')
              if (fault === 'diagnostic-output')
                return {
                  ...closedChild('', false),
                  stderr: Buffer.from('malformed\n'),
                }
              return {
                ...closedChild('', fault === 'diagnostic-lifecycle'),
                stderr: Buffer.from(`${frontend}\n${linker}\n`),
              }
            },
            beforeAuthority: () => stopAt('authority-package'),
          }
          if (fault === 'journal-reorder') observe('xcrun-sdk-resolution')
          if (fault === 'journal-duplicate')
            observe('xcrun-compiler-resolution')
          const diagnosticObserver: ProvisionalAPrebuildObserver = (
            boundary,
          ) => {
            if (
              fault === 'journal-omission' &&
              boundary === 'xcrun-compiler-resolution'
            )
              return
            observe(boundary)
            boundaryOrder.push(boundary)
          }
          const authority =
            await runPolicyNativeToolchainDerivationWithObserver(
              {
                repositoryRoot: '/fixture/repository',
                nativeAuthoritySha256: 'b'.repeat(64),
              },
              diagnosticObserver,
              harness,
            )
          const commitment = authority.authorityPackageSha256
          if (typeof commitment !== 'string') throw new Error('fixture-fault')
          toolchainCompleted = true
          return authority
        },
        closeLock: async () => {
          stopAt('lock-final-validation')
          stopAt('lock-close')
          if (toolchainCompleted)
            boundaryOrder.push('derivation-lock-cycle-closed')
        },
      },
    )
  } catch {
    genericStopped = true
  }
  return Object.freeze({
    output:
      result === undefined
        ? Object.freeze({ status: 'stopped' as const })
        : Object.freeze({
            status:
              result.authorityPackageSha256 === undefined
                ? ('diagnostic-stopped' as const)
                : ('diagnostic-complete' as const),
            ...result,
          }),
    childOrder: Object.freeze(childOrder),
    lifecycle: Object.freeze(lifecycle),
    boundaryOrder: Object.freeze(boundaryOrder),
    genericStopped,
  })
}

type ChildFdHandle = Readonly<{ fd: number; close: () => Promise<void> }>
type FillerIdentity = Readonly<{ device: string; inode: string }>

function isSafeParentFd(fd: number, highestChildTarget: number): boolean {
  return Number.isSafeInteger(fd) && fd > highestChildTarget
}

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
type ChildFdObservation = Readonly<{
  highestTarget: 3 | 6
  fillerParentFds: readonly number[]
  authorityParentFds: readonly number[]
  commandLockParentFd: number
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
    observation: () => ChildFdObservation,
  ) => Promise<T>,
  harness?: ChildFdLifecycleHarness<Handle>,
): Promise<T> {
  if (highestChildAuthorityTarget !== 3 && highestChildAuthorityTarget !== 6)
    throw new Error('policy-native-authority')
  const fillerCount = highestChildAuthorityTarget === 6 ? 4 : 3
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
    for (let index = 0; index < fillerCount; index += 1)
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
    const fillerFds = fillers.map(({ fd }) => fd)
    if (
      fillerFds.length !== fillerCount ||
      new Set(fillerFds).size !== fillerCount ||
      fillerFds.some(
        (fd) => !isSafeParentFd(fd, highestChildAuthorityTarget),
      ) ||
      fillerFds.includes(custody.lock.fd) ||
      !isSafeParentFd(custody.lock.fd, highestChildAuthorityTarget)
    )
      throw new Error('policy-native-authority')
    const openChildAuthority = async (path: string, flags: number) => {
      const handle =
        harness === undefined
          ? ((await open(path, flags)) as unknown as Handle)
          : await harness.open(path, flags)
      authorities.push(handle)
      if (
        !isSafeParentFd(handle.fd, highestChildAuthorityTarget) ||
        handle.fd === custody.lock.fd ||
        fillers.some((filler) => filler.fd === handle.fd) ||
        authorities.filter(({ fd }) => fd === handle.fd).length !== 1
      )
        throw new Error('policy-native-authority')
      return handle
    }
    const observation = (): ChildFdObservation => ({
      highestTarget: highestChildAuthorityTarget,
      fillerParentFds: fillers
        .map(({ fd }) => fd)
        .sort((left, right) => left - right),
      authorityParentFds: authorities
        .map(({ fd }) => fd)
        .sort((left, right) => left - right),
      commandLockParentFd: custody.lock.fd,
    })
    const result = await operation(openChildAuthority, observation)
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
    null,
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
  argvCount?: number
  childDescriptorMap?: readonly number[]
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
        observation: () => ChildFdObservation,
      ) => Promise<CandidateLifecycleResult>,
    ) => Promise<CandidateLifecycleResult>
    prepare: (openChildAuthority: CandidateChildAuthority) => Promise<unknown>
    runOperation: (
      operation: unknown,
      cleanupOnly: boolean,
    ) => Promise<CandidateLifecycleResult>
    validateLock: () => Promise<void>
    onStart: () => void
    onOperation: (operation: unknown, observation: ChildFdObservation) => void
    onLaunched: () => void
    onClosed: (result: CandidateLifecycleResult) => void
    accepted?: number
  }>,
): Promise<CandidateLifecycleResult> {
  input.onStart()
  const result = await input.withChild(
    input.highest,
    async (openChildAuthority, observation) => {
      const prepared = await input.prepare(openChildAuthority)
      const wrapped =
        prepared !== null &&
        typeof prepared === 'object' &&
        'operation' in prepared &&
        'postcheck' in prepared
          ? (prepared as CandidatePreparedOperation)
          : undefined
      const operation = wrapped?.operation ?? prepared
      input.onOperation(operation, observation())
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
          observation: () => ChildFdObservation,
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

function provisionalABuildResidueEntry(
  metadata:
    Awaited<ReturnType<FileHandle['stat']>> | Awaited<ReturnType<typeof lstat>>,
) {
  return {
    kind: metadata.isDirectory()
      ? ('directory' as const)
      : metadata.isFile()
        ? ('file' as const)
        : ('other' as const),
    uid: metadata.uid,
    device: metadata.dev,
    inode: metadata.ino,
    mode: Number(metadata.mode) & 0o7777,
    links: metadata.nlink,
    size: metadata.size,
  }
}

function assertExactPolicyProvisionalABuildResidueMetadata(
  input: unknown,
): void {
  exactObject(input, [
    'expectedUid',
    'held',
    'named',
    'buildEntries',
    'tmpEntries',
  ])
  if (!Number.isSafeInteger(input.expectedUid))
    throw new Error('policy-native-authority')
  exactObject(input.held, ['build', 'source', 'helper', 'tmp'])
  exactObject(input.named, ['build', 'source', 'helper', 'tmp'])
  const expectedUid = input.expectedUid as number
  const expectedEntries = {
    build: {
      kind: 'directory',
      uid: expectedUid,
      device: provisionalABuildResidue.device,
      ...provisionalABuildResidue.build,
    },
    source: {
      kind: 'file',
      uid: expectedUid,
      device: provisionalABuildResidue.device,
      inode: provisionalABuildResidue.source.inode,
      mode: provisionalABuildResidue.source.mode,
      links: provisionalABuildResidue.source.links,
      size: provisionalABuildResidue.source.size,
    },
    helper: {
      kind: 'file',
      uid: expectedUid,
      device: provisionalABuildResidue.device,
      inode: provisionalABuildResidue.helper.inode,
      mode: provisionalABuildResidue.helper.mode,
      links: provisionalABuildResidue.helper.links,
      size: provisionalABuildResidue.helper.size,
    },
    tmp: {
      kind: 'directory',
      uid: expectedUid,
      device: provisionalABuildResidue.device,
      ...provisionalABuildResidue.tmp,
    },
  }
  const expected = {
    expectedUid,
    held: expectedEntries,
    named: expectedEntries,
    buildEntries: [
      'exclusive-promotion-helper',
      'exclusive-promotion-helper.c',
      'tmp',
    ],
    tmpEntries: [],
  }
  if (canonical(input) !== canonical(expected))
    throw new Error('policy-native-authority')
}

function assertExactPolicyProvisionalABuildResidue(input: unknown): void {
  exactObject(input, [
    'expectedUid',
    'held',
    'named',
    'buildEntries',
    'tmpEntries',
    'sourceSha256',
    'helperSha256',
  ])
  const { sourceSha256, helperSha256, ...metadata } = input
  assertExactPolicyProvisionalABuildResidueMetadata(metadata)
  if (
    sourceSha256 !== provisionalABuildResidue.source.sha256 ||
    helperSha256 !== provisionalABuildResidue.helper.sha256
  )
    throw new Error('policy-native-authority')
}

export function inspectPolicyProvisionalABuildResidueForFixture(
  input: unknown,
): true {
  if (process.env.NODE_ENV !== 'test')
    throw new Error('policy-native-authority')
  assertExactPolicyProvisionalABuildResidue(input)
  return true
}

type SharedTerminalInput = Readonly<{
  phase: 'shared-a' | 'shared-b'
  siblings: Readonly<{
    'candidate-review': Readonly<Record<string, unknown>>
    discovery: Readonly<Record<string, unknown>>
    'predecessor-review': Readonly<Record<string, unknown>>
    'policy-native-derivation': Readonly<Record<string, unknown>>
  }>
}>

function sharedTerminalInput(value: unknown): SharedTerminalInput {
  exactObject(value, ['phase', 'siblings'])
  if (value.phase !== 'shared-a' && value.phase !== 'shared-b')
    throw new Error('policy-native-authority')
  exactObject(value.siblings, [
    'candidate-review',
    'discovery',
    'predecessor-review',
    'policy-native-derivation',
  ])
  const parseMetadata = (metadata: unknown) => {
    exactObject(metadata, ['uid', 'device', 'inode', 'links', 'mode', 'size'])
    for (const key of ['uid', 'device', 'inode', 'links', 'mode'] as const) {
      if (
        typeof metadata[key] !== 'string' ||
        !/^(?:0|[1-9][0-9]*)$/u.test(metadata[key])
      )
        throw new Error('policy-native-authority')
    }
    if (metadata.size !== 'na') throw new Error('policy-native-authority')
    return Object.freeze({ ...metadata })
  }
  const siblings = {
    'candidate-review': parseMetadata(value.siblings['candidate-review']),
    discovery: parseMetadata(value.siblings.discovery),
    'predecessor-review': parseMetadata(value.siblings['predecessor-review']),
    'policy-native-derivation': parseMetadata(
      value.siblings['policy-native-derivation'],
    ),
  }
  if (
    Object.values(siblings).some(
      (sibling) =>
        sibling.size !== 'na' ||
        sibling.inode === '0' ||
        sibling.links === '0' ||
        sibling.mode === '0',
    ) ||
    siblings['policy-native-derivation'].mode !== '448' ||
    (value.phase === 'shared-a'
      ? siblings['policy-native-derivation'].links !== '3'
      : siblings['policy-native-derivation'].links !== '4')
  )
    throw new Error('policy-native-authority')
  return Object.freeze({
    phase: value.phase,
    siblings: Object.freeze(siblings),
  })
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
    sharedSiblings?: SharedTerminalInput['siblings']
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
    ['control', join(m45Path, 'policy-native-derivation'), 'directory'],
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
  if (input.sharedSiblings !== undefined) {
    for (const [name, expected] of Object.entries(input.sharedSiblings)) {
      const path = join(m45Path, name)
      let handle: FileHandle | undefined
      try {
        handle = await open(
          path,
          fsConstants.O_RDONLY |
            fsConstants.O_DIRECTORY |
            darwinFlags.noFollow |
            darwinFlags.closeOnExec,
        )
        const held = await handle.stat()
        const named = await lstat(path)
        if (
          held.dev !== named.dev ||
          held.ino !== named.ino ||
          canonical(metadataEvidence(held)) !== canonical(expected)
        )
          return undefined
      } catch {
        return undefined
      } finally {
        await handle?.close()
      }
    }
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
  // inventory, including regular files such as the persistent command lock.
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
  const sharedRootEntries = [
    'candidate-review',
    'discovery',
    'predecessor-review',
    'policy-native-derivation',
  ] as const
  const sharedRoot = sharedRootEntries.every((entry) =>
    (inventories.m45 as readonly string[]).includes(entry),
  )
  const m45Directory = (entries: readonly string[]) => {
    const expected = sharedRoot ? [...sharedRootEntries, ...entries] : entries
    return (
      canonicalMetadata(
        'm45',
        'directory',
        '448',
        String(2 + expected.length),
      ) && exact('m45', expected)
    )
  }
  const allAbsent = (...roles: readonly string[]) => roles.every(absent)
  const preflightRoles = paths
    .slice(4)
    .filter(([role]) => role !== 'control')
    .map(([role]) => role)
  const buildCore =
    directory('build', [
      'exclusive-promotion-helper',
      'exclusive-promotion-helper.c',
      'tmp',
    ]) &&
    directory('tmp', []) &&
    file('source', '256', input.sourceSha256) &&
    file('helper', '320', input.helperSha256)
  const sharedControl =
    !sharedRoot ||
    directory('control', ['shared-root-baseline.v1.json', 'stage-a.v1.json'])
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
    if (!sharedControl) return undefined
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
  sharedSiblings?: SharedTerminalInput['siblings']
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
    sharedSiblings: input.sharedSiblings,
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
async function runHelperWithCustodyChecks<T>(
  precheck: (() => Promise<void>) | undefined,
  run: () => Promise<T>,
  postcheck: (() => Promise<void>) | undefined,
): Promise<T> {
  await precheck?.()
  const result = await run()
  await postcheck?.()
  return result
}
function residueHelperExitCode(
  result: Awaited<ReturnType<typeof broker.runHelper>>,
): number {
  if (
    ![0, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].includes(result.code) ||
    result.stdoutBytes !== 0 ||
    result.stderrBytes !== 0 ||
    !result.processGroupAbsent ||
    !result.streamsClosed
  )
    throw new Error('policy-native-authority')
  return result.code
}

export async function runPolicyProvisionalABuildResidueLifecycleForFixture(
  input: unknown,
): Promise<
  Readonly<{
    status: 'diagnosed' | 'stopped'
    events: readonly string[]
    helperExitCode?: number
  }>
> {
  if (process.env.NODE_ENV !== 'test')
    throw new Error('policy-native-authority')
  exactObject(input, ['failure', 'result'])
  const failure = input.failure
  if (
    failure !== null &&
    failure !== 'precheck' &&
    failure !== 'child' &&
    failure !== 'postcheck'
  )
    throw new Error('policy-native-authority')
  const events: string[] = []
  try {
    const result = await runHelperWithCustodyChecks(
      async () => {
        events.push('precheck')
        if (failure === 'precheck') throw new Error('fixture-precheck')
      },
      async () => {
        events.push('child')
        if (failure === 'child') throw new Error('fixture-child')
        return input.result as Awaited<ReturnType<typeof broker.runHelper>>
      },
      async () => {
        events.push('postcheck')
        if (failure === 'postcheck') throw new Error('fixture-postcheck')
      },
    )
    return Object.freeze({
      status: 'diagnosed',
      events: Object.freeze(events),
      helperExitCode: residueHelperExitCode(result),
    })
  } catch {
    return Object.freeze({ status: 'stopped', events: Object.freeze(events) })
  }
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
            precheck?: () => Promise<void>
            postcheck: () => Promise<void>
          })
        : undefined
    const operation = wrapped?.operation ?? prepared
    const result = await runHelperWithCustodyChecks(
      wrapped?.precheck,
      () => broker.runHelper(capability, operation),
      wrapped?.postcheck,
    )
    await validateNamedLock(custody.lock, custody.lockPath, custody.identity)
    return result
  })
}

async function runFdAdmissionProbeWithCustodyChecks(
  custody: Awaited<ReturnType<typeof openDerivationLock>>,
  capability: unknown,
  precheck: () => Promise<void>,
  postcheck: () => Promise<void>,
) {
  return withChildFillers(custody, 3, async () => {
    await precheck()
    const result = await broker.runFdAdmissionProbe(capability, custody.lock.fd)
    await postcheck()
    await validateNamedLock(custody.lock, custody.lockPath, custody.identity)
    return result
  })
}

type FdAdmissionProbeScratchFinalization = Readonly<{
  closeProbe: () => Promise<void>
  validateProbeForUnlink: () => Promise<void>
  unlinkProbe: () => Promise<void>
  validateEmptyForRemoval: () => Promise<void>
  closeScratch: () => Promise<void>
  removeScratch: () => Promise<void>
  assertAbsentAndFinal: () => Promise<void>
}>

type FdAdmissionProbeSnapshotMetadata = Readonly<{
  kind: 'directory' | 'file' | 'other'
  dev: number
  ino: number
  uid: number
  mode: number
  nlink: number
  size: number
}>

type FdAdmissionProbeScratchSnapshot = Readonly<{
  held: FdAdmissionProbeSnapshotMetadata
  named: FdAdmissionProbeSnapshotMetadata
  expectedUid: number
  expectedDev: number
  expectedIno: number
  entries: readonly string[]
  expectedEntries: readonly string[]
}>

type FdAdmissionProbeFileSnapshot = Readonly<{
  held: FdAdmissionProbeSnapshotMetadata
  named: FdAdmissionProbeSnapshotMetadata
  expectedUid: number
  expectedDev: number
  expectedIno: number
  expectedSize: number
  heldSha256: string
  expectedSha256: string
}>

function fdAdmissionProbeSnapshotMetadata(
  metadata: Awaited<ReturnType<FileHandle['stat']>>,
): FdAdmissionProbeSnapshotMetadata {
  return Object.freeze({
    kind: metadata.isDirectory()
      ? 'directory'
      : metadata.isFile()
        ? 'file'
        : 'other',
    dev: Number(metadata.dev),
    ino: Number(metadata.ino),
    uid: Number(metadata.uid),
    mode: Number(metadata.mode) & 0o7777,
    nlink: Number(metadata.nlink),
    size: Number(metadata.size),
  })
}

function assertFdAdmissionProbeScratchSnapshot(
  snapshot: FdAdmissionProbeScratchSnapshot,
): void {
  const expectedEntries = [...snapshot.expectedEntries].sort()
  if (
    snapshot.held.kind !== 'directory' ||
    snapshot.named.kind !== 'directory' ||
    snapshot.held.uid !== snapshot.expectedUid ||
    snapshot.named.uid !== snapshot.expectedUid ||
    snapshot.held.dev !== snapshot.expectedDev ||
    snapshot.named.dev !== snapshot.expectedDev ||
    snapshot.held.ino !== snapshot.expectedIno ||
    snapshot.named.ino !== snapshot.expectedIno ||
    snapshot.held.mode !== 0o700 ||
    snapshot.named.mode !== 0o700 ||
    snapshot.held.nlink !== 2 ||
    snapshot.named.nlink !== 2 ||
    snapshot.held.size !== snapshot.named.size ||
    [...snapshot.entries].sort().join('\0') !== expectedEntries.join('\0')
  )
    throw new Error('policy-native-authority')
}

function assertFdAdmissionProbeFileSnapshot(
  snapshot: FdAdmissionProbeFileSnapshot,
): void {
  if (
    snapshot.held.kind !== 'file' ||
    snapshot.named.kind !== 'file' ||
    snapshot.held.uid !== snapshot.expectedUid ||
    snapshot.named.uid !== snapshot.expectedUid ||
    snapshot.held.dev !== snapshot.expectedDev ||
    snapshot.named.dev !== snapshot.expectedDev ||
    snapshot.held.ino !== snapshot.expectedIno ||
    snapshot.named.ino !== snapshot.expectedIno ||
    snapshot.held.mode !== 0o500 ||
    snapshot.named.mode !== 0o500 ||
    snapshot.held.nlink !== 1 ||
    snapshot.named.nlink !== 1 ||
    snapshot.held.size !== snapshot.expectedSize ||
    snapshot.named.size !== snapshot.expectedSize ||
    snapshot.heldSha256 !== snapshot.expectedSha256
  )
    throw new Error('policy-native-authority')
}

export function assertPolicyFdAdmissionProbeScratchSnapshotForFixture(
  input: FdAdmissionProbeScratchSnapshot,
): void {
  if (process.env.NODE_ENV !== 'test')
    throw new Error('policy-wrapper-isolation')
  assertFdAdmissionProbeScratchSnapshot(input)
}

export function assertPolicyFdAdmissionProbeFileSnapshotForFixture(
  input: FdAdmissionProbeFileSnapshot,
): void {
  if (process.env.NODE_ENV !== 'test')
    throw new Error('policy-wrapper-isolation')
  assertFdAdmissionProbeFileSnapshot(input)
}

async function finalizeFdAdmissionProbeScratch(
  cleanupPermitted: boolean,
  operations: FdAdmissionProbeScratchFinalization,
): Promise<void> {
  await operations.closeProbe()
  if (!cleanupPermitted) return
  await operations.validateProbeForUnlink()
  await operations.unlinkProbe()
  await operations.validateEmptyForRemoval()
  await operations.closeScratch()
  await operations.removeScratch()
  await operations.assertAbsentAndFinal()
}

export async function finalizePolicyFdAdmissionProbeScratchForFixture(input: {
  cleanupPermitted: boolean
  failAt?: string
  onEvent?: (name: string) => void
}): Promise<readonly string[]> {
  if (process.env.NODE_ENV !== 'test')
    throw new Error('policy-wrapper-isolation')
  const events: string[] = []
  const operation = (name: string) => async () => {
    events.push(name)
    input.onEvent?.(name)
    if (input.failAt === name) throw new Error('fixture-failure')
  }
  await finalizeFdAdmissionProbeScratch(input.cleanupPermitted, {
    closeProbe: operation('close-probe'),
    validateProbeForUnlink: operation('validate-probe-for-unlink'),
    unlinkProbe: operation('unlink-probe'),
    validateEmptyForRemoval: operation('validate-empty-for-removal'),
    closeScratch: operation('close-scratch'),
    removeScratch: operation('remove-scratch'),
    assertAbsentAndFinal: operation('assert-absent-and-final'),
  })
  return Object.freeze(events)
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
  sharedTerminal: SharedTerminalInput,
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
  await revalidatePolicyToolchainAuthority(authority)
  const buildResult = await broker.runCompilerBuild({
    repositoryRoot,
    compilerPath,
    sdkRoot,
    compilerResourceRoot: safeRoot(authority.compilerResourceRoot),
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
      compilerResourceIdentitySha256: authority.compilerResourceIdentitySha256,
      compilerResourceDevice: authority.compilerResourceDevice,
      compilerResourceInode: authority.compilerResourceInode,
      headerSetSha256: authority.headerSetSha256,
      diagnosticSha256: authority.diagnosticSha256,
      diagnosticSemanticSha256: authority.diagnosticSemanticSha256,
      linkerIdentitySha256: authority.linkerIdentitySha256,
      linkerSha256: authority.linkerSha256,
      linkerDevice: authority.linkerDevice,
      linkerInode: authority.linkerInode,
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
              kind: 'delete-build-terminal-shared',
              phase: sharedTerminal.phase,
              parent: metadataEvidence(parentBefore),
              buildRoot: metadataEvidence(buildBefore),
              helper: metadataEvidence(helperBefore),
              siblings: sharedTerminal.siblings,
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
    'sharedTerminal',
    'commandLock',
  ])
  const repositoryRoot = safeRoot(input.repositoryRoot)
  const nativeAuthoritySha256 = sha256(input.nativeAuthoritySha256)
  const rootNonceSha256 = sha256(input.rootNonceSha256)
  const sharedTerminal = sharedTerminalInput(input.sharedTerminal)
  const expectedReentryLock = reentryLockIdentity(input.commandLock)
  const workerSha256 = hash(await readFile(lockWorkerPath))
  await commandLockCapabilityProbe(
    repositoryRoot,
    workerSha256,
    expectedReentryLock,
  )
  const custody = await openDerivationLock(repositoryRoot, expectedReentryLock)
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
      sharedTerminal,
    )
    await validateNamedLock(custody.lock, custody.lockPath, custody.identity)
    return Object.freeze(result)
  } finally {
    await closeDerivationLock(custody)
  }
}

export async function diagnosePolicyProvisionalABuildResidue(
  input: unknown,
): Promise<Readonly<{ helperExitCode: number }>> {
  exactObject(input, [
    'repositoryRoot',
    'nativeAuthoritySha256',
    'rootNonceSha256',
    'commandLock',
  ])
  const repositoryRoot = safeRoot(input.repositoryRoot)
  const nativeAuthoritySha256 = sha256(input.nativeAuthoritySha256)
  const rootNonceSha256 = sha256(input.rootNonceSha256)
  const expectedReentryLock = reentryLockIdentity(input.commandLock)
  if (expectedReentryLock === null) throw new Error('policy-native-authority')
  const buildPath = join(
    repositoryRoot,
    '.local/m45/.policy-exclusive-promotion-build',
  )
  const sourcePath = join(buildPath, 'exclusive-promotion-helper.c')
  const helperPath = join(buildPath, 'exclusive-promotion-helper')
  const tmpPath = join(buildPath, 'tmp')
  let buildHandle: FileHandle | undefined
  let sourceHandle: FileHandle | undefined
  let helperHandle: FileHandle | undefined
  let tmpHandle: FileHandle | undefined
  let custody: Awaited<ReturnType<typeof openDerivationLock>> | undefined
  let operationFailure: unknown
  try {
    buildHandle = await open(
      buildPath,
      fsConstants.O_RDONLY |
        fsConstants.O_DIRECTORY |
        darwinFlags.noFollow |
        darwinFlags.closeOnExec,
    )
    sourceHandle = await open(
      sourcePath,
      fsConstants.O_RDONLY | darwinFlags.noFollow | darwinFlags.closeOnExec,
    )
    helperHandle = await open(
      helperPath,
      fsConstants.O_RDONLY | darwinFlags.noFollow | darwinFlags.closeOnExec,
    )
    tmpHandle = await open(
      tmpPath,
      fsConstants.O_RDONLY |
        fsConstants.O_DIRECTORY |
        darwinFlags.noFollow |
        darwinFlags.closeOnExec,
    )
    const [buildStat, sourceStat, helperStat, tmpStat] = await Promise.all([
      buildHandle.stat(),
      sourceHandle.stat(),
      helperHandle.stat(),
      tmpHandle.stat(),
    ])
    const [buildNamed, sourceNamed, helperNamed, tmpNamed] = await Promise.all([
      lstat(buildPath),
      lstat(sourcePath),
      lstat(helperPath),
      lstat(tmpPath),
    ])
    const [buildEntries, tmpEntries] = await Promise.all([
      readdir(buildPath).then((entries) => entries.sort()),
      readdir(tmpPath).then((entries) => entries.sort()),
    ])
    const initialResidueMetadata = {
      expectedUid: expectedReentryLock.uid,
      held: {
        build: provisionalABuildResidueEntry(buildStat),
        source: provisionalABuildResidueEntry(sourceStat),
        helper: provisionalABuildResidueEntry(helperStat),
        tmp: provisionalABuildResidueEntry(tmpStat),
      },
      named: {
        build: provisionalABuildResidueEntry(buildNamed),
        source: provisionalABuildResidueEntry(sourceNamed),
        helper: provisionalABuildResidueEntry(helperNamed),
        tmp: provisionalABuildResidueEntry(tmpNamed),
      },
      buildEntries,
      tmpEntries,
    }
    assertExactPolicyProvisionalABuildResidueMetadata(initialResidueMetadata)
    const [sourceBytes, helperBytes] = await Promise.all([
      completeHeldBytes(sourceHandle, provisionalABuildResidue.source.size),
      completeHeldBytes(helperHandle, provisionalABuildResidue.helper.size),
    ])
    assertExactPolicyProvisionalABuildResidue({
      ...initialResidueMetadata,
      sourceSha256: hash(sourceBytes),
      helperSha256: hash(helperBytes),
    })
    const heldResidue = Object.freeze({
      build: buildHandle,
      source: sourceHandle,
      helper: helperHandle,
      tmp: tmpHandle,
    })
    const revalidateResidue = async () => {
      const [
        buildAfter,
        sourceAfter,
        helperAfter,
        tmpAfter,
        buildNamedAfter,
        sourceNamedAfter,
        helperNamedAfter,
        tmpNamedAfter,
      ] = await Promise.all([
        heldResidue.build.stat(),
        heldResidue.source.stat(),
        heldResidue.helper.stat(),
        heldResidue.tmp.stat(),
        lstat(buildPath),
        lstat(sourcePath),
        lstat(helperPath),
        lstat(tmpPath),
      ])
      const [buildAfterEntries, tmpAfterEntries] = await Promise.all([
        readdir(buildPath).then((entries) => entries.sort()),
        readdir(tmpPath).then((entries) => entries.sort()),
      ])
      const currentResidueMetadata = {
        expectedUid: expectedReentryLock.uid,
        held: {
          build: provisionalABuildResidueEntry(buildAfter),
          source: provisionalABuildResidueEntry(sourceAfter),
          helper: provisionalABuildResidueEntry(helperAfter),
          tmp: provisionalABuildResidueEntry(tmpAfter),
        },
        named: {
          build: provisionalABuildResidueEntry(buildNamedAfter),
          source: provisionalABuildResidueEntry(sourceNamedAfter),
          helper: provisionalABuildResidueEntry(helperNamedAfter),
          tmp: provisionalABuildResidueEntry(tmpNamedAfter),
        },
        buildEntries: buildAfterEntries,
        tmpEntries: tmpAfterEntries,
      }
      assertExactPolicyProvisionalABuildResidueMetadata(currentResidueMetadata)
      const [sourceAfterBytes, helperAfterBytes] = await Promise.all([
        completeHeldBytes(
          heldResidue.source,
          provisionalABuildResidue.source.size,
        ),
        completeHeldBytes(
          heldResidue.helper,
          provisionalABuildResidue.helper.size,
        ),
      ])
      assertExactPolicyProvisionalABuildResidue({
        ...currentResidueMetadata,
        sourceSha256: hash(sourceAfterBytes),
        helperSha256: hash(helperAfterBytes),
      })
    }
    const workerSha256 = hash(await readFile(lockWorkerPath))
    await commandLockCapabilityProbe(
      repositoryRoot,
      workerSha256,
      expectedReentryLock,
    )
    custody = await openDerivationLock(repositoryRoot, expectedReentryLock)
    const activeCustody = custody
    await validateNamedLock(
      activeCustody.lock,
      activeCustody.lockPath,
      activeCustody.identity,
    )
    const authority = await runPolicyNativeToolchainDerivation({
      repositoryRoot,
      nativeAuthoritySha256,
    })
    await validateNamedLock(
      activeCustody.lock,
      activeCustody.lockPath,
      activeCustody.identity,
    )
    if (authority.sourceSha256 !== provisionalABuildResidue.source.sha256)
      throw new Error('policy-native-authority')
    await revalidateResidue()
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
      compilerResourceIdentitySha256: authority.compilerResourceIdentitySha256,
      compilerResourceDevice: authority.compilerResourceDevice,
      compilerResourceInode: authority.compilerResourceInode,
      headerSetSha256: authority.headerSetSha256,
      diagnosticSha256: authority.diagnosticSha256,
      diagnosticSemanticSha256: authority.diagnosticSemanticSha256,
      linkerIdentitySha256: authority.linkerIdentitySha256,
      linkerSha256: authority.linkerSha256,
      linkerDevice: authority.linkerDevice,
      linkerInode: authority.linkerInode,
      compileContractSha256: authority.compileContractSha256,
      launchContractSha256: authority.launchContractSha256,
      launcherSha256: authority.launcherSha256,
      nativeAuthoritySha256: authority.nativeAuthoritySha256,
      lockPreflightWorkerSha256: authority.lockPreflightWorkerSha256,
      helperSha256: provisionalABuildResidue.helper.sha256,
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
    const provenancePackage = {
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
      provenancePackage,
      heldEvidenceSha256: hashAuthority(heldCore),
    }
    const result = await runAcceptedHelper(
      activeCustody,
      capability,
      3,
      async () => ({
        operation: {
          kind: 'metadata-check',
          role: 'command-lock',
          evidence: {
            uid: String(activeCustody.identity.uid),
            device: activeCustody.identity.device,
            inode: activeCustody.identity.inode,
            links: '1',
            mode: '384',
            size: '0',
          },
          authorityFd: activeCustody.lock.fd,
        },
        precheck: revalidateResidue,
        postcheck: revalidateResidue,
      }),
    )
    const helperExitCode = residueHelperExitCode(result)
    await validateNamedLock(
      activeCustody.lock,
      activeCustody.lockPath,
      activeCustody.identity,
    )
    return Object.freeze({ helperExitCode })
  } catch (error) {
    operationFailure = error
    throw error
  } finally {
    let finalizationFailure: unknown
    for (const handle of [tmpHandle, helperHandle, sourceHandle, buildHandle]) {
      if (handle === undefined) continue
      try {
        await handle.close()
      } catch (error) {
        finalizationFailure ??= error
      }
    }
    if (custody !== undefined)
      try {
        await closeDerivationLock(custody)
      } catch (error) {
        finalizationFailure ??= error
      }
    if (operationFailure === undefined && finalizationFailure !== undefined)
      throw finalizationFailure
  }
}

/**
 * Decision 131 is deliberately a new child boundary: it never invokes the
 * retained helper and reports only the probe's closed admission class.
 */
export async function diagnosePolicyProvisionalAFdMap(input: unknown): Promise<
  Readonly<{
    fdMapStatus:
      | 'exact'
      | 'fd3-invalid'
      | 'unexpected-fd'
      | 'open-max-invalid'
      | 'scan-indeterminate'
  }>
> {
  exactObject(input, [
    'repositoryRoot',
    'nativeAuthoritySha256',
    'rootNonceSha256',
    'commandLock',
    'probeSourceSha256',
    'revalidateOuter',
  ])
  const repositoryRoot = safeRoot(input.repositoryRoot)
  const nativeAuthoritySha256 = sha256(input.nativeAuthoritySha256)
  const rootNonceSha256 = sha256(input.rootNonceSha256)
  void rootNonceSha256
  const expectedProbeSourceSha256 = sha256(input.probeSourceSha256)
  if (typeof input.revalidateOuter !== 'function')
    throw new Error('policy-native-authority')
  const revalidateOuter = input.revalidateOuter as () => Promise<void>
  const expectedLock = reentryLockIdentity(input.commandLock)
  if (expectedLock === null) throw new Error('policy-native-authority')
  const buildPath = join(
    repositoryRoot,
    '.local/m45/.policy-exclusive-promotion-build',
  )
  const residueSourcePath = join(buildPath, 'exclusive-promotion-helper.c')
  const residueHelperPath = join(buildPath, 'exclusive-promotion-helper')
  const residueTmpPath = join(buildPath, 'tmp')
  let heldResidue: readonly FileHandle[] | undefined
  const validateResidue = async () => {
    if (heldResidue === undefined) {
      const opened: FileHandle[] = []
      try {
        for (const [path, flags] of [
          [
            buildPath,
            fsConstants.O_RDONLY |
              fsConstants.O_DIRECTORY |
              darwinFlags.noFollow |
              darwinFlags.closeOnExec,
          ],
          [
            residueSourcePath,
            fsConstants.O_RDONLY |
              darwinFlags.noFollow |
              darwinFlags.closeOnExec,
          ],
          [
            residueHelperPath,
            fsConstants.O_RDONLY |
              darwinFlags.noFollow |
              darwinFlags.closeOnExec,
          ],
          [
            residueTmpPath,
            fsConstants.O_RDONLY |
              fsConstants.O_DIRECTORY |
              darwinFlags.noFollow |
              darwinFlags.closeOnExec,
          ],
        ] as const)
          opened.push(await open(path, flags))
        heldResidue = Object.freeze(opened)
      } catch (error) {
        await Promise.allSettled(opened.map((handle) => handle.close()))
        throw error
      }
    }
    const handles = heldResidue
    const [
      build,
      source,
      helper,
      tmp,
      namedBuild,
      namedSource,
      namedHelper,
      namedTmp,
      buildEntries,
      tmpEntries,
    ] = await Promise.all([
      handles[0].stat(),
      handles[1].stat(),
      handles[2].stat(),
      handles[3].stat(),
      lstat(buildPath),
      lstat(residueSourcePath),
      lstat(residueHelperPath),
      lstat(residueTmpPath),
      readdir(buildPath).then((entries) => entries.sort()),
      readdir(residueTmpPath).then((entries) => entries.sort()),
    ])
    const metadata = {
      expectedUid: expectedLock.uid,
      held: {
        build: provisionalABuildResidueEntry(build),
        source: provisionalABuildResidueEntry(source),
        helper: provisionalABuildResidueEntry(helper),
        tmp: provisionalABuildResidueEntry(tmp),
      },
      named: {
        build: provisionalABuildResidueEntry(namedBuild),
        source: provisionalABuildResidueEntry(namedSource),
        helper: provisionalABuildResidueEntry(namedHelper),
        tmp: provisionalABuildResidueEntry(namedTmp),
      },
      buildEntries,
      tmpEntries,
    }
    assertExactPolicyProvisionalABuildResidueMetadata(metadata)
    assertExactPolicyProvisionalABuildResidue({
      ...metadata,
      sourceSha256: hash(await completeHeldBytes(handles[1], source.size)),
      helperSha256: hash(await completeHeldBytes(handles[2], helper.size)),
    })
  }
  const parentPath = '/private/tmp'
  const probePath = `${fdAdmissionProbeScratchRoot}/probe`
  let parentHandle: FileHandle | undefined
  let scratchHandle: FileHandle | undefined
  let probeHandle: FileHandle | undefined
  let probeSourceHandle: FileHandle | undefined
  let custody: Awaited<ReturnType<typeof openDerivationLock>> | undefined
  let created = false
  let operationFailure: unknown
  let parentIdentity: Readonly<{ dev: number; ino: number }> | undefined
  let scratchIdentity: Readonly<{ dev: number; ino: number }> | undefined
  let probeIdentity: Readonly<{ dev: number; ino: number }> | undefined
  let revalidateBoundary:
    ((expectedEntries: readonly string[]) => Promise<void>) | undefined
  let revalidateTrackedSource: (() => Promise<void>) | undefined
  try {
    // The retained D129 tuple is admitted before this diagnostic creates even
    // its disposable scratch directory.
    await validateResidue()
    probeSourceHandle = await open(
      fdAdmissionProbeSourcePath,
      fsConstants.O_RDONLY | darwinFlags.noFollow | darwinFlags.closeOnExec,
    )
    const [probeSourceStat, probeSourceNamed, workerBytes] = await Promise.all([
      probeSourceHandle.stat(),
      lstat(fdAdmissionProbeSourcePath),
      readFile(lockWorkerPath),
    ])
    if (
      !probeSourceStat.isFile() ||
      !probeSourceNamed.isFile() ||
      probeSourceStat.dev !== probeSourceNamed.dev ||
      probeSourceStat.ino !== probeSourceNamed.ino ||
      probeSourceStat.uid !== probeSourceNamed.uid ||
      (probeSourceStat.mode & 0o7777) !== (probeSourceNamed.mode & 0o7777) ||
      probeSourceStat.nlink !== 1 ||
      probeSourceNamed.nlink !== 1 ||
      probeSourceStat.size !== probeSourceNamed.size ||
      probeSourceStat.size <= 0 ||
      probeSourceStat.size > maxFdAdmissionProbeBytes
    )
      throw new Error('policy-native-authority')
    const revalidateScratch = async (expectedEntries: readonly string[]) => {
      const [held, named, entries] = await Promise.all([
        scratchHandle!.stat(),
        lstat(fdAdmissionProbeScratchRoot),
        readdir(fdAdmissionProbeScratchRoot).then((value) => value.sort()),
      ])
      assertFdAdmissionProbeScratchSnapshot({
        held: fdAdmissionProbeSnapshotMetadata(held),
        named: fdAdmissionProbeSnapshotMetadata(named),
        expectedUid: expectedLock.uid,
        expectedDev: scratchHeld.dev,
        expectedIno: scratchHeld.ino,
        entries,
        expectedEntries,
      })
    }
    const probeSourceSha256 = hash(
      await completeHeldBytes(probeSourceHandle, probeSourceStat.size),
    )
    if (probeSourceSha256 !== expectedProbeSourceSha256)
      throw new Error('policy-native-authority')
    const revalidateProbeSource = async () => {
      const [held, named] = await Promise.all([
        probeSourceHandle!.stat(),
        lstat(fdAdmissionProbeSourcePath),
      ])
      if (
        !held.isFile() ||
        !named.isFile() ||
        held.dev !== probeSourceStat.dev ||
        held.ino !== probeSourceStat.ino ||
        held.uid !== probeSourceStat.uid ||
        (held.mode & 0o7777) !== (probeSourceStat.mode & 0o7777) ||
        held.nlink !== probeSourceStat.nlink ||
        held.size !== probeSourceStat.size ||
        named.dev !== probeSourceStat.dev ||
        named.ino !== probeSourceStat.ino ||
        named.uid !== probeSourceStat.uid ||
        (named.mode & 0o7777) !== (probeSourceStat.mode & 0o7777) ||
        named.nlink !== probeSourceStat.nlink ||
        named.size !== probeSourceStat.size ||
        hash(
          await completeHeldBytes(probeSourceHandle!, probeSourceStat.size),
        ) !== probeSourceSha256
      )
        throw new Error('policy-native-authority')
    }
    revalidateTrackedSource = revalidateProbeSource
    const [repositoryStat, parentNamed] = await Promise.all([
      lstat(repositoryRoot),
      lstat(parentPath),
    ])
    if (
      !parentNamed.isDirectory() ||
      parentNamed.isSymbolicLink() ||
      parentNamed.uid !== 0 ||
      (parentNamed.mode & 0o7777) !== 0o1777 ||
      parentNamed.dev !== repositoryStat.dev
    )
      throw new Error('policy-native-authority')
    parentHandle = await open(
      parentPath,
      fsConstants.O_RDONLY |
        fsConstants.O_DIRECTORY |
        darwinFlags.noFollow |
        darwinFlags.closeOnExec,
    )
    const parentHeld = await parentHandle.stat()
    parentIdentity = { dev: parentHeld.dev, ino: parentHeld.ino }
    const revalidateParent = async () => {
      const [held, named] = await Promise.all([
        parentHandle!.stat(),
        lstat(parentPath),
      ])
      if (
        !held.isDirectory() ||
        held.uid !== 0 ||
        (held.mode & 0o7777) !== 0o1777 ||
        held.dev !== parentHeld.dev ||
        held.ino !== parentHeld.ino ||
        !named.isDirectory() ||
        named.isSymbolicLink() ||
        named.uid !== 0 ||
        (named.mode & 0o7777) !== 0o1777 ||
        named.dev !== parentHeld.dev ||
        named.ino !== parentHeld.ino
      )
        throw new Error('policy-native-authority')
    }
    await revalidateParent()
    try {
      await lstat(fdAdmissionProbeScratchRoot)
      throw new Error('policy-native-authority')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await revalidateOuter()
    await validateResidue()
    await revalidateProbeSource()
    await revalidateParent()
    await mkdir(fdAdmissionProbeScratchRoot, { mode: 0o700 })
    created = true
    scratchHandle = await open(
      fdAdmissionProbeScratchRoot,
      fsConstants.O_RDONLY |
        fsConstants.O_DIRECTORY |
        darwinFlags.noFollow |
        darwinFlags.closeOnExec,
    )
    const [scratchHeld, scratchNamed] = await Promise.all([
      scratchHandle.stat(),
      lstat(fdAdmissionProbeScratchRoot),
    ])
    scratchIdentity = { dev: scratchHeld.dev, ino: scratchHeld.ino }
    if (
      !scratchHeld.isDirectory() ||
      scratchHeld.uid !== expectedLock.uid ||
      scratchHeld.dev !== parentHeld.dev ||
      scratchHeld.ino !== scratchNamed.ino ||
      (scratchHeld.mode & 0o7777) !== 0o700 ||
      scratchHeld.nlink !== 2 ||
      (await readdir(fdAdmissionProbeScratchRoot)).length !== 0
    )
      throw new Error('policy-native-authority')
    const beforeBoundary = async (expectedEntries: readonly string[]) => {
      await revalidateOuter()
      await validateResidue()
      await revalidateProbeSource()
      await revalidateParent()
      await revalidateScratch(expectedEntries)
      if (custody !== undefined)
        await validateNamedLock(
          custody.lock,
          custody.lockPath,
          custody.identity,
        )
    }
    const beforeEmptyChild = () => beforeBoundary([])
    const beforeProbeBoundary = () => beforeBoundary(['probe'])
    revalidateBoundary = beforeBoundary
    const activeRevalidateBoundary = revalidateBoundary
    if (activeRevalidateBoundary === undefined)
      throw new Error('policy-native-authority')
    await activeRevalidateBoundary([])
    await commandLockCapabilityProbe(
      repositoryRoot,
      hash(workerBytes),
      expectedLock,
      beforeEmptyChild,
    )
    custody = await openDerivationLock(repositoryRoot, expectedLock)
    const activeCustody = custody
    await beforeEmptyChild()
    const authority = await runPolicyFdAdmissionProbeToolchainDerivation({
      repositoryRoot,
      nativeAuthoritySha256,
      probeSourceSha256,
      beforeEmptyChild,
    })
    await revalidatePolicyToolchainAuthority(authority)
    const compilerCapability = {
      repositoryRoot,
      compilerPath: authority.compilerPath,
      sdkRoot: authority.sdkRoot,
      compilerResourceRoot: authority.compilerResourceRoot,
      authorityPackage: authority,
    }
    await beforeEmptyChild()
    successfulDiagnostic(
      await broker.runFdAdmissionProbeCompiler(compilerCapability, {
        repositoryRoot,
        scratchRoot: fdAdmissionProbeScratchRoot,
        probeSourceSha256,
      }),
    )
    await validateResidue()
    if (
      (await readdir(fdAdmissionProbeScratchRoot)).sort().join('\0') !== 'probe'
    )
      throw new Error('policy-native-authority')
    probeHandle = await open(
      probePath,
      fsConstants.O_RDONLY | darwinFlags.noFollow | darwinFlags.closeOnExec,
    )
    await beforeProbeBoundary()
    const [probeBeforeChmod, probeNamedBeforeChmod] = await Promise.all([
      probeHandle.stat(),
      lstat(probePath),
    ])
    if (
      !probeBeforeChmod.isFile() ||
      !probeNamedBeforeChmod.isFile() ||
      probeBeforeChmod.uid !== expectedLock.uid ||
      probeNamedBeforeChmod.uid !== expectedLock.uid ||
      probeBeforeChmod.dev !== scratchHeld.dev ||
      probeNamedBeforeChmod.dev !== scratchHeld.dev ||
      probeBeforeChmod.ino !== probeNamedBeforeChmod.ino ||
      probeBeforeChmod.nlink !== 1 ||
      probeNamedBeforeChmod.nlink !== 1 ||
      probeBeforeChmod.size <= 0 ||
      probeBeforeChmod.size > maxFdAdmissionProbeBytes ||
      probeNamedBeforeChmod.size !== probeBeforeChmod.size ||
      (probeBeforeChmod.mode & 0o7000) !== 0 ||
      (probeNamedBeforeChmod.mode & 0o7777) !== (probeBeforeChmod.mode & 0o7777)
    )
      throw new Error('policy-native-authority')
    await probeHandle.chmod(0o500)
    const probeBefore = await probeHandle.stat()
    const probeNamedBefore = await lstat(probePath)
    if (
      !probeBefore.isFile() ||
      probeBefore.uid !== expectedLock.uid ||
      probeBefore.uid !== probeBeforeChmod.uid ||
      probeBefore.dev !== scratchHeld.dev ||
      probeBefore.dev !== probeBeforeChmod.dev ||
      probeBefore.ino !== probeBeforeChmod.ino ||
      probeNamedBefore.dev !== probeBefore.dev ||
      probeBefore.ino !== probeNamedBefore.ino ||
      probeNamedBefore.uid !== probeBefore.uid ||
      probeBefore.nlink !== 1 ||
      probeBefore.nlink !== probeBeforeChmod.nlink ||
      probeNamedBefore.nlink !== 1 ||
      probeBefore.size <= 0 ||
      probeBefore.size > maxFdAdmissionProbeBytes ||
      probeBefore.size !== probeBeforeChmod.size ||
      probeNamedBefore.size !== probeBefore.size ||
      (probeBefore.mode & 0o7777) !== 0o500 ||
      (probeNamedBefore.mode & 0o7777) !== 0o500
    )
      throw new Error('policy-native-authority')
    const probeSha256 = hash(
      await completeHeldBytes(probeHandle, probeBefore.size),
    )
    probeIdentity = { dev: probeBefore.dev, ino: probeBefore.ino }
    const revalidate = async () => {
      const [sourceAfter, sourceNamedAfter, probeAfter, namedAfter] =
        await Promise.all([
          probeSourceHandle!.stat(),
          lstat(fdAdmissionProbeSourcePath),
          probeHandle!.stat(),
          lstat(probePath),
        ])
      if (
        sourceAfter.dev !== probeSourceStat.dev ||
        sourceAfter.ino !== probeSourceStat.ino ||
        sourceNamedAfter.dev !== probeSourceStat.dev ||
        sourceNamedAfter.ino !== probeSourceStat.ino ||
        hash(
          await completeHeldBytes(probeSourceHandle!, probeSourceStat.size),
        ) !== probeSourceSha256
      )
        throw new Error('policy-native-authority')
      assertFdAdmissionProbeFileSnapshot({
        held: fdAdmissionProbeSnapshotMetadata(probeAfter),
        named: fdAdmissionProbeSnapshotMetadata(namedAfter),
        expectedUid: probeBefore.uid,
        expectedDev: probeBefore.dev,
        expectedIno: probeBefore.ino,
        expectedSize: probeBefore.size,
        heldSha256: hash(
          await completeHeldBytes(probeHandle!, probeBefore.size),
        ),
        expectedSha256: probeSha256,
      })
    }
    await beforeProbeBoundary()
    await revalidate()
    const result = await runFdAdmissionProbeWithCustodyChecks(
      activeCustody,
      { repositoryRoot, probePath, probeSha256 },
      async () => {
        await activeRevalidateBoundary(['probe'])
        await revalidate()
      },
      async () => {
        await activeRevalidateBoundary(['probe'])
        await revalidate()
      },
    )
    const statuses = {
      0: 'exact',
      21: 'fd3-invalid',
      23: 'unexpected-fd',
      24: 'open-max-invalid',
      25: 'scan-indeterminate',
    } as const
    const fdMapStatus = statuses[result.code as keyof typeof statuses]
    if (
      fdMapStatus === undefined ||
      result.stdout.byteLength !== 0 ||
      result.stderr.byteLength !== 0
    )
      throw new Error('policy-native-authority')
    await revalidate()
    await validateResidue()
    return Object.freeze({ fdMapStatus })
  } catch (error) {
    operationFailure = error
    throw error
  } finally {
    let failure: unknown
    try {
      await finalizeFdAdmissionProbeScratch(
        created && operationFailure === undefined,
        {
          closeProbe: async () => {
            if (probeHandle === undefined) return
            await probeHandle.close()
            probeHandle = undefined
          },
          validateProbeForUnlink: async () => {
            const activeScratchHandle = scratchHandle
            if (activeScratchHandle === undefined)
              throw new Error('policy-native-authority')
            const finalRevalidateBoundary = revalidateBoundary
            if (finalRevalidateBoundary === undefined)
              throw new Error('policy-native-authority')
            const expectedParentIdentity = parentIdentity
            const expectedScratchIdentity = scratchIdentity
            if (
              expectedParentIdentity === undefined ||
              expectedScratchIdentity === undefined
            )
              throw new Error('policy-native-authority')
            await finalRevalidateBoundary(['probe'])
            const [parentAfter, scratchHeld, scratchNamed] = await Promise.all([
              parentHandle!.stat(),
              activeScratchHandle.stat(),
              lstat(fdAdmissionProbeScratchRoot),
            ])
            if (
              parentIdentity === undefined ||
              parentAfter.dev !== parentIdentity.dev ||
              parentAfter.ino !== parentIdentity.ino ||
              scratchIdentity === undefined ||
              !scratchHeld.isDirectory() ||
              scratchHeld.uid !== expectedLock.uid ||
              scratchHeld.dev !== parentAfter.dev ||
              scratchHeld.ino !== scratchIdentity.ino ||
              (scratchHeld.mode & 0o7777) !== 0o700 ||
              scratchHeld.nlink !== 2 ||
              scratchNamed.dev !== scratchIdentity.dev ||
              scratchNamed.ino !== scratchIdentity.ino
            )
              throw new Error('policy-native-authority')
            if (
              (await readdir(fdAdmissionProbeScratchRoot)).sort().join('\0') !==
              'probe'
            )
              throw new Error('policy-native-authority')
            const probeNamedBeforeUnlink = await lstat(probePath)
            if (
              probeNamedBeforeUnlink.dev !== scratchIdentity.dev ||
              probeIdentity === undefined ||
              probeNamedBeforeUnlink.ino !== probeIdentity.ino ||
              probeNamedBeforeUnlink.uid !== expectedLock.uid ||
              probeNamedBeforeUnlink.nlink !== 1 ||
              (probeNamedBeforeUnlink.mode & 0o7777) !== 0o500
            )
              throw new Error('policy-native-authority')
          },
          unlinkProbe: async () => unlink(probePath),
          validateEmptyForRemoval: async () => {
            const activeScratchHandle = scratchHandle
            if (activeScratchHandle === undefined)
              throw new Error('policy-native-authority')
            const finalRevalidateBoundary = revalidateBoundary
            if (finalRevalidateBoundary === undefined)
              throw new Error('policy-native-authority')
            const expectedParentIdentity = parentIdentity
            const expectedScratchIdentity = scratchIdentity
            if (
              expectedParentIdentity === undefined ||
              expectedScratchIdentity === undefined
            )
              throw new Error('policy-native-authority')
            if ((await readdir(fdAdmissionProbeScratchRoot)).length !== 0)
              throw new Error('policy-native-authority')
            await finalRevalidateBoundary([])
            const [
              parentBeforeRemoval,
              scratchBeforeRemoval,
              namedBeforeRemoval,
            ] = await Promise.all([
              parentHandle!.stat(),
              activeScratchHandle.stat(),
              lstat(fdAdmissionProbeScratchRoot),
            ])
            if (
              parentBeforeRemoval.dev !== expectedParentIdentity.dev ||
              parentBeforeRemoval.ino !== expectedParentIdentity.ino ||
              scratchBeforeRemoval.dev !== expectedScratchIdentity.dev ||
              scratchBeforeRemoval.ino !== expectedScratchIdentity.ino ||
              scratchBeforeRemoval.nlink !== 2 ||
              namedBeforeRemoval.dev !== expectedScratchIdentity.dev ||
              namedBeforeRemoval.ino !== expectedScratchIdentity.ino
            )
              throw new Error('policy-native-authority')
          },
          closeScratch: async () => {
            if (scratchHandle === undefined)
              throw new Error('policy-native-authority')
            await scratchHandle.close()
            scratchHandle = undefined
          },
          removeScratch: async () => rmdir(fdAdmissionProbeScratchRoot),
          assertAbsentAndFinal: async () => {
            for (const path of [probePath, fdAdmissionProbeScratchRoot])
              try {
                await lstat(path)
                throw new Error('policy-native-authority')
              } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                  throw error
              }
            if (revalidateTrackedSource === undefined)
              throw new Error('policy-native-authority')
            await revalidateOuter()
            await validateResidue()
            await revalidateTrackedSource()
            if (custody === undefined)
              throw new Error('policy-native-authority')
            await validateNamedLock(
              custody.lock,
              custody.lockPath,
              custody.identity,
            )
            const [parentFinalHeld, parentFinalNamed] = await Promise.all([
              parentHandle!.stat(),
              lstat(parentPath),
            ])
            if (
              parentIdentity === undefined ||
              !parentFinalHeld.isDirectory() ||
              parentFinalHeld.uid !== 0 ||
              (parentFinalHeld.mode & 0o7777) !== 0o1777 ||
              parentFinalHeld.dev !== parentIdentity.dev ||
              parentFinalHeld.ino !== parentIdentity.ino ||
              !parentFinalNamed.isDirectory() ||
              parentFinalNamed.uid !== 0 ||
              (parentFinalNamed.mode & 0o7777) !== 0o1777 ||
              parentFinalNamed.dev !== parentIdentity.dev ||
              parentFinalNamed.ino !== parentIdentity.ino
            )
              throw new Error('policy-native-authority')
            await probeSourceHandle!.close()
            probeSourceHandle = undefined
          },
        },
      )
    } catch (error) {
      failure ??= error
    }
    if (probeSourceHandle !== undefined)
      try {
        await probeSourceHandle.close()
      } catch (error) {
        failure ??= error
      }
    if (scratchHandle !== undefined)
      try {
        await scratchHandle.close()
      } catch (error) {
        failure ??= error
      }
    if (parentHandle !== undefined)
      try {
        await parentHandle.close()
      } catch (error) {
        failure ??= error
      }
    if (custody !== undefined)
      try {
        await closeDerivationLock(custody)
      } catch (error) {
        failure ??= error
      }
    if (heldResidue !== undefined)
      for (const handle of [...heldResidue].reverse())
        try {
          await handle.close()
        } catch (error) {
          failure ??= error
        }
    if (failure !== undefined) throw failure
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
          'sharedTerminal',
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
  const sharedTerminal =
    workflow === 'B-candidate'
      ? sharedTerminalInput(input.sharedTerminal)
      : undefined
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
  let aclFixtureIdentitySha256: string | undefined
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
      'compilerResourceIdentitySha256',
      'compilerResourceDevice',
      'compilerResourceInode',
      'headerSetSha256',
      'diagnosticSha256',
      'diagnosticSemanticSha256',
      'linkerIdentitySha256',
      'linkerSha256',
      'linkerDevice',
      'linkerInode',
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
    await revalidatePolicyToolchainAuthority(authority)
    const build = await broker.runCompilerBuild({
      repositoryRoot,
      compilerPath: safeRoot(authority.compilerPath),
      sdkRoot: safeRoot(authority.sdkRoot),
      compilerResourceRoot: safeRoot(authority.compilerResourceRoot),
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
      const capabilityProbeMetadata = new Map<
        string,
        Readonly<{ role: string; exitCode: 0; evidenceSha256: string }>
      >()
      const promotionProbe = new Map<
        'success' | 'collision',
        Readonly<{
          exitCode: 0 | 10
          sourceBeforeSha256: string
          sourceAfterSha256: string
          destinationBeforeSha256: string
          destinationAfterSha256: string
          sourceBeforeInventory: readonly string[]
          sourceAfterInventory: readonly string[]
          destinationBeforeInventory: readonly string[]
          destinationAfterInventory: readonly string[]
          sourceParent: Readonly<Record<string, unknown>>
          destinationParent: Readonly<Record<string, unknown>>
          sourcePromotion: Readonly<Record<string, unknown>>
          collisionDestination: Readonly<Record<string, unknown>> | null
          lifecycle: CandidateLifecycleResult
          fdObservation: ChildFdObservation
        }>
      >()
      const deleteProbeRows: Array<
        Readonly<{
          role: string
          parentBeforeEntries: readonly string[]
          parentBeforeLinks: number
          parentAfterEntries: readonly string[]
          parentAfterLinks: number
          childName: string
          child: Readonly<Record<string, unknown>>
          childIdentitySha256: string
          lifecycle: CandidateLifecycleResult
          fdObservation: ChildFdObservation
        }>
      > = []
      let lastChildFdObservation: ChildFdObservation | undefined
      const fdProbeMap = new Map<
        'metadata' | 'acl-fixture' | 'promotion' | 'delete-entry' | 'terminal',
        Readonly<{
          observation: ChildFdObservation
          lifecycle: CandidateLifecycleResult
        }>
      >()
      let lastPreparedOperation: unknown

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
            lastChildFdObservation = undefined
          },
          onOperation: (operation, observation) => {
            lastChildFdObservation = observation
            lastPreparedOperation = operation
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
            const kind =
              lastPreparedOperation !== null &&
              typeof lastPreparedOperation === 'object' &&
              'kind' in lastPreparedOperation
                ? (lastPreparedOperation as { kind?: unknown }).kind
                : undefined
            const mode =
              kind === 'metadata-check'
                ? 'metadata'
                : kind === 'acl-fixture'
                  ? 'acl-fixture'
                  : kind === 'preflight-promotion'
                    ? 'promotion'
                    : kind === 'delete-entry'
                      ? 'delete-entry'
                      : kind === 'delete-build-terminal'
                        ? 'terminal'
                        : undefined
            if (mode !== undefined && lastChildFdObservation !== undefined)
              fdProbeMap.set(mode, {
                observation: lastChildFdObservation,
                lifecycle: current,
              })
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
      ] as const) {
        let observedEvidence: Readonly<Record<string, unknown>> | undefined
        await runCandidate(3, async (openChildAuthority) => {
          const handle =
            path === undefined || flags === undefined
              ? custody.lock
              : await openChildAuthority(path, flags)
          const evidence = metadataEvidence(await handle.stat())
          observedEvidence = evidence
          return {
            kind: 'metadata-check',
            role,
            evidence,
            authorityFd: handle.fd,
          }
        })
        if (observedEvidence === undefined)
          throw new Error('policy-native-authority')
        capabilityProbeMetadata.set(role, {
          role,
          exitCode: 0,
          evidenceSha256: hashAuthority(observedEvidence),
        })
      }

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
      aclFixtureIdentitySha256 = hashAuthority(
        metadataEvidence(await lstat(aclPath)),
      )
      checkpoint = 'P13'
      const runPreflightMetadata = async (
        role: 'preflight-root' | 'preflight-directory' | 'preflight-file',
        path: string,
        flags: number,
        accepted = 0,
      ) => {
        let observedEvidence: Readonly<Record<string, unknown>> | undefined
        const lifecycle = await runCandidate(
          3,
          async (openChildAuthority) => {
            const handle = await openChildAuthority(path, flags)
            const evidence = metadataEvidence(await handle.stat())
            observedEvidence = evidence
            return {
              kind: 'metadata-check',
              role,
              evidence,
              authorityFd: handle.fd,
            }
          },
          accepted,
        )
        if (observedEvidence === undefined)
          throw new Error('policy-native-authority')
        capabilityProbeMetadata.set(role, {
          role,
          exitCode: 0,
          evidenceSha256: hashAuthority(observedEvidence),
        })
        return lifecycle
      }
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
        const sourceFixturePath = join(
          preflightPath,
          `${sourceName}/fixture.bin`,
        )
        const destinationFixturePath = join(
          preflightPath,
          `${destinationName}/fixture.bin`,
        )
        const sourceBeforeSha256 = hash(await readFile(sourceFixturePath))
        const destinationBeforeSha256 = hash(
          await readFile(destinationFixturePath),
        )
        const [sourceBeforeInventory, destinationBeforeInventory] =
          await Promise.all([
            readdir(join(preflightPath, sourceName)).then((entries) =>
              entries.sort(),
            ),
            readdir(join(preflightPath, destinationName)).then((entries) =>
              entries.sort(),
            ),
          ])
        let observedPromotion:
          | Readonly<{
              sourceParent: Readonly<Record<string, unknown>>
              destinationParent: Readonly<Record<string, unknown>>
              sourcePromotion: Readonly<Record<string, unknown>>
              collisionDestination: Readonly<Record<string, unknown>> | null
            }>
          | undefined
        const lifecycle = await runCandidate(
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
            observedPromotion = {
              sourceParent: metadataEvidence(sourceStat),
              destinationParent: metadataEvidence(destinationStat),
              sourcePromotion: metadataEvidence(promotionStat),
              collisionDestination: collision
                ? metadataEvidence(collision)
                : null,
            }
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
        const [
          sourceAfter,
          destinationAfter,
          sourceAfterInventory,
          destinationAfterInventory,
        ] = await Promise.all([
          readFile(sourceFixturePath),
          readFile(destinationFixturePath),
          readdir(join(preflightPath, sourceName)).then((entries) =>
            entries.sort(),
          ),
          readdir(join(preflightPath, destinationName)).then((entries) =>
            entries.sort(),
          ),
        ])
        if (
          observedPromotion === undefined ||
          lastChildFdObservation === undefined
        )
          throw new Error('policy-native-authority')
        promotionProbe.set(outcome, {
          exitCode: lifecycle.code as 0 | 10,
          sourceBeforeSha256,
          sourceAfterSha256: hash(sourceAfter),
          destinationBeforeSha256,
          destinationAfterSha256: hash(destinationAfter),
          sourceBeforeInventory,
          sourceAfterInventory,
          destinationBeforeInventory,
          destinationAfterInventory,
          ...observedPromotion,
          lifecycle,
          fdObservation: lastChildFdObservation,
        })
      }
      // Fail closed: deletion rows are delegated to the helper, so any stale
      // public fixture is a terminal error rather than a JavaScript cleanup.
      const deleteRow = async (
        role: string,
        parentPath: string,
        childName: string,
        runner = runCandidate,
      ) => {
        const parentBefore = await lstat(parentPath)
        const childBefore = await lstat(join(parentPath, childName))
        const parentBeforeEntries = (await readdir(parentPath)).sort()
        const lifecycle = await runner(3, async (openChildAuthority) => {
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
        const parentAfter = await lstat(parentPath)
        const parentAfterEntries = (await readdir(parentPath)).sort()
        try {
          await lstat(join(parentPath, childName))
          throw new Error('policy-native-authority')
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
        deleteProbeRows.push({
          role,
          childName,
          parentBeforeEntries,
          parentBeforeLinks: parentBefore.nlink,
          parentAfterEntries,
          parentAfterLinks: parentAfter.nlink,
          child: metadataEvidence(childBefore),
          childIdentitySha256: hashAuthority(metadataEvidence(childBefore)),
          lifecycle,
          fdObservation:
            lastChildFdObservation ??
            (() => {
              throw new Error('policy-native-authority')
            })(),
        })
      }
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
        const parentBefore = await lstat(buildPath)
        const childBefore = await lstat(join(buildPath, name))
        const parentBeforeEntries = (await readdir(buildPath)).sort()
        const lifecycle = await runner(3, async (openChildAuthority) => {
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
        const parentAfter = await lstat(buildPath)
        const parentAfterEntries = (await readdir(buildPath)).sort()
        try {
          await lstat(join(buildPath, name))
          throw new Error('policy-native-authority')
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
        deleteProbeRows.push({
          role,
          childName: name,
          parentBeforeEntries,
          parentBeforeLinks: parentBefore.nlink,
          parentAfterEntries,
          parentAfterLinks: parentAfter.nlink,
          child: metadataEvidence(childBefore),
          childIdentitySha256: hashAuthority(metadataEvidence(childBefore)),
          lifecycle,
          fdObservation:
            lastChildFdObservation ??
            (() => {
              throw new Error('policy-native-authority')
            })(),
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
              kind:
                workflow === 'B-candidate'
                  ? 'delete-build-terminal-shared'
                  : 'delete-build-terminal',
              ...(workflow === 'B-candidate'
                ? {
                    phase: sharedTerminal!.phase,
                    siblings: sharedTerminal!.siblings,
                  }
                : {}),
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
      const aclInstall = await runAclFixture('install')
      aclMutationInFlight = false
      checkpoint = 'O1'
      const aclRejected = await runPreflightMetadata(
        'preflight-directory',
        aclPath,
        childDirectoryFlags,
        15,
      )
      aclMutationInFlight = true
      const aclRemove = await runAclFixture('remove')
      aclMutationInFlight = false
      checkpoint = 'P13'
      const aclReopened = await runPreflightMetadata(
        'preflight-directory',
        aclPath,
        childDirectoryFlags,
      )
      const aclProbe = {
        identitySha256: aclFixtureIdentitySha256,
        installExitCode: aclInstall.code as 0,
        rejectExitCode: aclRejected.code as 15,
        removeExitCode: aclRemove.code as 0,
        reopenExitCode: aclReopened.code as 0,
      }
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
      if (aclFixtureIdentitySha256 === undefined || aclProbe === undefined)
        throw new Error('policy-native-authority')
      const successPromotion = promotionProbe.get('success')
      const collisionPromotion = promotionProbe.get('collision')
      const expectedDeleteRoles = [
        'preflight-success-destination-promotion',
        'preflight-collision-source-promotion',
        'preflight-collision-destination-promotion',
        'preflight-success-source-file',
        'preflight-success-destination-file',
        'preflight-collision-source-file',
        'preflight-collision-destination-file',
        'preflight-success-source-directory',
        'preflight-success-destination-directory',
        'preflight-collision-source-directory',
        'preflight-collision-destination-directory',
        'preflight-acl-fixture-directory',
        'preflight-root',
        'build-source',
        'build-tmp',
      ] as const
      if (
        successPromotion === undefined ||
        collisionPromotion === undefined ||
        deleteProbeRows.length !== expectedDeleteRoles.length ||
        deleteProbeRows.some(
          (row, index) =>
            row.role !== expectedDeleteRoles[index] ||
            row.lifecycle.code !== 0 ||
            row.parentBeforeLinks !== 2 + row.parentBeforeEntries.length ||
            row.parentAfterLinks !== 2 + row.parentAfterEntries.length ||
            row.parentAfterLinks !== row.parentBeforeLinks - 1 ||
            row.parentAfterEntries.length !==
              row.parentBeforeEntries.length - 1,
        )
      )
        throw new Error('policy-native-authority')
      const observedFdMap = (
        mode:
          | 'metadata'
          | 'acl-fixture'
          | 'promotion'
          | 'delete-entry'
          | 'terminal',
      ) => {
        const observed = fdProbeMap.get(mode)
        if (observed === undefined) throw new Error('policy-native-authority')
        return {
          fillerParentFds: observed.observation.fillerParentFds,
          authorityParentFds: observed.observation.authorityParentFds,
          commandLockParentFd: observed.observation.commandLockParentFd,
          childTargets: observed.lifecycle.childDescriptorMap,
          argvCount: observed.lifecycle.argvCount,
          stdoutBytes: observed.lifecycle.stdoutBytes,
          stderrBytes: observed.lifecycle.stderrBytes,
          processGroupAbsent: observed.lifecycle.processGroupAbsent,
          streamsClosed: observed.lifecycle.streamsClosed,
        }
      }
      const observedLifecycle = (
        lifecycle: CandidateLifecycleResult,
        fdObservation: ChildFdObservation,
      ) => ({
        exitCode: lifecycle.code as 0,
        stdoutBytes: lifecycle.stdoutBytes,
        stderrBytes: lifecycle.stderrBytes,
        processGroupAbsent: lifecycle.processGroupAbsent,
        streamsClosed: lifecycle.streamsClosed,
        argvCount: lifecycle.argvCount,
        childTargets: lifecycle.childDescriptorMap,
        fillerParentFds: fdObservation.fillerParentFds,
        authorityParentFds: fdObservation.authorityParentFds,
        commandLockParentFd: fdObservation.commandLockParentFd,
      })
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
        ].map((role) => {
          const result = capabilityProbeMetadata.get(role)
          if (result === undefined) throw new Error('policy-native-authority')
          return { role, exitCode: result.exitCode }
        }),
        fdPreflight: {
          singleAuthorityTargets: [3],
          doubleAuthorityTargets: [3, 4],
          tripleAuthorityTargets: [3, 4, 5],
          quadAuthorityTargets: [3, 4, 5, 6],
          unexpectedDescriptorCount: 0,
        },
        aclFixture: {
          installExitCode: aclProbe.installExitCode,
          metadataRejectExitCode: aclProbe.rejectExitCode,
          removeExitCode: aclProbe.removeExitCode,
        },
        promotion: {
          successExitCode: successPromotion.exitCode,
          collisionExitCode: collisionPromotion.exitCode,
          collisionSourceBeforeSha256: collisionPromotion.sourceBeforeSha256,
          collisionSourceAfterSha256: collisionPromotion.sourceAfterSha256,
          collisionDestinationBeforeSha256:
            collisionPromotion.destinationBeforeSha256,
          collisionDestinationAfterSha256:
            collisionPromotion.destinationAfterSha256,
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
        capabilityProbe: {
          derivationHeldContender: {
            before: custody.identity,
            heldExitCode: 20,
            releasedExitCode: 0,
            after: custody.identity,
          },
          metadata: [
            'build-root',
            'build-tmp',
            'build-source',
            'build-helper',
            'preflight-root',
            'preflight-directory',
            'preflight-file',
            'command-lock',
          ].map((role) => {
            const result = capabilityProbeMetadata.get(role)
            if (result === undefined) throw new Error('policy-native-authority')
            return result
          }),
          fdMaps: [
            {
              mode: 'metadata',
              fillerTargets: [3, 4, 5],
              authorityTargets: [3],
              highestTarget: 3,
              observed: observedFdMap('metadata'),
            },
            {
              mode: 'acl-fixture',
              fillerTargets: [3, 4, 5],
              authorityTargets: [3],
              highestTarget: 3,
              observed: observedFdMap('acl-fixture'),
            },
            {
              mode: 'promotion',
              fillerTargets: [3, 4, 5, 6],
              authorityTargets: [3, 4, 5, 6],
              highestTarget: 6,
              observed: observedFdMap('promotion'),
            },
            {
              mode: 'delete-entry',
              fillerTargets: [3, 4, 5],
              authorityTargets: [3, 4, 5],
              highestTarget: 3,
              observed: observedFdMap('delete-entry'),
            },
            {
              mode: 'terminal',
              fillerTargets: [3, 4, 5, 6],
              authorityTargets: [3, 4, 5, 6],
              highestTarget: 6,
              observed: observedFdMap('terminal'),
            },
          ],
          aclFixture: {
            ...aclProbe,
          },
          promotion: {
            success: {
              ...successPromotion,
              lifecycle: observedLifecycle(
                successPromotion.lifecycle,
                successPromotion.fdObservation,
              ),
            },
            collision: {
              ...collisionPromotion,
              lifecycle: observedLifecycle(
                collisionPromotion.lifecycle,
                collisionPromotion.fdObservation,
              ),
            },
          },
          deletionRecords: deleteProbeRows.map((observed) => ({
            role: observed.role,
            childName: observed.childName,
            parentBeforeInventory: observed.parentBeforeEntries,
            parentBeforeInventorySha256: hashAuthority(
              observed.parentBeforeEntries,
            ),
            parentBeforeLinks: observed.parentBeforeLinks,
            parentAfterInventory: observed.parentAfterEntries,
            parentAfterInventorySha256: hashAuthority(
              observed.parentAfterEntries,
            ),
            parentAfterLinks: observed.parentAfterLinks,
            child: observed.child,
            childIdentitySha256: observed.childIdentitySha256,
            lifecycle: observedLifecycle(
              observed.lifecycle,
              observed.fdObservation,
            ),
          })),
          apfsDeleteRows: deleteProbeRows.map((observed, index) => ({
            row: [
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
              'R14',
              'R15',
            ][index],
            beforeEntryCount: observed.parentBeforeEntries.length,
            beforeLinks: observed.parentBeforeLinks,
            afterEntryCount: observed.parentAfterEntries.length,
            afterLinks: observed.parentAfterLinks,
          })),
          cleanupAbsence: {
            buildAbsent: true,
            preflightAbsent: true,
            trackedSourceSha256: authority.sourceSha256,
            trackedContractSha256: authority.launchContractSha256,
            trackedLauncherSha256: authority.launcherSha256,
            trackedAuthoritySha256: authority.nativeAuthoritySha256,
            trackedWorkerSha256: authority.lockPreflightWorkerSha256,
          },
        },
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
            sharedSiblings:
              workflow === 'B-candidate' ? sharedTerminal?.siblings : undefined,
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
                sharedSiblings:
                  workflow === 'B-candidate'
                    ? sharedTerminal?.siblings
                    : undefined,
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
  if (process.env.NODE_ENV !== 'test')
    throw new Error('policy-native-c-disabled')
  return runPolicyProvisionalBuildWorkflow(input, 'C-accepted')
}

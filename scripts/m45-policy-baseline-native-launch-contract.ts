const sha256Pattern = /^[a-f0-9]{64}$/u
const decimalPattern = /^(?:0|[1-9][0-9]*)$/u
const safeAbsolutePathPattern = /^\/(?:[A-Za-z0-9._+@-]+\/)*[A-Za-z0-9._+@-]+$/u

export class PolicyNativeLaunchContractError extends Error {
  constructor() {
    super('policy-native-launch-contract')
    this.name = 'PolicyNativeLaunchContractError'
  }
}

function exactKeys(
  value: unknown,
  keys: readonly string[],
): asserts value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')
  )
    throw new PolicyNativeLaunchContractError()
}

function safeAbsolutePath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !safeAbsolutePathPattern.test(value) ||
    value.split('/').some((segment) => segment === '.' || segment === '..')
  )
    throw new PolicyNativeLaunchContractError()
  return value
}

function sha256(value: unknown): string {
  if (typeof value !== 'string' || !sha256Pattern.test(value))
    throw new PolicyNativeLaunchContractError()
  return value
}

function decimal(value: unknown, permitZero = false): string {
  if (
    typeof value !== 'string' ||
    !decimalPattern.test(value) ||
    (!permitZero && value === '0')
  )
    throw new PolicyNativeLaunchContractError()
  return value
}

function descriptor(value: unknown, minimum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) <= minimum)
    throw new PolicyNativeLaunchContractError()
  return value as number
}

export type PolicyRepositoryCapability = Readonly<{
  repositoryRoot: string
}>
export type PolicyCompilerCapability = Readonly<{
  repositoryRoot: string
  compilerPath: string
  sdkRoot: string
  compilerResourceRoot: string
  compilerSha256: string
  compilerDevice: string
  compilerInode: string
  sdkIdentitySha256: string
  sdkDevice: string
  sdkInode: string
  compilerResourceIdentitySha256: string
  compilerResourceDevice: string
  compilerResourceInode: string
  headerSetSha256: string
  authorityPackageSha256: string
}>
export type PolicyFdAdmissionProbeCompilerCapability = Readonly<{
  repositoryRoot: string
  compilerPath: string
  sdkRoot: string
  compilerResourceRoot: string
  probeSourceSha256: string
  authorityPackageSha256: string
}>
type PolicyFdAdmissionProbeCompilerDiagnosticCapability = Readonly<{
  repositoryRoot: string
  compilerPath: string
  sdkRoot: string
  compilerResourceRoot: string
  diagnosticCapabilitySha256: string
}>
type PolicyCompilerDiagnosticCapability = Readonly<{
  repositoryRoot: string
  compilerPath: string
  sdkRoot: string
  compilerResourceRoot: string
  diagnosticCapabilitySha256: string
}>
export type PolicyHelperCapability = Readonly<{
  repositoryRoot: string
  helperPath: string
  helperSha256: string
  device: string
  inode: string
  byteCount: number
  provenancePackageSha256: string
  heldEvidenceSha256: string
}>
export type PolicyFdAdmissionProbeCapability = Readonly<{
  repositoryRoot: string
  probePath: string
  probeSha256: string
}>
export type PolicyMetadataEvidence = Readonly<{
  uid: string
  device: string
  inode: string
  links: string
  mode: string
  size: string
}>

type PolicyNativeLaunchPlan = Readonly<{
  executable: string
  arguments: readonly string[]
  cwd: string
  environment: Readonly<Record<string, string>>
  stdio: readonly ('ignore' | 'pipe' | number)[]
  timeoutMilliseconds: number
  stdoutByteLimit: number
  stderrByteLimit: number
  combinedOutputByteLimit: number
  outputMode: 'diagnostic' | 'zero'
  acceptedExitCodes: readonly number[]
}>

const compilerCapabilities = new WeakSet<object>()
const fdAdmissionProbeCompilerCapabilities = new WeakSet<object>()
const fdAdmissionProbeCompilerDiagnosticCapabilities = new WeakSet<object>()
const compilerDiagnosticCapabilities = new WeakSet<object>()
const helperCapabilities = new WeakSet<object>()
const fdAdmissionProbeCapabilities = new WeakSet<object>()
const bCandidateCapabilities = new WeakSet<object>()
const bCandidateCleanupCapabilities = new WeakSet<object>()
const cAcceptedCapabilities = new WeakSet<object>()
const cAcceptedCleanupCapabilities = new WeakSet<object>()
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`
  return JSON.stringify(value)
}
function hashCanonical(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex')
}

function fdAdmissionProbeCompileContractSha256(
  repositoryRoot: string,
  sdkRoot: string,
): string {
  const scratchRoot = '/private/tmp/zedarchive-m45-fd-admission-probe'
  return hashCanonical({
    arguments: [
      ...compilerArguments,
      '-isysroot',
      sdkRoot,
      '-o',
      `${scratchRoot}/probe`,
      `${repositoryRoot}/scripts/policy-baseline-review/fd-admission-probe.c`,
    ],
    environment: { TMPDIR: scratchRoot },
  })
}

const compilerArguments = [
  '-std=c17',
  '-Wall',
  '-Wextra',
  '-Werror',
  '-Wpedantic',
  '-O2',
] as const
const compilerLimits = {
  timeoutMilliseconds: 30_000,
  stdoutByteLimit: 64 * 1024,
  stderrByteLimit: 64 * 1024,
  combinedOutputByteLimit: 96 * 1024,
  outputMode: 'diagnostic' as const,
  acceptedExitCodes: [0] as const,
}
const helperLimits = {
  timeoutMilliseconds: 5_000,
  stdoutByteLimit: 0,
  stderrByteLimit: 0,
  combinedOutputByteLimit: 0,
  outputMode: 'zero' as const,
  acceptedExitCodes: [0] as const,
}

function repositoryCapability(input: unknown): PolicyRepositoryCapability {
  exactKeys(input, ['repositoryRoot'])
  return { repositoryRoot: safeAbsolutePath(input.repositoryRoot) }
}

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
  'helperSha256',
] as const
function parseHashedMaterial(input: unknown): Record<string, string> {
  exactKeys(input, materialKeys)
  return Object.fromEntries(
    materialKeys.map((key) => [
      key,
      key === 'xcrunDevice' ||
      key === 'compilerDevice' ||
      key === 'sdkDevice' ||
      key === 'compilerResourceDevice' ||
      key === 'linkerDevice'
        ? decimal(input[key], true)
        : key === 'xcrunInode' ||
            key === 'compilerInode' ||
            key === 'sdkInode' ||
            key === 'compilerResourceInode' ||
            key === 'linkerInode'
          ? decimal(input[key])
          : sha256(input[key]),
    ]),
  )
}

type PolicyBCandidateCapability = Readonly<{
  repositoryRoot: string
  helperPath: string
  helperSha256: string
  helperDevice: string
  helperInode: string
  helperByteCount: number
  commandLockEvidenceSha256: string
  candidateHelperSha256: string
}>

/**
 * Decision 114 deliberately uses a different nominal capability from B.  The
 * fields look similar because both helpers operate on the same fixed build
 * layout, but the accepted review, historical A/B roots, and C admission hash
 * are part of C's authority boundary and cannot be represented by B's token.
 */
type PolicyCAcceptedCapability = Readonly<{
  repositoryRoot: string
  helperPath: string
  helperSha256: string
  helperDevice: string
  helperInode: string
  helperByteCount: number
  acceptedHelperSha256: string
  observedHelperSha256: string
  commandLockEvidenceSha256: string
  cAcceptedHelperLaunchSha256: string
}>

const bCandidateHeldRoles = [
  'command-lock',
  'build-root',
  'build-tmp',
  'build-source',
  'build-helper',
] as const
function parseBCandidateHeldEvidence(
  input: unknown,
  repositoryRoot: string,
): Readonly<
  Record<(typeof bCandidateHeldRoles)[number], Record<string, unknown>>
> {
  exactKeys(input, bCandidateHeldRoles)
  const expected = {
    'command-lock': {
      path: `${repositoryRoot}/.local/m45/.policy-exclusive-promotion.lock`,
      mode: '384',
      links: '1',
      size: '0',
      sha256: null,
    },
    'build-root': {
      path: `${repositoryRoot}/.local/m45/.policy-exclusive-promotion-build`,
      mode: '448',
      links: '5',
      size: 'na',
      sha256: null,
    },
    'build-tmp': {
      path: `${repositoryRoot}/.local/m45/.policy-exclusive-promotion-build/tmp`,
      mode: '448',
      links: '2',
      size: 'na',
      sha256: null,
    },
    'build-source': {
      path: `${repositoryRoot}/.local/m45/.policy-exclusive-promotion-build/exclusive-promotion-helper.c`,
      mode: '256',
      links: '1',
      size: 'positive',
      sha256: 'required',
    },
    'build-helper': {
      path: `${repositoryRoot}/.local/m45/.policy-exclusive-promotion-build/exclusive-promotion-helper`,
      mode: '320',
      links: '1',
      size: 'positive',
      sha256: 'required',
    },
  } as const
  return Object.fromEntries(
    bCandidateHeldRoles.map((role) => {
      const value = input[role]
      exactKeys(value, [
        'role',
        'path',
        'uid',
        'device',
        'inode',
        'mode',
        'links',
        'size',
        'sha256',
        'evidenceSha256',
      ])
      const { evidenceSha256, ...core } = value
      const rule = expected[role]
      const parsed = {
        role,
        path: safeAbsolutePath(core.path),
        uid: decimal(core.uid, true),
        device: decimal(core.device, true),
        inode: decimal(core.inode),
        mode: decimal(core.mode, true),
        links: decimal(core.links),
        size: core.size === 'na' ? 'na' : decimal(core.size, core.size === '0'),
        sha256: core.sha256 === null ? null : sha256(core.sha256),
      }
      if (
        parsed.path !== rule.path ||
        parsed.mode !== rule.mode ||
        parsed.links !== rule.links ||
        (rule.size === 'positive'
          ? parsed.size === '0' || parsed.size === 'na'
          : parsed.size !== rule.size) ||
        (rule.sha256 === 'required'
          ? parsed.sha256 === null
          : parsed.sha256 !== null) ||
        sha256(evidenceSha256) !== hashCanonical(parsed)
      )
        throw new PolicyNativeLaunchContractError()
      return [role, Object.freeze({ ...parsed, evidenceSha256 })]
    }),
  ) as unknown as Readonly<
    Record<(typeof bCandidateHeldRoles)[number], Record<string, unknown>>
  >
}

export function createPolicyBCandidateCapability(
  input: unknown,
): PolicyBCandidateCapability {
  exactKeys(input, [
    'schema',
    'version',
    'stage',
    'repositoryRoot',
    'cleanedStageAPackage',
    'bRootIdentitySha256',
    'heldEvidence',
    'buildInventorySha256',
    'trackedCommitments',
    'candidateHelperSha256',
  ])
  if (
    input.schema !== 'policy-b-candidate-helper-launch.v1' ||
    input.version !== 1 ||
    input.stage !== 'B-candidate'
  )
    throw new PolicyNativeLaunchContractError()
  const repositoryRoot = safeAbsolutePath(input.repositoryRoot)
  exactKeys(input.cleanedStageAPackage, [
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
  const { packageSha256, ...stageACore } = input.cleanedStageAPackage
  const material = parseHashedMaterial(stageACore.material)
  if (
    stageACore.schema !== 'policy-exclusive-promotion-provenance.v1' ||
    stageACore.version !== 1 ||
    stageACore.stage !== 'A' ||
    stageACore.preflightAuthoritySha256 !== null ||
    stageACore.reviewAuthoritySha256 !== null ||
    stageACore.cleanupProved !== true ||
    sha256(stageACore.rootIdentitySha256) ===
      sha256(input.bRootIdentitySha256) ||
    sha256(packageSha256) !== hashCanonical({ ...stageACore, material })
  )
    throw new PolicyNativeLaunchContractError()
  const heldEvidence = parseBCandidateHeldEvidence(
    input.heldEvidence,
    repositoryRoot,
  )
  exactKeys(input.trackedCommitments, [
    'sourceSha256',
    'launchContractSha256',
    'launcherSha256',
    'nativeAuthoritySha256',
    'lockPreflightWorkerSha256',
  ])
  const trackedCommitments = Object.fromEntries(
    Object.entries(input.trackedCommitments).map(([key, value]) => [
      key,
      sha256(value),
    ]),
  )
  if (
    trackedCommitments.sourceSha256 !== material.sourceSha256 ||
    trackedCommitments.launchContractSha256 !== material.launchContractSha256 ||
    trackedCommitments.launcherSha256 !== material.launcherSha256 ||
    trackedCommitments.nativeAuthoritySha256 !==
      material.nativeAuthoritySha256 ||
    trackedCommitments.lockPreflightWorkerSha256 !==
      material.lockPreflightWorkerSha256
  )
    throw new PolicyNativeLaunchContractError()
  const core = {
    schema: input.schema,
    version: input.version,
    stage: input.stage,
    repositoryRoot,
    cleanedStageAPackage: { ...stageACore, material, packageSha256 },
    bRootIdentitySha256: sha256(input.bRootIdentitySha256),
    heldEvidence,
    buildInventorySha256: sha256(input.buildInventorySha256),
    trackedCommitments,
  }
  const acceptedHash = sha256(input.candidateHelperSha256)
  if (acceptedHash !== hashCanonical(core))
    throw new PolicyNativeLaunchContractError()
  const helper = heldEvidence['build-helper']
  const lock = heldEvidence['command-lock']
  if (helper.sha256 !== material.helperSha256)
    throw new PolicyNativeLaunchContractError()
  const capability = Object.freeze({
    repositoryRoot,
    helperPath: helper.path as string,
    helperSha256: helper.sha256 as string,
    helperDevice: helper.device as string,
    helperInode: helper.inode as string,
    helperByteCount: Number(helper.size),
    commandLockEvidenceSha256: lock.evidenceSha256 as string,
    candidateHelperSha256: acceptedHash,
  })
  bCandidateCapabilities.add(capability)
  return capability
}

export function createPolicyCAcceptedCapability(
  input: unknown,
): PolicyCAcceptedCapability {
  exactKeys(input, [
    'schema',
    'version',
    'workflow',
    'repositoryRoot',
    'acceptedLiterals',
    'aRootIdentitySha256',
    'bRootIdentitySha256',
    'cRootIdentitySha256',
    'heldEvidence',
    'buildInventorySha256',
    'trackedCommitments',
    'cAcceptedHelperLaunchSha256',
  ])
  if (
    input.schema !== 'policy-c-accepted-helper-launch.v1' ||
    input.version !== 1 ||
    input.workflow !== 'C-accepted'
  )
    throw new PolicyNativeLaunchContractError()
  const repositoryRoot = safeAbsolutePath(input.repositoryRoot)
  exactKeys(input.acceptedLiterals, [
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
  const { packageSha256, ...acceptedCore } = input.acceptedLiterals
  const material = parseHashedMaterial(acceptedCore.material)
  const accepted = { ...acceptedCore, material, packageSha256 }
  const aRootIdentitySha256 = sha256(input.aRootIdentitySha256)
  const bRootIdentitySha256 = sha256(input.bRootIdentitySha256)
  const cRootIdentitySha256 = sha256(input.cRootIdentitySha256)
  if (
    acceptedCore.schema !== 'policy-exclusive-promotion-provenance.v1' ||
    acceptedCore.version !== 1 ||
    acceptedCore.stage !== 'accepted' ||
    acceptedCore.rootIdentitySha256 !== null ||
    acceptedCore.preflightAuthoritySha256 === null ||
    acceptedCore.reviewAuthoritySha256 === null ||
    acceptedCore.cleanupProved !== true ||
    sha256(acceptedCore.preflightAuthoritySha256) !==
      acceptedCore.preflightAuthoritySha256 ||
    sha256(acceptedCore.reviewAuthoritySha256) !==
      acceptedCore.reviewAuthoritySha256 ||
    sha256(packageSha256) !== hashCanonical({ ...acceptedCore, material }) ||
    new Set([aRootIdentitySha256, bRootIdentitySha256, cRootIdentitySha256])
      .size !== 3
  )
    throw new PolicyNativeLaunchContractError()
  const heldEvidence = parseBCandidateHeldEvidence(
    input.heldEvidence,
    repositoryRoot,
  )
  exactKeys(input.trackedCommitments, [
    'sourceSha256',
    'launchContractSha256',
    'launcherSha256',
    'nativeAuthoritySha256',
    'lockPreflightWorkerSha256',
  ])
  const trackedCommitments = Object.fromEntries(
    Object.entries(input.trackedCommitments).map(([key, value]) => [
      key,
      sha256(value),
    ]),
  )
  if (
    trackedCommitments.sourceSha256 !== material.sourceSha256 ||
    trackedCommitments.launchContractSha256 !== material.launchContractSha256 ||
    trackedCommitments.launcherSha256 !== material.launcherSha256 ||
    trackedCommitments.nativeAuthoritySha256 !==
      material.nativeAuthoritySha256 ||
    trackedCommitments.lockPreflightWorkerSha256 !==
      material.lockPreflightWorkerSha256 ||
    heldEvidence['build-helper'].sha256 !== material.helperSha256
  )
    throw new PolicyNativeLaunchContractError()
  const core = {
    schema: input.schema,
    version: input.version,
    workflow: input.workflow,
    repositoryRoot,
    acceptedLiterals: accepted,
    aRootIdentitySha256,
    bRootIdentitySha256,
    cRootIdentitySha256,
    heldEvidence,
    buildInventorySha256: sha256(input.buildInventorySha256),
    trackedCommitments,
  }
  const cAcceptedHelperLaunchSha256 = sha256(input.cAcceptedHelperLaunchSha256)
  if (cAcceptedHelperLaunchSha256 !== hashCanonical(core))
    throw new PolicyNativeLaunchContractError()
  const helper = heldEvidence['build-helper']
  const lock = heldEvidence['command-lock']
  const capability = Object.freeze({
    repositoryRoot,
    helperPath: helper.path as string,
    helperSha256: helper.sha256 as string,
    helperDevice: helper.device as string,
    helperInode: helper.inode as string,
    helperByteCount: Number(helper.size),
    acceptedHelperSha256: material.helperSha256,
    observedHelperSha256: helper.sha256 as string,
    commandLockEvidenceSha256: lock.evidenceSha256 as string,
    cAcceptedHelperLaunchSha256,
  })
  cAcceptedCapabilities.add(capability)
  return capability
}

export function createPolicyCAcceptedCleanupCapability(
  input: unknown,
): PolicyCAcceptedCapability {
  if (!cAcceptedCapabilities.has(input as object))
    throw new PolicyNativeLaunchContractError()
  const capability = input as PolicyCAcceptedCapability
  cAcceptedCleanupCapabilities.add(capability)
  return capability
}

export function createPolicyCompilerCapability(
  input: unknown,
): PolicyCompilerCapability {
  exactKeys(input, [
    'repositoryRoot',
    'compilerPath',
    'sdkRoot',
    'compilerResourceRoot',
    'authorityPackage',
  ])
  exactKeys(input.authorityPackage, [
    'schema',
    'version',
    'compilerPath',
    'sdkRoot',
    'compilerResourceRoot',
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
    'linkerPath',
    'linkerIdentitySha256',
    'linkerSha256',
    'linkerDevice',
    'linkerInode',
    'compileContractSha256',
    'launchContractSha256',
    'launcherSha256',
    'nativeAuthoritySha256',
    'lockPreflightWorkerSha256',
    'authorityPackageSha256',
  ])
  const { authorityPackageSha256, ...authorityCore } = input.authorityPackage
  const acceptedAuthorityPackageSha256 = sha256(authorityPackageSha256)
  for (const key of [
    'xcrunSha256',
    'sourceSha256',
    'compilerSha256',
    'sdkIdentitySha256',
    'compilerResourceIdentitySha256',
    'headerSetSha256',
    'diagnosticSha256',
    'diagnosticSemanticSha256',
    'linkerIdentitySha256',
    'linkerSha256',
    'compileContractSha256',
    'launchContractSha256',
    'launcherSha256',
    'nativeAuthoritySha256',
    'lockPreflightWorkerSha256',
  ] as const)
    sha256(authorityCore[key])
  decimal(authorityCore.xcrunDevice, true)
  decimal(authorityCore.xcrunInode)
  const compilerPath = safeAbsolutePath(authorityCore.compilerPath)
  const sdkRoot = safeAbsolutePath(authorityCore.sdkRoot)
  const compilerResourceRoot = safeAbsolutePath(
    authorityCore.compilerResourceRoot,
  )
  safeAbsolutePath(authorityCore.linkerPath)
  decimal(authorityCore.compilerDevice, true)
  decimal(authorityCore.compilerInode)
  decimal(authorityCore.sdkDevice, true)
  decimal(authorityCore.sdkInode)
  decimal(authorityCore.compilerResourceDevice, true)
  decimal(authorityCore.compilerResourceInode)
  decimal(authorityCore.linkerDevice, true)
  decimal(authorityCore.linkerInode)
  if (
    authorityCore.schema !== 'policy-toolchain-authority.v1' ||
    authorityCore.version !== 1 ||
    compilerPath !== input.compilerPath ||
    sdkRoot !== input.sdkRoot ||
    compilerResourceRoot !== input.compilerResourceRoot ||
    acceptedAuthorityPackageSha256 !== hashCanonical(authorityCore)
  )
    throw new PolicyNativeLaunchContractError()
  const capability: PolicyCompilerCapability = Object.freeze({
    repositoryRoot: safeAbsolutePath(input.repositoryRoot),
    compilerPath,
    sdkRoot,
    compilerResourceRoot,
    compilerSha256: sha256(authorityCore.compilerSha256),
    compilerDevice: decimal(authorityCore.compilerDevice, true),
    compilerInode: decimal(authorityCore.compilerInode),
    sdkIdentitySha256: sha256(authorityCore.sdkIdentitySha256),
    sdkDevice: decimal(authorityCore.sdkDevice, true),
    sdkInode: decimal(authorityCore.sdkInode),
    compilerResourceIdentitySha256: sha256(
      authorityCore.compilerResourceIdentitySha256,
    ),
    compilerResourceDevice: decimal(authorityCore.compilerResourceDevice, true),
    compilerResourceInode: decimal(authorityCore.compilerResourceInode),
    headerSetSha256: sha256(authorityCore.headerSetSha256),
    authorityPackageSha256: acceptedAuthorityPackageSha256,
  })
  compilerCapabilities.add(capability)
  return capability
}

export function createPolicyFdAdmissionProbeCompilerCapability(
  input: unknown,
): PolicyFdAdmissionProbeCompilerCapability {
  exactKeys(input, [
    'repositoryRoot',
    'compilerPath',
    'sdkRoot',
    'compilerResourceRoot',
    'authorityPackage',
  ])
  exactKeys(input.authorityPackage, [
    'schema',
    'version',
    'compilerPath',
    'sdkRoot',
    'xcrunSha256',
    'xcrunDevice',
    'xcrunInode',
    'probeSourceSha256',
    'compilerSha256',
    'compilerDevice',
    'compilerInode',
    'sdkIdentitySha256',
    'sdkDevice',
    'sdkInode',
    'compilerResourceRoot',
    'compilerResourceIdentitySha256',
    'compilerResourceDevice',
    'compilerResourceInode',
    'headerSetSha256',
    'diagnosticSha256',
    'diagnosticSemanticSha256',
    'linkerPath',
    'linkerIdentitySha256',
    'linkerSha256',
    'linkerDevice',
    'linkerInode',
    'compileContractSha256',
    'launchContractSha256',
    'launcherSha256',
    'nativeAuthoritySha256',
    'lockPreflightWorkerSha256',
    'authorityPackageSha256',
  ])
  const { authorityPackageSha256, ...core } = input.authorityPackage
  if (
    core.schema !== 'policy-fd-admission-probe-toolchain-authority.v1' ||
    core.version !== 1 ||
    sha256(authorityPackageSha256) !== hashCanonical(core)
  )
    throw new PolicyNativeLaunchContractError()
  for (const key of [
    'xcrunSha256',
    'probeSourceSha256',
    'compilerSha256',
    'sdkIdentitySha256',
    'compilerResourceIdentitySha256',
    'headerSetSha256',
    'diagnosticSha256',
    'diagnosticSemanticSha256',
    'linkerIdentitySha256',
    'linkerSha256',
    'compileContractSha256',
    'launchContractSha256',
    'launcherSha256',
    'nativeAuthoritySha256',
    'lockPreflightWorkerSha256',
  ] as const)
    sha256(core[key])
  for (const key of [
    'xcrunDevice',
    'compilerDevice',
    'sdkDevice',
    'compilerResourceDevice',
    'linkerDevice',
  ] as const)
    decimal(core[key], true)
  for (const key of [
    'xcrunInode',
    'compilerInode',
    'sdkInode',
    'compilerResourceInode',
    'linkerInode',
  ] as const)
    decimal(core[key])
  const repositoryRoot = safeAbsolutePath(input.repositoryRoot)
  const compilerPath = safeAbsolutePath(core.compilerPath)
  const sdkRoot = safeAbsolutePath(core.sdkRoot)
  const compilerResourceRoot = safeAbsolutePath(core.compilerResourceRoot)
  if (
    compilerPath !== input.compilerPath ||
    sdkRoot !== input.sdkRoot ||
    compilerResourceRoot !== input.compilerResourceRoot
  )
    throw new PolicyNativeLaunchContractError()
  if (
    core.compileContractSha256 !==
    fdAdmissionProbeCompileContractSha256(repositoryRoot, sdkRoot)
  )
    throw new PolicyNativeLaunchContractError()
  const capability = Object.freeze({
    repositoryRoot,
    compilerPath,
    sdkRoot,
    compilerResourceRoot,
    probeSourceSha256: sha256(core.probeSourceSha256),
    authorityPackageSha256: sha256(authorityPackageSha256),
  })
  fdAdmissionProbeCompilerCapabilities.add(capability)
  return capability
}

export function createPolicyCompilerDiagnosticCapability(
  input: unknown,
): PolicyCompilerDiagnosticCapability {
  exactKeys(input, ['repositoryRoot', 'diagnosticCapability'])
  exactKeys(input.diagnosticCapability, [
    'schema',
    'version',
    'repositoryRoot',
    'compilerPath',
    'sdkRoot',
    'compilerResourceRoot',
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
    'compileContractSha256',
    'launchContractSha256',
    'launcherSha256',
    'nativeAuthoritySha256',
    'lockPreflightWorkerSha256',
    'diagnosticCapabilitySha256',
  ])
  const { diagnosticCapabilitySha256, ...core } = input.diagnosticCapability
  if (
    core.schema !== 'policy-compiler-diagnostic-capability.v1' ||
    core.version !== 1 ||
    sha256(diagnosticCapabilitySha256) !== hashCanonical(core)
  )
    throw new PolicyNativeLaunchContractError()
  for (const key of [
    'compilerSha256',
    'sdkIdentitySha256',
    'compilerResourceIdentitySha256',
    'headerSetSha256',
    'compileContractSha256',
    'launchContractSha256',
    'launcherSha256',
    'nativeAuthoritySha256',
    'lockPreflightWorkerSha256',
  ] as const)
    sha256(core[key])
  for (const key of [
    'compilerDevice',
    'sdkDevice',
    'compilerResourceDevice',
  ] as const)
    decimal(core[key], true)
  for (const key of [
    'compilerInode',
    'sdkInode',
    'compilerResourceInode',
  ] as const)
    decimal(core[key])
  const capability = Object.freeze({
    repositoryRoot: safeAbsolutePath(core.repositoryRoot),
    compilerPath: safeAbsolutePath(core.compilerPath),
    sdkRoot: safeAbsolutePath(core.sdkRoot),
    compilerResourceRoot: safeAbsolutePath(core.compilerResourceRoot),
    diagnosticCapabilitySha256: sha256(diagnosticCapabilitySha256),
  })
  if (capability.repositoryRoot !== safeAbsolutePath(input.repositoryRoot))
    throw new PolicyNativeLaunchContractError()
  compilerDiagnosticCapabilities.add(capability)
  return capability
}

export function createPolicyHelperCapability(
  input: unknown,
): PolicyHelperCapability {
  exactKeys(input, [
    'repositoryRoot',
    'helperPath',
    'device',
    'inode',
    'byteCount',
    'provenancePackage',
    'heldEvidenceSha256',
  ])
  const repositoryRoot = safeAbsolutePath(input.repositoryRoot)
  const helperPath = safeAbsolutePath(input.helperPath)
  if (
    helperPath !==
    `${repositoryRoot}/.local/m45/.policy-exclusive-promotion-build/exclusive-promotion-helper`
  )
    throw new PolicyNativeLaunchContractError()
  exactKeys(input.provenancePackage, [
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
  const { packageSha256, ...packageCore } = input.provenancePackage
  const material = parseHashedMaterial(packageCore.material)
  if (
    packageCore.schema !== 'policy-exclusive-promotion-provenance.v1' ||
    packageCore.version !== 1 ||
    (packageCore.stage !== 'A' &&
      packageCore.stage !== 'B' &&
      packageCore.stage !== 'accepted' &&
      packageCore.stage !== 'C') ||
    packageCore.cleanupProved !== true ||
    sha256(packageSha256) !== hashCanonical({ ...packageCore, material })
  )
    throw new PolicyNativeLaunchContractError()
  const byteCount = input.byteCount
  if (!Number.isSafeInteger(byteCount) || (byteCount as number) <= 0)
    throw new PolicyNativeLaunchContractError()
  const device = decimal(input.device, true)
  const inode = decimal(input.inode)
  const acceptedPackageSha256 = sha256(packageSha256)
  const acceptedHeldEvidenceSha256 = sha256(input.heldEvidenceSha256)
  const heldCore = {
    helperPath,
    helperSha256: material.helperSha256,
    device,
    inode,
    byteCount,
  }
  if (acceptedHeldEvidenceSha256 !== hashCanonical(heldCore))
    throw new PolicyNativeLaunchContractError()
  const capability: PolicyHelperCapability = Object.freeze({
    repositoryRoot,
    helperPath,
    helperSha256: material.helperSha256,
    device,
    inode,
    byteCount: byteCount as number,
    provenancePackageSha256: acceptedPackageSha256,
    heldEvidenceSha256: acceptedHeldEvidenceSha256,
  })
  helperCapabilities.add(capability)
  return capability
}

export function createPolicyFdAdmissionProbeCapability(
  input: unknown,
): PolicyFdAdmissionProbeCapability {
  exactKeys(input, ['repositoryRoot', 'probePath', 'probeSha256'])
  const repositoryRoot = safeAbsolutePath(input.repositoryRoot)
  const probePath = safeAbsolutePath(input.probePath)
  if (probePath !== '/private/tmp/zedarchive-m45-fd-admission-probe/probe')
    throw new PolicyNativeLaunchContractError()
  const capability = Object.freeze({
    repositoryRoot,
    probePath,
    probeSha256: sha256(input.probeSha256),
  })
  fdAdmissionProbeCapabilities.add(capability)
  return capability
}

function compilerCapability(input: unknown): PolicyCompilerCapability {
  if (
    input === null ||
    typeof input !== 'object' ||
    !compilerCapabilities.has(input)
  )
    throw new PolicyNativeLaunchContractError()
  return input as PolicyCompilerCapability
}

function fdAdmissionProbeCompilerCapability(
  input: unknown,
): PolicyFdAdmissionProbeCompilerCapability {
  if (
    input === null ||
    typeof input !== 'object' ||
    !fdAdmissionProbeCompilerCapabilities.has(input)
  )
    throw new PolicyNativeLaunchContractError()
  return input as PolicyFdAdmissionProbeCompilerCapability
}

export function createPolicyFdAdmissionProbeCompilerDiagnosticCapability(
  input: unknown,
): PolicyFdAdmissionProbeCompilerDiagnosticCapability {
  exactKeys(input, ['repositoryRoot', 'diagnosticCapability'])
  exactKeys(input.diagnosticCapability, [
    'schema',
    'version',
    'repositoryRoot',
    'compilerPath',
    'sdkRoot',
    'compilerResourceRoot',
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
    'probeSourceSha256',
    'compileContractSha256',
    'launchContractSha256',
    'launcherSha256',
    'nativeAuthoritySha256',
    'lockPreflightWorkerSha256',
    'diagnosticCapabilitySha256',
  ])
  const { diagnosticCapabilitySha256, ...core } = input.diagnosticCapability
  if (
    core.schema !==
      'policy-fd-admission-probe-compiler-diagnostic-capability.v1' ||
    core.version !== 1 ||
    sha256(diagnosticCapabilitySha256) !== hashCanonical(core)
  )
    throw new PolicyNativeLaunchContractError()
  for (const key of [
    'compilerSha256',
    'sdkIdentitySha256',
    'compilerResourceIdentitySha256',
    'headerSetSha256',
    'probeSourceSha256',
    'compileContractSha256',
    'launchContractSha256',
    'launcherSha256',
    'nativeAuthoritySha256',
    'lockPreflightWorkerSha256',
  ] as const)
    sha256(core[key])
  for (const key of [
    'compilerDevice',
    'sdkDevice',
    'compilerResourceDevice',
  ] as const)
    decimal(core[key], true)
  for (const key of [
    'compilerInode',
    'sdkInode',
    'compilerResourceInode',
  ] as const)
    decimal(core[key])
  const capability = Object.freeze({
    repositoryRoot: safeAbsolutePath(core.repositoryRoot),
    compilerPath: safeAbsolutePath(core.compilerPath),
    sdkRoot: safeAbsolutePath(core.sdkRoot),
    compilerResourceRoot: safeAbsolutePath(core.compilerResourceRoot),
    diagnosticCapabilitySha256: sha256(diagnosticCapabilitySha256),
  })
  if (capability.repositoryRoot !== safeAbsolutePath(input.repositoryRoot))
    throw new PolicyNativeLaunchContractError()
  if (
    core.compileContractSha256 !==
    fdAdmissionProbeCompileContractSha256(
      capability.repositoryRoot,
      capability.sdkRoot,
    )
  )
    throw new PolicyNativeLaunchContractError()
  fdAdmissionProbeCompilerDiagnosticCapabilities.add(capability)
  return capability
}

function fdAdmissionProbeCompilerDiagnosticCapability(
  input: unknown,
): PolicyFdAdmissionProbeCompilerDiagnosticCapability {
  if (
    input === null ||
    typeof input !== 'object' ||
    !fdAdmissionProbeCompilerDiagnosticCapabilities.has(input)
  )
    throw new PolicyNativeLaunchContractError()
  return input as PolicyFdAdmissionProbeCompilerDiagnosticCapability
}

function compilerDiagnosticCapability(
  input: unknown,
): PolicyCompilerDiagnosticCapability {
  if (
    input === null ||
    typeof input !== 'object' ||
    !compilerDiagnosticCapabilities.has(input)
  )
    throw new PolicyNativeLaunchContractError()
  return input as PolicyCompilerDiagnosticCapability
}

function helperCapability(input: unknown): PolicyHelperCapability {
  if (
    input === null ||
    typeof input !== 'object' ||
    !helperCapabilities.has(input)
  )
    throw new PolicyNativeLaunchContractError()
  return input as PolicyHelperCapability
}

function fdAdmissionProbeCapability(
  input: unknown,
): PolicyFdAdmissionProbeCapability {
  if (
    input === null ||
    typeof input !== 'object' ||
    !fdAdmissionProbeCapabilities.has(input)
  )
    throw new PolicyNativeLaunchContractError()
  return input as PolicyFdAdmissionProbeCapability
}

function bCandidateCapability(input: unknown): PolicyBCandidateCapability {
  if (
    input === null ||
    typeof input !== 'object' ||
    !bCandidateCapabilities.has(input)
  )
    throw new PolicyNativeLaunchContractError()
  return input as PolicyBCandidateCapability
}

export function createPolicyBCandidateCleanupCapability(
  activeCapability: unknown,
): PolicyBCandidateCapability {
  const active = bCandidateCapability(activeCapability)
  const cleanup = Object.freeze({ ...active })
  bCandidateCleanupCapabilities.add(cleanup)
  return cleanup
}

function bCandidateCleanupCapability(
  input: unknown,
): PolicyBCandidateCapability {
  if (
    input === null ||
    typeof input !== 'object' ||
    !bCandidateCleanupCapabilities.has(input)
  )
    throw new PolicyNativeLaunchContractError()
  return input as PolicyBCandidateCapability
}

function cAcceptedCapability(input: unknown): PolicyCAcceptedCapability {
  if (!cAcceptedCapabilities.has(input as object))
    throw new PolicyNativeLaunchContractError()
  return input as PolicyCAcceptedCapability
}

function cAcceptedCleanupCapability(input: unknown): PolicyCAcceptedCapability {
  if (!cAcceptedCleanupCapabilities.has(input as object))
    throw new PolicyNativeLaunchContractError()
  return input as PolicyCAcceptedCapability
}

export function createPolicyLockPreflightPlan(
  input: unknown,
  runtime: Readonly<{
    executable: string
    workerPath: string
    acceptedWorkerSha256: string
  }>,
): PolicyNativeLaunchPlan {
  exactKeys(input, ['repositoryRoot', 'workerSha256'])
  exactKeys(runtime, ['executable', 'workerPath', 'acceptedWorkerSha256'])
  const repository = repositoryCapability({
    repositoryRoot: input.repositoryRoot,
  })
  if (
    sha256(input.workerSha256) !== sha256(runtime.acceptedWorkerSha256) ||
    safeAbsolutePath(runtime.executable) !== process.execPath ||
    !safeAbsolutePath(runtime.workerPath).endsWith(
      '/scripts/policy-baseline-review/lock-preflight-worker.mjs',
    )
  )
    throw new PolicyNativeLaunchContractError()
  return {
    executable: runtime.executable,
    arguments: [
      runtime.workerPath,
      'lock-preflight',
      repository.repositoryRoot,
    ],
    cwd: repository.repositoryRoot,
    environment: {},
    stdio: ['ignore', 'pipe', 'pipe'],
    ...helperLimits,
    acceptedExitCodes: [0, 20],
  }
}

export function createPolicyXcrunPlan(
  operation: 'compiler-path' | 'sdk-path',
  input: unknown,
): PolicyNativeLaunchPlan {
  if (operation !== 'compiler-path' && operation !== 'sdk-path')
    throw new PolicyNativeLaunchContractError()
  const repository = repositoryCapability(input)
  return {
    executable: '/usr/bin/xcrun',
    arguments:
      operation === 'compiler-path'
        ? ['--find', 'clang']
        : ['--sdk', 'macosx', '--show-sdk-path'],
    cwd: repository.repositoryRoot,
    environment: {},
    stdio: ['ignore', 'pipe', 'pipe'],
    ...compilerLimits,
  }
}

export function createPolicyCompilerResourcePlan(
  input: unknown,
): PolicyNativeLaunchPlan {
  exactKeys(input, [
    'schema',
    'version',
    'repositoryRoot',
    'compilerPath',
    'compilerSha256',
    'compilerDevice',
    'compilerInode',
    'compilerEvidenceSha256',
  ])
  const core = {
    schema: input.schema,
    version: input.version,
    repositoryRoot: safeAbsolutePath(input.repositoryRoot),
    compilerPath: safeAbsolutePath(input.compilerPath),
    compilerSha256: sha256(input.compilerSha256),
    compilerDevice: decimal(input.compilerDevice, true),
    compilerInode: decimal(input.compilerInode),
  }
  if (
    core.schema !== 'policy-compiler-resource-resolver.v1' ||
    core.version !== 1 ||
    sha256(input.compilerEvidenceSha256) !== hashCanonical(core)
  )
    throw new PolicyNativeLaunchContractError()
  return {
    executable: core.compilerPath,
    arguments: ['-print-resource-dir'],
    cwd: core.repositoryRoot,
    environment: {},
    stdio: ['ignore', 'pipe', 'pipe'],
    ...compilerLimits,
  }
}

export function createPolicyCompilerPlan(
  operation: 'diagnostic' | 'build',
  input: unknown,
): PolicyNativeLaunchPlan {
  if (operation !== 'diagnostic' && operation !== 'build')
    throw new PolicyNativeLaunchContractError()
  const capability =
    operation === 'diagnostic'
      ? compilerDiagnosticCapability(input)
      : compilerCapability(input)
  const buildRoot = `${capability.repositoryRoot}/.local/m45/.policy-exclusive-promotion-build`
  const diagnosticControlRoot = `${capability.repositoryRoot}/.local/m45/policy-native-derivation`
  const temporaryDirectory =
    operation === 'diagnostic' ? diagnosticControlRoot : `${buildRoot}/tmp`
  const sourcePath =
    operation === 'diagnostic'
      ? `${capability.repositoryRoot}/scripts/policy-baseline-review/exclusive-promotion-helper.c`
      : `${buildRoot}/exclusive-promotion-helper.c`
  const outputPath =
    operation === 'diagnostic'
      ? `${diagnosticControlRoot}/.policy-compiler-diagnostic-output`
      : `${buildRoot}/exclusive-promotion-helper`
  const suffix = ['-isysroot', capability.sdkRoot, '-o', outputPath, sourcePath]
  return {
    executable: capability.compilerPath,
    arguments: [
      ...compilerArguments,
      ...(operation === 'diagnostic' ? ['-###'] : []),
      ...suffix,
    ],
    cwd: capability.repositoryRoot,
    environment: { TMPDIR: temporaryDirectory },
    stdio: ['ignore', 'pipe', 'pipe'],
    ...compilerLimits,
  }
}

export function createPolicyFdAdmissionProbeCompilerPlan(
  capabilityInput: unknown,
  input: unknown,
): PolicyNativeLaunchPlan {
  const capability = fdAdmissionProbeCompilerCapability(capabilityInput)
  exactKeys(input, ['repositoryRoot', 'scratchRoot', 'probeSourceSha256'])
  const repositoryRoot = safeAbsolutePath(input.repositoryRoot)
  const scratchRoot = safeAbsolutePath(input.scratchRoot)
  if (sha256(input.probeSourceSha256) !== capability.probeSourceSha256)
    throw new PolicyNativeLaunchContractError()
  if (
    repositoryRoot !== capability.repositoryRoot ||
    scratchRoot !== '/private/tmp/zedarchive-m45-fd-admission-probe'
  )
    throw new PolicyNativeLaunchContractError()
  return {
    executable: capability.compilerPath,
    arguments: [
      ...compilerArguments,
      '-isysroot',
      capability.sdkRoot,
      '-o',
      `${scratchRoot}/probe`,
      `${repositoryRoot}/scripts/policy-baseline-review/fd-admission-probe.c`,
    ],
    cwd: repositoryRoot,
    environment: { TMPDIR: scratchRoot },
    stdio: ['ignore', 'pipe', 'pipe'],
    ...compilerLimits,
  }
}

export function createPolicyFdAdmissionProbeCompilerDiagnosticPlan(
  capabilityInput: unknown,
): PolicyNativeLaunchPlan {
  const capability =
    fdAdmissionProbeCompilerDiagnosticCapability(capabilityInput)
  const scratchRoot = '/private/tmp/zedarchive-m45-fd-admission-probe'
  return {
    executable: capability.compilerPath,
    arguments: [
      ...compilerArguments,
      '-###',
      '-isysroot',
      capability.sdkRoot,
      '-o',
      `${scratchRoot}/probe`,
      `${capability.repositoryRoot}/scripts/policy-baseline-review/fd-admission-probe.c`,
    ],
    cwd: capability.repositoryRoot,
    environment: { TMPDIR: scratchRoot },
    stdio: ['ignore', 'pipe', 'pipe'],
    ...compilerLimits,
  }
}

const metadataRoles = {
  'build-root': ['448', '5', 'na'],
  'build-tmp': ['448', '2', 'na'],
  'build-source': ['256', '1', 'positive'],
  'build-helper': ['320', '1', 'positive'],
  'preflight-root': ['448', 'exact', 'na'],
  'preflight-directory': ['448', 'exact', 'na'],
  'preflight-file': ['384', '1', 'positive'],
  'custody-file': ['384', '1', 'positive'],
  'command-lock': ['384', '1', 'zero'],
} as const
type MetadataRole = keyof typeof metadataRoles
const promotionRows = {
  capture: ['.policy-baseline-review.staging', 'capture'],
  'role-input': ['.policy-baseline-review.staging', 'role-input'],
  'role-result': ['.policy-baseline-review.staging', 'role-result'],
} as const
const deleteRoles = {
  'build-source': { mode: '256', links: '1', size: 'positive' },
  'build-helper': { mode: '320', links: '1', size: 'positive' },
  'build-tmp': { mode: '448', links: '2', size: 'na' },
  'build-root': { mode: '448', links: '2', size: 'na' },
  'preflight-success-source-file': {
    mode: '384',
    links: '1',
    size: '43',
  },
  'preflight-success-destination-file': {
    mode: '384',
    links: '1',
    size: '48',
  },
  'preflight-collision-source-file': {
    mode: '384',
    links: '1',
    size: '45',
  },
  'preflight-collision-destination-file': {
    mode: '384',
    links: '1',
    size: '50',
  },
  'preflight-success-destination-promotion': {
    mode: '448',
    links: '2',
    size: 'na',
  },
  'preflight-success-source-promotion': {
    mode: '448',
    links: '2',
    size: 'na',
  },
  'preflight-collision-source-promotion': {
    mode: '448',
    links: '2',
    size: 'na',
  },
  'preflight-collision-destination-promotion': {
    mode: '448',
    links: '2',
    size: 'na',
  },
  'preflight-success-source-directory': {
    mode: '448',
    links: '2',
    size: 'na',
  },
  'preflight-success-destination-directory': {
    mode: '448',
    links: '2',
    size: 'na',
  },
  'preflight-collision-source-directory': {
    mode: '448',
    links: '2',
    size: 'na',
  },
  'preflight-collision-destination-directory': {
    mode: '448',
    links: '2',
    size: 'na',
  },
  'preflight-acl-fixture-directory': {
    mode: '448',
    links: '2',
    size: 'na',
  },
  'preflight-root': { mode: '448', links: '2', size: 'na' },
} as const
const deleteParentEntryCounts: Readonly<
  Record<keyof typeof deleteRoles, number>
> = {
  'build-source': 3,
  'build-helper': 2,
  'build-tmp': 2,
  'build-root': 2,
  'preflight-success-source-file': 1,
  'preflight-success-destination-file': 1,
  'preflight-collision-source-file': 1,
  'preflight-collision-destination-file': 1,
  'preflight-success-destination-promotion': 2,
  'preflight-success-source-promotion': 2,
  'preflight-collision-source-promotion': 2,
  'preflight-collision-destination-promotion': 2,
  'preflight-success-source-directory': 5,
  'preflight-success-destination-directory': 4,
  'preflight-collision-source-directory': 3,
  'preflight-collision-destination-directory': 2,
  'preflight-acl-fixture-directory': 1,
  'preflight-root': 2,
}

function metadataEvidence(input: unknown): PolicyMetadataEvidence {
  exactKeys(input, ['uid', 'device', 'inode', 'links', 'mode', 'size'])
  return {
    uid: decimal(input.uid, true),
    device: decimal(input.device, true),
    inode: decimal(input.inode),
    links: decimal(input.links),
    mode: decimal(input.mode, true),
    size: input.size === 'na' ? 'na' : decimal(input.size, input.size === '0'),
  }
}

export type PolicyNativeHelperOperation =
  | Readonly<{
      kind: 'metadata-check'
      role: MetadataRole
      evidence: PolicyMetadataEvidence
      authorityFd: number
    }>
  | Readonly<{
      kind: 'acl-fixture'
      action: 'install' | 'remove'
      uid: string
      device: string
      inode: string
      authorityFd: number
    }>
  | Readonly<{
      kind: 'promotion'
      phase: keyof typeof promotionRows
      sourceParent: Omit<PolicyMetadataEvidence, 'uid' | 'mode' | 'size'>
      destinationParent: Omit<PolicyMetadataEvidence, 'uid' | 'mode' | 'size'>
      staging: Readonly<{ device: string; inode: string }>
      sourceParentFd: number
      destinationParentFd: number
    }>
  | Readonly<{
      kind: 'preflight-promotion'
      outcome: 'success' | 'collision'
      sourceParent: Readonly<{
        device: string
        inode: string
        beforeLinks: string
        afterLinks: string
      }>
      destinationParent: Readonly<{
        device: string
        inode: string
        beforeLinks: string
        afterLinks: string
      }>
      sourcePromotion: Readonly<{
        device: string
        inode: string
        links: string
      }>
      collisionDestination: Readonly<{
        device: string
        inode: string
        links: string
      }>
      commonDevice: string
      commandLockFd: number
      sourceParentFd: number
      destinationParentFd: number
      sourcePromotionFd: number
    }>
  | Readonly<{
      kind: 'delete-entry'
      role: string
      parent: PolicyMetadataEvidence
      child: PolicyMetadataEvidence
      commandLockFd: number
      parentFd: number
      childFd: number
    }>
  | Readonly<{
      kind: 'delete-build-terminal'
      parent: PolicyMetadataEvidence
      buildRoot: PolicyMetadataEvidence
      helper: PolicyMetadataEvidence
      commandLockFd: number
      parentFd: number
      buildRootFd: number
      helperFd: number
    }>
  | Readonly<{
      kind: 'delete-build-terminal-shared'
      phase: 'shared-a' | 'shared-b'
      parent: PolicyMetadataEvidence
      buildRoot: PolicyMetadataEvidence
      helper: PolicyMetadataEvidence
      siblings: Readonly<{
        'candidate-review': PolicyMetadataEvidence
        discovery: PolicyMetadataEvidence
        'predecessor-review': PolicyMetadataEvidence
        'policy-native-derivation': PolicyMetadataEvidence
      }>
      commandLockFd: number
      parentFd: number
      buildRootFd: number
      helperFd: number
    }>

function createHelperArgumentsAndStdio(operation: unknown): Readonly<{
  arguments: readonly string[]
  stdio: readonly ('ignore' | 'pipe' | number)[]
}> {
  if (operation === null || typeof operation !== 'object')
    throw new PolicyNativeLaunchContractError()
  const kind = (operation as { kind?: unknown }).kind
  if (kind === 'metadata-check') {
    exactKeys(operation, ['kind', 'role', 'evidence', 'authorityFd'])
    if (
      typeof operation.role !== 'string' ||
      !(operation.role in metadataRoles)
    )
      throw new PolicyNativeLaunchContractError()
    const role = operation.role as MetadataRole
    const evidence = metadataEvidence(operation.evidence)
    const [mode, links, sizeRule] = metadataRoles[role]
    if (
      evidence.mode !== mode ||
      (links !== 'exact' && evidence.links !== links) ||
      (sizeRule === 'na' && evidence.size !== 'na') ||
      (sizeRule === 'zero' && evidence.size !== '0') ||
      (sizeRule === 'positive' &&
        (evidence.size === 'na' || evidence.size === '0'))
    )
      throw new PolicyNativeLaunchContractError()
    const fd = descriptor(operation.authorityFd, 3)
    return {
      arguments: ['metadata-check', role, ...Object.values(evidence)],
      stdio: ['ignore', 'pipe', 'pipe', fd],
    }
  }
  if (kind === 'acl-fixture') {
    exactKeys(operation, [
      'kind',
      'action',
      'uid',
      'device',
      'inode',
      'authorityFd',
    ])
    if (
      operation.action !== 'install' &&
      operation.action !== 'remove' &&
      operation.action !== 'inspect-empty' &&
      operation.action !== 'inspect-fixture'
    )
      throw new PolicyNativeLaunchContractError()
    const fd = descriptor(operation.authorityFd, 3)
    return {
      arguments: [
        'acl-fixture',
        operation.action,
        decimal(operation.uid, true),
        decimal(operation.device, true),
        decimal(operation.inode),
      ],
      stdio: ['ignore', 'pipe', 'pipe', fd],
    }
  }
  if (kind === 'promotion') {
    exactKeys(operation, [
      'kind',
      'phase',
      'sourceParent',
      'destinationParent',
      'staging',
      'sourceParentFd',
      'destinationParentFd',
    ])
    if (
      typeof operation.phase !== 'string' ||
      !(operation.phase in promotionRows)
    )
      throw new PolicyNativeLaunchContractError()
    exactKeys(operation.sourceParent, ['device', 'inode', 'links'])
    exactKeys(operation.destinationParent, ['device', 'inode', 'links'])
    exactKeys(operation.staging, ['device', 'inode'])
    const sourceFd = descriptor(operation.sourceParentFd, 4)
    const destinationFd = descriptor(operation.destinationParentFd, 4)
    if (sourceFd === destinationFd) throw new PolicyNativeLaunchContractError()
    const row = promotionRows[operation.phase as keyof typeof promotionRows]
    return {
      arguments: [
        operation.phase,
        ...row,
        decimal(operation.sourceParent.device, true),
        decimal(operation.sourceParent.inode),
        decimal(operation.sourceParent.links),
        decimal(operation.destinationParent.device, true),
        decimal(operation.destinationParent.inode),
        decimal(operation.destinationParent.links),
        decimal(operation.staging.device, true),
        decimal(operation.staging.inode),
      ],
      stdio: ['ignore', 'pipe', 'pipe', sourceFd, destinationFd],
    }
  }
  if (kind === 'preflight-promotion') {
    exactKeys(operation, [
      'kind',
      'outcome',
      'sourceParent',
      'destinationParent',
      'sourcePromotion',
      'collisionDestination',
      'commonDevice',
      'commandLockFd',
      'sourceParentFd',
      'destinationParentFd',
      'sourcePromotionFd',
    ])
    if (operation.outcome !== 'success' && operation.outcome !== 'collision')
      throw new PolicyNativeLaunchContractError()
    exactKeys(operation.sourceParent, [
      'device',
      'inode',
      'beforeLinks',
      'afterLinks',
    ])
    exactKeys(operation.destinationParent, [
      'device',
      'inode',
      'beforeLinks',
      'afterLinks',
    ])
    exactKeys(operation.sourcePromotion, ['device', 'inode', 'links'])
    exactKeys(operation.collisionDestination, ['device', 'inode', 'links'])
    const commonDevice = decimal(operation.commonDevice, true)
    const sourceParent = {
      device: decimal(operation.sourceParent.device, true),
      inode: decimal(operation.sourceParent.inode),
      beforeLinks: decimal(operation.sourceParent.beforeLinks),
      afterLinks: decimal(operation.sourceParent.afterLinks),
    }
    const destinationParent = {
      device: decimal(operation.destinationParent.device, true),
      inode: decimal(operation.destinationParent.inode),
      beforeLinks: decimal(operation.destinationParent.beforeLinks),
      afterLinks: decimal(operation.destinationParent.afterLinks),
    }
    const sourcePromotion = {
      device: decimal(operation.sourcePromotion.device, true),
      inode: decimal(operation.sourcePromotion.inode),
      links: decimal(operation.sourcePromotion.links),
    }
    const collisionDestination = {
      device: decimal(operation.collisionDestination.device, true),
      inode: decimal(
        operation.collisionDestination.inode,
        operation.outcome === 'success',
      ),
      links: decimal(
        operation.collisionDestination.links,
        operation.outcome === 'success',
      ),
    }
    if (
      sourceParent.device !== commonDevice ||
      destinationParent.device !== commonDevice ||
      sourcePromotion.device !== commonDevice ||
      sourceParent.beforeLinks !== '4' ||
      sourceParent.afterLinks !==
        (operation.outcome === 'success' ? '3' : '4') ||
      destinationParent.beforeLinks !==
        (operation.outcome === 'success' ? '3' : '4') ||
      destinationParent.afterLinks !== '4' ||
      sourcePromotion.links !== '2' ||
      (operation.outcome === 'success'
        ? collisionDestination.device !== '0' ||
          collisionDestination.inode !== '0' ||
          collisionDestination.links !== '0'
        : collisionDestination.device !== commonDevice ||
          collisionDestination.inode === '0' ||
          collisionDestination.links !== '2')
    )
      throw new PolicyNativeLaunchContractError()
    const descriptors = [
      descriptor(operation.commandLockFd, 6),
      descriptor(operation.sourceParentFd, 6),
      descriptor(operation.destinationParentFd, 6),
      descriptor(operation.sourcePromotionFd, 6),
    ]
    if (new Set(descriptors).size !== 4)
      throw new PolicyNativeLaunchContractError()
    return {
      arguments: [
        'preflight-promotion',
        operation.outcome,
        ...Object.values(sourceParent),
        ...Object.values(destinationParent),
        ...Object.values(sourcePromotion),
        ...Object.values(collisionDestination),
        commonDevice,
      ],
      stdio: ['ignore', 'pipe', 'pipe', ...descriptors],
    }
  }
  if (kind === 'delete-entry') {
    exactKeys(operation, [
      'kind',
      'role',
      'parent',
      'child',
      'commandLockFd',
      'parentFd',
      'childFd',
    ])
    if (typeof operation.role !== 'string' || !(operation.role in deleteRoles))
      throw new PolicyNativeLaunchContractError()
    const parent = metadataEvidence(operation.parent)
    const child = metadataEvidence(operation.child)
    const row = deleteRoles[operation.role as keyof typeof deleteRoles]
    const parentEntryCount =
      deleteParentEntryCounts[operation.role as keyof typeof deleteRoles]
    if (
      parent.mode !== '448' ||
      parent.size !== 'na' ||
      parent.links !== String(2 + parentEntryCount) ||
      child.uid !== parent.uid ||
      child.device !== parent.device ||
      child.inode === parent.inode ||
      child.mode !== row.mode ||
      child.links !== row.links ||
      (row.size === 'positive'
        ? child.size === 'na' || child.size === '0'
        : child.size !== row.size)
    )
      throw new PolicyNativeLaunchContractError()
    const descriptors = [
      descriptor(operation.commandLockFd, 5),
      descriptor(operation.parentFd, 5),
      descriptor(operation.childFd, 5),
    ]
    if (new Set(descriptors).size !== 3)
      throw new PolicyNativeLaunchContractError()
    return {
      arguments: [
        'delete-entry',
        operation.role,
        ...Object.values(parent),
        ...Object.values(child),
      ],
      stdio: ['ignore', 'pipe', 'pipe', ...descriptors],
    }
  }
  if (kind === 'delete-build-terminal') {
    exactKeys(operation, [
      'kind',
      'parent',
      'buildRoot',
      'helper',
      'commandLockFd',
      'parentFd',
      'buildRootFd',
      'helperFd',
    ])
    const parent = metadataEvidence(operation.parent)
    const buildRoot = metadataEvidence(operation.buildRoot)
    const helper = metadataEvidence(operation.helper)
    if (
      parent.mode !== '448' ||
      parent.links !== '4' ||
      parent.size !== 'na' ||
      buildRoot.uid !== parent.uid ||
      buildRoot.device !== parent.device ||
      buildRoot.inode === parent.inode ||
      buildRoot.mode !== '448' ||
      buildRoot.links !== '3' ||
      buildRoot.size !== 'na' ||
      helper.uid !== parent.uid ||
      helper.device !== parent.device ||
      helper.inode === parent.inode ||
      helper.inode === buildRoot.inode ||
      helper.mode !== '320' ||
      helper.links !== '1' ||
      helper.size === 'na' ||
      helper.size === '0'
    )
      throw new PolicyNativeLaunchContractError()
    const descriptors = [
      descriptor(operation.commandLockFd, 6),
      descriptor(operation.parentFd, 6),
      descriptor(operation.buildRootFd, 6),
      descriptor(operation.helperFd, 6),
    ]
    if (new Set(descriptors).size !== 4)
      throw new PolicyNativeLaunchContractError()
    return {
      arguments: [
        'delete-build-terminal',
        ...Object.values(parent),
        ...Object.values(buildRoot),
        ...Object.values(helper),
      ],
      stdio: ['ignore', 'pipe', 'pipe', ...descriptors],
    }
  }
  if (kind === 'delete-build-terminal-shared') {
    exactKeys(operation, [
      'kind',
      'phase',
      'parent',
      'buildRoot',
      'helper',
      'siblings',
      'commandLockFd',
      'parentFd',
      'buildRootFd',
      'helperFd',
    ])
    if (operation.phase !== 'shared-a' && operation.phase !== 'shared-b')
      throw new PolicyNativeLaunchContractError()
    exactKeys(operation.siblings, [
      'candidate-review',
      'discovery',
      'predecessor-review',
      'policy-native-derivation',
    ])
    const parent = metadataEvidence(operation.parent)
    const buildRoot = metadataEvidence(operation.buildRoot)
    const helper = metadataEvidence(operation.helper)
    const siblings = {
      'candidate-review': metadataEvidence(
        operation.siblings['candidate-review'],
      ),
      discovery: metadataEvidence(operation.siblings.discovery),
      'predecessor-review': metadataEvidence(
        operation.siblings['predecessor-review'],
      ),
      'policy-native-derivation': metadataEvidence(
        operation.siblings['policy-native-derivation'],
      ),
    }
    if (
      parent.mode !== '448' ||
      parent.links !== '8' ||
      parent.size !== 'na' ||
      buildRoot.uid !== parent.uid ||
      buildRoot.device !== parent.device ||
      buildRoot.mode !== '448' ||
      buildRoot.links !== '3' ||
      buildRoot.size !== 'na' ||
      helper.uid !== parent.uid ||
      helper.device !== parent.device ||
      helper.mode !== '320' ||
      helper.links !== '1' ||
      helper.size === 'na' ||
      helper.size === '0' ||
      Object.values(siblings).some(
        (sibling) =>
          sibling.uid !== parent.uid ||
          sibling.device !== parent.device ||
          sibling.size !== 'na' ||
          sibling.inode === parent.inode,
      ) ||
      siblings['policy-native-derivation'].mode !== '448' ||
      (operation.phase === 'shared-a'
        ? siblings['policy-native-derivation'].links !== '3'
        : siblings['policy-native-derivation'].links !== '4')
    )
      throw new PolicyNativeLaunchContractError()
    const descriptors = [
      descriptor(operation.commandLockFd, 6),
      descriptor(operation.parentFd, 6),
      descriptor(operation.buildRootFd, 6),
      descriptor(operation.helperFd, 6),
    ]
    if (new Set(descriptors).size !== 4)
      throw new PolicyNativeLaunchContractError()
    return {
      arguments: [
        'delete-build-terminal-shared',
        operation.phase,
        ...Object.values(parent),
        ...Object.values(buildRoot),
        ...Object.values(helper),
        ...Object.values(siblings['candidate-review']),
        ...Object.values(siblings.discovery),
        ...Object.values(siblings['predecessor-review']),
        ...Object.values(siblings['policy-native-derivation']),
      ],
      stdio: ['ignore', 'pipe', 'pipe', ...descriptors],
    }
  }
  throw new PolicyNativeLaunchContractError()
}

/**
 * Fixture-only view of the fixed shared-terminal ABI. Production callers can
 * obtain plans only through a branded helper capability.
 */
export function createPolicySharedTerminalPlanForFixture(operation: unknown) {
  if (process.env.NODE_ENV !== 'test')
    throw new PolicyNativeLaunchContractError()
  const plan = createHelperArgumentsAndStdio(operation)
  if (
    plan.arguments[0] !== 'delete-build-terminal-shared' ||
    (plan.arguments[1] !== 'shared-a' && plan.arguments[1] !== 'shared-b') ||
    plan.arguments.length !== 44 ||
    plan.stdio.length !== 7
  )
    throw new PolicyNativeLaunchContractError()
  return Object.freeze({
    arguments: Object.freeze([...plan.arguments]),
    stdio: Object.freeze([...plan.stdio]),
  })
}

export function createPolicyNativeHelperPlan(
  capabilityInput: unknown,
  operation: unknown,
): PolicyNativeLaunchPlan {
  const capability = helperCapability(capabilityInput)
  const closed = createHelperArgumentsAndStdio(operation)
  return {
    executable: capability.helperPath,
    arguments: closed.arguments,
    cwd: capability.repositoryRoot,
    environment: {},
    stdio: closed.stdio,
    ...helperLimits,
    acceptedExitCodes: [0, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
  }
}

export function createPolicyFdAdmissionProbePlan(
  capabilityInput: unknown,
  commandLockFd: unknown,
): PolicyNativeLaunchPlan {
  const capability = fdAdmissionProbeCapability(capabilityInput)
  const fd = descriptor(commandLockFd, 3)
  return {
    executable: capability.probePath,
    arguments: [],
    cwd: capability.repositoryRoot,
    environment: {},
    stdio: ['ignore', 'pipe', 'pipe', fd],
    ...helperLimits,
    acceptedExitCodes: [0, 21, 23, 24, 25],
  }
}

const bCandidateMetadataRoles = new Set([
  'command-lock',
  'build-root',
  'build-tmp',
  'build-source',
  'build-helper',
  'preflight-root',
  'preflight-directory',
  'preflight-file',
])
const bCandidateDeleteRoles = new Set([
  'build-source',
  'build-tmp',
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
])
const bCandidateCleanupDeleteRoles = new Set([
  ...bCandidateDeleteRoles,
  'preflight-success-source-promotion',
])

export function createPolicyBCandidateHelperPlan(
  capabilityInput: unknown,
  operation: unknown,
): PolicyNativeLaunchPlan {
  const capability = bCandidateCapability(capabilityInput)
  if (operation === null || typeof operation !== 'object')
    throw new PolicyNativeLaunchContractError()
  const candidateOperation = operation as {
    kind?: unknown
    role?: unknown
  }
  const permitted =
    (candidateOperation.kind === 'metadata-check' &&
      typeof candidateOperation.role === 'string' &&
      bCandidateMetadataRoles.has(candidateOperation.role)) ||
    candidateOperation.kind === 'acl-fixture' ||
    candidateOperation.kind === 'preflight-promotion' ||
    (candidateOperation.kind === 'delete-entry' &&
      typeof candidateOperation.role === 'string' &&
      bCandidateDeleteRoles.has(candidateOperation.role)) ||
    candidateOperation.kind === 'delete-build-terminal'
  if (!permitted) throw new PolicyNativeLaunchContractError()
  const closed = createHelperArgumentsAndStdio(operation)
  return {
    executable: capability.helperPath,
    arguments: closed.arguments,
    cwd: capability.repositoryRoot,
    environment: {},
    stdio: closed.stdio,
    ...helperLimits,
    acceptedExitCodes: [0, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
  }
}

export function createPolicyBCandidateCleanupPlan(
  capabilityInput: unknown,
  operation: unknown,
): PolicyNativeLaunchPlan {
  const capability = bCandidateCleanupCapability(capabilityInput)
  if (operation === null || typeof operation !== 'object')
    throw new PolicyNativeLaunchContractError()
  const value = operation as {
    kind?: unknown
    role?: unknown
    action?: unknown
  }
  const permitted =
    (value.kind === 'metadata-check' &&
      typeof value.role === 'string' &&
      bCandidateMetadataRoles.has(value.role)) ||
    (value.kind === 'acl-fixture' &&
      (value.action === 'remove' ||
        value.action === 'inspect-empty' ||
        value.action === 'inspect-fixture')) ||
    (value.kind === 'delete-entry' &&
      typeof value.role === 'string' &&
      bCandidateCleanupDeleteRoles.has(value.role)) ||
    value.kind === 'delete-build-terminal'
  if (!permitted) throw new PolicyNativeLaunchContractError()
  const closed = createHelperArgumentsAndStdio(operation)
  return {
    executable: capability.helperPath,
    arguments: closed.arguments,
    cwd: capability.repositoryRoot,
    environment: {},
    stdio: closed.stdio,
    ...helperLimits,
    acceptedExitCodes: [0, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
  }
}

export function createPolicyCAcceptedHelperPlan(
  capabilityInput: unknown,
  operation: unknown,
): PolicyNativeLaunchPlan {
  const capability = cAcceptedCapability(capabilityInput)
  if (operation === null || typeof operation !== 'object')
    throw new PolicyNativeLaunchContractError()
  const value = operation as { kind?: unknown; role?: unknown }
  const permitted =
    (value.kind === 'metadata-check' &&
      typeof value.role === 'string' &&
      bCandidateMetadataRoles.has(value.role)) ||
    value.kind === 'acl-fixture' ||
    value.kind === 'preflight-promotion' ||
    (value.kind === 'delete-entry' &&
      typeof value.role === 'string' &&
      bCandidateDeleteRoles.has(value.role)) ||
    value.kind === 'delete-build-terminal'
  if (!permitted) throw new PolicyNativeLaunchContractError()
  const closed = createHelperArgumentsAndStdio(operation)
  return {
    executable: capability.helperPath,
    arguments: closed.arguments,
    cwd: capability.repositoryRoot,
    environment: {},
    stdio: closed.stdio,
    ...helperLimits,
    acceptedExitCodes: [0, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
  }
}

export function createPolicyCAcceptedCleanupPlan(
  capabilityInput: unknown,
  operation: unknown,
): PolicyNativeLaunchPlan {
  const capability = cAcceptedCleanupCapability(capabilityInput)
  if (operation === null || typeof operation !== 'object')
    throw new PolicyNativeLaunchContractError()
  const value = operation as {
    kind?: unknown
    role?: unknown
    action?: unknown
  }
  const permitted =
    (value.kind === 'metadata-check' &&
      typeof value.role === 'string' &&
      bCandidateMetadataRoles.has(value.role)) ||
    (value.kind === 'acl-fixture' &&
      (value.action === 'remove' ||
        value.action === 'inspect-empty' ||
        value.action === 'inspect-fixture')) ||
    (value.kind === 'delete-entry' &&
      typeof value.role === 'string' &&
      bCandidateCleanupDeleteRoles.has(value.role)) ||
    value.kind === 'delete-build-terminal'
  if (!permitted) throw new PolicyNativeLaunchContractError()
  const closed = createHelperArgumentsAndStdio(operation)
  return {
    executable: capability.helperPath,
    arguments: closed.arguments,
    cwd: capability.repositoryRoot,
    environment: {},
    stdio: closed.stdio,
    ...helperLimits,
    acceptedExitCodes: [0, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
  }
}
import { createHash } from 'node:crypto'

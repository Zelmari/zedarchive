import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import type { ChildProcess, SpawnOptions } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  createPolicyBCandidateCleanupCapability,
  createPolicyBCandidateCleanupPlan,
  createPolicyBCandidateCapability,
  createPolicyBCandidateHelperPlan,
  createPolicyCAcceptedCapability,
  createPolicyCAcceptedCleanupCapability,
  createPolicyCAcceptedCleanupPlan,
  createPolicyCAcceptedHelperPlan,
  createPolicyCompilerCapability,
  createPolicyCompilerDiagnosticCapability,
  createPolicyCompilerPlan,
  createPolicyCompilerResourcePlan,
  createPolicyFdAdmissionProbeCapability,
  createPolicyFdAdmissionProbeCompilerCapability,
  createPolicyFdAdmissionProbeCompilerDiagnosticCapability,
  createPolicyFdAdmissionProbeCompilerDiagnosticPlan,
  createPolicyFdAdmissionProbeCompilerPlan,
  createPolicyFdAdmissionProbePlan,
  createPolicyHelperCapability,
  createPolicyLockPreflightPlan,
  createPolicyNativeHelperPlan,
  createPolicyXcrunPlan,
  type PolicyRepositoryCapability,
} from './m45-policy-baseline-native-launch-contract'

const lockPreflightWorkerPath = fileURLToPath(
  new URL(
    './policy-baseline-review/lock-preflight-worker.mjs',
    import.meta.url,
  ),
)

export type PolicyNativeLifecycleResult = Readonly<{
  code: number
  stdout: Buffer
  stderr: Buffer
  stdoutBytes: number
  stderrBytes: number
  processGroupAbsent: true
  streamsClosed: true
  /** Exact launch-plan observations retained by the bridge, never inferred. */
  argvCount: number
  childDescriptorMap: readonly number[]
}>

function exactKeys(value: unknown, keys: readonly string[]): void {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')
  )
    throw new Error('policy-native-c-accepted-cleanup')
}

type ClosedPlan = ReturnType<typeof createPolicyXcrunPlan>
function isProcessGroupAbsent(pid: number): boolean {
  try {
    process.kill(-pid, 0)
    return false
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH'
  }
}
async function awaitProcessGroupAbsence(pid: number): Promise<boolean> {
  for (let attempt = 0; attempt < 64; attempt += 1) {
    if (isProcessGroupAbsent(pid)) return true
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
  return isProcessGroupAbsent(pid)
}

async function runClosedPlan(
  plan: ClosedPlan,
): Promise<PolicyNativeLifecycleResult> {
  let stdoutBytes = 0
  let stderrBytes = 0
  const stdoutChunks: Buffer[] = []
  const stderrChunks: Buffer[] = []
  let failed = false
  let killRequested = false
  let spawnError = false
  let childClosed = false
  const options: SpawnOptions = {
    cwd: plan.cwd,
    env: { ...plan.environment } as NodeJS.ProcessEnv,
    shell: false,
    detached: true,
    stdio: [...plan.stdio] as SpawnOptions['stdio'],
  }
  let child: ChildProcess
  try {
    child = spawn(plan.executable, [...plan.arguments], options)
  } catch {
    throw new Error('policy-native-launch-failed')
  }
  const killGroup = () => {
    failed = true
    if (killRequested || child.pid === undefined || child.pid <= 0) return
    killRequested = true
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') failed = true
    }
  }
  const retain = (stream: 'stdout' | 'stderr', chunk: Buffer) => {
    if (stream === 'stdout') stdoutBytes += chunk.byteLength
    else stderrBytes += chunk.byteLength
    if (
      stdoutBytes > plan.stdoutByteLimit ||
      stderrBytes > plan.stderrByteLimit ||
      stdoutBytes + stderrBytes > plan.combinedOutputByteLimit ||
      (plan.outputMode === 'zero' && chunk.byteLength !== 0)
    ) {
      killGroup()
      return
    }
    if (stream === 'stdout') stdoutChunks.push(Buffer.from(chunk))
    else stderrChunks.push(Buffer.from(chunk))
  }
  child.stdout?.on('data', (chunk: Buffer) => retain('stdout', chunk))
  child.stderr?.on('data', (chunk: Buffer) => retain('stderr', chunk))
  if (child.stdout === null || child.stderr === null) killGroup()
  const close = new Promise<
    Readonly<{ code: number | null; signal: string | null }>
  >((resolve) => {
    child.once('error', () => {
      spawnError = true
      killGroup()
    })
    child.once('close', (code, signal) => {
      childClosed = true
      resolve({ code, signal })
    })
  })
  const timeout = setTimeout(killGroup, plan.timeoutMilliseconds)
  let outcome: Awaited<typeof close>
  try {
    if (child.pid === undefined || child.pid <= 0) killGroup()
    outcome = await close
  } finally {
    clearTimeout(timeout)
    child.stdout?.destroy()
    child.stderr?.destroy()
  }
  const code = outcome.code
  if (
    !childClosed ||
    spawnError ||
    code === null ||
    !plan.acceptedExitCodes.includes(code) ||
    outcome.signal !== null
  )
    failed = true
  let groupAbsent = child.pid === undefined || child.pid <= 0
  if (child.pid !== undefined && child.pid > 0) {
    groupAbsent = isProcessGroupAbsent(child.pid)
    if (!groupAbsent) {
      killGroup()
      groupAbsent = await awaitProcessGroupAbsence(child.pid)
    }
  }
  if (failed || !groupAbsent) throw new Error('policy-native-launch-failed')
  if (code === null) throw new Error('policy-native-launch-failed')
  return {
    code,
    stdout: Buffer.concat(stdoutChunks),
    stderr: Buffer.concat(stderrChunks),
    stdoutBytes,
    stderrBytes,
    processGroupAbsent: true,
    streamsClosed: true,
    argvCount: plan.arguments.length,
    childDescriptorMap: plan.stdio.slice(3).map((descriptor) => {
      if (typeof descriptor !== 'number')
        throw new Error('policy-native-launch-failed')
      return descriptor
    }),
  }
}

type PolicyNativeOperationBroker = Readonly<{
  beginBCandidateSession: (input: unknown) => object
  runBCandidateHelper: (
    session: unknown,
    operation: unknown,
  ) => Promise<PolicyNativeLifecycleResult>
  closeBCandidateSession: (session: unknown) => void
  abortBCandidateSession: (session: unknown) => void
  beginBCandidateCleanup: (session: unknown, admission: unknown) => object
  runBCandidateCleanup: (
    session: unknown,
    operation: unknown,
  ) => Promise<PolicyNativeLifecycleResult>
  runBCandidateCleanupInspection: (
    session: unknown,
    operation: unknown,
  ) => Promise<PolicyNativeLifecycleResult>
  rebaseBCandidateCleanup: (session: unknown, checkpoint: unknown) => void
  closeBCandidateCleanup: (session: unknown) => void
  abortBCandidateCleanup: (session: unknown) => void
  beginCAcceptedSession: (input: unknown) => object
  runCAcceptedHelper: (
    session: unknown,
    operation: unknown,
  ) => Promise<PolicyNativeLifecycleResult>
  closeCAcceptedSession: (session: unknown) => void
  abortCAcceptedSession: (session: unknown) => void
  beginCAcceptedCleanup: (session: unknown, admission: unknown) => object
  runCAcceptedCleanup: (
    session: unknown,
    operation: unknown,
  ) => Promise<PolicyNativeLifecycleResult>
  runCAcceptedCleanupInspection: (
    session: unknown,
    operation: unknown,
  ) => Promise<PolicyNativeLifecycleResult>
  rebaseCAcceptedCleanup: (
    session: unknown,
    checkpoint: unknown,
    checkpointSha256: unknown,
  ) => void
  closeCAcceptedCleanup: (session: unknown) => void
  abortCAcceptedCleanup: (session: unknown) => void
  snapshotCAcceptedCleanupForFixture: (
    session: unknown,
  ) => Readonly<Record<string, unknown>>
  verifyCAcceptedCleanupForFixture: (session: unknown, value: unknown) => void
  runLockContender: (
    input: PolicyRepositoryCapability & Readonly<{ workerSha256: string }>,
    acceptedWorkerSha256: string,
  ) => Promise<PolicyNativeLifecycleResult>
  runXcrunCompilerPath: (
    input: PolicyRepositoryCapability,
  ) => Promise<PolicyNativeLifecycleResult>
  runXcrunSdkPath: (
    input: PolicyRepositoryCapability,
  ) => Promise<PolicyNativeLifecycleResult>
  runCompilerResourceDir: (
    input: unknown,
  ) => Promise<PolicyNativeLifecycleResult>
  runCompilerDiagnostic: (
    input: unknown,
  ) => Promise<PolicyNativeLifecycleResult>
  runCompilerBuild: (input: unknown) => Promise<PolicyNativeLifecycleResult>
  runHelper: (
    capability: unknown,
    operation: unknown,
  ) => Promise<PolicyNativeLifecycleResult>
  runFdAdmissionProbe: (
    capability: unknown,
    commandLockFd: unknown,
  ) => Promise<PolicyNativeLifecycleResult>
  runFdAdmissionProbeCompiler: (
    capability: unknown,
    input: unknown,
  ) => Promise<PolicyNativeLifecycleResult>
  runFdAdmissionProbeCompilerDiagnostic: (
    capability: unknown,
  ) => Promise<PolicyNativeLifecycleResult>
}>

let initialized = false
export function initializePolicyNativeOperationBroker(): PolicyNativeOperationBroker {
  if (initialized) throw new Error('policy-native-launch-initialized')
  initialized = true
  const candidateSessions = new WeakMap<object, unknown>()
  const failedCandidateSessions = new WeakMap<object, unknown>()
  const cleanupSessions = new WeakMap<
    object,
    Readonly<{
      capability: unknown
      operations: readonly string[]
      cleanupSessionSha256: string
    }>
  >()
  const cleanupOperationCursor = new WeakMap<object, number>()
  const cSessions = new WeakMap<object, unknown>()
  const failedCSessions = new WeakMap<object, unknown>()
  const closedCSessions = new WeakSet<object>()
  const cHashes = new Set<string>()
  const cOperationCursor = new WeakMap<object, number>()
  const cCleanupSessions = new WeakMap<
    object,
    Readonly<{
      capability: unknown
      operations: readonly string[]
      cleanupCore: Readonly<Record<string, unknown>>
      cAcceptedCleanupSessionSha256: string
    }>
  >()
  const cCleanupCursor = new WeakMap<object, number>()
  // A cleanup child is consumed before launch.  Its session stays branded and
  // one-way failed so the bridge can reopen the finite table and continue only
  // at a proved poststate; it can never offer the failed row again.
  const failedCleanupSessions = new WeakSet<object>()
  const closedCandidateSessions = new WeakSet<object>()
  const candidateHashes = new Set<string>()
  const candidateOperationCursor = new WeakMap<object, number>()
  const expectedBCandidateOperations = [
    'metadata-check:command-lock',
    'metadata-check:build-root',
    'metadata-check:build-tmp',
    'metadata-check:build-source',
    'metadata-check:build-helper',
    'metadata-check:preflight-root',
    'metadata-check:preflight-directory',
    'metadata-check:preflight-file',
    'acl-fixture:install',
    'metadata-check:preflight-directory',
    'acl-fixture:remove',
    'preflight-promotion:success',
    'preflight-promotion:collision',
    'delete-entry:preflight-success-destination-promotion',
    'delete-entry:preflight-collision-source-promotion',
    'delete-entry:preflight-collision-destination-promotion',
    'delete-entry:preflight-success-source-file',
    'delete-entry:preflight-success-destination-file',
    'delete-entry:preflight-collision-source-file',
    'delete-entry:preflight-collision-destination-file',
    'delete-entry:preflight-success-source-directory',
    'delete-entry:preflight-success-destination-directory',
    'delete-entry:preflight-collision-source-directory',
    'delete-entry:preflight-collision-destination-directory',
    'delete-entry:preflight-acl-fixture-directory',
    'delete-entry:preflight-root',
    'delete-entry:build-source',
    'delete-entry:build-tmp',
    'delete-build-terminal',
  ] as const
  const expectedCAcceptedOperations = expectedBCandidateOperations
  const commonCleanupSuffix = [
    'delete-entry:preflight-collision-source-promotion',
    'delete-entry:preflight-collision-destination-promotion',
    'delete-entry:preflight-success-source-file',
    'delete-entry:preflight-success-destination-file',
    'delete-entry:preflight-collision-source-file',
    'delete-entry:preflight-collision-destination-file',
    'delete-entry:preflight-success-source-directory',
    'delete-entry:preflight-success-destination-directory',
    'delete-entry:preflight-collision-source-directory',
    'delete-entry:preflight-collision-destination-directory',
    'delete-entry:preflight-acl-fixture-directory',
    'delete-entry:preflight-root',
    'delete-entry:build-source',
    'delete-entry:build-tmp',
    'delete-build-terminal',
  ] as const
  const cleanupRows = [
    'delete-entry:preflight-success-source-promotion',
    'delete-entry:preflight-success-destination-promotion',
    ...commonCleanupSuffix,
  ] as const
  const cleanupCheckpointRows = [
    'R01i',
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
    'R16',
  ] as const
  const cleanupOperationsForCheckpoint = (checkpoint: unknown) => {
    if (typeof checkpoint !== 'string')
      throw new Error('policy-native-candidate-cleanup')
    const initial = [
      'delete-entry:preflight-success-source-promotion',
      ...commonCleanupSuffix,
    ]
    const success = [
      'delete-entry:preflight-success-destination-promotion',
      ...commonCleanupSuffix,
    ]
    if (checkpoint === 'O1') return ['acl-fixture:remove', ...initial]
    if (checkpoint === 'P13') return initial
    if (checkpoint === 'O2' || checkpoint === 'O3') return success
    if (checkpoint === 'T0') return ['delete-build-terminal']
    const row = cleanupCheckpointRows.indexOf(
      checkpoint as (typeof cleanupCheckpointRows)[number],
    )
    if (row >= 0) return cleanupRows.slice(row)
    throw new Error('policy-native-candidate-cleanup')
  }
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
    if (value !== null && typeof value === 'object')
      return `{${Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
        .join(',')}}`
    return JSON.stringify(value)
  }
  const hashCanonical = (value: unknown): string =>
    createHash('sha256').update(canonical(value)).digest('hex')
  const cCleanupRecord = (
    capability: {
      cAcceptedHelperLaunchSha256: string
      acceptedHelperSha256: string
      observedHelperSha256: string
      commandLockEvidenceSha256: string
    },
    admission: Record<string, unknown>,
    operations: readonly string[],
  ) => {
    const core = {
      schema: 'policy-c-accepted-cleanup.v1',
      version: 1,
      workflow: 'C-accepted',
      cAcceptedHelperLaunchSha256: capability.cAcceptedHelperLaunchSha256,
      acceptedHelperSha256: capability.acceptedHelperSha256,
      observedHelperSha256: capability.observedHelperSha256,
      checkpoint: admission.checkpoint,
      checkpointSha256: admission.checkpointSha256,
      checkpointWorkflow: 'C-accepted',
      failedOperationFamily: admission.failedOperationFamily,
      failedOperationIndex: admission.failedOperationIndex,
      childLaunched: admission.childLaunched,
      lifecycleClosed: admission.lifecycleClosed,
      commandLockEvidenceSha256: capability.commandLockEvidenceSha256,
      permittedSuffix: [...operations],
    }
    return {
      cleanupCore: Object.freeze(core),
      cAcceptedCleanupSessionSha256: hashCanonical(core),
    }
  }
  const parseCAcceptedCleanupRecord = (
    capability: {
      cAcceptedHelperLaunchSha256: string
      acceptedHelperSha256: string
      observedHelperSha256: string
      commandLockEvidenceSha256: string
    },
    value: unknown,
  ) => {
    exactKeys(value, [
      'schema',
      'version',
      'workflow',
      'cAcceptedHelperLaunchSha256',
      'acceptedHelperSha256',
      'observedHelperSha256',
      'checkpoint',
      'checkpointSha256',
      'checkpointWorkflow',
      'failedOperationFamily',
      'failedOperationIndex',
      'childLaunched',
      'lifecycleClosed',
      'commandLockEvidenceSha256',
      'permittedSuffix',
      'cAcceptedCleanupSessionSha256',
    ])
    const { cAcceptedCleanupSessionSha256, ...core } = value as Record<
      string,
      unknown
    >
    let expectedSuffix: readonly string[]
    try {
      expectedSuffix = cleanupOperationsForCheckpoint(core.checkpoint)
    } catch {
      throw new Error('policy-native-c-accepted-cleanup')
    }
    if (
      core.schema !== 'policy-c-accepted-cleanup.v1' ||
      core.version !== 1 ||
      core.workflow !== 'C-accepted' ||
      core.cAcceptedHelperLaunchSha256 !==
        capability.cAcceptedHelperLaunchSha256 ||
      core.acceptedHelperSha256 !== capability.acceptedHelperSha256 ||
      core.observedHelperSha256 !== capability.observedHelperSha256 ||
      core.commandLockEvidenceSha256 !== capability.commandLockEvidenceSha256 ||
      typeof core.checkpoint !== 'string' ||
      typeof core.checkpointSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(core.checkpointSha256) ||
      core.checkpointWorkflow !== 'C-accepted' ||
      typeof core.failedOperationFamily !== 'string' ||
      !Number.isSafeInteger(core.failedOperationIndex) ||
      (core.failedOperationIndex as number) < 0 ||
      typeof core.childLaunched !== 'boolean' ||
      core.lifecycleClosed !== true ||
      !Array.isArray(core.permittedSuffix) ||
      canonical(core.permittedSuffix) !== canonical(expectedSuffix) ||
      typeof cAcceptedCleanupSessionSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(cAcceptedCleanupSessionSha256) ||
      cAcceptedCleanupSessionSha256 !== hashCanonical(core)
    )
      throw new Error('policy-native-c-accepted-cleanup')
    return { cleanupCore: core, cAcceptedCleanupSessionSha256 }
  }
  const candidateOperationName = (operation: unknown): string => {
    if (operation === null || typeof operation !== 'object')
      throw new Error('policy-native-candidate-session')
    const value = operation as {
      kind?: unknown
      role?: unknown
      action?: unknown
      outcome?: unknown
    }
    if (typeof value.kind !== 'string')
      throw new Error('policy-native-candidate-session')
    if (value.kind === 'metadata-check' || value.kind === 'delete-entry') {
      if (typeof value.role !== 'string')
        throw new Error('policy-native-candidate-session')
      return `${value.kind}:${value.role}`
    }
    if (value.kind === 'acl-fixture') {
      if (value.action !== 'install' && value.action !== 'remove')
        throw new Error('policy-native-candidate-session')
      return `acl-fixture:${value.action}`
    }
    if (value.kind === 'preflight-promotion') {
      if (value.outcome !== 'success' && value.outcome !== 'collision')
        throw new Error('policy-native-candidate-session')
      return `preflight-promotion:${value.outcome}`
    }
    if (value.kind === 'delete-build-terminal') return value.kind
    throw new Error('policy-native-candidate-session')
  }
  const cleanupInspection = (operation: unknown): boolean => {
    if (operation === null || typeof operation !== 'object') return false
    const value = operation as {
      kind?: unknown
      action?: unknown
      role?: unknown
    }
    return (
      (value.kind === 'metadata-check' && typeof value.role === 'string') ||
      (value.kind === 'acl-fixture' &&
        (value.action === 'inspect-empty' ||
          value.action === 'inspect-fixture'))
    )
  }
  const requireCandidateSession = (session: unknown): unknown => {
    if (
      session === null ||
      typeof session !== 'object' ||
      closedCandidateSessions.has(session) ||
      !candidateSessions.has(session)
    )
      throw new Error('policy-native-candidate-session')
    return candidateSessions.get(session)
  }
  const requireCSession = (session: unknown): unknown => {
    if (
      session === null ||
      typeof session !== 'object' ||
      closedCSessions.has(session) ||
      !cSessions.has(session)
    )
      throw new Error('policy-native-c-accepted-session')
    return cSessions.get(session)
  }
  const checkedCleanupAdmission = (admission: unknown) => {
    if (
      admission === null ||
      typeof admission !== 'object' ||
      Array.isArray(admission) ||
      Object.keys(admission).sort().join('\0') !==
        [
          'checkpoint',
          'checkpointSha256',
          'childLaunched',
          'failedOperationFamily',
          'failedOperationIndex',
          'lifecycleClosed',
        ]
          .sort()
          .join('\0')
    )
      throw new Error('policy-native-c-accepted-cleanup')
    const value = admission as Record<string, unknown>
    if (
      typeof value.checkpoint !== 'string' ||
      typeof value.checkpointSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(value.checkpointSha256) ||
      typeof value.childLaunched !== 'boolean' ||
      typeof value.failedOperationFamily !== 'string' ||
      !Number.isSafeInteger(value.failedOperationIndex) ||
      (value.failedOperationIndex as number) < 0 ||
      value.lifecycleClosed !== true
    )
      throw new Error('policy-native-c-accepted-cleanup')
    return value
  }
  const checkedCAcceptedCleanupAdmission = (admission: unknown) => {
    if (
      admission === null ||
      typeof admission !== 'object' ||
      Array.isArray(admission) ||
      Object.keys(admission).sort().join('\0') !==
        [
          'workflow',
          'checkpoint',
          'checkpointSha256',
          'checkpointWorkflow',
          'childLaunched',
          'failedOperationFamily',
          'failedOperationIndex',
          'lifecycleClosed',
        ]
          .sort()
          .join('\0') ||
      (admission as Record<string, unknown>).workflow !== 'C-accepted' ||
      (admission as Record<string, unknown>).checkpointWorkflow !== 'C-accepted'
    )
      throw new Error('policy-native-c-accepted-cleanup')
    const core = { ...(admission as Record<string, unknown>) }
    delete core.workflow
    delete core.checkpointWorkflow
    return checkedCleanupAdmission(core)
  }
  return Object.freeze({
    beginBCandidateSession: (input) => {
      const capability = createPolicyBCandidateCapability(input)
      if (candidateHashes.has(capability.candidateHelperSha256))
        throw new Error('policy-native-candidate-session')
      candidateHashes.add(capability.candidateHelperSha256)
      const session = Object.freeze({})
      candidateSessions.set(session, capability)
      candidateOperationCursor.set(session, 0)
      return session
    },
    runBCandidateHelper: async (session, operation) => {
      const capability = requireCandidateSession(session)
      const cursor = candidateOperationCursor.get(session as object)
      if (
        cursor === undefined ||
        candidateOperationName(operation) !==
          expectedBCandidateOperations[cursor]
      )
        throw new Error('policy-native-candidate-session')
      candidateOperationCursor.set(session as object, cursor + 1)
      try {
        return await runClosedPlan(
          createPolicyBCandidateHelperPlan(capability, operation),
        )
      } catch (error) {
        failedCandidateSessions.set(session as object, capability)
        candidateSessions.delete(session as object)
        candidateOperationCursor.delete(session as object)
        closedCandidateSessions.add(session as object)
        throw error
      }
    },
    closeBCandidateSession: (session) => {
      requireCandidateSession(session)
      if (
        candidateOperationCursor.get(session as object) !==
        expectedBCandidateOperations.length
      )
        throw new Error('policy-native-candidate-session')
      candidateSessions.delete(session as object)
      candidateOperationCursor.delete(session as object)
      closedCandidateSessions.add(session as object)
    },
    abortBCandidateSession: (session) => {
      if (
        session === null ||
        typeof session !== 'object' ||
        (!candidateSessions.has(session) &&
          !failedCandidateSessions.has(session))
      )
        throw new Error('policy-native-candidate-session')
      candidateSessions.delete(session as object)
      failedCandidateSessions.delete(session as object)
      candidateOperationCursor.delete(session as object)
      closedCandidateSessions.add(session as object)
    },
    beginBCandidateCleanup: (session, admission) => {
      if (session === null || typeof session !== 'object')
        throw new Error('policy-native-candidate-cleanup')
      const capability =
        candidateSessions.get(session) ?? failedCandidateSessions.get(session)
      if (capability === undefined)
        throw new Error('policy-native-candidate-cleanup')
      if (
        admission === null ||
        typeof admission !== 'object' ||
        Array.isArray(admission) ||
        Object.keys(admission).sort().join('\0') !==
          [
            'checkpoint',
            'checkpointSha256',
            'childLaunched',
            'failedOperationFamily',
            'failedOperationIndex',
            'lifecycleClosed',
          ]
            .sort()
            .join('\0')
      )
        throw new Error('policy-native-candidate-cleanup')
      const value = admission as Record<string, unknown>
      if (
        typeof value.checkpoint !== 'string' ||
        typeof value.checkpointSha256 !== 'string' ||
        !/^[a-f0-9]{64}$/u.test(value.checkpointSha256) ||
        typeof value.childLaunched !== 'boolean' ||
        typeof value.failedOperationFamily !== 'string' ||
        !Number.isSafeInteger(value.failedOperationIndex) ||
        (value.failedOperationIndex as number) < 0 ||
        value.lifecycleClosed !== true
      )
        throw new Error('policy-native-candidate-cleanup')
      const operations = cleanupOperationsForCheckpoint(value.checkpoint)
      const cleanupCore = {
        schema: 'policy-b-candidate-cleanup.v1',
        candidateHelperSha256: (
          capability as {
            candidateHelperSha256: string
          }
        ).candidateHelperSha256,
        ...value,
        permittedSuffix: operations,
      }
      const cleanupSessionSha256 = createHash('sha256')
        .update(canonical(cleanupCore))
        .digest('hex')
      candidateSessions.delete(session)
      failedCandidateSessions.delete(session)
      candidateOperationCursor.delete(session)
      closedCandidateSessions.add(session)
      const cleanupSession = Object.freeze({})
      cleanupSessions.set(cleanupSession, {
        capability: createPolicyBCandidateCleanupCapability(capability),
        operations,
        cleanupSessionSha256,
      })
      cleanupOperationCursor.set(cleanupSession, 0)
      return cleanupSession
    },
    runBCandidateCleanup: async (session, operation) => {
      if (session === null || typeof session !== 'object')
        throw new Error('policy-native-candidate-cleanup')
      const cleanup = cleanupSessions.get(session)
      const cursor = cleanupOperationCursor.get(session)
      if (
        cleanup === undefined ||
        cursor === undefined ||
        candidateOperationName(operation) !== cleanup.operations[cursor]
      )
        throw new Error('policy-native-candidate-cleanup')
      cleanupOperationCursor.set(session, cursor + 1)
      try {
        return await runClosedPlan(
          createPolicyBCandidateCleanupPlan(cleanup.capability, operation),
        )
      } catch (error) {
        failedCleanupSessions.add(session)
        throw error
      }
    },
    runBCandidateCleanupInspection: async (session, operation) => {
      if (
        session === null ||
        typeof session !== 'object' ||
        !cleanupSessions.has(session) ||
        !cleanupInspection(operation)
      )
        throw new Error('policy-native-candidate-cleanup')
      return runClosedPlan(
        createPolicyBCandidateCleanupPlan(
          cleanupSessions.get(session)!.capability,
          operation,
        ),
      )
    },
    rebaseBCandidateCleanup: (session, checkpoint) => {
      const cleanup = cleanupSessions.get(session as object)
      if (
        cleanup === undefined ||
        cleanupOperationCursor.get(session as object) !== 0
      )
        throw new Error('policy-native-candidate-cleanup')
      cleanupSessions.set(session as object, {
        ...cleanup,
        operations: cleanupOperationsForCheckpoint(checkpoint),
      })
    },
    closeBCandidateCleanup: (session) => {
      if (session === null || typeof session !== 'object')
        throw new Error('policy-native-candidate-cleanup')
      const cleanup = cleanupSessions.get(session)
      if (
        cleanup === undefined ||
        cleanupOperationCursor.get(session) !== cleanup.operations.length
      )
        throw new Error('policy-native-candidate-cleanup')
      cleanupSessions.delete(session)
      cleanupOperationCursor.delete(session)
      failedCleanupSessions.delete(session)
    },
    abortBCandidateCleanup: (session) => {
      if (
        session === null ||
        typeof session !== 'object' ||
        !cleanupSessions.has(session)
      )
        throw new Error('policy-native-candidate-cleanup')
      cleanupSessions.delete(session)
      cleanupOperationCursor.delete(session)
      failedCleanupSessions.delete(session)
    },
    beginCAcceptedSession: (input) => {
      const capability = createPolicyCAcceptedCapability(input)
      if (cHashes.has(capability.cAcceptedHelperLaunchSha256))
        throw new Error('policy-native-c-accepted-session')
      cHashes.add(capability.cAcceptedHelperLaunchSha256)
      const session = Object.freeze({})
      cSessions.set(session, capability)
      cOperationCursor.set(session, 0)
      return session
    },
    runCAcceptedHelper: async (session, operation) => {
      const capability = requireCSession(session)
      const cursor = cOperationCursor.get(session as object)
      if (
        cursor === undefined ||
        candidateOperationName(operation) !==
          expectedCAcceptedOperations[cursor]
      )
        throw new Error('policy-native-c-accepted-session')
      cOperationCursor.set(session as object, cursor + 1)
      try {
        return await runClosedPlan(
          createPolicyCAcceptedHelperPlan(capability, operation),
        )
      } catch (error) {
        failedCSessions.set(session as object, capability)
        cSessions.delete(session as object)
        cOperationCursor.delete(session as object)
        closedCSessions.add(session as object)
        throw error
      }
    },
    closeCAcceptedSession: (session) => {
      requireCSession(session)
      if (
        cOperationCursor.get(session as object) !==
        expectedCAcceptedOperations.length
      )
        throw new Error('policy-native-c-accepted-session')
      cSessions.delete(session as object)
      cOperationCursor.delete(session as object)
      closedCSessions.add(session as object)
    },
    abortCAcceptedSession: (session) => {
      if (
        session === null ||
        typeof session !== 'object' ||
        (!cSessions.has(session) && !failedCSessions.has(session))
      )
        throw new Error('policy-native-c-accepted-session')
      cSessions.delete(session as object)
      failedCSessions.delete(session as object)
      cOperationCursor.delete(session as object)
      closedCSessions.add(session as object)
    },
    beginCAcceptedCleanup: (session, admission) => {
      if (session === null || typeof session !== 'object')
        throw new Error('policy-native-c-accepted-cleanup')
      const capability = cSessions.get(session) ?? failedCSessions.get(session)
      if (capability === undefined)
        throw new Error('policy-native-c-accepted-cleanup')
      const value = checkedCAcceptedCleanupAdmission(admission)
      const operations = cleanupOperationsForCheckpoint(value.checkpoint)
      const cCapability = createPolicyCAcceptedCleanupCapability(
        capability,
      ) as {
        cAcceptedHelperLaunchSha256: string
        acceptedHelperSha256: string
        observedHelperSha256: string
        commandLockEvidenceSha256: string
      }
      const record = cCleanupRecord(cCapability, value, operations)
      cSessions.delete(session)
      failedCSessions.delete(session)
      cOperationCursor.delete(session)
      closedCSessions.add(session)
      const cleanup = Object.freeze({})
      cCleanupSessions.set(cleanup, {
        capability: cCapability,
        operations,
        ...record,
      })
      cCleanupCursor.set(cleanup, 0)
      return cleanup
    },
    runCAcceptedCleanup: async (session, operation) => {
      if (session === null || typeof session !== 'object')
        throw new Error('policy-native-c-accepted-cleanup')
      const cleanup = cCleanupSessions.get(session)
      const cursor = cCleanupCursor.get(session)
      if (
        cleanup === undefined ||
        cursor === undefined ||
        candidateOperationName(operation) !== cleanup.operations[cursor]
      )
        throw new Error('policy-native-c-accepted-cleanup')
      cCleanupCursor.set(session, cursor + 1)
      return runClosedPlan(
        createPolicyCAcceptedCleanupPlan(cleanup.capability, operation),
      )
    },
    runCAcceptedCleanupInspection: async (session, operation) => {
      if (
        session === null ||
        typeof session !== 'object' ||
        !cCleanupSessions.has(session) ||
        !cleanupInspection(operation)
      )
        throw new Error('policy-native-c-accepted-cleanup')
      return runClosedPlan(
        createPolicyCAcceptedCleanupPlan(
          cCleanupSessions.get(session)!.capability,
          operation,
        ),
      )
    },
    rebaseCAcceptedCleanup: (session, checkpoint, checkpointSha256) => {
      const cleanup = cCleanupSessions.get(session as object)
      if (cleanup === undefined || cCleanupCursor.get(session as object) !== 0)
        throw new Error('policy-native-c-accepted-cleanup')
      const value = checkedCAcceptedCleanupAdmission({
        workflow: 'C-accepted',
        checkpoint,
        checkpointSha256,
        checkpointWorkflow: 'C-accepted',
        failedOperationFamily: cleanup.cleanupCore.failedOperationFamily,
        failedOperationIndex: cleanup.cleanupCore.failedOperationIndex,
        childLaunched: cleanup.cleanupCore.childLaunched,
        lifecycleClosed: cleanup.cleanupCore.lifecycleClosed,
      })
      const operations = cleanupOperationsForCheckpoint(value.checkpoint)
      cCleanupSessions.set(session as object, {
        ...cleanup,
        operations,
        ...cCleanupRecord(
          cleanup.capability as {
            cAcceptedHelperLaunchSha256: string
            acceptedHelperSha256: string
            observedHelperSha256: string
            commandLockEvidenceSha256: string
          },
          value,
          operations,
        ),
      })
    },
    closeCAcceptedCleanup: (session) => {
      const cleanup = cCleanupSessions.get(session as object)
      if (
        cleanup === undefined ||
        cCleanupCursor.get(session as object) !== cleanup.operations.length
      )
        throw new Error('policy-native-c-accepted-cleanup')
      cCleanupSessions.delete(session as object)
      cCleanupCursor.delete(session as object)
    },
    abortCAcceptedCleanup: (session) => {
      if (
        session === null ||
        typeof session !== 'object' ||
        !cCleanupSessions.has(session)
      )
        throw new Error('policy-native-c-accepted-cleanup')
      cCleanupSessions.delete(session)
      cCleanupCursor.delete(session)
    },
    snapshotCAcceptedCleanupForFixture: (session) => {
      if (process.env.NODE_ENV !== 'test')
        throw new Error('policy-wrapper-isolation')
      const cleanup = cCleanupSessions.get(session as object)
      if (cleanup === undefined)
        throw new Error('policy-native-c-accepted-cleanup')
      return Object.freeze({
        ...cleanup.cleanupCore,
        cAcceptedCleanupSessionSha256: cleanup.cAcceptedCleanupSessionSha256,
      })
    },
    verifyCAcceptedCleanupForFixture: (session, value) => {
      if (process.env.NODE_ENV !== 'test')
        throw new Error('policy-wrapper-isolation')
      const cleanup = cCleanupSessions.get(session as object)
      if (cleanup === undefined)
        throw new Error('policy-native-c-accepted-cleanup')
      const parsed = parseCAcceptedCleanupRecord(
        cleanup.capability as {
          cAcceptedHelperLaunchSha256: string
          acceptedHelperSha256: string
          observedHelperSha256: string
          commandLockEvidenceSha256: string
        },
        value,
      )
      if (
        canonical(parsed.cleanupCore) !== canonical(cleanup.cleanupCore) ||
        parsed.cAcceptedCleanupSessionSha256 !==
          cleanup.cAcceptedCleanupSessionSha256
      )
        throw new Error('policy-native-c-accepted-cleanup')
    },
    runLockContender: (input, acceptedWorkerSha256) =>
      runClosedPlan(
        createPolicyLockPreflightPlan(input, {
          executable: process.execPath,
          workerPath: lockPreflightWorkerPath,
          acceptedWorkerSha256,
        }),
      ),
    runXcrunCompilerPath: (input) =>
      runClosedPlan(createPolicyXcrunPlan('compiler-path', input)),
    runXcrunSdkPath: (input) =>
      runClosedPlan(createPolicyXcrunPlan('sdk-path', input)),
    runCompilerResourceDir: (input) =>
      runClosedPlan(createPolicyCompilerResourcePlan(input)),
    runCompilerDiagnostic: (input) =>
      runClosedPlan(
        createPolicyCompilerPlan(
          'diagnostic',
          createPolicyCompilerDiagnosticCapability(input),
        ),
      ),
    runCompilerBuild: (input) =>
      runClosedPlan(
        createPolicyCompilerPlan(
          'build',
          createPolicyCompilerCapability(input),
        ),
      ),
    runHelper: (capability, operation) =>
      runClosedPlan(
        createPolicyNativeHelperPlan(
          createPolicyHelperCapability(capability),
          operation,
        ),
      ),
    runFdAdmissionProbe: (capability, commandLockFd) =>
      runClosedPlan(
        createPolicyFdAdmissionProbePlan(
          createPolicyFdAdmissionProbeCapability(capability),
          commandLockFd,
        ),
      ),
    runFdAdmissionProbeCompiler: (capability, input) =>
      runClosedPlan(
        createPolicyFdAdmissionProbeCompilerPlan(
          createPolicyFdAdmissionProbeCompilerCapability(capability),
          input,
        ),
      ),
    runFdAdmissionProbeCompilerDiagnostic: (capability) =>
      runClosedPlan(
        createPolicyFdAdmissionProbeCompilerDiagnosticPlan(
          createPolicyFdAdmissionProbeCompilerDiagnosticCapability(capability),
        ),
      ),
  })
}

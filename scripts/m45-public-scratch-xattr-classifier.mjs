import { spawn } from 'node:child_process'
import { constants as fsConstants } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const operation = 'diagnose-public-scratch-classifier-stop'
const confirmation = '--confirm-m45-public-scratch-classifier-stop-v1'
const nodePath = '/opt/homebrew/Cellar/node@24/24.18.1/bin/node'
const parentPath = '/private/tmp'
const scratchPath = '/private/tmp/zedarchive-m45-fd-admission-probe'
const lsPath = '/bin/ls'
const lsArguments = Object.freeze(['-lidne@B', scratchPath])
const fixedEnvironment = Object.freeze({ LC_ALL: 'C', LANG: 'C', TZ: 'UTC' })
const outputCap = 4096
const childTimeoutMs = 1000
const operationBudgetMs = 2000
const groupProbeCount = 20
const groupProbeDelayMs = 10
const faultCompletionTimeoutMs =
  operationBudgetMs - childTimeoutMs - groupProbeCount * groupProbeDelayMs
const darwinNoFollow = 0x00000100
const darwinDirectory = 0x00100000
const darwinCloseOnExec = 0x01000000
const expectedParent = Object.freeze({
  uid: 0,
  dev: 16777231,
  ino: 13457399,
  mode: 0o1777,
})
const expectedScratch = Object.freeze({
  uid: 501,
  dev: 16777231,
  ino: 13940765,
  mode: 0o700,
  nlink: 2,
})
const stages = Object.freeze([
  'host-admission',
  'directory-flags',
  'parent-open',
  'scratch-open',
  'pre-identity',
  'child-spawn',
  'child-timeout',
  'child-overflow',
  'child-stderr',
  'child-stream',
  'child-exit',
  'child-group',
  'post-identity',
  'parse-encoding',
  'parse-envelope',
  'parse-base',
  'parse-xattr-row',
  'parse-marker',
  'budget',
  'close',
  'pipeline-complete',
  'stopped',
])
const childStages = Object.freeze([
  'child-spawn',
  'child-timeout',
  'child-overflow',
  'child-stderr',
  'child-stream',
  'child-exit',
  'child-group',
])
const childSignals = Object.freeze([
  'SIGABRT',
  'SIGALRM',
  'SIGBUS',
  'SIGCHLD',
  'SIGCONT',
  'SIGEMT',
  'SIGFPE',
  'SIGHUP',
  'SIGILL',
  'SIGINFO',
  'SIGINT',
  'SIGIO',
  'SIGKILL',
  'SIGPROF',
  'SIGPIPE',
  'SIGQUIT',
  'SIGSEGV',
  'SIGSTOP',
  'SIGSYS',
  'SIGTERM',
  'SIGTHR',
  'SIGTRAP',
  'SIGTSTP',
  'SIGTTIN',
  'SIGTTOU',
  'SIGURG',
  'SIGUSR1',
  'SIGUSR2',
  'SIGVTALRM',
  'SIGWINCH',
  'SIGXCPU',
  'SIGXFSZ',
])
const privateClasses = Object.freeze([
  'only-provenance-11',
  'no-xattr',
  'other-xattr-set',
])
const pipelineAbort = Symbol('pipeline-abort')

function exactProductionArgv(argv) {
  return (
    Array.isArray(argv) &&
    argv.length === 2 &&
    argv[0] === operation &&
    argv[1] === confirmation
  )
}

function exactKeys(value, expected) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join('\0') !== [...expected].sort().join('\0')
  )
    throw new Error('classifier-stopped')
}

function canonicalDecimal(value) {
  return /^(?:0|[1-9][0-9]*)$/u.test(value)
}

function parseLsBytes(bytes, expectedGid) {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.byteLength === 0 ||
    bytes.byteLength > outputCap ||
    !Number.isSafeInteger(expectedGid) ||
    expectedGid < 0
  )
    return Object.freeze({ failureStage: 'parse-envelope', privateClass: null })

  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return Object.freeze({ failureStage: 'parse-encoding', privateClass: null })
  }

  if (
    !text.endsWith('\n') ||
    text.includes('\0') ||
    text.includes('\r') ||
    [...bytes].some(
      (byte) => (byte < 0x20 && byte !== 0x09 && byte !== 0x0a) || byte > 0x7e,
    )
  )
    return Object.freeze({ failureStage: 'parse-envelope', privateClass: null })

  const lines = text.slice(0, -1).split('\n')
  if (
    lines.length === 0 ||
    lines.length > 8 ||
    lines.some((line) => Buffer.byteLength(line) > 512)
  )
    return Object.freeze({ failureStage: 'parse-envelope', privateClass: null })

  if (/^[ \t]|[ \t]$/u.test(lines[0]))
    return Object.freeze({ failureStage: 'parse-base', privateClass: null })
  const fields = lines[0].split(/[ \t]+/u)
  if (fields.length !== 10)
    return Object.freeze({ failureStage: 'parse-base', privateClass: null })
  const [inode, mode, links, uid, gid, size, month, day, time, path] = fields
  const parsedDay = Number(day)
  if (
    inode !== String(expectedScratch.ino) ||
    (mode !== 'drwx------@' && mode !== 'drwx------') ||
    links !== String(expectedScratch.nlink) ||
    uid !== String(expectedScratch.uid) ||
    gid !== String(expectedGid) ||
    !canonicalDecimal(size) ||
    !/^[A-Z][a-z]{2}$/u.test(month) ||
    !canonicalDecimal(day) ||
    parsedDay < 1 ||
    parsedDay > 31 ||
    (!/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/u.test(time) &&
      !/^[0-9]{4}$/u.test(time)) ||
    path !== scratchPath
  )
    return Object.freeze({ failureStage: 'parse-base', privateClass: null })

  const attributes = new Map()
  for (const line of lines.slice(1)) {
    const match =
      /^\t([A-Za-z0-9][A-Za-z0-9._-]{0,126})\t( *)(0|[1-9][0-9]{0,9})$/u.exec(
        line,
      )
    if (match === null || attributes.has(match[1]))
      return Object.freeze({
        failureStage: 'parse-xattr-row',
        privateClass: null,
      })
    attributes.set(match[1], match[3])
  }

  if (
    (mode === 'drwx------' && attributes.size !== 0) ||
    (mode === 'drwx------@' && (attributes.size === 0 || attributes.size > 7))
  )
    return Object.freeze({ failureStage: 'parse-marker', privateClass: null })

  let privateClass = 'other-xattr-set'
  if (mode === 'drwx------') privateClass = 'no-xattr'
  else if (
    attributes.size === 1 &&
    attributes.get('com.apple.provenance') === '11'
  )
    privateClass = 'only-provenance-11'
  return Object.freeze({ failureStage: null, privateClass })
}

function normalizeMetadata(value) {
  return Object.freeze({
    uid: Number(value.uid),
    gid: Number(value.gid),
    dev: Number(value.dev),
    ino: Number(value.ino),
    mode: Number(value.mode) & 0o7777,
    nlink: Number(value.nlink),
    directory:
      typeof value.isDirectory === 'function'
        ? value.isDirectory()
        : value.directory,
    symbolicLink:
      typeof value.isSymbolicLink === 'function'
        ? value.isSymbolicLink()
        : value.symbolicLink,
  })
}

function assertParent(metadata) {
  if (
    !metadata.directory ||
    metadata.symbolicLink ||
    metadata.uid !== expectedParent.uid ||
    metadata.dev !== expectedParent.dev ||
    metadata.ino !== expectedParent.ino ||
    metadata.mode !== expectedParent.mode
  )
    throw new Error('classifier-stopped')
}

function assertScratch(metadata, expectedGid) {
  if (
    !metadata.directory ||
    metadata.symbolicLink ||
    metadata.uid !== expectedScratch.uid ||
    metadata.gid !== expectedGid ||
    metadata.dev !== expectedScratch.dev ||
    metadata.ino !== expectedScratch.ino ||
    metadata.mode !== expectedScratch.mode ||
    metadata.nlink !== expectedScratch.nlink
  )
    throw new Error('classifier-stopped')
}

function assertHost(host) {
  exactKeys(host, [
    'platform',
    'nodeVersion',
    'execPath',
    'cwd',
    'euid',
    'environment',
  ])
  exactKeys(host.environment, ['LC_ALL', 'LANG', 'TZ'])
  if (
    host.platform !== 'darwin' ||
    host.nodeVersion !== '24.18.1' ||
    host.execPath !== nodePath ||
    host.cwd !== '/' ||
    resolve(host.cwd) !== '/' ||
    host.euid !== expectedScratch.uid ||
    host.environment.LC_ALL !== 'C' ||
    host.environment.LANG !== 'C' ||
    host.environment.TZ !== 'UTC'
  )
    throw new Error('classifier-stopped')
}

function checkBudget(start, now) {
  const elapsed = now() - start
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > operationBudgetMs)
    throw new Error('classifier-stopped')
}

function assertChildResult(result) {
  exactKeys(result, [
    'failureStage',
    'spawnFault',
    'streamFault',
    'groupFault',
    'stdout',
    'stderr',
    'code',
    'signal',
    'streamsClosed',
    'groupAbsent',
    'timedOut',
    'overflow',
  ])
  if (
    (result.failureStage !== null &&
      !childStages.includes(result.failureStage)) ||
    !Buffer.isBuffer(result.stdout) ||
    !Buffer.isBuffer(result.stderr) ||
    result.stdout.byteLength + result.stderr.byteLength > outputCap ||
    typeof result.streamsClosed !== 'boolean' ||
    typeof result.groupAbsent !== 'boolean' ||
    typeof result.timedOut !== 'boolean' ||
    typeof result.overflow !== 'boolean'
  )
    throw new Error('classifier-stopped')
  if (
    typeof result.spawnFault !== 'boolean' ||
    typeof result.streamFault !== 'boolean' ||
    typeof result.groupFault !== 'boolean'
  )
    throw new Error('classifier-stopped')
  if (
    !(
      result.code === null ||
      (Number.isSafeInteger(result.code) &&
        result.code >= 0 &&
        result.code <= 255)
    ) ||
    !(result.signal === null || childSignals.includes(result.signal)) ||
    result.groupFault !== (result.failureStage === 'child-group')
  )
    throw new Error('classifier-stopped')
  if (result.failureStage !== 'child-group' && result.groupAbsent !== true)
    throw new Error('classifier-stopped')
  const stageConsistent =
    (result.failureStage === null &&
      !result.spawnFault &&
      !result.streamFault &&
      !result.groupFault) ||
    (result.failureStage === 'child-spawn' && result.spawnFault) ||
    (result.failureStage === 'child-timeout' && result.timedOut) ||
    (result.failureStage === 'child-overflow' && result.overflow) ||
    (result.failureStage === 'child-stderr' &&
      result.stderr.byteLength !== 0) ||
    (result.failureStage === 'child-stream' && result.streamFault) ||
    (result.failureStage === 'child-exit' &&
      (result.code !== 0 || result.signal !== null)) ||
    (result.failureStage === 'child-group' && result.groupFault)
  if (!stageConsistent) throw new Error('classifier-stopped')
  if (
    result.failureStage === null &&
    (result.stderr.byteLength !== 0 ||
      result.code !== 0 ||
      result.signal !== null ||
      result.streamsClosed !== true ||
      result.groupAbsent !== true ||
      result.timedOut !== false ||
      result.overflow !== false)
  )
    throw new Error('classifier-stopped')
}

async function runClassifierCore(argv, dependencies) {
  if (!exactProductionArgv(argv)) return Object.freeze({ stage: 'stopped' })

  let firstFailureStage
  let childGroupFailure = false
  let closeFailure = false
  let ambiguous = false
  let pipelineValid = false
  let parentHandle
  let scratchHandle
  let started

  const setFirst = (stage) => {
    if (firstFailureStage === undefined) firstFailureStage = stage
  }
  const abortAt = (stage) => {
    setFirst(stage)
    throw pipelineAbort
  }
  const ensureBudget = () => {
    try {
      checkBudget(started, dependencies.now)
    } catch {
      abortAt('budget')
    }
  }

  try {
    try {
      started = dependencies.now()
      checkBudget(started, dependencies.now)
    } catch {
      abortAt('budget')
    }
    try {
      assertHost(dependencies.host)
    } catch {
      abortAt('host-admission')
    }
    ensureBudget()
    let flags
    try {
      flags = dependencies.directoryFlags()
    } catch {
      abortAt('directory-flags')
    }
    ensureBudget()
    try {
      parentHandle = await dependencies.openDirectory(parentPath, flags)
    } catch {
      abortAt('parent-open')
    }
    ensureBudget()
    try {
      scratchHandle = await dependencies.openDirectory(scratchPath, flags)
    } catch {
      abortAt('scratch-open')
    }
    ensureBudget()

    const readIdentity = async (stage) => {
      let normalizedScratchHeld
      try {
        const [parentHeld, parentNamed, scratchHeld, scratchNamed] =
          await Promise.all([
            parentHandle.stat(),
            dependencies.lstat(parentPath),
            scratchHandle.stat(),
            dependencies.lstat(scratchPath),
          ])
        const normalizedParentHeld = normalizeMetadata(parentHeld)
        const normalizedParentNamed = normalizeMetadata(parentNamed)
        normalizedScratchHeld = normalizeMetadata(scratchHeld)
        const normalizedScratchNamed = normalizeMetadata(scratchNamed)
        assertParent(normalizedParentHeld)
        assertParent(normalizedParentNamed)
        if (normalizedScratchHeld.gid !== normalizedScratchNamed.gid)
          throw new Error('classifier-stopped')
        assertScratch(normalizedScratchHeld, normalizedScratchHeld.gid)
        assertScratch(normalizedScratchNamed, normalizedScratchHeld.gid)
      } catch {
        abortAt(stage)
      }
      ensureBudget()
      return normalizedScratchHeld.gid
    }

    const expectedGid = await readIdentity('pre-identity')
    let child
    try {
      child = await dependencies.runChild()
    } catch {
      abortAt('child-spawn')
    }
    try {
      assertChildResult(child)
    } catch {
      ambiguous = true
      throw pipelineAbort
    }
    if (child.failureStage === 'child-group') childGroupFailure = true
    else if (child.failureStage !== null) setFirst(child.failureStage)
    ensureBudget()
    if (child.failureStage !== null) throw pipelineAbort

    const afterGid = await readIdentity('post-identity')
    if (afterGid !== expectedGid) abortAt('post-identity')
    const parsed = parseLsBytes(child.stdout, expectedGid)
    if (parsed.failureStage !== null) abortAt(parsed.failureStage)
    if (!privateClasses.includes(parsed.privateClass)) {
      ambiguous = true
      throw pipelineAbort
    }
    ensureBudget()
    pipelineValid = true
  } catch (error) {
    if (error !== pipelineAbort) ambiguous = true
  }

  for (const role of ['scratch', 'parent']) {
    const handle = role === 'scratch' ? scratchHandle : parentHandle
    if (role === 'scratch') scratchHandle = undefined
    else parentHandle = undefined
    if (handle === undefined) continue
    try {
      checkBudget(started, dependencies.now)
    } catch {
      closeFailure = true
    }
    try {
      await handle.close()
    } catch {
      closeFailure = true
    }
    try {
      checkBudget(started, dependencies.now)
    } catch {
      closeFailure = true
    }
  }

  let stage = 'stopped'
  if (closeFailure) stage = 'close'
  else if (childGroupFailure) stage = 'child-group'
  else if (!ambiguous && firstFailureStage !== undefined)
    stage = firstFailureStage
  else if (!ambiguous && pipelineValid) stage = 'pipeline-complete'
  if (!stages.includes(stage)) stage = 'stopped'
  return Object.freeze({ stage })
}

function defaultDirectoryFlags() {
  const exposedCloseOnExec = fsConstants.O_CLOEXEC
  if (
    process.platform !== 'darwin' ||
    fsConstants.O_DIRECTORY !== darwinDirectory ||
    fsConstants.O_NOFOLLOW !== darwinNoFollow ||
    (exposedCloseOnExec !== undefined &&
      exposedCloseOnExec !== darwinCloseOnExec)
  )
    throw new Error('classifier-stopped')
  return (
    fsConstants.O_RDONLY | darwinDirectory | darwinNoFollow | darwinCloseOnExec
  )
}

function groupAbsent(pid) {
  try {
    process.kill(-pid, 0)
    return false
  } catch (error) {
    return error?.code === 'ESRCH'
  }
}

function killGroup(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return
  try {
    process.kill(-pid, 'SIGKILL')
  } catch (error) {
    if (error?.code !== 'ESRCH') throw new Error('classifier-stopped')
  }
}

const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))

async function runFixedLsChildWithOperations(operations) {
  return new Promise((resolveChild) => {
    let child
    let stdoutPipe
    let stderrPipe
    let pipeAccessFault = false
    let validatedPid = false
    let stdoutClosed = false
    let stderrClosed = false
    let childClosed = false
    let code = null
    let signal = null
    let timedOut = false
    let overflow = false
    let spawnFault = false
    let streamFault = false
    let firstFailureStage
    let faultStarted = false
    let finalized = false
    let totalBytes = 0
    const stdout = []
    const stderr = []
    let deadlineTimer
    let completionTimer
    let deadlineCleared = false
    let completionCleared = false
    const latch = (stage) => {
      if (firstFailureStage === undefined) firstFailureStage = stage
    }
    const clearDeadline = () => {
      if (deadlineCleared || deadlineTimer === undefined) return
      deadlineCleared = true
      try {
        operations.clearTimer(deadlineTimer)
      } catch {
        streamFault = true
        latch('child-stream')
      }
    }
    const clearCompletion = () => {
      if (completionCleared || completionTimer === undefined) return
      completionCleared = true
      try {
        operations.clearCompletionTimer(completionTimer)
      } catch {
        streamFault = true
        latch('child-stream')
      }
    }
    const firstFault = (stage) => {
      if (stage === 'child-spawn') spawnFault = true
      if (stage === 'child-stream') streamFault = true
      latch(stage)
      if (faultStarted) return
      faultStarted = true
      clearDeadline()
      if (!childClosed && validatedPid)
        try {
          operations.killGroup(child.pid)
        } catch {
          latch('child-stream')
        }
      try {
        completionTimer = operations.setCompletionTimer(() => {
          void finalize(true)
        }, faultCompletionTimeoutMs)
      } catch {
        streamFault = true
        latch('child-stream')
        void finalize(true)
      }
    }
    const installLateErrorSink = (emitter) => {
      emitter.removeAllListeners('error')
      emitter.on('error', () => {})
    }
    const disposeOpenPipe = (pipe) => {
      try {
        for (const event of ['data', 'close']) pipe.removeAllListeners(event)
        installLateErrorSink(pipe)
        pipe.destroy()
      } catch {
        latch('child-stream')
      }
    }
    const finalize = async (watchdogExpired = false) => {
      if (finalized) return
      finalized = true
      clearDeadline()
      clearCompletion()
      if (watchdogExpired) {
        if (firstFailureStage === undefined) latch('child-timeout')
        if (stdoutPipe !== undefined) {
          if (stdoutClosed) installLateErrorSink(stdoutPipe)
          else disposeOpenPipe(stdoutPipe)
        }
        if (stderrPipe !== undefined) {
          if (stderrClosed) installLateErrorSink(stderrPipe)
          else disposeOpenPipe(stderrPipe)
        }
        if (child !== undefined)
          try {
            installLateErrorSink(child)
            if (!childClosed) {
              child.removeAllListeners('close')
              child.unref()
            }
          } catch {
            latch('child-stream')
          }
      }
      let absent = !validatedPid
      let groupFailure = false
      if (validatedPid)
        for (let index = 0; index < groupProbeCount; index += 1) {
          let observedAbsent = false
          try {
            observedAbsent = operations.groupAbsent(child.pid)
          } catch {
            groupFailure = true
            observedAbsent = false
          }
          if (observedAbsent) {
            absent = true
            break
          }
          groupFailure = true
          if (index + 1 < groupProbeCount)
            try {
              await operations.delay(groupProbeDelayMs)
            } catch {
              groupFailure = true
            }
        }
      const failureStage =
        validatedPid && (groupFailure || !absent)
          ? 'child-group'
          : (firstFailureStage ?? null)
      resolveChild({
        failureStage,
        spawnFault,
        streamFault,
        groupFault: validatedPid && (groupFailure || !absent),
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
        code,
        signal,
        streamsClosed: stdoutClosed && stderrClosed && childClosed,
        groupAbsent: absent,
        timedOut,
        overflow,
      })
    }
    const settle = () => {
      if (!childClosed || !stdoutClosed || !stderrClosed) return
      void finalize()
    }
    const consume = (target, chunk, isError) => {
      const bytes = Buffer.from(chunk)
      if (totalBytes + bytes.byteLength > outputCap) {
        overflow = true
        firstFault('child-overflow')
        return
      }
      totalBytes += bytes.byteLength
      target.push(bytes)
      if (isError && bytes.byteLength !== 0) firstFault('child-stderr')
    }
    const capturePipes = () => {
      if (stdoutPipe === undefined)
        try {
          stdoutPipe = child.stdout
        } catch {
          pipeAccessFault = true
          try {
            stdoutPipe = child.stdio?.[1]
          } catch {
            stdoutPipe = undefined
          }
        }
      if (stderrPipe === undefined)
        try {
          stderrPipe = child.stderr
        } catch {
          pipeAccessFault = true
          try {
            stderrPipe = child.stdio?.[2]
          } catch {
            stderrPipe = undefined
          }
        }
      return (
        !pipeAccessFault && stdoutPipe !== undefined && stderrPipe !== undefined
      )
    }
    try {
      child = operations.spawnChild()
    } catch {
      spawnFault = true
      latch('child-spawn')
      childClosed = true
      stdoutClosed = true
      stderrClosed = true
      void finalize()
      return
    }
    validatedPid = Number.isSafeInteger(child?.pid) && child.pid > 0
    try {
      deadlineTimer = operations.setTimer(() => {
        timedOut = true
        firstFault('child-timeout')
      }, childTimeoutMs)
      if (!validatedPid) firstFault('child-spawn')
      if (!capturePipes()) throw new Error('classifier-stopped')
      stdoutPipe.on('data', (chunk) => consume(stdout, chunk, false))
      stderrPipe.on('data', (chunk) => consume(stderr, chunk, true))
      stdoutPipe.once('error', () => firstFault('child-stream'))
      stderrPipe.once('error', () => firstFault('child-stream'))
      stdoutPipe.once('close', () => {
        stdoutClosed = true
        settle()
      })
      stderrPipe.once('close', () => {
        stderrClosed = true
        settle()
      })
      child.once('error', () => firstFault('child-spawn'))
      child.once('close', (observedCode, observedSignal) => {
        childClosed = true
        code = observedCode
        signal = observedSignal
        if (observedCode !== 0 || observedSignal !== null)
          firstFault('child-exit')
        settle()
      })
    } catch {
      spawnFault = true
      latch('child-spawn')
      capturePipes()
      try {
        if (stdoutPipe !== undefined) installLateErrorSink(stdoutPipe)
        if (stderrPipe !== undefined) installLateErrorSink(stderrPipe)
        if (child !== undefined) installLateErrorSink(child)
      } catch {
        streamFault = true
      }
      firstFault('child-spawn')
    }
  })
}

async function runFixedLsChild() {
  return runFixedLsChildWithOperations({
    spawnChild: () =>
      spawn(lsPath, lsArguments, {
        cwd: '/',
        env: fixedEnvironment,
        shell: false,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    killGroup,
    groupAbsent,
    delay,
    setTimer: (callback, milliseconds) => setTimeout(callback, milliseconds),
    clearTimer: (timer) => clearTimeout(timer),
    setCompletionTimer: (callback, milliseconds) =>
      setTimeout(callback, milliseconds),
    clearCompletionTimer: (timer) => clearTimeout(timer),
  })
}

function formatStageResult(result) {
  try {
    exactKeys(result, ['stage'])
    if (!stages.includes(result.stage)) throw new Error('classifier-stopped')
    return `${JSON.stringify({ stage: result.stage })}\n`
  } catch {
    return '{"stage":"stopped"}\n'
  }
}

function exitCodeForStageResult(result) {
  try {
    exactKeys(result, ['stage'])
    if (!stages.includes(result.stage)) throw new Error('classifier-stopped')
    return result.stage === 'stopped' ? 1 : 0
  } catch {
    return 1
  }
}

function defaultDependencies() {
  return Object.freeze({
    host: Object.freeze({
      platform: process.platform,
      nodeVersion: process.versions.node,
      execPath: process.execPath,
      cwd: process.cwd(),
      euid: process.geteuid?.() ?? -1,
      environment: Object.freeze({ ...process.env }),
    }),
    now: () => performance.now(),
    directoryFlags: defaultDirectoryFlags,
    openDirectory: (path, flags) => open(path, flags),
    lstat,
    runChild: runFixedLsChild,
  })
}

async function executeClassifier(argv = process.argv.slice(2)) {
  let result = Object.freeze({ stage: 'stopped' })
  if (exactProductionArgv(argv))
    try {
      result = await runClassifierCore(argv, defaultDependencies())
    } catch {
      result = Object.freeze({ stage: 'stopped' })
    }
  try {
    await new Promise((resolveWrite, rejectWrite) => {
      process.stdout.write(formatStageResult(result), (error) => {
        if (error) rejectWrite(new Error('classifier-stopped'))
        else resolveWrite()
      })
    })
  } catch {
    return 1
  }
  return exitCodeForStageResult(result)
}

export function routePublicScratchLsBytesForFixture(bytes, expectedGid) {
  if (process.env.NODE_ENV !== 'test') throw new Error('fixture-only')
  return parseLsBytes(bytes, expectedGid)
}

export async function runPublicScratchStageCoreForFixture(argv, dependencies) {
  if (process.env.NODE_ENV !== 'test') throw new Error('fixture-only')
  return runClassifierCore(argv, dependencies)
}

export async function runPublicScratchStageChildForFixture(operations) {
  if (process.env.NODE_ENV !== 'test') throw new Error('fixture-only')
  return runFixedLsChildWithOperations(operations)
}

export function formatPublicScratchStageForFixture(result) {
  if (process.env.NODE_ENV !== 'test') throw new Error('fixture-only')
  return Object.freeze({
    line: formatStageResult(result),
    exitCode: exitCodeForStageResult(result),
  })
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  void executeClassifier().then(
    (code) => {
      process.exitCode = code
    },
    () => {
      process.exitCode = 1
    },
  )
}

import { spawn } from 'node:child_process'
import { constants as fsConstants } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const operation = 'classify-public-scratch-xattr'
const confirmation = '--confirm-m45-public-scratch-xattr-classifier-v1'
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
const classes = Object.freeze([
  'only-provenance-11',
  'no-xattr',
  'other-xattr-set',
  'stopped',
])

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

function classifyLsBytes(bytes, expectedGid) {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.byteLength === 0 ||
    bytes.byteLength > outputCap ||
    !Number.isSafeInteger(expectedGid) ||
    expectedGid < 0
  )
    throw new Error('classifier-stopped')
  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error('classifier-stopped')
  }
  if (!text.endsWith('\n') || text.includes('\0') || text.includes('\r'))
    throw new Error('classifier-stopped')
  for (const byte of bytes)
    if (byte !== 0x09 && byte !== 0x0a && (byte < 0x20 || byte > 0x7e))
      throw new Error('classifier-stopped')
  const lines = text.slice(0, -1).split('\n')
  if (
    lines.length === 0 ||
    lines.length > 8 ||
    lines.some((line) => Buffer.byteLength(line) > 512)
  )
    throw new Error('classifier-stopped')
  if (/^[ \t]|[ \t]$/u.test(lines[0])) throw new Error('classifier-stopped')
  const fields = lines[0].split(/[ \t]+/u)
  if (fields.length !== 10) throw new Error('classifier-stopped')
  const [inode, mode, links, uid, gid, size, month, day, time, path] = fields
  const numericGid = String(expectedGid)
  const parsedDay = Number(day)
  const validTime = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/u.test(time)
  const validYear = /^[0-9]{4}$/u.test(time)
  if (
    inode !== String(expectedScratch.ino) ||
    (mode !== 'drwx------@' && mode !== 'drwx------') ||
    links !== String(expectedScratch.nlink) ||
    uid !== String(expectedScratch.uid) ||
    gid !== numericGid ||
    !canonicalDecimal(size) ||
    !/^[A-Z][a-z]{2}$/u.test(month) ||
    !canonicalDecimal(day) ||
    parsedDay < 1 ||
    parsedDay > 31 ||
    (!validTime && !validYear) ||
    path !== scratchPath
  )
    throw new Error('classifier-stopped')

  const attributes = new Map()
  for (const line of lines.slice(1)) {
    const match =
      /^\t([A-Za-z0-9][A-Za-z0-9._-]{0,126})\t( *)(0|[1-9][0-9]{0,9})$/u.exec(
        line,
      )
    if (match === null || attributes.has(match[1]))
      throw new Error('classifier-stopped')
    attributes.set(match[1], match[3])
  }
  if (mode === 'drwx------') {
    if (attributes.size !== 0) throw new Error('classifier-stopped')
    return 'no-xattr'
  }
  if (attributes.size === 0 || attributes.size > 7)
    throw new Error('classifier-stopped')
  if (attributes.size === 1 && attributes.get('com.apple.provenance') === '11')
    return 'only-provenance-11'
  return 'other-xattr-set'
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

function assertChildResult(result) {
  exactKeys(result, [
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
    !Buffer.isBuffer(result.stdout) ||
    !Buffer.isBuffer(result.stderr) ||
    result.stdout.byteLength + result.stderr.byteLength > outputCap ||
    result.stderr.byteLength !== 0 ||
    result.code !== 0 ||
    result.signal !== null ||
    result.streamsClosed !== true ||
    result.groupAbsent !== true ||
    result.timedOut !== false ||
    result.overflow !== false
  )
    throw new Error('classifier-stopped')
}

function checkBudget(start, now) {
  const elapsed = now() - start
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > operationBudgetMs)
    throw new Error('classifier-stopped')
}

async function runClassifierCore(argv, dependencies) {
  let resultClass = 'stopped'
  let parentHandle
  let scratchHandle
  let firstFailure
  const started = dependencies.now()
  try {
    if (
      !Array.isArray(argv) ||
      argv.length !== 2 ||
      argv[0] !== operation ||
      argv[1] !== confirmation
    )
      throw new Error('classifier-stopped')
    checkBudget(started, dependencies.now)
    assertHost(dependencies.host)
    checkBudget(started, dependencies.now)
    const flags = dependencies.directoryFlags()
    parentHandle = await dependencies.openDirectory(parentPath, flags)
    checkBudget(started, dependencies.now)
    scratchHandle = await dependencies.openDirectory(scratchPath, flags)
    checkBudget(started, dependencies.now)
    const readIdentity = async () => {
      const [parentHeld, parentNamed, scratchHeld, scratchNamed] =
        await Promise.all([
          parentHandle.stat(),
          dependencies.lstat(parentPath),
          scratchHandle.stat(),
          dependencies.lstat(scratchPath),
        ])
      checkBudget(started, dependencies.now)
      const normalizedParentHeld = normalizeMetadata(parentHeld)
      const normalizedParentNamed = normalizeMetadata(parentNamed)
      const normalizedScratchHeld = normalizeMetadata(scratchHeld)
      const normalizedScratchNamed = normalizeMetadata(scratchNamed)
      assertParent(normalizedParentHeld)
      assertParent(normalizedParentNamed)
      if (normalizedScratchHeld.gid !== normalizedScratchNamed.gid)
        throw new Error('classifier-stopped')
      assertScratch(normalizedScratchHeld, normalizedScratchHeld.gid)
      assertScratch(normalizedScratchNamed, normalizedScratchHeld.gid)
      return normalizedScratchHeld.gid
    }
    const expectedGid = await readIdentity()
    checkBudget(started, dependencies.now)
    const child = await dependencies.runChild()
    checkBudget(started, dependencies.now)
    assertChildResult(child)
    const afterGid = await readIdentity()
    if (afterGid !== expectedGid) throw new Error('classifier-stopped')
    checkBudget(started, dependencies.now)
    resultClass = classifyLsBytes(child.stdout, expectedGid)
    checkBudget(started, dependencies.now)
  } catch (error) {
    firstFailure = error
  }
  for (const role of ['scratch', 'parent']) {
    const handle = role === 'scratch' ? scratchHandle : parentHandle
    if (role === 'scratch') scratchHandle = undefined
    else parentHandle = undefined
    if (handle === undefined) continue
    try {
      checkBudget(started, dependencies.now)
    } catch (error) {
      firstFailure ??= error
    }
    try {
      await handle.close()
      checkBudget(started, dependencies.now)
    } catch (error) {
      firstFailure ??= error
    }
  }
  if (firstFailure !== undefined) resultClass = 'stopped'
  if (!classes.includes(resultClass)) resultClass = 'stopped'
  return Object.freeze({ class: resultClass })
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
    let stdoutClosed = false
    let stderrClosed = false
    let childClosed = false
    let code = null
    let signal = null
    let timedOut = false
    let overflow = false
    let lifecycleFault = false
    let finalized = false
    let totalBytes = 0
    const stdout = []
    const stderr = []
    let deadlineTimer
    let completionTimer
    let deadlineCleared = false
    let completionCleared = false
    const clearDeadline = () => {
      if (deadlineCleared || deadlineTimer === undefined) return
      deadlineCleared = true
      operations.clearTimer(deadlineTimer)
    }
    const clearCompletion = () => {
      if (completionCleared || completionTimer === undefined) return
      completionCleared = true
      operations.clearCompletionTimer(completionTimer)
    }
    const firstFault = () => {
      if (lifecycleFault) return
      lifecycleFault = true
      clearDeadline()
      if (!childClosed && Number.isSafeInteger(child?.pid) && child.pid > 0) {
        try {
          operations.killGroup(child.pid)
        } catch {
          lifecycleFault = true
        }
      }
      completionTimer = operations.setCompletionTimer(() => {
        void finalize(true)
      }, faultCompletionTimeoutMs)
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
        lifecycleFault = true
      }
    }
    const finalize = async (watchdogExpired = false) => {
      if (finalized) return
      finalized = true
      clearDeadline()
      clearCompletion()
      if (watchdogExpired) {
        lifecycleFault = true
        if (child?.stdout !== undefined) {
          if (stdoutClosed) installLateErrorSink(child.stdout)
          else disposeOpenPipe(child.stdout)
        }
        if (child?.stderr !== undefined) {
          if (stderrClosed) installLateErrorSink(child.stderr)
          else disposeOpenPipe(child.stderr)
        }
        if (child !== undefined)
          try {
            installLateErrorSink(child)
            if (!childClosed) {
              child.removeAllListeners('close')
              child.unref()
            }
          } catch {
            lifecycleFault = true
          }
      }
      let absent = false
      if (Number.isSafeInteger(child?.pid) && child.pid > 0)
        for (let index = 0; index < groupProbeCount; index += 1) {
          let observedAbsent = false
          try {
            observedAbsent = operations.groupAbsent(child.pid)
          } catch {
            lifecycleFault = true
          }
          if (observedAbsent) {
            absent = true
            break
          }
          lifecycleFault = true
          if (index + 1 < groupProbeCount)
            try {
              await operations.delay(groupProbeDelayMs)
            } catch {
              lifecycleFault = true
            }
        }
      resolveChild({
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
        code: lifecycleFault ? null : code,
        signal: lifecycleFault ? (signal ?? 'SIGKILL') : signal,
        streamsClosed: stdoutClosed && stderrClosed,
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
        firstFault()
        return
      }
      totalBytes += bytes.byteLength
      target.push(bytes)
      if (isError && bytes.byteLength !== 0) firstFault()
    }
    try {
      child = operations.spawnChild()
      child.stdout.on('data', (chunk) => consume(stdout, chunk, false))
      child.stderr.on('data', (chunk) => consume(stderr, chunk, true))
      child.stdout.once('error', firstFault)
      child.stderr.once('error', firstFault)
      child.stdout.once('close', () => {
        stdoutClosed = true
        settle()
      })
      child.stderr.once('close', () => {
        stderrClosed = true
        settle()
      })
      child.once('error', firstFault)
      child.once('close', (observedCode, observedSignal) => {
        childClosed = true
        code = observedCode
        signal = observedSignal
        settle()
      })
      deadlineTimer = operations.setTimer(() => {
        timedOut = true
        firstFault()
      }, childTimeoutMs)
    } catch {
      lifecycleFault = true
      childClosed = true
      stdoutClosed = true
      stderrClosed = true
      void finalize()
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

function formatClassifierResult(result) {
  try {
    exactKeys(result, ['class'])
    if (!classes.includes(result.class)) throw new Error('classifier-stopped')
    return `${JSON.stringify({ class: result.class })}\n`
  } catch {
    return '{"class":"stopped"}\n'
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
  let result = Object.freeze({ class: 'stopped' })
  try {
    result = await runClassifierCore(argv, defaultDependencies())
  } catch {
    result = Object.freeze({ class: 'stopped' })
  }
  try {
    await new Promise((resolveWrite, rejectWrite) => {
      process.stdout.write(formatClassifierResult(result), (error) => {
        if (error) rejectWrite(new Error('classifier-stopped'))
        else resolveWrite()
      })
    })
  } catch {
    return 1
  }
  return result.class === 'stopped' ? 1 : 0
}

export function classifyPublicScratchLsBytesForFixture(bytes, expectedGid) {
  if (process.env.NODE_ENV !== 'test') throw new Error('fixture-only')
  return classifyLsBytes(bytes, expectedGid)
}

export async function runPublicScratchXattrClassifierCoreForFixture(
  argv,
  dependencies,
) {
  if (process.env.NODE_ENV !== 'test') throw new Error('fixture-only')
  return runClassifierCore(argv, dependencies)
}

export async function runPublicScratchXattrChildForFixture(operations) {
  if (process.env.NODE_ENV !== 'test') throw new Error('fixture-only')
  return runFixedLsChildWithOperations(operations)
}

export function formatPublicScratchXattrResultForFixture(result) {
  if (process.env.NODE_ENV !== 'test') throw new Error('fixture-only')
  return formatClassifierResult(result)
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

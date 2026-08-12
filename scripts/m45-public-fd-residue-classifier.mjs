import { constants as fsConstants } from 'node:fs'
import { lstat, open, opendir, realpath } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { types as utilTypes } from 'node:util'

const operation = 'classify-a-fd-map-residue'
const confirmation = '--confirm-m45-public-a-fd-map-residue-classifier-v1'
const nodePath = '/opt/homebrew/Cellar/node@24/24.18.1/bin/node'
const repositoryRoot = '/Users/zelmari/projects/zedarchive'
const parentPath = '/private/tmp'
const scratchPath = '/private/tmp/zedarchive-m45-fd-admission-probe'
const darwinNoFollow = 0x00000100
const darwinDirectory = 0x00100000
const darwinCloseOnExec = 0x01000000
const expectedEnvironmentKeys = Object.freeze([
  'LANG',
  'LC_ALL',
  'TMPDIR',
  'TZ',
  '__CF_USER_TEXT_ENCODING',
])
const suppliedEnvironment = Object.freeze({
  LANG: 'C',
  LC_ALL: 'C',
  TMPDIR: '/private/tmp',
  TZ: 'UTC',
})
const scratchStates = Object.freeze([
  'absent',
  'observed-empty-candidate',
  'present-unclassified',
])

function exactStringArray(value, requiredLength) {
  if (
    !Array.isArray(value) ||
    utilTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Array.prototype
  )
    return null
  const length = Object.getOwnPropertyDescriptor(value, 'length')
  if (
    length === undefined ||
    !('value' in length) ||
    length.value !== requiredLength ||
    length.writable !== true ||
    length.enumerable !== false ||
    length.configurable !== false
  )
    return null
  const keys = Reflect.ownKeys(value)
  if (keys.length !== requiredLength + 1 || keys.at(-1) !== 'length')
    return null
  const snapshot = []
  for (let index = 0; index < requiredLength; index += 1) {
    if (keys[index] !== String(index)) return null
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    if (
      descriptor === undefined ||
      !('value' in descriptor) ||
      descriptor.enumerable !== true ||
      descriptor.writable !== true ||
      descriptor.configurable !== true ||
      typeof descriptor.value !== 'string'
    )
      return null
    snapshot.push(descriptor.value)
  }
  return Object.freeze(snapshot)
}

function exactProductionArgv(argv) {
  try {
    const snapshot = exactStringArray(argv, 2)
    return (
      snapshot !== null &&
      snapshot[0] === operation &&
      snapshot[1] === confirmation
    )
  } catch {
    return false
  }
}

function exactObject(value, keys) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    utilTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw new Error('classifier-stopped')
  const observed = Reflect.ownKeys(value)
  if (
    observed.length !== keys.length ||
    observed.some((key, index) => key !== keys[index])
  )
    throw new Error('classifier-stopped')
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (
      descriptor === undefined ||
      !('value' in descriptor) ||
      descriptor.enumerable !== true
    )
      throw new Error('classifier-stopped')
  }
}

function assertReaders(readers) {
  const names = [
    'environmentKeys',
    'environmentValue',
    'platform',
    'nodeVersion',
    'execPath',
    'cwd',
    'euid',
    'flagValues',
  ]
  exactObject(readers, names)
  for (const name of names)
    if (typeof readers[name] !== 'function')
      throw new Error('classifier-stopped')
}

function assertScalarHost(readers) {
  assertReaders(readers)
  const keys = exactStringArray(readers.environmentKeys(), 5)
  if (
    keys === null ||
    keys.some((key, index) => key !== expectedEnvironmentKeys[index])
  )
    throw new Error('classifier-stopped')
  for (const [key, expected] of Object.entries(suppliedEnvironment))
    if (readers.environmentValue(key) !== expected)
      throw new Error('classifier-stopped')
  if (
    readers.platform() !== 'darwin' ||
    readers.nodeVersion() !== '24.18.1' ||
    readers.execPath() !== nodePath ||
    readers.cwd() !== repositoryRoot ||
    readers.euid() !== 501
  )
    throw new Error('classifier-stopped')
  const flags = readers.flagValues()
  exactObject(flags, ['directory', 'noFollow', 'closeOnExec'])
  if (
    flags.directory !== darwinDirectory ||
    flags.noFollow !== darwinNoFollow ||
    (flags.closeOnExec !== undefined && flags.closeOnExec !== darwinCloseOnExec)
  )
    throw new Error('classifier-stopped')
  return Object.freeze({
    cwd: repositoryRoot,
    directoryFlags:
      fsConstants.O_RDONLY |
      flags.directory |
      flags.noFollow |
      darwinCloseOnExec,
  })
}

function metadata(value) {
  return Object.freeze({
    uid: Number(value.uid),
    gid: Number(value.gid),
    dev: Number(value.dev),
    ino: Number(value.ino),
    mode: Number(value.mode) & 0o7777,
    nlink: Number(value.nlink),
    size: Number(value.size),
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

function sameMetadata(left, right) {
  return (
    left.uid === right.uid &&
    left.gid === right.gid &&
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.size === right.size &&
    left.directory === right.directory &&
    left.symbolicLink === right.symbolicLink
  )
}

function admittedParent(value) {
  return (
    value.directory === true &&
    value.symbolicLink === false &&
    value.uid === 0 &&
    value.gid === 0 &&
    value.mode === 0o1777
  )
}

function admittedScratch(value, parent) {
  return (
    value.directory === true &&
    value.symbolicLink === false &&
    value.uid === 501 &&
    value.dev === parent.dev &&
    value.mode === 0o700 &&
    value.nlink === 2
  )
}

function stateResult(scratchState) {
  if (!scratchStates.includes(scratchState))
    throw new Error('classifier-stopped')
  return Object.freeze({ scratchState })
}

async function lookupScratch(lstatPath) {
  let observed
  try {
    observed = await lstatPath(scratchPath)
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.code === 'ENOENT')
      return Object.freeze({ absent: true, value: null })
    throw error
  }
  return Object.freeze({
    absent: false,
    value: metadata(observed),
  })
}

async function readOccupancy(openOccupancy) {
  let directory
  let failed = false
  let occupied
  try {
    directory = await openOccupancy(scratchPath, {
      encoding: 'utf8',
      bufferSize: 1,
      recursive: false,
    })
    occupied = (await directory.read()) !== null
  } catch {
    failed = true
  }
  if (directory !== undefined) {
    const active = directory
    directory = undefined
    try {
      await active.close()
    } catch {
      failed = true
    }
  }
  if (failed || typeof occupied !== 'boolean')
    throw new Error('classifier-stopped')
  return occupied
}

async function classifyWithCustody(dependencies, directoryFlags) {
  let parentHandle
  let scratchHandle
  let parentIdentity
  let scratchState
  let failed = false

  const validateParent = async () => {
    if (parentHandle === undefined) throw new Error('classifier-stopped')
    const [held, named] = await Promise.all([
      parentHandle.stat().then(metadata),
      dependencies.lstat(parentPath).then(metadata),
    ])
    if (!admittedParent(held) || !admittedParent(named))
      throw new Error('classifier-stopped')
    if (parentIdentity === undefined) parentIdentity = held
    if (
      held.dev !== parentIdentity.dev ||
      held.ino !== parentIdentity.ino ||
      named.dev !== parentIdentity.dev ||
      named.ino !== parentIdentity.ino
    )
      throw new Error('classifier-stopped')
    return parentIdentity
  }

  try {
    parentHandle = await dependencies.openDirectory(parentPath, directoryFlags)
    const parent = await validateParent()
    const first = await lookupScratch(dependencies.lstat)
    await validateParent()
    const second = await lookupScratch(dependencies.lstat)
    await validateParent()

    if (first.absent || second.absent) {
      if (!first.absent || !second.absent) throw new Error('classifier-stopped')
      scratchState = 'absent'
    } else {
      if (!sameMetadata(first.value, second.value))
        throw new Error('classifier-stopped')
      if (!admittedScratch(first.value, parent)) {
        scratchState = 'present-unclassified'
      } else {
        scratchHandle = await dependencies.openDirectory(
          scratchPath,
          directoryFlags,
        )
        const validateScratch = async () => {
          if (scratchHandle === undefined) throw new Error('classifier-stopped')
          const [held, named] = await Promise.all([
            scratchHandle.stat().then(metadata),
            dependencies.lstat(scratchPath).then(metadata),
          ])
          if (
            !admittedScratch(held, parent) ||
            !sameMetadata(held, named) ||
            !sameMetadata(held, first.value)
          )
            throw new Error('classifier-stopped')
        }
        await validateScratch()
        await validateParent()
        const firstOccupied = await readOccupancy(dependencies.openOccupancy)
        await validateScratch()
        await validateParent()
        if (firstOccupied) {
          scratchState = 'present-unclassified'
        } else {
          const secondOccupied = await readOccupancy(dependencies.openOccupancy)
          await validateScratch()
          await validateParent()
          scratchState = secondOccupied
            ? 'present-unclassified'
            : 'observed-empty-candidate'
        }
      }
    }
  } catch {
    failed = true
  }

  if (scratchHandle !== undefined) {
    const active = scratchHandle
    scratchHandle = undefined
    try {
      await active.close()
    } catch {
      failed = true
    }
  }
  if (parentHandle !== undefined) {
    const active = parentHandle
    parentHandle = undefined
    try {
      await active.close()
    } catch {
      failed = true
    }
  }
  if (failed || !scratchStates.includes(scratchState))
    throw new Error('classifier-stopped')
  return dependencies.formResult(scratchState)
}

async function runClassifierCore(argv, dependencies) {
  if (!exactProductionArgv(argv)) throw new Error('classifier-stopped')
  try {
    exactObject(dependencies, [
      'hostReaders',
      'realpath',
      'openDirectory',
      'lstat',
      'openOccupancy',
      'formResult',
    ])
    const host = assertScalarHost(dependencies.hostReaders)
    if ((await dependencies.realpath(host.cwd)) !== host.cwd)
      throw new Error('classifier-stopped')
    const result = await classifyWithCustody(dependencies, host.directoryFlags)
    if (canonicalResult(result) === null) throw new Error('classifier-stopped')
    return result
  } catch {
    throw new Error('classifier-stopped')
  }
}

function canonicalResult(result) {
  try {
    if (
      result === null ||
      typeof result !== 'object' ||
      Array.isArray(result) ||
      utilTypes.isProxy(result) ||
      Object.getPrototypeOf(result) !== Object.prototype ||
      !Object.isFrozen(result)
    )
      return null
    const keys = Reflect.ownKeys(result)
    if (keys.length !== 1) return null
    const key = keys[0]
    const descriptor = Object.getOwnPropertyDescriptor(result, key)
    if (
      descriptor === undefined ||
      !('value' in descriptor) ||
      descriptor.enumerable !== true ||
      descriptor.writable !== false ||
      descriptor.configurable !== false
    )
      return null
    if (
      key === 'scratchState' &&
      typeof descriptor.value === 'string' &&
      scratchStates.includes(descriptor.value)
    )
      return Object.freeze({ scratchState: descriptor.value })
    return null
  } catch {
    return null
  }
}

function formatResult(result) {
  const canonical = canonicalResult(result)
  if (canonical === null)
    return Object.freeze({
      line: '{"mode":"classify-a-fd-map-residue","status":"stopped"}\n',
      exitCode: 1,
    })
  return Object.freeze({
    line: `${JSON.stringify({
      mode: 'classify-a-fd-map-residue',
      status: 'a-fd-map-residue-classified',
      scratchState: canonical.scratchState,
    })}\n`,
    exitCode: 0,
  })
}

function closedLine(line) {
  const stopped = '{"mode":"classify-a-fd-map-residue","status":"stopped"}\n'
  if (line === stopped) return Object.freeze({ line: stopped, exitCode: 1 })
  for (const result of scratchStates.map(stateResult)) {
    const formatted = formatResult(result)
    if (line === formatted.line) return formatted
  }
  return null
}

async function writeResultOnce(line, write) {
  const formatted = closedLine(line)
  if (formatted === null || typeof write !== 'function') return 1
  try {
    await write(formatted.line)
    return formatted.exitCode
  } catch {
    return 1
  }
}

function productionHostReaders() {
  return Object.freeze({
    environmentKeys: () => Object.keys(process.env).sort(),
    environmentValue: (key) => process.env[key],
    platform: () => process.platform,
    nodeVersion: () => process.versions.node,
    execPath: () => process.execPath,
    cwd: () => process.cwd(),
    euid: () => process.geteuid?.() ?? -1,
    flagValues: () =>
      Object.freeze({
        directory: fsConstants.O_DIRECTORY,
        noFollow: fsConstants.O_NOFOLLOW,
        closeOnExec: fsConstants.O_CLOEXEC,
      }),
  })
}

function defaultDependencies() {
  return Object.freeze({
    hostReaders: productionHostReaders(),
    realpath,
    openDirectory: (path, flags) => open(path, flags),
    lstat,
    openOccupancy: (path, options) => opendir(path, options),
    formResult: stateResult,
  })
}

function stdoutWrite(line) {
  return new Promise((resolveWrite, rejectWrite) => {
    process.stdout.write(line, (error) => {
      if (error) rejectWrite(new Error('classifier-stopped'))
      else resolveWrite()
    })
  })
}

async function executeClassifier(
  argv = process.argv.slice(2),
  dependencyFactory = defaultDependencies,
  write = stdoutWrite,
) {
  let result
  try {
    if (!exactProductionArgv(argv)) throw new Error('classifier-stopped')
    result = await runClassifierCore(argv, dependencyFactory())
  } catch {
    result = undefined
  }
  const formatted = formatResult(result)
  return writeResultOnce(formatted.line, write)
}

export async function runPublicFdResidueClassifierForFixture(
  argv,
  dependencies,
) {
  if (process.env.NODE_ENV !== 'test') throw new Error('fixture-only')
  return runClassifierCore(argv, dependencies)
}

export function formatPublicFdResidueResultForFixture(result) {
  if (process.env.NODE_ENV !== 'test') throw new Error('fixture-only')
  return formatResult(result)
}

export async function writePublicFdResidueResultForFixture(line, write) {
  if (process.env.NODE_ENV !== 'test') throw new Error('fixture-only')
  return writeResultOnce(line, write)
}

export async function executePublicFdResidueClassifierForFixture(
  argv,
  dependencies,
  write,
) {
  if (process.env.NODE_ENV !== 'test') throw new Error('fixture-only')
  return executeClassifier(argv, () => dependencies, write)
}

if (
  process.argv[1] !== undefined &&
  process.argv[1] === fileURLToPath(import.meta.url)
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

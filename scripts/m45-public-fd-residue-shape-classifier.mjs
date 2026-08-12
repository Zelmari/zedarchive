import { constants as fsConstants } from 'node:fs'
import { lstat, open, opendir, realpath } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { types as utilTypes } from 'node:util'

const operation = 'classify-a-fd-map-residue-shape'
const confirmation = '--confirm-m45-public-a-fd-map-residue-shape-classifier-v1'
const nodePath = '/opt/homebrew/Cellar/node@24/24.18.1/bin/node'
const repositoryRoot = '/Users/zelmari/projects/zedarchive'
const parentPath = '/private/tmp'
const scratchPath = '/private/tmp/zedarchive-m45-fd-admission-probe'
const probePath = `${scratchPath}/probe`
const darwinNoFollow = 0x00000100
const darwinDirectory = 0x00100000
const darwinCloseOnExec = 0x01000000
const maxFdAdmissionProbeBytes = 16 * 1024 * 1024
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
const residueStates = Object.freeze([
  'absent',
  'observed-empty-candidate',
  'sole-normalized-probe-candidate',
  'other-present',
])
const occupancyOptions = Object.freeze({
  encoding: 'utf8',
  bufferSize: 1,
  recursive: false,
})

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
    throw new Error('shape-classifier-stopped')
  const observed = Reflect.ownKeys(value)
  if (
    observed.length !== keys.length ||
    observed.some((key, index) => key !== keys[index])
  )
    throw new Error('shape-classifier-stopped')
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (
      descriptor === undefined ||
      !('value' in descriptor) ||
      descriptor.enumerable !== true
    )
      throw new Error('shape-classifier-stopped')
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
      throw new Error('shape-classifier-stopped')
}

function assertScalarHost(readers) {
  assertReaders(readers)
  const keys = exactStringArray(readers.environmentKeys(), 5)
  if (
    keys === null ||
    keys.some((key, index) => key !== expectedEnvironmentKeys[index])
  )
    throw new Error('shape-classifier-stopped')
  for (const [key, expected] of Object.entries(suppliedEnvironment))
    if (readers.environmentValue(key) !== expected)
      throw new Error('shape-classifier-stopped')
  if (
    readers.platform() !== 'darwin' ||
    readers.nodeVersion() !== '24.18.1' ||
    readers.execPath() !== nodePath ||
    readers.cwd() !== repositoryRoot ||
    readers.euid() !== 501
  )
    throw new Error('shape-classifier-stopped')
  const flags = readers.flagValues()
  exactObject(flags, ['directory', 'noFollow', 'closeOnExec'])
  if (
    flags.directory !== darwinDirectory ||
    flags.noFollow !== darwinNoFollow ||
    (flags.closeOnExec !== undefined && flags.closeOnExec !== darwinCloseOnExec)
  )
    throw new Error('shape-classifier-stopped')
  return Object.freeze({
    cwd: repositoryRoot,
    directoryFlags:
      fsConstants.O_RDONLY |
      flags.directory |
      flags.noFollow |
      darwinCloseOnExec,
    probeFlags: fsConstants.O_RDONLY | flags.noFollow | darwinCloseOnExec,
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
    regular:
      typeof value.isFile === 'function' ? value.isFile() : value.regular,
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
    left.symbolicLink === right.symbolicLink &&
    left.regular === right.regular
  )
}

function admittedParent(value) {
  return (
    value.directory === true &&
    value.symbolicLink === false &&
    value.regular === false &&
    value.uid === 0 &&
    value.gid === 0 &&
    value.mode === 0o1777
  )
}

function admittedScratch(value, parent) {
  return (
    value.directory === true &&
    value.symbolicLink === false &&
    value.regular === false &&
    value.uid === 501 &&
    value.dev === parent.dev &&
    value.mode === 0o700 &&
    value.nlink === 2
  )
}

function normalizedProbe(value, parent) {
  return (
    value.regular === true &&
    value.directory === false &&
    value.symbolicLink === false &&
    value.uid === 501 &&
    value.dev === parent.dev &&
    value.mode === 0o500 &&
    value.nlink === 1 &&
    value.size >= 1 &&
    value.size <= maxFdAdmissionProbeBytes
  )
}

function stateResult(residueState) {
  if (!residueStates.includes(residueState))
    throw new Error('shape-classifier-stopped')
  return Object.freeze({ residueState })
}

async function lookupFixed(lstatPath, path, allowAbsent) {
  try {
    return Object.freeze({
      absent: false,
      value: metadata(await lstatPath(path)),
    })
  } catch (error) {
    if (
      allowAbsent &&
      error !== null &&
      typeof error === 'object' &&
      error.code === 'ENOENT'
    )
      return Object.freeze({ absent: true, value: null })
    throw error
  }
}

async function readInventoryPass(openOccupancy) {
  let directory
  let failed = false
  let pass = 'other'
  try {
    directory = await openOccupancy(scratchPath, occupancyOptions)
    const first = await directory.read()
    if (first === null) pass = 'empty'
    else if (first.name === 'probe') {
      const second = await directory.read()
      if (second === null) pass = 'candidate'
    }
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
  if (failed || !['empty', 'candidate', 'other'].includes(pass))
    throw new Error('shape-classifier-stopped')
  return pass
}

async function classifyWithCustody(dependencies, flags) {
  let parentHandle
  let scratchHandle
  let probeHandle
  let parentIdentity
  let scratchSnapshot
  let probeSnapshot
  let residueState
  let failed = false

  const validateParent = async () => {
    if (parentHandle === undefined) throw new Error('shape-classifier-stopped')
    const [held, named] = await Promise.all([
      parentHandle.stat().then(metadata),
      dependencies.lstat(parentPath).then(metadata),
    ])
    if (!admittedParent(held) || !admittedParent(named))
      throw new Error('shape-classifier-stopped')
    if (parentIdentity === undefined) parentIdentity = held
    if (
      held.dev !== parentIdentity.dev ||
      held.ino !== parentIdentity.ino ||
      named.dev !== parentIdentity.dev ||
      named.ino !== parentIdentity.ino
    )
      throw new Error('shape-classifier-stopped')
    return parentIdentity
  }

  const validateScratch = async () => {
    if (scratchHandle === undefined || scratchSnapshot === undefined)
      throw new Error('shape-classifier-stopped')
    const [held, named] = await Promise.all([
      scratchHandle.stat().then(metadata),
      dependencies.lstat(scratchPath).then(metadata),
    ])
    if (
      !admittedScratch(held, parentIdentity) ||
      !sameMetadata(held, named) ||
      !sameMetadata(held, scratchSnapshot)
    )
      throw new Error('shape-classifier-stopped')
    return held
  }

  const validateProbe = async () => {
    if (probeHandle === undefined || probeSnapshot === undefined)
      throw new Error('shape-classifier-stopped')
    const [held, named] = await Promise.all([
      probeHandle.stat().then(metadata),
      dependencies.lstat(probePath).then(metadata),
    ])
    if (
      !normalizedProbe(held, parentIdentity) ||
      !sameMetadata(held, named) ||
      !sameMetadata(held, probeSnapshot)
    )
      throw new Error('shape-classifier-stopped')
    return held
  }

  try {
    parentHandle = await dependencies.openParent(
      parentPath,
      flags.directoryFlags,
    )
    const parent = await validateParent()
    const first = await lookupFixed(dependencies.lstat, scratchPath, true)
    await validateParent()
    const second = await lookupFixed(dependencies.lstat, scratchPath, true)
    await validateParent()

    if (first.absent || second.absent) {
      if (!first.absent || !second.absent)
        throw new Error('shape-classifier-stopped')
      residueState = 'absent'
      await validateParent()
    } else {
      if (!sameMetadata(first.value, second.value))
        throw new Error('shape-classifier-stopped')
      if (!admittedScratch(first.value, parent)) {
        residueState = 'other-present'
        await validateParent()
      } else {
        scratchSnapshot = first.value
        scratchHandle = await dependencies.openScratch(
          scratchPath,
          flags.directoryFlags,
        )
        await validateScratch()
        await validateParent()
        const firstPass = await readInventoryPass(dependencies.openOccupancy)
        await validateParent()
        await validateScratch()

        if (firstPass === 'empty' || firstPass === 'other') {
          const secondPass = await readInventoryPass(dependencies.openOccupancy)
          await validateParent()
          await validateScratch()
          if (firstPass === 'empty' && secondPass === 'empty')
            residueState = 'observed-empty-candidate'
          else if (firstPass === 'other' && secondPass === 'other')
            residueState = 'other-present'
          else throw new Error('shape-classifier-stopped')
        } else {
          const firstProbe = await lookupFixed(
            dependencies.lstat,
            probePath,
            false,
          )
          if (!firstProbe.absent && normalizedProbe(firstProbe.value, parent)) {
            probeSnapshot = firstProbe.value
            probeHandle = await dependencies.openProbe(
              probePath,
              flags.probeFlags,
            )
            await validateProbe()
            await validateParent()
            await validateScratch()
            const secondPass = await readInventoryPass(
              dependencies.openOccupancy,
            )
            await validateParent()
            await validateScratch()
            await validateProbe()
            if (secondPass !== 'candidate')
              throw new Error('shape-classifier-stopped')
            const secondProbe = await lookupFixed(
              dependencies.lstat,
              probePath,
              false,
            )
            if (
              secondProbe.absent ||
              !normalizedProbe(secondProbe.value, parent) ||
              !sameMetadata(secondProbe.value, probeSnapshot)
            )
              throw new Error('shape-classifier-stopped')
            await validateParent()
            await validateScratch()
            await validateProbe()
            residueState = 'sole-normalized-probe-candidate'
          } else {
            await validateParent()
            await validateScratch()
            const secondPass = await readInventoryPass(
              dependencies.openOccupancy,
            )
            await validateParent()
            await validateScratch()
            if (secondPass !== 'candidate')
              throw new Error('shape-classifier-stopped')
            const secondProbe = await lookupFixed(
              dependencies.lstat,
              probePath,
              false,
            )
            if (
              secondProbe.absent ||
              normalizedProbe(secondProbe.value, parent) ||
              !sameMetadata(secondProbe.value, firstProbe.value)
            )
              throw new Error('shape-classifier-stopped')
            residueState = 'other-present'
            await validateParent()
            await validateScratch()
          }
        }
      }
    }
  } catch {
    failed = true
  }

  if (probeHandle !== undefined) {
    const active = probeHandle
    probeHandle = undefined
    try {
      await active.close()
    } catch {
      failed = true
    }
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
  if (failed || !residueStates.includes(residueState))
    throw new Error('shape-classifier-stopped')
  return dependencies.formResult(residueState)
}

async function runClassifierCore(argv, dependencies) {
  if (!exactProductionArgv(argv)) throw new Error('shape-classifier-stopped')
  try {
    exactObject(dependencies, [
      'hostReaders',
      'realpath',
      'openParent',
      'openScratch',
      'openProbe',
      'lstat',
      'openOccupancy',
      'formResult',
    ])
    const host = assertScalarHost(dependencies.hostReaders)
    if ((await dependencies.realpath(host.cwd)) !== host.cwd)
      throw new Error('shape-classifier-stopped')
    const result = await classifyWithCustody(dependencies, host)
    const canonical = canonicalResult(result)
    if (canonical === null) throw new Error('shape-classifier-stopped')
    return canonical
  } catch {
    throw new Error('shape-classifier-stopped')
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
    if (keys.length !== 1 || keys[0] !== 'residueState') return null
    const descriptor = Object.getOwnPropertyDescriptor(result, keys[0])
    if (
      descriptor === undefined ||
      !('value' in descriptor) ||
      descriptor.enumerable !== true ||
      descriptor.writable !== false ||
      descriptor.configurable !== false ||
      typeof descriptor.value !== 'string' ||
      !residueStates.includes(descriptor.value)
    )
      return null
    return Object.freeze({ residueState: descriptor.value })
  } catch {
    return null
  }
}

function formatResult(result) {
  const canonical = canonicalResult(result)
  if (canonical === null)
    return Object.freeze({
      line: '{"mode":"classify-a-fd-map-residue-shape","status":"stopped"}\n',
      exitCode: 1,
    })
  return Object.freeze({
    line: `${JSON.stringify({
      mode: operation,
      status: 'a-fd-map-residue-shape-classified',
      residueState: canonical.residueState,
    })}\n`,
    exitCode: 0,
  })
}

function closedLine(line) {
  const stopped =
    '{"mode":"classify-a-fd-map-residue-shape","status":"stopped"}\n'
  if (line === stopped) return Object.freeze({ line: stopped, exitCode: 1 })
  for (const state of residueStates) {
    const formatted = formatResult(stateResult(state))
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
    openParent: (path, flags) => open(path, flags),
    openScratch: (path, flags) => open(path, flags),
    openProbe: (path, flags) => open(path, flags),
    lstat,
    openOccupancy: (path, options) => opendir(path, options),
    formResult: stateResult,
  })
}

function stdoutWrite(line) {
  return new Promise((resolveWrite, rejectWrite) => {
    process.stdout.write(line, (error) => {
      if (error) rejectWrite(new Error('shape-classifier-stopped'))
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
    if (!exactProductionArgv(argv)) throw new Error('shape-classifier-stopped')
    result = await runClassifierCore(argv, dependencyFactory())
  } catch {
    result = undefined
  }
  const formatted = formatResult(result)
  return writeResultOnce(formatted.line, write)
}

export async function runPublicFdResidueShapeClassifierForFixture(
  argv,
  dependencies,
) {
  if (process.env.NODE_ENV !== 'test') throw new Error('fixture-only')
  return runClassifierCore(argv, dependencies)
}

export function formatPublicFdResidueShapeResultForFixture(result) {
  if (process.env.NODE_ENV !== 'test') throw new Error('fixture-only')
  return formatResult(result)
}

export function writePublicFdResidueShapeResultForFixture(line, write) {
  if (process.env.NODE_ENV !== 'test') throw new Error('fixture-only')
  return writeResultOnce(line, write)
}

export function executePublicFdResidueShapeClassifierForFixture(
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

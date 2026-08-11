import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { types as utilTypes } from 'node:util'

const operation = 'diagnose-public-host-admission'
const confirmation = '--confirm-m45-public-host-admission-v1'
const expectedEnvironmentKeys = Object.freeze(['LANG', 'LC_ALL', 'TZ'])
const expectedNodeVersion = '24.18.1'
const expectedExecPath = '/opt/homebrew/Cellar/node@24/24.18.1/bin/node'
const expectedCwd = '/'
const expectedEuid = 501
const stages = Object.freeze([
  'host-environment-keyset',
  'host-platform',
  'host-node-version',
  'host-exec-path',
  'host-cwd',
  'host-euid',
  'host-lc-all',
  'host-lang',
  'host-tz',
  'host-pass',
  'stopped',
])

function stopped() {
  return Object.freeze({ stage: 'stopped' })
}

function exactProductionArgv(argv) {
  try {
    return (
      exactStringArray(argv) &&
      argv.length === 2 &&
      argv[0] === operation &&
      argv[1] === confirmation
    )
  } catch {
    return false
  }
}

function exactStringArray(value) {
  if (!Array.isArray(value) || utilTypes.isProxy(value)) return false
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length')
  if (
    lengthDescriptor === undefined ||
    !('value' in lengthDescriptor) ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0
  )
    return false
  const ownKeys = Reflect.ownKeys(value)
  if (ownKeys.length !== lengthDescriptor.value + 1) return false
  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    if (ownKeys[index] !== String(index)) return false
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !('value' in descriptor) ||
      typeof descriptor.value !== 'string'
    )
      return false
  }
  return ownKeys[lengthDescriptor.value] === 'length'
}

function exactEuidObservation(value) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join('\0') !== 'available\0value' ||
    typeof value.available !== 'boolean'
  )
    return null
  if (!value.available) return value.value === null ? value : null
  return Number.isSafeInteger(value.value) && value.value >= 0 ? value : null
}

function classifyPublicHostAdmission(argv, readers) {
  if (!exactProductionArgv(argv)) return stopped()

  try {
    const environmentKeys = readers.environmentKeys()
    if (!exactStringArray(environmentKeys)) return stopped()
    if (
      environmentKeys.length !== expectedEnvironmentKeys.length ||
      environmentKeys.some(
        (key, index) => key !== expectedEnvironmentKeys[index],
      )
    )
      return Object.freeze({ stage: 'host-environment-keyset' })

    const platform = readers.platform()
    if (typeof platform !== 'string') return stopped()
    if (platform !== 'darwin') return Object.freeze({ stage: 'host-platform' })

    const nodeVersion = readers.nodeVersion()
    if (typeof nodeVersion !== 'string') return stopped()
    if (nodeVersion !== expectedNodeVersion)
      return Object.freeze({ stage: 'host-node-version' })

    const execPath = readers.execPath()
    if (typeof execPath !== 'string') return stopped()
    if (execPath !== expectedExecPath)
      return Object.freeze({ stage: 'host-exec-path' })

    const cwd = readers.cwd()
    if (typeof cwd !== 'string') return stopped()
    if (cwd !== expectedCwd) return Object.freeze({ stage: 'host-cwd' })
    const resolvedCwd = readers.resolveCwd(cwd)
    if (typeof resolvedCwd !== 'string') return stopped()
    if (resolvedCwd !== expectedCwd) return Object.freeze({ stage: 'host-cwd' })

    const euid = exactEuidObservation(readers.euid())
    if (euid === null) return stopped()
    if (!euid.available || euid.value !== expectedEuid)
      return Object.freeze({ stage: 'host-euid' })

    const lcAll = readers.environmentValue('LC_ALL')
    if (typeof lcAll !== 'string') return stopped()
    if (lcAll !== 'C') return Object.freeze({ stage: 'host-lc-all' })

    const lang = readers.environmentValue('LANG')
    if (typeof lang !== 'string') return stopped()
    if (lang !== 'C') return Object.freeze({ stage: 'host-lang' })

    const timezone = readers.environmentValue('TZ')
    if (typeof timezone !== 'string') return stopped()
    if (timezone !== 'UTC') return Object.freeze({ stage: 'host-tz' })

    return Object.freeze({ stage: 'host-pass' })
  } catch {
    return stopped()
  }
}

function formatPublicHostAdmission(result) {
  let stage
  try {
    if (
      result === null ||
      typeof result !== 'object' ||
      Array.isArray(result) ||
      utilTypes.isProxy(result) ||
      Object.keys(result).length !== 1 ||
      Object.keys(result)[0] !== 'stage' ||
      Reflect.ownKeys(result).length !== 1 ||
      Reflect.ownKeys(result)[0] !== 'stage'
    )
      return Object.freeze({ line: '{"stage":"stopped"}\n', exitCode: 1 })
    const descriptor = Object.getOwnPropertyDescriptor(result, 'stage')
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !('value' in descriptor)
    )
      return Object.freeze({ line: '{"stage":"stopped"}\n', exitCode: 1 })
    stage = descriptor.value
  } catch {
    return Object.freeze({ line: '{"stage":"stopped"}\n', exitCode: 1 })
  }
  if (typeof stage !== 'string' || !stages.includes(stage))
    return Object.freeze({ line: '{"stage":"stopped"}\n', exitCode: 1 })

  return Object.freeze({
    line: `{"stage":"${stage}"}\n`,
    exitCode: stage === 'stopped' ? 1 : 0,
  })
}

function closedFormattedLine(line) {
  if (typeof line !== 'string') return null
  for (const stage of stages) {
    if (line === `{"stage":"${stage}"}\n`)
      return Object.freeze({ line, exitCode: stage === 'stopped' ? 1 : 0 })
  }
  return null
}

async function writePublicHostAdmissionOnce(line, write) {
  const formatted = closedFormattedLine(line)
  if (formatted === null || typeof write !== 'function') return 1
  try {
    await write(formatted.line)
    return formatted.exitCode
  } catch {
    return 1
  }
}

function productionReaders() {
  return Object.freeze({
    environmentKeys: () => Object.keys(process.env).sort(),
    platform: () => process.platform,
    nodeVersion: () => process.versions.node,
    execPath: () => process.execPath,
    cwd: () => process.cwd(),
    resolveCwd: (cwd) => resolve(cwd),
    euid: () => {
      const geteuid = process.geteuid
      if (typeof geteuid !== 'function')
        return Object.freeze({ available: false, value: null })
      return Object.freeze({ available: true, value: geteuid.call(process) })
    },
    environmentValue: (name) => process.env[name],
  })
}

function stdoutWrite(line) {
  return new Promise((fulfil, reject) => {
    process.stdout.write(line, (error) => {
      if (error) reject(error)
      else fulfil()
    })
  })
}

async function main() {
  const argv = process.argv.slice(2)
  const result = exactProductionArgv(argv)
    ? classifyPublicHostAdmission(argv, productionReaders())
    : stopped()
  const formatted = formatPublicHostAdmission(result)
  return writePublicHostAdmissionOnce(formatted.line, stdoutWrite)
}

const directExecution =
  process.argv[1] !== undefined &&
  process.argv[1] === fileURLToPath(import.meta.url)

if (directExecution) process.exitCode = await main()

let classifyPublicHostAdmissionForFixture
let formatPublicHostAdmissionForFixture
let writePublicHostAdmissionForFixture
if (!directExecution && process.env.NODE_ENV === 'test') {
  classifyPublicHostAdmissionForFixture = classifyPublicHostAdmission
  formatPublicHostAdmissionForFixture = formatPublicHostAdmission
  writePublicHostAdmissionForFixture = writePublicHostAdmissionOnce
}

export {
  classifyPublicHostAdmissionForFixture,
  formatPublicHostAdmissionForFixture,
  writePublicHostAdmissionForFixture,
}

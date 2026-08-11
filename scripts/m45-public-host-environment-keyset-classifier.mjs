import { fileURLToPath } from 'node:url'
import { types as utilTypes } from 'node:util'

const operation = 'classify-public-host-environment-keyset'
const confirmation = '--confirm-m45-public-host-environment-keyset-v1'
const expectedEnvironmentKeys = Object.freeze(['LANG', 'LC_ALL', 'TZ'])
const candidateCfKey = '__CF_USER_TEXT_ENCODING'
const candidateMallocKey = 'MallocNanoZone'
const candidateProfiles = Object.freeze({
  expected: Object.freeze(['LANG', 'LC_ALL', 'TZ']),
  cf: Object.freeze(['LANG', 'LC_ALL', 'TZ', candidateCfKey].sort()),
  malloc: Object.freeze(['LANG', 'LC_ALL', 'TZ', candidateMallocKey].sort()),
  both: Object.freeze(
    ['LANG', 'LC_ALL', 'TZ', candidateCfKey, candidateMallocKey].sort(),
  ),
})
const stages = Object.freeze([
  'host-environment-keyset-expected-only',
  'host-environment-keyset-expected-plus-cf',
  'host-environment-keyset-expected-plus-malloc',
  'host-environment-keyset-expected-plus-both',
  'host-environment-keyset-missing-only',
  'host-environment-keyset-other-extra',
  'host-environment-keyset-mixed',
  'stopped',
])

function stopped() {
  return Object.freeze({ stage: 'stopped' })
}

function exactStringArray(value, requireSorted = false) {
  if (!Array.isArray(value) || utilTypes.isProxy(value)) return false
  if (Object.getPrototypeOf(value) !== Array.prototype) return false

  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length')
  if (
    lengthDescriptor === undefined ||
    !('value' in lengthDescriptor) ||
    lengthDescriptor.writable !== true ||
    lengthDescriptor.enumerable !== false ||
    lengthDescriptor.configurable !== false ||
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
      descriptor.enumerable !== true ||
      descriptor.writable !== true ||
      descriptor.configurable !== true ||
      !('value' in descriptor) ||
      typeof descriptor.value !== 'string'
    )
      return false
    if (requireSorted && index > 0 && value[index - 1] >= descriptor.value)
      return false
  }
  return ownKeys[lengthDescriptor.value] === 'length'
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

function exactProfile(keys, profile) {
  if (keys.length !== profile.length) return false
  for (let index = 0; index < profile.length; index += 1) {
    if (keys[index] !== profile[index]) return false
  }
  return true
}

function hasKey(keys, key) {
  return keys.includes(key)
}

function classifyEnvironmentKeyset(argv, readers) {
  if (!exactProductionArgv(argv)) return stopped()

  try {
    if (readers === null || typeof readers !== 'object') return stopped()
    if (typeof readers.environmentKeys !== 'function') return stopped()

    const keys = readers.environmentKeys()
    if (!exactStringArray(keys, true)) return stopped()

    if (exactProfile(keys, candidateProfiles.expected))
      return Object.freeze({
        stage: 'host-environment-keyset-expected-only',
      })
    if (exactProfile(keys, candidateProfiles.cf))
      return Object.freeze({
        stage: 'host-environment-keyset-expected-plus-cf',
      })
    if (exactProfile(keys, candidateProfiles.malloc))
      return Object.freeze({
        stage: 'host-environment-keyset-expected-plus-malloc',
      })
    if (exactProfile(keys, candidateProfiles.both))
      return Object.freeze({
        stage: 'host-environment-keyset-expected-plus-both',
      })

    const missingExpected = expectedEnvironmentKeys.some(
      (key) => !hasKey(keys, key),
    )
    const hasExtra = keys.some((key) => !hasKey(expectedEnvironmentKeys, key))
    if (missingExpected && hasExtra)
      return Object.freeze({ stage: 'host-environment-keyset-mixed' })
    if (missingExpected)
      return Object.freeze({
        stage: 'host-environment-keyset-missing-only',
      })
    return Object.freeze({ stage: 'host-environment-keyset-other-extra' })
  } catch {
    return stopped()
  }
}

function formatEnvironmentKeyset(result) {
  let stage
  try {
    if (
      result === null ||
      typeof result !== 'object' ||
      Array.isArray(result) ||
      utilTypes.isProxy(result) ||
      Object.getPrototypeOf(result) !== Object.prototype ||
      Reflect.ownKeys(result).length !== 1 ||
      Reflect.ownKeys(result)[0] !== 'stage'
    )
      return Object.freeze({ line: '{"stage":"stopped"}\n', exitCode: 1 })
    const descriptor = Object.getOwnPropertyDescriptor(result, 'stage')
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
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

async function writeEnvironmentKeysetOnce(line, write) {
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
    ? classifyEnvironmentKeyset(argv, productionReaders())
    : stopped()
  const formatted = formatEnvironmentKeyset(result)
  return writeEnvironmentKeysetOnce(formatted.line, stdoutWrite)
}

const directExecution =
  process.argv[1] !== undefined &&
  process.argv[1] === fileURLToPath(import.meta.url)

if (directExecution) process.exitCode = await main()

let classifyEnvironmentKeysetForFixture
let formatEnvironmentKeysetForFixture
let writeEnvironmentKeysetForFixture
if (!directExecution && process.env.NODE_ENV === 'test') {
  classifyEnvironmentKeysetForFixture = classifyEnvironmentKeyset
  formatEnvironmentKeysetForFixture = formatEnvironmentKeyset
  writeEnvironmentKeysetForFixture = writeEnvironmentKeysetOnce
}

export {
  classifyEnvironmentKeysetForFixture,
  formatEnvironmentKeysetForFixture,
  writeEnvironmentKeysetForFixture,
}

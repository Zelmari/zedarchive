import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { TestInfo } from '@playwright/test'
import { releaseCriticalDiagnosticDirectory } from './release-critical-constants'

export const releaseCriticalTestTitles = [
  'public catalogue core',
  'account and add core',
] as const

export const releaseCriticalStages = [
  'setup',
  'public-browse',
  'public-search',
  'registration',
  'unverified-sign-in',
  'verification',
  'verified-sign-in',
  'add',
  'persistence',
  'sign-out',
  'cleanup',
] as const

export const releaseCriticalCheckpointKeys = [
  'databaseGuarded',
  'catalogueVisible',
  'searchMatched',
  'emptyStateVisible',
  'hibpExercised',
  'emailAccepted',
  'unverifiedRejected',
  'fragmentCleared',
  'signedIn',
  'entrySaved',
  'persistenceConfirmed',
  'signedOut',
] as const

type ReleaseCriticalTestTitle = (typeof releaseCriticalTestTitles)[number]
type ReleaseCriticalStage = (typeof releaseCriticalStages)[number]
type ReleaseCriticalCheckpointKey =
  (typeof releaseCriticalCheckpointKeys)[number]
type CleanupResult = 'not-run' | 'passed' | 'failed'

export type ReleaseCriticalDiagnosticManifest = Readonly<{
  schemaVersion: 1
  testTitle: ReleaseCriticalTestTitle
  stage: ReleaseCriticalStage
  pathname: string
  responseStatus?: number
  checkpoints: Partial<Record<ReleaseCriticalCheckpointKey, boolean>>
  cleanup: CleanupResult
}>

const prohibitedKeyPattern =
  /url|query|fragment|token|email|credential|password|header|cookie|body|stack|error/iu
const pathnamePattern = /^\/[A-Za-z0-9/_-]{0,127}$/u

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}

export function validateReleaseCriticalDiagnostic(
  value: unknown,
): ReleaseCriticalDiagnosticManifest {
  if (!isPlainObject(value)) {
    throw new TypeError('M41 diagnostic must be a plain object')
  }

  const allowedKeys = new Set([
    'schemaVersion',
    'testTitle',
    'stage',
    'pathname',
    'responseStatus',
    'checkpoints',
    'cleanup',
  ])
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key) || prohibitedKeyPattern.test(key)) {
      throw new TypeError('M41 diagnostic contains an unsupported key')
    }
  }

  if (
    value.schemaVersion !== 1 ||
    !releaseCriticalTestTitles.includes(
      value.testTitle as ReleaseCriticalTestTitle,
    ) ||
    !releaseCriticalStages.includes(value.stage as ReleaseCriticalStage) ||
    typeof value.pathname !== 'string' ||
    !pathnamePattern.test(value.pathname) ||
    !isPlainObject(value.checkpoints) ||
    !['not-run', 'passed', 'failed'].includes(String(value.cleanup))
  ) {
    throw new TypeError('M41 diagnostic contains an unsupported value')
  }

  if (
    value.responseStatus !== undefined &&
    (!Number.isInteger(value.responseStatus) ||
      (value.responseStatus as number) < 100 ||
      (value.responseStatus as number) > 599)
  ) {
    throw new TypeError('M41 diagnostic contains an unsupported status')
  }

  for (const [key, checkpointValue] of Object.entries(value.checkpoints)) {
    if (
      !releaseCriticalCheckpointKeys.includes(
        key as ReleaseCriticalCheckpointKey,
      ) ||
      typeof checkpointValue !== 'boolean'
    ) {
      throw new TypeError('M41 diagnostic contains an unsupported checkpoint')
    }
  }

  return value as ReleaseCriticalDiagnosticManifest
}

export class ReleaseCriticalDiagnostic {
  readonly #testTitle: ReleaseCriticalTestTitle
  #stage: ReleaseCriticalStage = 'setup'
  #pathname = '/'
  #responseStatus: number | undefined
  #checkpoints: Partial<Record<ReleaseCriticalCheckpointKey, boolean>> = {}
  #cleanup: CleanupResult = 'not-run'

  constructor(testTitle: ReleaseCriticalTestTitle) {
    this.#testTitle = testTitle
  }

  stage(stage: ReleaseCriticalStage, pathname = '/') {
    this.#stage = stage
    this.#pathname = pathname
    this.#responseStatus = undefined
  }

  responseStatus(status: number) {
    this.#responseStatus = status
  }

  checkpoint(key: ReleaseCriticalCheckpointKey, value = true) {
    this.#checkpoints[key] = value
  }

  cleanup(result: Exclude<CleanupResult, 'not-run'>) {
    this.#cleanup = result
  }

  snapshot(): ReleaseCriticalDiagnosticManifest {
    return validateReleaseCriticalDiagnostic({
      schemaVersion: 1,
      testTitle: this.#testTitle,
      stage: this.#stage,
      pathname: this.#pathname,
      ...(this.#responseStatus === undefined
        ? {}
        : { responseStatus: this.#responseStatus }),
      checkpoints: { ...this.#checkpoints },
      cleanup: this.#cleanup,
    })
  }
}

export async function writeReleaseCriticalFailureDiagnostic(
  testInfo: TestInfo,
  diagnostic: ReleaseCriticalDiagnostic,
) {
  if (testInfo.status === testInfo.expectedStatus) {
    return
  }

  const manifest = diagnostic.snapshot()
  const filename =
    manifest.testTitle === 'public catalogue core'
      ? 'public-catalogue-core.json'
      : 'account-and-add-core.json'
  const outputPath = path.resolve(
    process.cwd(),
    releaseCriticalDiagnosticDirectory,
    filename,
  )

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(manifest)}\n`, {
    encoding: 'utf8',
    flag: 'w',
    mode: 0o600,
  })
}

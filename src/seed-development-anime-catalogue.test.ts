import { z } from 'zod'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const databaseVariableNames = [
  'DATABASE_URL',
  'DATABASE_MIGRATION_URL',
  'DATABASE_TEST_URL',
] as const

const originalDatabaseEnvironment = Object.fromEntries(
  databaseVariableNames.map((variableName) => [
    variableName,
    {
      existed: Object.hasOwn(process.env, variableName),
      value: process.env[variableName],
    },
  ]),
) as Record<
  (typeof databaseVariableNames)[number],
  { existed: boolean; value: string | undefined }
>

const dependencySpies = vi.hoisted(() => ({
  poolConstructor: vi.fn(),
  synchronizeAnimeCatalogueSeed: vi.fn(),
}))

vi.mock('pg', () => ({
  Pool: class {
    constructor() {
      dependencySpies.poolConstructor()
      throw new Error('A database pool must not be created by these tests')
    }
  },
}))

vi.mock('@/server/database/seed-anime-catalogue', () => ({
  AnimeCatalogueSeedSourceConflictError: class extends Error {},
  synchronizeAnimeCatalogueSeed: dependencySpies.synchronizeAnimeCatalogueSeed,
}))

async function importSeedCommand() {
  return import('../scripts/seed-development-anime-catalogue')
}

function captureError(action: () => void): unknown {
  try {
    action()
  } catch (error) {
    return error
  }

  throw new Error('Expected the action to throw')
}

beforeEach(() => {
  dependencySpies.poolConstructor.mockClear()
  dependencySpies.synchronizeAnimeCatalogueSeed.mockClear()

  databaseVariableNames.forEach((variableName) => {
    delete process.env[variableName]
  })
})

afterEach(() => {
  databaseVariableNames.forEach((variableName) => {
    const original = originalDatabaseEnvironment[variableName]

    if (original.existed && original.value !== undefined) {
      process.env[variableName] = original.value
    } else {
      delete process.env[variableName]
    }
  })

  vi.restoreAllMocks()
})

describe('development anime catalogue seed command', () => {
  it('can be imported without executing either command mode', async () => {
    vi.resetModules()
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(importSeedCommand()).resolves.toBeDefined()

    expect(log).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    expect(dependencySpies.poolConstructor).not.toHaveBeenCalled()
    expect(dependencySpies.synchronizeAnimeCatalogueSeed).not.toHaveBeenCalled()
  })

  it('accepts only the write default and the explicit check argument', async () => {
    const { parseSeedCommandArguments } = await importSeedCommand()

    expect(parseSeedCommandArguments([])).toBe('write')
    expect(parseSeedCommandArguments(['--check'])).toBe('check')

    expect(() => parseSeedCommandArguments(['--write'])).toThrow(
      'Usage: npm run db:seed or npm run db:seed:check',
    )
    expect(() => parseSeedCommandArguments(['--check', '--write'])).toThrow(
      'Usage: npm run db:seed or npm run db:seed:check',
    )
  })

  it('accepts exactly archive_dev as the live database name', async () => {
    const { assertDevelopmentDatabaseName } = await importSeedCommand()

    expect(() => assertDevelopmentDatabaseName('archive_dev')).not.toThrow()
  })

  it.each([
    ['archive_test', 'archive_test'],
    ['a similar prefix', 'archive_dev_backup'],
    ['a similar suffix', 'my_archive_dev'],
    ['different punctuation', 'archive-dev'],
    ['an unavailable result', undefined],
  ])('rejects %s before writing', async (_, databaseName) => {
    const { assertDevelopmentDatabaseName } = await importSeedCommand()

    expect(() => assertDevelopmentDatabaseName(databaseName)).toThrow(
      `Development seed refused to write to "${databaseName ?? 'unknown'}"; expected "archive_dev"`,
    )
  })

  it('formats validation and synchronization summaries', async () => {
    const { formatSeedSummary } = await importSeedCommand()

    expect(formatSeedSummary(8)).toBe('Validated 8 anime catalogue seed items.')
    expect(
      formatSeedSummary(8, { inserted: 2, updated: 1, unchanged: 5 }),
    ).toBe(
      'Synchronized 8 seed-owned anime catalogue items: 2 inserted, 1 updated, 5 unchanged.',
    )
  })

  it('prints intentional command guidance but redacts arbitrary errors', async () => {
    const {
      assertDevelopmentDatabaseName,
      formatSeedCommandError,
      parseSeedCommandArguments,
    } = await importSeedCommand()
    const usageError = captureError(() =>
      parseSeedCommandArguments(['--unknown']),
    )
    const databaseNameError = captureError(() =>
      assertDevelopmentDatabaseName('archive_test'),
    )
    const validationError = captureError(() => z.literal(1).parse(2))
    const secret = 'credential-that-must-not-be-printed'
    const arbitraryErrors: unknown[] = [
      new Error(`connection failed for postgresql://user:${secret}@localhost`),
      new Error('outer failure', {
        cause: new Error(`inner dependency failure: ${secret}`),
      }),
      { message: `driver failure: ${secret}` },
      secret,
    ]

    expect(formatSeedCommandError(usageError)).toBe(
      'Usage: npm run db:seed or npm run db:seed:check',
    )
    expect(formatSeedCommandError(databaseNameError)).toBe(
      'Development seed refused to write to "archive_test"; expected "archive_dev"',
    )
    expect(formatSeedCommandError(validationError)).toBe(
      'Anime catalogue seed validation failed. Correct the committed seed and run npm run db:seed:check.',
    )

    arbitraryErrors.forEach((error) => {
      const publicMessage = formatSeedCommandError(error)

      expect(publicMessage).toBe(
        'Anime catalogue seed failed unexpectedly. No error details were printed because they may contain sensitive database information.',
      )
      expect(publicMessage).not.toContain(secret)
    })
  })

  it('runs --check without database configuration or database side effects', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const { runSeedCommand } = await importSeedCommand()

    await expect(runSeedCommand(['--check'])).resolves.toBeUndefined()

    expect(log).toHaveBeenCalledOnce()
    expect(log).toHaveBeenCalledWith('Validated 28 anime catalogue seed items.')
    expect(dependencySpies.poolConstructor).not.toHaveBeenCalled()
    expect(dependencySpies.synchronizeAnimeCatalogueSeed).not.toHaveBeenCalled()
    databaseVariableNames.forEach((variableName) => {
      expect(process.env[variableName]).toBeUndefined()
    })
  })
})

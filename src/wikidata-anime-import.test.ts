import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const databaseVariables = [
  'DATABASE_URL',
  'DATABASE_MIGRATION_URL',
  'DATABASE_TEST_URL',
] as const
const originals = Object.fromEntries(
  databaseVariables.map((name) => [
    name,
    { existed: Object.hasOwn(process.env, name), value: process.env[name] },
  ]),
) as Record<
  (typeof databaseVariables)[number],
  { existed: boolean; value: string | undefined }
>
const spies = vi.hoisted(() => ({ pool: vi.fn(), fetch: vi.fn() }))

vi.mock('pg', () => ({
  Pool: class {
    constructor() {
      spies.pool()
      throw new Error('Check mode must not create a database pool')
    }
  },
}))

async function importCommand() {
  return import('../scripts/wikidata-anime-import')
}

beforeEach(() => {
  spies.pool.mockClear()
  spies.fetch.mockClear()
  vi.stubGlobal('fetch', spies.fetch)
  databaseVariables.forEach((name) => delete process.env[name])
})

afterEach(() => {
  databaseVariables.forEach((name) => {
    const original = originals[name]
    if (original.existed && original.value !== undefined) {
      process.env[name] = original.value
    } else {
      delete process.env[name]
    }
  })
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Wikidata anime import command', () => {
  it('can be imported without execution', async () => {
    vi.resetModules()
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(importCommand()).resolves.toBeDefined()
    expect(log).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    expect(spies.pool).not.toHaveBeenCalled()
    expect(spies.fetch).not.toHaveBeenCalled()
  })

  it('accepts only explicit prepare and check modes', async () => {
    const { parseWikidataImportCommandArguments } = await importCommand()
    expect(parseWikidataImportCommandArguments(['prepare'])).toBe('prepare')
    expect(parseWikidataImportCommandArguments(['check'])).toBe('check')
    expect(() => parseWikidataImportCommandArguments([])).toThrow('Usage:')
    expect(() => parseWikidataImportCommandArguments(['apply'])).toThrow(
      'Usage:',
    )
  })

  it('requires exactly zedarchive_dev before preparation', async () => {
    const { assertImportDevelopmentDatabaseName } = await importCommand()
    expect(() =>
      assertImportDevelopmentDatabaseName('zedarchive_dev'),
    ).not.toThrow()
    expect(() => assertImportDevelopmentDatabaseName('archive_dev')).toThrow(
      'expected "zedarchive_dev"',
    )
    expect(() => assertImportDevelopmentDatabaseName('archive_test')).toThrow(
      'expected "zedarchive_dev"',
    )
    expect(() =>
      assertImportDevelopmentDatabaseName('zedarchive_test'),
    ).toThrow('expected "zedarchive_dev"')
    expect(() => assertImportDevelopmentDatabaseName(undefined)).toThrow(
      'expected "zedarchive_dev"',
    )
  })

  it('runs check mode without environment, database, or network access', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const { runWikidataImportCommand } = await importCommand()
    await expect(runWikidataImportCommand(['check'])).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledWith(
      'Validated 20 Wikidata anime candidates and 3 fixture files.',
    )
    expect(spies.pool).not.toHaveBeenCalled()
    expect(spies.fetch).not.toHaveBeenCalled()
    databaseVariables.forEach((name) =>
      expect(process.env[name]).toBeUndefined(),
    )
  })

  it('stops before provider access when the guarded catalogue snapshot cannot be read', async () => {
    const readSnapshot = vi.fn(() =>
      Promise.reject(new Error('database unavailable')),
    )
    const fetchEntities = vi.fn(() => Promise.resolve({}))
    const writeArtifact = vi
      .fn<(artifact: unknown) => Promise<void>>()
      .mockResolvedValue(undefined)
    const writeReview = vi
      .fn<(artifact: unknown) => Promise<void>>()
      .mockResolvedValue(undefined)
    const { runWikidataImportCommand } = await importCommand()

    await expect(
      runWikidataImportCommand(['prepare'], {
        readSnapshot,
        fetchEntities,
        writeArtifact,
        writeReview,
      }),
    ).rejects.toThrow('database unavailable')
    expect(readSnapshot).toHaveBeenCalledOnce()
    expect(fetchEntities).not.toHaveBeenCalled()
    expect(writeArtifact).not.toHaveBeenCalled()
    expect(writeReview).not.toHaveBeenCalled()
  })

  it('writes both review views before returning a distinct blocker result', async () => {
    const readSnapshot = vi.fn(() => Promise.resolve({ items: [] }))
    const fetchEntities = vi.fn(() => Promise.resolve({}))
    const writeArtifact = vi
      .fn<(artifact: unknown) => Promise<void>>()
      .mockResolvedValue(undefined)
    const writeReview = vi
      .fn<(artifact: unknown) => Promise<void>>()
      .mockResolvedValue(undefined)
    const log = vi.fn()
    const { runWikidataImportCommand, WikidataReviewBlockersError } =
      await importCommand()

    let error: unknown
    try {
      await runWikidataImportCommand(['prepare'], {
        readSnapshot,
        fetchEntities,
        readManifestContents: () => Promise.resolve('manifest'),
        writeArtifact,
        writeReview,
        now: () => new Date('2026-07-17T00:00:00.000Z'),
        log,
      })
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(WikidataReviewBlockersError)
    expect(error).toMatchObject({ blockers: 20 })
    expect(fetchEntities).toHaveBeenCalledWith([
      'Q130377145',
      'Q130377146',
      'Q437808',
      'Q662',
      'Q20590069',
      'Q53353',
      'Q57390937',
      'Q114009808',
      'Q126598644',
      'Q1905968',
      'Q186572',
      'Q21697406',
      'Q1066948',
      'Q888136',
      'Q20038487',
      'Q1196284',
      'Q116783101',
      'Q47087518',
      'Q66205775',
      'Q113448921',
    ])
    expect(writeArtifact).toHaveBeenCalledOnce()
    expect(writeReview).toHaveBeenCalledOnce()
    expect(writeArtifact.mock.calls[0]?.[0]).toEqual(
      writeReview.mock.calls[0]?.[0],
    )
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('20 Wikidata candidates with 20 blockers'),
    )
  })

  it('redacts arbitrary dependency errors', async () => {
    const { formatWikidataImportCommandError } = await importCommand()
    const secret = 'postgresql://user:secret@private-host/database'
    const message = formatWikidataImportCommandError(new Error(secret))
    expect(message).not.toContain(secret)
    expect(message).toContain('details were omitted')
  })
})

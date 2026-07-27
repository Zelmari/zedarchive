import { describe, expect, it, vi } from 'vitest'
import { sha256Canonical } from '@/features/anime/catalogue/anime-release-corpus'
import {
  assertReleaseConnectionUrl,
  runReleaseAnimeCatalogueCommand,
} from '../scripts/release-anime-catalogue'

describe('release anime catalogue script', () => {
  const corpusSha256 = 'a'.repeat(64)
  const loadedBundle = {
    corpus: { items: Array.from({ length: 500 }) },
    index: { corpusSha256 },
  } as never
  const canonicalIndexSha256 = sha256Canonical(
    (loadedBundle as { index: unknown }).index,
  )

  it('runs check before any database opening', async () => {
    const openDatabase = vi.fn()
    await expect(
      runReleaseAnimeCatalogueCommand(['check'], {
        loadBundle: async () =>
          ({
            corpus: { items: Array.from({ length: 500 }) },
            index: {},
          }) as never,
        openDatabase,
        log: () => undefined,
      }),
    ).resolves.toBeUndefined()
    expect(openDatabase).not.toHaveBeenCalled()
  })

  it('refuses apply before opening a database unless every M43 guard is present', async () => {
    const openDatabase = vi.fn()
    await expect(
      runReleaseAnimeCatalogueCommand(
        ['apply', '--release', 'anime-v1', '--sha256', 'a'.repeat(64)],
        {
          loadBundle: async () =>
            ({ index: { corpusSha256: 'a'.repeat(64) } }) as never,
          openDatabase,
          environment: {},
        },
      ),
    ).rejects.toThrow('disabled')
    expect(openDatabase).not.toHaveBeenCalled()
  })

  it.each([
    {
      label: 'release name',
      argumentsToParse: [
        'apply',
        '--release',
        'anime-v2',
        '--sha256',
        canonicalIndexSha256,
      ],
    },
    {
      label: 'corpus hash',
      argumentsToParse: [
        'apply',
        '--release',
        'anime-v1',
        '--sha256',
        'b'.repeat(64),
      ],
    },
  ])(
    'rejects an enabled apply with the wrong $label before opening a connection',
    async ({ argumentsToParse }) => {
      const openDatabase = vi.fn()
      await expect(
        runReleaseAnimeCatalogueCommand(argumentsToParse, {
          loadBundle: async () => loadedBundle,
          openDatabase,
          environment: {
            CATALOGUE_RELEASE_APPLY_ENABLED: 'true',
            CATALOGUE_RELEASE_EXPECTED_DATABASE_NAME: 'zedarchive_production',
          },
        }),
      ).rejects.toThrow('do not match')
      expect(openDatabase).not.toHaveBeenCalled()
    },
  )

  it('rejects the right corpus hash when it is not the canonical committed index hash', async () => {
    const openDatabase = vi.fn()
    await expect(
      runReleaseAnimeCatalogueCommand(
        ['apply', '--release', 'anime-v1', '--sha256', corpusSha256],
        {
          loadBundle: async () => loadedBundle,
          openDatabase,
          environment: {
            CATALOGUE_RELEASE_APPLY_ENABLED: 'true',
            CATALOGUE_RELEASE_EXPECTED_DATABASE_NAME: 'zedarchive_production',
          },
        },
      ),
    ).rejects.toThrow('do not match')
    expect(openDatabase).not.toHaveBeenCalled()
  })

  it.each([
    { label: 'missing', expectedDatabaseName: undefined },
    { label: 'blank', expectedDatabaseName: '   ' },
  ])(
    'rejects an enabled apply with a $label expected database name before opening a connection',
    async ({ expectedDatabaseName }) => {
      const openDatabase = vi.fn()
      await expect(
        runReleaseAnimeCatalogueCommand(
          ['apply', '--release', 'anime-v1', '--sha256', canonicalIndexSha256],
          {
            loadBundle: async () => loadedBundle,
            openDatabase,
            environment: {
              CATALOGUE_RELEASE_APPLY_ENABLED: 'true',
              CATALOGUE_RELEASE_EXPECTED_DATABASE_NAME: expectedDatabaseName,
            },
          },
        ),
      ).rejects.toThrow('target configuration is missing')
      expect(openDatabase).not.toHaveBeenCalled()
    },
  )

  it('closes an opened connection without synchronizing when the exact database name mismatches', async () => {
    const close = vi.fn(() => Promise.resolve())
    const openDatabase = vi.fn(() =>
      Promise.resolve({
        database: undefined as never,
        databaseName: 'zedarchive_not_production',
        close,
      }),
    )
    await expect(
      runReleaseAnimeCatalogueCommand(
        ['apply', '--release', 'anime-v1', '--sha256', canonicalIndexSha256],
        {
          loadBundle: async () => loadedBundle,
          openDatabase,
          environment: {
            CATALOGUE_RELEASE_APPLY_ENABLED: 'true',
            CATALOGUE_RELEASE_EXPECTED_DATABASE_NAME: 'zedarchive_production',
          },
        },
      ),
    ).rejects.toThrow('target')
    expect(openDatabase).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
  })

  it('accepts the canonical committed index hash only after every apply guard passes', async () => {
    const close = vi.fn(() => Promise.resolve())
    const synchronize = vi.fn(() =>
      Promise.resolve({ inserted: 500, updated: 0, unchanged: 0 }),
    )
    const database = {} as never
    await expect(
      runReleaseAnimeCatalogueCommand(
        ['apply', '--release', 'anime-v1', '--sha256', canonicalIndexSha256],
        {
          loadBundle: async () => loadedBundle,
          openDatabase: async () => ({
            database,
            databaseName: 'zedarchive_production',
            close,
          }),
          synchronize,
          environment: {
            CATALOGUE_RELEASE_APPLY_ENABLED: 'true',
            CATALOGUE_RELEASE_EXPECTED_DATABASE_NAME: 'zedarchive_production',
          },
          log: () => undefined,
        },
      ),
    ).resolves.toBeUndefined()
    expect(synchronize).toHaveBeenCalledWith(database, loadedBundle)
    expect(close).toHaveBeenCalledOnce()
  })

  it('requires loopback direct URLs before opening plan or rehearsal targets', () => {
    expect(() =>
      assertReleaseConnectionUrl('rehearse', {
        CATALOGUE_RELEASE_DATABASE_URL:
          'postgresql://user:password@example.test/zedarchive_release_rehearsal',
      }),
    ).toThrow('missing or invalid')
    expect(
      assertReleaseConnectionUrl('plan', {
        CATALOGUE_RELEASE_DATABASE_URL:
          'postgresql://user:password@127.0.0.1/zedarchive_release_rehearsal',
      }),
    ).toContain('127.0.0.1')
  })
})

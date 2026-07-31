import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import {
  animeReleaseV1Descriptor,
  animeReleaseV2Descriptor,
  sha256Canonical,
} from '@/features/anime/catalogue/anime-release-corpus'
import {
  assertReleaseConnectionUrl,
  assertReleaseArtifactMaterialization,
  discoverReleasePathsForDescriptor,
  runReleaseAnimeCatalogueCommand,
} from '../scripts/release-anime-catalogue'

const releaseArtifactTestPrefix = join(
  tmpdir(),
  'zedarchive-release-artifact-test-',
)

async function writeTemporaryFile(
  root: string,
  relativePath: string,
  contents = '{}',
): Promise<string> {
  const path = join(root, relativePath)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, contents)
  return path
}

async function createTemporaryV1Artifacts(root: string): Promise<void> {
  await writeTemporaryFile(root, animeReleaseV1Descriptor.files.corpus)
  await writeTemporaryFile(root, animeReleaseV1Descriptor.files.index)
  await writeTemporaryFile(root, animeReleaseV1Descriptor.files.reviewLedger)
  await writeTemporaryFile(
    root,
    `${animeReleaseV1Descriptor.files.manifestDirectory}/batch-01.json`,
  )
}

async function removeTemporaryReleaseRoot(root: string): Promise<void> {
  if (!root.startsWith(releaseArtifactTestPrefix))
    throw new Error('Refused to remove a non-test release artifact directory')
  await rm(root, { recursive: true, force: true })
}

describe('release anime catalogue script', () => {
  const corpusSha256 = 'a'.repeat(64)
  const loadedBundle = {
    corpus: { items: Array.from({ length: 500 }) },
    index: { corpusSha256 },
  } as never
  const canonicalIndexSha256 = sha256Canonical(
    (loadedBundle as { index: unknown }).index,
  )
  const loadV1Bundle = async () => loadedBundle
  const materializedV2Bundle = (
    predecessorBindings: Partial<{
      predecessorCorpusSha256: string
      predecessorReviewLedgerSha256: string
      predecessorIndexSha256: string
    }> = {},
  ) =>
    ({
      corpus: { items: Array.from({ length: 5000 }) },
      reviewLedger: { items: Array.from({ length: 5000 }) },
      index: {
        predecessorCorpusSha256: sha256Canonical(
          (loadedBundle as { corpus: unknown }).corpus,
        ),
        predecessorReviewLedgerSha256: sha256Canonical(
          (loadedBundle as { reviewLedger?: unknown }).reviewLedger,
        ),
        predecessorIndexSha256: canonicalIndexSha256,
        ...predecessorBindings,
      },
    }) as never
  const loadBothReleases = async (descriptor: { name: string }) =>
    descriptor.name === 'anime-v1' ? loadedBundle : materializedV2Bundle()

  it('reports an absent v2 only when none of its artifacts exist', () => {
    expect(
      assertReleaseArtifactMaterialization(animeReleaseV2Descriptor, {
        corpus: 'absent',
        index: 'absent',
        reviewLedger: 'absent',
        discoveryLedger: 'absent',
        semanticDiff: 'absent',
        manifestDirectory: 'absent',
        matchingManifestCount: 0,
      }),
    ).toBe(false)
  })

  it('fails check before command execution when the required v1 release is absent', async () => {
    await expect(
      runReleaseAnimeCatalogueCommand(['check'], {
        loadBundle: async () => undefined,
      }),
    ).rejects.toThrow('required anime-v1 release is not materialized')
  })

  it.each([
    {
      label: 'index without corpus',
      inventory: {
        corpus: 'absent',
        index: 'present',
        reviewLedger: 'absent',
        discoveryLedger: 'absent',
        semanticDiff: 'absent',
        manifestDirectory: 'absent',
        matchingManifestCount: 0,
      },
    },
    {
      label: 'manifest directory without corpus',
      inventory: {
        corpus: 'absent',
        index: 'absent',
        reviewLedger: 'absent',
        discoveryLedger: 'absent',
        semanticDiff: 'absent',
        manifestDirectory: 'present',
        matchingManifestCount: 1,
      },
    },
    {
      label: 'corpus without discovery ledger',
      inventory: {
        corpus: 'present',
        index: 'present',
        reviewLedger: 'present',
        discoveryLedger: 'absent',
        semanticDiff: 'present',
        manifestDirectory: 'present',
        matchingManifestCount: 1,
      },
    },
  ] as const)('rejects a partial v2 release: $label', ({ inventory }) => {
    expect(() =>
      assertReleaseArtifactMaterialization(animeReleaseV2Descriptor, inventory),
    ).toThrow('incomplete or invalid')
  })

  it('rejects forged or missing v2 predecessor bindings before a command can run', async () => {
    const forged = materializedV2Bundle({
      predecessorCorpusSha256: 'f'.repeat(64),
      predecessorReviewLedgerSha256: 'e'.repeat(64),
      predecessorIndexSha256: 'd'.repeat(64),
    })
    const missing = materializedV2Bundle({
      predecessorCorpusSha256: undefined as never,
    })

    for (const v2 of [forged, missing]) {
      await expect(
        runReleaseAnimeCatalogueCommand(['check'], {
          loadBundle: async (descriptor) =>
            descriptor.name === 'anime-v1' ? loadedBundle : v2,
        }),
      ).rejects.toThrow('predecessor bindings do not match')
    }
  })

  it('rejects unexpected manifest-directory entries in a real temporary filesystem', async () => {
    const root = await mkdtemp(releaseArtifactTestPrefix)
    try {
      await createTemporaryV1Artifacts(root)
      await writeTemporaryFile(
        root,
        `${animeReleaseV1Descriptor.files.manifestDirectory}/.unexpected`,
      )

      await expect(
        discoverReleasePathsForDescriptor(animeReleaseV1Descriptor, root),
      ).rejects.toThrow('incomplete or invalid')
    } finally {
      await removeTemporaryReleaseRoot(root)
    }
  })

  it('rejects a symlinked required artifact in a real temporary filesystem', async () => {
    const root = await mkdtemp(releaseArtifactTestPrefix)
    try {
      await createTemporaryV1Artifacts(root)
      const corpus = join(root, animeReleaseV1Descriptor.files.corpus)
      const target = await writeTemporaryFile(root, 'outside-target.json')
      await rm(corpus)
      await symlink(target, corpus)

      await expect(
        discoverReleasePathsForDescriptor(animeReleaseV1Descriptor, root),
      ).rejects.toThrow('inaccessible or invalid')
    } finally {
      await removeTemporaryReleaseRoot(root)
    }
  })

  it('rejects a symlinked manifest file in a real temporary filesystem', async () => {
    const root = await mkdtemp(releaseArtifactTestPrefix)
    try {
      await createTemporaryV1Artifacts(root)
      const manifest = join(
        root,
        animeReleaseV1Descriptor.files.manifestDirectory,
        'batch-01.json',
      )
      const target = await writeTemporaryFile(root, 'manifest-target.json')
      await rm(manifest)
      await symlink(target, manifest)

      await expect(
        discoverReleasePathsForDescriptor(animeReleaseV1Descriptor, root),
      ).rejects.toThrow('inaccessible or invalid')
    } finally {
      await removeTemporaryReleaseRoot(root)
    }
  })

  it('rejects a symlinked manifest directory in a real temporary filesystem', async () => {
    const root = await mkdtemp(releaseArtifactTestPrefix)
    try {
      await createTemporaryV1Artifacts(root)
      const manifestDirectory = join(
        root,
        animeReleaseV1Descriptor.files.manifestDirectory,
      )
      const realDirectory = join(root, 'real-manifests')
      await mkdir(realDirectory)
      await writeFile(join(realDirectory, 'batch-01.json'), '{}')
      await rm(manifestDirectory, { recursive: true, force: true })
      await symlink(realDirectory, manifestDirectory, 'dir')

      await expect(
        discoverReleasePathsForDescriptor(animeReleaseV1Descriptor, root),
      ).rejects.toThrow('inaccessible or invalid')
    } finally {
      await removeTemporaryReleaseRoot(root)
    }
  })

  it('runs check before any database opening', async () => {
    const openDatabase = vi.fn()
    await expect(
      runReleaseAnimeCatalogueCommand(['check'], {
        loadBundle: async (descriptor) =>
          descriptor.name === 'anime-v1'
            ? ({
                corpus: { items: Array.from({ length: 500 }) },
                index: {},
              } as never)
            : undefined,
        openDatabase,
        log: () => undefined,
      }),
    ).resolves.toBeUndefined()
    expect(openDatabase).not.toHaveBeenCalled()
  })

  it('checks every materialized release and reports an absent successor without claiming it passed', async () => {
    const log = vi.fn()

    await runReleaseAnimeCatalogueCommand(['check'], {
      loadBundle: async (descriptor) =>
        descriptor.name === 'anime-v1' ? loadedBundle : undefined,
      log,
    })

    expect(log).toHaveBeenNthCalledWith(
      1,
      'Validated anime-v1: 500 release catalogue records.',
    )
    expect(log).toHaveBeenNthCalledWith(
      2,
      'Not validated anime-v2: release files are not materialized.',
    )
  })

  it('requires an explicit materialized release for a selected v2 check and never opens a database', async () => {
    const openDatabase = vi.fn()

    await expect(
      runReleaseAnimeCatalogueCommand(['check', '--release', 'anime-v2'], {
        loadBundle: async (descriptor) =>
          descriptor.name === 'anime-v1' ? loadedBundle : undefined,
        openDatabase,
      }),
    ).rejects.toThrow('not materialized')
    expect(openDatabase).not.toHaveBeenCalled()
  })

  it('refuses implicit database release selection once more than one release is materialized', async () => {
    const openDatabase = vi.fn()

    await expect(
      runReleaseAnimeCatalogueCommand(['plan'], {
        loadBundle: loadBothReleases,
        openDatabase,
      }),
    ).rejects.toThrow('selection is required')
    expect(openDatabase).not.toHaveBeenCalled()
  })

  it('keeps a materialized v2 check-only until M45-09 extends the database loader', async () => {
    const openDatabase = vi.fn()

    await expect(
      runReleaseAnimeCatalogueCommand(['plan', '--release', 'anime-v2'], {
        loadBundle: loadBothReleases,
        openDatabase,
      }),
    ).rejects.toThrow('does not support')
    expect(openDatabase).not.toHaveBeenCalled()
  })

  it('refuses apply without an explicit version and hash before opening a database', async () => {
    const openDatabase = vi.fn()

    await expect(
      runReleaseAnimeCatalogueCommand(['apply'], {
        loadBundle: async (descriptor) =>
          descriptor.name === 'anime-v1' ? loadedBundle : undefined,
        openDatabase,
      }),
    ).rejects.toThrow('Usage:')
    expect(openDatabase).not.toHaveBeenCalled()
  })

  it('refuses apply before opening a database unless every M47 guard is present', async () => {
    const openDatabase = vi.fn()
    await expect(
      runReleaseAnimeCatalogueCommand(
        ['apply', '--release', 'anime-v1', '--sha256', 'a'.repeat(64)],
        {
          loadBundle: async (descriptor) =>
            descriptor.name === 'anime-v1'
              ? ({ index: { corpusSha256: 'a'.repeat(64) } } as never)
              : undefined,
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
      expectedError: 'not materialized',
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
      expectedError: 'do not match',
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
    async ({ argumentsToParse, expectedError }) => {
      const openDatabase = vi.fn()
      await expect(
        runReleaseAnimeCatalogueCommand(argumentsToParse, {
          loadBundle: async (descriptor) =>
            descriptor.name === 'anime-v1' ? loadV1Bundle() : undefined,
          openDatabase,
          environment: {
            CATALOGUE_RELEASE_APPLY_ENABLED: 'true',
            CATALOGUE_RELEASE_EXPECTED_DATABASE_NAME: 'zedarchive_production',
          },
        }),
      ).rejects.toThrow(expectedError)
      expect(openDatabase).not.toHaveBeenCalled()
    },
  )

  it('rejects the right corpus hash when it is not the canonical committed index hash', async () => {
    const openDatabase = vi.fn()
    await expect(
      runReleaseAnimeCatalogueCommand(
        ['apply', '--release', 'anime-v1', '--sha256', corpusSha256],
        {
          loadBundle: async (descriptor) =>
            descriptor.name === 'anime-v1' ? loadV1Bundle() : undefined,
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
            loadBundle: async (descriptor) =>
              descriptor.name === 'anime-v1' ? loadV1Bundle() : undefined,
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
          loadBundle: async (descriptor) =>
            descriptor.name === 'anime-v1' ? loadV1Bundle() : undefined,
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
          loadBundle: async (descriptor) =>
            descriptor.name === 'anime-v1' ? loadV1Bundle() : undefined,
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

import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnimeReleaseManifest } from '@/features/anime/catalogue/anime-release-corpus'
import type { WikidataAnimeReleaseReviewArtifact } from '../scripts/wikidata-anime-release-prepare'

const spies = vi.hoisted(() => ({ pool: vi.fn(), fetch: vi.fn() }))

vi.mock('pg', () => ({
  Pool: class {
    constructor() {
      spies.pool()
      throw new Error('The focused command test must inject database access')
    }
  },
}))

async function importCommand() {
  return import('../scripts/wikidata-anime-release-prepare')
}

function manifest(batch = 1): AnimeReleaseManifest {
  return {
    version: 1,
    sourceKey: 'wikidata',
    release: 'anime-v1',
    batch,
    candidates: Array.from({ length: 25 }, (_, index) => ({
      catalogueItemId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      sourceItemId: `Q${index + 1}`,
      expectedEnglishLabel: index === 0 ? null : `Candidate ${index + 1}`,
      intent: 'create',
      catalogueState: 'published',
      overrides: { format: 'tv', maturity: 'safe' },
    })),
  }
}

function manifestContents(batch = 1): string {
  return JSON.stringify(manifest(batch))
}

function artifact(
  classification: 'ready-create' | 'blocked-ambiguous' = 'ready-create',
): WikidataAnimeReleaseReviewArtifact {
  const classifications = {
    'ready-create': classification === 'ready-create' ? 25 : 24,
    'existing-source-no-change': 0,
    'existing-source-differs': 0,
    'ready-link-existing': 0,
    'blocked-potential-duplicate': 0,
    'blocked-source-conflict': 0,
    'blocked-unsupported-identity': 0,
    'blocked-invalid-provider-data': 0,
    'blocked-ambiguous': classification === 'blocked-ambiguous' ? 1 : 0,
  }

  return {
    schema: 'zedarchive.anime-release-preparation',
    version: 1,
    release: 'anime-v1',
    batch: 1,
    generatedAt: '2026-07-26T00:00:00.000Z',
    manifestSha256: 'a'.repeat(64),
    catalogueSnapshotSha256: 'b'.repeat(64),
    candidates: Array.from({ length: 25 }, (_, index) => ({
      order: index,
      sourceItemId: `Q${index + 1}`,
      catalogueItemId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      expectedEnglishLabel: index === 0 ? null : `Candidate ${index + 1}`,
      providerRevisionId: null,
      providerProjection: {
        labels: {
          en: index === 0 ? 'provider-only-review-material' : null,
          ja: null,
        },
        aliases: { en: [], ja: [] },
        claims: {},
      },
      overrides: {},
      proposedItem: null,
      warnings: [],
      ignoredValues: [],
      matches: [],
      classification: index === 0 ? classification : 'ready-create',
    })),
    summary: {
      total: 25,
      blockers: classification === 'blocked-ambiguous' ? 1 : 0,
      classifications,
    },
  }
}

beforeEach(() => {
  spies.pool.mockClear()
  spies.fetch.mockClear()
  vi.stubGlobal('fetch', spies.fetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Wikidata anime release preparation command', () => {
  it('requires the exact mode then batch argument order', async () => {
    const { parseWikidataReleasePrepareArguments } = await importCommand()
    expect(
      parseWikidataReleasePrepareArguments(['check', '--batch', '01']),
    ).toEqual({ mode: 'check', batch: 1 })
    expect(
      parseWikidataReleasePrepareArguments(['prepare', '--batch', '20']),
    ).toEqual({ mode: 'prepare', batch: 20 })
    expect(() =>
      parseWikidataReleasePrepareArguments(['--batch', '01', 'check']),
    ).toThrow('Usage:')
    expect(() =>
      parseWikidataReleasePrepareArguments(['prepare', '--batch', '1']),
    ).toThrow('Usage:')
  })

  it('validates the selected batch without database or network access in check mode', async () => {
    const { runWikidataReleasePrepareCommand } = await importCommand()
    const log = vi.fn()
    await runWikidataReleasePrepareCommand(['check', '--batch', '01'], {
      readManifestContents: async () => manifestContents(),
      log,
    })
    expect(log).toHaveBeenCalledWith(
      'Validated release batch 01 with 25 Wikidata candidates.',
    )
    expect(spies.pool).not.toHaveBeenCalled()
    expect(spies.fetch).not.toHaveBeenCalled()
  })

  it('does not open a database connection when manifest validation fails', async () => {
    const { runWikidataReleasePrepareCommand } = await importCommand()
    const readSnapshot = vi.fn()
    const fetchEntities = vi.fn()
    await expect(
      runWikidataReleasePrepareCommand(['prepare', '--batch', '01'], {
        readManifestContents: async () => {
          throw new Error('invalid release manifest')
        },
        readSnapshot,
        fetchEntities,
      }),
    ).rejects.toThrow('invalid release manifest')
    expect(readSnapshot).not.toHaveBeenCalled()
    expect(fetchEntities).not.toHaveBeenCalled()
    expect(spies.pool).not.toHaveBeenCalled()
  })

  it('waits for the guarded snapshot to close before starting provider access', async () => {
    const { runWikidataReleasePrepareCommand } = await importCommand()
    const events: string[] = []
    const publishArtifactPair = vi.fn().mockResolvedValue(undefined)
    await runWikidataReleasePrepareCommand(['prepare', '--batch', '01'], {
      readManifestContents: async () => manifestContents(),
      readSnapshot: async () => {
        events.push('snapshot-read')
        events.push('snapshot-closed')
        return { items: [] }
      },
      fetchEntities: async () => {
        events.push('network')
        return {}
      },
      createArtifact: () => artifact(),
      publishArtifactPair,
    })
    expect(events).toEqual(['snapshot-read', 'snapshot-closed', 'network'])
    expect(publishArtifactPair).toHaveBeenCalledOnce()
    expect(publishArtifactPair.mock.calls[0]?.[0].candidates[0]).toMatchObject({
      expectedEnglishLabel: null,
    })
    expect(publishArtifactPair.mock.calls[0]?.[1]).not.toContain(
      'provider-only-review-material',
    )
  })

  it('uses one manifest byte snapshot for parsing, acquisition, and the artifact hash', async () => {
    const { runWikidataReleasePrepareCommand } = await importCommand()
    const firstContents = manifestContents()
    const changedManifest = manifest()
    changedManifest.candidates[0] = {
      ...changedManifest.candidates[0]!,
      sourceItemId: 'Q999',
    }
    const changedContents = JSON.stringify(changedManifest)
    const readManifestContents = vi
      .fn()
      .mockResolvedValueOnce(firstContents)
      .mockResolvedValueOnce(changedContents)
    const fetchEntities = vi.fn().mockResolvedValue({})
    const createArtifact = vi.fn(
      (input: {
        manifest: AnimeReleaseManifest
        manifestContents: string
      }) => ({
        ...artifact(),
        manifestSha256: createHash('sha256')
          .update(input.manifestContents)
          .digest('hex'),
      }),
    )
    const publishArtifactPair = vi.fn().mockResolvedValue(undefined)

    await runWikidataReleasePrepareCommand(['prepare', '--batch', '01'], {
      readManifestContents,
      readSnapshot: async () => ({ items: [] }),
      fetchEntities,
      createArtifact,
      publishArtifactPair,
    })

    expect(readManifestContents).toHaveBeenCalledOnce()
    expect(fetchEntities).toHaveBeenCalledWith(
      manifest().candidates.map(({ sourceItemId }) => sourceItemId),
    )
    expect(createArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        manifest: manifest(),
        manifestContents: firstContents,
      }),
    )
    expect(publishArtifactPair.mock.calls[0]?.[0].manifestSha256).toBe(
      createHash('sha256').update(firstContents).digest('hex'),
    )
  })

  it('fails closed after publishing the review pair when any classification is blocked', async () => {
    const {
      runWikidataReleasePrepareCommand,
      WikidataReleaseReviewBlockersError,
    } = await importCommand()
    const publishArtifactPair = vi.fn().mockResolvedValue(undefined)
    await expect(
      runWikidataReleasePrepareCommand(['prepare', '--batch', '01'], {
        readManifestContents: async () => manifestContents(),
        readSnapshot: async () => ({ items: [] }),
        fetchEntities: async () => ({}),
        createArtifact: () => artifact('blocked-ambiguous'),
        publishArtifactPair,
      }),
    ).rejects.toBeInstanceOf(WikidataReleaseReviewBlockersError)
    expect(publishArtifactPair).toHaveBeenCalledOnce()
  })

  it('refuses to replace a missing half of an existing review pair', async () => {
    const { assertCompleteReleaseArtifactPair } = await importCommand()
    const directory = await mkdtemp(join(tmpdir(), 'zedarchive-m36-pair-'))
    const json = join(directory, 'batch-01.review.json')
    const markdown = join(directory, 'batch-01.review.md')

    try {
      await writeFile(json, '{"reduced":"artifact"}\n', 'utf8')
      await expect(
        assertCompleteReleaseArtifactPair({ json, markdown }),
      ).rejects.toThrow('artifact pair is incomplete')
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it('redacts arbitrary dependency failures from command-line output', async () => {
    const { formatWikidataReleasePrepareError } = await importCommand()
    const secret = 'postgresql://private:secret@host/release'
    expect(formatWikidataReleasePrepareError(new Error(secret))).not.toContain(
      secret,
    )
  })
})

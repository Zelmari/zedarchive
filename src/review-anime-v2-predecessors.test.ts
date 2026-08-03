import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  loadAnimeReleaseBundle,
  type AnimeReleaseBundle,
} from '@/features/anime/catalogue/anime-release-corpus'
import {
  parsePredecessorReviewArguments,
  assertAcceptedPredecessorV1RawFiles,
  assertPredecessorReviewOutputVacant,
  assertPredecessorReviewRuntimeEnvironment,
  buildUnauthoritativePredecessorPreparationArtifacts,
  fetchPredecessorEntitiesBounded,
  isExactHtmlMediaType,
  loadPredecessorRoleEvidenceForFixture,
  loadPredecessorRoleRoundForFixture,
  PredecessorReviewCommandError,
  runPredecessorReviewCommand,
  runPredecessorReviewCommandForFixture,
  runPredecessorPreparationStagesForFixture,
  SequentialPredecessorRequester,
  writePredecessorFinalArtifactsForFixture,
  writePredecessorRoleArtifactForFixture,
  writePredecessorRoundHandoffForFixture,
  verifyPredecessorReconciliationLineageForFixture,
} from '../scripts/review-anime-v2-predecessors'
import {
  acceptedPredecessorIdentityProjection,
  createPredecessorReReviewDocket,
  PredecessorReductionError,
} from '@/features/anime/catalogue/anime-successor-predecessor-review'
import { discoverySha256 } from '@/features/anime/catalogue/wikidata-anime-discovery'
import type { WikidataEntity } from '@/integrations/wikidata/wikidata-entity'

let bundle: AnimeReleaseBundle
let frozenReceipt: unknown
beforeAll(async () => {
  bundle = await loadAnimeReleaseBundle({
    corpus: resolve('data/releases/anime-catalogue.v1.json'),
    reviewLedger: resolve('data/releases/anime-catalogue.v1.review.json'),
    index: resolve('data/releases/anime-catalogue.v1.index.json'),
    manifests: Array.from({ length: 20 }, (_, index) =>
      resolve(
        `data/imports/releases/anime-v1/batch-${String(index + 1).padStart(2, '0')}.json`,
      ),
    ),
  })
  frozenReceipt = receipt()
})

function receipt() {
  const hash = 'a'.repeat(64)
  const candidates = bundle.corpus.items
    .filter(({ sources }) => sources[0]!.sourceItemId !== 'Q583684')
    .map(({ sources, format, releaseYear }) => ({
      qid: sources[0]!.sourceItemId,
      format,
      releaseYear,
      era: 'unknown',
      englishArticle: null,
      japaneseArticle: null,
      englishTotal: null,
      japaneseTotal: null,
      englishBand: 'unavailable',
      japaneseBand: 'unavailable',
      sitelinkCount: 0,
      sitelinkBand: '0-to-4',
      englishMappingInputSha256: hash,
      japaneseMappingInputSha256: hash,
    }))
  while (candidates.length < 6_000)
    candidates.push({
      ...candidates[0]!,
      qid: `Q${200_000 + candidates.length}`,
    })
  return {
    schema: 'zedarchive.anime-discovery-candidate-receipt',
    version: 1,
    release: 'anime-v2',
    executedAt: '2026-07-31T00:00:00.000Z',
    window: { start: '2025-07-01T00:00:00Z', end: '2026-06-30T23:59:59Z' },
    specificationHashes: {
      query: hash,
      mapping: hash,
      aggregation: hash,
      bands: hash,
      ordering: hash,
      reasonCodes: hash,
    },
    providerResponseSetSha256: hash,
    requestEvidence: {
      attempts: 1,
      successfulPageviews: 0,
      retries: 0,
      pacingWaits: 0,
      pacingDelayMilliseconds: 0,
      elapsedMilliseconds: 1,
      maximumConcurrency: 1,
    },
    identityBlocked: [],
    candidates,
  }
}

function entities(): Record<string, WikidataEntity> {
  const result = Object.fromEntries(
    bundle.corpus.items.map(({ sources }) => {
      const qid = sources[0]!.sourceItemId
      return [
        qid,
        {
          id: qid,
          type: 'item',
          lastrevid: 1,
          labels: { en: { language: 'en', value: qid } },
          aliases: {},
          claims: {},
        },
      ]
    }),
  )
  for (const projected of acceptedPredecessorIdentityProjection.entities) {
    result[projected.qid] = {
      id: projected.qid,
      type: 'item',
      lastrevid: 1,
      labels: { en: { language: 'en', value: projected.label } },
      aliases: {},
      claims: Object.fromEntries(
        Object.entries(projected.claims).map(([property, statements]) => [
          property,
          statements.map((statement) => ({
            rank: statement.rank,
            mainsnak: {
              property,
              snaktype: statement.snaktype,
              datatype: statement.datatype,
              datavalue: {
                type:
                  statement.datatype === 'wikibase-item'
                    ? 'wikibase-entityid'
                    : statement.datatype,
                value:
                  typeof statement.value === 'string'
                    ? {
                        id: statement.value,
                        'entity-type': 'item',
                      }
                    : statement.value,
              },
            },
          })),
        ]),
      ),
    }
  }
  return result
}

describe('predecessor review command', () => {
  it('accepts only explicit check and live preparation arguments', () => {
    expect(runPredecessorReviewCommand).toHaveLength(1)
    expect(parsePredecessorReviewArguments(['check'])).toEqual({
      mode: 'check',
    })
    expect(
      parsePredecessorReviewArguments(['prepare', '--confirm-wikimedia-live']),
    ).toEqual({ mode: 'prepare' })
    expect(parsePredecessorReviewArguments(['draft', 'primary'])).toEqual({
      mode: 'draft',
      role: 'primary',
      round: 1,
    })
    expect(
      parsePredecessorReviewArguments([
        'lock',
        'independent',
        'completed-result.json',
      ]),
    ).toEqual({
      mode: 'lock',
      role: 'independent',
      completedPath: 'completed-result.json',
      round: 1,
    })
    expect(parsePredecessorReviewArguments(['reconcile'])).toEqual({
      mode: 'reconcile',
      round: 1,
    })
    expect(() => parsePredecessorReviewArguments(['prepare'])).toThrow('Usage')
  })

  it('locks ignored role and final artifacts atomically without overwrite residue', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-role-lock-'))
    try {
      const first = await writePredecessorRoleArtifactForFixture(
        directory,
        'primary-review.locked.json',
        { recordCount: 500 },
      )
      expect(await readFile(first, 'utf8')).toBe('{\n  "recordCount": 500\n}\n')
      await expect(
        writePredecessorRoleArtifactForFixture(
          directory,
          'primary-review.locked.json',
          { recordCount: 500 },
        ),
      ).rejects.toThrow('no overwrite')
      expect(await readdir(directory)).toEqual(['primary-review.locked.json'])
      const finalized = await writePredecessorFinalArtifactsForFixture(
        directory,
        { records: 500 },
        { resultSha256: 'a'.repeat(64) },
      )
      expect((await readdir(finalized)).sort()).toEqual([
        'predecessor-review-result.json',
        'safe-aggregate.json',
      ])
      await expect(
        writePredecessorFinalArtifactsForFixture(
          directory,
          { records: 500 },
          { resultSha256: 'a'.repeat(64) },
        ),
      ).rejects.toThrow('no overwrite')
      expect(
        (await readdir(directory)).some((entry) => entry.includes('.staging')),
      ).toBe(false)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('loads only the requested role input before a role draft or lock', async () => {
    const read = vi.fn<(path: string) => Promise<unknown>>(async () => ({}))
    await loadPredecessorRoleEvidenceForFixture('primary', read)
    expect(read).toHaveBeenCalledTimes(2)
    expect(
      read.mock.calls.some(([path]) =>
        String(path).includes('independent-review-input'),
      ),
    ).toBe(false)
    read.mockClear()
    await loadPredecessorRoleEvidenceForFixture('independent', read)
    expect(read).toHaveBeenCalledTimes(2)
    expect(
      read.mock.calls.some(([path]) =>
        String(path).includes('primary-review-input'),
      ),
    ).toBe(false)
  })

  it('loads round-two role evidence from only preparation, own input, and gate', async () => {
    const preparation = { prepared: true }
    const gate = {
      schema: 'zedarchive.anime-v2-predecessor-re-review-gate',
      version: 1,
      round: 2,
      preparationSha256: discoverySha256(preparation),
      priorRoundDocketSha256: 'a'.repeat(64),
    }
    for (const role of ['primary', 'independent'] as const) {
      const read = vi.fn<(path: string) => Promise<unknown>>(async (path) =>
        path.includes('source-receipt')
          ? preparation
          : path.includes('gate.json')
            ? gate
            : {},
      )
      await loadPredecessorRoleRoundForFixture(role, 2, read)
      expect(read).toHaveBeenCalledTimes(3)
      expect(
        read.mock.calls.some(([path]) =>
          String(path).includes(
            role === 'primary'
              ? 'independent-review-input'
              : 'primary-review-input',
          ),
        ),
      ).toBe(false)
      expect(
        read.mock.calls.some(([path]) => String(path).includes('locked')),
      ).toBe(false)
      expect(
        read.mock.calls.some(([path]) => String(path).includes('docket.json')),
      ).toBe(false)
    }
  })

  it('rejects forged or stale role gates before round-two role evidence is returned', async () => {
    const preparation = { prepared: true }
    for (const gate of [
      {
        schema: 'zedarchive.anime-v2-predecessor-re-review-gate',
        version: 1,
        round: 3,
        preparationSha256: discoverySha256(preparation),
        priorRoundDocketSha256: 'a'.repeat(64),
      },
      {
        schema: 'zedarchive.anime-v2-predecessor-re-review-gate',
        version: 1,
        round: 2,
        preparationSha256: 'b'.repeat(64),
        priorRoundDocketSha256: 'a'.repeat(64),
      },
    ])
      await expect(
        loadPredecessorRoleRoundForFixture('primary', 2, async (path) =>
          path.includes('source-receipt')
            ? preparation
            : path.includes('gate.json')
              ? gate
              : {},
        ),
      ).rejects.toThrow('not bound')
  })

  it('writes equivalent finalized evidence with byte-stable contents', async () => {
    const first = await mkdtemp(join(tmpdir(), 'm45-final-first-'))
    const second = await mkdtemp(join(tmpdir(), 'm45-final-second-'))
    try {
      const value = { records: 500, resultSha256: 'a'.repeat(64) }
      const aggregate = { records: 500, preparationSha256: 'b'.repeat(64) }
      const [firstDirectory, secondDirectory] = await Promise.all([
        writePredecessorFinalArtifactsForFixture(first, value, aggregate),
        writePredecessorFinalArtifactsForFixture(second, value, aggregate),
      ])
      await expect(
        readFile(
          join(firstDirectory, 'predecessor-review-result.json'),
          'utf8',
        ),
      ).resolves.toBe(
        await readFile(
          join(secondDirectory, 'predecessor-review-result.json'),
          'utf8',
        ),
      )
      await expect(
        readFile(join(firstDirectory, 'safe-aggregate.json'), 'utf8'),
      ).resolves.toBe(
        await readFile(join(secondDirectory, 'safe-aggregate.json'), 'utf8'),
      )
    } finally {
      await rm(first, { recursive: true, force: true })
      await rm(second, { recursive: true, force: true })
    }
  })

  it('publishes a two-file round handoff atomically and permits retry after pre-promotion failure', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-round-handoff-'))
    try {
      await expect(
        writePredecessorRoundHandoffForFixture(
          directory,
          1,
          { records: 500 },
          { round: 2 },
          async () => {
            throw new Error('fixture promotion failure')
          },
        ),
      ).rejects.toThrow('fixture promotion failure')
      expect(await readdir(directory)).toEqual([])
      const handoff = await writePredecessorRoundHandoffForFixture(
        directory,
        1,
        { records: 500 },
        { round: 2 },
      )
      expect((await readdir(handoff)).sort()).toEqual([
        'docket.json',
        'gate.json',
      ])
      await expect(
        writePredecessorRoundHandoffForFixture(
          directory,
          1,
          { records: 500 },
          { round: 2 },
        ),
      ).rejects.toThrow('no overwrite')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('verifies the actual prior locks before accepting a reconciliation gate', async () => {
    const files = buildUnauthoritativePredecessorPreparationArtifacts(
      bundle,
      entities(),
      new Date('2026-07-31T00:00:00.000Z'),
    )
    const preparation = files['source-receipt.json']
    const primaryInput = files['primary-review-input.json'] as {
      records: Array<{
        catalogueItemId: string
        sourceItemId: string
        predecessorNormalizedItemSha256: string
        projection: { projectionSha256: string }
      }>
    }
    const independentInput = files[
      'independent-review-input.json'
    ] as typeof primaryInput
    const roleResult = (
      role: 'primary' | 'independent',
      input: typeof primaryInput,
    ) => ({
      schema: 'zedarchive.anime-v2-predecessor-role-review-result',
      version: 1,
      role,
      roleInputSha256: discoverySha256(input),
      preparationSha256: discoverySha256(preparation),
      round: 1,
      priorRoundDocketSha256: null,
      records: input.records.map((record, index) => ({
        catalogueItemId: record.catalogueItemId,
        sourceItemId: record.sourceItemId,
        predecessorNormalizedItemSha256: record.predecessorNormalizedItemSha256,
        predecessorProjectionSha256: record.projection.projectionSha256,
        outcome: 'blocked',
        reason: role === 'independent' && index === 0 ? 'title' : 'identity',
      })),
    })
    const primary = roleResult('primary', primaryInput)
    const independent = roleResult('independent', independentInput)
    const docket = createPredecessorReReviewDocket(
      primary,
      independent,
      preparation,
      1,
    )
    const gate = {
      schema: 'zedarchive.anime-v2-predecessor-re-review-gate',
      version: 1,
      round: 2,
      preparationSha256: discoverySha256(preparation),
      priorRoundDocketSha256: discoverySha256(docket),
    }
    const evidence = {
      docket,
      primaryInput,
      independentInput,
      primary,
      independent,
    }
    const reader = (values: typeof evidence) => async (path: string) => {
      if (path.endsWith('docket.json')) return values.docket
      if (path.includes('primary-review-input')) return values.primaryInput
      if (path.includes('independent-review-input'))
        return values.independentInput
      if (path.includes('primary-review.locked')) return values.primary
      if (path.includes('independent-review.locked')) return values.independent
      throw new Error(`Unexpected fixture path: ${path}`)
    }

    await expect(
      verifyPredecessorReconciliationLineageForFixture(
        2,
        preparation,
        gate,
        reader(evidence),
        '/fixture/prepared',
      ),
    ).resolves.toBe(discoverySha256(docket))
    await expect(
      verifyPredecessorReconciliationLineageForFixture(
        2,
        preparation,
        { ...gate, priorRoundDocketSha256: 'f'.repeat(64) },
        reader(evidence),
        '/fixture/prepared',
      ),
    ).rejects.toThrow('does not match immutable prior locks')
    await expect(
      verifyPredecessorReconciliationLineageForFixture(
        2,
        preparation,
        gate,
        reader({
          ...evidence,
          primary: { ...primary, preparationSha256: 'f'.repeat(64) },
        }),
        '/fixture/prepared',
      ),
    ).rejects.toThrow('exact role input')
  })

  it('binds the exact tracked raw release-v1 files before parsing authority', async () => {
    const [corpus, reviewLedger, index] = await Promise.all([
      readFile(resolve('data/releases/anime-catalogue.v1.json'), 'utf8'),
      readFile(resolve('data/releases/anime-catalogue.v1.review.json'), 'utf8'),
      readFile(resolve('data/releases/anime-catalogue.v1.index.json'), 'utf8'),
    ])
    expect(() =>
      assertAcceptedPredecessorV1RawFiles({ corpus, reviewLedger, index }),
    ).not.toThrow()
    expect(() =>
      assertAcceptedPredecessorV1RawFiles({
        corpus,
        reviewLedger,
        index: `${index} `,
      }),
    ).toThrow('accepted raw digests')
  })

  it('keeps fixture dependency injection unavailable to live tooling', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      await expect(
        runPredecessorReviewCommandForFixture(['check'], {
          loadBundle: async () => bundle,
        }),
      ).rejects.toThrow('unavailable to live tooling')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('redacts unknown failures at every private terminal stage', async () => {
    const secret =
      'Q999 https://private.example.test hidden-title /private/path TOKEN=value'
    const expectTerminal = async (
      dependencies: Parameters<
        typeof runPredecessorPreparationStagesForFixture
      >[1],
      stage: string,
      completed: number,
      total: number,
      category?: string,
    ) => {
      const error = await runPredecessorPreparationStagesForFixture(
        bundle,
        dependencies,
      ).catch((failure: unknown) => failure)
      expect(error).toBeInstanceOf(PredecessorReviewCommandError)
      expect((error as Error).message).toBe(
        `Predecessor review stopped safely: stage=${stage}; completed=${completed}; total=${total}${category ? `; category=${category}` : ''}.`,
      )
      expect((error as Error).message).not.toContain(secret)
      expect((error as Error).cause).toBeUndefined()
      expect(JSON.stringify(error)).not.toContain(secret)
    }

    await expectTerminal(
      { fetchEntities: async () => Promise.reject(new Error(secret)) },
      'entity-groups',
      0,
      21,
    )
    await expectTerminal(
      {
        fetchEntities: async (_qids, afterGroup) => {
          for (let completed = 0; completed < 20; completed += 1) afterGroup?.()
          throw new Error(secret)
        },
      },
      'entity-groups',
      20,
      21,
    )
    await expectTerminal(
      {
        fetchEntities: async () => entities(),
        checkEvidenceUrls: async () => Promise.reject(new Error(secret)),
      },
      'evidence-urls',
      0,
      89,
    )
    await expectTerminal(
      {
        fetchEntities: async () => entities(),
        checkEvidenceUrls: async (_urls, afterUrl) => {
          for (let completed = 0; completed < 88; completed += 1) afterUrl?.()
          throw new Error(secret)
        },
      },
      'evidence-urls',
      88,
      89,
    )

    const identityFailure = entities()
    ;(identityFailure.Q114798266!.claims.P31![0] as { rank: string }).rank =
      'deprecated'
    await expectTerminal(
      {
        fetchEntities: async () => identityFailure,
        checkEvidenceUrls: async () => undefined,
      },
      'identity-projection',
      0,
      1,
    )

    const firstProjectionFailure = entities()
    const firstQid = bundle.corpus.items[0]!.sources[0]!.sourceItemId
    firstProjectionFailure[firstQid]!.redirect = 'Q1'
    await expectTerminal(
      {
        fetchEntities: async () => firstProjectionFailure,
        checkEvidenceUrls: async () => undefined,
      },
      'predecessor-projections',
      0,
      500,
      'entity-state',
    )

    const lastProjectionFailure = entities()
    const lastQid = bundle.corpus.items.at(-1)!.sources[0]!.sourceItemId
    lastProjectionFailure[lastQid]!.redirect = 'Q1'
    await expectTerminal(
      {
        fetchEntities: async () => lastProjectionFailure,
        checkEvidenceUrls: async () => undefined,
      },
      'predecessor-projections',
      499,
      500,
      'entity-state',
    )
    await expectTerminal(
      {
        fetchEntities: async () => entities(),
        checkEvidenceUrls: async () => undefined,
        now: () => new Date(Number.NaN),
      },
      'preparation-validation',
      0,
      1,
    )
    await expectTerminal(
      {
        fetchEntities: async () => entities(),
        checkEvidenceUrls: async () => undefined,
        publish: async () => Promise.reject(new Error(secret)),
      },
      'atomic-publication',
      0,
      8,
    )
  })

  it('preserves known safe command errors unchanged', async () => {
    const known = new PredecessorReviewCommandError(
      'Known bounded predecessor stop.',
    )
    const error = await runPredecessorPreparationStagesForFixture(bundle, {
      fetchEntities: async () => Promise.reject(known),
    }).catch((failure: unknown) => failure)
    expect(error).toBe(known)
    expect((error as Error).message).toBe('Known bounded predecessor stop.')
  })

  it('emits only fixed predecessor reduction categories without source data', async () => {
    const target = bundle.corpus.items.find(
      ({ sources }) =>
        !['Q114798266', 'Q114798403', 'Q114798407'].includes(
          sources[0]!.sourceItemId,
        ),
    )!
    const targetQid = target.sources[0]!.sourceItemId
    const reduceFailure = async (
      category: string,
      change: (value: WikidataEntity) => void,
    ) => {
      const acquired = entities()
      change(acquired[targetQid]!)
      const error = await runPredecessorPreparationStagesForFixture(bundle, {
        fetchEntities: async () => acquired,
        checkEvidenceUrls: async () => undefined,
      }).catch((failure: unknown) => failure)
      const message = (error as Error).message
      expect(error).toBeInstanceOf(PredecessorReviewCommandError)
      expect(message).toMatch(
        /^Predecessor review stopped safely: stage=predecessor-projections; completed=\d+; total=500; category=(?:entity-state|continuity-limit|statement-shape|claim-value|projection-schema|unexpected-reduction)\.$/,
      )
      expect(message).toContain(`category=${category}`)
      expect(message).not.toContain(targetQid)
      expect(message).not.toContain('private.example.test')
      expect(message).not.toContain('private claim value')
      expect((error as Error).cause).toBeUndefined()
      expect(JSON.stringify(error)).not.toContain(targetQid)
    }
    const statement = (property: string, value: unknown) => ({
      rank: 'normal',
      mainsnak: {
        property,
        snaktype: 'value',
        datatype: 'wikibase-item',
        datavalue: { type: 'wikibase-entityid', value },
      },
    })

    await reduceFailure('entity-state', (value) => {
      value.redirect = 'Q1'
    })
    await reduceFailure('continuity-limit', (value) => {
      value.claims.P155 = Array.from({ length: 9 }, (_, index) =>
        statement('P155', {
          id: `Q${index + 2}`,
          'entity-type': 'item',
        }),
      )
    })
    await reduceFailure('statement-shape', (value) => {
      value.claims.P31 = [{ private: 'private claim value' }]
    })
    await reduceFailure('claim-value', (value) => {
      value.claims.P577 = [
        statement('P577', { private: 'private claim value' }),
      ]
    })
    await reduceFailure('projection-schema', (value) => {
      value.lastrevid = -1
    })
    await reduceFailure('unexpected-reduction', (value) => {
      value.claims = new Proxy(
        {},
        {
          get() {
            throw new Error('Q999 private.example.test private claim value')
          },
        },
      )
    })
    await reduceFailure('unexpected-reduction', (value) => {
      value.claims = new Proxy(
        {},
        {
          get() {
            throw new PredecessorReductionError(
              'Q999 private.example.test private claim value',
              'private error message',
            )
          },
        },
      )
    })
    await reduceFailure('unexpected-reduction', (value) => {
      const hostileCategoryRead = new Proxy(
        new PredecessorReductionError('entity-state', 'private error message'),
        {
          get(target, property, receiver) {
            if (property === 'category')
              throw new Error('private branded category getter')
            return Reflect.get(target, property, receiver)
          },
        },
      )
      value.claims = new Proxy(
        {},
        {
          get() {
            throw hostileCategoryRead
          },
        },
      )
    })
  })

  it('redacts unknown preflight failures without inventing an acquisition stage', async () => {
    const secret = 'private preflight path and provider detail'
    const error = await runPredecessorReviewCommandForFixture(
      ['prepare', '--confirm-wikimedia-live'],
      {
        loadBundle: async () => bundle,
        environment: {},
        assertOutputVacant: async () => Promise.reject(new Error(secret)),
      },
    ).catch((failure: unknown) => failure)
    expect(error).toBeInstanceOf(PredecessorReviewCommandError)
    expect((error as Error).message).toBe(
      'Predecessor review preparation failed safely.',
    )
    expect((error as Error).message).not.toContain(secret)
    expect((error as Error).message).not.toContain('entity-groups')
  })

  it('classifies atomic failure only after staging cleanup without persistence', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-publication-'))
    try {
      const error = await runPredecessorPreparationStagesForFixture(bundle, {
        fetchEntities: async () => entities(),
        checkEvidenceUrls: async () => undefined,
        publicationDirectoryForFixture: directory,
        beforeAtomicPromotionForFixture: async () => {
          throw new Error('private publication failure')
        },
        log: vi.fn(),
      }).catch((failure: unknown) => failure)
      expect((error as Error).message).toBe(
        'Predecessor review stopped safely: stage=atomic-publication; completed=7; total=8.',
      )
      expect(await readdir(directory)).toEqual([])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('checks tracked contracts without ignored receipt or network access', async () => {
    const fetchEntities = vi.fn()
    const readDiscoveryReceipt = vi.fn(async () => {
      throw new Error('fresh clone has no ignored receipt')
    })
    const assertOutputVacant = vi.fn()
    const log = vi.fn()
    await runPredecessorReviewCommandForFixture(['check'], {
      loadBundle: async () => bundle,
      readDiscoveryReceipt,
      fetchEntities,
      assertOutputVacant,
      environment: { CI: 'true', NODE_ENV: 'test' },
      log,
    })
    expect(readDiscoveryReceipt).not.toHaveBeenCalled()
    expect(fetchEntities).not.toHaveBeenCalled()
    expect(assertOutputVacant).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(
      'Validated the database-free anime-v2 predecessor review contract.',
    )
  })

  it('cannot authorize a structurally valid synthetic receipt', async () => {
    const attemptedLegacyOverride = {
      loadBundle: async () => bundle,
      readDiscoveryReceipt: async () => frozenReceipt,
      environment: {},
      assertOutputVacant: async () => undefined,
      acceptedDiscoveryReceiptSha256: discoverySha256(frozenReceipt),
    }
    await expect(
      runPredecessorReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        attemptedLegacyOverride,
      ),
    ).rejects.toThrow('accepted frozen run')
  })

  it('refuses CI, test, hosted and scheduled live preparation before side effects', async () => {
    for (const environment of [
      { CI: 'true' },
      { NODE_ENV: 'test' },
      { VERCEL: '1' },
      { VERCEL_ENV: 'preview' },
      { GITHUB_ACTIONS: 'true' },
      { ZEDARCHIVE_SCHEDULED_JOB: '1' },
    ])
      expect(() =>
        assertPredecessorReviewRuntimeEnvironment(environment),
      ).toThrow('unavailable')
    const readDiscoveryReceipt = vi.fn()
    const assertOutputVacant = vi.fn()
    const loadBundle = vi.fn(async () => bundle)
    await expect(
      runPredecessorReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        {
          loadBundle,
          environment: { GITHUB_ACTIONS: 'true' },
          readDiscoveryReceipt,
          assertOutputVacant,
        },
      ),
    ).rejects.toThrow('unavailable')
    expect(loadBundle).not.toHaveBeenCalled()
    expect(assertOutputVacant).not.toHaveBeenCalled()
    expect(readDiscoveryReceipt).not.toHaveBeenCalled()
  })

  it('rejects interrupted and unexpected output residue', async () => {
    const stale = await mkdtemp(join(tmpdir(), 'm45-predecessor-stale-'))
    const unexpected = await mkdtemp(
      join(tmpdir(), 'm45-predecessor-unexpected-'),
    )
    try {
      await mkdir(join(stale, '.staging-interrupted'))
      await writeFile(join(unexpected, 'unexpected.json'), '{}')
      await expect(assertPredecessorReviewOutputVacant(stale)).rejects.toThrow(
        'interrupted',
      )
      await expect(
        assertPredecessorReviewOutputVacant(unexpected),
      ).rejects.toThrow('unexpected')
    } finally {
      await rm(stale, { recursive: true, force: true })
      await rm(unexpected, { recursive: true, force: true })
    }
  })

  it('checks the output envelope before receipt and network access', async () => {
    const readDiscoveryReceipt = vi.fn()
    const fetchEntities = vi.fn()
    await expect(
      runPredecessorReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        {
          loadBundle: async () => bundle,
          environment: {},
          assertOutputVacant: async () =>
            Promise.reject(
              new PredecessorReviewCommandError('interrupted output'),
            ),
          readDiscoveryReceipt,
          fetchEntities,
        },
      ),
    ).rejects.toThrow('interrupted output')
    expect(readDiscoveryReceipt).not.toHaveBeenCalled()
    expect(fetchEntities).not.toHaveBeenCalled()
  })

  it('builds non-authoritative artifacts only from the exact 500+1 acquisition', () => {
    const files = buildUnauthoritativePredecessorPreparationArtifacts(
      bundle,
      entities(),
      new Date('2026-07-31T00:00:00.000Z'),
    )
    const source = files['source-receipt.json'] as {
      records: unknown[]
      acquisitionEvidence: {
        actionGroups: unknown[]
        retainedEvidenceUrls: unknown[]
      }
      corroboratingProjection: { qid: string }
      requiredIdentityScopeDisposition: Record<string, unknown>
    }
    expect(source.records).toHaveLength(500)
    expect(source.acquisitionEvidence.actionGroups).toHaveLength(21)
    expect(source.acquisitionEvidence.retainedEvidenceUrls).toHaveLength(89)
    expect(source.corroboratingProjection.qid).toBe('Q114798407')
    expect(source.requiredIdentityScopeDisposition).toMatchObject({
      sourceItemId: 'Q114798266',
      currentState: 'hidden',
      category: 'catalogue_state_identity_scope_hide',
    })
    expect(source.requiredIdentityScopeDisposition).not.toHaveProperty(
      'primaryReview',
    )
    expect(source.requiredIdentityScopeDisposition).not.toHaveProperty(
      'independentReview',
    )
    expect(files['primary-review-input.json']).toMatchObject({
      role: 'primary',
      requiredIdentityScopeDisposition: {
        sourceItemId: 'Q114798266',
      },
    })
    expect(files['independent-review-input.json']).toMatchObject({
      role: 'independent',
      requiredDecision055Evidence: {
        sourceItemId: 'Q114798266',
      },
    })
    expect(files['independent-review-input.json']).not.toHaveProperty(
      'requiredIdentityScopeCorrection',
    )
  })

  it('stops on changed fresh Decision 055 statement evidence', () => {
    const changed = entities()
    const statement = changed.Q114798266!.claims.P31![0] as {
      rank: string
    }
    statement.rank = 'deprecated'
    expect(() =>
      buildUnauthoritativePredecessorPreparationArtifacts(
        bundle,
        changed,
        new Date('2026-07-31T00:00:00.000Z'),
      ),
    ).toThrow('deprecated')
  })

  it('rejects incomplete acquisition before artifact construction', () => {
    expect(() =>
      buildUnauthoritativePredecessorPreparationArtifacts(
        bundle,
        {},
        new Date('2026-07-31T00:00:00.000Z'),
      ),
    ).toThrow('exactly 500 predecessors')
  })

  it('rejects Action responses containing an unrequested entity', async () => {
    const request = vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof URL ? input : new URL(String(input))
      const qids = url.searchParams.get('ids')!.split('|')
      const responseEntities = Object.fromEntries(
        qids.map((qid) => [
          qid,
          {
            id: qid,
            type: 'item',
            labels: {},
            aliases: {},
            claims: {},
          },
        ]),
      )
      responseEntities.Q999999999 = {
        id: 'Q999999999',
        type: 'item',
        labels: {},
        aliases: {},
        claims: {},
      }
      return new Response(JSON.stringify({ entities: responseEntities }), {
        headers: { 'content-type': 'application/json' },
      })
    })
    const requester = new SequentialPredecessorRequester(request)
    await expect(
      fetchPredecessorEntitiesBounded(['Q1'], requester),
    ).rejects.toThrow('exactly its requested QIDs')
  })

  it('shares sequential pacing and retries network errors across request types', async () => {
    let now = 1_000
    let active = 0
    let maximumActive = 0
    const request = vi.fn(async () => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      try {
        if (request.mock.calls.length === 1) throw new TypeError('network')
        return new Response('{}', {
          headers: { 'content-type': 'text/html' },
        })
      } finally {
        active -= 1
      }
    })
    const waits: number[] = []
    const requester = new SequentialPredecessorRequester(request, {
      now: () => now,
      delay: async (milliseconds) => {
        waits.push(milliseconds)
        now += milliseconds
      },
      setTimeout: (() => 1) as unknown as typeof setTimeout,
      clearTimeout: vi.fn() as typeof clearTimeout,
    })
    await requester.fetch(new URL('https://www.wikidata.org/w/api.php'), {})
    await requester.fetch(new URL('https://www.wikidata.org/wiki/Q1'), {})
    expect(request).toHaveBeenCalledTimes(3)
    expect(waits).toEqual([1_000, 350, 350])
    expect(maximumActive).toBe(1)
  })

  it('accepts only an exactly parsed HTML media type', () => {
    expect(isExactHtmlMediaType('text/html')).toBe(true)
    expect(isExactHtmlMediaType(' TEXT/HTML ; charset=UTF-8')).toBe(true)
    expect(isExactHtmlMediaType('text/htmlx')).toBe(false)
    expect(isExactHtmlMediaType('text/html; malformed')).toBe(false)
    expect(isExactHtmlMediaType('not a media type')).toBe(false)
    expect(isExactHtmlMediaType(null)).toBe(false)
  })

  it('accepts a provider Retry-After at the exact cap', async () => {
    let now = 1_000
    const waits: number[] = []
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('{}', {
          status: 503,
          headers: { 'retry-after': '30' },
        }),
      )
      .mockResolvedValueOnce(new Response('{}'))
    const requester = new SequentialPredecessorRequester(request, {
      now: () => now,
      delay: async (milliseconds) => {
        waits.push(milliseconds)
        now += milliseconds
      },
      setTimeout: (() => 1) as unknown as typeof setTimeout,
      clearTimeout: vi.fn() as typeof clearTimeout,
    })
    await requester.fetch(new URL('https://www.wikidata.org/w/api.php'), {})
    expect(waits).toEqual([30_000, 350])
    expect(request).toHaveBeenCalledTimes(2)
  })

  it.each(['later', '-1', '31'])(
    'fails closed for invalid Retry-After %s',
    async (retryAfter) => {
      const request = vi.fn<typeof fetch>(async () =>
        Promise.resolve(
          new Response('{}', {
            status: 429,
            headers: { 'retry-after': retryAfter },
          }),
        ),
      )
      const requester = new SequentialPredecessorRequester(request)
      await expect(
        requester.fetch(new URL('https://www.wikidata.org/w/api.php'), {}),
      ).rejects.toThrow('Retry-After')
      expect(request).toHaveBeenCalledOnce()
    },
  )

  it('aborts a chunked response immediately beyond the body limit', async () => {
    const cancelled = vi.fn()
    const chunks = [
      new Uint8Array(3 * 1024 * 1024),
      new Uint8Array(3 * 1024 * 1024),
      new Uint8Array(1),
    ]
    const request = vi.fn<typeof fetch>(async () => {
      let index = 0
      return new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            const chunk = chunks[index]
            index += 1
            if (chunk === undefined) controller.close()
            else controller.enqueue(chunk)
          },
          cancel: cancelled,
        }),
      )
    })
    const requester = new SequentialPredecessorRequester(request)
    await expect(
      requester.fetch(new URL('https://www.wikidata.org/w/api.php'), {}),
    ).rejects.toThrow('body limit')
    expect((request.mock.calls[0]![1]!.signal as AbortSignal).aborted).toBe(
      true,
    )
    expect(cancelled).toHaveBeenCalledOnce()
  })
})

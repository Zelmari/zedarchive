import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  runContinuityReviewAcquire,
  runContinuityReviewPrepare,
  continuityAcquiredBundleName,
  continuityAcquisitionFilename,
  continuityAcquisitionAggregateFilename,
  continuityEnvelope,
  continuityPreparedBundleName,
  continuityPreparationFilename,
  continuityPrimaryInputFilename,
  continuityIndependentInputFilename,
  continuityReviewRoot,
  safeError,
  type ContinuityReviewClock,
  type ContinuityReviewFilesystem,
  type ContinuityReviewSeams,
} from '@/../scripts/review-anime-v2-continuity'
import {
  createPolicyBaseline,
  createPolicyBaselineCapture,
  createPolicySemanticReviewRetrieval,
  createPolicySemanticReviewRoleResult,
  finalizePolicySemanticReview,
  retrievePolicyBodies,
} from '@/../scripts/m45-policy-baseline'
import type { WikidataEntity } from '@/integrations/wikidata/wikidata-entity'

const repositoryRoot = process.cwd()
const root = `${repositoryRoot}/${continuityReviewRoot}`

function policyUrlFetchBodies(): Readonly<Record<string, Uint8Array>> {
  const urls = [
    'https://www.wikidata.org/wiki/Wikidata:Licensing',
    'https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_API_Usage_Guidelines',
    'https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy',
    'https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/documentation/access-policy.html',
    'https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/reference/page-views.html',
  ]
  return Object.fromEntries(
    urls.map((url, index) => [
      url,
      new TextEncoder().encode(`policy-body-${index}`),
    ]),
  )
}

function policyResponse(
  url: URL,
  bodies: Readonly<Record<string, Uint8Array>>,
): Response {
  const bytes = bodies[url.toString()]
  if (bytes === undefined) throw new Error(`unexpected policy URL ${url}`)
  return new Response(new Uint8Array(bytes).buffer, {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  })
}

function entityStatement(property: 'P155' | 'P156', relatedQid: string) {
  return {
    rank: 'normal',
    mainsnak: {
      snaktype: 'value',
      property,
      datatype: 'wikibase-item',
      datavalue: {
        type: 'wikibase-entityid',
        value: { id: relatedQid, 'entity-type': 'item' },
      },
    },
  }
}

function anchorEntities(
  endpointPerAnchor = 1,
): Readonly<Record<string, WikidataEntity>> {
  const result: Record<string, WikidataEntity> = {}
  for (let index = 0; index < continuityEnvelope.anchors; index += 1) {
    const qid = `Q${index + 1}`
    const related = Array.from(
      { length: endpointPerAnchor },
      (_, relationIndex) =>
        entityStatement('P155', `Q${2_000 + relationIndex}`),
    )
    result[qid] = {
      id: qid,
      type: 'item',
      lastrevid: index + 1,
      labels: {},
      aliases: {},
      claims: { P155: related, P156: [] },
    }
  }
  return result
}

const anchorQids = Array.from(
  { length: continuityEnvelope.anchors },
  (_, index) => `Q${index + 1}`,
)

function apiResponse(
  ids: readonly string[],
  entities: Readonly<Record<string, WikidataEntity>>,
  status = 200,
  headers: Readonly<Record<string, string>> = {},
): Response {
  const selected: Record<string, WikidataEntity> = {}
  for (const id of ids) {
    const entity = entities[`Q${id}`]
    if (entity === undefined) throw new Error(`missing entity Q${id}`)
    selected[`Q${id}`] = entity
  }
  return new Response(JSON.stringify({ entities: selected }), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

async function createSeamsWithBaseline(
  overrides: Partial<
    Readonly<{
      policyBodies: Readonly<Record<string, Uint8Array>>
      baselineBodies: Readonly<Record<string, Uint8Array>>
      apiHandler: (url: URL, group: number) => Promise<Response>
      baselineRetrievedAt: string
      clock: ContinuityReviewClock
    }>
  > = {},
): Promise<
  Readonly<{
    seams: ContinuityReviewSeams
    baselineSha256: string
    markPresent: (path: string) => void
    files: Map<string, Buffer>
  }>
> {
  const policyBodies = overrides.policyBodies ?? policyUrlFetchBodies()
  const baselineBodies = overrides.baselineBodies ?? policyBodies
  const now = () => new Date('2026-08-13T00:00:00.000Z')
  const retrieval = await retrievePolicyBodies({
    fetch: async (url) => policyResponse(url, baselineBodies),
    completedAt: now,
  })
  const retrievalWithTime = {
    ...retrieval.capture,
    retrievedAt: overrides.baselineRetrievedAt ?? retrieval.capture.retrievedAt,
  }
  const capture = createPolicyBaselineCapture(retrievalWithTime)
  const retrievalCore = { ...retrievalWithTime }
  delete (retrievalCore as Record<string, unknown>).schema
  delete (retrievalCore as Record<string, unknown>).version
  delete (retrievalCore as Record<string, unknown>).captureSha256
  const reviewRetrieval = createPolicySemanticReviewRetrieval(retrievalCore)
  const roleResult = createPolicySemanticReviewRoleResult(
    JSON.stringify({
      captureSha256: capture.captureSha256,
      outcome: 'no-material-change',
      reviewerContractSha256:
        '33761c81728e17b86e04605679c6dc6f2f0a7bcc3022c2b332021f059be43cee',
      schema: 'wikimedia-policy-semantic-review-role-output.v1',
      semanticReviewRetrievalSha256:
        reviewRetrieval.semanticReviewRetrievalSha256,
      version: 1,
    }),
  )
  const semanticReview = await finalizePolicySemanticReview({
    capture,
    retrieval: reviewRetrieval,
    roleResult,
    now: now(),
  })
  const baseline = await createPolicyBaseline({
    capture,
    retrieval: reviewRetrieval,
    semanticReview,
    now: now(),
  })
  const entities = anchorEntities()
  const apiCalls: string[] = []
  const lstatOverrides = new Map<string, boolean>()
  const files = new Map<string, Buffer>([
    [
      `${repositoryRoot}/scripts/policy-baseline-review/wikimedia-policy-baseline.v1.json`,
      Buffer.from(`${JSON.stringify(baseline)}\n`, 'utf8'),
    ],
  ])
  const filesystem: ContinuityReviewFilesystem = {
    readFile: async (path) => {
      const value = files.get(path)
      if (value === undefined) throw safeError('test', 'unknown-path')
      return value
    },
    lstat: async (path) => {
      if (lstatOverrides.get(path) === true) {
        const stat = {
          isDirectory: () => true,
          isFile: () => false,
          isSymbolicLink: () => false,
          uid: 501,
          ino: 1,
          nlink: 2,
          dev: 9,
          mode: 0o700,
          size: 64,
        }
        return stat
      }
      const error = new Error('ENOENT') as NodeJS.ErrnoException
      error.code = 'ENOENT'
      throw error
    },
    readdir: async (path) => {
      if (path === root) return []
      const error = new Error('ENOENT') as NodeJS.ErrnoException
      error.code = 'ENOENT'
      void path
      throw error
    },
    mkdir: async (path) => {
      files.set(path, Buffer.alloc(0))
    },
    writeFile: async (path, value) => {
      files.set(path, Buffer.from(value))
    },
    link: async (source, destination) => {
      const value = files.get(source)
      if (value === undefined) throw safeError('test', 'unknown-path')
      files.set(destination, value)
    },
    unlink: async (path) => {
      files.delete(path)
    },
    rmdir: async (path) => {
      files.delete(path)
    },
  }
  let group = 0
  const apiHandler =
    overrides.apiHandler ??
    (async (url: URL, ordinal: number) => {
      const ids = url.searchParams.get('ids')!.split('|')
      group = ordinal
      return apiResponse(ids, entities)
    })
  const fetchImpl: typeof fetch = async (input) => {
    const url = input instanceof URL ? input : new URL(String(input))
    if (
      url.toString().includes('wikidata.org') ||
      url.toString().includes('foundation.wikimedia.org') ||
      url.toString().includes('doc.wikimedia.org')
    ) {
      if (url.searchParams.has('action')) {
        apiCalls.push(url.toString())
        return apiHandler(url, group)
      }
      return policyResponse(url, policyBodies)
    }
    return policyResponse(url, policyBodies)
  }
  const clock: ContinuityReviewClock = overrides.clock ?? {
    now: () => 1_800_000_000_000,
    delay: async () => undefined,
    setTimeout: (() => 0) as unknown as typeof setTimeout,
    clearTimeout: () => undefined,
  }
  return {
    seams: {
      filesystem,
      fetch: fetchImpl,
      clock,
      completedAt: now,
      anchorQidsOverride: anchorQids,
    },
    baselineSha256: baseline.baselineSha256,
    markPresent: (path: string) => {
      lstatOverrides.set(path, true)
    },
    files,
  }
}

describe('M45-07 continuity acquisition runner', () => {
  it('runs the preflight, acquires ten groups of 25, and promotes the bundle', async () => {
    const { seams, baselineSha256 } = await createSeamsWithBaseline()
    const result = await runContinuityReviewAcquire(seams)
    expect(result.status).toBe('complete')
    expect(result.anchorCount).toBe(250)
    expect(result.groupCount).toBe(10)
    expect(result.policyBaselineSha256).toBe(baselineSha256)
    expect(result.acquisitionSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(result)).not.toContain('Q')
  })

  it('stops before any Action API request when preflight bytes drift', async () => {
    const original = policyUrlFetchBodies()
    const drifted = { ...original }
    drifted['https://www.wikidata.org/wiki/Wikidata:Licensing'] =
      new TextEncoder().encode('changed-policy-body')
    let apiRequests = 0
    const { seams } = await createSeamsWithBaseline({
      policyBodies: drifted,
      baselineBodies: original,
      apiHandler: async () => {
        apiRequests += 1
        return apiResponse(['1'], anchorEntities())
      },
    })
    await expect(runContinuityReviewAcquire(seams)).rejects.toThrow(
      /policy-drift/,
    )
    expect(apiRequests).toBe(0)
  })

  it('stops when the preflight age exceeds 24 hours', async () => {
    const { seams } = await createSeamsWithBaseline({
      baselineRetrievedAt: '2026-08-11T00:00:00.000Z',
    })
    await expect(runContinuityReviewAcquire(seams)).rejects.toThrow(
      /policy-age/,
    )
  })

  it('retries 429 with Retry-After, then succeeds', async () => {
    const entities = anchorEntities()
    let calls = 0
    const { seams } = await createSeamsWithBaseline({
      apiHandler: async (url: URL) => {
        calls += 1
        const ids = url.searchParams.get('ids')!.split('|')
        if (calls === 1)
          return apiResponse(ids, entities, 429, { 'retry-after': '1' })
        return apiResponse(ids, entities)
      },
    })
    const result = await runContinuityReviewAcquire(seams)
    expect(result.status).toBe('complete')
    expect(calls).toBe(11)
  })

  it('stops closed after three failed attempts on one group', async () => {
    const entities = anchorEntities()
    let calls = 0
    const { seams } = await createSeamsWithBaseline({
      apiHandler: async (url: URL) => {
        calls += 1
        return apiResponse(
          url.searchParams.get('ids')!.split('|'),
          entities,
          500,
        )
      },
    })
    await expect(runContinuityReviewAcquire(seams)).rejects.toThrow(
      /retry-exhausted/,
    )
    expect(calls).toBe(3)
  })

  it('stops closed on a non-retryable HTTP status', async () => {
    const entities = anchorEntities()
    const { seams } = await createSeamsWithBaseline({
      apiHandler: async (url: URL) =>
        apiResponse(url.searchParams.get('ids')!.split('|'), entities, 400),
    })
    await expect(runContinuityReviewAcquire(seams)).rejects.toThrow(
      /http-status/,
    )
  })

  it('stops on a per-group body over 4 MiB', async () => {
    const entities = anchorEntities()
    const { seams } = await createSeamsWithBaseline({
      apiHandler: async (url: URL) => {
        const ids = url.searchParams.get('ids')!.split('|')
        const selected: Record<string, WikidataEntity> = {}
        for (const id of ids) {
          const entity = entities[`Q${id}`]!
          selected[`Q${id}`] = {
            ...entity,
            labels: {
              en: { language: 'en', value: 'x'.repeat(4 * 1024 * 1024) },
            },
          }
        }
        return new Response(JSON.stringify({ entities: selected }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    })
    await expect(runContinuityReviewAcquire(seams)).rejects.toThrow(
      /body-limit/,
    )
  })

  it('stops when the clock passes the 45-minute wall ceiling', async () => {
    const entities = anchorEntities()
    const startedAt = 1_800_000_000_000
    let calls = 0
    const { seams } = await createSeamsWithBaseline({
      apiHandler: async (url: URL) =>
        apiResponse(url.searchParams.get('ids')!.split('|'), entities),
      clock: {
        now: () =>
          startedAt +
          (calls++ > 1 ? continuityEnvelope.maximumElapsedMilliseconds + 1 : 0),
        delay: async () => undefined,
        setTimeout: (() => 0) as unknown as typeof setTimeout,
        clearTimeout: () => undefined,
      },
    })
    await expect(runContinuityReviewAcquire(seams)).rejects.toThrow(/wall-time/)
  })

  it('leaves no promoted bundle when the acquisition fails mid-run', async () => {
    const entities = anchorEntities()
    const { seams } = await createSeamsWithBaseline({
      apiHandler: async (url: URL) => {
        const ids = url.searchParams.get('ids')!.split('|')
        const selected: Record<string, WikidataEntity> = {}
        for (const id of ids) {
          const entity = entities[`Q${id}`]!
          selected[`Q${id}`] = { ...entity, type: 'not-item' }
        }
        return new Response(JSON.stringify({ entities: selected }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    })
    await expect(runContinuityReviewAcquire(seams)).rejects.toThrow(
      /entity-shape/,
    )
    await expect(
      seams.filesystem.readFile(
        `${root}/${continuityAcquiredBundleName}/${continuityAcquisitionFilename}`,
      ),
    ).rejects.toThrow()
  })

  it('promotes exactly the acquisition and aggregate files', async () => {
    const { seams } = await createSeamsWithBaseline()
    await runContinuityReviewAcquire(seams)
    const acquiredDir = `${root}/${continuityAcquiredBundleName}`
    const acquisition = await seams.filesystem.readFile(
      `${acquiredDir}/${continuityAcquisitionFilename}`,
    )
    const aggregate = await seams.filesystem.readFile(
      `${acquiredDir}/${continuityAcquisitionAggregateFilename}`,
    )
    expect(acquisition.length).toBeGreaterThan(0)
    expect(aggregate.length).toBeGreaterThan(0)
    const parsed = JSON.parse(aggregate.toString('utf8'))
    expect(parsed.anchorCount).toBe(250)
    expect(parsed.groupCount).toBe(10)
    expect(parsed.preflightEquality).toBe(true)
    expect(parsed.preflightAgeWithinWindow).toBe(true)
    expect(JSON.stringify(parsed)).not.toContain('Q')
  })

  it('retries a maxlag error body like a retryable status', async () => {
    const entities = anchorEntities()
    let calls = 0
    const { seams } = await createSeamsWithBaseline({
      apiHandler: async (url: URL) => {
        calls += 1
        const ids = url.searchParams.get('ids')!.split('|')
        if (calls === 1)
          return new Response(JSON.stringify({ error: { code: 'maxlag' } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        return apiResponse(ids, entities)
      },
    })
    const result = await runContinuityReviewAcquire(seams)
    expect(result.status).toBe('complete')
    expect(calls).toBe(11)
  })

  it('stops before any network activity when a custody root is present', async () => {
    const entities = anchorEntities()
    let apiRequests = 0
    const { seams, markPresent } = await createSeamsWithBaseline({
      apiHandler: async (url: URL) => {
        apiRequests += 1
        return apiResponse(url.searchParams.get('ids')!.split('|'), entities)
      },
    })
    markPresent(`${repositoryRoot}/.local/m45/identity-allocation`)
    await expect(runContinuityReviewAcquire(seams)).rejects.toThrow(/custody/)
    expect(apiRequests).toBe(0)
  })

  it('stops before any network activity when the acquired bundle exists', async () => {
    const entities = anchorEntities()
    let apiRequests = 0
    const { seams, markPresent } = await createSeamsWithBaseline({
      apiHandler: async (url: URL) => {
        apiRequests += 1
        return apiResponse(url.searchParams.get('ids')!.split('|'), entities)
      },
    })
    markPresent(`${root}/${continuityAcquiredBundleName}`)
    await expect(runContinuityReviewAcquire(seams)).rejects.toThrow(/no-resume/)
    expect(apiRequests).toBe(0)
  })

  it('enforces the per-group 4 MiB cumulative cap across retry attempts', async () => {
    let calls = 0
    const { seams } = await createSeamsWithBaseline({
      apiHandler: async () => {
        calls += 1
        const payload =
          calls === 1
            ? 'x'.repeat(Math.round(2.5 * 1024 * 1024))
            : 'y'.repeat(Math.round(2.5 * 1024 * 1024))
        return new Response(payload, {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'retry-after': '0',
          },
        })
      },
    })
    await expect(runContinuityReviewAcquire(seams)).rejects.toThrow(
      /body-limit/,
    )
    expect(calls).toBe(2)
  })

  it('caps a valid Retry-After above 30 seconds at 30 seconds', async () => {
    const entities = anchorEntities()
    let calls = 0
    const delays: number[] = []
    const { seams } = await createSeamsWithBaseline({
      apiHandler: async (url: URL) => {
        calls += 1
        const ids = url.searchParams.get('ids')!.split('|')
        if (calls === 1)
          return apiResponse(ids, entities, 429, { 'retry-after': '60' })
        return apiResponse(ids, entities)
      },
      clock: {
        now: () => 1_800_000_000_000,
        delay: async (milliseconds) => {
          delays.push(milliseconds)
        },
        setTimeout: (() => 0) as unknown as typeof setTimeout,
        clearTimeout: () => undefined,
      },
    })
    const result = await runContinuityReviewAcquire(seams)
    expect(result.status).toBe('complete')
    expect(Math.max(...delays)).toBe(30_000)
  })

  it('prepare builds the authenticated preparation and role inputs', async () => {
    const receiptBytes = await readFile(
      join(
        repositoryRoot,
        '.local/m45/discovery/frozen-run/candidate-receipt.json',
      ),
    ).catch(() => null)
    if (receiptBytes === null) return
    const authorityBytes = await readFile(
      join(
        repositoryRoot,
        '.local/m45/candidate-review/finalized/authority.json',
      ),
    )
    const primaryBytes = await readFile(
      join(
        repositoryRoot,
        '.local/m45/candidate-review/finalized/primary-candidate-review.json',
      ),
    )
    const predecessorBytes = await readFile(
      join(
        repositoryRoot,
        '.local/m45/predecessor-review/finalized/predecessor-review-result.json',
      ),
    )
    const files = new Map<string, Buffer>([
      [
        join(
          repositoryRoot,
          '.local/m45/discovery/frozen-run/candidate-receipt.json',
        ),
        receiptBytes,
      ],
      [
        join(
          repositoryRoot,
          '.local/m45/candidate-review/finalized/authority.json',
        ),
        authorityBytes,
      ],
      [
        join(
          repositoryRoot,
          '.local/m45/candidate-review/finalized/primary-candidate-review.json',
        ),
        primaryBytes,
      ],
      [
        join(
          repositoryRoot,
          '.local/m45/predecessor-review/finalized/predecessor-review-result.json',
        ),
        predecessorBytes,
      ],
    ])
    const filesystem: ContinuityReviewFilesystem = {
      readFile: async (path) => {
        const value = files.get(path)
        if (value === undefined) {
          const error = new Error('ENOENT') as NodeJS.ErrnoException
          error.code = 'ENOENT'
          throw error
        }
        return value
      },
      lstat: async () => {
        const error = new Error('ENOENT') as NodeJS.ErrnoException
        error.code = 'ENOENT'
        throw error
      },
      readdir: async () => [],
      mkdir: async (path) => {
        files.set(path, Buffer.alloc(0))
      },
      writeFile: async (path, value) => {
        files.set(path, Buffer.from(value))
      },
      link: async (source, destination) => {
        const value = files.get(source)
        if (value === undefined) throw safeError('test', 'unknown-path')
        files.set(destination, value)
      },
      unlink: async (path) => {
        files.delete(path)
      },
      rmdir: async (path) => {
        files.delete(path)
      },
    }
    const { seams, files: baselineFiles } = await createSeamsWithBaseline()
    const combinedFilesystem = {
      ...filesystem,
      readFile: async (path: string) => {
        if (files.has(path)) return files.get(path)!
        const baseline = baselineFiles.get(path)
        if (baseline !== undefined) return baseline
        const error = new Error('ENOENT') as NodeJS.ErrnoException
        error.code = 'ENOENT'
        throw error
      },
    }
    const combined: ContinuityReviewSeams = {
      ...seams,
      anchorQidsOverride: undefined,
      filesystem: combinedFilesystem,
      fetch: async (input) => {
        const url = input instanceof URL ? input : new URL(String(input))
        if (url.searchParams.has('action')) {
          const ids = url.searchParams.get('ids')!.split('|')
          const selected: Record<string, WikidataEntity> = {}
          for (const id of ids) {
            selected[`Q${id}`] = {
              id: `Q${id}`,
              type: 'item',
              lastrevid: Number(id),
              labels: {},
              aliases: {},
              claims: { P155: [], P156: [] },
            }
          }
          return new Response(JSON.stringify({ entities: selected }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return policyResponse(url, policyUrlFetchBodies())
      },
    }
    await runContinuityReviewAcquire(combined)
    const result = await runContinuityReviewPrepare(combined)
    expect(result.status).toBe('complete')
    expect(result.anchorCount).toBe(250)
    expect(result.preparationSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(result.pairCount).toBe(0)
    const preparedDir = `${root}/${continuityPreparedBundleName}`
    const preparation = await combined.filesystem.readFile(
      `${preparedDir}/${continuityPreparationFilename}`,
    )
    const primaryInput = await combined.filesystem.readFile(
      `${preparedDir}/${continuityPrimaryInputFilename}`,
    )
    const independentInput = await combined.filesystem.readFile(
      `${preparedDir}/${continuityIndependentInputFilename}`,
    )
    expect(preparation.length).toBeGreaterThan(0)
    expect(primaryInput.length).toBeGreaterThan(0)
    expect(independentInput.length).toBeGreaterThan(0)
  }, 60_000)
})

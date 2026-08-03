import { createHash, randomUUID } from 'node:crypto'
import {
  mkdir,
  link,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { z } from '@/config/zod'
import {
  normalizedAnimeReleaseItemSha256,
  sha256Canonical,
  validateAnimeReleaseBundle,
  type AnimeReleaseBundle,
} from '@/features/anime/catalogue/anime-release-corpus'
import {
  acceptedDiscoveryCandidateReceiptSha256,
  acceptedPredecessorV1FileSha256,
  acceptedPredecessorIdentityProjection,
  assertAcceptedPredecessorV1Bundle,
  assertAcceptedIdentityProjection,
  createIdentityScopeDisposition,
  createPendingPredecessorRoleReviewDraft,
  createPredecessorReReviewDocket,
  predecessorReReviewDocketSchema,
  predecessorReReviewGateSchema,
  reconcilePredecessorRoleReviews,
  reductionFailureCategoryFromError,
  validatePredecessorRoleReviewResult,
  validatePredecessorReReviewDocket,
  predecessorPreparationSchema,
  reconstructPredecessorIdentityProjection,
  reducePredecessorEntity,
} from '@/features/anime/catalogue/anime-successor-predecessor-review'
import {
  canonicalJson,
  discoverySha256,
} from '@/features/anime/catalogue/wikidata-anime-discovery'
import {
  wikidataApiEndpoint,
  wikidataImporterUserAgent,
} from '@/integrations/wikidata/wikidata-constants'
import {
  parseWikidataEntityResponse,
  wikidataQidSchema,
  type WikidataEntity,
} from '@/integrations/wikidata/wikidata-entity'

const root = fileURLToPath(new URL('../', import.meta.url))
const outputDirectory = join(root, '.local/m45/predecessor-review')
const discoveryReceiptPath = join(
  root,
  '.local/m45/discovery/frozen-run/candidate-receipt.json',
)
const bundlePaths = {
  corpus: join(root, 'data/releases/anime-catalogue.v1.json'),
  reviewLedger: join(root, 'data/releases/anime-catalogue.v1.review.json'),
  index: join(root, 'data/releases/anime-catalogue.v1.index.json'),
  manifests: Array.from({ length: 20 }, (_, index) =>
    join(
      root,
      `data/imports/releases/anime-v1/batch-${String(index + 1).padStart(2, '0')}.json`,
    ),
  ),
}
const usage =
  'Usage: review-anime-v2-predecessors <check|prepare --confirm-wikimedia-live|draft <primary|independent> [round]|lock <primary|independent> <completed-result.json> [round]|reconcile [round]>'
const maximumBodyBytes = 5 * 1024 * 1024
const maximumRequestAttempts = 330
export { acceptedDiscoveryCandidateReceiptSha256 }

export class PredecessorReviewCommandError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PredecessorReviewCommandError'
  }
}

export function parsePredecessorReviewArguments(args: readonly string[]) {
  if (args.length === 1 && args[0] === 'check')
    return { mode: 'check' as const }
  if (
    args.length === 2 &&
    args[0] === 'prepare' &&
    args[1] === '--confirm-wikimedia-live'
  )
    return { mode: 'prepare' as const }
  if (
    (args.length === 2 || args.length === 3) &&
    args[0] === 'draft' &&
    (args[1] === 'primary' || args[1] === 'independent') &&
    (args[2] === undefined || /^[1-9][0-9]*$/.test(args[2]))
  )
    return {
      mode: 'draft' as const,
      role: args[1],
      round: Number(args[2] ?? 1),
    }
  if (
    (args.length === 3 || args.length === 4) &&
    args[0] === 'lock' &&
    (args[1] === 'primary' || args[1] === 'independent') &&
    (args[3] === undefined || /^[1-9][0-9]*$/.test(args[3]))
  )
    return {
      mode: 'lock' as const,
      role: args[1],
      completedPath: args[2],
      round: Number(args[3] ?? 1),
    }
  if (
    (args.length === 1 || args.length === 2) &&
    args[0] === 'reconcile' &&
    (args[1] === undefined || /^[1-9][0-9]*$/.test(args[1]))
  )
    return { mode: 'reconcile' as const, round: Number(args[1] ?? 1) }
  throw new PredecessorReviewCommandError(usage)
}

const shaSchema = z.string().regex(/^[a-f0-9]{64}$/)
const candidateSchema = z.strictObject({
  qid: wikidataQidSchema,
  format: z.enum(['tv', 'movie', 'ova', 'ona', 'special']),
  releaseYear: z.number().int().nullable(),
  era: z.enum([
    'before-1980',
    '1980-1989',
    '1990-1999',
    '2000-2009',
    '2010-2019',
    '2020-2026',
    'unknown',
    'after-2026',
  ]),
  englishArticle: z.string().nullable(),
  japaneseArticle: z.string().nullable(),
  englishTotal: z.number().int().nonnegative().nullable(),
  japaneseTotal: z.number().int().nonnegative().nullable(),
  englishBand: z.enum([
    'top-1-percent',
    'top-5-percent',
    'top-20-percent',
    'remainder',
    'unavailable',
  ]),
  japaneseBand: z.enum([
    'top-1-percent',
    'top-5-percent',
    'top-20-percent',
    'remainder',
    'unavailable',
  ]),
  sitelinkCount: z.number().int().nonnegative(),
  sitelinkBand: z.enum(['50-plus', '20-to-49', '5-to-19', '0-to-4']),
  englishMappingInputSha256: shaSchema,
  japaneseMappingInputSha256: shaSchema,
})
const candidateReceiptSchema = z.strictObject({
  schema: z.literal('zedarchive.anime-discovery-candidate-receipt'),
  version: z.literal(1),
  release: z.literal('anime-v2'),
  executedAt: z.iso.datetime(),
  window: z.strictObject({
    start: z.literal('2025-07-01T00:00:00Z'),
    end: z.literal('2026-06-30T23:59:59Z'),
  }),
  specificationHashes: z.strictObject({
    query: shaSchema,
    mapping: shaSchema,
    aggregation: shaSchema,
    bands: shaSchema,
    ordering: shaSchema,
    reasonCodes: shaSchema,
  }),
  providerResponseSetSha256: shaSchema,
  requestEvidence: z.strictObject({
    attempts: z.number().int(),
    successfulPageviews: z.number().int(),
    retries: z.number().int(),
    pacingWaits: z.number().int(),
    pacingDelayMilliseconds: z.number().int(),
    elapsedMilliseconds: z.number().int(),
    maximumConcurrency: z.literal(1),
  }),
  identityBlocked: z.array(
    z.strictObject({
      qid: wikidataQidSchema,
      disposition: z.literal('identity-blocked'),
      dispositionSha256: shaSchema,
    }),
  ),
  candidates: z.array(candidateSchema).min(6_000).max(9_000),
})

type FixtureDependencies = Readonly<{
  loadBundle?: () => Promise<AnimeReleaseBundle>
  readDiscoveryReceipt?: () => Promise<unknown>
  fetchEntities?: (
    qids: readonly string[],
    afterGroup?: () => void,
  ) => Promise<Record<string, WikidataEntity>>
  checkEvidenceUrls?: (
    urls: readonly string[],
    afterUrl?: () => void,
  ) => Promise<void>
  requester?: SequentialPredecessorRequester
  environment?: Readonly<Record<string, string | undefined>>
  assertOutputVacant?: () => Promise<void>
  publish?: (files: Readonly<Record<string, unknown>>) => Promise<string>
  publicationDirectoryForFixture?: string
  beforeAtomicPromotionForFixture?: (destination: string) => Promise<void>
  now?: () => Date
  log?: (message: string) => void
}>

const predecessorTerminalStageTotals = {
  'entity-groups': 21,
  'evidence-urls': 89,
  'identity-projection': 1,
  'predecessor-projections': 500,
  'preparation-validation': 1,
  'atomic-publication': 8,
} as const
type PredecessorTerminalStage = keyof typeof predecessorTerminalStageTotals
type PredecessorTerminalDiagnostic = {
  stage: PredecessorTerminalStage
  completed: number
  total: number
  active: boolean
}

function createPredecessorTerminalDiagnostic(): PredecessorTerminalDiagnostic {
  return {
    stage: 'entity-groups',
    completed: 0,
    total: predecessorTerminalStageTotals['entity-groups'],
    active: false,
  }
}

function beginPredecessorTerminalStage(
  diagnostic: PredecessorTerminalDiagnostic,
  stage: PredecessorTerminalStage,
): void {
  diagnostic.stage = stage
  diagnostic.completed = 0
  diagnostic.total = predecessorTerminalStageTotals[stage]
  diagnostic.active = true
}

function completePredecessorTerminalStep(
  diagnostic: PredecessorTerminalDiagnostic,
): void {
  if (diagnostic.completed >= diagnostic.total)
    throw new Error('Predecessor terminal diagnostic overflowed.')
  diagnostic.completed += 1
}

function classifyPredecessorTerminalFailure(
  error: unknown,
  diagnostic: PredecessorTerminalDiagnostic,
): Error {
  if (error instanceof PredecessorReviewCommandError) return error
  if (!diagnostic.active)
    return new PredecessorReviewCommandError(
      'Predecessor review preparation failed safely.',
    )
  const category =
    diagnostic.stage === 'predecessor-projections'
      ? terminalPredecessorReductionCategory(error)
      : undefined
  return new PredecessorReviewCommandError(
    `Predecessor review stopped safely: stage=${diagnostic.stage}; completed=${diagnostic.completed}; total=${diagnostic.total}${category ? `; category=${category}` : ''}.`,
  )
}

function terminalPredecessorReductionCategory(
  error: unknown,
): ReturnType<typeof reductionFailureCategoryFromError> | undefined {
  return reductionFailureCategoryFromError(error)
}

type RawPredecessorV1Files = Readonly<{
  corpus: string
  reviewLedger: string
  index: string
}>

export function assertAcceptedPredecessorV1RawFiles(
  contents: RawPredecessorV1Files,
): Pick<AnimeReleaseBundle, 'corpus' | 'reviewLedger' | 'index'> {
  const rawSha256 = (value: string) =>
    createHash('sha256').update(value).digest('hex')
  if (
    rawSha256(contents.corpus) !== acceptedPredecessorV1FileSha256.corpus.raw ||
    rawSha256(contents.reviewLedger) !==
      acceptedPredecessorV1FileSha256.reviewLedger.raw ||
    rawSha256(contents.index) !== acceptedPredecessorV1FileSha256.index.raw
  )
    throw new PredecessorReviewCommandError(
      'The tracked release-v1 files do not match the accepted raw digests.',
    )

  const parsed = {
    corpus: JSON.parse(contents.corpus) as AnimeReleaseBundle['corpus'],
    reviewLedger: JSON.parse(
      contents.reviewLedger,
    ) as AnimeReleaseBundle['reviewLedger'],
    index: JSON.parse(contents.index) as AnimeReleaseBundle['index'],
  }
  assertAcceptedPredecessorV1Bundle(
    parsed.corpus,
    parsed.reviewLedger,
    parsed.index,
  )
  return parsed
}

async function loadAcceptedPredecessorV1Bundle(): Promise<AnimeReleaseBundle> {
  const [corpus, reviewLedger, index, manifests] = await Promise.all([
    readFile(bundlePaths.corpus, 'utf8'),
    readFile(bundlePaths.reviewLedger, 'utf8'),
    readFile(bundlePaths.index, 'utf8'),
    Promise.all(bundlePaths.manifests.map((path) => readFile(path, 'utf8'))),
  ])
  const accepted = assertAcceptedPredecessorV1RawFiles({
    corpus,
    reviewLedger,
    index,
  })
  return validateAnimeReleaseBundle({
    ...accepted,
    manifests: manifests.map(
      (contents) => JSON.parse(contents) as AnimeReleaseBundle['manifests'][0],
    ),
  })
}

export function assertPredecessorReviewRuntimeEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): void {
  if (
    environment.CI !== undefined ||
    environment.NODE_ENV === 'test' ||
    environment.VERCEL !== undefined ||
    environment.VERCEL_ENV !== undefined ||
    environment.GITHUB_ACTIONS !== undefined ||
    environment.ZEDARCHIVE_SCHEDULED_JOB !== undefined
  )
    throw new PredecessorReviewCommandError(
      'Live predecessor review is unavailable in this execution environment.',
    )
}

type RequestClock = Readonly<{
  now: () => number
  delay: (milliseconds: number) => Promise<void>
  setTimeout: typeof setTimeout
  clearTimeout: typeof clearTimeout
}>

type PredecessorResponse = Readonly<{
  status: number
  ok: boolean
  headers: Headers
  bytes: Uint8Array
}>

function parseRetryAfter(value: string | null, now: number): number | null {
  if (value === null) return null
  const seconds = Number(value)
  const milliseconds = Number.isFinite(seconds)
    ? seconds * 1_000
    : Date.parse(value) - now
  if (
    !Number.isFinite(milliseconds) ||
    milliseconds < 0 ||
    milliseconds > 30_000
  )
    throw new PredecessorReviewCommandError(
      'Provider Retry-After exceeds the bounded retry policy.',
    )
  return milliseconds
}

async function readBoundedResponseBody(
  response: Response,
  controller: AbortController,
): Promise<Uint8Array> {
  if (response.body === null) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maximumBodyBytes) {
        controller.abort()
        await reader.cancel().catch(() => undefined)
        throw new PredecessorReviewCommandError(
          'A predecessor response exceeded its body limit.',
        )
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export class SequentialPredecessorRequester {
  private activeRequests = 0
  private attempts = 0
  private previousCompletion = 0

  constructor(
    private readonly request: typeof fetch = fetch,
    private readonly clock: RequestClock = {
      now: Date.now,
      delay: (milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)),
      setTimeout,
      clearTimeout,
    },
  ) {}

  async fetch(url: URL, init: RequestInit): Promise<PredecessorResponse> {
    for (let retry = 0; retry < 3; retry += 1) {
      if (this.attempts >= maximumRequestAttempts)
        throw new PredecessorReviewCommandError(
          'Predecessor acquisition exceeded its total attempt limit.',
        )
      const elapsed = this.clock.now() - this.previousCompletion
      if (this.previousCompletion !== 0 && elapsed < 350)
        await this.clock.delay(350 - elapsed)
      if (this.activeRequests !== 0)
        throw new PredecessorReviewCommandError(
          'Predecessor acquisition exceeded concurrency one.',
        )
      this.activeRequests += 1
      this.attempts += 1
      const controller = new AbortController()
      const timeout = this.clock.setTimeout(() => controller.abort(), 10_000)
      try {
        const response = await this.request(url, {
          ...init,
          redirect: 'error',
          signal: controller.signal,
        })
        const declared = Number(response.headers.get('content-length'))
        if (Number.isFinite(declared) && declared > maximumBodyBytes) {
          controller.abort()
          throw new PredecessorReviewCommandError(
            'A predecessor response exceeded its body limit.',
          )
        }
        const bytes = await readBoundedResponseBody(response, controller)
        if ([429, 503].includes(response.status) && retry < 2) {
          await this.clock.delay(
            parseRetryAfter(
              response.headers.get('retry-after'),
              this.clock.now(),
            ) ?? 1_000 * 2 ** retry,
          )
          continue
        }
        return {
          status: response.status,
          ok: response.ok,
          headers: response.headers,
          bytes,
        }
      } catch (error) {
        if (error instanceof PredecessorReviewCommandError) throw error
        if (retry === 2)
          throw new PredecessorReviewCommandError(
            'Predecessor acquisition exhausted its retry budget.',
          )
        await this.clock.delay(Math.min(30_000, 1_000 * 2 ** retry))
      } finally {
        this.clock.clearTimeout(timeout)
        this.activeRequests -= 1
        this.previousCompletion = this.clock.now()
      }
    }
    throw new PredecessorReviewCommandError(
      'Predecessor acquisition exhausted its retry budget.',
    )
  }
}

export async function assertPredecessorReviewOutputVacant(
  directory = outputDirectory,
): Promise<void> {
  try {
    const entries = await readdir(directory)
    if (entries.length > 0)
      throw new PredecessorReviewCommandError(
        'Predecessor review output contains a prior, interrupted, or unexpected entry; no resume or overwrite is allowed.',
      )
  } catch (error) {
    if (
      error instanceof PredecessorReviewCommandError ||
      (error as NodeJS.ErrnoException).code !== 'ENOENT'
    )
      throw error
  }
}

export async function fetchPredecessorEntitiesBounded(
  qids: readonly string[],
  requester: SequentialPredecessorRequester,
): Promise<Record<string, WikidataEntity>> {
  return fetchPredecessorEntitiesBoundedWithProgress(qids, requester)
}

async function fetchPredecessorEntitiesBoundedWithProgress(
  qids: readonly string[],
  requester: SequentialPredecessorRequester,
  afterGroup?: () => void,
): Promise<Record<string, WikidataEntity>> {
  const result: Record<string, WikidataEntity> = {}
  for (let offset = 0; offset < qids.length; offset += 25) {
    const group = qids.slice(offset, offset + 25)
    const url = new URL(wikidataApiEndpoint)
    url.search = new URLSearchParams({
      action: 'wbgetentities',
      ids: group.join('|'),
      props: 'labels|aliases|claims|info',
      languages: 'en|ja-latn',
      format: 'json',
      formatversion: '2',
      maxlag: '10',
    }).toString()
    const response = await requester.fetch(url, {
      headers: {
        'User-Agent': wikidataImporterUserAgent,
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
      },
    })
    if (!response.ok)
      throw new PredecessorReviewCommandError(
        'Wikidata predecessor request failed within its bounded policy.',
      )
    const parsed = parseWikidataEntityResponse(
      JSON.parse(new TextDecoder().decode(response.bytes)) as unknown,
    )
    const returnedQids = Object.keys(parsed.entities).sort()
    const requestedQids = [...group].sort()
    if (JSON.stringify(returnedQids) !== JSON.stringify(requestedQids))
      throw new PredecessorReviewCommandError(
        'Wikidata predecessor response did not contain exactly its requested QIDs.',
      )
    for (const qid of group) {
      const entity = parsed.entities[qid]
      if (entity === undefined || entity.id !== qid)
        throw new PredecessorReviewCommandError(
          'Wikidata predecessor response did not map exactly to its requested QIDs.',
        )
      result[qid] = entity
    }
    afterGroup?.()
  }
  return result
}

function buildActionAcquisitionEvidence(
  qids: readonly string[],
  entities: Readonly<Record<string, WikidataEntity>>,
) {
  return Array.from({ length: Math.ceil(qids.length / 25) }, (_, index) => {
    const group = qids.slice(index * 25, index * 25 + 25)
    return {
      position: index + 1,
      requestedQidsSha256: discoverySha256(group),
      reducedResponseSetSha256: discoverySha256(
        group.map((qid) => reducePredecessorEntity(entities[qid]!)),
      ),
      responseRevisionSetSha256: discoverySha256(
        group.map((qid) => ({
          qid,
          revision: entities[qid]?.lastrevid ?? null,
        })),
      ),
    }
  })
}

async function checkEvidenceUrlsBounded(
  urls: readonly string[],
  requester: SequentialPredecessorRequester,
  afterUrl?: () => void,
): Promise<void> {
  for (const value of urls) {
    const url = new URL(value)
    const response = await requester.fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': wikidataImporterUserAgent },
    })
    const approved =
      response.ok && isExactHtmlMediaType(response.headers.get('content-type'))
    if (!approved)
      throw new PredecessorReviewCommandError(
        'A retained maturity evidence URL is not reachable in its approved shape.',
      )
    afterUrl?.()
  }
}

const mediaTypeParameterPattern =
  /^\s*[!#$%&'*+\-.^_`|~0-9A-Za-z]+\s*=\s*(?:"[^"\r\n]*"|[!#$%&'*+\-.^_`|~0-9A-Za-z]+)\s*$/

export function isExactHtmlMediaType(value: string | null): boolean {
  if (value === null) return false
  const [mediaType, ...parameters] = value.split(';')
  return (
    mediaType?.trim().toLowerCase() === 'text/html' &&
    parameters.every((parameter) => mediaTypeParameterPattern.test(parameter))
  )
}

function buildRetainedUrlEvidence(urls: readonly string[]) {
  return urls.map((value, index) => {
    const evidenceUrlSha256 = discoverySha256(value)
    const outcome = 'reachable' as const
    const shape = 'html' as const
    return {
      position: index + 1,
      evidenceUrlSha256,
      outcome,
      shape,
      outcomeSha256: discoverySha256({
        evidenceUrlSha256,
        outcome,
        shape,
      }),
    }
  })
}

async function publishAtomically(
  files: Readonly<Record<string, unknown>>,
  diagnostic: PredecessorTerminalDiagnostic,
  directory = outputDirectory,
  beforePromotion?: (destination: string) => Promise<void>,
): Promise<string> {
  beginPredecessorTerminalStage(diagnostic, 'atomic-publication')
  await mkdir(directory, { recursive: true })
  completePredecessorTerminalStep(diagnostic)
  await assertPredecessorReviewOutputVacant(directory)
  completePredecessorTerminalStep(diagnostic)
  const staging = join(directory, `.staging-${randomUUID()}`)
  let stagingCreated = false
  try {
    await mkdir(staging)
    stagingCreated = true
    completePredecessorTerminalStep(diagnostic)
    const entries = Object.entries(files)
    if (entries.length !== 4)
      throw new Error('Atomic predecessor publication requires four files.')
    for (const [name, value] of entries) {
      await writeFile(
        join(staging, name),
        `${JSON.stringify(value, null, 2)}\n`,
        {
          flag: 'wx',
        },
      )
      completePredecessorTerminalStep(diagnostic)
    }
    const destination = join(directory, 'prepared')
    await beforePromotion?.(destination)
    await rename(staging, destination)
    completePredecessorTerminalStep(diagnostic)
    return destination
  } catch (error) {
    if (stagingCreated) await rm(staging, { recursive: true, force: true })
    throw error
  }
}

function reviewInput(
  role: 'primary' | 'independent',
  preparation: z.infer<typeof predecessorPreparationSchema>,
) {
  const common = {
    schema: 'zedarchive.anime-v2-predecessor-review-input',
    version: 1,
    role,
    preparationSha256: discoverySha256(preparation),
    records: preparation.records.map(
      ({
        catalogueItemId,
        sourceItemId,
        predecessorNormalizedItemSha256,
        projection,
      }) => ({
        catalogueItemId,
        sourceItemId,
        predecessorNormalizedItemSha256,
        projection,
      }),
    ),
  }
  return role === 'primary'
    ? {
        ...common,
        requiredIdentityScopeDisposition:
          preparation.requiredIdentityScopeDisposition,
      }
    : {
        ...common,
        requiredDecision055Evidence: {
          catalogueItemId:
            preparation.requiredIdentityScopeDisposition.catalogueItemId,
          sourceItemId:
            preparation.requiredIdentityScopeDisposition.sourceItemId,
          projection: preparation.requiredIdentityScopeDisposition.projection,
          projectionSha256:
            preparation.requiredIdentityScopeDisposition.projectionSha256,
          requiredState:
            preparation.requiredIdentityScopeDisposition.currentState,
          reason: preparation.requiredIdentityScopeDisposition.reason,
        },
      }
}

const preparedDirectory = join(outputDirectory, 'prepared')
const preparedPaths = {
  preparation: join(preparedDirectory, 'source-receipt.json'),
  primaryInput: join(preparedDirectory, 'primary-review-input.json'),
  independentInput: join(preparedDirectory, 'independent-review-input.json'),
  primaryDraft: join(preparedDirectory, 'primary-review-draft.json'),
  independentDraft: join(preparedDirectory, 'independent-review-draft.json'),
  primaryLocked: join(preparedDirectory, 'primary-review.locked.json'),
  independentLocked: join(preparedDirectory, 'independent-review.locked.json'),
  finalized: join(outputDirectory, 'finalized'),
} as const

function roleArtifactName(
  role: 'primary' | 'independent',
  kind: 'draft' | 'locked',
  round: number,
) {
  return round === 1
    ? `${role}-review.${kind}.json`
    : `round-${round}-${role}-review.${kind}.json`
}
function roundDocketName() {
  return 'docket.json'
}
function roundGateName() {
  return 'gate.json'
}
function roundHandoffDirectory(round: number) {
  return join(preparedDirectory, `round-${round}-handoff`)
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown
}

async function writeJsonAtomicallyVacant(
  directory: string,
  filename: string,
  value: unknown,
): Promise<string> {
  await mkdir(directory, { recursive: true })
  const destination = join(directory, filename)
  const staging = join(directory, `.${filename}.${randomUUID()}.staging`)
  try {
    await writeFile(staging, `${JSON.stringify(value, null, 2)}\n`, {
      flag: 'wx',
    })
    await link(staging, destination)
    return destination
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      throw new PredecessorReviewCommandError(
        'A predecessor role artifact already exists; no overwrite is allowed.',
      )
    throw error
  } finally {
    await rm(staging, { force: true })
  }
}

async function writeFinalArtifactsAtomically(
  result: unknown,
  safeAggregate: unknown,
  directory = outputDirectory,
): Promise<string> {
  const destination = join(directory, 'finalized')
  const staging = join(directory, `.finalized-${randomUUID()}.staging`)
  try {
    await mkdir(staging)
    await writeFile(
      join(staging, 'predecessor-review-result.json'),
      `${JSON.stringify(result, null, 2)}\n`,
      { flag: 'wx' },
    )
    await writeFile(
      join(staging, 'safe-aggregate.json'),
      `${JSON.stringify(safeAggregate, null, 2)}\n`,
      { flag: 'wx' },
    )
    try {
      await readdir(destination)
      throw new PredecessorReviewCommandError(
        'A finalized predecessor review already exists; no overwrite is allowed.',
      )
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await rename(staging, destination)
    return destination
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    throw error
  }
}

async function writeRoundHandoffAtomically(
  round: number,
  docket: unknown,
  gate: unknown,
  directory = preparedDirectory,
  beforePromotion?: () => Promise<void>,
): Promise<string> {
  const destination = join(directory, `round-${round}-handoff`)
  const staging = join(
    directory,
    `.round-${round}-handoff-${randomUUID()}.staging`,
  )
  try {
    await mkdir(staging)
    await writeFile(
      join(staging, roundDocketName()),
      `${JSON.stringify(docket, null, 2)}\n`,
      { flag: 'wx' },
    )
    await writeFile(
      join(staging, roundGateName()),
      `${JSON.stringify(gate, null, 2)}\n`,
      { flag: 'wx' },
    )
    if ((await readdir(staging)).sort().join(',') !== 'docket.json,gate.json')
      throw new PredecessorReviewCommandError(
        'A predecessor round handoff is incomplete.',
      )
    try {
      await readdir(destination)
      throw new PredecessorReviewCommandError(
        'A predecessor round handoff already exists; no overwrite is allowed.',
      )
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await beforePromotion?.()
    await rename(staging, destination)
    return destination
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    throw error
  }
}

export async function writePredecessorRoundHandoffForFixture(
  directory: string,
  round: number,
  docket: unknown,
  gate: unknown,
  beforePromotion?: () => Promise<void>,
): Promise<string> {
  if (process.env.NODE_ENV !== 'test')
    throw new PredecessorReviewCommandError(
      'Fixture predecessor review execution is unavailable to live tooling.',
    )
  return writeRoundHandoffAtomically(
    round,
    docket,
    gate,
    directory,
    beforePromotion,
  )
}

export async function writePredecessorRoleArtifactForFixture(
  directory: string,
  filename: string,
  value: unknown,
): Promise<string> {
  if (process.env.NODE_ENV !== 'test')
    throw new PredecessorReviewCommandError(
      'Fixture predecessor review execution is unavailable to live tooling.',
    )
  return writeJsonAtomicallyVacant(directory, filename, value)
}

export async function writePredecessorFinalArtifactsForFixture(
  directory: string,
  result: unknown,
  safeAggregate: unknown,
): Promise<string> {
  if (process.env.NODE_ENV !== 'test')
    throw new PredecessorReviewCommandError(
      'Fixture predecessor review execution is unavailable to live tooling.',
    )
  return writeFinalArtifactsAtomically(result, safeAggregate, directory)
}

async function loadPreparedRoleEvidence(
  role: 'primary' | 'independent',
  read = readJson,
) {
  const [preparation, input] = await Promise.all([
    read(preparedPaths.preparation),
    read(
      role === 'primary'
        ? preparedPaths.primaryInput
        : preparedPaths.independentInput,
    ),
  ])
  return { preparation, input }
}

export async function loadPredecessorRoleEvidenceForFixture(
  role: 'primary' | 'independent',
  read: (path: string) => Promise<unknown>,
) {
  if (process.env.NODE_ENV !== 'test')
    throw new PredecessorReviewCommandError(
      'Fixture predecessor review execution is unavailable to live tooling.',
    )
  return loadPreparedRoleEvidence(role, read)
}

async function loadPreparedReconciliationEvidence() {
  const [preparation, primaryInput, independentInput] = await Promise.all([
    readJson(preparedPaths.preparation),
    readJson(preparedPaths.primaryInput),
    readJson(preparedPaths.independentInput),
  ])
  return { preparation, primaryInput, independentInput }
}

async function priorRoundDocketSha256(
  round: number,
  preparation: unknown,
  read = readJson,
  directory = preparedDirectory,
): Promise<string | null> {
  if (round === 1) return null
  const priorRound = round - 1
  const priorCommitment = await priorRoundDocketSha256(
    priorRound,
    preparation,
    read,
    directory,
  )
  const [
    docketInput,
    primaryInput,
    independentInput,
    primaryLock,
    independentLock,
  ] = await Promise.all([
    read(join(directory, `round-${priorRound}-handoff`, roundDocketName())),
    read(preparedPaths.primaryInput),
    read(preparedPaths.independentInput),
    read(join(directory, roleArtifactName('primary', 'locked', priorRound))),
    read(
      join(directory, roleArtifactName('independent', 'locked', priorRound)),
    ),
  ])
  const docket = validatePredecessorReReviewDocket(
    predecessorReReviewDocketSchema.parse(docketInput),
    primaryLock,
    independentLock,
    primaryInput,
    independentInput,
    preparation,
    priorCommitment,
  )
  if (docket.round !== priorRound)
    throw new PredecessorReviewCommandError(
      'The predecessor re-review docket is not bound to its immutable prior locks.',
    )
  return discoverySha256(docket)
}

async function roleRoundGateDocketSha256(
  round: number,
  preparation: unknown,
  read = readJson,
): Promise<string | null> {
  if (round === 1) return null
  const gate = predecessorReReviewGateSchema.parse(
    await read(join(roundHandoffDirectory(round - 1), roundGateName())),
  )
  if (
    gate.round !== round ||
    gate.preparationSha256 !== discoverySha256(preparation)
  )
    throw new PredecessorReviewCommandError(
      'The predecessor re-review gate is not bound to this role round.',
    )
  return gate.priorRoundDocketSha256
}

export async function verifyPredecessorReconciliationLineageForFixture(
  round: number,
  preparation: unknown,
  gate: unknown,
  read: (path: string) => Promise<unknown>,
  directory: string,
) {
  if (process.env.NODE_ENV !== 'test')
    throw new PredecessorReviewCommandError(
      'Fixture predecessor review execution is unavailable to live tooling.',
    )
  const commitment = await priorRoundDocketSha256(
    round,
    preparation,
    read,
    directory,
  )
  const parsed = predecessorReReviewGateSchema.parse(gate)
  if (
    parsed.round !== round ||
    parsed.preparationSha256 !== discoverySha256(preparation) ||
    parsed.priorRoundDocketSha256 !== commitment
  )
    throw new PredecessorReviewCommandError(
      'The predecessor re-review gate does not match immutable prior locks.',
    )
  return commitment
}

export async function loadPredecessorRoleRoundForFixture(
  role: 'primary' | 'independent',
  round: number,
  read: (path: string) => Promise<unknown>,
) {
  if (process.env.NODE_ENV !== 'test')
    throw new PredecessorReviewCommandError(
      'Fixture predecessor review execution is unavailable to live tooling.',
    )
  const evidence = await loadPreparedRoleEvidence(role, read)
  return {
    ...evidence,
    priorRoundDocketSha256: await roleRoundGateDocketSha256(
      round,
      evidence.preparation,
      read,
    ),
  }
}

async function runOfflineRoleReviewCommand(
  command: Exclude<
    ReturnType<typeof parsePredecessorReviewArguments>,
    { mode: 'check' | 'prepare' }
  >,
  bundle: AnimeReleaseBundle,
  log: (message: string) => void,
): Promise<void> {
  if (command.mode === 'draft') {
    const evidence = await loadPreparedRoleEvidence(
      command.role as 'primary' | 'independent',
    )
    const previousDocketSha256 = await roleRoundGateDocketSha256(
      command.round,
      evidence.preparation,
    )
    const draft = createPendingPredecessorRoleReviewDraft(
      evidence.input,
      evidence.preparation,
      command.round,
      previousDocketSha256,
    )
    const destination = await writeJsonAtomicallyVacant(
      preparedDirectory,
      roleArtifactName(
        command.role as 'primary' | 'independent',
        'draft',
        command.round,
      ),
      draft,
    )
    log(
      `Created pending ${command.role} predecessor review draft at ${destination}.`,
    )
    return
  }
  if (command.mode === 'lock') {
    const evidence = await loadPreparedRoleEvidence(
      command.role as 'primary' | 'independent',
    )
    const previousDocketSha256 = await roleRoundGateDocketSha256(
      command.round,
      evidence.preparation,
    )
    const completed = await readJson(command.completedPath)
    const locked = validatePredecessorRoleReviewResult(
      completed,
      evidence.input,
      evidence.preparation,
      command.role as 'primary' | 'independent',
      command.round,
      previousDocketSha256,
    )
    const destination = await writeJsonAtomicallyVacant(
      preparedDirectory,
      roleArtifactName(
        command.role as 'primary' | 'independent',
        'locked',
        command.round,
      ),
      locked,
    )
    log(`Locked ${command.role} predecessor review at ${destination}.`)
    return
  }
  const evidence = await loadPreparedReconciliationEvidence()
  const [primary, independent] = await Promise.all([
    readJson(
      join(
        preparedDirectory,
        roleArtifactName('primary', 'locked', command.round),
      ),
    ),
    readJson(
      join(
        preparedDirectory,
        roleArtifactName('independent', 'locked', command.round),
      ),
    ),
  ])
  const previousDocketSha256 = await priorRoundDocketSha256(
    command.round,
    evidence.preparation,
  )
  if (command.round > 1) {
    const gate = predecessorReReviewGateSchema.parse(
      await readJson(
        join(roundHandoffDirectory(command.round - 1), roundGateName()),
      ),
    )
    if (
      gate.round !== command.round ||
      gate.preparationSha256 !== discoverySha256(evidence.preparation) ||
      gate.priorRoundDocketSha256 !== previousDocketSha256
    )
      throw new PredecessorReviewCommandError(
        'The predecessor re-review gate does not match immutable prior locks.',
      )
  }
  let reconciled
  try {
    reconciled = reconcilePredecessorRoleReviews(
      evidence.primaryInput,
      evidence.independentInput,
      primary,
      independent,
      bundle.corpus,
      bundle.reviewLedger,
      bundle.index,
      evidence.preparation,
      command.round,
      previousDocketSha256,
    )
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !==
        'Primary and independent predecessor resolutions disagree.'
    )
      throw error
    const docket = createPredecessorReReviewDocket(
      primary,
      independent,
      evidence.preparation,
      command.round,
    )
    await writeRoundHandoffAtomically(
      command.round,
      docket,
      predecessorReReviewGateSchema.parse({
        schema: 'zedarchive.anime-v2-predecessor-re-review-gate',
        version: 1,
        round: command.round + 1,
        preparationSha256: discoverySha256(evidence.preparation),
        priorRoundDocketSha256: discoverySha256(docket),
      }),
    )
    throw new PredecessorReviewCommandError(
      'Predecessor role reviews disagree; a re-review docket was locked.',
    )
  }
  const destination = await writeFinalArtifactsAtomically(
    reconciled.result,
    reconciled.safeAggregate,
  )
  log(`Finalized 500 reconciled predecessor reviews at ${destination}.`)
}

// Pure artifact construction is deliberately non-authoritative: the live
// command calls it only after the fixed receipt, environment, output, provider,
// and evidence-URL gates have all succeeded.
export function buildUnauthoritativePredecessorPreparationArtifacts(
  bundle: AnimeReleaseBundle,
  entities: Readonly<Record<string, WikidataEntity>>,
  preparedAt: Date,
) {
  return buildPredecessorPreparationArtifacts(bundle, entities, preparedAt)
}

function buildPredecessorPreparationArtifacts(
  bundle: AnimeReleaseBundle,
  entities: Readonly<Record<string, WikidataEntity>>,
  preparedAt: Date,
  diagnostic?: PredecessorTerminalDiagnostic,
) {
  const aggregate = bundle.corpus.items.find(
    ({ id }) => id === '3ad12706-93ab-496e-9ca8-729fc79342e6',
  )
  if (aggregate === undefined)
    throw new PredecessorReviewCommandError(
      'The tracked Decision 055 predecessor is missing.',
    )
  const predecessorQids = bundle.corpus.items.map(
    (item) => item.sources[0]!.sourceItemId,
  )
  if (predecessorQids.includes('Q114798407'))
    throw new PredecessorReviewCommandError(
      'The Decision 055 corroborating QID unexpectedly became a predecessor.',
    )
  const qids = [...predecessorQids, 'Q114798407']
  if (
    canonicalJson(Object.keys(entities).sort()) !==
    canonicalJson([...qids].sort())
  )
    throw new PredecessorReviewCommandError(
      'Predecessor acquisition did not return exactly 500 predecessors plus the corroborating QID.',
    )
  if (diagnostic)
    beginPredecessorTerminalStage(diagnostic, 'identity-projection')
  const identityProjection = reconstructPredecessorIdentityProjection(
    Object.fromEntries(
      ['Q114798266', 'Q114798403', 'Q114798407'].map((qid) => [
        qid,
        entities[qid]!,
      ]),
    ),
  )
  if (diagnostic) completePredecessorTerminalStep(diagnostic)
  const urls = bundle.reviewLedger.items.flatMap(({ maturityEvidence }) =>
    maturityEvidence.map(({ evidenceUrl }) => evidenceUrl),
  )
  if (diagnostic)
    beginPredecessorTerminalStage(diagnostic, 'predecessor-projections')
  const records = bundle.corpus.items.map((item) => {
    const record = {
      catalogueItemId: item.id,
      sourceItemId: item.sources[0]!.sourceItemId,
      predecessorNormalizedItemSha256: normalizedAnimeReleaseItemSha256(item),
      projection: reducePredecessorEntity(
        entities[item.sources[0]!.sourceItemId]!,
      ),
    }
    if (diagnostic) completePredecessorTerminalStep(diagnostic)
    return record
  })
  if (diagnostic)
    beginPredecessorTerminalStage(diagnostic, 'preparation-validation')
  const preparation = predecessorPreparationSchema.parse({
    schema: 'zedarchive.anime-v2-predecessor-preparation',
    version: 1,
    predecessorCorpusSha256: sha256Canonical(bundle.corpus),
    predecessorReviewSha256: sha256Canonical(bundle.reviewLedger),
    predecessorIndexSha256: sha256Canonical(bundle.index),
    discoveryCandidateReceiptSha256: acceptedDiscoveryCandidateReceiptSha256,
    preparedAt: preparedAt.toISOString(),
    records,
    corroboratingProjection: reducePredecessorEntity(entities.Q114798407!),
    acquisitionEvidence: {
      actionGroups: buildActionAcquisitionEvidence(qids, entities),
      retainedEvidenceUrls: buildRetainedUrlEvidence(urls),
    },
    requiredIdentityScopeDisposition: createIdentityScopeDisposition(
      aggregate,
      identityProjection,
    ),
  })
  if (diagnostic) completePredecessorTerminalStep(diagnostic)
  return {
    'source-receipt.json': preparation,
    'primary-review-input.json': reviewInput('primary', preparation),
    'independent-review-input.json': reviewInput('independent', preparation),
    'safe-aggregate.json': {
      schema: 'zedarchive.anime-v2-predecessor-safe-aggregate',
      version: 1,
      records: 500,
      evidenceUrls: urls.length,
      titleUnavailable: preparation.records.filter(
        ({ projection }) => projection.titleCandidates.length === 0,
      ).length,
      signalled: preparation.records.filter(
        ({ projection }) => projection.adultSignals.length > 0,
      ).length,
      preparationSha256: discoverySha256(preparation),
    },
  }
}

async function runPredecessorPreparationStages(
  bundle: AnimeReleaseBundle,
  dependencies: FixtureDependencies,
  diagnostic: PredecessorTerminalDiagnostic,
): Promise<void> {
  const requester =
    dependencies.requester ?? new SequentialPredecessorRequester()
  const predecessorQids = bundle.corpus.items.map(
    (item) => item.sources[0]!.sourceItemId,
  )
  if (predecessorQids.includes('Q114798407'))
    throw new PredecessorReviewCommandError(
      'The Decision 055 corroborating QID unexpectedly became a predecessor.',
    )
  const qids = [...predecessorQids, 'Q114798407']
  beginPredecessorTerminalStage(diagnostic, 'entity-groups')
  const entities = dependencies.fetchEntities
    ? await dependencies.fetchEntities(qids, () =>
        completePredecessorTerminalStep(diagnostic),
      )
    : await fetchPredecessorEntitiesBoundedWithProgress(qids, requester, () =>
        completePredecessorTerminalStep(diagnostic),
      )
  if (dependencies.fetchEntities)
    while (diagnostic.completed < diagnostic.total)
      completePredecessorTerminalStep(diagnostic)
  const urls = bundle.reviewLedger.items.flatMap(({ maturityEvidence }) =>
    maturityEvidence.map(({ evidenceUrl }) => evidenceUrl),
  )
  beginPredecessorTerminalStage(diagnostic, 'evidence-urls')
  if (dependencies.checkEvidenceUrls) {
    await dependencies.checkEvidenceUrls(urls, () =>
      completePredecessorTerminalStep(diagnostic),
    )
    while (diagnostic.completed < diagnostic.total)
      completePredecessorTerminalStep(diagnostic)
  } else
    await checkEvidenceUrlsBounded(urls, requester, () =>
      completePredecessorTerminalStep(diagnostic),
    )
  const files = buildPredecessorPreparationArtifacts(
    bundle,
    entities,
    (dependencies.now ?? (() => new Date()))(),
    diagnostic,
  )
  let destination: string
  if (dependencies.publish) {
    beginPredecessorTerminalStage(diagnostic, 'atomic-publication')
    destination = await dependencies.publish(files)
    while (diagnostic.completed < diagnostic.total)
      completePredecessorTerminalStep(diagnostic)
  } else
    destination = await publishAtomically(
      files,
      diagnostic,
      dependencies.publicationDirectoryForFixture ?? outputDirectory,
      dependencies.beforeAtomicPromotionForFixture,
    )
  ;(dependencies.log ?? console.log)(
    `Prepared 500 predecessor reviews at ${destination}.`,
  )
}

async function runPredecessorReviewCommandUnsafe(
  args: readonly string[],
  dependencies: FixtureDependencies,
  diagnostic: PredecessorTerminalDiagnostic,
): Promise<void> {
  const command = parsePredecessorReviewArguments(args)
  if (command.mode === 'prepare')
    assertPredecessorReviewRuntimeEnvironment(
      dependencies.environment ?? process.env,
    )
  const bundle = await (
    dependencies.loadBundle ?? loadAcceptedPredecessorV1Bundle
  )()
  assertAcceptedPredecessorV1Bundle(
    bundle.corpus,
    bundle.reviewLedger,
    bundle.index,
  )
  const aggregate = bundle.corpus.items.find(
    ({ id }) => id === '3ad12706-93ab-496e-9ca8-729fc79342e6',
  )
  if (aggregate === undefined)
    throw new PredecessorReviewCommandError(
      'The tracked Decision 055 predecessor is missing.',
    )
  if (
    command.mode === 'draft' ||
    command.mode === 'lock' ||
    command.mode === 'reconcile'
  ) {
    await runOfflineRoleReviewCommand(
      command,
      bundle,
      dependencies.log ?? console.log,
    )
    return
  }
  if (command.mode === 'check') {
    assertAcceptedIdentityProjection(acceptedPredecessorIdentityProjection)
    createIdentityScopeDisposition(aggregate)
    ;(dependencies.log ?? console.log)(
      'Validated the database-free anime-v2 predecessor review contract.',
    )
    return
  }
  await (
    dependencies.assertOutputVacant ?? assertPredecessorReviewOutputVacant
  )()
  const rawReceipt = await (
    dependencies.readDiscoveryReceipt ??
    (async () =>
      JSON.parse(await readFile(discoveryReceiptPath, 'utf8')) as unknown)
  )()
  const receipt = candidateReceiptSchema.parse(rawReceipt)
  if (discoverySha256(receipt) !== acceptedDiscoveryCandidateReceiptSha256)
    throw new PredecessorReviewCommandError(
      'The discovery candidate receipt is not the accepted frozen run.',
    )
  const eligible = new Set(receipt.candidates.map(({ qid }) => qid))
  const blocked = new Set(receipt.identityBlocked.map(({ qid }) => qid))
  for (const item of bundle.corpus.items) {
    const qid = item.sources[0]!.sourceItemId
    if (blocked.has(qid) || (qid !== 'Q583684' && !eligible.has(qid)))
      throw new PredecessorReviewCommandError(
        'A predecessor is absent from its authorized discovery representation.',
      )
  }
  await runPredecessorPreparationStages(bundle, dependencies, diagnostic)
}

async function runPredecessorReviewCommandWithDependencies(
  args: readonly string[],
  dependencies: FixtureDependencies,
): Promise<void> {
  const diagnostic = createPredecessorTerminalDiagnostic()
  try {
    await runPredecessorReviewCommandUnsafe(args, dependencies, diagnostic)
  } catch (error) {
    throw classifyPredecessorTerminalFailure(error, diagnostic)
  }
}

export async function runPredecessorReviewCommand(
  args: readonly string[],
): Promise<void> {
  return runPredecessorReviewCommandWithDependencies(args, {})
}

export async function runPredecessorReviewCommandForFixture(
  args: readonly string[],
  dependencies: FixtureDependencies,
): Promise<void> {
  if (process.env.NODE_ENV !== 'test')
    throw new PredecessorReviewCommandError(
      'Fixture predecessor review execution is unavailable to live tooling.',
    )
  return runPredecessorReviewCommandWithDependencies(args, dependencies)
}

export async function runPredecessorPreparationStagesForFixture(
  bundle: AnimeReleaseBundle,
  dependencies: FixtureDependencies,
): Promise<void> {
  if (process.env.NODE_ENV !== 'test')
    throw new PredecessorReviewCommandError(
      'Fixture predecessor review execution is unavailable to live tooling.',
    )
  assertAcceptedPredecessorV1Bundle(
    bundle.corpus,
    bundle.reviewLedger,
    bundle.index,
  )
  const diagnostic = createPredecessorTerminalDiagnostic()
  try {
    await runPredecessorPreparationStages(bundle, dependencies, diagnostic)
  } catch (error) {
    throw classifyPredecessorTerminalFailure(error, diagnostic)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  runPredecessorReviewCommand(process.argv.slice(2)).catch((error) => {
    console.error(
      error instanceof PredecessorReviewCommandError
        ? error.message
        : 'Predecessor review preparation failed safely.',
    )
    process.exitCode = 1
  })

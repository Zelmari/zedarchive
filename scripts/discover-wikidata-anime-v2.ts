import { createHash, randomUUID } from 'node:crypto'
import {
  link,
  lstat,
  mkdir,
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
  aggregateMonthlyPageviews,
  assertCandidateHeadroom,
  assertEligiblePopulation,
  assignPageviewBands,
  compareAudienceCandidates,
  compareDiscoveryQids,
  discoveryLimits,
  discoveryRunSpecification,
  discoverySha256,
  discoverySpecificationHashes,
  discoveryTerminalCategories,
  discoveryUserAgent,
  discoveryWdqsQueries,
  discoveryWindow,
  hashQidSequence,
  parseDiscoveryCommitmentReceipt,
  reduceDiscoveryRows,
  toSitelinkBand,
  type DiscoveryFormat,
  type DiscoveryRow,
  type DiscoveryTerminalCategory,
  type PageviewBand,
} from '@/features/anime/catalogue/wikidata-anime-discovery'
import { wikidataQidSchema } from '@/integrations/wikidata/wikidata-entity'

const usage =
  'Usage: catalogue:discover:wikidata check, catalogue:discover:wikidata discover --confirm-wikimedia-live, or catalogue:discover:wikidata finalize --confirm-dual-review'
const wdqsEndpoint = 'https://query.wikidata.org/sparql'
const actionEndpoint = 'https://www.wikidata.org/w/api.php'
const pageviewEndpoint =
  'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article'
const maximumResponseBytes = {
  wdqs: 5 * 1024 * 1024,
  action: 5 * 1024 * 1024,
  pageview: 1024 * 1024,
} as const
const defaultOutputDirectory = fileURLToPath(
  new URL('../.local/m45/discovery', import.meta.url),
)
const v1CorpusPath = fileURLToPath(
  new URL('../data/releases/anime-catalogue.v1.json', import.meta.url),
)

type RequestKind = keyof typeof maximumResponseBytes
type TimerHandle = ReturnType<typeof setTimeout>

export class DiscoveryCommandError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DiscoveryCommandError'
  }
}

export type DiscoveryCommand =
  | Readonly<{ mode: 'check' }>
  | Readonly<{ mode: 'discover' }>
  | Readonly<{ mode: 'finalize' }>

type DiscoveryEnvironment = Readonly<Record<string, string | undefined>>

export type DiscoveryClock = Readonly<{
  now: () => number
  setTimeout: (callback: () => void, milliseconds: number) => TimerHandle
  clearTimeout: (handle: TimerHandle) => void
}>

type RequestDependencies = Readonly<{
  fetch: typeof fetch
  delay: (milliseconds: number) => Promise<void>
  clock: DiscoveryClock
  log?: (message: string) => void
}>

type RequestResult =
  | Readonly<{
      availability: 'available'
      json: unknown
      responseSha256: string
    }>
  | Readonly<{ availability: 'unavailable'; responseSha256: string }>

export function parseDiscoveryArguments(
  argumentsToParse: readonly string[],
): DiscoveryCommand {
  if (argumentsToParse.length === 1 && argumentsToParse[0] === 'check') {
    return { mode: 'check' }
  }
  if (
    argumentsToParse.length === 2 &&
    argumentsToParse[0] === 'discover' &&
    argumentsToParse[1] === '--confirm-wikimedia-live'
  ) {
    return { mode: 'discover' }
  }
  if (
    argumentsToParse.length === 2 &&
    argumentsToParse[0] === 'finalize' &&
    argumentsToParse[1] === '--confirm-dual-review'
  ) {
    return { mode: 'finalize' }
  }
  throw new DiscoveryCommandError(usage)
}

export function assertDiscoveryRuntimeEnvironment(
  environment: DiscoveryEnvironment,
): void {
  if (
    environment.CI !== undefined ||
    environment.NODE_ENV === 'test' ||
    environment.VERCEL !== undefined ||
    environment.VERCEL_ENV !== undefined ||
    environment.GITHUB_ACTIONS !== undefined ||
    environment.ZEDARCHIVE_SCHEDULED_JOB !== undefined
  ) {
    throw new DiscoveryCommandError(
      'Live catalogue discovery is unavailable in this execution environment.',
    )
  }
}

export function buildWdqsQueries(): Readonly<Record<DiscoveryFormat, string>> {
  return discoveryWdqsQueries
}

const sparqlItemBindingSchema = z.strictObject({
  type: z.literal('uri'),
  value: z.string(),
})
const sparqlClassesBindingSchema = z.strictObject({
  type: z.literal('literal'),
  value: z.string(),
})
const sparqlYearBindingSchema = z.strictObject({
  type: z.literal('literal'),
  value: z.string(),
  datatype: z.literal('http://www.w3.org/2001/XMLSchema#integer'),
})
const sparqlBindingSchema = z.strictObject({
  item: sparqlItemBindingSchema,
  classes: sparqlClassesBindingSchema,
  publicationYear: sparqlYearBindingSchema.optional(),
  startYear: sparqlYearBindingSchema.optional(),
})
const wdqsResponseSchema = z.strictObject({
  head: z.strictObject({
    vars: z.tuple([
      z.literal('item'),
      z.literal('classes'),
      z.literal('publicationYear'),
      z.literal('startYear'),
    ]),
  }),
  results: z.strictObject({ bindings: z.array(sparqlBindingSchema) }),
})

function qidFromEntityUri(value: string): string {
  const match = /^http:\/\/www\.wikidata\.org\/entity\/(Q[1-9][0-9]*)$/.exec(
    value,
  )
  if (match?.[1] === undefined) {
    throw new DiscoveryCommandError('WDQS returned an invalid entity URI.')
  }
  return wikidataQidSchema.parse(match[1])
}

function parseDiscoveryYear(
  binding: z.infer<typeof sparqlYearBindingSchema> | undefined,
): number | null {
  if (binding === undefined) return null
  if (!/^[1-9][0-9]{0,3}$/.test(binding.value)) {
    throw new DiscoveryCommandError('WDQS returned an invalid discovery year.')
  }
  const year = Number.parseInt(binding.value, 10)
  if (!Number.isInteger(year)) {
    throw new DiscoveryCommandError('WDQS returned an invalid discovery year.')
  }
  return year
}

export function parseWdqsRows(input: unknown): DiscoveryRow[] {
  const response = wdqsResponseSchema.parse(input)
  return response.results.bindings.flatMap((binding) => {
    const publicationYear = parseDiscoveryYear(binding.publicationYear)
    const startYear = parseDiscoveryYear(binding.startYear)
    const releaseYear = publicationYear ?? startYear
    const classUris = binding.classes.value.split(',')
    if (
      classUris.length === 0 ||
      new Set(classUris).size !== classUris.length
    ) {
      throw new DiscoveryCommandError(
        'WDQS returned invalid grouped format classes.',
      )
    }
    return classUris.map((classUri) => ({
      qid: qidFromEntityUri(binding.item.value),
      classQid: qidFromEntityUri(classUri),
      rank: 'normal' as const,
      releaseYear,
    }))
  })
}

const actionSitelinkSchema = z.strictObject({
  site: z.string().min(1),
  title: z.string().min(1),
  badges: z.array(z.string()).optional(),
  url: z.string().url().optional(),
})
const actionEntitySchema = z.strictObject({
  id: wikidataQidSchema,
  type: z.literal('item'),
  sitelinks: z.record(z.string(), actionSitelinkSchema),
})
const actionResponseSchema = z.strictObject({
  entities: z.record(wikidataQidSchema, actionEntitySchema),
  success: z.literal(1),
})

export type ArticleMapping = Readonly<{
  qid: string
  englishTitle: string | null
  japaneseTitle: string | null
  sitelinkCount: number
}>

export function parseActionMappings(
  input: unknown,
  requestedQids: readonly string[],
): ArticleMapping[] {
  const response = actionResponseSchema.parse(input)
  const requested = new Set(requestedQids)
  if (
    Object.keys(response.entities).length !== requested.size ||
    Object.keys(response.entities).some((qid) => !requested.has(qid))
  ) {
    throw new DiscoveryCommandError(
      'Wikidata omitted or added a requested entity.',
    )
  }
  const seenArticles = new Set<string>()
  return requestedQids.map((qid) => {
    const entity = response.entities[qid]
    if (entity === undefined || entity.id !== qid) {
      throw new DiscoveryCommandError(
        'Wikidata returned an ambiguous entity mapping.',
      )
    }
    const englishTitle = entity.sitelinks.enwiki?.title ?? null
    const japaneseTitle = entity.sitelinks.jawiki?.title ?? null
    for (const [siteKey, sitelink] of Object.entries(entity.sitelinks)) {
      if (sitelink.site !== siteKey) {
        throw new DiscoveryCommandError(
          'Wikidata returned an ambiguous sitelink mapping.',
        )
      }
    }
    for (const [language, title] of [
      ['en', englishTitle],
      ['ja', japaneseTitle],
    ] as const) {
      if (title === null) continue
      const key = `${language}:${title.normalize('NFC')}`
      if (seenArticles.has(key)) {
        throw new DiscoveryCommandError(
          'A Wikipedia article maps to multiple candidate QIDs.',
        )
      }
      seenArticles.add(key)
    }
    return {
      qid,
      englishTitle,
      japaneseTitle,
      sitelinkCount: Object.keys(entity.sitelinks).length,
    }
  })
}

const pageviewItemSchema = z.strictObject({
  project: z.enum(['en.wikipedia', 'ja.wikipedia']),
  article: z.string().min(1),
  granularity: z.literal('monthly'),
  timestamp: z.string().regex(/^[0-9]{8}00$/),
  access: z.literal('all-access'),
  agent: z.literal('user'),
  views: z.number().int().nonnegative(),
})
const pageviewResponseSchema = z.strictObject({
  items: z.array(pageviewItemSchema),
})

export function parsePageviewMonths(
  input: unknown,
  expected?: Readonly<{ language: 'en' | 'ja'; article: string }>,
): Readonly<Record<string, number | null>> {
  const response = pageviewResponseSchema.parse(input)
  const months: Record<string, number | null> = Object.fromEntries(
    discoveryWindow.months.map((month) => [month, null]),
  )
  for (const item of response.items) {
    if (
      expected !== undefined &&
      (item.project !== `${expected.language}.wikipedia` ||
        item.article !== expected.article)
    ) {
      throw new DiscoveryCommandError(
        'Analytics returned an ambiguous article mapping.',
      )
    }
    const month = `${item.timestamp.slice(0, 4)}-${item.timestamp.slice(4, 6)}`
    if (
      !discoveryWindow.months.includes(
        month as (typeof discoveryWindow.months)[number],
      ) ||
      months[month] !== null
    ) {
      throw new DiscoveryCommandError(
        'Analytics returned a duplicate or out-of-window month.',
      )
    }
    months[month] = item.views
  }
  return months
}

function parseRetryAfter(value: string | null, now: number): number | null {
  if (value === null) return null
  const seconds = Number(value)
  const milliseconds = Number.isFinite(seconds)
    ? seconds * 1_000
    : Date.parse(value) - now
  if (
    !Number.isFinite(milliseconds) ||
    milliseconds < 0 ||
    milliseconds > discoveryLimits.maximumRetryDelayMilliseconds
  ) {
    throw new DiscoveryCommandError(
      'Provider Retry-After exceeds the bounded retry policy.',
    )
  }
  return milliseconds
}

async function responseBytes(
  response: Response,
  maximumBytes: number,
): Promise<Uint8Array> {
  const declaredLength = response.headers.get('content-length')
  if (
    declaredLength !== null &&
    Number.parseInt(declaredLength, 10) > maximumBytes
  ) {
    throw new DiscoveryCommandError('Provider response exceeds its size limit.')
  }
  if (response.body === null) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  while (true) {
    const result = await reader.read()
    if (result.done) break
    totalBytes += result.value.byteLength
    if (totalBytes > maximumBytes) {
      await reader.cancel()
      throw new DiscoveryCommandError(
        'Provider response exceeds its size limit.',
      )
    }
    chunks.push(result.value)
  }
  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export class SequentialDiscoveryRequester {
  private attempts = 0
  private completedAttempts = 0
  private successfulPageviews = 0
  private retries = 0
  private pacingWaits = 0
  private pacingDelayMilliseconds = 0
  private activeRequests = 0
  private maximumObservedConcurrency = 0
  private lastCompletion: number | null = null
  private readonly startedAt: number
  readonly responseHashes: string[] = []

  constructor(private readonly dependencies: RequestDependencies) {
    this.startedAt = dependencies.clock.now()
  }

  get evidence(): Readonly<{
    attempts: number
    successfulPageviews: number
    retries: number
    pacingWaits: number
    pacingDelayMilliseconds: number
    elapsedMilliseconds: number
    maximumConcurrency: 1
  }> {
    return {
      attempts: this.attempts,
      successfulPageviews: this.successfulPageviews,
      retries: this.retries,
      pacingWaits: this.pacingWaits,
      pacingDelayMilliseconds: this.pacingDelayMilliseconds,
      elapsedMilliseconds: Math.max(
        0,
        this.dependencies.clock.now() - this.startedAt,
      ),
      maximumConcurrency: 1,
    }
  }

  private assertWallTime(): void {
    if (
      this.dependencies.clock.now() - this.startedAt >=
      discoveryLimits.maximumWallTimeMilliseconds
    ) {
      throw new DiscoveryCommandError('Discovery exceeded its wall-time limit.')
    }
  }

  assertWithinWallTime(): void {
    this.assertWallTime()
  }

  private operationalEvidence(): z.infer<typeof operationalEvidenceSchema> {
    return operationalEvidenceSchema.parse({
      elapsedMilliseconds: Math.max(
        0,
        this.dependencies.clock.now() - this.startedAt,
      ),
      completedHttpAttempts: this.completedAttempts,
      successfulPageviewRequests: this.successfulPageviews,
      retries: this.retries,
      pacingWaits: this.pacingWaits,
      pacingDelayMilliseconds: this.pacingDelayMilliseconds,
      maximumObservedConcurrency: this.maximumObservedConcurrency,
    })
  }

  private emitProgressIfDue(): void {
    if (
      this.completedAttempts %
        discoveryRunSpecification.operationalEvidence
          .progressEveryCompletedHttpAttempts !==
      0
    ) {
      return
    }
    this.dependencies.log?.(
      `M45 discovery progress: ${JSON.stringify(this.operationalEvidence())}`,
    )
  }

  reportTerminal(category: DiscoveryTerminalCategory): void {
    this.dependencies.log?.(
      `M45 discovery terminal evidence: ${JSON.stringify(
        terminalOperationalEvidenceSchema.parse({
          terminalCategory: category,
          ...this.operationalEvidence(),
        }),
      )}`,
    )
  }

  private async pace(): Promise<void> {
    if (this.lastCompletion === null) return
    const elapsed = this.dependencies.clock.now() - this.lastCompletion
    const remaining =
      discoveryLimits.minimumRequestSpacingMilliseconds - elapsed
    if (remaining > 0) {
      this.pacingWaits += 1
      this.pacingDelayMilliseconds += remaining
      await this.dependencies.delay(remaining)
    }
  }

  async request(url: URL, kind: RequestKind): Promise<RequestResult> {
    for (
      let requestAttempt = 1;
      requestAttempt <= discoveryLimits.maximumAttemptsPerRequest;
      requestAttempt += 1
    ) {
      this.assertWallTime()
      if (this.attempts >= discoveryLimits.maximumHttpAttempts) {
        throw new DiscoveryCommandError(
          'Discovery exceeded its total HTTP-attempt limit.',
        )
      }
      await this.pace()
      this.assertWallTime()
      if (
        kind === 'pageview' &&
        this.successfulPageviews >=
          discoveryLimits.maximumSuccessfulPageviewRequests
      ) {
        throw new DiscoveryCommandError(
          'Discovery exceeded its successful pageview limit.',
        )
      }
      if (this.activeRequests !== 0) {
        throw new DiscoveryCommandError(
          'Discovery attempted concurrent provider requests.',
        )
      }

      this.attempts += 1
      this.activeRequests += 1
      this.maximumObservedConcurrency = Math.max(
        this.maximumObservedConcurrency,
        this.activeRequests,
      )
      const controller = new AbortController()
      const timeout = this.dependencies.clock.setTimeout(
        () => controller.abort(),
        discoveryLimits.requestTimeoutMilliseconds,
      )
      let retryDelay: number | null = null

      try {
        const response = await this.dependencies.fetch(url, {
          headers: {
            Accept:
              kind === 'wdqs'
                ? 'application/sparql-results+json'
                : 'application/json',
            'Accept-Encoding': 'gzip',
            'User-Agent': discoveryUserAgent,
          },
          redirect: 'error',
          signal: controller.signal,
        })
        if (kind === 'pageview' && response.status === 404) {
          const bytes = await responseBytes(
            response,
            maximumResponseBytes.pageview,
          )
          this.assertWallTime()
          const responseSha256 = discoverySha256({
            bodySha256: createHash('sha256').update(bytes).digest('hex'),
            kind,
            requestSha256: discoverySha256(url.toString()),
            status: 404,
          })
          this.responseHashes.push(responseSha256)
          return {
            availability: 'unavailable',
            responseSha256,
          }
        }
        const retryable = response.status === 429 || response.status === 503
        const bytes = await responseBytes(response, maximumResponseBytes[kind])
        const responseSha256 = discoverySha256({
          bodySha256: createHash('sha256').update(bytes).digest('hex'),
          kind,
          requestSha256: discoverySha256(url.toString()),
          status: response.status,
        })
        if (retryable) {
          this.responseHashes.push(responseSha256)
          retryDelay =
            parseRetryAfter(
              response.headers.get('retry-after'),
              this.dependencies.clock.now(),
            ) ?? Math.min(5_000 * 2 ** (requestAttempt - 1), 30_000)
        } else {
          let json: unknown
          try {
            json = JSON.parse(new TextDecoder().decode(bytes)) as unknown
          } catch {
            throw new DiscoveryCommandError('Provider returned malformed JSON.')
          }
          const maxlag =
            typeof json === 'object' &&
            json !== null &&
            'error' in json &&
            typeof json.error === 'object' &&
            json.error !== null &&
            'code' in json.error &&
            json.error.code === 'maxlag'
          if (maxlag) {
            this.responseHashes.push(responseSha256)
            retryDelay =
              parseRetryAfter(
                response.headers.get('retry-after'),
                this.dependencies.clock.now(),
              ) ?? Math.min(5_000 * 2 ** (requestAttempt - 1), 30_000)
          } else if (!response.ok) {
            throw new DiscoveryCommandError(
              `Provider returned HTTP ${response.status}.`,
            )
          } else {
            this.assertWallTime()
            if (kind === 'pageview') {
              this.successfulPageviews += 1
            }
            this.responseHashes.push(responseSha256)
            return { availability: 'available', json, responseSha256 }
          }
        }
      } catch (error) {
        if (error instanceof DiscoveryCommandError) throw error
        retryDelay = Math.min(5_000 * 2 ** (requestAttempt - 1), 30_000)
      } finally {
        this.dependencies.clock.clearTimeout(timeout)
        this.activeRequests -= 1
        this.lastCompletion = this.dependencies.clock.now()
        this.completedAttempts += 1
        this.emitProgressIfDue()
      }

      if (
        requestAttempt === discoveryLimits.maximumAttemptsPerRequest ||
        retryDelay === null
      ) {
        throw new DiscoveryCommandError(
          'Provider request exhausted its retry budget.',
        )
      }
      this.retries += 1
      await this.dependencies.delay(retryDelay)
    }
    throw new DiscoveryCommandError(
      'Provider request exhausted its retry budget.',
    )
  }
}

export function buildWdqsUrl(query: string): URL {
  const url = new URL(wdqsEndpoint)
  url.searchParams.set('query', query)
  url.searchParams.set('format', 'json')
  return url
}

export function buildActionUrl(qids: readonly string[]): URL {
  if (
    qids.length === 0 ||
    qids.length > discoveryLimits.maximumQidsPerActionRequest
  ) {
    throw new DiscoveryCommandError('Action API group is outside its limit.')
  }
  const url = new URL(actionEndpoint)
  url.search = new URLSearchParams({
    action: 'wbgetentities',
    ids: qids.join('|'),
    props: 'sitelinks',
    format: 'json',
    formatversion: '2',
    maxlag: '10',
  }).toString()
  return url
}

export function normalizePageviewArticle(article: string): string {
  return article.replaceAll(' ', '_')
}

export function buildPageviewUrl(language: 'en' | 'ja', article: string): URL {
  return new URL(
    `${pageviewEndpoint}/${language}.wikipedia/all-access/user/${encodeURIComponent(normalizePageviewArticle(article))}/monthly/2025070100/2026063000`,
  )
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size),
  )
}

const transientCandidateSchema = z.strictObject({
  qid: wikidataQidSchema,
  format: z.enum(['tv', 'movie', 'ova', 'ona', 'special']),
  releaseYear: z.number().int().min(1).max(9999).nullable(),
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
  englishMappingInputSha256: z.string().regex(/^[a-f0-9]{64}$/),
  japaneseMappingInputSha256: z.string().regex(/^[a-f0-9]{64}$/),
})
const identityBlockedSchema = z.strictObject({
  qid: wikidataQidSchema,
  disposition: z.literal('identity-blocked'),
  dispositionSha256: z.string().regex(/^[a-f0-9]{64}$/),
})
const requestEvidenceSchema = z.strictObject({
  attempts: z.number().int().nonnegative(),
  successfulPageviews: z.number().int().nonnegative(),
  retries: z.number().int().nonnegative(),
  pacingWaits: z.number().int().nonnegative(),
  pacingDelayMilliseconds: z.number().int().nonnegative(),
  elapsedMilliseconds: z.number().int().nonnegative(),
  maximumConcurrency: z.literal(1),
})
const operationalEvidenceSchema = z.strictObject({
  elapsedMilliseconds: z.number().int().nonnegative(),
  completedHttpAttempts: z.number().int().nonnegative(),
  successfulPageviewRequests: z.number().int().nonnegative(),
  retries: z.number().int().nonnegative(),
  pacingWaits: z.number().int().nonnegative(),
  pacingDelayMilliseconds: z.number().int().nonnegative(),
  maximumObservedConcurrency: z.number().int().min(0).max(1),
})
const terminalOperationalEvidenceSchema = z.strictObject({
  terminalCategory: z.enum(discoveryTerminalCategories),
  ...operationalEvidenceSchema.shape,
})
const candidateReceiptSchema = z.strictObject({
  schema: z.literal('zedarchive.anime-discovery-candidate-receipt'),
  version: z.literal(1),
  release: z.literal('anime-v2'),
  executedAt: z.iso.datetime(),
  window: z.strictObject({
    start: z.literal(discoveryWindow.start),
    end: z.literal(discoveryWindow.end),
  }),
  specificationHashes: z.strictObject({
    query: z.string().regex(/^[a-f0-9]{64}$/),
    mapping: z.string().regex(/^[a-f0-9]{64}$/),
    aggregation: z.string().regex(/^[a-f0-9]{64}$/),
    bands: z.string().regex(/^[a-f0-9]{64}$/),
    ordering: z.string().regex(/^[a-f0-9]{64}$/),
    reasonCodes: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  providerResponseSetSha256: z.string().regex(/^[a-f0-9]{64}$/),
  requestEvidence: requestEvidenceSchema,
  identityBlocked: z.array(identityBlockedSchema),
  candidates: z.array(transientCandidateSchema),
})

export type CandidateReceipt = z.infer<typeof candidateReceiptSchema>

const safeAggregateSchema = z.strictObject({
  schema: z.literal('zedarchive.anime-discovery-safe-aggregate'),
  version: z.literal(1),
  executedAt: z.iso.datetime(),
  candidateReceiptSha256: z.string().regex(/^[a-f0-9]{64}$/),
  providerResponseSetSha256: z.string().regex(/^[a-f0-9]{64}$/),
  eligibleCount: z.number().int().nonnegative(),
  identityBlockedCount: z.number().int().nonnegative(),
  formatCounts: z.strictObject({
    tv: z.number().int().nonnegative(),
    movie: z.number().int().nonnegative(),
    ova: z.number().int().nonnegative(),
    ona: z.number().int().nonnegative(),
    special: z.number().int().nonnegative(),
  }),
  eraCounts: z.record(z.string(), z.number().int().nonnegative()),
  englishAvailability: z.strictObject({
    available: z.number().int().nonnegative(),
    unavailable: z.number().int().nonnegative(),
  }),
  japaneseAvailability: z.strictObject({
    available: z.number().int().nonnegative(),
    unavailable: z.number().int().nonnegative(),
  }),
  englishBandCounts: z.strictObject({
    'top-1-percent': z.number().int().nonnegative(),
    'top-5-percent': z.number().int().nonnegative(),
    'top-20-percent': z.number().int().nonnegative(),
    remainder: z.number().int().nonnegative(),
    unavailable: z.number().int().nonnegative(),
  }),
  japaneseBandCounts: z.strictObject({
    'top-1-percent': z.number().int().nonnegative(),
    'top-5-percent': z.number().int().nonnegative(),
    'top-20-percent': z.number().int().nonnegative(),
    remainder: z.number().int().nonnegative(),
    unavailable: z.number().int().nonnegative(),
  }),
  sitelinkBandCounts: z.strictObject({
    '50-plus': z.number().int().nonnegative(),
    '20-to-49': z.number().int().nonnegative(),
    '5-to-19': z.number().int().nonnegative(),
    '0-to-4': z.number().int().nonnegative(),
  }),
  requestEvidence: requestEvidenceSchema,
})
export type SafeDiscoveryAggregate = z.infer<typeof safeAggregateSchema>

export function createSafeDiscoveryAggregate(
  receiptInput: CandidateReceipt,
): SafeDiscoveryAggregate {
  const receipt = candidateReceiptSchema.parse(receiptInput)
  const formatCounts = { tv: 0, movie: 0, ova: 0, ona: 0, special: 0 }
  const eraCounts: Record<string, number> = {}
  const englishBandCounts: Record<PageviewBand, number> = {
    'top-1-percent': 0,
    'top-5-percent': 0,
    'top-20-percent': 0,
    remainder: 0,
    unavailable: 0,
  }
  const japaneseBandCounts: Record<PageviewBand, number> = {
    'top-1-percent': 0,
    'top-5-percent': 0,
    'top-20-percent': 0,
    remainder: 0,
    unavailable: 0,
  }
  const sitelinkBandCounts = {
    '50-plus': 0,
    '20-to-49': 0,
    '5-to-19': 0,
    '0-to-4': 0,
  }
  let englishAvailable = 0
  let japaneseAvailable = 0
  for (const candidate of receipt.candidates) {
    formatCounts[candidate.format] += 1
    eraCounts[candidate.era] = (eraCounts[candidate.era] ?? 0) + 1
    if (candidate.englishTotal !== null) englishAvailable += 1
    if (candidate.japaneseTotal !== null) japaneseAvailable += 1
    englishBandCounts[candidate.englishBand] += 1
    japaneseBandCounts[candidate.japaneseBand] += 1
    sitelinkBandCounts[candidate.sitelinkBand] += 1
  }
  return safeAggregateSchema.parse({
    schema: 'zedarchive.anime-discovery-safe-aggregate',
    version: 1,
    executedAt: receipt.executedAt,
    candidateReceiptSha256: discoverySha256(receipt),
    providerResponseSetSha256: receipt.providerResponseSetSha256,
    eligibleCount: receipt.candidates.length,
    identityBlockedCount: receipt.identityBlocked.length,
    formatCounts,
    eraCounts,
    englishAvailability: {
      available: englishAvailable,
      unavailable: receipt.candidates.length - englishAvailable,
    },
    japaneseAvailability: {
      available: japaneseAvailable,
      unavailable: receipt.candidates.length - japaneseAvailable,
    },
    englishBandCounts,
    japaneseBandCounts,
    sitelinkBandCounts,
    requestEvidence: receipt.requestEvidence,
  })
}

export function createDiscoveryCommitmentFromCandidateReceipt(
  receiptInput: CandidateReceipt,
  selected: readonly Readonly<{
    qid: string
    reasonCodes: readonly string[]
  }>[],
  reviews: Readonly<{
    primary: 'approved'
    independent: 'approved'
  }>,
) {
  const receipt = candidateReceiptSchema.parse(receiptInput)
  const byQid = new Map(
    receipt.candidates.map((candidate) => [candidate.qid, candidate]),
  )
  const selectedQids = selected.map(({ qid }) => qid)
  const eligibleQids = receipt.candidates
    .map(({ qid }) => qid)
    .sort(compareDiscoveryQids)
  return parseDiscoveryCommitmentReceipt({
    schema: 'zedarchive.anime-discovery-commitment',
    version: 1,
    release: 'anime-v2',
    executedAt: receipt.executedAt,
    window: receipt.window,
    eligibleQidCount: receipt.candidates.length,
    selectedQidCount: selected.length,
    eligibleQidUniverseSha256: hashQidSequence(eligibleQids),
    selectedQidSequenceSha256: hashQidSequence(selectedQids),
    querySpecificationSha256: receipt.specificationHashes.query,
    mappingSpecificationSha256: receipt.specificationHashes.mapping,
    aggregationSpecificationSha256: receipt.specificationHashes.aggregation,
    bandSpecificationSha256: receipt.specificationHashes.bands,
    orderingSpecificationSha256: receipt.specificationHashes.ordering,
    reasonCodeSpecificationSha256: receipt.specificationHashes.reasonCodes,
    providerResponseSetSha256: receipt.providerResponseSetSha256,
    ignoredCandidateReceiptSha256: discoverySha256(receipt),
    records: selected.map(({ qid, reasonCodes }) => {
      const candidate = byQid.get(qid)
      if (candidate === undefined) {
        throw new DiscoveryCommandError(
          'Selected QID is absent from the frozen candidate receipt.',
        )
      }
      return {
        qid,
        englishAvailable: candidate.englishTotal !== null,
        japaneseAvailable: candidate.japaneseTotal !== null,
        englishBand: candidate.englishBand,
        japaneseBand: candidate.japaneseBand,
        sitelinkBand: candidate.sitelinkBand,
        reasonCodes,
        englishMappingInputSha256: candidate.englishMappingInputSha256,
        japaneseMappingInputSha256: candidate.japaneseMappingInputSha256,
      }
    }),
    reviews,
  })
}

async function readV1PredecessorQids(): Promise<ReadonlySet<string>> {
  const input = JSON.parse(await readFile(v1CorpusPath, 'utf8')) as unknown
  const schema = z.strictObject({
    schema: z.literal('zedarchive.anime-release-corpus'),
    version: z.literal(1),
    release: z.literal(1),
    items: z.array(
      z
        .strictObject({
          sources: z.array(
            z.strictObject({
              sourceKey: z.string(),
              sourceItemId: z.string(),
            }),
          ),
        })
        .passthrough(),
    ),
  })
  const corpus = schema.parse(input)
  return new Set(
    corpus.items.flatMap(({ sources }) =>
      sources
        .filter(({ sourceKey }) => sourceKey === 'wikidata')
        .map(({ sourceItemId }) => wikidataQidSchema.parse(sourceItemId)),
    ),
  )
}

export async function publishCandidateReceiptAtomically(
  receipt: CandidateReceipt,
  outputDirectory = defaultOutputDirectory,
): Promise<string> {
  const validated = candidateReceiptSchema.parse(receipt)
  const safeAggregate = createSafeDiscoveryAggregate(validated)
  const finalDirectory = join(outputDirectory, 'frozen-run')
  try {
    await lstat(finalDirectory)
    throw new DiscoveryCommandError(
      'A frozen discovery run already exists; no resume or overwrite is allowed.',
    )
  } catch (error) {
    if (
      error instanceof DiscoveryCommandError ||
      (error as NodeJS.ErrnoException).code !== 'ENOENT'
    ) {
      throw error
    }
  }
  await mkdir(outputDirectory, { recursive: true })
  const stagingDirectory = join(outputDirectory, `.staging-${randomUUID()}`)
  try {
    await mkdir(stagingDirectory)
    await writeFile(
      join(stagingDirectory, 'candidate-receipt.json'),
      `${JSON.stringify(validated, null, 2)}\n`,
      { encoding: 'utf8', flag: 'wx' },
    )
    await writeFile(
      join(stagingDirectory, 'safe-aggregate.json'),
      `${JSON.stringify(safeAggregate, null, 2)}\n`,
      { encoding: 'utf8', flag: 'wx' },
    )
    await rename(stagingDirectory, finalDirectory)
    return finalDirectory
  } catch (error) {
    await rm(stagingDirectory, { force: true, recursive: true })
    throw error
  }
}

const reviewedSelectionSchema = z.strictObject({
  schema: z.literal('zedarchive.anime-discovery-reviewed-selection'),
  version: z.literal(1),
  candidateReceiptSha256: z.string().regex(/^[a-f0-9]{64}$/),
  selected: z
    .array(
      z.strictObject({
        qid: wikidataQidSchema,
        reasonCodes: z
          .array(
            z.enum([
              'predecessor',
              'audience-en',
              'audience-ja',
              'multilingual-coverage',
              'coverage-cell',
              'franchise-continuity',
            ]),
          )
          .min(1),
      }),
    )
    .length(5_000),
  reviews: z.strictObject({
    primary: z.literal('approved'),
    independent: z.literal('approved'),
  }),
})
export type ReviewedDiscoverySelection = z.infer<typeof reviewedSelectionSchema>

type FinalizationDependencies = Readonly<{
  removeCandidate?: (path: string) => Promise<void>
}>

export async function finalizeDiscoveryReceipt(
  outputDirectory = defaultOutputDirectory,
  dependencies: FinalizationDependencies = {},
): Promise<string> {
  const frozenDirectory = join(outputDirectory, 'frozen-run')
  const candidatePath = join(frozenDirectory, 'candidate-receipt.json')
  const selectionPath = join(frozenDirectory, 'reviewed-selection.json')
  const durablePath = join(frozenDirectory, 'discovery-commitment.json')
  const entries = await readdir(frozenDirectory)
  const priorStagingPaths = entries
    .filter((entry) => entry.startsWith('.commitment-staging-'))
    .map((entry) => join(frozenDirectory, entry))

  const candidate = candidateReceiptSchema.parse(
    JSON.parse(await readFile(candidatePath, 'utf8')) as unknown,
  )
  const selection = reviewedSelectionSchema.parse(
    JSON.parse(await readFile(selectionPath, 'utf8')) as unknown,
  )
  if (selection.candidateReceiptSha256 !== discoverySha256(candidate)) {
    throw new DiscoveryCommandError(
      'Reviewed selection does not match the frozen candidate receipt.',
    )
  }
  const commitment = createDiscoveryCommitmentFromCandidateReceipt(
    candidate,
    selection.selected,
    selection.reviews,
  )
  for (const priorStagingPath of priorStagingPaths) {
    const priorStaging = parseDiscoveryCommitmentReceipt(
      JSON.parse(await readFile(priorStagingPath, 'utf8')) as unknown,
    )
    if (discoverySha256(priorStaging) !== discoverySha256(commitment)) {
      throw new DiscoveryCommandError(
        'Interrupted discovery finalization does not match the frozen review.',
      )
    }
  }
  try {
    const existing = parseDiscoveryCommitmentReceipt(
      JSON.parse(await readFile(durablePath, 'utf8')) as unknown,
    )
    if (discoverySha256(existing) !== discoverySha256(commitment)) {
      throw new DiscoveryCommandError(
        'Existing discovery commitment does not match the frozen review.',
      )
    }
    await Promise.all(
      priorStagingPaths.map((priorStagingPath) =>
        rm(priorStagingPath, { force: true }),
      ),
    )
    await (dependencies.removeCandidate ?? rm)(candidatePath)
    return durablePath
  } catch (error) {
    if (
      error instanceof DiscoveryCommandError ||
      (error as NodeJS.ErrnoException).code !== 'ENOENT'
    ) {
      throw error
    }
  }
  await Promise.all(
    priorStagingPaths.map((priorStagingPath) =>
      rm(priorStagingPath, { force: true }),
    ),
  )

  const stagingPath = join(
    frozenDirectory,
    `.commitment-staging-${randomUUID()}`,
  )
  let durableLinked = false
  try {
    await writeFile(stagingPath, `${JSON.stringify(commitment, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    })
    await link(stagingPath, durablePath)
    durableLinked = true
    await rm(stagingPath)
    const persisted = parseDiscoveryCommitmentReceipt(
      JSON.parse(await readFile(durablePath, 'utf8')) as unknown,
    )
    if (discoverySha256(persisted) !== discoverySha256(commitment)) {
      throw new DiscoveryCommandError(
        'Persisted discovery commitment failed verification.',
      )
    }
    await (dependencies.removeCandidate ?? rm)(candidatePath)
    return durablePath
  } catch (error) {
    await rm(stagingPath, { force: true })
    if (durableLinked) {
      await rm(durablePath, { force: true })
    }
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new DiscoveryCommandError(
        'A durable discovery commitment already exists; overwrite is prohibited.',
      )
    }
    throw error
  }
}

export async function assertDiscoveryOutputVacant(
  outputDirectory = defaultOutputDirectory,
): Promise<void> {
  try {
    const entries = await readdir(outputDirectory)
    if (
      entries.includes('frozen-run') ||
      entries.some((entry) => entry.startsWith('.staging-'))
    ) {
      throw new DiscoveryCommandError(
        'Discovery output contains a prior or interrupted run; no resume or overwrite is allowed.',
      )
    }
  } catch (error) {
    if (
      error instanceof DiscoveryCommandError ||
      (error as NodeJS.ErrnoException).code !== 'ENOENT'
    ) {
      throw error
    }
  }
}

type DiscoveryRequester = Readonly<{
  request: (url: URL, kind: RequestKind) => Promise<RequestResult>
  responseHashes: readonly string[]
  evidence: z.infer<typeof requestEvidenceSchema>
  assertWithinWallTime?: () => void
  reportTerminal?: (category: DiscoveryTerminalCategory) => void
}>

type RunDependencies = Readonly<{
  requester?: DiscoveryRequester
  readPredecessorQids?: () => Promise<ReadonlySet<string>>
  assertOutputVacant?: () => Promise<void>
  publishReceipt?: (receipt: CandidateReceipt) => Promise<string>
  environment?: DiscoveryEnvironment
  now?: () => Date
  log?: (message: string) => void
}>

function discoveryTerminalCategory(error: unknown): DiscoveryTerminalCategory {
  if (!(error instanceof DiscoveryCommandError)) return 'unexpected-stop'
  if (error.message === 'Discovery exceeded its wall-time limit.') {
    return 'wall-time-limit'
  }
  if (error.message === 'Discovery exceeded its total HTTP-attempt limit.') {
    return 'http-attempt-limit'
  }
  if (error.message === 'Discovery exceeded its successful pageview limit.') {
    return 'pageview-limit'
  }
  if (error.message === 'Discovery attempted concurrent provider requests.') {
    return 'concurrency-stop'
  }
  if (error.message === 'Provider request exhausted its retry budget.') {
    return 'request-budget-stop'
  }
  return 'bounded-stop'
}

async function withDiscoveryTerminalEvidence<T>(
  requester: DiscoveryRequester,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    requester.reportTerminal?.(discoveryTerminalCategory(error))
    throw error
  }
}

export async function runDiscovery(
  dependencies: RunDependencies = {},
): Promise<Readonly<{ receipt: CandidateReceipt; outputPath: string }>> {
  assertDiscoveryRuntimeEnvironment(dependencies.environment ?? process.env)
  const requester =
    dependencies.requester ??
    new SequentialDiscoveryRequester({
      fetch,
      delay: (milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)),
      clock: { now: Date.now, setTimeout, clearTimeout },
      log: dependencies.log,
    })
  return withDiscoveryTerminalEvidence(requester, async () => {
    await (dependencies.assertOutputVacant ?? assertDiscoveryOutputVacant)()
    const predecessors = await (
      dependencies.readPredecessorQids ?? readV1PredecessorQids
    )()
    const structuralRows: DiscoveryRow[] = []
    for (const query of Object.values(buildWdqsQueries())) {
      const result = await requester.request(buildWdqsUrl(query), 'wdqs')
      if (result.availability !== 'available') {
        throw new DiscoveryCommandError(
          'WDQS unexpectedly returned unavailable.',
        )
      }
      structuralRows.push(...parseWdqsRows(result.json))
    }
    const reduced = reduceDiscoveryRows(structuralRows, predecessors)
    assertEligiblePopulation(reduced.eligible.length)
    assertCandidateHeadroom(reduced.eligible)

    const mappings: ArticleMapping[] = []
    for (const group of chunks(
      reduced.eligible.map(({ qid }) => qid),
      discoveryLimits.maximumQidsPerActionRequest,
    )) {
      const result = await requester.request(buildActionUrl(group), 'action')
      if (result.availability !== 'available') {
        throw new DiscoveryCommandError(
          'Wikidata unexpectedly returned unavailable.',
        )
      }
      mappings.push(...parseActionMappings(result.json, group))
    }
    const articleOwners = new Set<string>()
    for (const mapping of mappings) {
      for (const [language, title] of [
        ['en', mapping.englishTitle],
        ['ja', mapping.japaneseTitle],
      ] as const) {
        if (title === null) continue
        const key = `${language}:${title.normalize('NFC')}`
        if (articleOwners.has(key)) {
          throw new DiscoveryCommandError(
            'A Wikipedia article maps to multiple candidate QIDs.',
          )
        }
        articleOwners.add(key)
      }
    }

    const audienceInputs: {
      qid: string
      englishTitle: string | null
      japaneseTitle: string | null
      sitelinkCount: number
      englishTotal: number | null
      japaneseTotal: number | null
    }[] = []
    for (const mapping of mappings) {
      const totals: Record<'en' | 'ja', number | null> = { en: null, ja: null }
      for (const [language, title] of [
        ['en', mapping.englishTitle],
        ['ja', mapping.japaneseTitle],
      ] as const) {
        if (title === null) continue
        const result = await requester.request(
          buildPageviewUrl(language, title),
          'pageview',
        )
        if (result.availability === 'available') {
          totals[language] = aggregateMonthlyPageviews(
            parsePageviewMonths(result.json, {
              language,
              article: normalizePageviewArticle(title),
            }),
          )
        }
      }
      audienceInputs.push({
        ...mapping,
        englishTotal: totals.en,
        japaneseTotal: totals.ja,
      })
    }

    const englishBands = assignPageviewBands(
      audienceInputs.map(({ qid, englishTotal }) => ({
        qid,
        total: englishTotal,
      })),
    )
    const japaneseBands = assignPageviewBands(
      audienceInputs.map(({ qid, japaneseTotal }) => ({
        qid,
        total: japaneseTotal,
      })),
    )
    const byQid = new Map(
      reduced.eligible.map((candidate) => [candidate.qid, candidate]),
    )
    const candidates = audienceInputs
      .map((input) => {
        const candidate = byQid.get(input.qid)
        const englishBand = englishBands.get(input.qid)
        const japaneseBand = japaneseBands.get(input.qid)
        if (
          candidate === undefined ||
          englishBand === undefined ||
          japaneseBand === undefined
        ) {
          throw new DiscoveryCommandError(
            'Discovery candidate mapping is incomplete.',
          )
        }
        return transientCandidateSchema.parse({
          ...candidate,
          englishArticle: input.englishTitle,
          japaneseArticle: input.japaneseTitle,
          englishTotal: input.englishTotal,
          japaneseTotal: input.japaneseTotal,
          englishBand,
          japaneseBand,
          sitelinkCount: input.sitelinkCount,
          sitelinkBand: toSitelinkBand(input.sitelinkCount),
          englishMappingInputSha256: discoverySha256({
            qid: input.qid,
            englishArticle: input.englishTitle,
          }),
          japaneseMappingInputSha256: discoverySha256({
            qid: input.qid,
            japaneseArticle: input.japaneseTitle,
          }),
        })
      })
      .sort((left, right) =>
        compareAudienceCandidates(
          {
            qid: left.qid,
            englishBand: left.englishBand as PageviewBand,
            japaneseBand: left.japaneseBand as PageviewBand,
            sitelinkBand: left.sitelinkBand as ReturnType<
              typeof toSitelinkBand
            >,
          },
          {
            qid: right.qid,
            englishBand: right.englishBand as PageviewBand,
            japaneseBand: right.japaneseBand as PageviewBand,
            sitelinkBand: right.sitelinkBand as ReturnType<
              typeof toSitelinkBand
            >,
          },
        ),
      )
    const receipt = candidateReceiptSchema.parse({
      schema: 'zedarchive.anime-discovery-candidate-receipt',
      version: 1,
      release: 'anime-v2',
      executedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
      window: { start: discoveryWindow.start, end: discoveryWindow.end },
      specificationHashes: discoverySpecificationHashes,
      providerResponseSetSha256: discoverySha256(
        [...requester.responseHashes].sort(),
      ),
      requestEvidence: requester.evidence,
      identityBlocked: reduced.identityBlocked,
      candidates,
    })
    requester.assertWithinWallTime?.()
    const outputPath = await (
      dependencies.publishReceipt ?? publishCandidateReceiptAtomically
    )(receipt)
    const safeAggregate = createSafeDiscoveryAggregate(receipt)
    dependencies.log?.(
      `Promoted one bounded discovery receipt: ${JSON.stringify({
        eligibleCount: safeAggregate.eligibleCount,
        identityBlockedCount: safeAggregate.identityBlockedCount,
        requestEvidence: safeAggregate.requestEvidence,
      })}`,
    )
    return { receipt, outputPath }
  })
}

export async function runDiscoveryCommand(
  argumentsToParse: readonly string[],
  dependencies: RunDependencies = {},
): Promise<void> {
  const command = parseDiscoveryArguments(argumentsToParse)
  const queries = buildWdqsQueries()
  if (
    Object.keys(queries).length !== 5 ||
    Object.values(queries).some(
      (query) =>
        !query.includes('p:P31') ||
        !query.includes('p:P577') ||
        !query.includes('psv:P577') ||
        !query.includes('p:P580') ||
        !query.includes('psv:P580') ||
        !query.includes('wikibase:timePrecision') ||
        !query.includes('MIN(YEAR(?publicationDate)) AS ?publicationYear') ||
        !query.includes('MIN(YEAR(?startDate)) AS ?startYear') ||
        !query.includes('AS ?publicationYear') ||
        !query.includes('AS ?startYear') ||
        !query.includes(
          'FILTER(?publicationRank != wikibase:DeprecatedRank)',
        ) ||
        !query.includes('FILTER(?startRank != wikibase:DeprecatedRank)') ||
        !query.includes('wikibase:rank') ||
        !query.includes('wikibase:DeprecatedRank') ||
        query.includes('COALESCE') ||
        query.includes('P571') ||
        query.includes('wdt:P577') ||
        query.includes('wdt:P580'),
    )
  ) {
    throw new DiscoveryCommandError(
      'Committed discovery query contract is invalid.',
    )
  }
  if (command.mode === 'check') {
    dependencies.log?.('Validated the bounded anime-v2 discovery contract.')
    return
  }
  if (command.mode === 'finalize') {
    const durablePath = await finalizeDiscoveryReceipt()
    dependencies.log?.(
      `Finalized the dual-approved discovery commitment at ${durablePath}.`,
    )
    return
  }
  await runDiscovery(dependencies)
}

export function formatDiscoveryCommandError(error: unknown): string {
  if (error instanceof DiscoveryCommandError) return error.message
  return 'Catalogue discovery failed without promoting a candidate receipt.'
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectExecution) {
  runDiscoveryCommand(process.argv.slice(2), { log: console.log }).catch(
    (error: unknown) => {
      console.error(formatDiscoveryCommandError(error))
      process.exitCode = 1
    },
  )
}

import {
  parseWikidataEntityResponse,
  type WikidataEntity,
} from '@/integrations/wikidata/wikidata-entity'
import {
  wikidataApiEndpoint,
  wikidataImporterUserAgent,
} from '@/integrations/wikidata/wikidata-constants'

export { wikidataApiEndpoint, wikidataImporterUserAgent }

const qidsPerRequest = 25
const requestTimeoutMilliseconds = 10_000
const maximumAttempts = 3
const maximumRetryDelayMilliseconds = 30_000
const maximumResponseBytes = 5 * 1024 * 1024

type TimerHandle = ReturnType<typeof setTimeout>

export type WikidataClientClock = {
  now: () => number
  setTimeout: (callback: () => void, milliseconds: number) => TimerHandle
  clearTimeout: (handle: TimerHandle) => void
}

export type WikidataClientDependencies = {
  fetch?: typeof fetch
  delay?: (milliseconds: number) => Promise<void>
  clock?: WikidataClientClock
}

export class WikidataClientError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WikidataClientError'
  }
}

const defaultClock: WikidataClientClock = {
  now: Date.now,
  setTimeout,
  clearTimeout,
}

function defaultDelay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function buildRequestUrl(qids: readonly string[]): string {
  const url = new URL(wikidataApiEndpoint)
  url.search = new URLSearchParams({
    action: 'wbgetentities',
    ids: qids.join('|'),
    props: 'labels|aliases|claims',
    languages: 'en|ja',
    format: 'json',
    formatversion: '2',
  }).toString()
  return url.href
}

function retryDelayFromHeader(
  retryAfter: string | null,
  now: number,
): number | undefined {
  if (retryAfter === null) {
    return undefined
  }

  const seconds = Number(retryAfter)
  let delay: number

  if (Number.isFinite(seconds) && seconds >= 0) {
    delay = seconds * 1000
  } else {
    const retryDate = Date.parse(retryAfter)

    if (Number.isNaN(retryDate)) {
      return undefined
    }

    delay = Math.max(0, retryDate - now)
  }

  if (delay > maximumRetryDelayMilliseconds) {
    throw new WikidataClientError(
      'Wikidata requested a retry delay longer than 30 seconds; try again later.',
    )
  }

  return delay
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || [500, 502, 503, 504].includes(status)
}

async function readBoundedResponseBody(
  response: Response,
  qids: readonly string[],
): Promise<string> {
  const contentLength = response.headers.get('content-length')

  if (
    contentLength !== null &&
    Number.isFinite(Number(contentLength)) &&
    Number(contentLength) > maximumResponseBytes
  ) {
    await response.body?.cancel().catch(() => undefined)
    throw new WikidataClientError(
      `Wikidata response was too large for QIDs ${qids.join(', ')}.`,
    )
  }

  if (response.body === null) {
    return ''
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const chunks: string[] = []
  let receivedBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      receivedBytes += value.byteLength

      if (receivedBytes > maximumResponseBytes) {
        await reader.cancel().catch(() => undefined)
        throw new WikidataClientError(
          `Wikidata response was too large for QIDs ${qids.join(', ')}.`,
        )
      }

      chunks.push(decoder.decode(value, { stream: true }))
    }

    chunks.push(decoder.decode())
    return chunks.join('')
  } finally {
    reader.releaseLock()
  }
}

async function responseJson(response: Response, qids: readonly string[]) {
  const body = await readBoundedResponseBody(response, qids)

  try {
    return JSON.parse(body) as unknown
  } catch {
    throw new WikidataClientError(
      `Wikidata returned malformed JSON for QIDs ${qids.join(', ')}.`,
    )
  }
}

async function fetchChunk(
  qids: readonly string[],
  dependencies: Required<WikidataClientDependencies>,
): Promise<Record<string, WikidataEntity>> {
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    const controller = new AbortController()
    const timeoutHandle = dependencies.clock.setTimeout(
      () => controller.abort(),
      requestTimeoutMilliseconds,
    )
    let retryDelay: number | undefined

    try {
      const response = await dependencies.fetch(buildRequestUrl(qids), {
        headers: { 'User-Agent': wikidataImporterUserAgent },
        signal: controller.signal,
      })

      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined)

        if (
          !isRetryableStatus(response.status) ||
          attempt === maximumAttempts
        ) {
          throw new WikidataClientError(
            `Wikidata returned HTTP ${response.status} on attempt ${attempt} for QIDs ${qids.join(', ')}.`,
          )
        }

        retryDelay =
          retryDelayFromHeader(
            response.headers.get('retry-after'),
            dependencies.clock.now(),
          ) ?? 1000 * 2 ** (attempt - 1)
      } else {
        let parsedResponse
        const responseBody = await responseJson(response, qids)

        try {
          parsedResponse = parseWikidataEntityResponse(responseBody)
        } catch {
          throw new WikidataClientError(
            `Wikidata returned an invalid response for QIDs ${qids.join(', ')}.`,
          )
        }

        for (const qid of qids) {
          if (parsedResponse.entities[qid] === undefined) {
            throw new WikidataClientError(
              `Wikidata omitted requested entity ${qid}.`,
            )
          }
        }

        return parsedResponse.entities
      }
    } catch (error) {
      if (error instanceof WikidataClientError) {
        throw error
      }

      if (attempt === maximumAttempts) {
        throw new WikidataClientError(
          `Wikidata request failed after ${attempt} attempts for QIDs ${qids.join(', ')}.`,
        )
      }

      retryDelay = 1000 * 2 ** (attempt - 1)
    } finally {
      dependencies.clock.clearTimeout(timeoutHandle)
    }

    await dependencies.delay(retryDelay)
  }

  throw new WikidataClientError('Wikidata request exhausted its retry budget.')
}

export async function fetchWikidataEntities(
  qids: readonly string[],
  dependencies: WikidataClientDependencies = {},
): Promise<Record<string, WikidataEntity>> {
  const resolvedDependencies: Required<WikidataClientDependencies> = {
    fetch: dependencies.fetch ?? globalThis.fetch,
    delay: dependencies.delay ?? defaultDelay,
    clock: dependencies.clock ?? defaultClock,
  }
  const entities: Record<string, WikidataEntity> = {}

  for (let index = 0; index < qids.length; index += qidsPerRequest) {
    const chunk = qids.slice(index, index + qidsPerRequest)
    Object.assign(entities, await fetchChunk(chunk, resolvedDependencies))
  }

  return entities
}

import { randomUUID } from 'node:crypto'
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import {
  releaseCriticalApplicationOrigin,
  releaseCriticalHibpPath,
  releaseCriticalHibpOrigin,
  releaseCriticalInboxPath,
  releaseCriticalResendOrigin,
} from './release-critical-constants'

const maximumProviderBodyBytes = 64 * 1024
const verificationSubject = 'Verify your email for zedarchive'
const verificationCategory = 'email_verification'
const fixedCollectorError = 'M41 collector rejected the request'

type CollectorConfiguration = Readonly<{
  recipient: string
  fromAddress: string
  replyToAddress: string
}>

type CollectorEvidence = Readonly<{
  hibpRequestCount: number
  emailAccepted: boolean
  inboxReady: boolean
}>

function fixedResponse(
  response: ServerResponse,
  status: number,
  contentType: string,
  body: string,
) {
  response
    .writeHead(status, {
      'cache-control': 'no-store',
      connection: 'close',
      'content-type': contentType,
      'content-length': Buffer.byteLength(body),
    })
    .end(body)
}

function readBoundedBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let rejected = false

    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > maximumProviderBodyBytes) {
        rejected = true
        chunks.length = 0
      } else if (!rejected) {
        chunks.push(chunk)
      }
    })
    request.on('end', () => {
      if (rejected) {
        reject(new TypeError(fixedCollectorError))
      } else {
        resolve(Buffer.concat(chunks))
      }
    })
    request.on('error', () => reject(new TypeError(fixedCollectorError)))
  })
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}

function exactKeys(value: Record<string, unknown>, expected: string[]) {
  const actual = Object.keys(value).sort()
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === [...expected].sort()[index])
  )
}

function exactRecipient(value: unknown, expected: string) {
  return (
    value === expected ||
    (Array.isArray(value) && value.length === 1 && value[0] === expected)
  )
}

function decodeMinimalHtmlAttribute(value: string) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
}

function verificationUrlsFromText(value: string) {
  return (
    value.match(
      /http:\/\/127\.0\.0\.1:3103\/verify-email#token=[^\s<>"']+/gu,
    ) ?? []
  )
}

function verificationUrlsFromHtml(value: string) {
  const urls: string[] = []
  for (const match of value.matchAll(
    /(?:href="([^"]+)"|http:\/\/127\.0\.0\.1:3103\/verify-email#token=[^\s<>"']+)/gu,
  )) {
    urls.push(decodeMinimalHtmlAttribute(match[1] ?? match[0]))
  }
  return urls
}

function validateVerificationUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new TypeError(fixedCollectorError)
  }

  const fragment = new URLSearchParams(url.hash.slice(1))
  const tokens = fragment.getAll('token')
  if (
    url.origin !== releaseCriticalApplicationOrigin ||
    url.pathname !== '/verify-email' ||
    url.search !== '' ||
    tokens.length !== 1 ||
    tokens[0] === '' ||
    [...fragment.keys()].some((key) => key !== 'token')
  ) {
    throw new TypeError(fixedCollectorError)
  }

  return url
}

function parseVerificationMessage(
  body: Buffer,
  headers: IncomingMessage['headers'],
  configuration: CollectorConfiguration,
): URL {
  let parsed: unknown
  try {
    parsed = JSON.parse(body.toString('utf8'))
  } catch {
    throw new TypeError(fixedCollectorError)
  }

  if (
    !isPlainObject(parsed) ||
    !exactKeys(parsed, [
      'from',
      'html',
      'reply_to',
      'subject',
      'tags',
      'text',
      'to',
    ]) ||
    parsed.from !== `zedarchive <${configuration.fromAddress}>` ||
    parsed.reply_to !== configuration.replyToAddress ||
    parsed.subject !== verificationSubject ||
    !exactRecipient(parsed.to, configuration.recipient) ||
    typeof parsed.text !== 'string' ||
    typeof parsed.html !== 'string' ||
    !Array.isArray(parsed.tags) ||
    parsed.tags.length !== 1 ||
    !isPlainObject(parsed.tags[0]) ||
    !exactKeys(parsed.tags[0], ['name', 'value']) ||
    parsed.tags[0].name !== 'category' ||
    parsed.tags[0].value !== verificationCategory ||
    typeof headers['idempotency-key'] !== 'string' ||
    !/^auth-email\/email_verification\/[a-f0-9]{64}$/u.test(
      headers['idempotency-key'],
    )
  ) {
    throw new TypeError(fixedCollectorError)
  }

  const candidates = [
    ...verificationUrlsFromText(parsed.text),
    ...verificationUrlsFromHtml(parsed.html),
  ]
  const unique = [...new Set(candidates)]
  if (unique.length !== 1 || candidates.length < 3) {
    throw new TypeError(fixedCollectorError)
  }

  return validateVerificationUrl(unique[0]!)
}

function escapeHtmlAttribute(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function listen(server: Server, origin: string): Promise<void> {
  const url = new URL(origin)
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(Number(url.port), url.hostname, () => {
      server.off('error', reject)
      resolve()
    })
  })
}

function close(server: Server | undefined): Promise<void> {
  if (server === undefined || !server.listening) {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
    server.closeAllConnections()
  })
}

export class LoopbackAuthCollectors {
  readonly #configuration: CollectorConfiguration
  #resendServer: Server | undefined
  #hibpServer: Server | undefined
  #verificationUrl: URL | undefined
  #hibpRequestCount = 0
  #emailAccepted = false
  #messageWaiters: Array<() => void> = []

  constructor(configuration: CollectorConfiguration) {
    this.#configuration = configuration
  }

  get inboxUrl() {
    return `${releaseCriticalResendOrigin}${releaseCriticalInboxPath}`
  }

  evidence(): CollectorEvidence {
    return {
      hibpRequestCount: this.#hibpRequestCount,
      emailAccepted: this.#emailAccepted,
      inboxReady: this.#verificationUrl !== undefined,
    }
  }

  async start() {
    if (this.#resendServer !== undefined || this.#hibpServer !== undefined) {
      throw new TypeError('M41 collectors are already running')
    }

    this.#resendServer = createServer((request, response) => {
      void this.#handleResendRequest(request, response)
    })
    this.#hibpServer = createServer((request, response) => {
      this.#handleHibpRequest(request, response)
    })

    try {
      await listen(this.#resendServer, releaseCriticalResendOrigin)
      await listen(this.#hibpServer, releaseCriticalHibpOrigin)
    } catch {
      await this.stop()
      throw new TypeError('M41 collectors could not start')
    }
  }

  async waitForVerificationMessage(timeoutMilliseconds = 10_000) {
    if (this.#verificationUrl !== undefined) {
      return
    }

    await new Promise<void>((resolve, reject) => {
      const ready = () => {
        clearTimeout(timeout)
        resolve()
      }
      const timeout = setTimeout(() => {
        const index = this.#messageWaiters.indexOf(ready)
        if (index !== -1) this.#messageWaiters.splice(index, 1)
        reject(new TypeError('M41 verification message was not received'))
      }, timeoutMilliseconds)

      this.#messageWaiters.push(ready)
    })
  }

  clear() {
    this.#verificationUrl = undefined
    this.#hibpRequestCount = 0
    this.#emailAccepted = false
    this.#messageWaiters = []
  }

  async stop() {
    const resendServer = this.#resendServer
    const hibpServer = this.#hibpServer
    this.#resendServer = undefined
    this.#hibpServer = undefined

    await Promise.all([close(resendServer), close(hibpServer)])
    this.clear()
  }

  async #handleResendRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ) {
    const requestUrl = new URL(request.url ?? '/', releaseCriticalResendOrigin)

    if (
      request.method === 'GET' &&
      requestUrl.pathname === releaseCriticalInboxPath &&
      requestUrl.search === ''
    ) {
      if (this.#verificationUrl === undefined) {
        fixedResponse(response, 404, 'text/plain; charset=utf-8', 'Not ready')
        return
      }

      const body = [
        '<!doctype html>',
        '<html lang="en"><head><meta charset="utf-8"><title>M41 inbox</title></head>',
        '<body><main><h1>Verification message</h1>',
        `<a href="${escapeHtmlAttribute(this.#verificationUrl.toString())}">Verify email</a>`,
        '</main></body></html>',
      ].join('')
      fixedResponse(response, 200, 'text/html; charset=utf-8', body)
      return
    }

    if (
      request.method !== 'POST' ||
      requestUrl.pathname !== '/emails' ||
      requestUrl.search !== ''
    ) {
      fixedResponse(response, 404, 'text/plain; charset=utf-8', 'Not found')
      return
    }

    try {
      const body = await readBoundedBody(request)
      if (this.#verificationUrl !== undefined) {
        throw new TypeError(fixedCollectorError)
      }
      this.#verificationUrl = parseVerificationMessage(
        body,
        request.headers,
        this.#configuration,
      )
      this.#emailAccepted = true
      for (const resolve of this.#messageWaiters.splice(0)) resolve()
      fixedResponse(
        response,
        200,
        'application/json; charset=utf-8',
        JSON.stringify({ id: randomUUID() }),
      )
    } catch {
      fixedResponse(
        response,
        400,
        'application/json; charset=utf-8',
        JSON.stringify({ message: fixedCollectorError }),
      )
    }
  }

  #handleHibpRequest(request: IncomingMessage, response: ServerResponse) {
    const requestUrl = new URL(request.url ?? '/', releaseCriticalHibpOrigin)
    if (
      request.method !== 'GET' ||
      requestUrl.pathname !== releaseCriticalHibpPath ||
      requestUrl.search !== ''
    ) {
      fixedResponse(response, 404, 'text/plain; charset=utf-8', 'Not found')
      return
    }

    this.#hibpRequestCount += 1
    fixedResponse(response, 200, 'text/plain; charset=utf-8', '')
  }
}

import { describe, expect, it, vi } from 'vitest'
import {
  fetchWikidataEntities,
  wikidataApiEndpoint,
  wikidataImporterUserAgent,
} from '@/integrations/wikidata/wikidata-client'

function entityResponse(qids: readonly string[]): Response {
  return new Response(
    JSON.stringify({
      entities: Object.fromEntries(
        qids.map((qid) => [
          qid,
          { id: qid, type: 'item', labels: {}, aliases: {}, claims: {} },
        ]),
      ),
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

describe('fetchWikidataEntities', () => {
  it('uses the approved endpoint, operation, languages, and user agent', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(entityResponse(['Q1', 'Q2'])))

    await fetchWikidataEntities(['Q1', 'Q2'], { fetch: fetchMock })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as unknown as [
      string | URL | Request,
      RequestInit,
    ]
    const url = new URL(String(requestUrl))
    expect(`${url.origin}${url.pathname}`).toBe(wikidataApiEndpoint)
    expect(url.searchParams.get('action')).toBe('wbgetentities')
    expect(url.searchParams.get('ids')).toBe('Q1|Q2')
    expect(url.searchParams.get('props')).toBe('labels|aliases|claims')
    expect(url.searchParams.get('languages')).toBe('en|ja')
    expect(url.searchParams.get('formatversion')).toBe('2')
    expect(requestInit?.headers).toEqual({
      'User-Agent': wikidataImporterUserAgent,
    })
  })

  it('processes 25-QID chunks sequentially and preserves all entities', async () => {
    const qids = Array.from({ length: 26 }, (_, index) => `Q${index + 1}`)
    let activeRequests = 0
    let maximumActiveRequests = 0
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      activeRequests += 1
      maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests)
      const requestedQids =
        new URL(String(input)).searchParams.get('ids')?.split('|') ?? []
      await Promise.resolve()
      activeRequests -= 1
      return entityResponse(requestedQids)
    })

    const entities = await fetchWikidataEntities(qids, { fetch: fetchMock })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(maximumActiveRequests).toBe(1)
    expect(Object.keys(entities)).toEqual(qids)
  })

  it('retries 429 and retryable server responses with bounded delays', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('', { status: 429, headers: { 'retry-after': '2' } }),
      )
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(entityResponse(['Q1']))
    const delay = vi.fn(() => Promise.resolve())

    await expect(
      fetchWikidataEntities(['Q1'], { fetch: fetchMock, delay }),
    ).resolves.toHaveProperty('Q1')
    expect(delay).toHaveBeenNthCalledWith(1, 2000)
    expect(delay).toHaveBeenNthCalledWith(2, 2000)
  })

  it('does not retry non-retryable responses or malformed success bodies', async () => {
    const badRequest = vi.fn(() =>
      Promise.resolve(new Response('', { status: 400 })),
    )
    await expect(
      fetchWikidataEntities(['Q1'], { fetch: badRequest }),
    ).rejects.toThrow('HTTP 400')
    expect(badRequest).toHaveBeenCalledOnce()

    const malformed = vi.fn(() =>
      Promise.resolve(new Response('{invalid', { status: 200 })),
    )
    await expect(
      fetchWikidataEntities(['Q1'], { fetch: malformed }),
    ).rejects.toThrow('malformed JSON')
    expect(malformed).toHaveBeenCalledOnce()
  })

  it('retries network failures at most three times without exposing dependency errors', async () => {
    const secret = 'private-request-detail'
    const fetchMock = vi.fn(() => Promise.reject(new Error(secret)))
    const delay = vi.fn(() => Promise.resolve())

    let error: unknown
    try {
      await fetchWikidataEntities(['Q1'], { fetch: fetchMock, delay })
    } catch (caught) {
      error = caught
    }

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(delay).toHaveBeenCalledTimes(2)
    expect(String(error)).not.toContain(secret)
    expect(String(error)).not.toContain('?action=')
  })

  it('aborts timed-out attempts and applies the same three-attempt budget', async () => {
    const fetchMock = vi.fn((_input: unknown, init?: RequestInit) => {
      expect(init?.signal?.aborted).toBe(true)
      return Promise.reject(new DOMException('timed out', 'AbortError'))
    })
    const delay = vi.fn(() => Promise.resolve())
    const clock = {
      now: () => 0,
      setTimeout: (callback: () => void) => {
        callback()
        return 0 as unknown as ReturnType<typeof setTimeout>
      },
      clearTimeout: vi.fn(),
    }

    await expect(
      fetchWikidataEntities(['Q1'], { fetch: fetchMock, delay, clock }),
    ).rejects.toThrow('failed after 3 attempts')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(clock.clearTimeout).toHaveBeenCalledTimes(3)
  })

  it('keeps the timeout active until the successful response body is consumed', async () => {
    const fetchMock = vi.fn((_input: unknown, init?: RequestInit) => {
      const signal = init?.signal

      return Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              signal?.addEventListener('abort', () => {
                controller.error(new DOMException('timed out', 'AbortError'))
              })
            },
          }),
        ),
      )
    })
    const delay = vi.fn(() => Promise.resolve())
    const clock = {
      now: () => 0,
      setTimeout: (callback: () => void) => setTimeout(callback, 0),
      clearTimeout,
    }

    await expect(
      fetchWikidataEntities(['Q1'], { fetch: fetchMock, delay, clock }),
    ).rejects.toThrow('failed after 3 attempts')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(delay).toHaveBeenCalledTimes(2)
  })

  it('supports HTTP-date Retry-After values', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('', {
          status: 503,
          headers: { 'retry-after': 'Thu, 01 Jan 1970 00:00:03 GMT' },
        }),
      )
      .mockResolvedValueOnce(entityResponse(['Q1']))
    const delay = vi.fn(() => Promise.resolve())
    const clock = {
      now: () => 1000,
      setTimeout,
      clearTimeout,
    }

    await fetchWikidataEntities(['Q1'], { fetch: fetchMock, delay, clock })
    expect(delay).toHaveBeenCalledWith(2000)
  })

  it('rejects excessive Retry-After values instead of sleeping', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response('', { status: 429, headers: { 'retry-after': '31' } }),
      ),
    )
    const delay = vi.fn(() => Promise.resolve())

    await expect(
      fetchWikidataEntities(['Q1'], { fetch: fetchMock, delay }),
    ).rejects.toThrow('longer than 30 seconds')
    expect(delay).not.toHaveBeenCalled()
  })

  it('rejects omitted entities and invalid consumed response fields', async () => {
    await expect(
      fetchWikidataEntities(['Q1'], {
        fetch: () => Promise.resolve(entityResponse(['Q2'])),
      }),
    ).rejects.toThrow('omitted requested entity Q1')

    await expect(
      fetchWikidataEntities(['Q1'], {
        fetch: () =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                entities: {
                  Q1: { id: 1, labels: {}, aliases: {}, claims: {} },
                },
              }),
            ),
          ),
      }),
    ).rejects.toThrow('invalid response')
  })

  it('rejects a declared excessive body before reading or parsing it', async () => {
    await expect(
      fetchWikidataEntities(['Q1'], {
        fetch: () =>
          Promise.resolve(
            new Response('{}', {
              headers: { 'content-length': String(6 * 1024 * 1024) },
            }),
          ),
      }),
    ).rejects.toThrow('too large')
  })

  it('stops an undeclared streaming body as soon as it exceeds the hard cap', async () => {
    let chunksSent = 0
    let cancellations = 0
    const response = new Response(
      new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            chunksSent += 1
            controller.enqueue(new Uint8Array(1024 * 1024))
          },
          cancel() {
            cancellations += 1
          },
        },
        { highWaterMark: 0 },
      ),
    )

    await expect(
      fetchWikidataEntities(['Q1'], {
        fetch: () => Promise.resolve(response),
      }),
    ).rejects.toThrow('too large')
    expect(chunksSent).toBe(6)
    expect(cancellations).toBe(1)
  })
})

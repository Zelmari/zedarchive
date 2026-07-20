import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkUsernameAvailability } from '@/features/identity/client/check-username-availability'

function createJsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

describe('checkUsernameAvailability', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('encodes the username with URLSearchParams', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(createJsonResponse({ status: 'available' })),
    )
    vi.stubGlobal('fetch', fetchMock)

    await checkUsernameAvailability('User Name+Special')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/usernames/availability?username=User+Name%2BSpecial',
      expect.objectContaining({ cache: 'no-store' }),
    )
  })

  it('passes cache no-store and an abort signal to fetch', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      expect(init?.cache).toBe('no-store')
      expect(init?.signal).toBe(controller.signal)
      return Promise.resolve(createJsonResponse({ status: 'available' }))
    })
    vi.stubGlobal('fetch', fetchMock)

    await checkUsernameAvailability('FreeName', controller.signal)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns allowlisted availability results for successful responses', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('username=FreeName')) {
        return Promise.resolve(createJsonResponse({ status: 'available' }))
      }

      if (url.includes('username=MediaFan')) {
        return Promise.resolve(createJsonResponse({ status: 'unavailable' }))
      }

      return Promise.resolve(createJsonResponse({ status: 'invalid' }))
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(checkUsernameAvailability('FreeName')).resolves.toEqual({
      status: 'available',
    })
    await expect(checkUsernameAvailability('MediaFan')).resolves.toEqual({
      status: 'unavailable',
    })
    await expect(checkUsernameAvailability('ab')).resolves.toEqual({
      status: 'invalid',
    })
  })

  it.each([400, 503])(
    'returns null for non-2xx %i responses',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            createJsonResponse({ error: 'bad_request' }, { status }),
          ),
        ),
      )

      await expect(checkUsernameAvailability('FreeName')).resolves.toBeNull()
    },
  )

  it('returns null for malformed JSON responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response('not-json', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      ),
    )

    await expect(checkUsernameAvailability('FreeName')).resolves.toBeNull()
  })

  it('returns null for JSON with an unsafe shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(createJsonResponse({ available: true }))),
    )

    await expect(checkUsernameAvailability('FreeName')).resolves.toBeNull()
  })

  it('rejects network failures so callers can distinguish transport errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    )

    await expect(checkUsernameAvailability('FreeName')).rejects.toThrow(
      'Failed to fetch',
    )
  })

  it('rejects abort errors so callers can distinguish superseded requests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.reject(
          new DOMException('The operation was aborted.', 'AbortError'),
        ),
      ),
    )

    await expect(
      checkUsernameAvailability('FreeName', new AbortController().signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})

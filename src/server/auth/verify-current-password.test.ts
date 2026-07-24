import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { verifyCurrentPassword } from '@/server/auth/verify-current-password'

const authUrl = 'http://localhost:3000'

function createHandler(response: Response) {
  let receivedRequest: Request | undefined

  return {
    handler: async (request: Request) => {
      receivedRequest = request
      return response
    },
    receivedRequest: () => receivedRequest,
  }
}

describe('verifyCurrentPassword', () => {
  it('uses the exact provider route and a narrow request-header allowlist', async () => {
    const auth = createHandler(new Response(JSON.stringify({ status: true })))
    const source = new Headers({
      Cookie: 'opaque-session-cookie',
      Origin: authUrl,
      Referer: `${authUrl}/settings`,
      'X-Forwarded-For': '203.0.113.1',
      'X-Unrelated': 'do-not-forward',
    })

    await expect(
      verifyCurrentPassword(auth, authUrl, source, 'current password'),
    ).resolves.toEqual({ kind: 'verified' })

    const request = auth.receivedRequest()
    expect(request).toBeDefined()
    if (request === undefined)
      throw new Error('Auth handler did not receive a request')
    expect(request.url).toBe(`${authUrl}/api/auth/verify-password`)
    expect(request.method).toBe('POST')
    expect(request.headers.get('cookie')).toBe('opaque-session-cookie')
    expect(request.headers.get('origin')).toBe(authUrl)
    expect(request.headers.get('referer')).toBe(`${authUrl}/settings`)
    expect(request.headers.get('content-type')).toBe('application/json')
    expect(request.headers.get('x-forwarded-for')).toBeNull()
    expect(request.headers.get('x-unrelated')).toBeNull()
    await expect(request.json()).resolves.toEqual({
      password: 'current password',
    })
  })

  it.each([
    [400, 'invalid_password'],
    [401, 'session_invalid'],
    [403, 'session_invalid'],
    [429, 'rate_limited'],
    [500, 'unavailable'],
  ] as const)('maps provider status %s to bounded %s', async (status, kind) => {
    await expect(
      verifyCurrentPassword(
        createHandler(new Response(null, { status })),
        authUrl,
        new Headers({ Origin: authUrl }),
        'password',
      ),
    ).resolves.toEqual({ kind })
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  dynamic,
  handleAccountPurgeGet,
  maxDuration,
  runtime,
} from '@/app/api/internal/account-purge/route'

const secret = 'ci-disposable-cron-secret-with-32-characters'

function request(path = '', authorization?: string): Request {
  return new Request(
    `http://localhost:3000/api/internal/account-purge${path}`,
    {
      headers: authorization === undefined ? {} : { authorization },
    },
  )
}

function enableRoute(): void {
  vi.stubEnv('ACCOUNT_PURGE_ENABLED', 'true')
  vi.stubEnv('CRON_SECRET', secret)
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('account purge route', () => {
  it('declares the bounded node route contract', () => {
    expect(runtime).toBe('nodejs')
    expect(dynamic).toBe('force-dynamic')
    expect(maxDuration).toBe(60)
  })

  it('fails closed when disabled or misconfigured without calling the runner', async () => {
    const runner = vi.fn()
    const disabled = await handleAccountPurgeGet(request(), runner)
    expect(disabled.status).toBe(503)
    expect(await disabled.json()).toEqual({ error: 'service_unavailable' })
    expect(runner).not.toHaveBeenCalled()

    vi.stubEnv('ACCOUNT_PURGE_ENABLED', 'true')
    vi.stubEnv('CRON_SECRET', 'too-short')
    const misconfigured = await handleAccountPurgeGet(request(), runner)
    expect(misconfigured.status).toBe(503)
    expect(await misconfigured.json()).toEqual({ error: 'service_unavailable' })
    expect(runner).not.toHaveBeenCalled()
  })

  it('rejects caller options and malformed or invalid credentials before work', async () => {
    enableRoute()
    const runner = vi.fn()
    const invalidRequest = await handleAccountPurgeGet(
      request('?limit=1', `Bearer ${secret}`),
      runner,
    )
    expect(invalidRequest.status).toBe(400)
    expect(await invalidRequest.json()).toEqual({ error: 'invalid_request' })

    for (const authorization of [undefined, 'Basic x', 'Bearer nope']) {
      const unauthorized = await handleAccountPurgeGet(
        request('', authorization),
        runner,
      )
      expect(unauthorized.status).toBe(401)
      expect(await unauthorized.json()).toEqual({ error: 'unauthorized' })
    }
    expect(runner).not.toHaveBeenCalled()
  })

  it('returns only approved aggregate results with private no-store headers', async () => {
    enableRoute()
    const runner = vi.fn(async () => ({
      result: 'completed_backlog' as const,
      examinedCount: 25,
      purgedCount: 20,
      skippedCount: 3,
      failedCount: 2,
    }))
    const response = await handleAccountPurgeGet(
      request('', `Bearer ${secret}`),
      runner,
    )
    const text = await response.text()
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe(
      'private, no-store, max-age=0',
    )
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Content-Type')).toContain('application/json')
    expect(JSON.parse(text)).toEqual({
      result: 'completed_backlog',
      examinedCount: 25,
      purgedCount: 20,
      skippedCount: 3,
      failedCount: 2,
    })
    expect(text).not.toMatch(/user|email|username|secret|error|deadline/iu)
  })

  it('maps service unavailability to a generic 503', async () => {
    enableRoute()
    const response = await handleAccountPurgeGet(
      request('', `Bearer ${secret}`),
      async () => ({ result: 'service_unavailable' }),
    )
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'service_unavailable' })
  })
})

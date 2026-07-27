import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  dynamic,
  handleArchiveBackupGet,
  runtime,
} from '@/app/api/account/archive-backup/route'

const userId = '4ef0cfc4-5e25-4f4f-99be-f341b19b3914'
const navigationHeaders = {
  'sec-fetch-site': 'same-origin',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-dest': 'document',
  'sec-fetch-user': '?1',
}
const active = async () => ({
  status: 'active' as const,
  session: { user: { id: userId }, session: { id: 'session', userId } },
})
const ready = async () => ({
  kind: 'backup_ready' as const,
  bytes: new TextEncoder().encode('{"schema":"zedarchive.archive-backup"}'),
  filename: 'zedarchive-archive-backup-v1.json' as const,
})
function request(headers: HeadersInit = navigationHeaders, path = '') {
  return new Request(
    `http://localhost:3000/api/account/archive-backup${path}`,
    { headers },
  )
}

describe('archive backup route', () => {
  it('declares a dynamic Node GET download route', () => {
    expect(runtime).toBe('nodejs')
    expect(dynamic).toBe('force-dynamic')
  })

  it('gates fetch metadata before authority and data work', async () => {
    const access = vi.fn(active)
    const backup = vi.fn(ready)
    for (const headers of [
      {},
      { ...navigationHeaders, 'sec-fetch-site': 'cross-site' },
      { ...navigationHeaders, 'sec-fetch-mode': 'cors' },
      { ...navigationHeaders, 'sec-fetch-dest': 'iframe' },
      { ...navigationHeaders, 'sec-fetch-user': '?0' },
    ]) {
      const response = await handleArchiveBackupGet(
        request(headers),
        access,
        backup,
      )
      expect(response.status).toBe(403)
      expect(await response.text()).toBe('Unavailable')
    }
    expect(access).not.toHaveBeenCalled()
    expect(backup).not.toHaveBeenCalled()
  })

  it('returns exact private attachment headers without identity', async () => {
    const response = await handleArchiveBackupGet(request(), active, ready)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe(
      'application/json; charset=utf-8',
    )
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="zedarchive-archive-backup-v1.json"',
    )
    expect(response.headers.get('Cache-Control')).toBe(
      'private, no-store, max-age=0',
    )
    expect(response.headers.get('Set-Cookie')).toBeNull()
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(await response.text()).not.toContain(userId)
  })

  it('maps authority and service states without returning bytes', async () => {
    const signedOut = await handleArchiveBackupGet(
      request(),
      async () => ({ status: 'signed_out' }),
      ready,
    )
    const tooLarge = await handleArchiveBackupGet(
      request(),
      active,
      async () => ({ kind: 'too_large' }),
    )
    const unavailable = await handleArchiveBackupGet(
      request(),
      async () => ({ status: 'unavailable' }),
      ready,
    )
    const recoverable = await handleArchiveBackupGet(
      request(),
      async () => ({ status: 'deletion_recoverable' }),
      ready,
    )
    const accountUnavailable = await handleArchiveBackupGet(
      request(),
      active,
      async () => ({ kind: 'account_unavailable' }),
    )
    const serviceUnavailable = await handleArchiveBackupGet(
      request(),
      active,
      async () => ({ kind: 'data_unavailable' }),
    )
    const thrownReader = await handleArchiveBackupGet(
      request(),
      active,
      async () => {
        throw new Error('database details must not reach the response')
      },
    )
    expect([
      signedOut.status,
      tooLarge.status,
      unavailable.status,
      recoverable.status,
      accountUnavailable.status,
      serviceUnavailable.status,
      thrownReader.status,
    ]).toEqual([401, 413, 503, 403, 403, 503, 503])
    for (const response of [
      signedOut,
      tooLarge,
      unavailable,
      recoverable,
      accountUnavailable,
      serviceUnavailable,
      thrownReader,
    ]) {
      expect(await response.text()).toBe('Unavailable')
      expect(response.headers.get('Cache-Control')).toBe(
        'private, no-store, max-age=0',
      )
      expect(response.headers.get('Content-Disposition')).toBeNull()
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
    }
  })

  it('rejects query/body options before resolving the session', async () => {
    const access = vi.fn(active)
    const response = await handleArchiveBackupGet(
      request(navigationHeaders, '?userId=forged'),
      access,
      ready,
    )
    expect(response.status).toBe(403)
    expect(access).not.toHaveBeenCalled()
  })

  it('permits a user-entered direct navigation but rejects request framing', async () => {
    const directNavigation = await handleArchiveBackupGet(
      request({ ...navigationHeaders, 'sec-fetch-site': 'none' }),
      active,
      ready,
    )
    expect(directNavigation.status).toBe(200)

    const access = vi.fn(active)
    const response = await handleArchiveBackupGet(
      request({ ...navigationHeaders, 'content-length': '1' }),
      access,
      ready,
    )
    expect(response.status).toBe(403)
    expect(await response.text()).toBe('Unavailable')
    expect(access).not.toHaveBeenCalled()
  })
})

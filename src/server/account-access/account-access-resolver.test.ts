import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createAccountAccessResolver } from '@/server/account-access/account-access-resolver'

const headers = new Headers()
const session = {
  session: {
    id: '18a94f47-52f5-47fd-952d-5f34abfeeb09',
    userId: '11446e67-b078-4f9b-b2c9-da77ad1a28c8',
  },
  user: {
    id: '11446e67-b078-4f9b-b2c9-da77ad1a28c8',
    name: 'MediaFan',
  },
} as const

describe('createAccountAccessResolver', () => {
  it('returns signed_out without reading deletion state when no session exists', async () => {
    const readState = vi.fn()
    const resolve = createAccountAccessResolver(
      vi.fn(async () => null),
      readState,
    )

    await expect(resolve(headers)).resolves.toEqual({ status: 'signed_out' })
    expect(readState).not.toHaveBeenCalled()
  })

  it('preserves the provider session for active accounts', async () => {
    const resolve = createAccountAccessResolver(
      vi.fn(async () => session),
      vi.fn(async () => ({ kind: 'active' as const })),
    )

    await expect(resolve(headers)).resolves.toEqual({
      status: 'active',
      session,
    })
  })

  it('returns the exact deadline only for recoverable deletion', async () => {
    const purgeAfter = new Date('2026-08-08T12:34:56.789Z')
    const resolve = createAccountAccessResolver(
      vi.fn(async () => session),
      vi.fn(async () => ({
        kind: 'deletion_recoverable' as const,
        purgeAfter,
      })),
    )

    await expect(resolve(headers)).resolves.toEqual({
      status: 'deletion_recoverable',
      session,
      purgeAfter,
    })
  })

  it('returns deletion_due without exposing a cancellation deadline', async () => {
    const resolve = createAccountAccessResolver(
      vi.fn(async () => session),
      vi.fn(async () => ({
        kind: 'deletion_due' as const,
        purgeAfter: new Date('2026-08-08T12:34:56.789Z'),
      })),
    )

    await expect(resolve(headers)).resolves.toEqual({
      status: 'deletion_due',
      session,
    })
  })

  it.each([
    ['provider failure', vi.fn(async () => Promise.reject(new Error('down')))],
    [
      'malformed provider ownership',
      vi.fn(async () => ({
        ...session,
        session: { ...session.session, userId: 'different-user' },
      })),
    ],
  ])('fails closed on %s', async (_name, readSession) => {
    const resolve = createAccountAccessResolver(
      readSession,
      vi.fn(async () => ({ kind: 'active' as const })),
    )

    await expect(resolve(headers)).resolves.toEqual({ status: 'unavailable' })
  })

  it.each([
    ['reader failure', vi.fn(async () => Promise.reject(new Error('down')))],
    [
      'reader unavailable',
      vi.fn(async () => ({
        kind: 'unavailable' as const,
      })),
    ],
    [
      'invalid deadline',
      vi.fn(async () => ({
        kind: 'deletion_recoverable' as const,
        purgeAfter: new Date(Number.NaN),
      })),
    ],
  ])('fails closed on %s', async (_name, readState) => {
    const resolve = createAccountAccessResolver(
      vi.fn(async () => session),
      readState,
    )

    await expect(resolve(headers)).resolves.toEqual({ status: 'unavailable' })
  })
})

import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const SESSION_LOOKUP_PRIVATE_DETAIL =
  'PRIVATE_SESSION_LOOKUP_DETAIL_FOR_TEST_ONLY'

const { resolveAccountAccess } = vi.hoisted(() => ({
  resolveAccountAccess: vi.fn(),
}))

vi.mock('@/server/auth/auth', () => ({
  resolveAccountAccess,
}))

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}))

vi.mock('@/features/auth/components/sign-out-button', () => ({
  SignOutButton: () => 'Sign out',
}))

import { SiteHeader } from '@/components/site-header'

describe('SiteHeader', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resolveAccountAccess.mockReset()
    consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logs only a privacy-safe message when session lookup fails and degrades to signed-out navigation', async () => {
    resolveAccountAccess.mockRejectedValue(
      new Error(SESSION_LOOKUP_PRIVATE_DETAIL),
    )

    const markup = renderToStaticMarkup(await SiteHeader())

    expect(consoleErrorSpy).toHaveBeenCalledOnce()
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Site header account-access lookup failed.',
    )
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain(
      SESSION_LOOKUP_PRIVATE_DETAIL,
    )
    expect(markup).toContain('Account deletion')
    expect(markup).toContain('Sign out')
    expect(markup).not.toContain('Register')
    expect(markup).not.toContain('My anime')
    expect(markup).not.toContain('aria-label="Primary"')
  })

  it('shows My anime in a primary landmark separate from account controls when signed in', async () => {
    resolveAccountAccess.mockResolvedValue({
      status: 'active',
      session: {
        user: { id: 'user-id', name: 'Zelmari' },
        session: { id: 'session-id', userId: 'user-id' },
      },
    })

    const markup = renderToStaticMarkup(await SiteHeader())

    expect(markup).toContain('aria-label="Primary"')
    expect(markup).toContain('aria-label="Account"')
    expect(markup).toContain('href="/archive/anime"')
    expect(markup).toContain('My anime')
    expect(markup).toContain('@Zelmari')
    expect(markup).toContain('href="/settings"')
    expect(markup).toContain('Settings')
    expect(markup).toContain('Sign out')
  })

  it('does not expose primary archive navigation when signed out', async () => {
    resolveAccountAccess.mockResolvedValue({ status: 'signed_out' })

    const markup = renderToStaticMarkup(await SiteHeader())

    expect(markup).toContain('aria-label="Account"')
    expect(markup).toContain('Sign in')
    expect(markup).toContain('Register')
    expect(markup).not.toContain('My anime')
    expect(markup).not.toContain('Settings')
    expect(markup).not.toContain('aria-label="Primary"')
  })

  it.each(['deletion_recoverable', 'deletion_due'] as const)(
    'renders only deletion recovery and sign-out controls for %s accounts',
    async (status) => {
      resolveAccountAccess.mockResolvedValue({
        status,
        session: {
          user: { id: 'user-id', name: 'PrivateName' },
          session: { id: 'session-id', userId: 'user-id' },
        },
        ...(status === 'deletion_recoverable'
          ? { purgeAfter: new Date('2026-08-25T14:30:00.000Z') }
          : {}),
      })

      const markup = renderToStaticMarkup(await SiteHeader())

      expect(markup).toContain('href="/account/deletion"')
      expect(markup).toContain('Account deletion')
      expect(markup).toContain('Sign out')
      expect(markup).not.toContain('PrivateName')
      expect(markup).not.toContain('My anime')
      expect(markup).not.toContain('Settings')
      expect(markup).not.toContain('Register')
    },
  )
})

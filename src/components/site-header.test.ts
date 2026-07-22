import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const SESSION_LOOKUP_PRIVATE_DETAIL =
  'PRIVATE_SESSION_LOOKUP_DETAIL_FOR_TEST_ONLY'

const { getSession } = vi.hoisted(() => ({
  getSession: vi.fn(),
}))

vi.mock('@/server/auth/auth', () => ({
  auth: {
    api: {
      getSession,
    },
  },
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
    getSession.mockReset()
    consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logs only a privacy-safe message when session lookup fails and degrades to signed-out navigation', async () => {
    getSession.mockRejectedValue(new Error(SESSION_LOOKUP_PRIVATE_DETAIL))

    const markup = renderToStaticMarkup(await SiteHeader())

    expect(consoleErrorSpy).toHaveBeenCalledOnce()
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Site header session lookup failed.',
    )
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain(
      SESSION_LOOKUP_PRIVATE_DETAIL,
    )
    expect(markup).toContain('Sign in')
    expect(markup).toContain('Register')
    expect(markup).not.toContain('Sign out')
    expect(markup).not.toContain('My anime')
    expect(markup).not.toContain('aria-label="Primary"')
  })

  it('shows My anime in a primary landmark separate from account controls when signed in', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-id', name: 'Zelmari' },
    })

    const markup = renderToStaticMarkup(await SiteHeader())

    expect(markup).toContain('aria-label="Primary"')
    expect(markup).toContain('aria-label="Account"')
    expect(markup).toContain('href="/archive/anime"')
    expect(markup).toContain('My anime')
    expect(markup).toContain('@Zelmari')
    expect(markup).toContain('Sign out')
  })

  it('does not expose primary archive navigation when signed out', async () => {
    getSession.mockResolvedValue(null)

    const markup = renderToStaticMarkup(await SiteHeader())

    expect(markup).toContain('aria-label="Account"')
    expect(markup).toContain('Sign in')
    expect(markup).toContain('Register')
    expect(markup).not.toContain('My anime')
    expect(markup).not.toContain('aria-label="Primary"')
  })
})

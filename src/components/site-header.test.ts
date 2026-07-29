import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const SESSION_LOOKUP_PRIVATE_DETAIL =
  'PRIVATE_SESSION_LOOKUP_DETAIL_FOR_TEST_ONLY'

const { resolveAccountAccess } = vi.hoisted(() => ({
  resolveAccountAccess: vi.fn(),
}))
const { pathname } = vi.hoisted(() => ({
  pathname: { value: '/' },
}))

vi.mock('@/server/auth/auth', () => ({
  resolveAccountAccess,
}))

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.value,
}))

vi.mock('@/features/auth/components/sign-out-button', () => ({
  SignOutButton: () => 'Sign out',
}))

import { SiteHeader } from '@/components/site-header'

describe('SiteHeader', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resolveAccountAccess.mockReset()
    pathname.value = '/'
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
    expect(markup).toContain(
      'class="za-button za-button--secondary" href="/archive/anime"',
    )
    expect(markup).toContain('My anime')
    expect(markup).toContain('@Zelmari')
    expect(markup).toContain('href="/settings"')
    expect(markup).toContain('Settings')
    expect(markup).toContain('Sign out')
  })

  it('uses the shared shell and link roles without changing the header landmarks', async () => {
    resolveAccountAccess.mockResolvedValue({ status: 'signed_out' })

    const markup = renderToStaticMarkup(await SiteHeader())

    expect(markup).toContain('<header class="za-site-header">')
    expect(markup).toContain('za-container za-container--wide')
    expect(markup).toContain(
      'class="za-wordmark za-link za-site-header__brand za-current-page"',
    )
    expect(markup).toContain('href="/"')
    expect(markup).toContain('class="za-link" href="/sign-in"')
    expect(markup).toContain('class="za-link" href="/register"')
    expect(markup).toContain('aria-label="Account"')
    expect(markup).not.toContain('aria-label="Primary"')
    expect(markup).not.toContain('href="/archive/anime"')
  })

  it.each([
    {
      access: { status: 'signed_out' },
      label: 'zedarchive',
      route: '/',
    },
    {
      access: { status: 'signed_out' },
      label: 'Sign in',
      route: '/sign-in',
    },
    {
      access: { status: 'signed_out' },
      label: 'Register',
      route: '/register',
    },
    {
      access: {
        status: 'active',
        session: {
          user: { id: 'user-id', name: 'Zelmari' },
          session: { id: 'session-id', userId: 'user-id' },
        },
      },
      label: 'My anime',
      route: '/archive/anime',
    },
    {
      access: {
        status: 'active',
        session: {
          user: { id: 'user-id', name: 'Zelmari' },
          session: { id: 'session-id', userId: 'user-id' },
        },
      },
      label: 'Settings',
      route: '/settings',
    },
    {
      access: {
        status: 'deletion_due',
        session: {
          user: { id: 'user-id', name: 'PrivateName' },
          session: { id: 'session-id', userId: 'user-id' },
        },
      },
      label: 'Account deletion',
      route: '/account/deletion',
    },
  ])(
    'marks only $label current on $route',
    async ({ access, label, route }) => {
      pathname.value = route
      resolveAccountAccess.mockResolvedValue(access)

      const markup = renderToStaticMarkup(await SiteHeader())
      const currentLink = markup.match(
        /<a aria-current="page" class="[^"]+" href="[^"]+">([^<]+)<\/a>/,
      )

      expect(currentLink?.[1]).toBe(label)
      expect(markup.match(/aria-current="page"/g)).toHaveLength(1)
    },
  )

  it('does not imply that a visible parent link is current on a child route', async () => {
    pathname.value = '/register/check-email'
    resolveAccountAccess.mockResolvedValue({ status: 'signed_out' })

    const markup = renderToStaticMarkup(await SiteHeader())

    expect(markup).not.toContain('aria-current')
  })

  it('adds the current recipe to My anime only on its exact route', async () => {
    resolveAccountAccess.mockResolvedValue({
      status: 'active',
      session: {
        user: { id: 'user-id', name: 'Zelmari' },
        session: { id: 'session-id', userId: 'user-id' },
      },
    })

    pathname.value = '/'
    const ordinaryMarkup = renderToStaticMarkup(await SiteHeader())
    expect(ordinaryMarkup).toContain(
      'class="za-button za-button--secondary" href="/archive/anime"',
    )
    expect(ordinaryMarkup).not.toContain(
      'class="za-button za-button--secondary za-current-page"',
    )

    pathname.value = '/archive/anime'
    const currentMarkup = renderToStaticMarkup(await SiteHeader())
    expect(currentMarkup).toContain(
      'aria-current="page" class="za-button za-button--secondary za-current-page" href="/archive/anime"',
    )
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

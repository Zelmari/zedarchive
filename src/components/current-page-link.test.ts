import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { pathname } = vi.hoisted(() => ({
  pathname: { value: '/' },
}))

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.value,
}))

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) =>
    createElement('a', { ...props, href }, children),
}))

import {
  CurrentPageLink,
  isExactCurrentPage,
} from '@/components/current-page-link'

describe('CurrentPageLink', () => {
  beforeEach(() => {
    pathname.value = '/'
  })

  it.each([
    '/',
    '/sign-in',
    '/register',
    '/archive/anime',
    '/settings',
    '/account/deletion',
  ])('marks the exact %s route as the current page', (route) => {
    pathname.value = route

    const markup = renderToStaticMarkup(
      createElement(
        CurrentPageLink,
        { className: 'za-link', href: route },
        'Destination',
      ),
    )

    expect(markup).toContain('aria-current="page"')
    expect(markup).toContain('class="za-link za-current-page"')
  })

  it.each([
    ['/register/check-email', '/register'],
    ['/archive/anime/example', '/archive/anime'],
    ['/settings/profile', '/settings'],
    ['/account/deletion/recovery', '/account/deletion'],
  ])(
    'does not mark child route %s as current for %s',
    (childRoute, parentRoute) => {
      pathname.value = childRoute

      const markup = renderToStaticMarkup(
        createElement(
          CurrentPageLink,
          { className: 'za-link', href: parentRoute },
          'Destination',
        ),
      )

      expect(markup).not.toContain('aria-current')
      expect(markup).toContain('class="za-link"')
    },
  )

  it('uses the pathname supplied by Next, so query strings do not affect current-page matching', () => {
    expect(isExactCurrentPage('/sign-in', '/sign-in')).toBe(true)
    expect(isExactCurrentPage('/sign-in', '/sign-in?from=register')).toBe(false)
  })
})

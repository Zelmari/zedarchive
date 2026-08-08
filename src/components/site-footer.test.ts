import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SiteFooter } from '@/components/site-footer'

describe('SiteFooter', () => {
  it('is a passive archive sign-off without navigation or account controls', () => {
    const markup = renderToStaticMarkup(SiteFooter())

    expect(markup).toContain('<footer class="za-site-footer">')
    expect(markup).toContain(
      'zedarchive — a quiet archive of everything you watch',
    )
    expect(markup).toContain('Est. 2026')
    expect(markup).not.toContain('<a')
    expect(markup).not.toContain('<nav')
    expect(markup).not.toContain('<button')
  })
})

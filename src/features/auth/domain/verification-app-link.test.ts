import { describe, expect, it } from 'vitest'
import { buildVerificationAppLink } from '@/features/auth/domain/verification-app-link'

const localAuthOrigin = 'http://localhost:3000'
const productionAuthOrigin = 'https://zedarchive.com'
const sampleToken = 'verification-token.with+special/chars='
const encodedToken = encodeURIComponent(sampleToken)

describe('buildVerificationAppLink', () => {
  it('builds an app-owned link from the validated origin and token', () => {
    expect(buildVerificationAppLink(localAuthOrigin, sampleToken)).toBe(
      `${localAuthOrigin}/verify-email#token=${encodedToken}`,
    )
  })

  it('uses the production origin without a trailing slash', () => {
    expect(buildVerificationAppLink(productionAuthOrigin, 'token-123')).toBe(
      'https://zedarchive.com/verify-email#token=token-123',
    )
  })

  it('encodes the token exactly once in the query string', () => {
    const href = buildVerificationAppLink(localAuthOrigin, sampleToken)
    const url = new URL(href)

    expect(url.pathname).toBe('/verify-email')
    expect(new URLSearchParams(url.hash.slice(1)).get('token')).toBe(
      sampleToken,
    )
    expect(href).not.toContain('/api/auth/verify-email')
    expect(href).not.toContain(encodeURIComponent(encodedToken))
  })

  it('never emits the provider mutation URL even when given a provider-style token', () => {
    const href = buildVerificationAppLink(
      productionAuthOrigin,
      '/api/auth/verify-email?token=ignored',
    )

    expect(href).toBe(
      `https://zedarchive.com/verify-email#token=${encodeURIComponent('/api/auth/verify-email?token=ignored')}`,
    )
    expect(href).not.toContain('/api/auth/verify-email?token=')
  })

  it.each([
    ['trailing slash', 'https://zedarchive.com/'],
    ['path suffix', 'https://zedarchive.com/api/auth'],
    ['query suffix', 'https://zedarchive.com?next=/'],
    ['fragment suffix', 'https://zedarchive.com#section'],
    ['credentials', 'https://user:pass@zedarchive.com'],
    ['non-https remote host', 'http://zedarchive.com'],
    ['whitespace', ' https://zedarchive.com '],
  ])('rejects an invalid origin with %s', (_, authOrigin) => {
    expect(() => buildVerificationAppLink(authOrigin, 'token-123')).toThrow()
  })
})

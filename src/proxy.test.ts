import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { hasExpectedDynamicContentSecurityPolicyShape } from '@/config/security-headers'
import {
  config,
  proxy,
  proxyMatcher,
  shouldApplyDynamicSecurityPolicy,
} from '@/proxy'

function request(pathname: string, headers?: HeadersInit): NextRequest {
  return new NextRequest(`https://zedarchive.test${pathname}`, { headers })
}

describe('security policy proxy', () => {
  it('forwards and returns one matching fresh nonce CSP for dynamic requests', () => {
    const first = proxy(request('/anime'))
    const second = proxy(request('/anime'))
    const firstPolicy = first.headers.get('Content-Security-Policy')
    const secondPolicy = second.headers.get('Content-Security-Policy')

    expect(firstPolicy).not.toBeNull()
    expect(secondPolicy).not.toBeNull()
    expect(
      hasExpectedDynamicContentSecurityPolicyShape(firstPolicy!, {
        development: false,
      }),
    ).toBe(true)
    expect(
      hasExpectedDynamicContentSecurityPolicyShape(secondPolicy!, {
        development: false,
      }),
    ).toBe(true)
    expect(firstPolicy !== secondPolicy).toBe(true)
    expect(
      first.headers.get('x-middleware-request-content-security-policy') ===
        firstPolicy,
    ).toBe(true)
  })

  it('keeps static assets and documented prefetches outside dynamic nonce handling', () => {
    for (const candidate of [
      request('/_next/static'),
      request('/_next/static/chunks/app.js'),
      request('/_next/image'),
      request('/zedarchivelogo.png'),
      request('/anime', { 'next-router-prefetch': '1' }),
      request('/anime', { purpose: 'prefetch' }),
    ]) {
      expect(shouldApplyDynamicSecurityPolicy(candidate)).toBe(false)
      expect(proxy(candidate).headers.has('Content-Security-Policy')).toBe(
        false,
      )
    }
    expect(
      shouldApplyDynamicSecurityPolicy(
        request('/anime', { rsc: '1', accept: 'text/x-component' }),
      ),
    ).toBe(true)
  })

  it('keeps static-looking near-prefix paths inside dynamic nonce handling', () => {
    for (const candidate of [
      request('/_next/staticity'),
      request('/_next/image-other'),
      request('/zedarchivelogo.png/other'),
    ]) {
      expect(shouldApplyDynamicSecurityPolicy(candidate)).toBe(true)
      expect(proxy(candidate).headers.has('Content-Security-Policy')).toBe(true)
    }
  })

  it('declares an exact matcher aligned with the static and prefetch exclusions', () => {
    expect(config.matcher).toEqual([proxyMatcher])
    expect(proxyMatcher).toEqual({
      source:
        '/((?!_next/static(?:/|$)|_next/image(?:/|$)|zedarchivelogo\\.png$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    })

    const matcher = new RegExp(`^${proxyMatcher.source}$`, 'u')
    for (const pathname of [
      '/_next/static',
      '/_next/static/chunks/app.js',
      '/_next/image',
      '/_next/image/asset',
      '/zedarchivelogo.png',
    ]) {
      expect(matcher.test(pathname)).toBe(false)
    }
    for (const pathname of [
      '/_next/staticity',
      '/_next/image-other',
      '/zedarchivelogo.png/other',
    ]) {
      expect(matcher.test(pathname)).toBe(true)
    }
  })
})

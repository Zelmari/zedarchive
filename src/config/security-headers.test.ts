import { describe, expect, it } from 'vitest'
import {
  buildDynamicContentSecurityPolicy,
  commonSecurityHeaders,
  deniedPermissionsPolicyFeatures,
  hasExpectedDynamicContentSecurityPolicyShape,
  isNextPrefetchRequest,
  isStaticSecurityPath,
  staticContentSecurityPolicy,
} from '@/config/security-headers'

const nonce = 'MDEyMzQ1Njc4OWFiY2RlZg=='
const expectedDeniedPermissionsPolicyFeatures = [
  'accelerometer',
  'attribution-reporting',
  'autoplay',
  'browsing-topics',
  'camera',
  'captured-surface-control',
  'clipboard-read',
  'clipboard-write',
  'compute-pressure',
  'deferred-fetch',
  'deferred-fetch-minimal',
  'digital-credentials-get',
  'display-capture',
  'encrypted-media',
  'fullscreen',
  'gamepad',
  'geolocation',
  'gyroscope',
  'hid',
  'idle-detection',
  'identity-credentials-get',
  'interest-cohort',
  'join-ad-interest-group',
  'keyboard-map',
  'language-detector',
  'language-model',
  'local-fonts',
  'local-network',
  'local-network-access',
  'loopback-network',
  'magnetometer',
  'microphone',
  'midi',
  'on-device-speech-recognition',
  'otp-credentials',
  'payment',
  'picture-in-picture',
  'publickey-credentials-create',
  'publickey-credentials-get',
  'private-aggregation',
  'private-state-token-issuance',
  'private-state-token-redemption',
  'run-ad-auction',
  'screen-wake-lock',
  'serial',
  'shared-storage',
  'shared-storage-select-url',
  'storage-access',
  'summarizer',
  'sync-xhr',
  'translator',
  'unload',
  'usb',
  'window-management',
  'xr-spatial-tracking',
] as const

describe('security header policy', () => {
  it('builds the approved production dynamic policy without unsafe script sources', () => {
    const policy = buildDynamicContentSecurityPolicy(nonce, {
      development: false,
    })

    expect(
      hasExpectedDynamicContentSecurityPolicyShape(policy, {
        development: false,
      }),
    ).toBe(true)
    expect(policy).not.toContain("'unsafe-inline'")
    expect(policy).not.toContain("'unsafe-eval'")
  })

  it('permits unsafe-eval only in development', () => {
    const policy = buildDynamicContentSecurityPolicy(nonce, {
      development: true,
    })

    expect(
      hasExpectedDynamicContentSecurityPolicyShape(policy, {
        development: true,
      }),
    ).toBe(true)
    expect(policy).toContain("'unsafe-eval'")
    expect(policy).not.toContain("'unsafe-inline'")
  })

  it('rejects malformed nonce input', () => {
    for (const value of ['', 'not a nonce', 'nonce\nvalue']) {
      expect(() =>
        buildDynamicContentSecurityPolicy(value, { development: false }),
      ).toThrow(TypeError)
    }
  })

  it('uses the approved non-executable static policy and common privacy baseline', () => {
    expect(staticContentSecurityPolicy).toBe(
      "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    )
    expect(staticContentSecurityPolicy).not.toContain('script-src')
    expect(deniedPermissionsPolicyFeatures).toEqual(
      expectedDeniedPermissionsPolicyFeatures,
    )
    expect(commonSecurityHeaders).toEqual({
      'Permissions-Policy': expectedDeniedPermissionsPolicyFeatures
        .map((feature) => `${feature}=()`)
        .join(', '),
      'Referrer-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    })
    expect(
      Object.hasOwn(commonSecurityHeaders, 'Strict-Transport-Security'),
    ).toBe(false)
    expect(commonSecurityHeaders['Permissions-Policy']).not.toContain(
      'bluetooth=',
    )
  })

  it('classifies only the approved cacheable paths as static', () => {
    for (const pathname of [
      '/_next/static',
      '/_next/static/chunks/app.js',
      '/_next/image',
      '/_next/image/asset',
      '/icon.svg',
    ]) {
      expect(isStaticSecurityPath(pathname)).toBe(true)
    }
    for (const pathname of [
      '/',
      '/anime',
      '/api/account/archive-backup',
      '/_next/staticity',
      '/_next/image-other',
      '/icon.svg/other',
      '/images/cover.png',
    ]) {
      expect(isStaticSecurityPath(pathname)).toBe(false)
    }
  })

  it('identifies documented Next prefetch requests without treating ordinary Flight as prefetch', () => {
    expect(
      isNextPrefetchRequest(new Headers({ 'next-router-prefetch': '1' })),
    ).toBe(true)
    expect(isNextPrefetchRequest(new Headers({ purpose: 'prefetch' }))).toBe(
      true,
    )
    expect(
      isNextPrefetchRequest(
        new Headers({ rsc: '1', accept: 'text/x-component' }),
      ),
    ).toBe(false)
  })
})

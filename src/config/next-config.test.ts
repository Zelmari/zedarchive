import { describe, expect, it } from 'vitest'
import nextConfig from '../../next.config'
import {
  commonSecurityHeaders,
  staticContentSecurityPolicy,
} from '@/config/security-headers'

describe('Next security header configuration', () => {
  it('disables the built-in image optimizer and composes static CSP separately', async () => {
    expect(nextConfig.images?.unoptimized).toBe(true)

    const headers = await nextConfig.headers?.()
    expect(headers).toBeDefined()
    expect(headers).toEqual([
      {
        source: '/:path*',
        headers: Object.entries(commonSecurityHeaders).map(([key, value]) => ({
          key,
          value,
        })),
      },
      ...[
        '/_next/static/:path*',
        '/_next/image/:path*',
        '/zedarchivelogo.png',
      ].map((source) => ({
        source,
        headers: [
          {
            key: 'Content-Security-Policy',
            value: staticContentSecurityPolicy,
          },
        ],
      })),
      {
        source: '/api/account/archive-backup',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
      {
        source: '/api/auth/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-store, max-age=0',
          },
        ],
      },
    ])

    const catchAllIndex = headers?.findIndex(
      ({ source }) => source === '/:path*',
    )
    const archiveBackupIndex = headers?.findIndex(
      ({ source }) => source === '/api/account/archive-backup',
    )
    expect(catchAllIndex).toBeGreaterThanOrEqual(0)
    expect(archiveBackupIndex).toBeGreaterThan(catchAllIndex ?? -1)
  })
})

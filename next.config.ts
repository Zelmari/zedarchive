import type { NextConfig } from 'next'
import {
  commonSecurityHeaders,
  staticContentSecurityPolicy,
} from './src/config/security-headers'

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: Object.entries(commonSecurityHeaders).map(([key, value]) => ({
          key,
          value,
        })),
      },
      ...['/_next/static/:path*', '/_next/image/:path*', '/icon.svg'].map(
        (source) => ({
          source,
          headers: [
            {
              key: 'Content-Security-Policy',
              value: staticContentSecurityPolicy,
            },
          ],
        }),
      ),
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
    ]
  },
}

export default nextConfig

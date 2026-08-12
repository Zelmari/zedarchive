import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  buildDynamicContentSecurityPolicy,
  createContentSecurityPolicyNonce,
  isNextPrefetchRequest,
  isStaticSecurityPath,
} from '@/config/security-headers'

export const proxyMatcher = {
  source:
    '/((?!_next/static(?:/|$)|_next/image(?:/|$)|zedarchivelogo\\.png$).*)',
  missing: [
    { type: 'header', key: 'next-router-prefetch' },
    { type: 'header', key: 'purpose', value: 'prefetch' },
  ],
} as const

export const config = {
  // Next statically extracts this value from the source file, so it must remain
  // a literal even though the focused contract also exposes proxyMatcher.
  matcher: [
    {
      source:
        '/((?!_next/static(?:/|$)|_next/image(?:/|$)|zedarchivelogo\\.png$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}

export function shouldApplyDynamicSecurityPolicy(
  request: NextRequest,
): boolean {
  return (
    !isStaticSecurityPath(request.nextUrl.pathname) &&
    !isNextPrefetchRequest(request.headers)
  )
}

export function proxy(request: NextRequest): NextResponse {
  if (!shouldApplyDynamicSecurityPolicy(request)) return NextResponse.next()

  const nonce = createContentSecurityPolicyNonce()
  const contentSecurityPolicy = buildDynamicContentSecurityPolicy(nonce, {
    development: process.env.NODE_ENV === 'development',
  })
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('Content-Security-Policy', contentSecurityPolicy)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', contentSecurityPolicy)
  return response
}

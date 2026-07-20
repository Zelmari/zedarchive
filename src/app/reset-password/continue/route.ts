import { NextResponse, type NextRequest } from 'next/server'
import { readAuthEnvironment } from '@/config/auth-environment'
import { parseVerifyEmailToken } from '@/features/auth/domain/verify-email-token'

export function GET(request: NextRequest): NextResponse {
  const tokens = request.nextUrl.searchParams.getAll('token')
  const parsedToken = parseVerifyEmailToken({ token: tokens })
  const destination = new URL('/reset-password', readAuthEnvironment().authUrl)

  if (parsedToken.kind === 'valid') {
    destination.hash = new URLSearchParams({
      token: parsedToken.token,
    }).toString()
  } else {
    destination.hash = 'invalid'
  }

  return NextResponse.redirect(destination)
}

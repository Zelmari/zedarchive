import { NextResponse } from 'next/server'
import {
  constantTimeSecretEquals,
  readAccountPurgeEnvironment,
} from '@/config/account-purge-environment'
import type { AccountPurgeSweepResult } from '@/server/account-lifecycle/account-purge-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const responseHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
} as const

type AccountPurgeRunner = () => Promise<AccountPurgeSweepResult>

function response(body: object, status: 200 | 400 | 401 | 503): NextResponse {
  return NextResponse.json(body, { status, headers: responseHeaders })
}

function hasRequestOptions(request: Request): boolean {
  const url = new URL(request.url)
  const contentLength = request.headers.get('content-length')
  return (
    url.search.length > 0 ||
    request.headers.has('transfer-encoding') ||
    (contentLength !== null && contentLength !== '0')
  )
}

function readBearerToken(request: Request): string | undefined {
  const authorization = request.headers.get('authorization')
  if (authorization === null) return undefined
  const match = /^Bearer ([^\s]+)$/u.exec(authorization)
  return match?.[1]
}

export async function handleAccountPurgeGet(
  request: Request,
  runner: AccountPurgeRunner,
): Promise<NextResponse> {
  let environment: ReturnType<typeof readAccountPurgeEnvironment>
  try {
    environment = readAccountPurgeEnvironment()
  } catch {
    return response({ error: 'service_unavailable' }, 503)
  }

  if (!environment.enabled || environment.cronSecret === undefined) {
    return response({ error: 'service_unavailable' }, 503)
  }
  if (hasRequestOptions(request))
    return response({ error: 'invalid_request' }, 400)

  const token = readBearerToken(request)
  if (
    token === undefined ||
    !constantTimeSecretEquals(token, environment.cronSecret)
  ) {
    return response({ error: 'unauthorized' }, 401)
  }

  const result = await runner()
  if (result.result === 'service_unavailable') {
    return response({ error: 'service_unavailable' }, 503)
  }
  return response(result, 200)
}

export async function GET(request: Request): Promise<NextResponse> {
  const { runAccountPurgeSweep } =
    await import('@/server/account-lifecycle/account-purge-service')
  return handleAccountPurgeGet(request, runAccountPurgeSweep)
}

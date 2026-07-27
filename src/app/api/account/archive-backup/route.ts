import { Buffer } from 'node:buffer'
import { NextResponse } from 'next/server'
import type { ArchiveBackupResult } from '@/server/database/archive-backup-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const commonHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
  'Cross-Origin-Resource-Policy': 'same-origin',
} as const

type AccountAccess =
  | Readonly<{ status: 'signed_out' | 'unavailable' }>
  | Readonly<{
      status: 'active'
      session: Readonly<{ user: Readonly<{ id: string }> }>
    }>
  | Readonly<{ status: 'deletion_recoverable' | 'deletion_due' }>

type AccountAccessReader = (headers: Headers) => Promise<AccountAccess>
type ArchiveBackupReader = (request: {
  userId: string
}) => Promise<ArchiveBackupResult>

function hasNavigationMetadata(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site')
  return (
    (site === 'same-origin' || site === 'none') &&
    request.headers.get('sec-fetch-mode') === 'navigate' &&
    request.headers.get('sec-fetch-dest') === 'document' &&
    request.headers.get('sec-fetch-user') === '?1'
  )
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

function fixedError(status: 401 | 403 | 413 | 503): NextResponse {
  return new NextResponse('Unavailable', { status, headers: commonHeaders })
}

export async function handleArchiveBackupGet(
  request: Request,
  resolveAccountAccess: AccountAccessReader,
  readBackup: ArchiveBackupReader,
): Promise<NextResponse> {
  if (!hasNavigationMetadata(request) || hasRequestOptions(request)) {
    return fixedError(403)
  }

  let access: AccountAccess
  try {
    access = await resolveAccountAccess(request.headers)
  } catch {
    return fixedError(503)
  }

  if (access.status === 'signed_out') return fixedError(401)
  if (access.status !== 'active') {
    return fixedError(access.status === 'unavailable' ? 503 : 403)
  }

  const result = await readBackup({ userId: access.session.user.id }).catch(
    () => ({ kind: 'data_unavailable' as const }),
  )
  if (result.kind === 'account_unavailable') return fixedError(403)
  if (result.kind === 'too_large') return fixedError(413)
  if (result.kind === 'data_unavailable') return fixedError(503)

  return new NextResponse(Buffer.from(result.bytes), {
    status: 200,
    headers: {
      ...commonHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${result.filename}"`,
    },
  })
}

export async function GET(request: Request): Promise<NextResponse> {
  const [{ resolveAccountAccess }, { database }, { readArchiveBackup }] =
    await Promise.all([
      import('@/server/auth/auth'),
      import('@/server/database/client'),
      import('@/server/database/archive-backup-service'),
    ])
  return handleArchiveBackupGet(request, resolveAccountAccess, (input) =>
    readArchiveBackup(database, input),
  )
}

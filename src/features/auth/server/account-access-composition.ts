import 'server-only'

import type { ResolvedAccountAccess } from '@/server/auth/auth'
import { resolveAccountAccess } from '@/server/auth/auth'

export async function resolveActiveAccountSession(
  requestHeaders: Headers,
): Promise<
  Extract<ResolvedAccountAccess, { status: 'active' }>['session'] | null
> {
  const access = await resolveAccountAccess(requestHeaders)

  if (access.status === 'active') return access.session
  if (access.status === 'signed_out') return null

  throw new Error('Active account access is unavailable')
}

export async function resolvePublicPersonalizationSession(
  requestHeaders: Headers,
): Promise<
  Extract<ResolvedAccountAccess, { status: 'active' }>['session'] | null
> {
  const access = await resolveAccountAccess(requestHeaders)

  return access.status === 'active' ? access.session : null
}

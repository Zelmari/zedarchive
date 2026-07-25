import 'server-only'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { resolveAccountAccess } from '@/server/auth/auth'

export type AccountDeletionSessionIdentity = {
  userId: string
  sessionId: string
}

export type AccountDeletionActionAccess =
  | { kind: 'active'; identity: AccountDeletionSessionIdentity }
  | {
      kind: 'deletion_recoverable'
      identity: AccountDeletionSessionIdentity
      purgeAfter: Date
    }
  | { kind: 'deletion_due'; identity: AccountDeletionSessionIdentity }
  | { kind: 'signed_out' }
  | { kind: 'unavailable' }

export const accountDeletionRevalidationPaths = [
  '/settings',
  '/account/deletion',
] as const

export function revalidateAccountDeletionPaths(): void {
  for (const path of accountDeletionRevalidationPaths) revalidatePath(path)
  revalidatePath('/', 'layout')
}

export async function resolveAccountDeletionActionAccess(): Promise<AccountDeletionActionAccess> {
  const access = await resolveAccountAccess(await headers())

  if (access.status === 'signed_out' || access.status === 'unavailable') {
    return { kind: access.status }
  }

  const identity = {
    userId: access.session.user.id,
    sessionId: access.session.session.id,
  }

  if (access.status === 'deletion_recoverable') {
    return {
      kind: 'deletion_recoverable',
      identity,
      purgeAfter: access.purgeAfter,
    }
  }

  return { kind: access.status, identity }
}

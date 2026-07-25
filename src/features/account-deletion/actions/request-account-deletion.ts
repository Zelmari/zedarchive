'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { readAuthEnvironment } from '@/config/auth-environment'
import {
  resolveAccountDeletionActionAccess,
  revalidateAccountDeletionPaths,
} from '@/features/account-deletion/actions/account-deletion-action-helpers'
import { createRequestAccountDeletionHandler } from '@/features/account-deletion/actions/request-account-deletion-handler'
import type { AccountDeletionActionState } from '@/features/account-deletion/domain/account-deletion'
import {
  scheduleAccountDeletionCodeEmail,
  verifyCurrentAuthPassword,
} from '@/server/auth/auth'
import { startAccountDeletionChallenge } from '@/server/account-lifecycle/account-deletion-service'
import { database } from '@/server/database/client'

const handler = createRequestAccountDeletionHandler({
  getHeaders: headers,
  resolveAccess: resolveAccountDeletionActionAccess,
  verifyPassword: verifyCurrentAuthPassword,
  startChallenge: (identity) =>
    startAccountDeletionChallenge(
      database,
      readAuthEnvironment().authSecret,
      identity,
    ),
  scheduleCodeEmail: scheduleAccountDeletionCodeEmail,
  revalidate: revalidateAccountDeletionPaths,
})

export async function requestAccountDeletion(
  previousState: AccountDeletionActionState,
  formData: FormData,
): Promise<AccountDeletionActionState> {
  const result = await handler(previousState, formData)
  if (result.kind === 'deletion_requested') redirect('/account/deletion')
  return result
}

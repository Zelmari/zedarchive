'use server'

import { readAuthEnvironment } from '@/config/auth-environment'
import { redirect } from 'next/navigation'
import {
  resolveAccountDeletionActionAccess,
  revalidateAccountDeletionPaths,
} from '@/features/account-deletion/actions/account-deletion-action-helpers'
import { createCompleteAccountDeletionHandler } from '@/features/account-deletion/actions/complete-account-deletion-handler'
import type { AccountDeletionActionState } from '@/features/account-deletion/domain/account-deletion'
import { completeAccountDeletion as completeService } from '@/server/account-lifecycle/account-deletion-service'
import { scheduleAccountDeletionRequestedEmail } from '@/server/auth/auth'
import { database } from '@/server/database/client'

const handler = createCompleteAccountDeletionHandler({
  resolveAccess: resolveAccountDeletionActionAccess,
  completeRequest: (identity, code) =>
    completeService(
      database,
      readAuthEnvironment().authSecret,
      identity,
      code,
      true,
    ),
  scheduleRequestEmail: scheduleAccountDeletionRequestedEmail,
  revalidate: revalidateAccountDeletionPaths,
})

export async function completeAccountDeletion(
  previousState: AccountDeletionActionState,
  formData: FormData,
): Promise<AccountDeletionActionState> {
  const result = await handler(previousState, formData)
  if (result.kind === 'deletion_requested') redirect('/account/deletion')
  return result
}

'use server'

import { redirect } from 'next/navigation'
import { resolveAccountDeletionActionAccess } from '@/features/account-deletion/actions/account-deletion-action-helpers'
import { createCancelAccountDeletionHandler } from '@/features/account-deletion/actions/cancel-account-deletion-handler'
import type { AccountDeletionActionState } from '@/features/account-deletion/domain/account-deletion'
import { cancelAccountDeletion as cancelService } from '@/server/account-lifecycle/account-deletion-service'
import { scheduleAccountDeletionCancelledEmail } from '@/server/auth/auth'
import { database } from '@/server/database/client'

const handler = createCancelAccountDeletionHandler({
  resolveAccess: resolveAccountDeletionActionAccess,
  cancelDeletion: (identity) => cancelService(database, identity),
  scheduleCancellationEmail: ({ recipient, lifecycleId }) =>
    scheduleAccountDeletionCancelledEmail({
      recipient,
      purgeAfter: lifecycleId,
    }),
  redirectToRestoredAccount: () => redirect('/settings'),
})

export async function cancelAccountDeletion(
  previousState: AccountDeletionActionState,
  formData: FormData,
): Promise<AccountDeletionActionState> {
  return handler(previousState, formData)
}

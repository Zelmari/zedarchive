'use server'

import {
  resolveAccountDeletionActionAccess,
  revalidateAccountDeletionPaths,
} from '@/features/account-deletion/actions/account-deletion-action-helpers'
import { createCancelAccountDeletionSetupHandler } from '@/features/account-deletion/actions/cancel-account-deletion-setup-handler'
import type { AccountDeletionActionState } from '@/features/account-deletion/domain/account-deletion'
import { cancelAccountDeletionSetup as cancelSetupService } from '@/server/account-lifecycle/account-deletion-service'
import { database } from '@/server/database/client'

const handler = createCancelAccountDeletionSetupHandler({
  resolveAccess: resolveAccountDeletionActionAccess,
  cancelSetup: (identity) => cancelSetupService(database, identity),
  revalidate: revalidateAccountDeletionPaths,
})

export async function cancelAccountDeletionSetup(
  previousState: AccountDeletionActionState,
  formData: FormData,
): Promise<AccountDeletionActionState> {
  return handler(previousState, formData)
}

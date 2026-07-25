'use server'

import { readAuthEnvironment } from '@/config/auth-environment'
import {
  resolveAccountDeletionActionAccess,
  revalidateAccountDeletionPaths,
} from '@/features/account-deletion/actions/account-deletion-action-helpers'
import { createResendAccountDeletionCodeHandler } from '@/features/account-deletion/actions/resend-account-deletion-code-handler'
import type { AccountDeletionActionState } from '@/features/account-deletion/domain/account-deletion'
import { resendAccountDeletionCode } from '@/server/account-lifecycle/account-deletion-service'
import { scheduleAccountDeletionCodeEmail } from '@/server/auth/auth'
import { database } from '@/server/database/client'

const handler = createResendAccountDeletionCodeHandler({
  resolveAccess: resolveAccountDeletionActionAccess,
  resendCode: (identity) =>
    resendAccountDeletionCode(
      database,
      readAuthEnvironment().authSecret,
      identity,
    ),
  scheduleCodeEmail: scheduleAccountDeletionCodeEmail,
  revalidate: revalidateAccountDeletionPaths,
})

export async function resendDeletionCode(
  previousState: AccountDeletionActionState,
  formData: FormData,
): Promise<AccountDeletionActionState> {
  return handler(previousState, formData)
}

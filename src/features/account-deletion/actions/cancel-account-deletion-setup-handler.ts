import 'server-only'

import type {
  AccountDeletionActionAccess,
  AccountDeletionSessionIdentity,
} from '@/features/account-deletion/actions/account-deletion-action-helpers'
import {
  parseEmptyAccountDeletionFormData,
  type AccountDeletionActionState,
} from '@/features/account-deletion/domain/account-deletion'
import type { CancelAccountDeletionSetupResult } from '@/server/account-lifecycle/account-deletion-service'

type Dependencies = {
  resolveAccess: () => Promise<AccountDeletionActionAccess>
  cancelSetup: (
    identity: AccountDeletionSessionIdentity,
  ) => Promise<CancelAccountDeletionSetupResult>
  revalidate: () => void
}

export function createCancelAccountDeletionSetupHandler({
  resolveAccess,
  cancelSetup,
  revalidate,
}: Dependencies) {
  return async function cancelAccountDeletionSetupHandler(
    _previousState: AccountDeletionActionState,
    formData: FormData,
  ): Promise<AccountDeletionActionState> {
    if (!parseEmptyAccountDeletionFormData(formData)) return { kind: 'retry' }

    let access: AccountDeletionActionAccess
    try {
      access = await resolveAccess()
    } catch {
      console.error('Account deletion setup cancellation session failed.')
      return { kind: 'session_unavailable' }
    }
    if (access.kind === 'signed_out') return { kind: 'sign_in_required' }
    if (access.kind !== 'active') return { kind: 'retry' }

    try {
      const result = await cancelSetup(access.identity)
      if (result.kind === 'session_invalid') {
        return { kind: 'sign_in_required' }
      }
      if (result.kind !== 'cancelled') return { kind: 'retry' }
    } catch {
      console.error('Account deletion setup cancellation failed.')
      return { kind: 'retry' }
    }

    try {
      revalidate()
    } catch {
      console.error('Account deletion revalidation failed.')
    }

    return { kind: 'setup_cancelled' }
  }
}

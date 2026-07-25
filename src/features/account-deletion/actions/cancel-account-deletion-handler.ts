import 'server-only'

import type {
  AccountDeletionActionAccess,
  AccountDeletionSessionIdentity,
} from '@/features/account-deletion/actions/account-deletion-action-helpers'
import {
  parseCancelAccountDeletionFormData,
  type AccountDeletionActionState,
} from '@/features/account-deletion/domain/account-deletion'
import type { CancelAccountDeletionResult } from '@/server/account-lifecycle/account-deletion-service'

type Dependencies = {
  resolveAccess: () => Promise<AccountDeletionActionAccess>
  cancelDeletion: (
    identity: AccountDeletionSessionIdentity,
  ) => Promise<CancelAccountDeletionResult>
  scheduleCancellationEmail: (delivery: {
    recipient: string
    lifecycleId: Date
  }) => void
  redirectToRestoredAccount: () => never
}

export function createCancelAccountDeletionHandler({
  resolveAccess,
  cancelDeletion,
  scheduleCancellationEmail,
  redirectToRestoredAccount,
}: Dependencies) {
  return async function cancelAccountDeletionHandler(
    _previousState: AccountDeletionActionState,
    formData: FormData,
  ): Promise<AccountDeletionActionState> {
    const submission = parseCancelAccountDeletionFormData(formData)
    if (submission.kind !== 'valid') return { kind: 'retry' }

    let access: AccountDeletionActionAccess
    try {
      access = await resolveAccess()
    } catch {
      console.error('Account deletion cancellation session lookup failed.')
      return { kind: 'session_unavailable' }
    }
    if (access.kind === 'signed_out') return { kind: 'sign_in_required' }
    if (access.kind === 'deletion_due') return { kind: 'deletion_due' }
    if (access.kind !== 'deletion_recoverable') return { kind: 'retry' }

    let result: CancelAccountDeletionResult
    try {
      result = await cancelDeletion(access.identity)
    } catch {
      console.error('Account deletion cancellation failed.')
      return { kind: 'retry' }
    }

    if (result.kind === 'deletion_due') return { kind: 'deletion_due' }
    if (result.kind === 'session_invalid') {
      return { kind: 'sign_in_required' }
    }
    if (result.kind !== 'deletion_cancelled') return { kind: 'retry' }

    try {
      scheduleCancellationEmail({
        recipient: result.recipient,
        lifecycleId: result.purgeAfter,
      })
    } catch {
      console.error('Account deletion cancellation email scheduling failed.')
    }

    // Revalidation is deliberately omitted. It re-renders the recovery route,
    // and a restored account is redirected away from it, which would discard
    // the approved focused confirmation. Every route is dynamic, so the next
    // navigation already renders the restored account.
    //
    // A pre-hydration submission cannot render the focused confirmation, and
    // re-rendering the recovery route for a restored account would answer a
    // form post with a method-preserving redirect. Send it to settings here.
    if (!submission.hydrated) redirectToRestoredAccount()

    return { kind: 'deletion_cancelled' }
  }
}

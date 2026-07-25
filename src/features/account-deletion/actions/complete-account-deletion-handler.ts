import 'server-only'

import type {
  AccountDeletionActionAccess,
  AccountDeletionSessionIdentity,
} from '@/features/account-deletion/actions/account-deletion-action-helpers'
import {
  parseCompleteAccountDeletionFormData,
  type AccountDeletionActionState,
} from '@/features/account-deletion/domain/account-deletion'
import type { CompleteAccountDeletionResult } from '@/server/account-lifecycle/account-deletion-service'

type Dependencies = {
  resolveAccess: () => Promise<AccountDeletionActionAccess>
  completeRequest: (
    identity: AccountDeletionSessionIdentity,
    code: string,
  ) => Promise<CompleteAccountDeletionResult>
  scheduleRequestEmail: (delivery: {
    recipient: string
    purgeAfter: Date
  }) => void
  revalidate: () => void
}

export function createCompleteAccountDeletionHandler({
  resolveAccess,
  completeRequest,
  scheduleRequestEmail,
  revalidate,
}: Dependencies) {
  return async function completeAccountDeletionHandler(
    _previousState: AccountDeletionActionState,
    formData: FormData,
  ): Promise<AccountDeletionActionState> {
    const parsed = parseCompleteAccountDeletionFormData(formData)
    if (parsed.kind !== 'valid') return parsed

    let access: AccountDeletionActionAccess
    try {
      access = await resolveAccess()
    } catch {
      console.error('Account deletion completion session lookup failed.')
      return { kind: 'session_unavailable' }
    }
    if (access.kind === 'signed_out') return { kind: 'sign_in_required' }
    if (access.kind !== 'active') return { kind: 'retry' }

    let result: CompleteAccountDeletionResult
    try {
      result = await completeRequest(access.identity, parsed.code)
    } catch {
      console.error('Account deletion completion failed.')
      return { kind: 'retry' }
    }

    if (result.kind !== 'deletion_requested') {
      if (result.kind === 'already_requested') {
        return { kind: 'deletion_requested' }
      }
      if (result.kind === 'session_invalid') {
        return { kind: 'sign_in_required' }
      }
      if (
        result.kind === 'invalid_code' ||
        result.kind === 'code_expired' ||
        result.kind === 'reauthentication_required' ||
        result.kind === 'attempts_exhausted' ||
        result.kind === 'restart_required'
      ) {
        return result
      }
      return { kind: 'retry' }
    }

    try {
      scheduleRequestEmail({
        recipient: result.recipient,
        purgeAfter: result.purgeAfter,
      })
    } catch {
      // The lifecycle commit is authoritative. Informational email failure
      // must not make a committed request appear to have failed.
      console.error('Account deletion request email scheduling failed.')
    }

    try {
      revalidate()
    } catch {
      console.error('Account deletion revalidation failed.')
    }

    return { kind: 'deletion_requested' }
  }
}

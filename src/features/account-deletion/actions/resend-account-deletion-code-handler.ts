import 'server-only'

import type {
  AccountDeletionActionAccess,
  AccountDeletionSessionIdentity,
} from '@/features/account-deletion/actions/account-deletion-action-helpers'
import type {
  AccountDeletionCodeDelivery,
  ResendAccountDeletionCodeResult,
} from '@/server/account-lifecycle/account-deletion-service'
import {
  parseEmptyAccountDeletionFormData,
  type AccountDeletionActionState,
} from '@/features/account-deletion/domain/account-deletion'

type Dependencies = {
  resolveAccess: () => Promise<AccountDeletionActionAccess>
  resendCode: (
    identity: AccountDeletionSessionIdentity,
  ) => Promise<ResendAccountDeletionCodeResult>
  scheduleCodeEmail: (delivery: AccountDeletionCodeDelivery) => void
  revalidate: () => void
}

export function createResendAccountDeletionCodeHandler({
  resolveAccess,
  resendCode,
  scheduleCodeEmail,
  revalidate,
}: Dependencies) {
  return async function resendAccountDeletionCodeHandler(
    _previousState: AccountDeletionActionState,
    formData: FormData,
  ): Promise<AccountDeletionActionState> {
    if (!parseEmptyAccountDeletionFormData(formData)) return { kind: 'retry' }

    let access: AccountDeletionActionAccess
    try {
      access = await resolveAccess()
    } catch {
      console.error('Account deletion resend session lookup failed.')
      return { kind: 'session_unavailable' }
    }
    if (access.kind === 'signed_out') return { kind: 'sign_in_required' }
    if (access.kind !== 'active') return { kind: 'retry' }

    let result: ResendAccountDeletionCodeResult
    try {
      result = await resendCode(access.identity)
    } catch {
      console.error('Account deletion resend failed.')
      return { kind: 'retry' }
    }

    if (result.kind === 'session_invalid') {
      return { kind: 'sign_in_required' }
    }
    if (
      result.kind === 'resend_cooldown' ||
      result.kind === 'send_limit' ||
      result.kind === 'reauthentication_required' ||
      result.kind === 'attempts_exhausted' ||
      result.kind === 'restart_required'
    ) {
      return result
    }
    if (result.kind !== 'challenge_resent') return { kind: 'retry' }

    try {
      scheduleCodeEmail(result.delivery)
    } catch {
      console.error('Account deletion resend email scheduling failed.')
      return { kind: 'retry' }
    }

    try {
      revalidate()
    } catch {
      console.error('Account deletion revalidation failed.')
    }

    return { kind: 'code_resent' }
  }
}

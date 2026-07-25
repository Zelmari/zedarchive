import 'server-only'

import type { CurrentPasswordVerification } from '@/server/auth/verify-current-password'
import type {
  AccountDeletionCodeDelivery,
  StartAccountDeletionChallengeResult,
} from '@/server/account-lifecycle/account-deletion-service'
import type {
  AccountDeletionActionAccess,
  AccountDeletionSessionIdentity,
} from '@/features/account-deletion/actions/account-deletion-action-helpers'
import {
  parseStartAccountDeletionFormData,
  type AccountDeletionActionState,
} from '@/features/account-deletion/domain/account-deletion'

type Dependencies = {
  getHeaders: () => Promise<Headers>
  resolveAccess: () => Promise<AccountDeletionActionAccess>
  verifyPassword: (
    headers: Headers,
    password: string,
  ) => Promise<CurrentPasswordVerification>
  startChallenge: (
    identity: AccountDeletionSessionIdentity,
  ) => Promise<StartAccountDeletionChallengeResult>
  scheduleCodeEmail: (delivery: AccountDeletionCodeDelivery) => void
  revalidate: () => void
}

export function createRequestAccountDeletionHandler({
  getHeaders,
  resolveAccess,
  verifyPassword,
  startChallenge,
  scheduleCodeEmail,
  revalidate,
}: Dependencies) {
  return async function requestAccountDeletionHandler(
    _previousState: AccountDeletionActionState,
    formData: FormData,
  ): Promise<AccountDeletionActionState> {
    const parsed = parseStartAccountDeletionFormData(formData)
    if (parsed.kind !== 'valid') return parsed

    let headers: Headers
    let access: AccountDeletionActionAccess
    try {
      ;[headers, access] = await Promise.all([getHeaders(), resolveAccess()])
    } catch {
      console.error('Account deletion session lookup failed.')
      return { kind: 'session_unavailable' }
    }

    if (access.kind === 'signed_out') return { kind: 'sign_in_required' }
    if (access.kind !== 'active') return { kind: 'retry' }

    let password: CurrentPasswordVerification
    try {
      password = await verifyPassword(headers, parsed.password)
    } catch {
      console.error('Account deletion password verification failed.')
      return { kind: 'retry' }
    }

    switch (password.kind) {
      case 'invalid_password':
        return { kind: 'invalid_password' }
      case 'rate_limited':
        return { kind: 'rate_limited' }
      case 'session_invalid':
        return { kind: 'sign_in_required' }
      case 'unavailable':
        return { kind: 'retry' }
      case 'verified':
        break
    }

    let result: StartAccountDeletionChallengeResult
    try {
      result = await startChallenge(access.identity)
    } catch {
      console.error('Account deletion challenge request failed.')
      return { kind: 'retry' }
    }

    if (result.kind !== 'challenge_created') {
      if (result.kind === 'already_requested') {
        return { kind: 'deletion_requested' }
      }
      if (result.kind === 'resend_cooldown' || result.kind === 'send_limit') {
        return result
      }
      if (result.kind === 'session_invalid') {
        return { kind: 'sign_in_required' }
      }
      return { kind: 'retry' }
    }

    try {
      scheduleCodeEmail(result.delivery)
    } catch {
      console.error('Account deletion code email scheduling failed.')
      try {
        revalidate()
      } catch {
        console.error('Account deletion revalidation failed.')
      }
      return { kind: 'retry' }
    }

    try {
      revalidate()
    } catch {
      console.error('Account deletion revalidation failed.')
    }

    return { kind: 'code_sent' }
  }
}

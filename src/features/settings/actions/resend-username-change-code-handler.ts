import 'server-only'

import {
  parseResendUsernameChangeFormData,
  type UsernameChangeActionState,
} from '@/features/settings/domain/username-change'
import {
  getUsernameChangeSessionIdentity,
  type UsernameChangeSession,
} from '@/features/settings/actions/username-change-action-helpers'
import type { UsernameChangeResendResult } from '@/server/identity/username-change-service'

type Dependencies = {
  getSession: () => Promise<UsernameChangeSession>
  resendUsernameChangeCode: (session: {
    userId: string
    sessionId: string
  }) => Promise<UsernameChangeResendResult>
  scheduleEmail: (delivery: {
    userId: string
    code: string
    challengeId: string
  }) => void
  revalidate: () => void
}

export function createResendUsernameChangeCodeHandler({
  getSession,
  resendUsernameChangeCode,
  scheduleEmail,
  revalidate,
}: Dependencies) {
  return async function resendUsernameChangeCodeHandler(
    _previousState: UsernameChangeActionState,
    formData: FormData,
  ): Promise<UsernameChangeActionState> {
    if (!parseResendUsernameChangeFormData(formData)) {
      return { kind: 'retry' }
    }

    let session: UsernameChangeSession
    try {
      session = await getSession()
    } catch {
      console.error('Username change resend session lookup failed.')
      return { kind: 'session_unavailable' }
    }
    const identity = getUsernameChangeSessionIdentity(session)
    if (identity === null) return { kind: 'sign_in_required' }

    let result: UsernameChangeResendResult
    try {
      result = await resendUsernameChangeCode(identity)
    } catch {
      console.error('Username change resend failed.')
      return { kind: 'retry' }
    }

    if (result.kind === 'session_invalid') return { kind: 'sign_in_required' }
    if (
      result.kind === 'restart_required' ||
      result.kind === 'reauthentication_required' ||
      result.kind === 'attempts_exhausted'
    ) {
      return result
    }
    if (result.kind === 'resend_cooldown' || result.kind === 'send_limit') {
      return result
    }

    try {
      scheduleEmail({
        userId: identity.userId,
        code: result.delivery.code,
        challengeId: result.delivery.challengeId,
      })
    } catch {
      console.error('Username change resend email scheduling failed.')
      return { kind: 'retry' }
    }

    try {
      revalidate()
    } catch {
      console.error('Username change revalidation failed.')
    }

    return { kind: 'code_resent' }
  }
}

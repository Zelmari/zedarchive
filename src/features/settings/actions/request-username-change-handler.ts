import 'server-only'

import {
  parseStartUsernameChangeFormData,
  type UsernameChangeActionState,
} from '@/features/settings/domain/username-change'
import {
  getUsernameChangeSessionIdentity,
  type UsernameChangeSession,
} from '@/features/settings/actions/username-change-action-helpers'
import type { CurrentPasswordVerification } from '@/server/auth/verify-current-password'
import type {
  UsernameChangePreflightResult,
  UsernameChangeRequestResult,
} from '@/server/identity/username-change-service'

type Dependencies = {
  getHeaders: () => Promise<Headers>
  getSession: () => Promise<UsernameChangeSession>
  verifyPassword: (
    requestHeaders: Headers,
    password: string,
  ) => Promise<CurrentPasswordVerification>
  preflightUsernameChange: (
    session: { userId: string; sessionId: string },
    username: string,
  ) => Promise<UsernameChangePreflightResult>
  requestUsernameChange: (
    session: { userId: string; sessionId: string },
    username: string,
  ) => Promise<UsernameChangeRequestResult>
  scheduleEmail: (delivery: {
    userId: string
    code: string
    challengeId: string
  }) => void
  revalidate: () => void
}

function mapRequestResult(
  result: Exclude<UsernameChangeRequestResult, { kind: 'challenge_created' }>,
): UsernameChangeActionState {
  switch (result.kind) {
    case 'invalid_username':
    case 'no_change':
    case 'already_changed':
    case 'target_unavailable':
      return result
    case 'session_invalid':
      return { kind: 'sign_in_required' }
    case 'resend_cooldown':
    case 'send_limit':
      return result
    case 'email_unavailable':
      return { kind: 'retry' }
  }
}

function mapPreflightResult(
  result: Exclude<UsernameChangePreflightResult, { kind: 'ready' }>,
): UsernameChangeActionState {
  switch (result.kind) {
    case 'invalid_username':
    case 'no_change':
    case 'already_changed':
    case 'target_unavailable':
      return result
    case 'session_invalid':
      return { kind: 'sign_in_required' }
    case 'email_unavailable':
      return { kind: 'retry' }
  }
}

export function createRequestUsernameChangeHandler({
  getHeaders,
  getSession,
  verifyPassword,
  preflightUsernameChange,
  requestUsernameChange,
  scheduleEmail,
  revalidate,
}: Dependencies) {
  return async function requestUsernameChangeHandler(
    _previousState: UsernameChangeActionState,
    formData: FormData,
  ): Promise<UsernameChangeActionState> {
    const parsed = parseStartUsernameChangeFormData(formData)
    if (parsed.kind !== 'valid') return parsed

    let requestHeaders: Headers
    let session: UsernameChangeSession

    try {
      ;[requestHeaders, session] = await Promise.all([
        getHeaders(),
        getSession(),
      ])
    } catch {
      console.error('Username change session lookup failed.')
      return { kind: 'session_unavailable' }
    }

    const identity = getUsernameChangeSessionIdentity(session)
    if (identity === null) return { kind: 'sign_in_required' }

    let preflight: UsernameChangePreflightResult
    try {
      preflight = await preflightUsernameChange(identity, parsed.username)
    } catch {
      console.error('Username change preflight failed.')
      return { kind: 'retry' }
    }
    if (preflight.kind !== 'ready') return mapPreflightResult(preflight)

    let passwordVerification: CurrentPasswordVerification
    try {
      passwordVerification = await verifyPassword(
        requestHeaders,
        parsed.password,
      )
    } catch {
      console.error('Username change password verification failed.')
      return { kind: 'retry' }
    }

    if (passwordVerification.kind === 'invalid_password') {
      return { kind: 'invalid_password' }
    }
    if (passwordVerification.kind === 'rate_limited') {
      return { kind: 'rate_limited' }
    }
    if (passwordVerification.kind === 'session_invalid') {
      return { kind: 'sign_in_required' }
    }
    if (passwordVerification.kind === 'unavailable') {
      return { kind: 'retry' }
    }

    let result: UsernameChangeRequestResult
    try {
      result = await requestUsernameChange(identity, preflight.username)
    } catch {
      console.error('Username change request failed.')
      return { kind: 'retry' }
    }

    if (result.kind !== 'challenge_created') return mapRequestResult(result)

    try {
      scheduleEmail({
        userId: identity.userId,
        code: result.delivery.code,
        challengeId: result.delivery.challengeId,
      })
    } catch {
      console.error('Username change email scheduling failed.')
      return { kind: 'retry' }
    }

    try {
      revalidate()
    } catch {
      console.error('Username change revalidation failed.')
    }

    return { kind: 'code_sent' }
  }
}

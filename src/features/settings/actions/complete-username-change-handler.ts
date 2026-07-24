import 'server-only'

import {
  parseCompleteUsernameChangeFormData,
  type UsernameChangeActionState,
} from '@/features/settings/domain/username-change'
import {
  getUsernameChangeSessionIdentity,
  type UsernameChangeSession,
} from '@/features/settings/actions/username-change-action-helpers'
import type { UsernameChangeCompletionResult } from '@/server/identity/username-change-service'

type Dependencies = {
  getSession: () => Promise<UsernameChangeSession>
  completeUsernameChange: (
    session: { userId: string; sessionId: string },
    code: string,
  ) => Promise<UsernameChangeCompletionResult>
  revalidate: () => void
}

function mapCompletionResult(
  result: Exclude<UsernameChangeCompletionResult, { kind: 'changed' }>,
): UsernameChangeActionState {
  switch (result.kind) {
    case 'invalid_code':
    case 'code_expired':
    case 'reauthentication_required':
    case 'attempts_exhausted':
    case 'restart_required':
    case 'target_unavailable':
    case 'already_changed':
      return result
    case 'session_invalid':
      return { kind: 'sign_in_required' }
  }
}

export function createCompleteUsernameChangeHandler({
  getSession,
  completeUsernameChange,
  revalidate,
}: Dependencies) {
  return async function completeUsernameChangeHandler(
    _previousState: UsernameChangeActionState,
    formData: FormData,
  ): Promise<UsernameChangeActionState> {
    const parsed = parseCompleteUsernameChangeFormData(formData)
    if (parsed.kind !== 'valid') return parsed

    let session: UsernameChangeSession
    try {
      session = await getSession()
    } catch {
      console.error('Username change completion session lookup failed.')
      return { kind: 'session_unavailable' }
    }
    const identity = getUsernameChangeSessionIdentity(session)
    if (identity === null) return { kind: 'sign_in_required' }

    let result: UsernameChangeCompletionResult
    try {
      result = await completeUsernameChange(identity, parsed.code)
    } catch {
      console.error('Username change completion failed.')
      return { kind: 'retry' }
    }

    if (result.kind !== 'changed') return mapCompletionResult(result)

    try {
      revalidate()
    } catch {
      console.error('Username change revalidation failed.')
    }

    return { kind: 'changed', username: result.username }
  }
}

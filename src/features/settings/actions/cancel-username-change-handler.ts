import 'server-only'

import {
  parseCancelUsernameChangeFormData,
  type UsernameChangeActionState,
} from '@/features/settings/domain/username-change'
import {
  getUsernameChangeSessionIdentity,
  type UsernameChangeSession,
} from '@/features/settings/actions/username-change-action-helpers'

type Dependencies = {
  getSession: () => Promise<UsernameChangeSession>
  cancelUsernameChange: (session: {
    userId: string
    sessionId: string
  }) => Promise<{ kind: 'cancelled' } | { kind: 'session_invalid' }>
  revalidate: () => void
}

export function createCancelUsernameChangeHandler({
  getSession,
  cancelUsernameChange,
  revalidate,
}: Dependencies) {
  return async function cancelUsernameChangeHandler(
    _previousState: UsernameChangeActionState,
    formData: FormData,
  ): Promise<UsernameChangeActionState> {
    if (!parseCancelUsernameChangeFormData(formData)) {
      return { kind: 'retry' }
    }

    let session: UsernameChangeSession
    try {
      session = await getSession()
    } catch {
      console.error('Username change cancellation session lookup failed.')
      return { kind: 'session_unavailable' }
    }
    const identity = getUsernameChangeSessionIdentity(session)
    if (identity === null) return { kind: 'sign_in_required' }

    try {
      const result = await cancelUsernameChange(identity)
      if (result.kind === 'session_invalid') return { kind: 'sign_in_required' }
    } catch {
      console.error('Username change cancellation failed.')
      return { kind: 'retry' }
    }

    try {
      revalidate()
    } catch {
      console.error('Username change revalidation failed.')
    }

    return { kind: 'cancelled' }
  }
}

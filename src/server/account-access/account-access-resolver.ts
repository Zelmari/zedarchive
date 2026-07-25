import 'server-only'

import type {
  AccountDeletionState,
  AccountDeletionStateReader,
} from '@/server/account-access/account-deletion-state'

export type AccountAccessSession = Readonly<{
  user: Readonly<{ id: string }>
  session: Readonly<{ id: string; userId: string }>
}>

export type AccountAccessResolution<TSession extends AccountAccessSession> =
  | Readonly<{ status: 'signed_out' }>
  | Readonly<{ status: 'active'; session: TSession }>
  | Readonly<{
      status: 'deletion_recoverable'
      session: TSession
      purgeAfter: Date
    }>
  | Readonly<{
      status: 'deletion_due'
      session: TSession
    }>
  | Readonly<{ status: 'unavailable' }>

export type AuthoritativeSessionReader<TSession extends AccountAccessSession> =
  (requestHeaders: Headers) => Promise<TSession | null>

export type DirectProviderSessionApi<TSession extends AccountAccessSession> = (
  input: Readonly<{
    headers: Headers
    query: Readonly<{
      disableCookieCache: true
      disableRefresh: true
    }>
  }>,
) => Promise<TSession | null>

/**
 * Uses Better Auth's direct endpoint dispatcher, not getSessionFromCtx. The
 * latter converts provider failures to null; direct dispatch propagates them
 * so the resolver can distinguish unavailable authority from signed-out state.
 */
export function createAuthoritativeSessionReader<
  TSession extends AccountAccessSession,
>(
  getSession: DirectProviderSessionApi<TSession>,
): AuthoritativeSessionReader<TSession> {
  return (requestHeaders) =>
    getSession({
      headers: requestHeaders,
      query: {
        disableCookieCache: true,
        disableRefresh: true,
      },
    })
}

function hasValidPurgeDeadline(
  state: AccountDeletionState,
): state is Extract<
  AccountDeletionState,
  { kind: 'deletion_recoverable' | 'deletion_due' }
> {
  return (
    (state.kind === 'deletion_recoverable' || state.kind === 'deletion_due') &&
    state.purgeAfter instanceof Date &&
    Number.isFinite(state.purgeAfter.getTime())
  )
}

export function createAccountAccessResolver<
  TSession extends AccountAccessSession,
>(
  readAuthoritativeSession: AuthoritativeSessionReader<TSession>,
  readAccountDeletionState: AccountDeletionStateReader,
): (requestHeaders: Headers) => Promise<AccountAccessResolution<TSession>> {
  return async (requestHeaders) => {
    let session: TSession | null

    try {
      session = await readAuthoritativeSession(requestHeaders)
    } catch {
      return { status: 'unavailable' }
    }

    if (session === null) {
      return { status: 'signed_out' }
    }

    if (
      session.user.id.length === 0 ||
      session.session.userId !== session.user.id
    ) {
      return { status: 'unavailable' }
    }

    let deletionState: AccountDeletionState

    try {
      deletionState = await readAccountDeletionState(session.user.id)
    } catch {
      return { status: 'unavailable' }
    }

    if (deletionState.kind === 'active') {
      return { status: 'active', session }
    }

    if (deletionState.kind === 'unavailable') {
      return { status: 'unavailable' }
    }

    if (!hasValidPurgeDeadline(deletionState)) {
      return { status: 'unavailable' }
    }

    if (deletionState.kind === 'deletion_recoverable') {
      return {
        status: 'deletion_recoverable',
        session,
        purgeAfter: deletionState.purgeAfter,
      }
    }

    return {
      status: 'deletion_due',
      session,
    }
  }
}

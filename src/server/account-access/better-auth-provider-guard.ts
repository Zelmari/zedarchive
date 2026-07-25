import 'server-only'

import { APIError } from 'better-auth'
import { createAuthMiddleware, getSession } from 'better-auth/api'
import type { AccountDeletionStateReader } from '@/server/account-access/account-deletion-state'
import {
  matchBetterAuthProviderOperation,
  type BetterAuthProviderAccessPolicy,
} from '@/server/account-access/better-auth-provider-policy'

export const PROVIDER_OPERATION_UNAVAILABLE_CODE =
  'AUTH_OPERATION_UNAVAILABLE' as const

type ProviderSession = Readonly<{
  user: Readonly<{ id: string }>
}>

export type ProviderBeforeHookBodySanitizer = (context: {
  path?: string
  body?: Record<string, unknown>
}) => void

function operationUnavailable(): APIError {
  return new APIError('FORBIDDEN', {
    code: PROVIDER_OPERATION_UNAVAILABLE_CODE,
    message: 'This authentication operation is unavailable.',
  })
}

export async function isBetterAuthProviderOperationAllowed(
  policy: BetterAuthProviderAccessPolicy,
  session: ProviderSession | null,
  readAccountDeletionState: AccountDeletionStateReader,
): Promise<boolean> {
  if (policy === 'globally_denied') {
    return false
  }

  if (policy === 'pending_allowed') {
    return true
  }

  if (session === null || session.user.id.length === 0) {
    return policy === 'deny_pending'
  }

  let accountState

  try {
    accountState = await readAccountDeletionState(session.user.id)
  } catch {
    return false
  }

  return accountState.kind === 'active'
}

export function createBetterAuthProviderBeforeHook(
  readAccountDeletionState: AccountDeletionStateReader,
  sanitizeBody: ProviderBeforeHookBodySanitizer,
) {
  return createAuthMiddleware(async (ctx) => {
    const dispatchContext = ctx as typeof ctx & {
      operationId?: unknown
    }
    const operation = matchBetterAuthProviderOperation({
      operationId: dispatchContext.operationId,
      path: ctx.path,
      method: ctx.method,
      requestMethod: ctx.request?.method,
    })

    if (operation === null || operation.policy === 'globally_denied') {
      throw operationUnavailable()
    }

    let session: ProviderSession | null = null

    if (
      operation.policy === 'deny_pending' ||
      operation.policy === 'active_only'
    ) {
      let sessionResult

      try {
        sessionResult = await getSession()({
          ...ctx,
          method: 'GET',
          asResponse: false,
          headers: ctx.headers ?? new Headers(),
          returnHeaders: true,
          returnStatus: false,
          query: {
            disableCookieCache: true,
            disableRefresh: true,
          },
        })
      } catch {
        throw operationUnavailable()
      }

      if (sessionResult.headers !== undefined) {
        sessionResult.headers.forEach((value, key) => {
          if (ctx.context.responseHeaders === undefined) {
            ctx.context.responseHeaders = new Headers({ [key]: value })
          } else if (key.toLowerCase() === 'set-cookie') {
            ctx.context.responseHeaders.append(key, value)
          } else {
            ctx.context.responseHeaders.set(key, value)
          }
        })
      }

      session = sessionResult.response
      ctx.context.session = sessionResult.response
    }

    if (
      !(await isBetterAuthProviderOperationAllowed(
        operation.policy,
        session,
        readAccountDeletionState,
      ))
    ) {
      throw operationUnavailable()
    }

    sanitizeBody({
      path: ctx.path,
      body:
        ctx.body !== undefined && typeof ctx.body === 'object'
          ? (ctx.body as Record<string, unknown>)
          : undefined,
    })
  })
}

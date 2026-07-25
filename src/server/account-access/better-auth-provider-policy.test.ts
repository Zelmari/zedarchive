import { getEndpoints } from 'better-auth/api'
import { haveIBeenPwned } from 'better-auth/plugins'
import { describe, expect, it } from 'vitest'
import {
  BETTER_AUTH_PROVIDER_OPERATION_SNAPSHOT,
  matchBetterAuthProviderOperation,
} from '@/server/account-access/better-auth-provider-policy'

function readPinnedProviderInventory() {
  const emptyContext = Promise.resolve({}) as unknown as Parameters<
    typeof getEndpoints
  >[0]
  const { api } = getEndpoints(emptyContext, {
    plugins: [
      haveIBeenPwned({
        paths: ['/sign-up/email', '/reset-password'],
      }),
    ],
  })

  return Object.entries(api).map(([apiKey, endpoint]) => {
    const options = endpoint.options as
      | {
          method?: string | readonly string[]
          operationId?: string
          metadata?: { openapi?: { operationId?: string } }
        }
      | undefined
    const declaredMethod = options?.method
    const methods = Array.isArray(declaredMethod)
      ? declaredMethod
      : [declaredMethod]

    return {
      apiKey,
      operationId:
        options?.operationId ??
        options?.metadata?.openapi?.operationId ??
        apiKey ??
        endpoint.path ??
        '/:virtual',
      path: endpoint.path,
      methods,
    }
  })
}

describe('Better Auth provider operation snapshot', () => {
  it('deeply matches all 31 pinned operations and 33 method entries', () => {
    const frozenInventory = BETTER_AUTH_PROVIDER_OPERATION_SNAPSHOT.map(
      (operation) => ({
        apiKey: operation.apiKey,
        operationId: operation.operationId,
        path: operation.path,
        methods: operation.entries.map((entry) => entry.method),
      }),
    )
    const entryCount = BETTER_AUTH_PROVIDER_OPERATION_SNAPSHOT.reduce(
      (count, operation) => count + operation.entries.length,
      0,
    )

    expect(frozenInventory).toEqual(readPinnedProviderInventory())
    expect(frozenInventory).toHaveLength(31)
    expect(entryCount).toBe(33)
  })

  it('freezes the approved policy distribution', () => {
    const policies = BETTER_AUTH_PROVIDER_OPERATION_SNAPSHOT.flatMap(
      (operation) => operation.entries.map((entry) => entry.policy),
    )

    expect(
      Object.fromEntries(
        Object.entries(Object.groupBy(policies, (policy) => policy)).map(
          ([policy, values]) => [policy, values.length],
        ),
      ),
    ).toEqual({
      globally_denied: 23,
      pending_allowed: 6,
      deny_pending: 3,
      active_only: 1,
    })
  })
})

describe('matchBetterAuthProviderOperation', () => {
  it('infers GET for methodless direct getSession dispatch', () => {
    expect(
      matchBetterAuthProviderOperation({
        operationId: 'getSession',
        path: '/get-session',
      }),
    ).toEqual({
      operationId: 'getSession',
      path: '/get-session',
      method: 'GET',
      policy: 'pending_allowed',
    })
  })

  it('matches each dynamic callback method by its template path', () => {
    expect(
      matchBetterAuthProviderOperation({
        operationId: 'handleOAuthCallback',
        path: '/callback/:id',
        method: 'POST',
        requestMethod: 'POST',
      }),
    ).toMatchObject({
      method: 'POST',
      policy: 'globally_denied',
    })
    expect(
      matchBetterAuthProviderOperation({
        operationId: 'resetPasswordCallback',
        path: '/reset-password/:token',
        method: 'GET',
      }),
    ).toMatchObject({
      method: 'GET',
      policy: 'pending_allowed',
    })
  })

  it('matches pathless setPassword by operation ID regardless of hook path normalization', () => {
    expect(
      matchBetterAuthProviderOperation({
        operationId: 'setPassword',
        path: '/',
      }),
    ).toEqual({
      operationId: 'setPassword',
      path: undefined,
      method: 'POST',
      policy: 'globally_denied',
    })
  })

  it.each([
    {
      operationId: 'unknown',
      path: '/get-session',
      method: 'GET',
    },
    {
      operationId: 'getSession',
      path: '/drifted-session',
      method: 'GET',
    },
    {
      operationId: 'getSession',
      path: '/get-session',
      method: 'PATCH',
    },
    {
      operationId: 'getSession',
      path: '/get-session',
      method: 'GET',
      requestMethod: 'POST',
    },
    {
      operationId: 'getSession',
      path: '/get-session',
      method: 'get',
    },
  ])('fails closed on unknown or drifted dispatch %#', (context) => {
    expect(matchBetterAuthProviderOperation(context)).toBeNull()
  })
})

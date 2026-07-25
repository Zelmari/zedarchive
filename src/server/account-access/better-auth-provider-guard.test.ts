import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createAccountAccessResolver,
  createAuthoritativeSessionReader,
} from '@/server/account-access/account-access-resolver'
import type { AccountDeletionStateReader } from '@/server/account-access/account-deletion-state'
import {
  createBetterAuthProviderBeforeHook,
  isBetterAuthProviderOperationAllowed,
  PROVIDER_OPERATION_UNAVAILABLE_CODE,
} from '@/server/account-access/better-auth-provider-guard'
import { BETTER_AUTH_PROVIDER_OPERATION_SNAPSHOT } from '@/server/account-access/better-auth-provider-policy'

const activeStateReader = vi.fn(async () => ({ kind: 'active' as const }))
const pendingStateReader = vi.fn(async () => ({
  kind: 'deletion_recoverable' as const,
  purgeAfter: new Date('2026-08-08T12:34:56.789Z'),
}))

function createProviderTestAuth(
  stateReader: AccountDeletionStateReader = activeStateReader,
) {
  return betterAuth({
    baseURL: 'http://localhost:3000',
    secret: 'provider-policy-test-secret-is-long-enough',
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
    }),
    emailAndPassword: {
      enabled: true,
    },
    hooks: {
      before: createBetterAuthProviderBeforeHook(stateReader, () => undefined),
    },
    rateLimit: {
      enabled: false,
    },
    logger: {
      disabled: true,
    },
  })
}

function readSessionCookie(response: Response): string {
  const value = response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith('better-auth.session_token='))

  if (value === undefined) {
    throw new Error('Expected a session cookie')
  }

  return value.split(';')[0] ?? value
}

describe('isBetterAuthProviderOperationAllowed', () => {
  it('enforces global and pending-allowed policy without state lookup', async () => {
    const reader = vi.fn()

    await expect(
      isBetterAuthProviderOperationAllowed('globally_denied', null, reader),
    ).resolves.toBe(false)
    await expect(
      isBetterAuthProviderOperationAllowed('pending_allowed', null, reader),
    ).resolves.toBe(true)
    expect(reader).not.toHaveBeenCalled()
  })

  it.each([
    ['deny_pending', null, activeStateReader, true],
    ['active_only', null, activeStateReader, false],
    ['deny_pending', { user: { id: 'active-user' } }, activeStateReader, true],
    ['active_only', { user: { id: 'active-user' } }, activeStateReader, true],
    [
      'deny_pending',
      { user: { id: 'pending-user' } },
      pendingStateReader,
      false,
    ],
    [
      'active_only',
      { user: { id: 'pending-user' } },
      pendingStateReader,
      false,
    ],
  ] as const)(
    'evaluates %s for session %#',
    async (policy, session, reader, expected) => {
      await expect(
        isBetterAuthProviderOperationAllowed(policy, session, reader),
      ).resolves.toBe(expected)
    },
  )

  it('fails closed when deletion state is unavailable or throws', async () => {
    await expect(
      isBetterAuthProviderOperationAllowed(
        'active_only',
        { user: { id: 'user-id' } },
        vi.fn(async () => ({ kind: 'unavailable' as const })),
      ),
    ).resolves.toBe(false)
    await expect(
      isBetterAuthProviderOperationAllowed(
        'active_only',
        { user: { id: 'user-id' } },
        vi.fn(async () => Promise.reject(new Error('database unavailable'))),
      ),
    ).resolves.toBe(false)
  })

  it('evaluates every frozen operation entry across every account-access state', async () => {
    const states = [
      {
        name: 'anonymous',
        session: null,
        reader: activeStateReader,
      },
      {
        name: 'active',
        session: { user: { id: 'active-user' } },
        reader: activeStateReader,
      },
      {
        name: 'recoverable',
        session: { user: { id: 'recoverable-user' } },
        reader: pendingStateReader,
      },
      {
        name: 'due',
        session: { user: { id: 'due-user' } },
        reader: vi.fn(async () => ({
          kind: 'deletion_due' as const,
          purgeAfter: new Date('2026-08-08T12:34:56.789Z'),
        })),
      },
      {
        name: 'state-failure',
        session: { user: { id: 'unavailable-user' } },
        reader: vi.fn(async () => ({ kind: 'unavailable' as const })),
      },
    ] as const

    for (const operation of BETTER_AUTH_PROVIDER_OPERATION_SNAPSHOT) {
      for (const entry of operation.entries) {
        for (const state of states) {
          const expected =
            entry.policy === 'pending_allowed' ||
            (entry.policy === 'deny_pending' &&
              (state.name === 'anonymous' || state.name === 'active')) ||
            (entry.policy === 'active_only' && state.name === 'active')

          await expect(
            isBetterAuthProviderOperationAllowed(
              entry.policy,
              state.session,
              state.reader,
            ),
            `${operation.apiKey} ${entry.method} in ${state.name}`,
          ).resolves.toBe(expected)
        }
      }
    }
  })
})

describe('Better Auth provider before hook', () => {
  it('denies every frozen global operation through HTTP and direct dispatch before handler parsing', async () => {
    const auth = createProviderTestAuth()
    const directApi = auth.api as unknown as Record<
      string,
      (input: Record<string, unknown>) => Promise<unknown>
    >
    const deniedEntries = BETTER_AUTH_PROVIDER_OPERATION_SNAPSHOT.flatMap(
      (operation) =>
        operation.entries
          .filter(({ policy }) => policy === 'globally_denied')
          .map((entry) => ({ operation, entry })),
    )

    for (const { operation, entry } of deniedEntries) {
      if (operation.path !== undefined) {
        const path = operation.path
          .replace(':id', 'provider-id')
          .replace(':token', 'token')
        const response = await auth.handler(
          new Request(`http://localhost:3000/api/auth${path}`, {
            method: entry.method,
            headers: {
              origin: 'http://localhost:3000',
              ...(entry.method === 'POST'
                ? { 'content-type': 'application/json' }
                : {}),
            },
            body: entry.method === 'POST' ? '{}' : undefined,
          }),
        )
        expect(
          response.status,
          `${operation.apiKey} ${entry.method} HTTP`,
        ).toBe(403)
        await expect(response.json()).resolves.toMatchObject({
          code: PROVIDER_OPERATION_UNAVAILABLE_CODE,
        })
      }

      const direct = directApi[operation.apiKey]
      expect(direct, `${operation.apiKey} direct API`).toBeTypeOf('function')
      await expect(
        direct!({
          headers: new Headers(),
          method: entry.method,
          body: {},
          query: {},
          params: { id: 'provider-id', token: 'token' },
        }),
        `${operation.apiKey} ${entry.method} direct`,
      ).rejects.toMatchObject({
        body: { code: PROVIDER_OPERATION_UNAVAILABLE_CODE },
      })
    }

    expect(deniedEntries).toHaveLength(23)
  })

  it('allows methodless direct and HTTP GET session dispatch without recursion', async () => {
    const auth = createProviderTestAuth()

    await expect(
      auth.api.getSession({ headers: new Headers() }),
    ).resolves.toBeNull()

    const response = await auth.handler(
      new Request('http://localhost:3000/api/auth/get-session'),
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toBeNull()
  })

  it('uses the raw session endpoint without recursion and fails closed on provider read failure', async () => {
    const auth = createProviderTestAuth()
    const signUpResponse = await auth.handler(
      new Request('http://localhost:3000/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Media Fan',
          email: 'fan@example.com',
          password: 'valid-password-15',
        }),
      }),
    )
    expect(signUpResponse.status).toBe(200)
    const cookie = readSessionCookie(signUpResponse)
    const context = await auth.$context
    context.internalAdapter.findSession = async () => {
      throw new Error('provider database unavailable')
    }

    const response = await auth.handler(
      new Request('http://localhost:3000/api/auth/verify-password', {
        method: 'POST',
        headers: {
          cookie,
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ password: 'valid-password-15' }),
      }),
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      code: PROVIDER_OPERATION_UNAVAILABLE_CODE,
    })
  })

  it('denies every pending-blocked operation through HTTP and direct dispatch for a recoverable session', async () => {
    const auth = createProviderTestAuth(pendingStateReader)
    const signUpResponse = await auth.handler(
      new Request('http://localhost:3000/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Media Fan',
          email: 'fan@example.com',
          password: 'valid-password-15',
        }),
      }),
    )
    expect(signUpResponse.status).toBe(200)
    const cookie = readSessionCookie(signUpResponse)
    const directApi = auth.api as unknown as Record<
      string,
      (input: Record<string, unknown>) => Promise<unknown>
    >
    const deniedEntries = BETTER_AUTH_PROVIDER_OPERATION_SNAPSHOT.flatMap(
      (operation) =>
        operation.entries
          .filter(({ policy }) => policy === 'deny_pending')
          .map((entry) => ({ operation, entry })),
    )

    for (const { operation, entry } of deniedEntries) {
      const path = operation
        .path!.replace(':id', 'provider-id')
        .replace(':token', 'token')
      const response = await auth.handler(
        new Request(`http://localhost:3000/api/auth${path}?token=token`, {
          method: entry.method,
          headers: {
            cookie,
            origin: 'http://localhost:3000',
            ...(entry.method === 'POST'
              ? { 'content-type': 'application/json' }
              : {}),
          },
          body: entry.method === 'POST' ? '{}' : undefined,
        }),
      )
      expect(response.status, `${operation.apiKey} HTTP`).toBe(403)
      await expect(response.json()).resolves.toMatchObject({
        code: PROVIDER_OPERATION_UNAVAILABLE_CODE,
      })

      await expect(
        directApi[operation.apiKey]!({
          headers: new Headers({
            cookie,
            origin: 'http://localhost:3000',
          }),
          method: entry.method,
          body: {},
          query: { token: 'token' },
        }),
        `${operation.apiKey} direct`,
      ).rejects.toMatchObject({
        body: { code: PROVIDER_OPERATION_UNAVAILABLE_CODE },
      })
    }

    expect(deniedEntries).toHaveLength(3)
  })

  it('propagates direct getSession failures so account resolution is unavailable, not signed out', async () => {
    const auth = createProviderTestAuth()
    const signUpResponse = await auth.handler(
      new Request('http://localhost:3000/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Media Fan',
          email: 'fan@example.com',
          password: 'valid-password-15',
        }),
      }),
    )
    expect(signUpResponse.status).toBe(200)
    const requestHeaders = new Headers({
      cookie: readSessionCookie(signUpResponse),
    })
    const context = await auth.$context
    context.internalAdapter.findSession = async () => {
      throw new Error('provider database unavailable')
    }
    const readAuthoritativeSession = createAuthoritativeSessionReader((input) =>
      auth.api.getSession(input),
    )
    const resolveAccountAccess = createAccountAccessResolver(
      readAuthoritativeSession,
      activeStateReader,
    )

    await expect(
      readAuthoritativeSession(requestHeaders),
    ).rejects.toMatchObject({
      status: 'INTERNAL_SERVER_ERROR',
    })
    await expect(resolveAccountAccess(requestHeaders)).resolves.toEqual({
      status: 'unavailable',
    })
  })

  it('denies provider POST session dispatch through HTTP and direct APIs', async () => {
    const auth = createProviderTestAuth()
    const response = await auth.handler(
      new Request('http://localhost:3000/api/auth/get-session', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: '{}',
      }),
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      code: PROVIDER_OPERATION_UNAVAILABLE_CODE,
    })
    await expect(
      auth.api.getSession({ headers: new Headers(), method: 'POST' }),
    ).rejects.toMatchObject({
      body: { code: PROVIDER_OPERATION_UNAVAILABLE_CODE },
    })
  })

  it('denies pathless setPassword by operation ID', async () => {
    const auth = createProviderTestAuth()

    await expect(
      auth.api.setPassword({
        headers: new Headers(),
        body: { newPassword: 'valid-password-15' },
      }),
    ).rejects.toMatchObject({
      body: { code: PROVIDER_OPERATION_UNAVAILABLE_CODE },
    })
  })

  it.each([
    ['GET', '/callback/provider-id'],
    ['POST', '/callback/provider-id'],
  ])('denies dynamic %s %s callback dispatch', async (method, path) => {
    const auth = createProviderTestAuth()
    const response = await auth.handler(
      new Request(`http://localhost:3000/api/auth${path}`, {
        method,
        headers: {
          origin: 'http://localhost:3000',
          ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
        },
        body: method === 'POST' ? '{}' : undefined,
      }),
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      code: PROVIDER_OPERATION_UNAVAILABLE_CODE,
    })
  })

  it('fails closed on explicit direct method mismatch', async () => {
    const auth = createProviderTestAuth()

    const dispatchWithMismatchedMethod = auth.api.signInEmail as unknown as (
      input: Record<string, unknown>,
    ) => Promise<unknown>

    await expect(
      dispatchWithMismatchedMethod({
        headers: new Headers(),
        method: 'GET',
        body: {
          email: 'fan@example.com',
          password: 'valid-password-15',
        },
      }),
    ).rejects.toMatchObject({
      body: { code: PROVIDER_OPERATION_UNAVAILABLE_CODE },
    })
  })
})

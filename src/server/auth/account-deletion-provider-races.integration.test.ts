import { randomUUID } from 'node:crypto'
import { eq, like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { hashPassword } from 'better-auth/crypto'
import { Pool } from 'pg'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

vi.mock('server-only', () => ({}))
const hibpFetchMock = vi.hoisted(() => vi.fn())
vi.mock('@better-fetch/fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@better-fetch/fetch')>()),
  betterFetch: hibpFetchMock,
}))

import { readDatabaseTestEnvironment } from '@/config/database-environment'
import {
  completeAccountDeletion,
  startAccountDeletionChallenge,
} from '@/server/account-lifecycle/account-deletion-service'
import { readAccountDeletionState } from '@/server/account-lifecycle/account-deletion-state'
import type {
  AuthEmailCallbackData,
  AuthEmailCallbacks,
} from '@/server/auth/auth-email-callbacks'
import { createAuth } from '@/server/auth/create-auth'
import { deleteOutstandingPasswordResetTokens } from '@/server/auth/password-reset-token-cleanup'
import { runInActiveAccountTransaction } from '@/server/database/active-account-transaction'
import {
  accountDeletionRequests,
  accounts,
  sessions,
  users,
  verifications,
} from '@/server/database/schema'
import { assertSafeTestDatabaseName } from '@/test/database/global-setup'

const authEnvironment = {
  authSecret: 'ci-disposable-better-auth-secret-32chars-min',
  authUrl: 'http://localhost:3000',
} as const
const originalPassword = 'valid-provider-race-password-15'
const replacementPassword = 'replacement-provider-race-password-15'
const operationTimeout = 5_000
const testTimeout = 20_000

const { databaseTestUrl } = readDatabaseTestEnvironment()
const pool = new Pool({ connectionString: databaseTestUrl })
const database = drizzle({ client: pool })
const resetTokens: string[] = []

const emailCallbacks: AuthEmailCallbacks = {
  async sendVerificationEmail() {},
  async sendResetPassword(data: AuthEmailCallbackData) {
    resetTokens.push(data.token)
  },
  async afterPasswordReset(userId: string) {
    await deleteOutstandingPasswordResetTokens(database, userId)
  },
}

const auth = createAuth(
  database,
  authEnvironment,
  {
    accountDeletionStateReader: (userId) =>
      readAccountDeletionState(database, userId),
    emailCallbacks,
  },
  { registrationMode: 'verified-email-required' },
)

type AdapterMethodName =
  | 'createSession'
  | 'createVerificationValue'
  | 'deleteSession'
  | 'deleteUserSessions'
  | 'updatePassword'

type Deferred<T> = Readonly<{
  promise: Promise<T>
  resolve(value: T): void
  reject(reason: unknown): void
}>

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function bounded<T>(promise: Promise<T>, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Timed out waiting for ${label}`)),
          operationTimeout,
        )
      }),
    ])
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}

type AdapterGate = Readonly<{
  waitUntilReached(): Promise<void>
  release(): void
  restore(): void
  callCount(): number
}>

async function gateAdapterMethod(
  methodName: AdapterMethodName,
  stage: 'before_write' | 'after_write',
): Promise<AdapterGate> {
  const context = await auth.$context
  const adapter = context.internalAdapter
  const original = adapter[methodName] as unknown as (
    ...args: unknown[]
  ) => Promise<unknown>
  const reached = deferred<void>()
  const released = deferred<void>()
  let calls = 0

  const wrapped = async (...args: unknown[]) => {
    calls += 1
    if (calls > 1) {
      return original.apply(adapter, args)
    }
    if (stage === 'before_write') {
      reached.resolve()
      await released.promise
      return original.apply(adapter, args)
    }
    const result = await original.apply(adapter, args)
    reached.resolve()
    await released.promise
    return result
  }

  ;(adapter as unknown as Record<string, unknown>)[methodName] = wrapped

  return {
    waitUntilReached: () =>
      bounded(reached.promise, `${methodName} ${stage} gate`),
    release: () => released.resolve(),
    restore: () => {
      ;(adapter as unknown as Record<string, unknown>)[methodName] = original
    },
    callCount: () => calls,
  }
}

async function withAdapterGate<T>(
  methodName: AdapterMethodName,
  stage: 'before_write' | 'after_write',
  exercise: (gate: AdapterGate) => Promise<T>,
): Promise<T> {
  const gate = await gateAdapterMethod(methodName, stage)
  try {
    return await bounded(exercise(gate), `${methodName} race exercise`)
  } finally {
    gate.release()
    gate.restore()
  }
}

function createAuthRequest(
  path: string,
  options: {
    body?: Record<string, unknown>
    cookie?: string
    method?: string
  } = {},
): Request {
  const headers = new Headers({ Origin: authEnvironment.authUrl })
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }
  if (options.cookie !== undefined) headers.set('Cookie', options.cookie)

  return new Request(`${authEnvironment.authUrl}/api/auth${path}`, {
    method: options.method ?? 'POST',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
}

function readSessionCookie(response: Response): string {
  const value = response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith('better-auth.session_token='))
  if (value === undefined) throw new Error('Expected provider session cookie')
  return value.split(';')[0] ?? value
}

async function createCredentialUser() {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const [user] = await database
    .insert(users)
    .values({
      username: `Race${suffix}`,
      usernameIdentityKey: `race${suffix}`,
      email: `${randomUUID()}@example.test`,
      emailVerified: true,
    })
    .returning()
  if (user === undefined) throw new Error('Expected provider-race user')

  await database.insert(accounts).values({
    id: randomUUID(),
    userId: user.id,
    accountId: user.id,
    providerId: 'credential',
    password: await hashPassword(originalPassword),
  })
  return user
}

async function signIn(
  email: string,
  password = originalPassword,
): Promise<{ cookie: string; sessionId: string }> {
  const response = await auth.handler(
    createAuthRequest('/sign-in/email', {
      body: { email, password },
    }),
  )
  expect(response.status).toBe(200)
  const cookie = readSessionCookie(response)
  const storedSessions = await database
    .select({ id: sessions.id })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(users.email, email))
  const latest = storedSessions.at(-1)
  if (latest === undefined) throw new Error('Expected provider session row')
  return { cookie, sessionId: latest.id }
}

async function beginDeletion(userId: string, sessionId: string) {
  const started = await startAccountDeletionChallenge(
    database,
    authEnvironment.authSecret,
    { userId, sessionId },
  )
  expect(started.kind).toBe('challenge_created')
  if (started.kind !== 'challenge_created') {
    throw new Error('Expected deletion challenge')
  }
  return started.delivery.code
}

async function completeDeletion(
  userId: string,
  sessionId: string,
  code: string,
) {
  return completeAccountDeletion(
    database,
    authEnvironment.authSecret,
    { userId, sessionId },
    code,
    true,
  )
}

async function requestDeletion(userId: string, sessionId: string) {
  const code = await beginDeletion(userId, sessionId)
  const completed = await completeDeletion(userId, sessionId, code)
  expect(completed.kind).toBe('deletion_requested')
}

function startProviderSignIn(email: string, password = originalPassword) {
  return auth.handler(
    createAuthRequest('/sign-in/email', {
      body: { email, password },
    }),
  )
}

function startPasswordResetRequest(email: string) {
  return auth.handler(
    createAuthRequest('/request-password-reset', {
      body: { email, redirectTo: '/reset-password/continue' },
    }),
  )
}

async function requestPasswordReset(email: string): Promise<string> {
  const previousCount = resetTokens.length
  const response = await startPasswordResetRequest(email)
  expect(response.status).toBe(200)
  expect(resetTokens).toHaveLength(previousCount + 1)
  return resetTokens.at(-1)!
}

function startPasswordResetCompletion(token: string) {
  return auth.handler(
    createAuthRequest('/reset-password', {
      body: { newPassword: replacementPassword, token },
    }),
  )
}

function startSignOut(cookie: string) {
  return auth.handler(
    createAuthRequest('/sign-out', {
      body: {},
      cookie,
    }),
  )
}

async function expectOwnedResetRows(userId: string) {
  const resetRows = await database
    .select({
      ownerId: verifications.resetOwnerUserId,
      value: verifications.value,
    })
    .from(verifications)
    .where(like(verifications.identifier, 'reset-password:%'))

  expect(resetRows.length).toBeGreaterThan(0)
  expect(resetRows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ ownerId: userId, value: userId }),
    ]),
  )
  expect(resetRows.every((row) => row.ownerId === row.value)).toBe(true)
}

async function resetFixtureState() {
  resetTokens.splice(0)
  await pool.query(`
    truncate table
      anime_entries,
      rate_limits,
      verifications,
      sessions,
      accounts,
      users
    restart identity cascade
  `)
}

beforeAll(async () => {
  const target = await pool.query<{ name: string }>(
    'select current_database() as name',
  )
  assertSafeTestDatabaseName(target.rows[0]?.name)
})

beforeEach(async () => {
  hibpFetchMock.mockReset()
  hibpFetchMock.mockResolvedValue({ data: '', error: null })
  await resetFixtureState()
})

afterAll(async () => {
  await pool.end()
})

describe('pinned provider and deletion lifecycle overlapping commit orders', () => {
  it(
    'revokes a session whose provider insert commits while the sign-in request remains in flight',
    async () => {
      const user = await createCredentialUser()
      const initiator = await signIn(user.email)

      await withAdapterGate('createSession', 'after_write', async (gate) => {
        const providerSignIn = startProviderSignIn(user.email)
        await gate.waitUntilReached()
        expect(gate.callCount()).toBe(1)

        await requestDeletion(user.id, initiator.sessionId)

        gate.release()
        expect((await bounded(providerSignIn, 'provider sign-in')).status).toBe(
          200,
        )
      })

      await expect(
        database
          .select({ id: sessions.id })
          .from(sessions)
          .where(eq(sessions.userId, user.id)),
      ).resolves.toEqual([{ id: initiator.sessionId }])
    },
    testTimeout,
  )

  it(
    'creates only a restricted session when deletion commits while sign-in is held before its adapter write',
    async () => {
      const user = await createCredentialUser()
      const initiator = await signIn(user.email)

      await withAdapterGate('createSession', 'before_write', async (gate) => {
        const providerSignIn = startProviderSignIn(user.email)
        await gate.waitUntilReached()
        expect(gate.callCount()).toBe(1)

        await requestDeletion(user.id, initiator.sessionId)

        gate.release()
        expect((await bounded(providerSignIn, 'provider sign-in')).status).toBe(
          200,
        )
      })

      await expect(
        database.select().from(sessions).where(eq(sessions.userId, user.id)),
      ).resolves.toHaveLength(2)
      await expect(
        runInActiveAccountTransaction(database, user.id, async () => 'private'),
      ).resolves.toEqual({ kind: 'account_unavailable' })
    },
    testTimeout,
  )

  it(
    'keeps a reset row owned when its insert commits while reset issuance remains in flight',
    async () => {
      const user = await createCredentialUser()
      const initiator = await signIn(user.email)

      await withAdapterGate(
        'createVerificationValue',
        'after_write',
        async (gate) => {
          const resetIssuance = startPasswordResetRequest(user.email)
          await gate.waitUntilReached()
          expect(gate.callCount()).toBe(1)
          await expectOwnedResetRows(user.id)

          await requestDeletion(user.id, initiator.sessionId)

          gate.release()
          expect((await bounded(resetIssuance, 'reset issuance')).status).toBe(
            200,
          )
        },
      )

      await expectOwnedResetRows(user.id)
    },
    testTimeout,
  )

  it(
    'inserts an owned reset row after deletion commits while issuance is held before its write',
    async () => {
      const user = await createCredentialUser()
      const initiator = await signIn(user.email)

      await withAdapterGate(
        'createVerificationValue',
        'before_write',
        async (gate) => {
          const resetIssuance = startPasswordResetRequest(user.email)
          await gate.waitUntilReached()
          expect(gate.callCount()).toBe(1)

          await requestDeletion(user.id, initiator.sessionId)

          gate.release()
          expect((await bounded(resetIssuance, 'reset issuance')).status).toBe(
            200,
          )
        },
      )

      await expectOwnedResetRows(user.id)
      const orphanCount = await pool.query<{ count: number }>(
        `select count(*)::int as count
         from verifications verification
         left join users owner
           on owner.id = verification.reset_owner_user_id
         where verification.identifier like 'reset-password:%'
           and owner.id is null`,
      )
      expect(orphanCount.rows[0]?.count).toBe(0)
    },
    testTimeout,
  )

  it(
    'rejects deletion completion after reset session revocation commits while reset remains in flight',
    async () => {
      const user = await createCredentialUser()
      const initiator = await signIn(user.email)
      const token = await requestPasswordReset(user.email)
      const code = await beginDeletion(user.id, initiator.sessionId)

      await withAdapterGate(
        'deleteUserSessions',
        'after_write',
        async (gate) => {
          const resetCompletion = startPasswordResetCompletion(token)
          await gate.waitUntilReached()
          expect(gate.callCount()).toBe(1)

          await expect(
            completeDeletion(user.id, initiator.sessionId, code),
          ).resolves.toEqual({ kind: 'session_invalid' })

          gate.release()
          expect(
            (await bounded(resetCompletion, 'reset completion')).status,
          ).toBe(200)
        },
      )

      await expect(
        database
          .select()
          .from(accountDeletionRequests)
          .where(eq(accountDeletionRequests.userId, user.id)),
      ).resolves.toEqual([])
    },
    testTimeout,
  )

  it(
    'preserves deletion when it commits while reset is held before its password write',
    async () => {
      const user = await createCredentialUser()
      const initiator = await signIn(user.email)
      const token = await requestPasswordReset(user.email)
      const code = await beginDeletion(user.id, initiator.sessionId)

      await withAdapterGate('updatePassword', 'before_write', async (gate) => {
        const resetCompletion = startPasswordResetCompletion(token)
        await gate.waitUntilReached()
        expect(gate.callCount()).toBe(1)

        await expect(
          completeDeletion(user.id, initiator.sessionId, code),
        ).resolves.toMatchObject({ kind: 'deletion_requested' })

        gate.release()
        expect(
          (await bounded(resetCompletion, 'reset completion')).status,
        ).toBe(200)
      })

      await expect(
        database
          .select()
          .from(accountDeletionRequests)
          .where(eq(accountDeletionRequests.userId, user.id)),
      ).resolves.toHaveLength(1)
      await expect(
        database.select().from(sessions).where(eq(sessions.userId, user.id)),
      ).resolves.toEqual([])
    },
    testTimeout,
  )

  it(
    'rejects deletion completion after sign-out deletes the initiator while sign-out remains in flight',
    async () => {
      const user = await createCredentialUser()
      const initiator = await signIn(user.email)
      const code = await beginDeletion(user.id, initiator.sessionId)

      await withAdapterGate('deleteSession', 'after_write', async (gate) => {
        const signOut = startSignOut(initiator.cookie)
        await gate.waitUntilReached()
        expect(gate.callCount()).toBe(1)

        await expect(
          completeDeletion(user.id, initiator.sessionId, code),
        ).resolves.toEqual({ kind: 'session_invalid' })

        gate.release()
        expect((await bounded(signOut, 'provider sign-out')).status).toBe(200)
      })

      await expect(
        database
          .select()
          .from(accountDeletionRequests)
          .where(eq(accountDeletionRequests.userId, user.id)),
      ).resolves.toEqual([])
    },
    testTimeout,
  )

  it(
    'preserves deletion when it commits while sign-out is held before deleting the initiator',
    async () => {
      const user = await createCredentialUser()
      const initiator = await signIn(user.email)
      const code = await beginDeletion(user.id, initiator.sessionId)

      await withAdapterGate('deleteSession', 'before_write', async (gate) => {
        const signOut = startSignOut(initiator.cookie)
        await gate.waitUntilReached()
        expect(gate.callCount()).toBe(1)

        await expect(
          completeDeletion(user.id, initiator.sessionId, code),
        ).resolves.toMatchObject({ kind: 'deletion_requested' })

        gate.release()
        expect((await bounded(signOut, 'provider sign-out')).status).toBe(200)
      })

      await expect(
        database
          .select()
          .from(accountDeletionRequests)
          .where(eq(accountDeletionRequests.userId, user.id)),
      ).resolves.toHaveLength(1)
      await expect(
        database.select().from(sessions).where(eq(sessions.userId, user.id)),
      ).resolves.toEqual([])
    },
    testTimeout,
  )

  it(
    'denies downstream use after successful session and password proofs become stale',
    async () => {
      const user = await createCredentialUser()
      const initiator = await signIn(user.email)

      const staleSession = await auth.handler(
        createAuthRequest('/get-session', {
          cookie: initiator.cookie,
          method: 'GET',
        }),
      )
      expect(staleSession.status).toBe(200)
      await expect(staleSession.json()).resolves.toMatchObject({
        user: { id: user.id },
      })
      const passwordProof = await auth.handler(
        createAuthRequest('/verify-password', {
          body: { password: originalPassword },
          cookie: initiator.cookie,
        }),
      )
      expect(passwordProof.status).toBe(200)

      const staleProofReady = deferred<void>()
      const allowDownstreamUse = deferred<void>()
      const downstreamUse = (async () => {
        staleProofReady.resolve()
        await allowDownstreamUse.promise
        const privateOperation = vi.fn(async () => 'private')
        const result = await runInActiveAccountTransaction(
          database,
          user.id,
          privateOperation,
        )
        return { privateOperation, result }
      })()

      await bounded(staleProofReady.promise, 'stale proof consumer gate')
      await requestDeletion(user.id, initiator.sessionId)
      allowDownstreamUse.resolve()

      const downstream = await bounded(downstreamUse, 'downstream barrier')
      expect(downstream.result).toEqual({ kind: 'account_unavailable' })
      expect(downstream.privateOperation).not.toHaveBeenCalled()

      await expect(
        auth.api.verifyPassword({
          headers: new Headers({
            Cookie: initiator.cookie,
            Origin: authEnvironment.authUrl,
          }),
          body: { password: originalPassword },
        }),
      ).rejects.toMatchObject({
        body: { code: 'AUTH_OPERATION_UNAVAILABLE' },
      })
    },
    testTimeout,
  )
})

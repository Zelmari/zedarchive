import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
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
import { readDatabaseTestEnvironment } from '@/config/database-environment'
import {
  passwordMaximumLength,
  passwordMinimumLength,
} from '@/features/auth/domain/password-policy'
import { readAccountDeletionState } from '@/server/account-lifecycle/account-deletion-state'
import { createAuth as createBaseAuth } from '@/server/auth/create-auth'
import {
  accountDeletionRequests,
  accounts,
  rateLimits,
  sessions,
  usernameChangeRecords,
  users,
} from '@/server/database/schema'
import { assertSafeTestDatabaseName } from '@/test/database/global-setup'

vi.mock('server-only', () => ({}))
const hibpFetchMock = vi.hoisted(() => vi.fn())
vi.mock('@better-fetch/fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@better-fetch/fetch')>()),
  betterFetch: hibpFetchMock,
}))

const authEnvironment = {
  authSecret: 'ci-disposable-better-auth-secret-32chars-min',
  authUrl: 'http://localhost:3000',
} as const

const validPassword = 'valid-password-15'
const belowMinimumPassword = 'a'.repeat(passwordMinimumLength - 1)
const minimumBoundaryPassword = 'a'.repeat(passwordMinimumLength)
const aboveMaximumPassword = 'a'.repeat(passwordMaximumLength + 1)

const { databaseTestUrl } = readDatabaseTestEnvironment()
const pool = new Pool({ connectionString: databaseTestUrl })
const database = drizzle({ client: pool })

function createAuth(...args: Parameters<typeof createBaseAuth>) {
  const [
    authDatabase,
    environment,
    dependencies = {},
    configuration = {},
    testOverrides = {},
  ] = args

  return createBaseAuth(
    authDatabase,
    environment,
    {
      ...dependencies,
      accountDeletionStateReader: (userId) =>
        readAccountDeletionState(database, userId),
    },
    configuration,
    testOverrides,
  )
}

function createAuthRequest(
  path: string,
  options: {
    method?: string
    body?: Record<string, unknown>
    cookie?: string
    origin?: string
    omitOrigin?: boolean
  } = {},
) {
  const headers = new Headers()
  if (!options.omitOrigin) {
    headers.set('Origin', options.origin ?? authEnvironment.authUrl)
  }

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }

  if (options.cookie) {
    headers.set('Cookie', options.cookie)
  }

  return new Request(`${authEnvironment.authUrl}/api/auth${path}`, {
    method: options.method ?? 'POST',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
}

async function signUpTestUser(auth: ReturnType<typeof createAuth>) {
  const signUpResponse = await auth.handler(
    createAuthRequest('/sign-up/email', {
      body: {
        name: 'MediaFan',
        email: 'fan@example.com',
        password: validPassword,
      },
    }),
  )

  expect(signUpResponse.status).toBe(200)

  return {
    sessionCookie: extractSessionCookie(signUpResponse),
    signUpResponse,
  }
}

function extractSessionCookie(response: Response): string {
  const setCookieHeaders =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie')].filter(
          (value): value is string => value !== null,
        )

  const sessionCookie = setCookieHeaders.find((value) =>
    value.startsWith('better-auth.session_token='),
  )

  if (!sessionCookie) {
    throw new Error('Expected a better-auth session cookie')
  }

  return sessionCookie.split(';')[0] ?? sessionCookie
}

beforeAll(async () => {
  const result = await pool.query<{ databaseName: string }>(
    'select current_database() as "databaseName"',
  )

  assertSafeTestDatabaseName(result.rows[0]?.databaseName)
})

beforeEach(async () => {
  hibpFetchMock.mockReset()
  hibpFetchMock.mockResolvedValue({ data: '', error: null })
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
})

afterAll(async () => {
  await pool.end()
})

describe('auth handler integration', () => {
  it('rejects credential signup one character below the approved minimum without persisting users or accounts', async () => {
    const auth = createAuth(
      database,
      authEnvironment,
      {},
      {},
      { allowCredentialSignUpForTesting: true },
    )

    const response = await auth.handler(
      createAuthRequest('/sign-up/email', {
        body: {
          name: 'ShortPassFan',
          email: 'short-pass@example.com',
          password: belowMinimumPassword,
        },
      }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      code: 'PASSWORD_TOO_SHORT',
    })
    expect(hibpFetchMock).not.toHaveBeenCalled()

    const [userRows, accountRows] = await Promise.all([
      database.select().from(users),
      database.select().from(accounts),
    ])

    expect(userRows).toEqual([])
    expect(accountRows).toEqual([])
  })

  it('accepts credential signup at the approved minimum and applies the HIBP range check', async () => {
    const auth = createAuth(
      database,
      authEnvironment,
      {},
      {},
      { allowCredentialSignUpForTesting: true },
    )
    const passwordHash = createHash('sha1')
      .update(minimumBoundaryPassword)
      .digest('hex')
      .toUpperCase()

    const signUpResponse = await auth.handler(
      createAuthRequest('/sign-up/email', {
        body: {
          name: 'MinPassFan',
          email: 'min-pass@example.com',
          password: minimumBoundaryPassword,
        },
      }),
    )

    expect(signUpResponse.status).toBe(200)
    expect(hibpFetchMock.mock.calls.map((call) => call[0])).toEqual([
      `https://api.pwnedpasswords.com/range/${passwordHash.slice(0, 5)}`,
    ])
    expect(hibpFetchMock).toHaveBeenCalledWith(
      `https://api.pwnedpasswords.com/range/${passwordHash.slice(0, 5)}`,
      expect.objectContaining({
        headers: expect.objectContaining({ 'Add-Padding': 'true' }),
      }),
    )
    expect(extractSessionCookie(signUpResponse)).toMatch(
      /^better-auth\.session_token=/,
    )

    const storedUsers = await database.select().from(users)
    expect(storedUsers).toHaveLength(1)
    expect(storedUsers[0]).toMatchObject({
      username: 'MinPassFan',
      email: 'min-pass@example.com',
    })
    await expect(database.select().from(accounts)).resolves.toHaveLength(1)

    const signInResponse = await auth.handler(
      createAuthRequest('/sign-in/email', {
        body: {
          email: 'min-pass@example.com',
          password: minimumBoundaryPassword,
        },
      }),
    )

    expect(signInResponse.status).toBe(200)
    expect(extractSessionCookie(signInResponse)).toMatch(
      /^better-auth\.session_token=/,
    )
  })

  it('rejects credential signup one character above the approved maximum without persisting users or accounts', async () => {
    const auth = createAuth(
      database,
      authEnvironment,
      {},
      {},
      { allowCredentialSignUpForTesting: true },
    )

    const response = await auth.handler(
      createAuthRequest('/sign-up/email', {
        body: {
          name: 'LongPassFan',
          email: 'long-pass@example.com',
          password: aboveMaximumPassword,
        },
      }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      code: 'PASSWORD_TOO_LONG',
    })
    expect(hibpFetchMock).not.toHaveBeenCalled()

    const [userRows, accountRows] = await Promise.all([
      database.select().from(users),
      database.select().from(accounts),
    ])

    expect(userRows).toEqual([])
    expect(accountRows).toEqual([])
  })

  it('rejects disabled signup without writing users or accounts', async () => {
    const auth = createAuth(database, authEnvironment)

    const response = await auth.handler(
      createAuthRequest('/sign-up/email', {
        body: {
          name: 'MediaFan',
          email: 'fan@example.com',
          password: validPassword,
        },
      }),
    )

    expect(response.status).toBe(400)

    const body = (await response.json()) as { code?: string }
    expect(body.code).toBe('EMAIL_PASSWORD_SIGN_UP_DISABLED')

    const [userRows, accountRows] = await Promise.all([
      database.select().from(users),
      database.select().from(accounts),
    ])

    expect(userRows).toEqual([])
    expect(accountRows).toEqual([])
  })

  it('supports a test-only credential signup, session, and revoke lifecycle', async () => {
    const auth = createAuth(
      database,
      authEnvironment,
      {},
      {},
      { allowCredentialSignUpForTesting: true },
    )

    const signUpResponse = await auth.handler(
      createAuthRequest('/sign-up/email', {
        body: {
          name: 'MediaFan',
          email: 'fan@example.com',
          password: validPassword,
          usernameIdentityKey: 'caller-supplied-override',
        },
      }),
    )

    expect(signUpResponse.status).toBe(200)

    const sessionCookie = extractSessionCookie(signUpResponse)
    expect(sessionCookie).toMatch(/^better-auth\.session_token=/)
    expect(sessionCookie).toContain('better-auth.session_token=')

    const setCookieHeaders =
      typeof signUpResponse.headers.getSetCookie === 'function'
        ? signUpResponse.headers.getSetCookie()
        : [signUpResponse.headers.get('set-cookie')].filter(
            (value): value is string => value !== null,
          )

    expect(
      setCookieHeaders.some(
        (value) => value.includes('HttpOnly') && value.includes('SameSite=Lax'),
      ),
    ).toBe(true)

    const sessionResponse = await auth.handler(
      createAuthRequest('/get-session', {
        method: 'GET',
        cookie: sessionCookie,
      }),
    )

    expect(sessionResponse.status).toBe(200)

    const sessionBody = (await sessionResponse.json()) as {
      user: { id: string; name: string; usernameIdentityKey?: string }
    } | null

    expect(sessionBody?.user.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
    expect(sessionBody?.user.name).toBe('MediaFan')
    expect(sessionBody?.user).not.toHaveProperty('usernameIdentityKey')

    const secondAuth = createAuth(
      database,
      authEnvironment,
      {},
      {},
      { allowCredentialSignUpForTesting: true },
    )
    const secondInstanceSessionResponse = await secondAuth.handler(
      createAuthRequest('/get-session', {
        method: 'GET',
        cookie: sessionCookie,
      }),
    )

    expect(secondInstanceSessionResponse.status).toBe(200)

    const secondInstanceSessionBody =
      (await secondInstanceSessionResponse.json()) as {
        user: { id: string }
      } | null

    expect(secondInstanceSessionBody?.user.id).toBe(sessionBody?.user.id)

    const storedUser = await database
      .select()
      .from(users)
      .where(eq(users.id, sessionBody!.user.id))

    expect(storedUser[0]).toMatchObject({
      username: 'MediaFan',
      usernameIdentityKey: 'mediafan',
      email: 'fan@example.com',
    })

    const signOutResponse = await auth.handler(
      createAuthRequest('/sign-out', {
        cookie: sessionCookie,
      }),
    )

    expect(signOutResponse.status).toBe(200)

    const revokedSessionResponse = await auth.handler(
      createAuthRequest('/get-session', {
        method: 'GET',
        cookie: sessionCookie,
      }),
    )

    expect(revokedSessionResponse.status).toBe(200)
    expect(await revokedSessionResponse.json()).toBeNull()
    await expect(database.select().from(sessions)).resolves.toEqual([])
  })

  it('returns no session for an invalid token without leaking details', async () => {
    const auth = createAuth(database, authEnvironment)

    const response = await auth.handler(
      createAuthRequest('/get-session', {
        method: 'GET',
        cookie: 'better-auth.session_token=not-a-valid-session-token',
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toBeNull()
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('rejects an untrusted origin on credential signup without writing users', async () => {
    const auth = createAuth(
      database,
      authEnvironment,
      {},
      {},
      { allowCredentialSignUpForTesting: true },
    )

    const response = await auth.handler(
      createAuthRequest('/sign-up/email', {
        origin: 'https://evil.example.com',
        body: {
          name: 'MediaFan',
          email: 'fan@example.com',
          password: validPassword,
        },
      }),
    )

    expect(response.status).toBe(403)

    const body = (await response.json()) as { code?: string }
    expect(body.code).toBe('INVALID_ORIGIN')

    const [userRows, accountRows] = await Promise.all([
      database.select().from(users),
      database.select().from(accounts),
    ])

    expect(userRows).toEqual([])
    expect(accountRows).toEqual([])
  })

  it('normalizes mixed-case email for credential signup and sign-in lookup', async () => {
    const auth = createAuth(
      database,
      authEnvironment,
      {},
      {},
      { allowCredentialSignUpForTesting: true },
    )

    const signUpResponse = await auth.handler(
      createAuthRequest('/sign-up/email', {
        body: {
          name: 'CaseFan',
          email: 'Mixed.Case@Example.COM',
          password: validPassword,
        },
      }),
    )

    expect(signUpResponse.status).toBe(200)

    const storedUsers = await database.select().from(users)
    expect(storedUsers).toHaveLength(1)
    expect(storedUsers[0]?.email).toBe('mixed.case@example.com')

    const signInResponse = await auth.handler(
      createAuthRequest('/sign-in/email', {
        body: {
          email: 'MIXED.CASE@EXAMPLE.COM',
          password: validPassword,
        },
      }),
    )

    expect(signInResponse.status).toBe(200)
    expect(extractSessionCookie(signInResponse)).toMatch(
      /^better-auth\.session_token=/,
    )
  })

  it('globally denies provider user updates without changing stored identity', async () => {
    const auth = createAuth(
      database,
      authEnvironment,
      {},
      {},
      { allowCredentialSignUpForTesting: true },
    )
    const { sessionCookie } = await signUpTestUser(auth)

    const response = await auth.handler(
      createAuthRequest('/update-user', {
        cookie: sessionCookie,
        body: {
          name: 'NewUsername',
        },
      }),
    )

    expect(response.status).toBe(403)

    const body = (await response.json()) as { code?: string }
    expect(body.code).toBe('AUTH_OPERATION_UNAVAILABLE')

    const storedUsers = await database.select().from(users)

    expect(storedUsers).toHaveLength(1)
    expect(storedUsers[0]).toMatchObject({
      username: 'MediaFan',
      usernameIdentityKey: 'mediafan',
    })
  })

  it('allows only the frozen recovery routes for a pending incoming session through HTTP and direct dispatch', async () => {
    const auth = createAuth(
      database,
      authEnvironment,
      {},
      {},
      { allowCredentialSignUpForTesting: true },
    )
    const { sessionCookie } = await signUpTestUser(auth)
    const [user] = await database.select().from(users)
    expect(user).toBeDefined()
    const requestedAt = new Date(Date.now() - 1_000)
    const purgeAfter = new Date(
      requestedAt.getTime() + 14 * 24 * 60 * 60 * 1_000,
    )
    await database.insert(accountDeletionRequests).values({
      userId: user!.id,
      requestedAt,
      purgeAfter,
    })

    const getSessionResponse = await auth.handler(
      createAuthRequest('/get-session', {
        method: 'GET',
        cookie: sessionCookie,
      }),
    )
    expect(getSessionResponse.status).toBe(200)
    await expect(getSessionResponse.json()).resolves.toMatchObject({
      user: { id: user!.id },
    })

    const pendingHeaders = new Headers({
      Cookie: sessionCookie,
      Origin: authEnvironment.authUrl,
    })
    await expect(
      auth.api.verifyPassword({
        headers: pendingHeaders,
        body: { password: validPassword },
      }),
    ).rejects.toMatchObject({
      body: { code: 'AUTH_OPERATION_UNAVAILABLE' },
    })

    const blockedSignUp = await auth.handler(
      createAuthRequest('/sign-up/email', {
        cookie: sessionCookie,
        body: {
          name: 'AnotherFan',
          email: 'another@example.com',
          password: validPassword,
        },
      }),
    )
    expect(blockedSignUp.status).toBe(403)
    await expect(blockedSignUp.json()).resolves.toMatchObject({
      code: 'AUTH_OPERATION_UNAVAILABLE',
    })

    await expect(
      auth.api.signInEmail({
        headers: pendingHeaders,
        body: {
          email: 'fan@example.com',
          password: validPassword,
        },
      }),
    ).resolves.toMatchObject({
      user: { id: user!.id },
    })
    await expect(database.select().from(users)).resolves.toHaveLength(1)
    await expect(database.select().from(sessions)).resolves.toHaveLength(2)
  })

  it('enforces verify-password session and same-origin semantics without rotating the session', async () => {
    const auth = createAuth(
      database,
      authEnvironment,
      {},
      {},
      { allowCredentialSignUpForTesting: true },
    )
    const { sessionCookie } = await signUpTestUser(auth)
    const verifyBody = { password: validPassword }

    const success = await auth.handler(
      createAuthRequest('/verify-password', {
        body: verifyBody,
        cookie: sessionCookie,
      }),
    )
    expect(success.status).toBe(200)
    expect(success.headers.get('set-cookie')).toBeNull()

    const wrongPassword = await auth.handler(
      createAuthRequest('/verify-password', {
        body: { password: 'wrong-password-15' },
        cookie: sessionCookie,
      }),
    )
    expect(wrongPassword.status).toBe(400)
    expect(wrongPassword.headers.get('set-cookie')).toBeNull()

    const missingOrigin = await auth.handler(
      createAuthRequest('/verify-password', {
        body: verifyBody,
        cookie: sessionCookie,
        omitOrigin: true,
      }),
    )
    expect(missingOrigin.status).toBe(403)
    expect(missingOrigin.headers.get('set-cookie')).toBeNull()

    const mismatchedOrigin = await auth.handler(
      createAuthRequest('/verify-password', {
        body: verifyBody,
        cookie: sessionCookie,
        origin: 'https://attacker.example',
      }),
    )
    expect(mismatchedOrigin.status).toBe(403)
    expect(mismatchedOrigin.headers.get('set-cookie')).toBeNull()

    const [session] = await database.select().from(sessions)
    expect(session).toBeDefined()
    await database
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(sessions.id, session!.id))
    const expiredSession = await auth.handler(
      createAuthRequest('/verify-password', {
        body: verifyBody,
        cookie: sessionCookie,
      }),
    )
    expect(expiredSession.status).toBe(403)
    await expect(expiredSession.json()).resolves.toMatchObject({
      code: 'AUTH_OPERATION_UNAVAILABLE',
    })
    expect(expiredSession.headers.get('set-cookie')).toBeNull()
    await expect(database.select().from(sessions)).resolves.toEqual([])
  })

  it('shares the five-per-sixty-second verify-password limiter through the database', async () => {
    const firstAuth = createAuth(
      database,
      authEnvironment,
      {},
      {},
      { allowCredentialSignUpForTesting: true },
    )
    const { sessionCookie } = await signUpTestUser(firstAuth)
    const requestOptions = {
      body: { password: 'wrong-password-15' },
      cookie: sessionCookie,
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await firstAuth.handler(
        createAuthRequest('/verify-password', requestOptions),
      )
      expect(response.status).toBe(400)
    }
    const limitedResponse = await firstAuth.handler(
      createAuthRequest('/verify-password', requestOptions),
    )
    expect(limitedResponse.status).toBe(429)
    expect(limitedResponse.headers.get('X-Retry-After')).toBeTruthy()

    const persistedRows = await database.select().from(rateLimits)
    expect(persistedRows.some(({ count }) => count >= 5)).toBe(true)
    const secondAuth = createAuth(database, authEnvironment)
    const persistedLimit = await secondAuth.handler(
      createAuthRequest('/verify-password', requestOptions),
    )
    expect(persistedLimit.status).toBe(429)
  })

  it('rejects credential registration for an unexpired reserved former username', async () => {
    const changedAt = new Date()
    const [changedUser] = await database
      .insert(users)
      .values({
        username: 'CurrentName',
        usernameIdentityKey: 'currentname',
        email: 'current@example.com',
        emailVerified: true,
      })
      .returning()
    expect(changedUser).toBeDefined()
    await database.insert(usernameChangeRecords).values({
      userId: changedUser!.id,
      changedAt,
      previousUsernameIdentityKey: 'mediafan',
      previousUsernameReservedUntil: new Date(
        changedAt.getTime() + 14 * 24 * 60 * 60 * 1000,
      ),
    })
    const auth = createAuth(
      database,
      authEnvironment,
      {},
      {},
      { allowCredentialSignUpForTesting: true },
    )

    let response: Response | undefined
    try {
      response = await auth.handler(
        createAuthRequest('/sign-up/email', {
          body: {
            name: 'MediaFan',
            email: 'reserved@example.com',
            password: validPassword,
          },
        }),
      )
    } catch {
      // Database invariants may surface as a rejected handler promise rather
      // than a provider-shaped response; persistence is authoritative here.
    }

    expect(response?.status).not.toBe(200)
    await expect(database.select().from(users)).resolves.toHaveLength(1)
    await expect(database.select().from(accounts)).resolves.toEqual([])
    await expect(database.select().from(sessions)).resolves.toEqual([])
  })

  it('persists database rate limits across a new auth instance', async () => {
    const firstAuth = createAuth(database, authEnvironment)
    const signInBody = {
      email: 'missing@example.com',
      password: validPassword,
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await firstAuth.handler(
        createAuthRequest('/sign-in/email', { body: signInBody }),
      )

      expect(response.status).not.toBe(429)
    }

    const limitedResponse = await firstAuth.handler(
      createAuthRequest('/sign-in/email', { body: signInBody }),
    )

    expect(limitedResponse.status).toBe(429)
    expect(limitedResponse.headers.get('X-Retry-After')).toBeTruthy()

    const rateLimitRows = await database.select().from(rateLimits)
    expect(rateLimitRows).toHaveLength(1)
    expect(rateLimitRows[0]?.count).toBeGreaterThanOrEqual(3)

    const secondAuth = createAuth(database, authEnvironment)
    const persistedLimitResponse = await secondAuth.handler(
      createAuthRequest('/sign-in/email', { body: signInBody }),
    )

    expect(persistedLimitResponse.status).toBe(429)
    expect(persistedLimitResponse.headers.get('X-Retry-After')).toBeTruthy()
  })
})

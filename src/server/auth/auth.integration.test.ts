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
import { createAuth } from '@/server/auth/create-auth'
import { accounts, rateLimits, sessions, users } from '@/server/database/schema'
import { assertSafeTestDatabaseName } from '@/test/database/global-setup'

vi.mock('server-only', () => ({}))

const authEnvironment = {
  authSecret: 'ci-disposable-better-auth-secret-32chars-min',
  authUrl: 'http://localhost:3000',
} as const

const validPassword = 'valid-password-15'

const { databaseTestUrl } = readDatabaseTestEnvironment()
const pool = new Pool({ connectionString: databaseTestUrl })
const database = drizzle({ client: pool })

function createAuthRequest(
  path: string,
  options: {
    method?: string
    body?: Record<string, unknown>
    cookie?: string
    origin?: string
  } = {},
) {
  const headers = new Headers({
    Origin: options.origin ?? authEnvironment.authUrl,
  })

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
  await pool.query(`
    truncate table
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

  it('rejects authenticated username updates without changing stored identity', async () => {
    const auth = createAuth(
      database,
      authEnvironment,
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

    expect(response.status).toBe(400)

    const body = (await response.json()) as { code?: string }
    expect(body.code).toBe('USERNAME_UPDATE_NOT_SUPPORTED')

    const storedUsers = await database.select().from(users)

    expect(storedUsers).toHaveLength(1)
    expect(storedUsers[0]).toMatchObject({
      username: 'MediaFan',
      usernameIdentityKey: 'mediafan',
    })
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

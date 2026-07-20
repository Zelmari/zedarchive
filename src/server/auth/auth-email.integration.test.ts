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
import { createAuthEmailCallbacks } from '@/server/auth/auth-email-callbacks'
import {
  createAuth,
  type AuthRegistrationMode,
} from '@/server/auth/create-auth'
import { deleteOutstandingPasswordResetTokens } from '@/server/auth/password-reset-token-cleanup'
import {
  rateLimits,
  sessions,
  users,
  verifications,
} from '@/server/database/schema'
import type {
  AuthEmailDelivery,
  TransactionalEmail,
} from '@/server/email/email-delivery'
import { AuthEmailDeliveryError } from '@/server/email/resend-email-delivery'
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

const originalPassword = 'valid-password-15'
const replacementPassword = 'replacement-password-15'

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

function extractSessionCookie(response: Response): string | undefined {
  const setCookieHeaders =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie')].filter(
          (value): value is string => value !== null,
        )

  return setCookieHeaders
    .find((value) => value.startsWith('better-auth.session_token='))
    ?.split(';')[0]
}

function createEmailAuth(
  options: {
    allowCredentialSignUpForTesting?: boolean
    verificationExpiresInSeconds?: number
    resetExpiresInSeconds?: number
    delivery?: AuthEmailDelivery
    registrationMode?: AuthRegistrationMode
  } = {},
) {
  const messages: TransactionalEmail[] = []
  const backgroundTasks: Promise<unknown>[] = []
  const delivery: AuthEmailDelivery =
    options.delivery ??
    ({
      async send(message) {
        messages.push(message)
      },
    } satisfies AuthEmailDelivery)
  const backgroundTaskHandler = (promise: Promise<unknown>) => {
    backgroundTasks.push(promise)
  }
  const emailCallbacks = createAuthEmailCallbacks(
    delivery,
    (userId) => deleteOutstandingPasswordResetTokens(database, userId),
    backgroundTaskHandler,
    authEnvironment.authUrl,
  )
  const auth = createAuth(
    database,
    authEnvironment,
    {
      emailCallbacks,
      backgroundTaskHandler,
    },
    { registrationMode: options.registrationMode },
    {
      allowCredentialSignUpForTesting: options.allowCredentialSignUpForTesting,
      verificationExpiresInSeconds: options.verificationExpiresInSeconds,
      resetExpiresInSeconds: options.resetExpiresInSeconds,
    },
  )

  return {
    auth,
    messages,
    async drainBackgroundTasks() {
      await Promise.all(backgroundTasks)
    },
  }
}

async function signUpAndVerifyTestUser(
  authFixture: ReturnType<typeof createEmailAuth>,
): Promise<void> {
  const signUpResponse = await authFixture.auth.handler(
    createAuthRequest('/sign-up/email', {
      body: {
        name: 'MediaFan',
        email: 'Fan@Example.COM',
        password: originalPassword,
        callbackURL: '/',
      },
    }),
  )

  expect(signUpResponse.status).toBe(200)
  await authFixture.drainBackgroundTasks()

  const verificationMessage = authFixture.messages.find(
    (message) => message.category === 'email_verification',
  )
  expect(verificationMessage).toBeDefined()

  const verifyResponse = await verifyEmailFromMessage(
    authFixture.auth,
    verificationMessage!,
  )

  expect(verifyResponse.status).toBe(200)
}

async function signIn(
  auth: ReturnType<typeof createAuth>,
  password: string,
): Promise<Response> {
  return auth.handler(
    createAuthRequest('/sign-in/email', {
      body: { email: 'fan@example.com', password },
    }),
  )
}

function resetTokenFromMessage(message: TransactionalEmail): string {
  const url = new URL(message.text.match(/https?:\/\/\S+/u)![0]!)
  const token = url.pathname.split('/').at(-1)

  if (!token) {
    throw new Error('Expected a reset token in the recovery URL')
  }

  return token
}

function verificationUrlFromMessage(message: TransactionalEmail): URL {
  return new URL(message.text.match(/https?:\/\/\S+/u)![0]!)
}

async function verifyEmailFromMessage(
  auth: ReturnType<typeof createAuth>,
  message: TransactionalEmail,
): Promise<Response> {
  const token = new URLSearchParams(
    verificationUrlFromMessage(message).hash.slice(1),
  ).get('token')

  if (!token) {
    throw new Error('Expected a verification token in the app URL')
  }

  return auth.handler(
    createAuthRequest(`/verify-email?token=${encodeURIComponent(token)}`, {
      method: 'GET',
    }),
  )
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

describe('authentication email integration', () => {
  it('keeps production signup disabled without scheduling delivery', async () => {
    const fixture = createEmailAuth()

    const response = await fixture.auth.handler(
      createAuthRequest('/sign-up/email', {
        body: {
          name: 'MediaFan',
          email: 'fan@example.com',
          password: originalPassword,
          callbackURL: '/',
        },
      }),
    )

    expect(response.status).toBe(400)
    await fixture.drainBackgroundTasks()
    expect(fixture.messages).toEqual([])
    await expect(database.select().from(users)).resolves.toEqual([])
  })

  it('registers in verified-email mode and requires explicit verification before sign-in', async () => {
    const fixture = createEmailAuth({
      registrationMode: 'verified-email-required',
    })

    const signUpResponse = await fixture.auth.handler(
      createAuthRequest('/sign-up/email', {
        body: {
          name: 'MediaFan',
          email: 'Fan@Example.COM',
          password: originalPassword,
          callbackURL: '/',
        },
      }),
    )

    expect(signUpResponse.status).toBe(200)
    expect(extractSessionCookie(signUpResponse)).toBeUndefined()
    await fixture.drainBackgroundTasks()
    expect(fixture.messages).toHaveLength(1)
    expect(fixture.messages[0]).toMatchObject({
      to: 'fan@example.com',
      category: 'email_verification',
    })
    expect(fixture.messages[0]?.text).toContain(authEnvironment.authUrl)

    const unverifiedSignInResponse = await signIn(
      fixture.auth,
      originalPassword,
    )
    expect(unverifiedSignInResponse.status).toBe(403)
    await fixture.drainBackgroundTasks()
    expect(fixture.messages).toHaveLength(1)

    const verificationUrl =
      fixture.messages[0]?.text.match(/https?:\/\/\S+/u)?.[0]
    expect(verificationUrl).toBeDefined()
    expect(new URL(verificationUrl!).pathname).toBe('/verify-email')
    expect(verificationUrl).not.toContain('/api/auth/verify-email')
    expect((await database.select().from(users))[0]?.emailVerified).toBe(false)

    const verifyResponse = await verifyEmailFromMessage(
      fixture.auth,
      fixture.messages[0]!,
    )

    expect(verifyResponse.status).toBe(200)
    expect(extractSessionCookie(verifyResponse)).toBeUndefined()

    const storedUsers = await database.select().from(users)
    expect(storedUsers).toHaveLength(1)
    expect(storedUsers[0]).toMatchObject({
      email: 'fan@example.com',
      emailVerified: true,
    })

    const alreadyVerifiedResponse = await verifyEmailFromMessage(
      fixture.auth,
      fixture.messages[0]!,
    )
    expect(alreadyVerifiedResponse.status).toBe(200)
    expect(extractSessionCookie(alreadyVerifiedResponse)).toBeUndefined()

    const verifiedSignInResponse = await signIn(fixture.auth, originalPassword)
    expect(verifiedSignInResponse.status).toBe(200)
    expect(extractSessionCookie(verifiedSignInResponse)).toMatch(
      /^better-auth\.session_token=/u,
    )
  })

  it('keeps duplicate email synthetic while the database rejects a normalized username conflict', async () => {
    const fixture = createEmailAuth({
      registrationMode: 'verified-email-required',
    })
    const firstResponse = await fixture.auth.handler(
      createAuthRequest('/sign-up/email', {
        body: {
          name: 'MediaFan',
          email: 'fan@example.com',
          password: originalPassword,
        },
      }),
    )
    const duplicateEmailResponse = await fixture.auth.handler(
      createAuthRequest('/sign-up/email', {
        body: {
          name: 'DifferentName',
          email: 'FAN@example.com',
          password: originalPassword,
        },
      }),
    )
    const duplicateUsernameResponse = await fixture.auth.handler(
      createAuthRequest('/sign-up/email', {
        body: {
          name: 'mediafan',
          email: 'other@example.com',
          password: originalPassword,
        },
      }),
    )

    expect(firstResponse.status).toBe(200)
    expect(duplicateEmailResponse.status).toBe(200)
    expect(duplicateUsernameResponse.status).toBe(422)
    expect(await duplicateUsernameResponse.json()).toMatchObject({
      code: 'FAILED_TO_CREATE_USER',
    })
    await expect(database.select().from(users)).resolves.toHaveLength(1)
  })

  it('shares the explicit three-per-minute signup limit across auth instances', async () => {
    const firstFixture = createEmailAuth({
      registrationMode: 'verified-email-required',
    })

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await firstFixture.auth.handler(
        createAuthRequest('/sign-up/email', {
          body: {
            name: `MediaFan${attempt}`,
            email: `fan${attempt}@example.com`,
            password: originalPassword,
          },
        }),
      )

      expect(response.status).toBe(200)
    }

    const secondFixture = createEmailAuth({
      registrationMode: 'verified-email-required',
    })
    const limitedResponse = await secondFixture.auth.handler(
      createAuthRequest('/sign-up/email', {
        body: {
          name: 'FourthFan',
          email: 'fourth@example.com',
          password: originalPassword,
        },
      }),
    )

    expect(limitedResponse.status).toBe(429)
    expect(limitedResponse.headers.get('X-Retry-After')).toBeTruthy()
    await expect(database.select().from(users)).resolves.toHaveLength(3)

    await database.update(rateLimits).set({ lastRequest: Date.now() - 61_000 })

    const afterWindowResponse = await secondFixture.auth.handler(
      createAuthRequest('/sign-up/email', {
        body: {
          name: 'AfterWindowFan',
          email: 'after-window@example.com',
          password: originalPassword,
        },
      }),
    )

    expect(afterWindowResponse.status).toBe(200)
    await expect(database.select().from(users)).resolves.toHaveLength(4)
  })

  it('rejects a compromised password through the padded HIBP range check', async () => {
    const passwordHash = createHash('sha1')
      .update(originalPassword)
      .digest('hex')
      .toUpperCase()
    hibpFetchMock.mockResolvedValue({
      data: `${passwordHash.slice(5)}:42`,
      error: null,
    })
    const fixture = createEmailAuth({
      registrationMode: 'verified-email-required',
    })

    const response = await fixture.auth.handler(
      createAuthRequest('/sign-up/email', {
        body: {
          name: 'MediaFan',
          email: 'fan@example.com',
          password: originalPassword,
        },
      }),
    )

    expect(hibpFetchMock.mock.calls.map((call) => call[0])).toEqual([
      `https://api.pwnedpasswords.com/range/${passwordHash.slice(0, 5)}`,
    ])
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      code: 'PASSWORD_COMPROMISED',
    })
    expect(hibpFetchMock).toHaveBeenCalledWith(
      `https://api.pwnedpasswords.com/range/${passwordHash.slice(0, 5)}`,
      expect.objectContaining({
        headers: expect.objectContaining({ 'Add-Padding': 'true' }),
      }),
    )
    await expect(database.select().from(users)).resolves.toEqual([])
  })

  it('fails closed without turning an HIBP outage into a duplicate-email oracle', async () => {
    const fixture = createEmailAuth({
      registrationMode: 'verified-email-required',
    })
    const initialResponse = await fixture.auth.handler(
      createAuthRequest('/sign-up/email', {
        body: {
          name: 'MediaFan',
          email: 'fan@example.com',
          password: originalPassword,
        },
      }),
    )
    expect(initialResponse.status).toBe(200)

    hibpFetchMock.mockResolvedValue({
      data: null,
      error: { status: 503 },
    })

    const duplicateResponse = await fixture.auth.handler(
      createAuthRequest('/sign-up/email', {
        body: {
          name: 'DifferentName',
          email: 'fan@example.com',
          password: originalPassword,
        },
      }),
    )
    const newEmailResponse = await fixture.auth.handler(
      createAuthRequest('/sign-up/email', {
        body: {
          name: 'AnotherFan',
          email: 'another@example.com',
          password: originalPassword,
        },
      }),
    )

    expect(duplicateResponse.status).toBe(500)
    expect(newEmailResponse.status).toBe(500)
    await expect(database.select().from(users)).resolves.toHaveLength(1)
  })

  it('gives unknown and verified verification-resend requests the same safe result', async () => {
    const fixture = createEmailAuth({
      allowCredentialSignUpForTesting: true,
    })
    await signUpAndVerifyTestUser(fixture)
    fixture.messages.splice(0)

    const unknownResponse = await fixture.auth.handler(
      createAuthRequest('/send-verification-email', {
        body: { email: 'missing@example.com', callbackURL: '/' },
      }),
    )
    const verifiedResponse = await fixture.auth.handler(
      createAuthRequest('/send-verification-email', {
        body: { email: 'fan@example.com', callbackURL: '/' },
      }),
    )

    expect(unknownResponse.status).toBe(200)
    expect(verifiedResponse.status).toBe(200)
    expect(await unknownResponse.json()).toEqual(await verifiedResponse.json())
    await fixture.drainBackgroundTasks()
    expect(fixture.messages).toEqual([])
  })

  it('rejects invalid and expired verification tokens without changing the user', async () => {
    const invalidFixture = createEmailAuth({
      allowCredentialSignUpForTesting: true,
    })
    const invalidSignUpResponse = await invalidFixture.auth.handler(
      createAuthRequest('/sign-up/email', {
        body: {
          name: 'MediaFan',
          email: 'fan@example.com',
          password: originalPassword,
          callbackURL: '/',
        },
      }),
    )
    expect(invalidSignUpResponse.status).toBe(200)
    await invalidFixture.drainBackgroundTasks()

    const invalidUrl = verificationUrlFromMessage(invalidFixture.messages[0]!)
    const validToken = new URLSearchParams(invalidUrl.hash.slice(1)).get(
      'token',
    )
    expect(validToken).toBeTruthy()
    const invalidToken = `${validToken}tampered`
    const invalidResponse = await invalidFixture.auth.handler(
      createAuthRequest(
        `/verify-email?token=${encodeURIComponent(invalidToken)}`,
        {
          method: 'GET',
        },
      ),
    )

    expect(invalidResponse.status).not.toBe(200)
    expect((await database.select().from(users))[0]?.emailVerified).toBe(false)

    await pool.query(`
      truncate table
        rate_limits,
        verifications,
        sessions,
        accounts,
        users
      restart identity cascade
    `)

    const expiredFixture = createEmailAuth({
      allowCredentialSignUpForTesting: true,
      verificationExpiresInSeconds: 1,
    })
    const expiredSignUpResponse = await expiredFixture.auth.handler(
      createAuthRequest('/sign-up/email', {
        body: {
          name: 'ExpiredFan',
          email: 'expired@example.com',
          password: originalPassword,
          callbackURL: '/',
        },
      }),
    )
    expect(expiredSignUpResponse.status).toBe(200)
    await expiredFixture.drainBackgroundTasks()
    await new Promise((resolve) => setTimeout(resolve, 1_100))

    const expiredResponse = await verifyEmailFromMessage(
      expiredFixture.auth,
      expiredFixture.messages[0]!,
    )

    expect(expiredResponse.status).toBe(401)
    expect((await database.select().from(users))[0]?.emailVerified).toBe(false)
  })

  it('rejects foreign verification and recovery callback origins before delivery', async () => {
    const fixture = createEmailAuth({
      allowCredentialSignUpForTesting: true,
    })

    const signUpResponse = await fixture.auth.handler(
      createAuthRequest('/sign-up/email', {
        body: {
          name: 'MediaFan',
          email: 'fan@example.com',
          password: originalPassword,
          callbackURL: 'https://evil.example.com/verified',
        },
      }),
    )
    const resetResponse = await fixture.auth.handler(
      createAuthRequest('/request-password-reset', {
        body: {
          email: 'fan@example.com',
          redirectTo: '//evil.example.com/reset',
        },
      }),
    )

    expect(signUpResponse.status).toBe(403)
    expect(resetResponse.status).toBe(403)
    await fixture.drainBackgroundTasks()
    expect(fixture.messages).toEqual([])
    await expect(database.select().from(users)).resolves.toEqual([])
    await expect(database.select().from(verifications)).resolves.toEqual([])
  })

  it('shares the verification resend rate limit across auth instances', async () => {
    const firstFixture = createEmailAuth({
      allowCredentialSignUpForTesting: true,
    })
    const signUpResponse = await firstFixture.auth.handler(
      createAuthRequest('/sign-up/email', {
        body: {
          name: 'MediaFan',
          email: 'fan@example.com',
          password: originalPassword,
          callbackURL: '/',
        },
      }),
    )
    expect(signUpResponse.status).toBe(200)
    await firstFixture.drainBackgroundTasks()

    const request = () =>
      createAuthRequest('/send-verification-email', {
        body: { email: 'fan@example.com', callbackURL: '/' },
      })

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await firstFixture.auth.handler(request())).status).toBe(200)
    }

    const secondFixture = createEmailAuth()
    const limitedResponse = await secondFixture.auth.handler(request())

    expect(limitedResponse.status).toBe(429)
    expect(limitedResponse.headers.get('X-Retry-After')).toBeTruthy()
  })

  it('shares the recovery rate limit across auth instances', async () => {
    const firstFixture = createEmailAuth()
    const request = () =>
      createAuthRequest('/request-password-reset', {
        body: {
          email: 'missing@example.com',
          redirectTo: '/reset-password-fixture',
        },
      })

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await firstFixture.auth.handler(request())).status).toBe(200)
    }

    const secondFixture = createEmailAuth()
    const limitedResponse = await secondFixture.auth.handler(request())

    expect(limitedResponse.status).toBe(429)
    expect(limitedResponse.headers.get('X-Retry-After')).toBeTruthy()
    await expect(database.select().from(verifications)).resolves.toEqual([])
  })

  it('returns the generic recovery response before a sanitized delivery failure settles', async () => {
    const setupFixture = createEmailAuth({
      allowCredentialSignUpForTesting: true,
    })
    const signUpResponse = await setupFixture.auth.handler(
      createAuthRequest('/sign-up/email', {
        body: {
          name: 'MediaFan',
          email: 'fan@example.com',
          password: originalPassword,
          callbackURL: '/',
        },
      }),
    )
    expect(signUpResponse.status).toBe(200)
    await setupFixture.drainBackgroundTasks()

    let rejectDelivery: (() => void) | undefined
    const failingFixture = createEmailAuth({
      delivery: {
        async send() {
          await new Promise<void>((_resolve, reject) => {
            rejectDelivery = () =>
              reject(new AuthEmailDeliveryError('rate_limit_exceeded'))
          })
        },
      },
    })
    const response = await failingFixture.auth.handler(
      createAuthRequest('/request-password-reset', {
        body: {
          email: 'fan@example.com',
          redirectTo: '/reset-password-fixture',
        },
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: true,
      message:
        'If this email exists in our system, check your email for the reset link',
    })
    const failureExpectation = expect(
      failingFixture.drainBackgroundTasks(),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'AuthEmailDeliveryError',
        message: 'Authentication email delivery failed',
        providerCode: 'rate_limit_exceeded',
      }),
    )
    rejectDelivery?.()
    await failureExpectation
  })

  it('resets a password once, revokes sessions, and removes only reset tokens', async () => {
    const fixture = createEmailAuth({
      allowCredentialSignUpForTesting: true,
    })
    await signUpAndVerifyTestUser(fixture)
    fixture.messages.splice(0)

    const firstSessionResponse = await signIn(fixture.auth, originalPassword)
    const secondSessionResponse = await signIn(fixture.auth, originalPassword)
    expect(firstSessionResponse.status).toBe(200)
    expect(secondSessionResponse.status).toBe(200)
    expect(await database.select().from(sessions)).toHaveLength(2)

    const requestBody = {
      email: 'fan@example.com',
      redirectTo: '/reset-password-fixture',
    }
    const firstRequestResponse = await fixture.auth.handler(
      createAuthRequest('/request-password-reset', { body: requestBody }),
    )
    const secondRequestResponse = await fixture.auth.handler(
      createAuthRequest('/request-password-reset', { body: requestBody }),
    )
    const unknownRequestResponse = await fixture.auth.handler(
      createAuthRequest('/request-password-reset', {
        body: {
          email: 'missing@example.com',
          redirectTo: '/reset-password-fixture',
        },
      }),
    )

    expect(firstRequestResponse.status).toBe(200)
    expect(secondRequestResponse.status).toBe(200)
    expect(unknownRequestResponse.status).toBe(200)
    expect(await firstRequestResponse.clone().json()).toEqual(
      await unknownRequestResponse.json(),
    )
    await fixture.drainBackgroundTasks()

    const resetMessages = fixture.messages.filter(
      (message) => message.category === 'password_reset',
    )
    expect(resetMessages).toHaveLength(2)
    expect(resetMessages[0]?.to).toBe('fan@example.com')
    expect(resetMessages[0]?.text).toContain(authEnvironment.authUrl)
    expect(
      new URL(
        resetMessages[0]!.text.match(/https?:\/\/\S+/u)![0]!,
      ).searchParams.get('callbackURL'),
    ).toBe('/reset-password-fixture')

    const storedUser = await database
      .select()
      .from(users)
      .where(eq(users.email, 'fan@example.com'))
    const userId = storedUser[0]?.id
    expect(userId).toBeDefined()

    await database.insert(verifications).values({
      identifier: 'unrelated-provider:fixture',
      value: userId!,
      expiresAt: new Date(Date.now() + 60_000),
    })

    const resetToken = resetTokenFromMessage(resetMessages[0]!)
    const resetResponse = await fixture.auth.handler(
      createAuthRequest('/reset-password', {
        body: { newPassword: replacementPassword, token: resetToken },
      }),
    )

    expect(resetResponse.status).toBe(200)
    await expect(database.select().from(sessions)).resolves.toEqual([])

    const remainingVerifications = await database.select().from(verifications)
    expect(remainingVerifications).toHaveLength(1)
    expect(remainingVerifications[0]?.identifier).toBe(
      'unrelated-provider:fixture',
    )

    await database.delete(rateLimits)
    expect((await signIn(fixture.auth, originalPassword)).status).toBe(401)
    expect((await signIn(fixture.auth, replacementPassword)).status).toBe(200)

    const reusedResponse = await fixture.auth.handler(
      createAuthRequest('/reset-password', {
        body: { newPassword: originalPassword, token: resetToken },
      }),
    )
    expect(reusedResponse.status).toBe(400)
  })

  it('rejects a compromised replacement password and consumes the single-attempt reset token', async () => {
    const fixture = createEmailAuth({
      registrationMode: 'verified-email-required',
    })
    await signUpAndVerifyTestUser(fixture)
    fixture.messages.splice(0)

    const requestResponse = await fixture.auth.handler(
      createAuthRequest('/request-password-reset', {
        body: {
          email: 'fan@example.com',
          redirectTo: '/reset-password/continue',
        },
      }),
    )
    expect(requestResponse.status).toBe(200)
    await fixture.drainBackgroundTasks()

    const resetMessage = fixture.messages.find(
      (message) => message.category === 'password_reset',
    )
    expect(
      new URL(
        resetMessage!.text.match(/https?:\/\/\S+/u)![0]!,
      ).searchParams.get('callbackURL'),
    ).toBe('/reset-password/continue')
    const passwordHash = createHash('sha1')
      .update(replacementPassword)
      .digest('hex')
      .toUpperCase()
    hibpFetchMock.mockResolvedValue({
      data: `${passwordHash.slice(5)}:42`,
      error: null,
    })

    const compromisedResponse = await fixture.auth.handler(
      createAuthRequest('/reset-password', {
        body: {
          newPassword: replacementPassword,
          token: resetTokenFromMessage(resetMessage!),
        },
      }),
    )

    expect(compromisedResponse.status).toBe(400)
    expect(await compromisedResponse.json()).toMatchObject({
      code: 'PASSWORD_COMPROMISED',
    })
    await expect(database.select().from(verifications)).resolves.toEqual([])

    const reusedResponse = await fixture.auth.handler(
      createAuthRequest('/reset-password', {
        body: {
          newPassword: 'another-safe-password-15',
          token: resetTokenFromMessage(resetMessage!),
        },
      }),
    )
    expect(reusedResponse.status).toBe(400)
    expect(await reusedResponse.json()).toMatchObject({ code: 'INVALID_TOKEN' })
    await database.delete(rateLimits)
    expect((await signIn(fixture.auth, originalPassword)).status).toBe(200)
  })

  it('fails a reset closed and consumes the single-attempt token when HIBP is unavailable', async () => {
    const fixture = createEmailAuth({
      registrationMode: 'verified-email-required',
    })
    await signUpAndVerifyTestUser(fixture)
    fixture.messages.splice(0)

    const requestResponse = await fixture.auth.handler(
      createAuthRequest('/request-password-reset', {
        body: {
          email: 'fan@example.com',
          redirectTo: '/reset-password/continue',
        },
      }),
    )
    expect(requestResponse.status).toBe(200)
    await fixture.drainBackgroundTasks()

    const resetMessage = fixture.messages.find(
      (message) => message.category === 'password_reset',
    )
    hibpFetchMock.mockResolvedValue({
      data: null,
      error: { status: 503 },
    })

    const unavailableResponse = await fixture.auth.handler(
      createAuthRequest('/reset-password', {
        body: {
          newPassword: replacementPassword,
          token: resetTokenFromMessage(resetMessage!),
        },
      }),
    )

    expect(unavailableResponse.status).toBe(500)
    await expect(database.select().from(verifications)).resolves.toEqual([])
    await database.delete(rateLimits)
    expect((await signIn(fixture.auth, originalPassword)).status).toBe(200)
  })

  it('rejects an expired reset token without changing the password', async () => {
    const fixture = createEmailAuth({
      allowCredentialSignUpForTesting: true,
    })
    await signUpAndVerifyTestUser(fixture)
    fixture.messages.splice(0)

    const requestResponse = await fixture.auth.handler(
      createAuthRequest('/request-password-reset', {
        body: {
          email: 'fan@example.com',
          redirectTo: '/reset-password-fixture',
        },
      }),
    )
    expect(requestResponse.status).toBe(200)
    await fixture.drainBackgroundTasks()

    await database
      .update(verifications)
      .set({ expiresAt: new Date(Date.now() - 1_000) })

    const resetMessage = fixture.messages.find(
      (message) => message.category === 'password_reset',
    )
    const expiredResponse = await fixture.auth.handler(
      createAuthRequest('/reset-password', {
        body: {
          newPassword: replacementPassword,
          token: resetTokenFromMessage(resetMessage!),
        },
      }),
    )

    expect(expiredResponse.status).toBe(400)
    await database.delete(rateLimits)
    expect((await signIn(fixture.auth, originalPassword)).status).toBe(200)
    expect((await signIn(fixture.auth, replacementPassword)).status).toBe(401)
  })

  it('registers delayed manual resend delivery without delaying the response', async () => {
    let releaseDelivery: (() => void) | undefined
    const deliveryFinished = new Promise<void>((resolve) => {
      releaseDelivery = resolve
    })
    let deliveryCount = 0
    const fixture = createEmailAuth({
      allowCredentialSignUpForTesting: true,
      delivery: {
        async send() {
          deliveryCount += 1

          if (deliveryCount === 1) {
            return
          }

          await deliveryFinished
        },
      },
    })

    const signUpResponse = await fixture.auth.handler(
      createAuthRequest('/sign-up/email', {
        body: {
          name: 'MediaFan',
          email: 'fan@example.com',
          password: originalPassword,
          callbackURL: '/',
        },
      }),
    )
    expect(signUpResponse.status).toBe(200)
    await fixture.drainBackgroundTasks()

    const handlerPromise = fixture.auth.handler(
      createAuthRequest('/send-verification-email', {
        body: { email: 'fan@example.com', callbackURL: '/' },
      }),
    )
    const response = await Promise.race([
      handlerPromise,
      new Promise<'timed-out'>((resolve) => {
        setTimeout(() => resolve('timed-out'), 2_000)
      }),
    ])

    releaseDelivery?.()

    if (response === 'timed-out') {
      await handlerPromise
    }

    expect(response).not.toBe('timed-out')
    expect(response).toBeInstanceOf(Response)
    expect((response as Response).status).toBe(200)
    await fixture.drainBackgroundTasks()
  })
})

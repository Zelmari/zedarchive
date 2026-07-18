import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createAuthOptions,
  guardAgainstUsernameUpdate,
  PENDING_USERNAME_IDENTITY_KEY_SENTINEL,
  prepareUserCreateData,
  stripCallerUsernameIdentityKeyFromCredentialSignUp,
} from '@/server/auth/create-auth'

const authEnvironment = {
  authSecret: 'ci-disposable-better-auth-secret-32chars-min',
  authUrl: 'http://localhost:3000',
} as const

const database = {} as Parameters<typeof createAuthOptions>[0]

function createOptions(
  testOverrides: Parameters<typeof createAuthOptions>[2] = {},
) {
  return createAuthOptions(database, authEnvironment, testOverrides)
}

describe('createAuthOptions', () => {
  it('keeps production signup disabled by default', () => {
    expect(createOptions().emailAndPassword?.disableSignUp).toBe(true)
  })

  it('allows a narrowly named test-only signup override', () => {
    expect(
      createOptions({ allowCredentialSignUpForTesting: true }).emailAndPassword
        ?.disableSignUp,
    ).toBe(false)
  })

  it('enables email and password authentication only', () => {
    const options = createOptions()

    expect(options.emailAndPassword?.enabled).toBe(true)
    expect(options.socialProviders).toBeUndefined()
    expect(options.plugins).toBeUndefined()
  })

  it('applies the approved password, session, origin, and rate-limit settings', () => {
    const options = createOptions()

    expect(options.emailAndPassword?.minPasswordLength).toBe(15)
    expect(options.emailAndPassword?.maxPasswordLength).toBe(128)
    expect(options.emailAndPassword?.password).toBeUndefined()
    expect(options.session?.expiresIn).toBe(60 * 60 * 24 * 7)
    expect(options.session?.updateAge).toBe(60 * 60 * 24)
    expect(options.session?.cookieCache?.enabled).toBe(false)
    expect(options.baseURL).toBe(authEnvironment.authUrl)
    expect(options.trustedOrigins).toEqual([authEnvironment.authUrl])
    expect(options.rateLimit).toEqual({
      enabled: true,
      storage: 'database',
    })
    expect(options.advanced?.disableOriginCheck).toBe(false)
    expect(options.advanced?.database?.generateId).toBe('uuid')
  })

  it('maps the logical username field and registers the identity key', () => {
    const options = createOptions()

    expect(options.user?.fields).toEqual({ name: 'username' })
    expect(options.user?.modelName).toBeUndefined()
    expect(options.user?.additionalFields).toEqual({
      usernameIdentityKey: {
        type: 'string',
        required: true,
        input: false,
        returned: false,
        defaultValue: PENDING_USERNAME_IDENTITY_KEY_SENTINEL,
      },
    })
  })

  it('strips caller-supplied identity keys before credential signup parsing', () => {
    expect(typeof createOptions().hooks?.before).toBe('function')
  })

  it('configures the drizzle adapter with plural schema keys only', () => {
    const options = createOptions()

    expect(typeof options.database).toBe('function')
    expect(options.rateLimit?.modelName).toBeUndefined()
  })
})

describe('prepareUserCreateData', () => {
  it('validates the username, preserves capitalization, and derives the identity key', () => {
    expect(
      prepareUserCreateData({
        name: 'MediaFan',
        email: 'fan@example.com',
        usernameIdentityKey: 'caller-supplied',
      }),
    ).toEqual({
      data: {
        name: 'MediaFan',
        email: 'fan@example.com',
        usernameIdentityKey: 'mediafan',
      },
    })
  })

  it('rejects invalid usernames', () => {
    expect(() =>
      prepareUserCreateData({
        name: 'admin',
        email: 'fan@example.com',
      }),
    ).toThrow()
  })
})

describe('stripCallerUsernameIdentityKeyFromCredentialSignUp', () => {
  it('removes caller-supplied usernameIdentityKey from credential signup bodies only', () => {
    const body = {
      name: 'MediaFan',
      email: 'fan@example.com',
      password: 'valid-password-15',
      usernameIdentityKey: 'attacker-key',
    }

    stripCallerUsernameIdentityKeyFromCredentialSignUp({
      path: '/sign-up/email',
      body,
    })

    expect(body).not.toHaveProperty('usernameIdentityKey')
  })

  it('leaves usernameIdentityKey on non-credential-signup paths untouched', () => {
    const body = { usernameIdentityKey: 'attacker-key' }

    stripCallerUsernameIdentityKeyFromCredentialSignUp({
      path: '/sign-in/email',
      body,
    })

    expect(body.usernameIdentityKey).toBe('attacker-key')
  })
})

describe('guardAgainstUsernameUpdate', () => {
  it('rejects provider-level logical name updates', () => {
    expect(() => guardAgainstUsernameUpdate({ name: 'NewUsername' })).toThrow(
      'Username cannot be changed through this endpoint',
    )
  })

  it('allows updates that do not touch the logical name', () => {
    expect(() => guardAgainstUsernameUpdate({ image: null })).not.toThrow()
  })
})

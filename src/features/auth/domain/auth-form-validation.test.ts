import { describe, expect, it } from 'vitest'
import {
  authEmailSchema,
  authPasswordSchema,
  authUsernameSchema,
  forgotPasswordFormSchema,
  passwordMaximumLength,
  passwordMinimumLength,
  registrationFormSchema,
  resetPasswordFormSchema,
  signInFormSchema,
} from '@/features/auth/domain/auth-form-validation'

const validPassword = 'valid-password-15'
const validEmail = 'fan@example.com'
const validUsername = 'MediaFan'

describe('auth password boundaries', () => {
  it('uses the confirmed password length boundaries', () => {
    expect(passwordMinimumLength).toBe(15)
    expect(passwordMaximumLength).toBe(128)
  })
})

describe('authEmailSchema', () => {
  it('trims leading and trailing whitespace', () => {
    expect(authEmailSchema.parse(`  ${validEmail}  `)).toBe(validEmail)
  })

  it.each([
    ['empty string', ''],
    ['whitespace only', '   '],
    ['internal whitespace', 'fan @example.com'],
    ['missing at sign', 'fan.example.com'],
    ['missing domain', 'fan@'],
    ['number', 123],
  ])('rejects %s', (_, input) => {
    expect(authEmailSchema.safeParse(input).success).toBe(false)
  })
})

describe('authUsernameSchema', () => {
  it('trims outer whitespace before applying username rules', () => {
    expect(authUsernameSchema.parse(`  ${validUsername}  `)).toBe(validUsername)
  })

  it('rejects a username that is only whitespace after trimming', () => {
    expect(authUsernameSchema.safeParse('   ').success).toBe(false)
  })

  it('rejects a restricted username after trimming', () => {
    expect(authUsernameSchema.safeParse('  admin  ').success).toBe(false)
  })
})

describe('authPasswordSchema', () => {
  it.each([
    validPassword,
    ' fifteen-chars ',
    'a'.repeat(passwordMaximumLength),
    'pass phrase with spaces',
  ])('accepts the valid password boundary %j without mutation', (password) => {
    expect(authPasswordSchema.parse(password)).toBe(password)
  })

  it('preserves leading and trailing whitespace', () => {
    const password = ` ${validPassword} `

    expect(authPasswordSchema.parse(password)).toBe(password)
  })

  it.each([
    ['empty string', ''],
    ['too short', 'short-password'],
    ['too long', 'a'.repeat(passwordMaximumLength + 1)],
  ])('rejects %s', (_, password) => {
    expect(authPasswordSchema.safeParse(password).success).toBe(false)
  })
})

describe('registrationFormSchema', () => {
  it('returns trimmed username and email with an untouched password', () => {
    const password = ` ${validPassword} `

    expect(
      registrationFormSchema.parse({
        username: `  ${validUsername}  `,
        email: `  ${validEmail}  `,
        password,
      }),
    ).toEqual({
      username: validUsername,
      email: validEmail,
      password,
    })
  })

  it('collects multiple field failures', () => {
    const result = registrationFormSchema.safeParse({
      username: 'ab',
      email: 'not-an-email',
      password: 'short',
    })

    expect(result.success).toBe(false)

    if (result.success) {
      throw new Error('Expected registration validation to fail')
    }

    expect(result.error.issues.length).toBeGreaterThan(1)
  })
})

describe('signInFormSchema', () => {
  it('trims email and preserves password bytes', () => {
    const password = ` ${validPassword} `

    expect(
      signInFormSchema.parse({
        email: `  ${validEmail}  `,
        password,
      }),
    ).toEqual({
      email: validEmail,
      password,
    })
  })
})

describe('forgotPasswordFormSchema', () => {
  it('trims the email field', () => {
    expect(
      forgotPasswordFormSchema.parse({
        email: `  ${validEmail}  `,
      }),
    ).toEqual({
      email: validEmail,
    })
  })
})

describe('resetPasswordFormSchema', () => {
  it('preserves the password without trimming', () => {
    const password = ` ${validPassword} `

    expect(resetPasswordFormSchema.parse({ password })).toEqual({ password })
  })
})

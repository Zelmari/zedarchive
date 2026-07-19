import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { readEmailEnvironment } from '@/config/email-environment'

const validEnvironment = {
  RESEND_API_KEY: 're_ci_disposable_key',
  AUTH_EMAIL_FROM: 'accounts@auth.example.com',
  AUTH_EMAIL_REPLY_TO: 'reply@example.com',
} as const

describe('readEmailEnvironment', () => {
  it('returns application-facing names for valid configuration', () => {
    expect(readEmailEnvironment(validEnvironment)).toEqual({
      resendApiKey: validEnvironment.RESEND_API_KEY,
      fromAddress: validEnvironment.AUTH_EMAIL_FROM,
      replyToAddress: validEnvironment.AUTH_EMAIL_REPLY_TO,
    })
  })

  it('accepts one monitored mailbox for both sender and replies', () => {
    expect(
      readEmailEnvironment({
        ...validEnvironment,
        AUTH_EMAIL_REPLY_TO: validEnvironment.AUTH_EMAIL_FROM,
      }),
    ).toEqual({
      resendApiKey: validEnvironment.RESEND_API_KEY,
      fromAddress: validEnvironment.AUTH_EMAIL_FROM,
      replyToAddress: validEnvironment.AUTH_EMAIL_FROM,
    })
  })

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['wrong provider', 'key_ci_disposable'],
    ['prefix only', 're_'],
    ['leading whitespace', ` ${validEnvironment.RESEND_API_KEY}`],
    ['trailing whitespace', `${validEnvironment.RESEND_API_KEY} `],
    ['number', 123],
    ['null', null],
  ])('rejects a %s API key without disclosing its value', (label, value) => {
    const input = { ...validEnvironment, RESEND_API_KEY: value }

    try {
      readEmailEnvironment(input)
      throw new Error('Expected email environment parsing to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)

      if (typeof value === 'string' && value.length > 3) {
        expect((error as Error).message).not.toContain(value)
      }
    }
  })

  it.each(['AUTH_EMAIL_FROM', 'AUTH_EMAIL_REPLY_TO'] as const)(
    'rejects malformed %s values',
    (variableName) => {
      const invalidValues: unknown[] = [
        undefined,
        '',
        ' accounts@example.com',
        'accounts@example.com ',
        'zedarchive <accounts@example.com>',
        'one@example.com,two@example.com',
        'accounts@example.com\nBcc: attacker@example.com',
        'not-an-email',
        123,
        null,
      ]

      for (const value of invalidValues) {
        expect(() =>
          readEmailEnvironment({
            ...validEnvironment,
            [variableName]: value,
          }),
        ).toThrow()
      }
    },
  )

  it('reports only the first field error in deterministic order', () => {
    expect(() =>
      readEmailEnvironment({
        RESEND_API_KEY: 'wrong-secret-value',
        AUTH_EMAIL_FROM: 'not-an-email',
        AUTH_EMAIL_REPLY_TO: 'also-not-an-email',
      }),
    ).toThrow('RESEND_API_KEY must use the Resend re_ key format')
  })

  it('ignores unrelated environment values', () => {
    expect(
      readEmailEnvironment({
        ...validEnvironment,
        NEXT_PUBLIC_RESEND_API_KEY: 'public-value-must-not-be-read',
        DATABASE_URL: 'postgresql://example.invalid/zedarchive_dev',
      }),
    ).toEqual({
      resendApiKey: validEnvironment.RESEND_API_KEY,
      fromAddress: validEnvironment.AUTH_EMAIL_FROM,
      replyToAddress: validEnvironment.AUTH_EMAIL_REPLY_TO,
    })
  })
})

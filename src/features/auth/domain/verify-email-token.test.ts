import { describe, expect, it } from 'vitest'
import {
  parseVerifyEmailToken,
  verifyEmailTokenMaximumLength,
} from '@/features/auth/domain/verify-email-token'

const validToken = 'verification-token-123'

describe('verifyEmailTokenMaximumLength', () => {
  it('uses a bounded maximum suitable for bearer tokens in URLs', () => {
    expect(verifyEmailTokenMaximumLength).toBe(2048)
  })
})

describe('parseVerifyEmailToken', () => {
  it('accepts exactly one bounded non-empty token', () => {
    expect(parseVerifyEmailToken({ token: validToken })).toEqual({
      kind: 'valid',
      token: validToken,
    })
  })

  it('accepts a token at the maximum length boundary', () => {
    const token = 'a'.repeat(verifyEmailTokenMaximumLength)

    expect(parseVerifyEmailToken({ token })).toEqual({
      kind: 'valid',
      token,
    })
  })

  it.each([
    ['missing token', {}],
    ['empty token', { token: '' }],
    ['whitespace-only token', { token: '   ' }],
    ['repeated token values', { token: ['token-a', 'token-b'] }],
    ['empty token array', { token: [] }],
    [
      'oversized token',
      { token: 'a'.repeat(verifyEmailTokenMaximumLength + 1) },
    ],
  ])('rejects %s', (_, searchParams) => {
    expect(parseVerifyEmailToken(searchParams)).toEqual({ kind: 'invalid' })
  })

  it('preserves the token bytes without trimming', () => {
    const token = ` ${validToken} `

    expect(parseVerifyEmailToken({ token })).toEqual({
      kind: 'valid',
      token,
    })
  })

  it('accepts a single token provided through a one-element array', () => {
    expect(parseVerifyEmailToken({ token: [validToken] })).toEqual({
      kind: 'valid',
      token: validToken,
    })
  })

  it('ignores unrelated search params', () => {
    expect(
      parseVerifyEmailToken({
        token: validToken,
        callbackURL: '/sign-in',
      }),
    ).toEqual({
      kind: 'valid',
      token: validToken,
    })
  })
})

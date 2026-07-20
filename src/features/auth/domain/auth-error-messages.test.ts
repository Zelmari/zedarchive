import { describe, expect, it } from 'vitest'
import {
  AUTH_GENERIC_FAILURE_MESSAGE,
  AUTH_INVALID_CREDENTIALS_MESSAGE,
  AUTH_INVALID_RESET_LINK_MESSAGE,
  AUTH_INVALID_VERIFICATION_LINK_MESSAGE,
  AUTH_PASSWORD_COMPROMISED_MESSAGE,
  AUTH_RATE_LIMITED_MESSAGE,
  AUTH_TEMPORARY_FAILURE_MESSAGE,
  AUTH_VALIDATION_ERROR_MESSAGE,
  AUTH_VERIFICATION_REQUIRED_MESSAGE,
  translateAuthError,
} from '@/features/auth/domain/auth-error-messages'

describe('translateAuthError', () => {
  it.each([
    ['INVALID_EMAIL', 'validation', AUTH_VALIDATION_ERROR_MESSAGE],
    ['PASSWORD_TOO_SHORT', 'validation', AUTH_VALIDATION_ERROR_MESSAGE],
    ['PASSWORD_TOO_LONG', 'validation', AUTH_VALIDATION_ERROR_MESSAGE],
    [
      'INVALID_EMAIL_OR_PASSWORD',
      'invalid_credentials',
      AUTH_INVALID_CREDENTIALS_MESSAGE,
    ],
    [
      'EMAIL_NOT_VERIFIED',
      'verification_required',
      AUTH_VERIFICATION_REQUIRED_MESSAGE,
    ],
    [
      'PASSWORD_COMPROMISED',
      'password_compromised',
      AUTH_PASSWORD_COMPROMISED_MESSAGE,
    ],
    ['FAILED_TO_CREATE_USER', 'generic_failure', AUTH_GENERIC_FAILURE_MESSAGE],
  ] as const)('maps code %s to category %s', (code, category, message) => {
    expect(translateAuthError({ code })).toEqual({
      category,
      message,
    })
  })

  it('maps invalid and expired tokens using their explicit flow', () => {
    expect(
      translateAuthError({ code: 'INVALID_TOKEN', flow: 'verification' }),
    ).toEqual({
      category: 'invalid_verification_link',
      message: AUTH_INVALID_VERIFICATION_LINK_MESSAGE,
    })
    expect(
      translateAuthError({ code: 'TOKEN_EXPIRED', flow: 'password_reset' }),
    ).toEqual({
      category: 'invalid_reset_link',
      message: AUTH_INVALID_RESET_LINK_MESSAGE,
    })
  })

  it('maps HTTP 429 to the rate-limited category', () => {
    expect(translateAuthError({ httpStatus: 429 })).toEqual({
      category: 'rate_limited',
      message: AUTH_RATE_LIMITED_MESSAGE,
    })
  })

  it('maps HTTP 500 to the temporary-failure category', () => {
    expect(translateAuthError({ httpStatus: 500 })).toEqual({
      category: 'temporary_failure',
      message: AUTH_TEMPORARY_FAILURE_MESSAGE,
    })
  })

  it('maps HTTP 401 without a code only for sign-in', () => {
    expect(translateAuthError({ httpStatus: 401, flow: 'sign_in' })).toEqual({
      category: 'invalid_credentials',
      message: AUTH_INVALID_CREDENTIALS_MESSAGE,
    })
    expect(translateAuthError({ httpStatus: 401 })).toEqual({
      category: 'generic_failure',
      message: AUTH_GENERIC_FAILURE_MESSAGE,
    })
  })

  it('redacts unknown codes and raw provider messages', () => {
    expect(
      translateAuthError({
        code: 'UNIQUE_VIOLATION users_email_lower_uidx',
        httpStatus: 500,
      }),
    ).toEqual({
      category: 'temporary_failure',
      message: AUTH_TEMPORARY_FAILURE_MESSAGE,
    })
  })

  it('redacts an unknown code without leaking status-specific detail', () => {
    expect(
      translateAuthError({
        code: 'SQLITE_CONSTRAINT',
        httpStatus: 400,
      }),
    ).toEqual({
      category: 'generic_failure',
      message: AUTH_GENERIC_FAILURE_MESSAGE,
    })
  })

  it('returns a generic retry message when no allowlisted input is present', () => {
    expect(translateAuthError({})).toEqual({
      category: 'generic_failure',
      message: AUTH_GENERIC_FAILURE_MESSAGE,
    })
  })
})

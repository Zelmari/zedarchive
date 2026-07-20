export type AuthErrorInput = Readonly<{
  httpStatus?: number
  code?: string
  flow?: 'sign_in' | 'verification' | 'password_reset'
}>

export type AuthErrorCategory =
  | 'validation'
  | 'invalid_credentials'
  | 'verification_required'
  | 'password_compromised'
  | 'invalid_verification_link'
  | 'invalid_reset_link'
  | 'rate_limited'
  | 'temporary_failure'
  | 'generic_failure'

export type AuthErrorTranslation = Readonly<{
  category: AuthErrorCategory
  message: string
}>

export const AUTH_VALIDATION_ERROR_MESSAGE =
  'Check the highlighted fields and try again.'

export const AUTH_INVALID_CREDENTIALS_MESSAGE =
  'Email or password is incorrect.'

export const AUTH_VERIFICATION_REQUIRED_MESSAGE =
  'Verify your email before signing in.'

export const AUTH_PASSWORD_COMPROMISED_MESSAGE =
  'Choose a password that has not appeared in known data breaches.'

export const AUTH_INVALID_VERIFICATION_LINK_MESSAGE =
  'This verification link is invalid or has expired.'

export const AUTH_INVALID_RESET_LINK_MESSAGE =
  'This reset link is invalid or has expired.'

export const AUTH_RATE_LIMITED_MESSAGE =
  'Too many attempts. Wait a moment and try again.'

export const AUTH_TEMPORARY_FAILURE_MESSAGE =
  'Something went wrong. Try again in a moment.'

export const AUTH_GENERIC_FAILURE_MESSAGE = 'Something went wrong. Try again.'

const VALIDATION_ERROR_CODES = new Set([
  'BODY_MUST_BE_AN_OBJECT',
  'FIELD_NOT_ALLOWED',
  'INVALID_EMAIL',
  'INVALID_PASSWORD',
  'MISSING_FIELD',
  'PASSWORD_TOO_LONG',
  'PASSWORD_TOO_SHORT',
  'VALIDATION_ERROR',
])

const REGISTRATION_FAILURE_CODES = new Set([
  'FAILED_TO_CREATE_USER',
  'FAILED_TO_CREATE_SESSION',
  'USER_ALREADY_EXISTS',
  'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
])

function translateByCode(
  code: string,
  flow?: AuthErrorInput['flow'],
): AuthErrorTranslation | null {
  if (VALIDATION_ERROR_CODES.has(code)) {
    return {
      category: 'validation',
      message: AUTH_VALIDATION_ERROR_MESSAGE,
    }
  }

  if (code === 'INVALID_EMAIL_OR_PASSWORD') {
    return {
      category: 'invalid_credentials',
      message: AUTH_INVALID_CREDENTIALS_MESSAGE,
    }
  }

  if (code === 'EMAIL_NOT_VERIFIED') {
    return {
      category: 'verification_required',
      message: AUTH_VERIFICATION_REQUIRED_MESSAGE,
    }
  }

  if (code === 'PASSWORD_COMPROMISED') {
    return {
      category: 'password_compromised',
      message: AUTH_PASSWORD_COMPROMISED_MESSAGE,
    }
  }

  if (code === 'TOKEN_EXPIRED' || code === 'INVALID_TOKEN') {
    if (flow === 'verification') {
      return {
        category: 'invalid_verification_link',
        message: AUTH_INVALID_VERIFICATION_LINK_MESSAGE,
      }
    }

    if (flow === 'password_reset') {
      return {
        category: 'invalid_reset_link',
        message: AUTH_INVALID_RESET_LINK_MESSAGE,
      }
    }

    return null
  }

  if (REGISTRATION_FAILURE_CODES.has(code)) {
    return {
      category: 'generic_failure',
      message: AUTH_GENERIC_FAILURE_MESSAGE,
    }
  }

  return null
}

function translateByStatus(
  httpStatus: number,
  flow?: AuthErrorInput['flow'],
): AuthErrorTranslation | null {
  if (httpStatus === 429) {
    return {
      category: 'rate_limited',
      message: AUTH_RATE_LIMITED_MESSAGE,
    }
  }

  if (httpStatus === 401 && flow === 'sign_in') {
    return {
      category: 'invalid_credentials',
      message: AUTH_INVALID_CREDENTIALS_MESSAGE,
    }
  }

  if (httpStatus === 403 && flow === 'sign_in') {
    return {
      category: 'verification_required',
      message: AUTH_VERIFICATION_REQUIRED_MESSAGE,
    }
  }

  if (httpStatus >= 500) {
    return {
      category: 'temporary_failure',
      message: AUTH_TEMPORARY_FAILURE_MESSAGE,
    }
  }

  return null
}

export function translateAuthError(
  input: AuthErrorInput,
): AuthErrorTranslation {
  if (typeof input.code === 'string') {
    const translated = translateByCode(input.code, input.flow)

    if (translated !== null) {
      return translated
    }
  }

  if (typeof input.httpStatus === 'number') {
    const translated = translateByStatus(input.httpStatus, input.flow)

    if (translated !== null) {
      return translated
    }
  }

  return {
    category: 'generic_failure',
    message: AUTH_GENERIC_FAILURE_MESSAGE,
  }
}

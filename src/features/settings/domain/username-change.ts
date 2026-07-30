import { z } from '@/config/zod'

export type UsernameChangeActionState =
  | { kind: 'idle' }
  | { kind: 'invalid_username' }
  | { kind: 'no_change' }
  | { kind: 'already_changed' }
  | { kind: 'target_unavailable' }
  | { kind: 'invalid_password' }
  | { kind: 'rate_limited' }
  | { kind: 'sign_in_required' }
  | { kind: 'session_unavailable' }
  | { kind: 'retry' }
  | { kind: 'code_sent' }
  | { kind: 'code_resent' }
  | { kind: 'resend_cooldown' }
  | { kind: 'send_limit' }
  | { kind: 'cancelled' }
  | { kind: 'confirmation_required' }
  | { kind: 'invalid_code' }
  | { kind: 'code_expired' }
  | { kind: 'reauthentication_required' }
  | { kind: 'attempts_exhausted' }
  | { kind: 'restart_required' }
  | { kind: 'changed'; username: string }

export const initialUsernameChangeActionState: UsernameChangeActionState = {
  kind: 'idle',
}

export type UsernameChangePageState =
  | { kind: 'available'; username: string }
  | {
      kind: 'pending'
      username: string
      proposedUsername: string
      resend:
        | { kind: 'available' }
        | { kind: 'cooldown'; retryAfterMilliseconds: number }
        | {
            kind: 'unavailable'
            reason: 'send_limit' | 'reauthentication_window'
          }
        | {
            kind: 'restart_required'
            reason: 'reauthentication_expired' | 'attempts_exhausted'
          }
    }
  | { kind: 'already_changed'; username: string }
  | { kind: 'unavailable' }

type ParsedStartUsernameChange =
  | { kind: 'valid'; username: string; password: string }
  | { kind: 'invalid_username' }

type ParsedCompleteUsernameChange =
  | { kind: 'valid'; code: string }
  | { kind: 'confirmation_required' }
  | { kind: 'invalid_code' }

const usernameChangeCodeSchema = z.string().regex(/^\d{8}$/u)

function hasExactFields(formData: FormData, expectedFields: string[]): boolean {
  const actualFields = Array.from(formData.keys()).filter(
    (field) => !field.startsWith('$ACTION_'),
  )

  return (
    actualFields.length === expectedFields.length &&
    actualFields.every((field, index) => field === expectedFields[index])
  )
}

function getExactlyOneStringValue(
  formData: FormData,
  fieldName: string,
): string | null {
  const values = formData.getAll(fieldName)

  return values.length === 1 && typeof values[0] === 'string' ? values[0] : null
}

export function parseStartUsernameChangeFormData(
  formData: FormData,
): ParsedStartUsernameChange {
  if (!hasExactFields(formData, ['username', 'password'])) {
    return { kind: 'invalid_username' }
  }

  const username = getExactlyOneStringValue(formData, 'username')
  const password = getExactlyOneStringValue(formData, 'password')

  if (username === null || password === null || password.length === 0) {
    return { kind: 'invalid_username' }
  }

  return { kind: 'valid', username, password }
}

export function parseResendUsernameChangeFormData(formData: FormData): boolean {
  return hasExactFields(formData, [])
}

export function parseCancelUsernameChangeFormData(formData: FormData): boolean {
  return hasExactFields(formData, [])
}

export function parseCompleteUsernameChangeFormData(
  formData: FormData,
): ParsedCompleteUsernameChange {
  const actualFields = Array.from(formData.keys()).filter(
    (field) => !field.startsWith('$ACTION_'),
  )
  if (
    actualFields.some(
      (field) => field !== 'code' && field !== 'confirmation',
    ) ||
    actualFields.filter((field) => field === 'code').length !== 1 ||
    actualFields.filter((field) => field === 'confirmation').length > 1
  ) {
    return { kind: 'invalid_code' }
  }

  if (
    getExactlyOneStringValue(formData, 'confirmation') !==
    'one-time-username-change'
  ) {
    return { kind: 'confirmation_required' }
  }

  const code = getExactlyOneStringValue(formData, 'code')
  const parsedCode = usernameChangeCodeSchema.safeParse(code)

  return parsedCode.success
    ? { kind: 'valid', code: parsedCode.data }
    : { kind: 'invalid_code' }
}

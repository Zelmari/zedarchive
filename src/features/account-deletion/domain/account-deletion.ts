import { z } from '@/config/zod'

export const accountDeletionConfirmationValue =
  'request-account-deletion' as const

export type AccountDeletionActionState =
  | { kind: 'idle' }
  | { kind: 'invalid_password' }
  | { kind: 'rate_limited' }
  | { kind: 'sign_in_required' }
  | { kind: 'session_unavailable' }
  | { kind: 'retry' }
  | { kind: 'code_sent' }
  | { kind: 'code_resent' }
  | { kind: 'resend_cooldown' }
  | { kind: 'send_limit' }
  | { kind: 'setup_cancelled' }
  | { kind: 'confirmation_required' }
  | { kind: 'invalid_code' }
  | { kind: 'code_expired' }
  | { kind: 'reauthentication_required' }
  | { kind: 'attempts_exhausted' }
  | { kind: 'restart_required' }
  | { kind: 'deletion_requested' }
  | { kind: 'deletion_cancelled' }
  | { kind: 'deletion_due' }

export const initialAccountDeletionActionState: AccountDeletionActionState = {
  kind: 'idle',
}

export type AccountDeletionSetupState =
  | { kind: 'start' }
  | {
      kind: 'pending'
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
  | { kind: 'unavailable' }

type ParsedStartAccountDeletion =
  { kind: 'valid'; password: string } | { kind: 'invalid_password' }

type ParsedCompleteAccountDeletion =
  | { kind: 'valid'; code: string }
  | { kind: 'confirmation_required' }
  | { kind: 'invalid_code' }

const deletionCodeSchema = z.string().regex(/^\d{8}$/u)

function formFields(formData: FormData): string[] {
  return Array.from(formData.keys()).filter(
    (field) => !field.startsWith('$ACTION_'),
  )
}

function hasExactFields(formData: FormData, expected: string[]): boolean {
  const actual = formFields(formData)

  return (
    actual.length === expected.length &&
    actual.every((field, index) => field === expected[index])
  )
}

function getExactlyOneString(
  formData: FormData,
  fieldName: string,
): string | null {
  const values = formData.getAll(fieldName)

  return values.length === 1 && typeof values[0] === 'string' ? values[0] : null
}

export function parseStartAccountDeletionFormData(
  formData: FormData,
): ParsedStartAccountDeletion {
  if (!hasExactFields(formData, ['password'])) {
    return { kind: 'invalid_password' }
  }

  const password = getExactlyOneString(formData, 'password')

  return password !== null && password.length > 0
    ? { kind: 'valid', password }
    : { kind: 'invalid_password' }
}

export function parseCompleteAccountDeletionFormData(
  formData: FormData,
): ParsedCompleteAccountDeletion {
  const fields = formFields(formData)
  if (
    fields.some((field) => field !== 'code' && field !== 'confirmation') ||
    fields.filter((field) => field === 'code').length !== 1 ||
    fields.filter((field) => field === 'confirmation').length > 1
  ) {
    return { kind: 'invalid_code' }
  }

  if (
    getExactlyOneString(formData, 'confirmation') !==
    accountDeletionConfirmationValue
  ) {
    return { kind: 'confirmation_required' }
  }

  const code = deletionCodeSchema.safeParse(
    getExactlyOneString(formData, 'code'),
  )

  return code.success
    ? { kind: 'valid', code: code.data }
    : { kind: 'invalid_code' }
}

export function parseEmptyAccountDeletionFormData(formData: FormData): boolean {
  return hasExactFields(formData, [])
}

export const accountDeletionHydratedValue = 'hydrated'

export type ParsedCancelAccountDeletion =
  { kind: 'valid'; hydrated: boolean } | { kind: 'invalid' }

/**
 * Only a hydrated submission can present the focused confirmation, so the
 * marker decides whether cancellation answers with state or with a plain
 * redirect to the restored account.
 */
export function parseCancelAccountDeletionFormData(
  formData: FormData,
): ParsedCancelAccountDeletion {
  if (hasExactFields(formData, [])) return { kind: 'valid', hydrated: false }

  if (
    hasExactFields(formData, ['hydrated']) &&
    getExactlyOneString(formData, 'hydrated') === accountDeletionHydratedValue
  ) {
    return { kind: 'valid', hydrated: true }
  }

  return { kind: 'invalid' }
}

export function formatAccountDeletionDeadlineUtc(deadline: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(deadline)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''

  return `${value('day')} ${value('month')} ${value('year')} at ${value('hour')}:${value('minute')} UTC`
}

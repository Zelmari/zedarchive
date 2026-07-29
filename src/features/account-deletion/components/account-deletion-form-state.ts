import type { AccountDeletionActionState } from '@/features/account-deletion/domain/account-deletion'
import type { FeedbackPresentationTone } from '@/features/feedback/feedback-presentation'

export type AccountDeletionFeedback = {
  field?: 'password' | 'code' | 'confirmation'
  tone: FeedbackPresentationTone
  message: string
}

export function getAccountDeletionFeedback(
  state: AccountDeletionActionState,
): AccountDeletionFeedback | null {
  switch (state.kind) {
    case 'idle':
    case 'deletion_requested':
      return null
    case 'invalid_password':
      return {
        field: 'password',
        tone: 'error',
        message: 'Your current password is incorrect.',
      }
    case 'rate_limited':
      return { tone: 'error', message: 'Too many attempts. Try again later.' }
    case 'sign_in_required':
      return {
        tone: 'error',
        message: 'Your session has expired. Sign in and try again.',
      }
    case 'session_unavailable':
    case 'retry':
      return {
        tone: 'error',
        message: 'Account deletion is temporarily unavailable. Try again.',
      }
    case 'code_sent':
      return {
        tone: 'information',
        message: 'Check your verified email for a deletion code.',
      }
    case 'code_resent':
      return {
        tone: 'information',
        message: 'A new deletion code was sent. Only the newest code works.',
      }
    case 'resend_cooldown':
      return {
        tone: 'warning',
        message: 'Wait a moment before sending another code.',
      }
    case 'send_limit':
      return {
        tone: 'warning',
        message:
          'No more deletion codes can be sent right now. Use the newest code.',
      }
    case 'setup_cancelled':
      return { tone: 'success', message: 'Deletion setup cancelled.' }
    case 'confirmation_required':
      return {
        field: 'confirmation',
        tone: 'error',
        message:
          'Confirm that you understand this account will stop working immediately and recovery ends after 14 days.',
      }
    case 'invalid_code':
      return {
        field: 'code',
        tone: 'error',
        message: 'Enter the correct eight-digit deletion code.',
      }
    case 'code_expired':
      return {
        tone: 'warning',
        message: 'This deletion code has expired. Send another code.',
      }
    case 'reauthentication_required':
    case 'attempts_exhausted':
    case 'restart_required':
      return {
        tone: 'warning',
        message: 'This deletion code is no longer valid. Start again.',
      }
    case 'deletion_cancelled':
      return {
        tone: 'success',
        message:
          'Account deletion cancelled. Your account and archive are available again.',
      }
    case 'deletion_due':
      return {
        tone: 'error',
        message:
          'The recovery period for this account has ended. Account recovery and cancellation are no longer available.',
      }
  }
}

export function getPersistentAccountDeletionFeedback({
  cancelSetupState,
  completeState,
  confirmationError,
  lastOperation,
  requestState,
  resendState,
}: {
  cancelSetupState: AccountDeletionActionState
  completeState: AccountDeletionActionState
  confirmationError: boolean
  lastOperation: 'request' | 'complete' | 'resend' | 'cancel_setup' | null
  requestState: AccountDeletionActionState
  resendState: AccountDeletionActionState
}): AccountDeletionFeedback | null {
  // A blocked submission records the completion operation, so the unchecked
  // confirmation must outrank the stale completion state it never replaced.
  if (confirmationError) {
    return getAccountDeletionFeedback({ kind: 'confirmation_required' })
  }

  const selected =
    lastOperation === 'request'
      ? requestState
      : lastOperation === 'complete'
        ? completeState
        : lastOperation === 'resend'
          ? resendState
          : lastOperation === 'cancel_setup'
            ? cancelSetupState
            : null

  return getAccountDeletionFeedback(
    selected ??
      [completeState, resendState, cancelSetupState, requestState].find(
        (state) => state.kind !== 'idle',
      ) ?? { kind: 'idle' },
  )
}

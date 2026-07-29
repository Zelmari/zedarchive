import {
  initialUsernameChangeActionState,
  type UsernameChangeActionState,
} from '@/features/settings/domain/username-change'
import type { FeedbackPresentationTone } from '@/features/feedback/feedback-presentation'

export type UsernameChangeFeedback = {
  field?: 'username' | 'password' | 'code' | 'confirmation'
  tone: FeedbackPresentationTone
  message: string
}

export function getUsernameChangeFeedback(
  state: UsernameChangeActionState,
): UsernameChangeFeedback | null {
  switch (state.kind) {
    case 'idle':
      return null
    case 'invalid_username':
      return {
        field: 'username',
        tone: 'error',
        message: 'Use a username that matches the guidance below.',
      }
    case 'no_change':
      return {
        field: 'username',
        tone: 'error',
        message: 'Choose a different username.',
      }
    case 'already_changed':
      return {
        field: 'username',
        tone: 'error',
        message:
          'Your username has already been changed and cannot be changed again.',
      }
    case 'target_unavailable':
      return {
        field: 'username',
        tone: 'error',
        message: 'That username is unavailable. Choose another.',
      }
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
        message: 'Username change is temporarily unavailable. Try again.',
      }
    case 'code_sent':
      return {
        tone: 'information',
        message: 'Check your verified email for a verification code.',
      }
    case 'code_resent':
      return {
        tone: 'information',
        message:
          'A new verification code was sent. Only the newest code works.',
      }
    case 'resend_cooldown':
      return {
        tone: 'warning',
        message: 'Wait a moment before sending another code.',
      }
    case 'send_limit':
      return {
        tone: 'warning',
        message: 'Too many codes were requested. Start again later.',
      }
    case 'cancelled':
      return { tone: 'success', message: 'Username change cancelled.' }
    case 'confirmation_required':
      return {
        field: 'confirmation',
        tone: 'error',
        message:
          'Confirm that you understand this username change cannot be undone.',
      }
    case 'invalid_code':
      return {
        field: 'code',
        tone: 'error',
        message: 'Enter the correct eight-digit verification code.',
      }
    case 'code_expired':
      return {
        tone: 'warning',
        message: 'This verification code has expired. Send another code.',
      }
    case 'reauthentication_required':
    case 'attempts_exhausted':
    case 'restart_required':
      return {
        tone: 'warning',
        message: 'This verification code is no longer valid. Start again.',
      }
    case 'changed':
      return {
        tone: 'success',
        message: `Your username has been changed to @${state.username}.`,
      }
  }
}

export function getPersistentUsernameChangeFeedback({
  cancelState,
  completeState,
  confirmationError,
  lastOperation,
  requestState,
  resendState,
}: {
  cancelState: UsernameChangeActionState
  completeState: UsernameChangeActionState
  confirmationError: boolean
  lastOperation: 'request' | 'complete' | 'resend' | 'cancel' | null
  requestState: UsernameChangeActionState
  resendState: UsernameChangeActionState
}): UsernameChangeFeedback | null {
  if (confirmationError && lastOperation !== 'complete') {
    return {
      field: 'confirmation',
      tone: 'error',
      message:
        'Confirm that you understand this username change cannot be undone.',
    }
  }

  const selectedOperationState =
    lastOperation === 'request'
      ? requestState
      : lastOperation === 'complete'
        ? completeState
        : lastOperation === 'resend'
          ? resendState
          : lastOperation === 'cancel'
            ? cancelState
            : null
  const state =
    selectedOperationState ??
    [completeState, resendState, cancelState, requestState].find(
      (candidate) => candidate.kind !== 'idle',
    ) ??
    initialUsernameChangeActionState

  return getUsernameChangeFeedback(state)
}

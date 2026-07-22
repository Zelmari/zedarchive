import type { UpdateAnimeEntryStatusActionState } from '@/features/archive/domain/update-anime-entry-status'
import type { EntryStatus } from '@/features/archive/domain/entry-status'
import { getEntryStatusDisplayLabel } from '@/features/archive/domain/entry-status-display'

export type UpdateAnimeEntryStatusFeedback = {
  tone: 'error' | 'status'
  message: string
  selectError: boolean
}

export type UpdateAnimeEntryStatusFormState = {
  mode: 'read' | 'edit'
  authoritativeStatus: EntryStatus
  selectedStatus: EntryStatus
  feedback: UpdateAnimeEntryStatusFeedback | null
  focusTarget: 'edit' | 'select' | 'feedback' | null
  focusVersion: number
}

export type UpdateAnimeEntryStatusFormEvent =
  | { kind: 'open' }
  | { kind: 'select'; status: EntryStatus }
  | { kind: 'cancel' }
  | { kind: 'authoritative_status'; status: EntryStatus }
  | {
      kind: 'action_result'
      result: UpdateAnimeEntryStatusActionState
    }

export function createInitialUpdateAnimeEntryStatusFormState(
  currentStatus: EntryStatus,
): UpdateAnimeEntryStatusFormState {
  return {
    mode: 'read',
    authoritativeStatus: currentStatus,
    selectedStatus: currentStatus,
    feedback: null,
    focusTarget: null,
    focusVersion: 0,
  }
}

function withFeedback(
  state: UpdateAnimeEntryStatusFormState,
  feedback: UpdateAnimeEntryStatusFeedback,
): UpdateAnimeEntryStatusFormState {
  return {
    ...state,
    feedback,
    focusTarget: 'feedback',
    focusVersion: state.focusVersion + 1,
  }
}

export function updateAnimeEntryStatusFormReducer(
  state: UpdateAnimeEntryStatusFormState,
  event: UpdateAnimeEntryStatusFormEvent,
): UpdateAnimeEntryStatusFormState {
  switch (event.kind) {
    case 'open':
      return {
        ...state,
        mode: 'edit',
        selectedStatus: state.authoritativeStatus,
        feedback: null,
        focusTarget: 'select',
        focusVersion: state.focusVersion + 1,
      }
    case 'select':
      return {
        ...state,
        selectedStatus: event.status,
      }
    case 'cancel':
      return {
        ...state,
        mode: 'read',
        selectedStatus: state.authoritativeStatus,
        feedback: null,
        focusTarget: 'edit',
        focusVersion: state.focusVersion + 1,
      }
    case 'authoritative_status':
      return {
        ...state,
        authoritativeStatus: event.status,
        selectedStatus:
          state.mode === 'edit' ? state.selectedStatus : event.status,
      }
    case 'action_result': {
      const result = event.result

      switch (result.kind) {
        case 'idle':
          return state
        case 'updated':
          return withFeedback(
            {
              ...state,
              mode: 'read',
              authoritativeStatus: result.status,
              selectedStatus: result.status,
            },
            {
              tone: 'status',
              message: `Status updated to ${getEntryStatusDisplayLabel(result.status)}.`,
              selectError: false,
            },
          )
        case 'unchanged':
          return withFeedback(
            {
              ...state,
              mode: 'read',
              authoritativeStatus: result.status,
              selectedStatus: result.status,
            },
            {
              tone: 'status',
              message: `Status is already ${getEntryStatusDisplayLabel(result.status)}.`,
              selectError: false,
            },
          )
        case 'conflict':
          return withFeedback(
            {
              ...state,
              mode: 'edit',
              authoritativeStatus: result.currentStatus,
            },
            {
              tone: 'error',
              message: `This status changed elsewhere. It is now ${getEntryStatusDisplayLabel(result.currentStatus)}. Review your selection and try again.`,
              selectError: false,
            },
          )
        case 'invalid_status':
          return withFeedback(state, {
            tone: 'error',
            message: 'Choose a valid status before saving.',
            selectError: true,
          })
        case 'sign_in_required':
          return withFeedback(state, {
            tone: 'error',
            message: 'Your session has expired. Sign in and try again.',
            selectError: false,
          })
        case 'session_unavailable':
        case 'retry':
          return withFeedback(state, {
            tone: 'error',
            message: 'We couldn’t update this status right now. Try again.',
            selectError: false,
          })
        case 'unavailable':
          return withFeedback(state, {
            tone: 'error',
            message:
              'This archive entry is no longer available. Refresh your archive.',
            selectError: false,
          })
      }
    }
  }
}

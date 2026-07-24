import type { RemoveAnimeEntryActionState } from '@/features/archive/domain/remove-anime-entry'

export type AnimeEntryRemovalFeedback = {
  message: string
  tone: 'error'
}

type AnimeEntryRemovalFailureState = {
  kind: Exclude<RemoveAnimeEntryActionState['kind'], 'idle' | 'removed'>
}

export type AnimeEntryRemovalControlState = {
  mode: 'closed' | 'open'
  feedback: AnimeEntryRemovalFeedback | null
  focusTarget: 'cancel' | 'feedback' | 'launcher' | null
  focusVersion: number
}

export type AnimeEntryRemovalControlEvent =
  | { kind: 'open' }
  | { kind: 'cancel' }
  | {
      kind: 'action_result'
      result: AnimeEntryRemovalFailureState
    }
  | { kind: 'removed' }

export function createInitialAnimeEntryRemovalControlState(): AnimeEntryRemovalControlState {
  return {
    mode: 'closed',
    feedback: null,
    focusTarget: null,
    focusVersion: 0,
  }
}

function getRemovalFailureFeedback(
  result: AnimeEntryRemovalFailureState,
): AnimeEntryRemovalFeedback {
  switch (result.kind) {
    case 'sign_in_required':
      return {
        tone: 'error',
        message: 'Your session has expired. Sign in and try again.',
      }
    case 'unavailable':
      return {
        tone: 'error',
        message:
          'This archive entry is no longer available. Refresh your archive.',
      }
    case 'session_unavailable':
    case 'retry':
      return {
        tone: 'error',
        message: 'We couldn’t remove this entry right now. Try again.',
      }
  }
}

export function animeEntryRemovalControlReducer(
  state: AnimeEntryRemovalControlState,
  event: AnimeEntryRemovalControlEvent,
): AnimeEntryRemovalControlState {
  switch (event.kind) {
    case 'open':
      return {
        mode: 'open',
        feedback: null,
        focusTarget: 'cancel',
        focusVersion: state.focusVersion + 1,
      }
    case 'cancel':
      return {
        mode: 'closed',
        feedback: null,
        focusTarget: 'launcher',
        focusVersion: state.focusVersion + 1,
      }
    case 'action_result':
      return {
        mode: 'open',
        feedback: getRemovalFailureFeedback(event.result),
        focusTarget: 'feedback',
        focusVersion: state.focusVersion + 1,
      }
    case 'removed':
      return {
        mode: 'closed',
        feedback: null,
        focusTarget: null,
        focusVersion: state.focusVersion + 1,
      }
  }
}

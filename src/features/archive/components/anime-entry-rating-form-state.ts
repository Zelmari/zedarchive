import {
  formatRating,
  parseRatingFormValue,
  type Rating,
} from '@/features/archive/domain/rating'
import type { UpdateAnimeEntryRatingActionState } from '@/features/archive/domain/update-anime-entry-rating'

type RatingFeedback = {
  tone: 'error' | 'status'
  message: string
  inputError: boolean
}

export type AnimeEntryRatingFormState = {
  mode: 'read' | 'edit'
  authoritativeRating: Rating | null
  value: string
  feedback: RatingFeedback | null
  focusTarget: 'launcher' | 'input' | 'feedback' | null
  focusVersion: number
}

export type AnimeEntryRatingFormEvent =
  | { kind: 'open' }
  | { kind: 'change'; value: string }
  | { kind: 'cancel' }
  | { kind: 'authoritative_rating'; rating: Rating | null }
  | { kind: 'action_result'; result: UpdateAnimeEntryRatingActionState }

function formatEditorValue(rating: Rating | null): string {
  return rating === null ? '' : formatRating(rating)
}

function withFeedback(
  state: AnimeEntryRatingFormState,
  feedback: RatingFeedback,
): AnimeEntryRatingFormState {
  return {
    ...state,
    feedback,
    focusTarget: 'feedback',
    focusVersion: state.focusVersion + 1,
  }
}

function getRatingFeedback(rating: Rating | null): string {
  return rating === null ? 'not set' : `${formatRating(rating)}/10`
}

export function createInitialAnimeEntryRatingFormState(
  rating: Rating | null,
): AnimeEntryRatingFormState {
  return {
    mode: 'read',
    authoritativeRating: rating,
    value: formatEditorValue(rating),
    feedback: null,
    focusTarget: null,
    focusVersion: 0,
  }
}

export function shouldEnableRatingSave(
  value: string,
  authoritativeRating: Rating | null,
): boolean {
  const requested = parseRatingFormValue(value)
  return requested === null ? value !== '' : requested !== authoritativeRating
}

export function animeEntryRatingFormReducer(
  state: AnimeEntryRatingFormState,
  event: AnimeEntryRatingFormEvent,
): AnimeEntryRatingFormState {
  switch (event.kind) {
    case 'open':
      return {
        ...state,
        mode: 'edit',
        value: formatEditorValue(state.authoritativeRating),
        feedback: null,
        focusTarget: 'input',
        focusVersion: state.focusVersion + 1,
      }
    case 'change':
      return { ...state, value: event.value }
    case 'cancel':
      return {
        ...state,
        mode: 'read',
        value: formatEditorValue(state.authoritativeRating),
        feedback: null,
        focusTarget: 'launcher',
        focusVersion: state.focusVersion + 1,
      }
    case 'authoritative_rating':
      return {
        ...state,
        authoritativeRating: event.rating,
        value:
          state.mode === 'read' ? formatEditorValue(event.rating) : state.value,
      }
    case 'action_result': {
      const { result } = event
      switch (result.kind) {
        case 'idle':
          return state
        case 'updated':
          return withFeedback(
            {
              ...state,
              mode: 'read',
              authoritativeRating: result.rating,
              value: formatEditorValue(result.rating),
            },
            {
              tone: 'status',
              message:
                result.rating === null
                  ? 'Rating removed.'
                  : `Rating updated to ${formatRating(result.rating)}/10.`,
              inputError: false,
            },
          )
        case 'unchanged':
          return withFeedback(
            {
              ...state,
              mode: 'read',
              authoritativeRating: result.rating,
              value: formatEditorValue(result.rating),
            },
            {
              tone: 'status',
              message: `Rating is already ${getRatingFeedback(result.rating)}.`,
              inputError: false,
            },
          )
        case 'conflict':
          return withFeedback(
            { ...state, authoritativeRating: result.currentRating },
            {
              tone: 'error',
              message: `This rating changed elsewhere. It is now ${getRatingFeedback(result.currentRating)}. Review your entry and try again.`,
              inputError: false,
            },
          )
        case 'invalid_rating':
          return withFeedback(state, {
            tone: 'error',
            message: 'Enter a rating from 1.0 to 10.0 in steps of 0.1.',
            inputError: true,
          })
        case 'sign_in_required':
          return withFeedback(state, {
            tone: 'error',
            message: 'Your session has expired. Sign in and try again.',
            inputError: false,
          })
        case 'session_unavailable':
        case 'retry':
          return withFeedback(state, {
            tone: 'error',
            message: 'We couldn’t update this rating right now. Try again.',
            inputError: false,
          })
        case 'unavailable':
          return withFeedback(state, {
            tone: 'error',
            message:
              'This archive entry is no longer available. Refresh your archive.',
            inputError: false,
          })
      }
    }
  }
}

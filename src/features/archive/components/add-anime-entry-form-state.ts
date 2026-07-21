import type { AddAnimeEntryActionState } from '@/features/archive/domain/add-anime-entry'
import { getEntryStatusDisplayLabel } from '@/features/archive/domain/entry-status-display'

export type AddAnimeEntryFormFeedback =
  | { tone: 'error'; message: string; selectError: true }
  | { tone: 'error'; message: string; selectError: false }
  | { tone: 'success'; message: string; selectError: false }
  | null

export function getAddAnimeEntryFormFeedback(
  state: AddAnimeEntryActionState,
): AddAnimeEntryFormFeedback {
  switch (state.kind) {
    case 'idle':
      return null
    case 'invalid_status':
      return {
        tone: 'error',
        message: 'Choose one of the available statuses.',
        selectError: true,
      }
    case 'created':
      return {
        tone: 'success',
        message: `Added to your archive as ${getEntryStatusDisplayLabel(state.status)}.`,
        selectError: false,
      }
    case 'already_exists':
      return {
        tone: 'success',
        message: `Already in your archive as ${getEntryStatusDisplayLabel(state.status)}.`,
        selectError: false,
      }
    case 'sign_in_required':
      return {
        tone: 'error',
        message: 'Sign in to add anime to your archive.',
        selectError: false,
      }
    case 'session_unavailable':
      return {
        tone: 'error',
        message:
          'Archive controls are temporarily unavailable. Please try again.',
        selectError: false,
      }
    case 'unavailable':
      return {
        tone: 'error',
        message: 'This anime is no longer available to add.',
        selectError: false,
      }
    case 'retry':
      return {
        tone: 'error',
        message: 'We could not add this anime. Please try again.',
        selectError: false,
      }
  }
}

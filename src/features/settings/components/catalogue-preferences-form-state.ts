import type { CataloguePreferenceActionState } from '@/features/settings/domain/catalogue-preferences'

export type CataloguePreferenceFeedback = {
  tone: 'error' | 'status'
  message: string
}

export function getTitleLanguageFeedback(
  state: CataloguePreferenceActionState,
): CataloguePreferenceFeedback | null {
  switch (state.kind) {
    case 'idle':
      return null
    case 'updated':
    case 'unchanged':
      return { tone: 'status', message: 'Title language saved.' }
    case 'invalid':
      return {
        tone: 'error',
        message: 'Choose a valid anime title language.',
      }
    case 'sign_in_required':
      return {
        tone: 'error',
        message: 'Your session has expired. Sign in and try again.',
      }
    case 'session_unavailable':
    case 'retry':
      return {
        tone: 'error',
        message: 'We couldn’t save your title language right now. Try again.',
      }
  }
}

export function getAdultVisibilityFeedback(
  state: CataloguePreferenceActionState,
  command: 'enable' | 'disable',
): CataloguePreferenceFeedback | null {
  switch (state.kind) {
    case 'idle':
      return null
    case 'updated':
    case 'unchanged':
      return {
        tone: 'status',
        message:
          command === 'enable'
            ? 'Adult content is now shown for your account.'
            : 'Adult content is now hidden.',
      }
    case 'invalid':
      return {
        tone: 'error',
        message:
          command === 'enable'
            ? 'Confirm that you are at least 18 before showing adult content.'
            : 'We couldn’t hide adult content from that request. Try again.',
      }
    case 'sign_in_required':
      return {
        tone: 'error',
        message: 'Your session has expired. Sign in and try again.',
      }
    case 'session_unavailable':
    case 'retry':
      return {
        tone: 'error',
        message: `We couldn’t ${command === 'enable' ? 'show' : 'hide'} adult content right now. Try again.`,
      }
  }
}

export const missingAdultConfirmationMessage =
  'Confirm that you are at least 18 before showing adult content.'

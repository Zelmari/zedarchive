import type { UpdateAnimeEntryFavouriteActionState } from '@/features/archive/domain/update-anime-entry-favourite'

type FavouriteFeedback = {
  tone: 'error' | 'status'
  message: string
}

export type AnimeEntryFavouriteControlState = {
  authoritativeFavourite: boolean
  feedback: FavouriteFeedback | null
  focusTarget: 'feedback' | null
  focusVersion: number
}

export type AnimeEntryFavouriteControlEvent =
  | { kind: 'authoritative_favourite'; isFavourite: boolean }
  | { kind: 'action_result'; result: UpdateAnimeEntryFavouriteActionState }

function withFeedback(
  state: AnimeEntryFavouriteControlState,
  feedback: FavouriteFeedback,
): AnimeEntryFavouriteControlState {
  return {
    ...state,
    feedback,
    focusTarget: 'feedback',
    focusVersion: state.focusVersion + 1,
  }
}

export function createInitialAnimeEntryFavouriteControlState(
  isFavourite: boolean,
): AnimeEntryFavouriteControlState {
  return {
    authoritativeFavourite: isFavourite,
    feedback: null,
    focusTarget: null,
    focusVersion: 0,
  }
}

export function animeEntryFavouriteControlReducer(
  state: AnimeEntryFavouriteControlState,
  event: AnimeEntryFavouriteControlEvent,
): AnimeEntryFavouriteControlState {
  switch (event.kind) {
    case 'authoritative_favourite':
      return { ...state, authoritativeFavourite: event.isFavourite }
    case 'action_result': {
      const { result } = event

      switch (result.kind) {
        case 'idle':
          return state
        case 'updated':
          return withFeedback(
            { ...state, authoritativeFavourite: result.isFavourite },
            {
              tone: 'status',
              message: result.isFavourite
                ? 'Added to favourites.'
                : 'Removed from favourites.',
            },
          )
        case 'unchanged':
          return withFeedback(
            { ...state, authoritativeFavourite: result.isFavourite },
            {
              tone: 'status',
              message: result.isFavourite
                ? 'This anime is already a favourite.'
                : 'This anime is not a favourite.',
            },
          )
        case 'conflict':
          return withFeedback(
            { ...state, authoritativeFavourite: result.currentFavourite },
            {
              tone: 'error',
              message:
                'This favourite changed elsewhere. Review the current state and try again.',
            },
          )
        case 'sign_in_required':
          return withFeedback(state, {
            tone: 'error',
            message: 'Your session has expired. Sign in and try again.',
          })
        case 'unavailable':
          return withFeedback(state, {
            tone: 'error',
            message:
              'This archive entry is no longer available. Refresh your archive.',
          })
        case 'session_unavailable':
        case 'retry':
          return withFeedback(state, {
            tone: 'error',
            message: 'We couldn’t update this favourite right now. Try again.',
          })
      }
    }
  }
}

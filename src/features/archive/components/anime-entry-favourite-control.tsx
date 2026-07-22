'use client'

import {
  useEffect,
  useId,
  useReducer,
  useRef,
  useSyncExternalStore,
} from 'react'
import {
  animeEntryFavouriteControlReducer,
  createInitialAnimeEntryFavouriteControlState,
} from '@/features/archive/components/anime-entry-favourite-control-state'
import type { UpdateAnimeEntryFavouriteActionState } from '@/features/archive/domain/update-anime-entry-favourite'

const buttonClassName =
  'rounded border border-gray-300 bg-white px-3 py-2 transition-colors hover:bg-gray-100 active:bg-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 disabled:opacity-70'

const subscribeToHydration = () => () => undefined

type Props = {
  entryId: string
  isFavourite: boolean
  isPending: boolean
  isOwnOperationPending: boolean
  onSubmit: (
    formData: FormData,
  ) => Promise<UpdateAnimeEntryFavouriteActionState | null>
}

export function AnimeEntryFavouriteControl({
  entryId,
  isFavourite,
  isPending,
  isOwnOperationPending,
  onSubmit,
}: Props) {
  const [state, dispatch] = useReducer(
    animeEntryFavouriteControlReducer,
    isFavourite,
    createInitialAnimeEntryFavouriteControlState,
  )
  const hasHydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  )
  const feedbackId = useId()
  const feedbackRef = useRef<HTMLParagraphElement>(null)
  const handledFocusVersionRef = useRef(0)

  useEffect(() => {
    dispatch({ kind: 'authoritative_favourite', isFavourite })
  }, [isFavourite])

  useEffect(() => {
    if (
      state.focusTarget !== 'feedback' ||
      state.focusVersion === handledFocusVersionRef.current
    ) {
      return
    }

    handledFocusVersionRef.current = state.focusVersion
    feedbackRef.current?.focus()
  }, [state.focusTarget, state.focusVersion])

  async function submit() {
    const requestedFavourite = !state.authoritativeFavourite
    const formData = new FormData()
    formData.set('entryId', entryId)
    formData.set('expectedFavourite', String(state.authoritativeFavourite))
    formData.set('requestedFavourite', String(requestedFavourite))

    const result = await onSubmit(formData)
    if (result !== null) dispatch({ kind: 'action_result', result })
  }

  const pendingCopy = state.authoritativeFavourite
    ? 'Removing from favourites…'
    : 'Adding to favourites…'

  return (
    <div className="space-y-2">
      <p>Favourite — {state.authoritativeFavourite ? 'Yes' : 'No'}</p>
      {hasHydrated ? (
        <button
          className={buttonClassName}
          disabled={isPending}
          onClick={() => void submit()}
          type="button"
        >
          {isOwnOperationPending
            ? pendingCopy
            : state.authoritativeFavourite
              ? 'Remove from favourites'
              : 'Add to favourites'}
        </button>
      ) : null}
      {state.feedback === null ? null : (
        <p
          aria-live={state.feedback.tone === 'status' ? 'polite' : undefined}
          className={
            state.feedback.tone === 'error' ? 'text-sm text-red-700' : 'text-sm'
          }
          id={feedbackId}
          ref={feedbackRef}
          role={state.feedback.tone === 'error' ? 'alert' : 'status'}
          tabIndex={-1}
        >
          {state.feedback.message}
        </p>
      )}
    </div>
  )
}

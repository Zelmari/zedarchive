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
import {
  getFeedbackNoticeClassName,
  isAlertFeedbackTone,
} from '@/features/feedback/feedback-presentation'

const secondaryButtonClassName = 'za-button za-button--secondary'
const selectedButtonClassName = 'za-button za-button--selected'

const subscribeToHydration = () => () => undefined

type Props = {
  entryId: string
  animeTitle: string
  isFavourite: boolean
  isPending: boolean
  isOwnOperationPending: boolean
  onSubmit: (
    formData: FormData,
  ) => Promise<UpdateAnimeEntryFavouriteActionState | null>
}

export function AnimeEntryFavouriteControl({
  entryId,
  animeTitle,
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
  const actionCopy = isOwnOperationPending
    ? pendingCopy
    : state.authoritativeFavourite
      ? 'Remove from favourites'
      : 'Add to favourites'
  const feedbackIsAlert =
    state.feedback === null ? false : isAlertFeedbackTone(state.feedback.tone)

  return (
    <div className="space-y-2">
      <p>Favourite — {state.authoritativeFavourite ? 'Yes' : 'No'}</p>
      {hasHydrated ? (
        <button
          className={
            state.authoritativeFavourite
              ? selectedButtonClassName
              : secondaryButtonClassName
          }
          disabled={isPending}
          onClick={() => void submit()}
          type="button"
          aria-label={`${actionCopy} — ${animeTitle}`}
        >
          {actionCopy}
        </button>
      ) : null}
      {state.feedback === null ? null : (
        <p
          aria-live={feedbackIsAlert ? undefined : 'polite'}
          className={`${getFeedbackNoticeClassName(state.feedback.tone)} text-sm`}
          id={feedbackId}
          ref={feedbackRef}
          role={feedbackIsAlert ? 'alert' : 'status'}
          tabIndex={-1}
        >
          {state.feedback.message}
        </p>
      )}
    </div>
  )
}

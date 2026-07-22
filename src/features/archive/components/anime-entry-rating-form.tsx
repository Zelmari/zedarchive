'use client'

import {
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  animeEntryRatingFormReducer,
  createInitialAnimeEntryRatingFormState,
  shouldEnableRatingSave,
} from '@/features/archive/components/anime-entry-rating-form-state'
import {
  formatRating,
  parseRatingFormValue,
  ratingNoneSentinel,
  type Rating,
} from '@/features/archive/domain/rating'
import type { UpdateAnimeEntryRatingActionState } from '@/features/archive/domain/update-anime-entry-rating'

const fieldClassName =
  'rounded border border-gray-300 px-3 py-2 aria-invalid:border-red-600 aria-invalid:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500'

const buttonClassName =
  'rounded border border-gray-300 bg-white px-3 py-2 transition-colors hover:bg-gray-100 active:bg-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 disabled:opacity-70'

const subscribeToHydration = () => () => undefined

type Props = {
  entryId: string
  animeTitle: string
  rating: Rating | null
  isPending: boolean
  onSubmit: (
    formData: FormData,
  ) => Promise<UpdateAnimeEntryRatingActionState | null>
}

export function AnimeEntryRatingForm({
  entryId,
  animeTitle,
  rating,
  isPending,
  onSubmit,
}: Props) {
  const [state, dispatch] = useReducer(
    animeEntryRatingFormReducer,
    rating,
    createInitialAnimeEntryRatingFormState,
  )
  const [pendingCommand, setPendingCommand] = useState<
    'save' | 'remove' | null
  >(null)
  const hasHydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  )
  const inputId = useId()
  const feedbackId = useId()
  const launcherRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const feedbackRef = useRef<HTMLParagraphElement>(null)
  const handledFocusVersionRef = useRef(0)

  useEffect(() => {
    dispatch({ kind: 'authoritative_rating', rating })
  }, [rating])

  useEffect(() => {
    if (state.focusVersion === handledFocusVersionRef.current) return

    handledFocusVersionRef.current = state.focusVersion
    switch (state.focusTarget) {
      case 'launcher':
        launcherRef.current?.focus()
        break
      case 'input':
        inputRef.current?.focus()
        break
      case 'feedback':
        feedbackRef.current?.focus()
        break
      case null:
        break
    }
  }, [state.focusTarget, state.focusVersion])

  const isSaveDisabled =
    isPending || !shouldEnableRatingSave(state.value, state.authoritativeRating)
  const isSaving = isPending && pendingCommand === 'save'
  const isRemoving = isPending && pendingCommand === 'remove'

  async function submit(formData: FormData, command: 'save' | 'remove') {
    setPendingCommand(command)
    const result = await onSubmit(formData)
    setPendingCommand(null)
    if (result !== null) dispatch({ kind: 'action_result', result })
  }

  function submitSave(formData: FormData) {
    if (parseRatingFormValue(state.value) === null) {
      dispatch({ kind: 'action_result', result: { kind: 'invalid_rating' } })
      return
    }

    void submit(formData, 'save')
  }

  function submitRemove() {
    if (state.authoritativeRating === null) return

    const formData = new FormData()
    formData.set('entryId', entryId)
    formData.set('ratingOperation', 'remove')
    formData.set('expectedRating', formatRating(state.authoritativeRating))
    formData.set('requestedRating', ratingNoneSentinel)
    void submit(formData, 'remove')
  }

  if (state.mode === 'read') {
    return (
      <div className="space-y-2">
        <p>
          Rating —{' '}
          {state.authoritativeRating === null
            ? 'Not rated'
            : `${formatRating(state.authoritativeRating)}/10`}
        </p>
        {hasHydrated ? (
          <button
            className={buttonClassName}
            disabled={isPending}
            onClick={() => dispatch({ kind: 'open' })}
            ref={launcherRef}
            type="button"
          >
            {state.authoritativeRating === null ? 'Set rating' : 'Edit rating'}
          </button>
        ) : null}
        {state.feedback === null ? null : (
          <p
            aria-live={state.feedback.tone === 'status' ? 'polite' : undefined}
            className={
              state.feedback.tone === 'error'
                ? 'text-sm text-red-700'
                : 'text-sm'
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

  return (
    <div className="space-y-2">
      <form
        aria-busy={isPending}
        aria-label={`Update rating for ${animeTitle}`}
        className="space-y-2"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          submitSave(new FormData(event.currentTarget))
        }}
      >
        <input name="entryId" type="hidden" value={entryId} />
        <input name="ratingOperation" type="hidden" value="save" />
        <input
          name="expectedRating"
          type="hidden"
          value={
            state.authoritativeRating === null
              ? ratingNoneSentinel
              : formatRating(state.authoritativeRating)
          }
        />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor={inputId}>
            Rating
          </label>
          <input
            aria-describedby={
              state.feedback?.inputError ? feedbackId : undefined
            }
            aria-invalid={state.feedback?.inputError ? true : undefined}
            className={fieldClassName}
            disabled={isPending}
            id={inputId}
            inputMode="decimal"
            max="10"
            min="1"
            name="requestedRating"
            onChange={(event) =>
              dispatch({ kind: 'change', value: event.target.value })
            }
            ref={inputRef}
            step="0.1"
            type="number"
            value={state.value}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className={buttonClassName}
            disabled={isSaveDisabled}
            type="submit"
          >
            {isSaving ? 'Saving rating…' : 'Save rating'}
          </button>
          {state.authoritativeRating === null ? null : (
            <button
              className={buttonClassName}
              disabled={isPending}
              onClick={submitRemove}
              type="button"
            >
              {isRemoving ? 'Removing rating…' : 'Remove rating'}
            </button>
          )}
          <button
            className={buttonClassName}
            disabled={isPending}
            onClick={() => dispatch({ kind: 'cancel' })}
            type="button"
          >
            Cancel
          </button>
        </div>
      </form>
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

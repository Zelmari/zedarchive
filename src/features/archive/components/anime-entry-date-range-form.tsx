'use client'

import {
  useEffect,
  useId,
  useReducer,
  useRef,
  useSyncExternalStore,
} from 'react'
import {
  animeEntryDateRangeFormReducer,
  createInitialAnimeEntryDateRangeFormState,
  shouldEnableDateRangeSave,
} from '@/features/archive/components/anime-entry-date-range-form-state'
import type { CalendarDate } from '@/features/archive/domain/entry-date-range'
import { entryDateNoneSentinel } from '@/features/archive/domain/update-anime-entry-date-range'
import type { UpdateAnimeEntryDateRangeActionState } from '@/features/archive/domain/update-anime-entry-date-range'

const fieldClassName =
  'rounded border border-gray-300 px-3 py-2 aria-invalid:border-red-600 aria-invalid:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500'

const buttonClassName =
  'rounded border border-gray-300 bg-white px-3 py-2 transition-colors hover:bg-gray-100 active:bg-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 disabled:opacity-70'

const subscribeToHydration = () => () => undefined

type Props = {
  entryId: string
  animeTitle: string
  startDate: CalendarDate | null
  finishDate: CalendarDate | null
  isPending: boolean
  isOwnOperationPending: boolean
  onSubmit: (
    formData: FormData,
  ) => Promise<UpdateAnimeEntryDateRangeActionState | null>
}

export function AnimeEntryDateRangeForm({
  entryId,
  animeTitle,
  startDate,
  finishDate,
  isPending,
  isOwnOperationPending,
  onSubmit,
}: Props) {
  const [state, dispatch] = useReducer(
    animeEntryDateRangeFormReducer,
    { startDate, finishDate },
    ({ startDate: initialStartDate, finishDate: initialFinishDate }) =>
      createInitialAnimeEntryDateRangeFormState(
        initialStartDate,
        initialFinishDate,
      ),
  )
  const hasHydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  )
  const startDateId = useId()
  const finishDateId = useId()
  const helpId = useId()
  const feedbackId = useId()
  const launcherRef = useRef<HTMLButtonElement>(null)
  const startDateRef = useRef<HTMLInputElement>(null)
  const feedbackRef = useRef<HTMLParagraphElement>(null)
  const handledFocusVersionRef = useRef(0)

  useEffect(() => {
    dispatch({ kind: 'authoritative_dates', startDate, finishDate })
  }, [finishDate, startDate])

  useEffect(() => {
    if (state.focusVersion === handledFocusVersionRef.current) return

    handledFocusVersionRef.current = state.focusVersion
    switch (state.focusTarget) {
      case 'launcher':
        launcherRef.current?.focus()
        break
      case 'input':
        startDateRef.current?.focus()
        break
      case 'feedback':
        feedbackRef.current?.focus()
        break
      case null:
        break
    }
  }, [state.focusTarget, state.focusVersion])

  const isSaveDisabled =
    isPending ||
    !shouldEnableDateRangeSave(
      state.startDateValue,
      state.finishDateValue,
      state.authoritativeStartDate,
      state.authoritativeFinishDate,
    )

  async function submit(formData: FormData) {
    const result = await onSubmit(formData)
    if (result !== null) dispatch({ kind: 'action_result', result })
  }

  const hasNoDates =
    state.authoritativeStartDate === null &&
    state.authoritativeFinishDate === null

  if (state.mode === 'read') {
    return (
      <div className="space-y-2">
        <p>Start date — {state.authoritativeStartDate ?? 'Not set'}</p>
        <p>Finish date — {state.authoritativeFinishDate ?? 'Not set'}</p>
        {hasHydrated ? (
          <button
            className={buttonClassName}
            disabled={isPending}
            onClick={() => dispatch({ kind: 'open' })}
            ref={launcherRef}
            type="button"
          >
            {hasNoDates ? 'Set dates' : 'Edit dates'}
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

  const inputError = state.feedback?.inputError

  return (
    <div className="space-y-2">
      <form
        aria-busy={isPending}
        aria-label={`Update viewing dates for ${animeTitle}`}
        className="space-y-2"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submit(new FormData(event.currentTarget))
        }}
      >
        <input name="entryId" type="hidden" value={entryId} />
        <input
          name="expectedStartDate"
          type="hidden"
          value={state.authoritativeStartDate ?? entryDateNoneSentinel}
        />
        <input
          name="expectedFinishDate"
          type="hidden"
          value={state.authoritativeFinishDate ?? entryDateNoneSentinel}
        />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor={startDateId}>
            Start date
          </label>
          <input
            aria-describedby={
              inputError === 'start' || inputError === 'both'
                ? `${helpId} ${feedbackId}`
                : helpId
            }
            aria-invalid={
              inputError === 'start' || inputError === 'both' ? true : undefined
            }
            className={fieldClassName}
            disabled={isPending}
            id={startDateId}
            name="requestedStartDate"
            onChange={(event) =>
              dispatch({ kind: 'change_start_date', value: event.target.value })
            }
            ref={startDateRef}
            type="date"
            value={state.startDateValue}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor={finishDateId}>
            Finish date
          </label>
          <input
            aria-describedby={
              inputError === 'finish' || inputError === 'both'
                ? `${helpId} ${feedbackId}`
                : helpId
            }
            aria-invalid={
              inputError === 'finish' || inputError === 'both'
                ? true
                : undefined
            }
            className={fieldClassName}
            disabled={isPending}
            id={finishDateId}
            name="requestedFinishDate"
            onChange={(event) =>
              dispatch({
                kind: 'change_finish_date',
                value: event.target.value,
              })
            }
            type="date"
            value={state.finishDateValue}
          />
        </div>
        <p className="text-sm" id={helpId}>
          Leave a date blank to clear it.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className={buttonClassName}
            disabled={isSaveDisabled}
            type="submit"
          >
            {isOwnOperationPending ? 'Saving dates…' : 'Save dates'}
          </button>
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
        <div className="space-y-1">
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
          {state.feedback.currentDates === undefined ? null : (
            <p className="text-sm">
              Saved start date —{' '}
              {state.feedback.currentDates.startDate ?? 'Not set'}; saved finish
              date — {state.feedback.currentDates.finishDate ?? 'Not set'}.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

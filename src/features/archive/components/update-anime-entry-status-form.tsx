'use client'

import {
  useActionState,
  useEffect,
  useId,
  useReducer,
  useRef,
  useSyncExternalStore,
} from 'react'
import { updateAnimeEntryStatus } from '@/features/archive/actions/update-anime-entry-status'
import {
  createInitialUpdateAnimeEntryStatusFormState,
  updateAnimeEntryStatusFormReducer,
} from '@/features/archive/components/update-anime-entry-status-form-state'
import { initialUpdateAnimeEntryStatusActionState } from '@/features/archive/domain/update-anime-entry-status'
import type { EntryStatus } from '@/features/archive/domain/entry-status'
import { entryStatusValues } from '@/features/archive/domain/entry-status'
import { getEntryStatusDisplayLabel } from '@/features/archive/domain/entry-status-display'

const fieldClassName =
  'rounded border border-gray-300 px-3 py-2 aria-invalid:border-red-600 aria-invalid:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500'

const buttonClassName =
  'rounded border border-gray-300 bg-white px-3 py-2 transition-colors hover:bg-gray-100 active:bg-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 disabled:opacity-70'

const subscribeToHydration = () => () => undefined

type UpdateAnimeEntryStatusFormProps = {
  entryId: string
  animeTitle: string
  currentStatus: EntryStatus
}

export function UpdateAnimeEntryStatusForm({
  entryId,
  animeTitle,
  currentStatus,
}: UpdateAnimeEntryStatusFormProps) {
  const [actionState, formAction, isPending] = useActionState(
    updateAnimeEntryStatus,
    initialUpdateAnimeEntryStatusActionState,
  )
  const [formState, dispatch] = useReducer(
    updateAnimeEntryStatusFormReducer,
    currentStatus,
    createInitialUpdateAnimeEntryStatusFormState,
  )
  const hasHydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  )
  const selectId = useId()
  const feedbackId = useId()
  const editButtonRef = useRef<HTMLButtonElement>(null)
  const selectRef = useRef<HTMLSelectElement>(null)
  const feedbackRef = useRef<HTMLParagraphElement>(null)
  const handledFocusVersionRef = useRef(0)

  useEffect(() => {
    dispatch({ kind: 'action_result', result: actionState })
  }, [actionState])

  useEffect(() => {
    if (formState.focusVersion === handledFocusVersionRef.current) {
      return
    }

    handledFocusVersionRef.current = formState.focusVersion

    switch (formState.focusTarget) {
      case 'edit':
        editButtonRef.current?.focus()
        break
      case 'select':
        selectRef.current?.focus()
        break
      case 'feedback':
        feedbackRef.current?.focus()
        break
      case null:
        break
    }
  }, [formState.focusTarget, formState.focusVersion])

  const feedback = formState.feedback
  const isSaveDisabled =
    isPending || formState.selectedStatus === formState.authoritativeStatus

  return (
    <div className="space-y-2">
      {formState.mode === 'read' ? (
        <>
          <p>
            In your archive —{' '}
            {getEntryStatusDisplayLabel(formState.authoritativeStatus)}
          </p>
          {hasHydrated ? (
            <button
              className={buttonClassName}
              onClick={() => dispatch({ kind: 'open' })}
              ref={editButtonRef}
              type="button"
            >
              Edit status
            </button>
          ) : null}
        </>
      ) : (
        <form
          action={formAction}
          aria-busy={isPending}
          aria-label={`Update status for ${animeTitle}`}
          className="space-y-2"
        >
          <input name="entryId" type="hidden" value={entryId} />
          <input
            name="expectedStatus"
            type="hidden"
            value={formState.authoritativeStatus}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor={selectId}>
              Status
            </label>
            <select
              aria-describedby={feedback?.selectError ? feedbackId : undefined}
              aria-invalid={feedback?.selectError ? true : undefined}
              className={fieldClassName}
              disabled={isPending}
              id={selectId}
              name="requestedStatus"
              onChange={(event) => {
                const selectedStatus = entryStatusValues.find(
                  (status) => status === event.target.value,
                )

                if (selectedStatus !== undefined) {
                  dispatch({ kind: 'select', status: selectedStatus })
                }
              }}
              ref={selectRef}
              value={formState.selectedStatus}
            >
              {entryStatusValues.map((status) => (
                <option key={status} value={status}>
                  {getEntryStatusDisplayLabel(status)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className={buttonClassName}
              disabled={isSaveDisabled}
              type="submit"
            >
              {isPending ? 'Saving…' : 'Save status'}
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
      )}
      {feedback === null ? null : (
        <p
          aria-live={feedback.tone === 'status' ? 'polite' : undefined}
          className={
            feedback.tone === 'error' ? 'text-sm text-red-700' : 'text-sm'
          }
          id={feedbackId}
          ref={feedbackRef}
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          tabIndex={-1}
        >
          {feedback.message}
        </p>
      )}
    </div>
  )
}

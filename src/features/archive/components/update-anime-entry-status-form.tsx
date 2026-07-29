'use client'

import {
  useEffect,
  useId,
  useReducer,
  useRef,
  useSyncExternalStore,
} from 'react'
import {
  createInitialUpdateAnimeEntryStatusFormState,
  updateAnimeEntryStatusFormReducer,
} from '@/features/archive/components/update-anime-entry-status-form-state'
import type { UpdateAnimeEntryStatusActionState } from '@/features/archive/domain/update-anime-entry-status'
import type { EntryStatus } from '@/features/archive/domain/entry-status'
import { entryStatusValues } from '@/features/archive/domain/entry-status'
import { getEntryStatusDisplayLabel } from '@/features/archive/domain/entry-status-display'
import {
  getFeedbackNoticeClassName,
  isAlertFeedbackTone,
} from '@/features/feedback/feedback-presentation'

const fieldClassName = 'za-select'

const primaryButtonClassName = 'za-button za-button--primary'
const secondaryButtonClassName = 'za-button za-button--secondary'
const tertiaryButtonClassName = 'za-button za-button--tertiary'

const subscribeToHydration = () => () => undefined

type UpdateAnimeEntryStatusFormProps = {
  entryId: string
  animeTitle: string
  currentStatus: EntryStatus
  isPending: boolean
  onSubmit: (
    formData: FormData,
  ) => Promise<UpdateAnimeEntryStatusActionState | null>
}

export function UpdateAnimeEntryStatusForm({
  entryId,
  animeTitle,
  currentStatus,
  isPending,
  onSubmit,
}: UpdateAnimeEntryStatusFormProps) {
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
    dispatch({ kind: 'authoritative_status', status: currentStatus })
  }, [currentStatus])

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
  const feedbackIsAlert =
    feedback === null ? false : isAlertFeedbackTone(feedback.tone)
  const isSaveDisabled =
    isPending || formState.selectedStatus === formState.authoritativeStatus
  const saveLabel = isPending ? 'Saving…' : 'Save status'

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
              className={secondaryButtonClassName}
              disabled={isPending}
              onClick={() => dispatch({ kind: 'open' })}
              ref={editButtonRef}
              type="button"
              aria-label={`Edit status — ${animeTitle}`}
            >
              Edit status
            </button>
          ) : null}
        </>
      ) : (
        <form
          aria-busy={isPending}
          aria-label={`Update status for ${animeTitle}`}
          className="space-y-2"
          onSubmit={async (event) => {
            event.preventDefault()
            const result = await onSubmit(new FormData(event.currentTarget))
            if (result !== null) dispatch({ kind: 'action_result', result })
          }}
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
              className={primaryButtonClassName}
              disabled={isSaveDisabled}
              type="submit"
              aria-label={`${saveLabel} — ${animeTitle}`}
            >
              {saveLabel}
            </button>
            <button
              className={tertiaryButtonClassName}
              disabled={isPending}
              onClick={() => dispatch({ kind: 'cancel' })}
              type="button"
              aria-label={`Cancel status edit — ${animeTitle}`}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {feedback === null ? null : (
        <p
          aria-live={feedbackIsAlert ? undefined : 'polite'}
          className={`${getFeedbackNoticeClassName(feedback.tone)} text-sm`}
          id={feedbackId}
          ref={feedbackRef}
          role={feedbackIsAlert ? 'alert' : 'status'}
          tabIndex={-1}
        >
          {feedback.message}
        </p>
      )}
    </div>
  )
}

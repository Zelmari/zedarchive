'use client'

import { useFormStatus } from 'react-dom'
import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
} from 'react'
import { addAnimeEntry } from '@/features/archive/actions/add-anime-entry'
import { initialAddAnimeEntryActionState } from '@/features/archive/domain/add-anime-entry'
import { getEntryStatusDisplayLabel } from '@/features/archive/domain/entry-status-display'
import { entryStatusValues } from '@/features/archive/domain/entry-status'
import { getAddAnimeEntryFormFeedback } from '@/features/archive/components/add-anime-entry-form-state'
import { getAddAnimeEntryStatusValidationError } from '@/features/archive/components/add-anime-entry-form-validation'

export { getAddAnimeEntryFormFeedback } from '@/features/archive/components/add-anime-entry-form-state'

type AddAnimeEntryFormProps = {
  catalogueItemId: string
  animeTitle: string
}

function AddAnimeEntrySubmitButton({ animeTitle }: { animeTitle: string }) {
  const { pending } = useFormStatus()
  const label = pending ? 'Adding…' : 'Add to archive'

  return (
    <button
      className="za-button za-button--primary w-full"
      disabled={pending}
      type="submit"
      aria-label={`${label} — ${animeTitle}`}
    >
      {label}
    </button>
  )
}

export function AddAnimeEntryForm({
  catalogueItemId,
  animeTitle,
}: AddAnimeEntryFormProps) {
  const [state, formAction, isPending] = useActionState(
    addAnimeEntry,
    initialAddAnimeEntryActionState,
  )
  const statusId = useId()
  const feedbackId = useId()
  const alertRef = useRef<HTMLParagraphElement>(null)
  const formContainerRef = useRef<HTMLDivElement>(null)
  const resultRef = useRef<HTMLParagraphElement>(null)
  const [status, setStatus] = useState('')
  const [clientStatusError, setClientStatusError] = useState<string | null>(
    null,
  )
  const [isServerStatusErrorDismissed, setIsServerStatusErrorDismissed] =
    useState(false)
  const feedback = getAddAnimeEntryFormFeedback(state)
  const isSaved = state.kind === 'created' || state.kind === 'already_exists'
  const serverStatusError =
    feedback?.selectError && !isServerStatusErrorDismissed
      ? feedback.message
      : null
  const statusError = clientStatusError ?? serverStatusError
  const shouldShowFeedback =
    statusError !== null ||
    (feedback?.tone === 'error' && feedback.selectError === false)

  useEffect(() => {
    if (isSaved) {
      resultRef.current?.focus()
    } else if (statusError !== null || state.kind !== 'idle') {
      alertRef.current?.focus()
    }
  }, [isSaved, state.kind, statusError])

  useEffect(() => {
    if (statusError === null) {
      return
    }

    function clearStatusErrorOnOutsidePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !formContainerRef.current?.contains(event.target)
      ) {
        setClientStatusError(null)
        setIsServerStatusErrorDismissed(true)
      }
    }

    document.addEventListener(
      'pointerdown',
      clearStatusErrorOnOutsidePointerDown,
    )

    return () => {
      document.removeEventListener(
        'pointerdown',
        clearStatusErrorOnOutsidePointerDown,
      )
    }
  }, [statusError])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (isPending) {
      event.preventDefault()
      return
    }

    const validationError = getAddAnimeEntryStatusValidationError(status)

    if (validationError !== null) {
      event.preventDefault()
      setIsServerStatusErrorDismissed(false)
      setClientStatusError(validationError)
      return
    }

    setClientStatusError(null)
  }

  function handleStatusChange(nextStatus: string) {
    setStatus(nextStatus)

    if (nextStatus !== '') {
      setClientStatusError(null)
      setIsServerStatusErrorDismissed(true)
    }
  }

  function handleFormBlur(event: FocusEvent<HTMLDivElement>) {
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    ) {
      return
    }

    setClientStatusError(null)
    setIsServerStatusErrorDismissed(true)
  }

  return (
    <div className="space-y-2" onBlur={handleFormBlur} ref={formContainerRef}>
      {isSaved ? (
        <p className="za-catalogue-card__saved">
          In your archive — {getEntryStatusDisplayLabel(state.status)}
        </p>
      ) : (
        <form
          action={formAction}
          aria-busy={isPending}
          aria-label={`Add ${animeTitle} to your archive`}
          className="space-y-2"
          noValidate
          onSubmit={handleSubmit}
        >
          <input name="catalogueItemId" type="hidden" value={catalogueItemId} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor={statusId}>
              Status
            </label>
            <select
              aria-describedby={statusError ? feedbackId : undefined}
              aria-invalid={statusError ? true : undefined}
              className="za-select"
              disabled={isPending}
              id={statusId}
              name="status"
              onChange={(event) => handleStatusChange(event.target.value)}
              required
              value={status}
            >
              <option disabled value="">
                Choose a status
              </option>
              {entryStatusValues.map((status) => (
                <option key={status} value={status}>
                  {getEntryStatusDisplayLabel(status)}
                </option>
              ))}
            </select>
          </div>
          <AddAnimeEntrySubmitButton animeTitle={animeTitle} />
          {shouldShowFeedback ? (
            <p
              className="text-sm text-destructive"
              id={feedbackId}
              ref={alertRef}
              role="alert"
              tabIndex={-1}
            >
              {state.kind === 'sign_in_required' ? (
                <>
                  <a className="za-link" href="/sign-in">
                    Sign in
                  </a>{' '}
                  to add anime to your archive.
                </>
              ) : (
                (statusError ?? feedback?.message)
              )}
            </p>
          ) : null}
        </form>
      )}
      <p aria-live="polite" ref={resultRef} role="status" tabIndex={-1}>
        {isSaved ? feedback?.message : ''}
      </p>
    </div>
  )
}

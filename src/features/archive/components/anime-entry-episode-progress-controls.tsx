'use client'

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import type { RefObject } from 'react'
import {
  getPersonalTotalEditorInitialValue,
  getProgressSaveInput,
  getTotalSaveInput,
  parseEpisodeProgressControlInput,
  parseEpisodeTotalControlInput,
  reconcileProgressEditorValue,
  reconcileTotalEditorValue,
  shouldOfferCompletionFromMutation,
} from '@/features/archive/components/anime-entry-episode-progress-controls-state'
import { getEntryStatusDisplayLabel } from '@/features/archive/domain/entry-status-display'
import { getEffectiveEpisodeTotal } from '@/features/archive/domain/episode-total'
import { episodeTotalNoneSentinel } from '@/features/archive/domain/update-anime-entry-episode-total'
import type { UpdateAnimeEntryEpisodeProgressActionState } from '@/features/archive/domain/update-anime-entry-episode-progress'
import type { UpdateAnimeEntryEpisodeTotalActionState } from '@/features/archive/domain/update-anime-entry-episode-total'
import type { UpdateAnimeEntryStatusActionState } from '@/features/archive/domain/update-anime-entry-status'
import type { EntryStatus } from '@/features/archive/domain/entry-status'

const subscribeToHydration = () => () => undefined

const fieldClassName =
  'rounded border border-gray-300 px-3 py-2 aria-invalid:border-red-600 aria-invalid:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500'

const buttonClassName =
  'rounded border border-gray-300 bg-white px-3 py-2 transition-colors hover:bg-gray-100 active:bg-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 disabled:opacity-70'

type Props = {
  entryId: string
  progress: number
  catalogueTotal: number | null
  personalTotal: number | null
  status: EntryStatus
  isPending: boolean
  onProgressSubmit: (
    formData: FormData,
    operation: 'progress' | 'reset',
  ) => Promise<UpdateAnimeEntryEpisodeProgressActionState | null>
  onTotalSubmit: (
    formData: FormData,
  ) => Promise<UpdateAnimeEntryEpisodeTotalActionState | null>
  onStatusSubmit: (
    formData: FormData,
  ) => Promise<UpdateAnimeEntryStatusActionState | null>
}

function episodeLabel(value: number) {
  return `${value} ${value === 1 ? 'episode' : 'episodes'}`
}

function getProgressFeedback(
  result: UpdateAnimeEntryEpisodeProgressActionState,
  reset: boolean,
): string {
  switch (result.kind) {
    case 'updated':
      return reset
        ? 'Progress reset.'
        : `Progress updated to ${episodeLabel(result.progress)}.`
    case 'unchanged':
      return `Progress is already ${episodeLabel(result.progress)}.`
    case 'invalid_progress':
      return 'Enter a whole number of episodes, 0 or more.'
    case 'conflict':
      return `This progress changed elsewhere. It is now ${episodeLabel(result.currentProgress)}. Review your entry and try again.`
    case 'sign_in_required':
      return 'Your session has expired. Sign in and try again.'
    case 'unavailable':
      return 'This archive entry is no longer available. Refresh your archive.'
    default:
      return 'We couldn’t update this progress right now. Try again.'
  }
}

export function getTotalFeedback(
  result: UpdateAnimeEntryEpisodeTotalActionState,
): string {
  switch (result.kind) {
    case 'updated':
    case 'unchanged':
      return result.personalTotal === null
        ? result.catalogueTotal === null
          ? 'Your personal total was removed. The catalogue total is unknown.'
          : `Using the catalogue total of ${episodeLabel(result.catalogueTotal)}.`
        : `Your personal total is now ${episodeLabel(result.personalTotal)}.`
    case 'invalid_total':
      return 'Enter a whole personal total of at least 1 episode.'
    case 'conflict':
      return result.currentPersonalTotal === null
        ? 'This personal total changed elsewhere. It is now not set. Review your entry and try again.'
        : `This personal total changed elsewhere. It is now ${episodeLabel(result.currentPersonalTotal)}. Review your entry and try again.`
    case 'sign_in_required':
      return 'Your session has expired. Sign in and try again.'
    case 'unavailable':
      return 'This archive entry is no longer available. Refresh your archive.'
    default:
      return 'We couldn’t update this personal total right now. Try again.'
  }
}

export function AnimeEntryEpisodeProgressControls({
  entryId,
  progress,
  catalogueTotal,
  personalTotal,
  status,
  isPending,
  onProgressSubmit,
  onTotalSubmit,
  onStatusSubmit,
}: Props) {
  const [mode, setMode] = useState<'read' | 'progress' | 'total' | 'reset'>(
    'read',
  )
  const [value, setValue] = useState(String(progress))
  const [totalValue, setTotalValue] = useState(
    getPersonalTotalEditorInitialValue(personalTotal, catalogueTotal),
  )
  const [message, setMessage] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState(false)
  const [completionOffered, setCompletionOffered] = useState(false)
  const [completionFeedbackTone, setCompletionFeedbackTone] = useState<
    'error' | 'status' | null
  >(null)
  const [pendingCommand, setPendingCommand] = useState<
    'progress' | 'total' | 'clear_total' | 'reset' | 'completion' | null
  >(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const totalInputRef = useRef<HTMLInputElement>(null)
  const editProgressButtonRef = useRef<HTMLButtonElement>(null)
  const totalButtonRef = useRef<HTMLButtonElement>(null)
  const resetProgressButtonRef = useRef<HTMLButtonElement>(null)
  const resetConfirmButtonRef = useRef<HTMLButtonElement>(null)
  const completionRef = useRef<HTMLDivElement>(null)
  const feedbackRef = useRef<HTMLParagraphElement>(null)
  const progressInputId = useId()
  const totalInputId = useId()
  const feedbackId = useId()
  const hasHydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  )
  const total = getEffectiveEpisodeTotal(catalogueTotal, personalTotal)
  const isSavingProgress = isPending && pendingCommand === 'progress'
  const isSavingTotal = isPending && pendingCommand === 'total'
  const isClearingTotal = isPending && pendingCommand === 'clear_total'
  const isResettingProgress = isPending && pendingCommand === 'reset'
  const isCompleting = isPending && pendingCommand === 'completion'

  useEffect(() => {
    if (completionFeedbackTone === 'error' && message !== null) {
      feedbackRef.current?.focus()
    } else if (completionOffered) {
      completionRef.current?.focus()
    } else if (message !== null) {
      feedbackRef.current?.focus()
    }
  }, [completionFeedbackTone, completionOffered, message])

  function clearFieldFeedback() {
    setMessage(null)
    setFieldError(false)
    setCompletionFeedbackTone(null)
  }

  function focusAfterRender(target: RefObject<HTMLElement | null>) {
    setTimeout(() => target.current?.focus())
  }

  function shouldOfferCompletionAfter(
    nextStatus: EntryStatus,
    nextProgress: number,
    nextTotal: number | null,
  ) {
    return shouldOfferCompletionFromMutation(
      nextStatus,
      nextProgress,
      nextTotal,
      null,
    )
  }

  async function submitProgress(requested: number, reset = false) {
    setPendingCommand(reset ? 'reset' : 'progress')
    const form = new FormData()
    form.set('entryId', entryId)
    form.set('expectedEpisodeProgress', String(progress))
    form.set('requestedEpisodeProgress', String(requested))
    const result = await onProgressSubmit(form, reset ? 'reset' : 'progress')
    if (result === null) {
      setPendingCommand(null)
      return
    }

    if (result.kind === 'updated' || result.kind === 'unchanged') {
      setMode('read')
      setCompletionOffered(
        shouldOfferCompletionAfter(
          result.status,
          result.progress,
          result.personalTotal ?? result.catalogueTotal,
        ),
      )
    }
    setValue(reconcileProgressEditorValue(value, result))
    setFieldError(result.kind !== 'updated' && result.kind !== 'unchanged')
    setCompletionFeedbackTone(null)
    setMessage(getProgressFeedback(result, reset))
    setPendingCommand(null)
  }

  async function submitTotal(
    requested: string,
    command: 'total' | 'clear_total' = 'total',
  ) {
    setPendingCommand(command)
    const form = new FormData()
    form.set('entryId', entryId)
    form.set(
      'expectedEpisodeTotalOverride',
      personalTotal === null ? episodeTotalNoneSentinel : String(personalTotal),
    )
    form.set('requestedEpisodeTotalOverride', requested)
    const result = await onTotalSubmit(form)
    if (result === null) {
      setPendingCommand(null)
      return
    }

    if (result.kind === 'updated' || result.kind === 'unchanged') {
      setMode('read')
      setCompletionOffered(
        shouldOfferCompletionAfter(
          result.status,
          result.progress,
          result.personalTotal ?? result.catalogueTotal,
        ),
      )
    }
    setTotalValue(reconcileTotalEditorValue(totalValue, result))
    setFieldError(result.kind !== 'updated' && result.kind !== 'unchanged')
    setCompletionFeedbackTone(null)
    setMessage(getTotalFeedback(result))
    setPendingCommand(null)
  }

  async function markCompleted() {
    setPendingCommand('completion')
    const form = new FormData()
    form.set('entryId', entryId)
    form.set('expectedStatus', status)
    form.set('requestedStatus', 'completed')
    const result = await onStatusSubmit(form)
    if (result === null) {
      setPendingCommand(null)
      return
    }

    if (result.kind === 'updated' || result.kind === 'unchanged') {
      setCompletionOffered(false)
      setCompletionFeedbackTone('status')
      setMessage(
        `Progress updated to ${episodeLabel(progress)}. Status updated to ${getEntryStatusDisplayLabel(result.status)}.`,
      )
      setPendingCommand(null)
      return
    }
    if (result.kind === 'conflict' && result.currentStatus === 'completed') {
      setCompletionOffered(false)
      setCompletionFeedbackTone('status')
      setMessage(
        `Status is already ${getEntryStatusDisplayLabel(result.currentStatus)}.`,
      )
      setPendingCommand(null)
      return
    }
    setCompletionFeedbackTone('error')
    setMessage(
      result.kind === 'conflict'
        ? `This status changed elsewhere. It is now ${getEntryStatusDisplayLabel(result.currentStatus)}. Review your entry and try again.`
        : result.kind === 'sign_in_required'
          ? 'Your session has expired. Sign in and try again.'
          : result.kind === 'unavailable'
            ? 'This archive entry is no longer available. Refresh your archive.'
            : 'We couldn’t update this status right now. Try again.',
    )
    setPendingCommand(null)
  }

  if (!hasHydrated)
    return (
      <div className="space-y-2">
        <p>Progress — {episodeLabel(progress)}</p>
        <p>
          Total —{' '}
          {total === null
            ? 'Unknown'
            : `${episodeLabel(total)}${personalTotal === null ? '' : ' (your total)'}`}
        </p>
      </div>
    )

  if (mode === 'read')
    return (
      <div className="space-y-2">
        <p>Progress — {episodeLabel(progress)}</p>
        <p>
          Total —{' '}
          {total === null
            ? 'Unknown'
            : `${episodeLabel(total)}${personalTotal === null ? '' : ' (your total)'}`}
        </p>
        <button
          className={buttonClassName}
          disabled={isPending}
          onClick={() => {
            clearFieldFeedback()
            setMode('progress')
            focusAfterRender(inputRef)
          }}
          ref={editProgressButtonRef}
          type="button"
        >
          Edit progress
        </button>
        {message === null ? null : (
          <p
            aria-live={
              completionFeedbackTone === 'error' ? undefined : 'polite'
            }
            ref={feedbackRef}
            role={completionFeedbackTone === 'error' ? 'alert' : 'status'}
            tabIndex={-1}
          >
            {message}
          </p>
        )}
        {completionOffered && status !== 'completed' ? (
          <div ref={completionRef} role="alert" tabIndex={-1}>
            <p>
              You’ve reached the total of {episodeLabel(total ?? 0)}. Mark this
              entry as Completed?
            </p>
            <button
              className={buttonClassName}
              disabled={isPending}
              onClick={markCompleted}
              type="button"
            >
              {isCompleting ? 'Marking completed…' : 'Mark completed'}
            </button>
            <button
              className={buttonClassName}
              disabled={isPending}
              onClick={() => {
                setCompletionOffered(false)
                setCompletionFeedbackTone('status')
                setMessage(
                  `Progress updated to ${episodeLabel(progress)}. Status remains ${getEntryStatusDisplayLabel(status)}.`,
                )
              }}
              type="button"
            >
              Keep current status
            </button>
          </div>
        ) : null}
      </div>
    )

  if (mode === 'reset')
    return (
      <div className="space-y-2">
        <p role="alert">
          Reset progress to 0 episodes? Your personal total and status will stay
          the same.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className={buttonClassName}
            disabled={isPending}
            onClick={() => submitProgress(0, true)}
            ref={resetConfirmButtonRef}
            type="button"
          >
            {isResettingProgress ? 'Resetting progress…' : 'Reset progress'}
          </button>
          <button
            className={buttonClassName}
            disabled={isPending}
            onClick={() => {
              clearFieldFeedback()
              setMode('progress')
              focusAfterRender(resetProgressButtonRef)
            }}
            type="button"
          >
            Cancel
          </button>
        </div>
        {message === null ? null : (
          <p ref={feedbackRef} role="alert" tabIndex={-1}>
            {message}
          </p>
        )}
      </div>
    )

  if (mode === 'total')
    return (
      <form
        aria-busy={isPending}
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault()
          const requested = getTotalSaveInput(totalValue, personalTotal)
          if (requested === null) {
            if (parseEpisodeTotalControlInput(totalValue) === null) {
              setFieldError(true)
              setMessage('Enter a whole personal total of at least 1 episode.')
            }
            return
          }
          void submitTotal(String(requested))
        }}
      >
        <label>
          Personal episode total
          <input
            aria-describedby={fieldError ? feedbackId : undefined}
            aria-invalid={fieldError ? true : undefined}
            className={fieldClassName}
            disabled={isPending}
            id={totalInputId}
            inputMode="numeric"
            min="1"
            name="requestedEpisodeTotalOverride"
            onChange={(event) => {
              setTotalValue(event.target.value)
              clearFieldFeedback()
            }}
            ref={totalInputRef}
            step="1"
            type="number"
            value={totalValue}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            className={buttonClassName}
            disabled={
              isPending || getTotalSaveInput(totalValue, personalTotal) === null
            }
            type="submit"
          >
            {isSavingTotal ? 'Saving personal total…' : 'Save personal total'}
          </button>
          {personalTotal === null ? null : (
            <button
              className={buttonClassName}
              disabled={isPending}
              onClick={() =>
                void submitTotal(episodeTotalNoneSentinel, 'clear_total')
              }
              type="button"
            >
              {isClearingTotal
                ? catalogueTotal === null
                  ? 'Removing personal total…'
                  : 'Using catalogue total…'
                : catalogueTotal === null
                  ? 'Remove personal total'
                  : 'Use catalogue total'}
            </button>
          )}
          <button
            className={buttonClassName}
            disabled={isPending}
            onClick={() => {
              clearFieldFeedback()
              setMode('progress')
              focusAfterRender(totalButtonRef)
            }}
            type="button"
          >
            Cancel
          </button>
        </div>
        {message === null ? null : (
          <p id={feedbackId} ref={feedbackRef} role="alert" tabIndex={-1}>
            {message}
          </p>
        )}
      </form>
    )

  return (
    <div className="space-y-2">
      <form
        aria-busy={isPending}
        onSubmit={(event) => {
          event.preventDefault()
          const requested = getProgressSaveInput(value, progress)
          if (requested === null) {
            if (parseEpisodeProgressControlInput(value) === null) {
              setFieldError(true)
              setMessage('Enter a whole number of episodes, 0 or more.')
            }
            return
          }
          void submitProgress(requested)
        }}
      >
        <label>
          Episodes watched
          <input
            aria-describedby={fieldError ? feedbackId : undefined}
            aria-invalid={fieldError ? true : undefined}
            className={fieldClassName}
            disabled={isPending}
            id={progressInputId}
            inputMode="numeric"
            min="0"
            onChange={(event) => {
              setValue(event.target.value)
              clearFieldFeedback()
            }}
            ref={inputRef}
            step="1"
            type="number"
            value={value}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            className={buttonClassName}
            disabled={
              isPending || getProgressSaveInput(value, progress) === null
            }
            type="submit"
          >
            {isSavingProgress ? 'Saving progress…' : 'Save progress'}
          </button>
          <button
            className={buttonClassName}
            disabled={isPending}
            onClick={() => {
              clearFieldFeedback()
              setMode('read')
              focusAfterRender(editProgressButtonRef)
            }}
            type="button"
          >
            Cancel
          </button>
        </div>
      </form>
      <button
        className={buttonClassName}
        disabled={isPending}
        onClick={() => {
          clearFieldFeedback()
          setTotalValue(
            getPersonalTotalEditorInitialValue(personalTotal, catalogueTotal),
          )
          setMode('total')
          focusAfterRender(totalInputRef)
        }}
        ref={totalButtonRef}
        type="button"
      >
        {personalTotal === null
          ? 'Set personal total'
          : 'Change personal total'}
      </button>
      {progress > 0 ? (
        <button
          className={buttonClassName}
          disabled={isPending}
          onClick={() => {
            clearFieldFeedback()
            setMode('reset')
            focusAfterRender(resetConfirmButtonRef)
          }}
          ref={resetProgressButtonRef}
          type="button"
        >
          Reset progress
        </button>
      ) : null}
      {message === null ? null : (
        <p id={feedbackId} ref={feedbackRef} role="alert" tabIndex={-1}>
          {message}
        </p>
      )}
    </div>
  )
}

'use client'

import {
  useEffect,
  useId,
  useReducer,
  useRef,
  useSyncExternalStore,
  type FormEvent,
  type SyntheticEvent,
} from 'react'
import {
  animeEntryRemovalControlReducer,
  createInitialAnimeEntryRemovalControlState,
  type AnimeEntryRemovalControlEvent,
} from '@/features/archive/components/anime-entry-removal-control-state'
import type { RemoveAnimeEntryActionState } from '@/features/archive/domain/remove-anime-entry'

const buttonClassName = 'za-button za-button--secondary'

const destructiveButtonClassName = 'za-button za-button--destructive'
const destructiveOutlineButtonClassName =
  'za-button za-button--destructive-outline'

const subscribeToHydration = () => () => undefined

type AnimeEntryRemovalControlProps = {
  animeTitle: string
  entryId: string
  isOwnOperationPending: boolean
  isPending: boolean
  onRemoved: () => void
  onSubmit: (formData: FormData) => Promise<RemoveAnimeEntryActionState | null>
}

export function publishAnimeEntryRemoval({
  closeDialog,
  dispatch,
  onRemoved,
}: {
  closeDialog: () => void
  dispatch: (event: AnimeEntryRemovalControlEvent) => void
  onRemoved: () => void
}) {
  closeDialog()
  dispatch({ kind: 'removed' })
  onRemoved()
}

export function AnimeEntryRemovalControl({
  animeTitle,
  entryId,
  isOwnOperationPending,
  isPending,
  onRemoved,
  onSubmit,
}: AnimeEntryRemovalControlProps) {
  const [state, dispatch] = useReducer(
    animeEntryRemovalControlReducer,
    undefined,
    createInitialAnimeEntryRemovalControlState,
  )
  const hasHydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  )
  const headingId = useId()
  const descriptionId = useId()
  const feedbackId = useId()
  const launcherRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const feedbackRef = useRef<HTMLParagraphElement>(null)
  const handledFocusVersionRef = useRef(0)
  const hasPublishedRemovalRef = useRef(false)
  const isSubmittingRef = useRef(false)

  useEffect(() => {
    if (state.mode === 'open' && !dialogRef.current?.open) {
      dialogRef.current?.showModal()
    }
  }, [state.mode])

  useEffect(() => {
    if (state.focusVersion === handledFocusVersionRef.current) return

    handledFocusVersionRef.current = state.focusVersion
    switch (state.focusTarget) {
      case 'cancel':
        cancelRef.current?.focus()
        break
      case 'feedback':
        feedbackRef.current?.focus()
        break
      case 'launcher':
        launcherRef.current?.focus()
        break
      case null:
        break
    }
  }, [state.focusTarget, state.focusVersion])

  if (!hasHydrated) return null

  function cancelRemoval() {
    if (isPending || isSubmittingRef.current) return

    dialogRef.current?.close()
    dispatch({ kind: 'cancel' })
  }

  function handleDialogCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault()
    cancelRemoval()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      isPending ||
      isSubmittingRef.current ||
      hasPublishedRemovalRef.current
    ) {
      return
    }

    isSubmittingRef.current = true
    const result = await onSubmit(new FormData(event.currentTarget))
    if (result === null) {
      isSubmittingRef.current = false
      return
    }

    if (result.kind === 'removed') {
      hasPublishedRemovalRef.current = true
      publishAnimeEntryRemoval({
        closeDialog: () => dialogRef.current?.close(),
        dispatch,
        onRemoved,
      })
      return
    }

    isSubmittingRef.current = false
    if (result.kind !== 'idle') {
      dispatch({ kind: 'action_result', result: { kind: result.kind } })
    }
  }

  return (
    <div>
      <button
        className={destructiveOutlineButtonClassName}
        disabled={isPending}
        onClick={() => {
          hasPublishedRemovalRef.current = false
          isSubmittingRef.current = false
          dispatch({ kind: 'open' })
        }}
        ref={launcherRef}
        type="button"
      >
        Remove from archive
      </button>
      <dialog
        aria-busy={isOwnOperationPending}
        aria-describedby={descriptionId}
        aria-labelledby={headingId}
        className="za-dialog"
        onCancel={handleDialogCancel}
        ref={dialogRef}
      >
        <form
          aria-busy={isOwnOperationPending}
          className="space-y-4"
          onSubmit={handleSubmit}
        >
          <input name="entryId" type="hidden" value={entryId} />
          <div className="space-y-2">
            <h3 className="text-lg font-semibold" id={headingId}>
              Remove {animeTitle} from your archive?
            </h3>
            <p id={descriptionId}>
              Removing this entry permanently deletes its status, episode
              progress, personal episode total, rating, favourite, and viewing
              dates. This can’t be undone. The shared catalogue anime will
              remain.
            </p>
          </div>
          {state.feedback === null ? null : (
            <p
              className="za-notice za-notice--error text-sm"
              id={feedbackId}
              ref={feedbackRef}
              role="alert"
              tabIndex={-1}
            >
              {state.feedback.message}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              className={buttonClassName}
              disabled={isPending}
              onClick={cancelRemoval}
              ref={cancelRef}
              type="button"
            >
              Cancel
            </button>
            <button
              className={destructiveButtonClassName}
              disabled={isPending}
              type="submit"
            >
              {isOwnOperationPending ? 'Removing…' : 'Remove from archive'}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  )
}

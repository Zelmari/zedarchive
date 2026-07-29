'use client'

import { useFormStatus } from 'react-dom'
import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type RefObject,
} from 'react'
import { disableAdultContent } from '@/features/settings/actions/disable-adult-content'
import { enableAdultContent } from '@/features/settings/actions/enable-adult-content'
import { setAnimeTitleLanguage } from '@/features/settings/actions/set-anime-title-language'
import {
  getAdultVisibilityFeedback,
  getTitleLanguageFeedback,
  missingAdultConfirmationMessage,
  type CataloguePreferenceFeedback,
} from '@/features/settings/components/catalogue-preferences-form-state'
import {
  animeTitleLanguageValues,
  initialCataloguePreferenceActionState,
  type AnimeTitleLanguage,
  type UserCataloguePreferences,
} from '@/features/settings/domain/catalogue-preferences'
import {
  getFeedbackNoticeClassName,
  isAlertFeedbackTone,
} from '@/features/feedback/feedback-presentation'

const buttonClassName = 'za-button za-button--primary'

const languageLabels = {
  english: 'English (default)',
  romaji: 'Romaji',
  original: 'Original',
} as const satisfies Record<AnimeTitleLanguage, string>

const subscribeToHydration = () => () => undefined
const getHydratedSnapshot = () => true
const getServerHydrationSnapshot = () => false

function Feedback({
  feedback,
  id,
  feedbackRef,
}: {
  feedback: CataloguePreferenceFeedback | null
  id?: string
  feedbackRef: RefObject<HTMLParagraphElement | null>
}) {
  const feedbackIsAlert =
    feedback === null ? false : isAlertFeedbackTone(feedback.tone)

  return (
    <p
      aria-live={feedbackIsAlert ? undefined : 'polite'}
      className={
        feedback === null
          ? undefined
          : `${getFeedbackNoticeClassName(feedback.tone)} text-sm`
      }
      id={id}
      ref={feedbackRef}
      role={feedbackIsAlert ? 'alert' : 'status'}
      tabIndex={-1}
    >
      {feedback?.message ?? ''}
    </p>
  )
}

function SubmitButton({
  idleLabel,
  pendingLabel,
}: {
  idleLabel: string
  pendingLabel: string
}) {
  const { pending } = useFormStatus()

  return (
    <button className={buttonClassName} disabled={pending} type="submit">
      {pending ? pendingLabel : idleLabel}
    </button>
  )
}

export function AnimeTitleLanguageForm({
  titleLanguage,
}: {
  titleLanguage: AnimeTitleLanguage
}) {
  const [state, formAction, isPending] = useActionState(
    setAnimeTitleLanguage,
    initialCataloguePreferenceActionState,
  )
  const feedback = getTitleLanguageFeedback(state)
  const feedbackRef = useRef<HTMLParagraphElement>(null)
  const feedbackId = useId()

  useEffect(() => {
    if (state.kind !== 'idle') feedbackRef.current?.focus()
  }, [state])

  return (
    <form action={formAction} aria-busy={isPending} className="space-y-4">
      <fieldset
        aria-describedby={feedback?.tone === 'error' ? feedbackId : undefined}
        className="space-y-2"
        disabled={isPending}
      >
        <legend className="font-semibold">Anime title language</legend>
        <p className="text-sm text-ink-muted">
          Choose which primary title zedarchive shows first. If it is
          unavailable, another primary title will be used.
        </p>
        {animeTitleLanguageValues.map((language) => (
          <label className="flex items-center gap-2" key={language}>
            <input
              defaultChecked={language === titleLanguage}
              name="titleLanguage"
              required
              type="radio"
              value={language}
            />
            <span>{languageLabels[language]}</span>
          </label>
        ))}
      </fieldset>
      <SubmitButton idleLabel="Save title language" pendingLabel="Saving…" />
      <Feedback feedback={feedback} feedbackRef={feedbackRef} id={feedbackId} />
    </form>
  )
}

export function AdultVisibilityForm({
  adultContentEnabled,
}: {
  adultContentEnabled: boolean
}) {
  const [enableState, enableAction, enablePending] = useActionState(
    enableAdultContent,
    initialCataloguePreferenceActionState,
  )
  const [disableState, disableAction, disablePending] = useActionState(
    disableAdultContent,
    initialCataloguePreferenceActionState,
  )
  const [lastOperation, setLastOperation] = useState<
    'disable' | 'enable' | null
  >(null)
  const hasHydrated = useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerHydrationSnapshot,
  )
  const [clientError, setClientError] = useState<string | null>(null)
  const [hasEditedConfirmation, setHasEditedConfirmation] = useState(false)
  const feedbackRef = useRef<HTMLParagraphElement>(null)
  const feedbackId = useId()
  const activeActionState =
    lastOperation === 'disable' ? disableState : enableState
  const actionFeedback =
    lastOperation === null
      ? null
      : getAdultVisibilityFeedback(activeActionState, lastOperation)
  const serverConfirmationError =
    lastOperation === 'enable' &&
    enableState.kind === 'invalid' &&
    !hasEditedConfirmation
      ? missingAdultConfirmationMessage
      : null
  const confirmationError = clientError ?? serverConfirmationError
  const visibleActionFeedback =
    lastOperation === 'enable' &&
    enableState.kind === 'invalid' &&
    hasEditedConfirmation
      ? null
      : actionFeedback
  const feedback =
    confirmationError !== null
      ? { tone: 'error' as const, message: confirmationError }
      : visibleActionFeedback
  const feedbackMessage = feedback?.message

  useEffect(() => {
    if (feedbackMessage !== undefined) feedbackRef.current?.focus()
  }, [feedbackMessage])

  return (
    <>
      {adultContentEnabled ? (
        <DisableAdultContentForm
          formAction={disableAction}
          isPending={disablePending}
          onSubmit={() => {
            setClientError(null)
            setLastOperation('disable')
          }}
        />
      ) : (
        <EnableAdultContentForm
          confirmationError={confirmationError}
          feedbackId={feedbackId}
          formAction={enableAction}
          hasHydrated={hasHydrated}
          isPending={enablePending}
          onConfirmationChange={(checked) => {
            setClientError(null)
            setHasEditedConfirmation(checked)
          }}
          onInvalidConfirmation={() => {
            setHasEditedConfirmation(false)
            setClientError(missingAdultConfirmationMessage)
            setLastOperation('enable')
          }}
          onSubmit={() => setLastOperation('enable')}
        />
      )}
      <Feedback feedback={feedback} feedbackRef={feedbackRef} id={feedbackId} />
    </>
  )
}

function EnableAdultContentForm({
  confirmationError,
  feedbackId,
  formAction,
  hasHydrated,
  isPending,
  onConfirmationChange,
  onInvalidConfirmation,
  onSubmit,
}: {
  confirmationError: string | null
  feedbackId: string
  formAction: (payload: FormData) => void
  hasHydrated: boolean
  isPending: boolean
  onConfirmationChange: (checked: boolean) => void
  onInvalidConfirmation: () => void
  onSubmit: () => void
}) {
  const checkboxRef = useRef<HTMLInputElement>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (isPending) {
      event.preventDefault()
      return
    }

    if (!checkboxRef.current?.checked) {
      event.preventDefault()
      onInvalidConfirmation()
      return
    }

    onSubmit()
  }

  return (
    <form
      action={formAction}
      aria-busy={isPending}
      className="space-y-4"
      noValidate={hasHydrated}
      onSubmit={handleSubmit}
    >
      <p>
        Adult content is hidden by default. Showing it reveals anime and archive
        details classified as adult by zedarchive.
      </p>
      <label className="flex items-start gap-2">
        <input
          aria-describedby={confirmationError ? feedbackId : undefined}
          aria-invalid={confirmationError ? true : undefined}
          disabled={isPending}
          name="confirmation"
          onChange={(event) => {
            onConfirmationChange(event.currentTarget.checked)
          }}
          ref={checkboxRef}
          required
          type="checkbox"
          value="at-least-18"
        />
        <span>
          I confirm that I am at least 18 years old and want to show adult
          content.
        </span>
      </label>
      <SubmitButton idleLabel="Show adult content" pendingLabel="Showing…" />
    </form>
  )
}

function DisableAdultContentForm({
  formAction,
  isPending,
  onSubmit,
}: {
  formAction: (payload: FormData) => void
  isPending: boolean
  onSubmit: () => void
}) {
  return (
    <form
      action={formAction}
      aria-busy={isPending}
      className="space-y-4"
      onSubmit={onSubmit}
    >
      <p>Adult content is currently shown for your account.</p>
      <SubmitButton idleLabel="Hide adult content" pendingLabel="Hiding…" />
    </form>
  )
}

export function CataloguePreferencesForms({
  preferences,
}: {
  preferences: UserCataloguePreferences
}) {
  return (
    <div className="space-y-8">
      <AnimeTitleLanguageForm titleLanguage={preferences.titleLanguage} />
      <section aria-labelledby="adult-content-heading" className="space-y-4">
        <h3 className="font-semibold" id="adult-content-heading">
          Adult content
        </h3>
        <AdultVisibilityForm
          adultContentEnabled={preferences.adultContentEnabled}
        />
      </section>
    </div>
  )
}

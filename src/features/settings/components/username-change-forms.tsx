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
import { cancelUsernameChange } from '@/features/settings/actions/cancel-username-change'
import { completeUsernameChange } from '@/features/settings/actions/complete-username-change'
import { requestUsernameChange } from '@/features/settings/actions/request-username-change'
import { resendUsernameChangeCode } from '@/features/settings/actions/resend-username-change-code'
import {
  getPersistentUsernameChangeFeedback,
  type UsernameChangeFeedback,
} from '@/features/settings/components/username-change-form-state'
import { PublicUsername } from '@/features/identity/components/public-username'
import {
  initialUsernameChangeActionState,
  type UsernameChangePageState,
} from '@/features/settings/domain/username-change'
import {
  passwordMaximumLength,
  passwordMinimumLength,
} from '@/features/auth/domain/password-policy'
import {
  usernameMaximumLength,
  usernameMinimumLength,
} from '@/features/identity/domain/username'
import {
  getFeedbackNoticeClassName,
  isAlertFeedbackTone,
} from '@/features/feedback/feedback-presentation'

const buttonClassName = 'za-button'

const fieldClassName = 'za-field'

const subscribeToHydration = () => () => undefined
const getHydratedSnapshot = () => true
const getServerHydrationSnapshot = () => false

function Feedback({
  feedback,
  feedbackRef,
  id,
}: {
  feedback: UsernameChangeFeedback | null
  feedbackRef: RefObject<HTMLParagraphElement | null>
  id: string
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
  disabled = false,
  idleLabel,
  pendingLabel,
  variant = 'primary',
}: {
  disabled?: boolean
  idleLabel: string
  pendingLabel: string
  variant?: 'primary' | 'secondary'
}) {
  const { pending } = useFormStatus()

  return (
    <button
      className={`${buttonClassName} za-button--${variant}`}
      disabled={pending || disabled}
      type="submit"
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  )
}

function useResendAvailability(
  resend: Extract<UsernameChangePageState, { kind: 'pending' }>['resend'],
) {
  const [previousResend, setPreviousResend] = useState(resend)
  const [isAvailable, setIsAvailable] = useState(resend.kind === 'available')
  const [cooldownExpired, setCooldownExpired] = useState(false)

  if (resend !== previousResend) {
    setPreviousResend(resend)
    setIsAvailable(resend.kind === 'available')
    setCooldownExpired(false)
  }

  useEffect(() => {
    if (resend.kind !== 'cooldown' || isAvailable) return

    const timeout = window.setTimeout(() => {
      setIsAvailable(true)
      setCooldownExpired(true)
    }, resend.retryAfterMilliseconds)

    return () => window.clearTimeout(timeout)
  }, [isAvailable, resend])

  return { cooldownExpired, isAvailable }
}

function StartUsernameChangeForm({
  action,
  feedback,
  feedbackId,
  isPending,
  onSubmit,
  username,
}: {
  action: (formData: FormData) => void
  feedback: UsernameChangeFeedback | null
  feedbackId: string
  isPending: boolean
  onSubmit: () => void
  username: string
}) {
  const usernameId = useId()
  const passwordId = useId()

  return (
    <form
      action={action}
      aria-busy={isPending}
      className="space-y-4"
      onSubmit={onSubmit}
    >
      <p>
        Current username: <PublicUsername username={username} />
      </p>
      <p>Your username is public and can only be changed once.</p>
      <p>
        If you change it, your previous username will be unavailable for 14
        days.
      </p>
      <div className="flex flex-col gap-1">
        <label
          className="za-field-label text-sm font-medium"
          htmlFor={usernameId}
        >
          New username
        </label>
        <input
          aria-describedby={`${usernameId}-hint${feedback?.field === 'username' ? ` ${feedbackId}` : ''}`}
          aria-invalid={feedback?.field === 'username' ? true : undefined}
          autoComplete="username"
          className={fieldClassName}
          disabled={isPending}
          id={usernameId}
          maxLength={usernameMaximumLength}
          minLength={usernameMinimumLength}
          name="username"
          required
          type="text"
        />
        <p className="text-sm text-ink-muted" id={`${usernameId}-hint`}>
          {usernameMinimumLength}–{usernameMaximumLength} characters. Letters,
          numbers, hyphens, and underscores. Must start and end with a letter or
          number.
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <label
          className="za-field-label text-sm font-medium"
          htmlFor={passwordId}
        >
          Current password
        </label>
        <input
          aria-describedby={
            feedback?.field === 'password' ? feedbackId : undefined
          }
          aria-invalid={feedback?.field === 'password' ? true : undefined}
          autoComplete="current-password"
          className={fieldClassName}
          disabled={isPending}
          id={passwordId}
          maxLength={passwordMaximumLength}
          minLength={passwordMinimumLength}
          name="password"
          required
          type="password"
        />
      </div>
      <SubmitButton
        idleLabel="Send verification code"
        pendingLabel="Sending verification code…"
      />
    </form>
  )
}

function CompletionUsernameChangeForm({
  cancelAction,
  cancelPending,
  completeAction,
  completePending,
  feedback,
  feedbackId,
  isPending,
  onCancelSubmit,
  onCompleteSubmit,
  onConfirmationChange,
  onInvalidConfirmation,
  onResendSubmit,
  resend,
  resendAction,
  resendPending,
  username,
  proposedUsername,
}: {
  cancelAction: (formData: FormData) => void
  cancelPending: boolean
  completeAction: (formData: FormData) => void
  completePending: boolean
  feedback: UsernameChangeFeedback | null
  feedbackId: string
  isPending: boolean
  onCancelSubmit: () => void
  onCompleteSubmit: (event: FormEvent<HTMLFormElement>) => void
  onConfirmationChange: (checked: boolean) => void
  onInvalidConfirmation: () => void
  onResendSubmit: () => void
  resend: Extract<UsernameChangePageState, { kind: 'pending' }>['resend']
  resendAction: (formData: FormData) => void
  resendPending: boolean
  username: string
  proposedUsername: string
}) {
  const codeId = useId()
  const codeGuidanceId = useId()
  const cooldownStatusId = useId()
  const confirmationId = useId()
  const confirmationRef = useRef<HTMLInputElement>(null)
  const hasHydrated = useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerHydrationSnapshot,
  )
  const { cooldownExpired, isAvailable: resendAvailable } =
    useResendAvailability(resend)
  return (
    <div className="space-y-4">
      <p>
        You are changing <PublicUsername username={username} /> to{' '}
        <PublicUsername username={proposedUsername} />.
      </p>
      <p id={codeGuidanceId}>
        Check your verified email for an eight-digit code.
      </p>
      <p>
        Changing your username cannot be undone. Your previous username will be
        unavailable for 14 days.
      </p>
      <form
        action={completeAction}
        aria-busy={completePending}
        className="space-y-4"
        noValidate={hasHydrated}
        onSubmit={(event) => {
          if (completePending) {
            event.preventDefault()
            return
          }
          if (!confirmationRef.current?.checked) {
            event.preventDefault()
            onInvalidConfirmation()
            return
          }
          onCompleteSubmit(event)
        }}
      >
        <div className="flex flex-col gap-1">
          <label
            className="za-field-label text-sm font-medium"
            htmlFor={codeId}
          >
            Verification code
          </label>
          <input
            aria-describedby={`${codeGuidanceId}${feedback?.field === 'code' ? ` ${feedbackId}` : ''}`}
            aria-invalid={feedback?.field === 'code' ? true : undefined}
            autoComplete="one-time-code"
            className={fieldClassName}
            disabled={isPending}
            id={codeId}
            inputMode="numeric"
            maxLength={8}
            name="code"
            pattern="[0-9]{8}"
            required
            type="text"
          />
        </div>
        <label className="flex items-start gap-2" htmlFor={confirmationId}>
          <input
            aria-describedby={
              feedback?.field === 'confirmation' ? feedbackId : undefined
            }
            aria-invalid={feedback?.field === 'confirmation' ? true : undefined}
            disabled={isPending}
            id={confirmationId}
            name="confirmation"
            onChange={(event) => {
              onConfirmationChange(event.currentTarget.checked)
            }}
            ref={confirmationRef}
            required
            type="checkbox"
            value="one-time-username-change"
          />
          <span>I understand that I can only change my username once.</span>
        </label>
        <SubmitButton
          idleLabel="Change username"
          pendingLabel="Changing username…"
        />
      </form>
      <div className="flex flex-wrap gap-3">
        {resend.kind === 'restart_required' ? (
          <p className="text-sm">
            This verification code is no longer valid. Cancel it to start again.
          </p>
        ) : resend.kind === 'unavailable' ? (
          <p className="text-sm text-ink-muted">
            {resend.reason === 'send_limit'
              ? 'No more verification codes can be sent right now. Use the newest code.'
              : 'Use the newest verification code before it expires.'}
          </p>
        ) : (
          <form
            action={resendAction}
            aria-busy={resendPending}
            onSubmit={onResendSubmit}
          >
            <SubmitButton
              disabled={!resendAvailable}
              idleLabel="Send another code"
              pendingLabel="Sending another code…"
              variant="secondary"
            />
            {resend.kind === 'cooldown' && !resendAvailable ? (
              <p className="mt-2 text-sm text-ink-muted">
                You can send another code after a short wait. Refresh settings
                if JavaScript is unavailable.
              </p>
            ) : null}
            <p
              aria-live="polite"
              className="mt-2 text-sm text-ink-muted"
              id={cooldownStatusId}
              role="status"
            >
              {cooldownExpired ? 'You can request another code now.' : ''}
            </p>
          </form>
        )}
        <form
          action={cancelAction}
          aria-busy={cancelPending}
          onSubmit={onCancelSubmit}
        >
          <SubmitButton
            idleLabel="Cancel username change"
            pendingLabel="Cancelling…"
            variant="secondary"
          />
        </form>
      </div>
    </div>
  )
}

export function UsernameChangeForms({
  model,
}: {
  model: UsernameChangePageState
}) {
  const [requestState, requestAction, requestPending] = useActionState(
    requestUsernameChange,
    initialUsernameChangeActionState,
  )
  const [completeState, completeAction, completePending] = useActionState(
    completeUsernameChange,
    initialUsernameChangeActionState,
  )
  const [resendState, resendAction, resendPending] = useActionState(
    resendUsernameChangeCode,
    initialUsernameChangeActionState,
  )
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelUsernameChange,
    initialUsernameChangeActionState,
  )
  const [lastOperation, setLastOperation] = useState<
    'request' | 'complete' | 'resend' | 'cancel' | null
  >(null)
  const [confirmationError, setConfirmationError] = useState(false)
  const feedbackRef = useRef<HTMLParagraphElement>(null)
  const feedbackId = useId()
  const feedback = getPersistentUsernameChangeFeedback({
    cancelState,
    completeState,
    confirmationError,
    lastOperation,
    requestState,
    resendState,
  })

  useEffect(() => {
    if (feedback !== null) feedbackRef.current?.focus()
  }, [feedback])

  if (model.kind === 'unavailable') {
    return (
      <>
        <div className="za-notice za-notice--error space-y-2" role="alert">
          <p>Username settings are temporarily unavailable.</p>
          <p>Try again in a moment.</p>
        </div>
        <Feedback
          feedback={feedback}
          feedbackRef={feedbackRef}
          id={feedbackId}
        />
      </>
    )
  }

  if (model.kind === 'already_changed') {
    return (
      <>
        <div className="space-y-2">
          <p>
            Current username: <PublicUsername username={model.username} />
          </p>
          <p>
            Your username has already been changed and cannot be changed again.
          </p>
        </div>
        <Feedback
          feedback={feedback}
          feedbackRef={feedbackRef}
          id={feedbackId}
        />
      </>
    )
  }

  if (model.kind === 'pending') {
    return (
      <>
        <CompletionUsernameChangeForm
          cancelAction={cancelAction}
          cancelPending={cancelPending}
          completeAction={completeAction}
          completePending={completePending}
          feedback={feedback}
          feedbackId={feedbackId}
          isPending={completePending || resendPending || cancelPending}
          onCancelSubmit={() => {
            setConfirmationError(false)
            setLastOperation('cancel')
          }}
          onCompleteSubmit={() => {
            setConfirmationError(false)
            setLastOperation('complete')
          }}
          onConfirmationChange={(checked) => {
            if (checked) setConfirmationError(false)
          }}
          onInvalidConfirmation={() => {
            setConfirmationError(true)
            setLastOperation(null)
          }}
          onResendSubmit={() => {
            setConfirmationError(false)
            setLastOperation('resend')
          }}
          proposedUsername={model.proposedUsername}
          resend={model.resend}
          resendAction={resendAction}
          resendPending={resendPending}
          username={model.username}
        />
        <Feedback
          feedback={feedback}
          feedbackRef={feedbackRef}
          id={feedbackId}
        />
      </>
    )
  }

  return (
    <>
      <StartUsernameChangeForm
        action={requestAction}
        feedback={feedback}
        feedbackId={feedbackId}
        isPending={requestPending}
        onSubmit={() => {
          setConfirmationError(false)
          setLastOperation('request')
        }}
        username={model.username}
      />
      <Feedback feedback={feedback} feedbackRef={feedbackRef} id={feedbackId} />
    </>
  )
}

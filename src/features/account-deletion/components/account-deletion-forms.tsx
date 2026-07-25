'use client'

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
import { useFormStatus } from 'react-dom'
import type { AccountDeletionFeedback } from '@/features/account-deletion/components/account-deletion-form-state'
import { getPersistentAccountDeletionFeedback } from '@/features/account-deletion/components/account-deletion-form-state'
import {
  accountDeletionConfirmationValue,
  initialAccountDeletionActionState,
  type AccountDeletionSetupState,
} from '@/features/account-deletion/domain/account-deletion'
import {
  passwordMaximumLength,
  passwordMinimumLength,
} from '@/features/auth/domain/password-policy'
import { cancelAccountDeletionSetup } from '@/features/account-deletion/actions/cancel-account-deletion-setup'
import { completeAccountDeletion } from '@/features/account-deletion/actions/complete-account-deletion'
import { requestAccountDeletion } from '@/features/account-deletion/actions/request-account-deletion'
import { resendDeletionCode } from '@/features/account-deletion/actions/resend-account-deletion-code'

const buttonClassName =
  'rounded border border-gray-300 bg-white px-3 py-2 transition-colors hover:bg-gray-100 active:bg-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 disabled:opacity-70'
const destructiveButtonClassName =
  'rounded border border-red-700 bg-white px-3 py-2 text-red-800 transition-colors hover:bg-red-50 active:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 disabled:opacity-70'
const fieldClassName =
  'w-full rounded border border-gray-300 px-3 py-2 transition-colors aria-invalid:border-red-600 aria-invalid:bg-red-50 aria-invalid:outline-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500'

const subscribeToHydration = () => () => undefined
const hydratedSnapshot = () => true
const serverSnapshot = () => false

function Feedback({
  feedback,
  feedbackRef,
  id,
}: {
  feedback: AccountDeletionFeedback | null
  feedbackRef: RefObject<HTMLParagraphElement | null>
  id: string
}) {
  return (
    <p
      aria-live={feedback?.tone === 'status' ? 'polite' : undefined}
      className={
        feedback?.tone === 'error' ? 'text-sm text-red-700' : 'text-sm'
      }
      id={id}
      ref={feedbackRef}
      role={feedback?.tone === 'error' ? 'alert' : 'status'}
      tabIndex={-1}
    >
      {feedback?.message ?? ''}
    </p>
  )
}

function SubmitButton({
  destructive = false,
  disabled = false,
  idleLabel,
  pendingLabel,
}: {
  destructive?: boolean
  disabled?: boolean
  idleLabel: string
  pendingLabel: string
}) {
  const { pending } = useFormStatus()

  return (
    <button
      className={destructive ? destructiveButtonClassName : buttonClassName}
      disabled={pending || disabled}
      type="submit"
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  )
}

function StartForm({
  action,
  feedback,
  feedbackId,
  pending,
  onSubmit,
}: {
  action: (formData: FormData) => void
  feedback: AccountDeletionFeedback | null
  feedbackId: string
  pending: boolean
  onSubmit: () => void
}) {
  const passwordId = useId()

  return (
    <form
      action={action}
      aria-busy={pending}
      className="space-y-4"
      onSubmit={onSubmit}
    >
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium" htmlFor={passwordId}>
          Current password
        </label>
        <input
          aria-describedby={
            feedback?.field === 'password' ? feedbackId : undefined
          }
          aria-invalid={feedback?.field === 'password' ? true : undefined}
          autoComplete="current-password"
          className={fieldClassName}
          disabled={pending}
          id={passwordId}
          maxLength={passwordMaximumLength}
          minLength={passwordMinimumLength}
          name="password"
          required
          type="password"
        />
      </div>
      <SubmitButton
        idleLabel="Send deletion code"
        pendingLabel="Sending deletion code…"
      />
    </form>
  )
}

function useResendAvailability(
  resend: Extract<AccountDeletionSetupState, { kind: 'pending' }>['resend'],
) {
  const [previous, setPrevious] = useState(resend)
  const [available, setAvailable] = useState(resend.kind === 'available')

  if (resend !== previous) {
    setPrevious(resend)
    setAvailable(resend.kind === 'available')
  }

  useEffect(() => {
    if (resend.kind !== 'cooldown' || available) return
    const timeout = window.setTimeout(
      () => setAvailable(true),
      resend.retryAfterMilliseconds,
    )
    return () => window.clearTimeout(timeout)
  }, [available, resend])

  return available
}

function CompletionForm({
  cancelSetupAction,
  cancelSetupPending,
  completeAction,
  completePending,
  feedback,
  feedbackId,
  onCancelSetup,
  onComplete,
  onConfirmationChange,
  onConfirmationInvalid,
  onResend,
  resend,
  resendAction,
  resendPending,
}: {
  cancelSetupAction: (formData: FormData) => void
  cancelSetupPending: boolean
  completeAction: (formData: FormData) => void
  completePending: boolean
  feedback: AccountDeletionFeedback | null
  feedbackId: string
  onCancelSetup: () => void
  onComplete: (event: FormEvent<HTMLFormElement>) => void
  onConfirmationChange: () => void
  onConfirmationInvalid: () => void
  onResend: () => void
  resend: Extract<AccountDeletionSetupState, { kind: 'pending' }>['resend']
  resendAction: (formData: FormData) => void
  resendPending: boolean
}) {
  const codeId = useId()
  const confirmationId = useId()
  const confirmationRef = useRef<HTMLInputElement>(null)
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    hydratedSnapshot,
    serverSnapshot,
  )
  const resendAvailable = useResendAvailability(resend)
  const anyPending = completePending || resendPending || cancelSetupPending

  return (
    <div className="space-y-4">
      <p>Check your verified email for an eight-digit deletion code.</p>
      <p>
        Requesting deletion will immediately restrict this account and sign out
        your other sessions. You can cancel before the 14-day recovery period
        ends. After that, recovery is unavailable and permanent deletion will
        proceed.
      </p>
      <form
        action={completeAction}
        aria-busy={completePending}
        className="space-y-4"
        noValidate={hydrated}
        onSubmit={(event) => {
          if (completePending) {
            event.preventDefault()
            return
          }
          if (!confirmationRef.current?.checked) {
            event.preventDefault()
            onConfirmationInvalid()
            return
          }
          onComplete(event)
        }}
      >
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor={codeId}>
            Deletion code
          </label>
          <input
            aria-describedby={
              feedback?.field === 'code' ? feedbackId : undefined
            }
            aria-invalid={feedback?.field === 'code' ? true : undefined}
            autoComplete="one-time-code"
            className={fieldClassName}
            disabled={anyPending}
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
            disabled={anyPending}
            id={confirmationId}
            name="confirmation"
            onChange={onConfirmationChange}
            ref={confirmationRef}
            required
            type="checkbox"
            value={accountDeletionConfirmationValue}
          />
          <span>
            I understand that this account will stop working immediately and
            recovery ends after 14 days.
          </span>
        </label>
        <SubmitButton
          destructive
          disabled={anyPending}
          idleLabel="Request account deletion"
          pendingLabel="Requesting account deletion…"
        />
      </form>
      <div className="flex flex-wrap gap-3">
        {resend.kind === 'restart_required' ? (
          <p className="text-sm">
            This deletion code is no longer valid. Cancel deletion setup to
            start again.
          </p>
        ) : resend.kind === 'unavailable' ? (
          <p className="text-sm text-gray-700">
            {resend.reason === 'send_limit'
              ? 'No more deletion codes can be sent right now. Use the newest code.'
              : 'Use the newest deletion code before it expires.'}
          </p>
        ) : (
          <form
            action={resendAction}
            aria-busy={resendPending}
            onSubmit={onResend}
          >
            <SubmitButton
              disabled={!resendAvailable || anyPending}
              idleLabel="Send another code"
              pendingLabel="Sending another code…"
            />
            {resend.kind === 'cooldown' && !resendAvailable ? (
              <p className="mt-2 text-sm text-gray-700" role="status">
                Wait a moment before sending another code. Refresh settings
                after the cooldown if JavaScript is unavailable.
              </p>
            ) : null}
          </form>
        )}
        <form
          action={cancelSetupAction}
          aria-busy={cancelSetupPending}
          onSubmit={onCancelSetup}
        >
          <SubmitButton
            disabled={anyPending}
            idleLabel="Cancel deletion setup"
            pendingLabel="Cancelling…"
          />
        </form>
      </div>
    </div>
  )
}

export function AccountDeletionForms({
  model,
}: {
  model: AccountDeletionSetupState
}) {
  const [requestState, runRequest, requestPending] = useActionState(
    requestAccountDeletion,
    initialAccountDeletionActionState,
  )
  const [completeState, runComplete, completePending] = useActionState(
    completeAccountDeletion,
    initialAccountDeletionActionState,
  )
  const [resendState, runResend, resendPending] = useActionState(
    resendDeletionCode,
    initialAccountDeletionActionState,
  )
  const [cancelSetupState, runCancelSetup, cancelSetupPending] = useActionState(
    cancelAccountDeletionSetup,
    initialAccountDeletionActionState,
  )
  const [lastOperation, setLastOperation] = useState<
    'request' | 'complete' | 'resend' | 'cancel_setup' | null
  >(null)
  const [confirmationError, setConfirmationError] = useState(false)
  const feedbackRef = useRef<HTMLParagraphElement>(null)
  const feedbackId = useId()
  const feedback = getPersistentAccountDeletionFeedback({
    cancelSetupState,
    completeState,
    confirmationError,
    lastOperation,
    requestState,
    resendState,
  })

  useEffect(() => {
    if (feedback !== null && lastOperation !== null) {
      feedbackRef.current?.focus()
    }
  }, [feedback, lastOperation])

  if (model.kind === 'unavailable') {
    return (
      <p role="alert">
        Account deletion is temporarily unavailable. Try again.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <p>
        Requesting deletion immediately restricts your account and signs out
        your other sessions. You can cancel during a 14-day recovery period.
        After recovery ends, your live account and archive will be permanently
        deleted. Encrypted backups may retain copies until they expire.
      </p>
      <p>
        Your username remains unavailable until permanent deletion succeeds.
      </p>
      {model.kind === 'start' ? (
        <StartForm
          action={runRequest}
          feedback={feedback}
          feedbackId={feedbackId}
          onSubmit={() => setLastOperation('request')}
          pending={requestPending}
        />
      ) : (
        <CompletionForm
          cancelSetupAction={runCancelSetup}
          cancelSetupPending={cancelSetupPending}
          completeAction={runComplete}
          completePending={completePending}
          feedback={feedback}
          feedbackId={feedbackId}
          onCancelSetup={() => setLastOperation('cancel_setup')}
          onComplete={() => {
            setConfirmationError(false)
            setLastOperation('complete')
          }}
          onConfirmationChange={() => setConfirmationError(false)}
          onConfirmationInvalid={() => {
            setConfirmationError(true)
            setLastOperation('complete')
          }}
          onResend={() => setLastOperation('resend')}
          resend={model.resend}
          resendAction={runResend}
          resendPending={resendPending}
        />
      )}
      <Feedback feedback={feedback} feedbackRef={feedbackRef} id={feedbackId} />
    </div>
  )
}

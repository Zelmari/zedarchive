'use client'

import Link from 'next/link'
import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
} from 'react'
import { useFormStatus } from 'react-dom'
import { getAccountDeletionFeedback } from '@/features/account-deletion/components/account-deletion-form-state'
import {
  accountDeletionHydratedValue,
  formatAccountDeletionDeadlineUtc,
  initialAccountDeletionActionState,
} from '@/features/account-deletion/domain/account-deletion'
import { cancelAccountDeletion } from '@/features/account-deletion/actions/cancel-account-deletion'
import {
  getFeedbackNoticeClassName,
  isAlertFeedbackTone,
} from '@/features/feedback/feedback-presentation'

const subscribeToHydration = () => () => undefined
const hydratedSnapshot = () => true
const serverSnapshot = () => false

function CancelButton() {
  const { pending } = useFormStatus()

  return (
    <button
      className="za-button za-button--primary"
      disabled={pending}
      type="submit"
    >
      {pending ? 'Cancelling account deletion…' : 'Cancel account deletion'}
    </button>
  )
}

export function RecoverableAccountDeletion({
  purgeAfter,
}: {
  purgeAfter: Date
}) {
  const [state, action] = useActionState(
    cancelAccountDeletion,
    initialAccountDeletionActionState,
  )
  const feedback = getAccountDeletionFeedback(state)
  const feedbackRef = useRef<HTMLParagraphElement>(null)
  const feedbackId = useId()
  const feedbackIsAlert =
    feedback === null ? false : isAlertFeedbackTone(feedback.tone)
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    hydratedSnapshot,
    serverSnapshot,
  )

  useEffect(() => {
    if (state.kind !== 'idle') feedbackRef.current?.focus()
  }, [state])

  if (state.kind === 'deletion_cancelled') {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Account deletion requested</h1>
        <p
          className="za-notice za-notice--success"
          ref={feedbackRef}
          role="status"
          tabIndex={-1}
        >
          Account deletion cancelled. Your account and archive are available
          again.
        </p>
        <Link className="za-link" href="/settings">
          Return to settings
        </Link>
      </div>
    )
  }

  if (state.kind === 'deletion_due') {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Recovery period ended</h1>
        <p
          className="za-notice za-notice--error text-sm"
          ref={feedbackRef}
          role="alert"
          tabIndex={-1}
        >
          The recovery period for this account has ended. Account recovery and
          cancellation are no longer available.
        </p>
        <p>
          Your live account and archive are awaiting permanent deletion. Your
          username remains unavailable until deletion succeeds.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Account deletion requested</h1>
      <p className="za-notice za-notice--warning">
        Your account is restricted. Normal account features are unavailable.
      </p>
      <p>
        Recovery ends on{' '}
        <time dateTime={purgeAfter.toISOString()}>
          {formatAccountDeletionDeadlineUtc(purgeAfter)}
        </time>
        .
      </p>
      <p>You can cancel before this time to keep your account and archive.</p>
      <p>
        After recovery ends, cancellation is unavailable and your live account
        and archive will be permanently deleted. Your username remains
        unavailable until deletion succeeds. Encrypted backups may retain copies
        until they expire.
      </p>
      <form
        action={action}
        aria-describedby={feedback ? feedbackId : undefined}
      >
        {hydrated ? (
          <input
            name="hydrated"
            type="hidden"
            value={accountDeletionHydratedValue}
          />
        ) : null}
        <CancelButton />
      </form>
      <p
        aria-live={feedbackIsAlert ? undefined : 'polite'}
        className={
          feedback === null
            ? undefined
            : `${getFeedbackNoticeClassName(feedback.tone)} text-sm`
        }
        id={feedbackId}
        ref={feedbackRef}
        role={feedbackIsAlert ? 'alert' : 'status'}
        tabIndex={-1}
      >
        {feedback?.message ?? ''}
      </p>
    </div>
  )
}

export function DueAccountDeletion() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-destructive">
        Recovery period ended
      </h1>
      <p className="za-notice za-notice--error" role="alert">
        The recovery period for this account has ended. Account recovery and
        cancellation are no longer available.
      </p>
      <p>
        Your live account and archive are awaiting permanent deletion. Your
        username remains unavailable until deletion succeeds.
      </p>
    </div>
  )
}

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

const subscribeToHydration = () => () => undefined
const hydratedSnapshot = () => true
const serverSnapshot = () => false

function CancelButton() {
  const { pending } = useFormStatus()

  return (
    <button
      className="rounded border border-gray-300 bg-white px-3 py-2 transition-colors hover:bg-gray-100 active:bg-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
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
        <p ref={feedbackRef} role="status" tabIndex={-1}>
          Account deletion cancelled. Your account and archive are available
          again.
        </p>
        <Link
          className="rounded underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          href="/settings"
        >
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
          className="text-sm text-red-700"
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
      <p>
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
      <form action={action} aria-describedby={feedbackId}>
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
        className={
          feedback?.tone === 'error' ? 'text-sm text-red-700' : 'text-sm'
        }
        id={feedbackId}
        ref={feedbackRef}
        role={feedback?.tone === 'error' ? 'alert' : 'status'}
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
      <h1 className="text-2xl font-semibold">Recovery period ended</h1>
      <p>
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

'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  authClient,
  getAuthClientErrorInput,
} from '@/features/auth/client/auth-client'
import { AuthFormStatus } from '@/features/auth/components/auth-form-status'
import {
  AuthNoScriptNotice,
  useAuthHydrated,
} from '@/features/auth/components/auth-hydration'
import {
  AUTH_INVALID_VERIFICATION_LINK_MESSAGE,
  translateAuthError,
} from '@/features/auth/domain/auth-error-messages'
import { parseVerifyEmailToken } from '@/features/auth/domain/verify-email-token'

const buttonClassName = 'za-button za-button--primary'

const linkClassName = 'za-link'

function readVerificationTokenFromLocation(): string | null {
  const tokens = new URLSearchParams(window.location.hash.slice(1)).getAll(
    'token',
  )
  const result = parseVerifyEmailToken({ token: tokens })

  return result.kind === 'valid' ? result.token : null
}

export function VerifyEmailForm() {
  const statusRef = useRef<HTMLParagraphElement>(null)
  const hasHydrated = useAuthHydrated()
  const tokenRef = useRef<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  useEffect(() => {
    if (formError !== null || successMessage !== null) {
      statusRef.current?.focus()
    }
  }, [formError, successMessage])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isPending || successMessage !== null) {
      return
    }

    setFormError(null)
    setIsPending(true)

    const token = tokenRef.current ?? readVerificationTokenFromLocation()

    if (token === null) {
      setFormError(AUTH_INVALID_VERIFICATION_LINK_MESSAGE)
      setIsPending(false)
      return
    }

    tokenRef.current = token
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}`,
    )

    const { error } = await authClient.verifyEmail({
      query: { token },
    })

    if (error) {
      const translated = translateAuthError(
        getAuthClientErrorInput(error, 'verification'),
      )

      if (translated.category === 'invalid_verification_link') {
        setFormError(translated.message)
      } else if (translated.category === 'rate_limited') {
        setFormError(translated.message)
      } else if (translated.category === 'temporary_failure') {
        setFormError(translated.message)
      } else {
        setFormError(translated.message)
      }

      setIsPending(false)
      return
    }

    setSuccessMessage('Your email is verified. You can sign in now.')
    setIsPending(false)
  }

  if (successMessage) {
    return (
      <div className="space-y-4">
        <AuthFormStatus
          message={successMessage}
          ref={statusRef}
          tone="success"
        />
        <p>
          <a className={linkClassName} href="/sign-in">
            Sign in
          </a>
        </p>
      </div>
    )
  }

  return (
    <form
      aria-busy={isPending}
      className="space-y-4"
      onSubmit={(event) => void handleSubmit(event)}
    >
      {formError ? (
        <AuthFormStatus message={formError} ref={statusRef} />
      ) : null}

      <p>Confirm that you want to verify the email address for this account.</p>

      <button
        className={buttonClassName}
        disabled={!hasHydrated || isPending}
        type="submit"
      >
        {isPending ? 'Verifying email…' : 'Verify email'}
      </button>

      {formError === AUTH_INVALID_VERIFICATION_LINK_MESSAGE ? (
        <p className="text-sm">
          <a className={linkClassName} href="/sign-in">
            Sign in to request a new verification email
          </a>
        </p>
      ) : null}
      <AuthNoScriptNotice>
        JavaScript is required to verify your email. Enable JavaScript and try
        again.
      </AuthNoScriptNotice>
    </form>
  )
}

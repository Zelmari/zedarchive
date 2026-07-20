'use client'

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import {
  authClient,
  getAuthClientErrorInput,
} from '@/features/auth/client/auth-client'
import { AuthFormStatus } from '@/features/auth/components/auth-form-status'
import { PasswordField } from '@/features/auth/components/password-field'
import { resetPasswordFormSchema } from '@/features/auth/domain/auth-form-validation'
import {
  AUTH_INVALID_RESET_LINK_MESSAGE,
  AUTH_VALIDATION_ERROR_MESSAGE,
  translateAuthError,
} from '@/features/auth/domain/auth-error-messages'
import {
  passwordMaximumLength,
  passwordMinimumLength,
} from '@/features/auth/domain/password-policy'
import { parseVerifyEmailToken } from '@/features/auth/domain/verify-email-token'

const buttonClassName =
  'rounded border border-gray-300 bg-white px-3 py-2 transition-colors hover:bg-gray-100 active:bg-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 disabled:opacity-70'

const linkClassName =
  'rounded underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'

function readResetTokenFromLocation(): string | null {
  const tokens = new URLSearchParams(window.location.hash.slice(1)).getAll(
    'token',
  )
  const result = parseVerifyEmailToken({ token: tokens })

  return result.kind === 'valid' ? result.token : null
}

export function ResetPasswordForm() {
  const statusRef = useRef<HTMLParagraphElement>(null)
  const tokenRef = useRef<string | null>(null)
  const passwordId = useId()

  const [password, setPassword] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [requiresNewLink, setRequiresNewLink] = useState(false)
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
    setFieldError(null)

    const parsed = resetPasswordFormSchema.safeParse({ password })

    if (!parsed.success) {
      setFieldError(
        `Use a password between ${passwordMinimumLength} and ${passwordMaximumLength} characters.`,
      )
      setFormError(AUTH_VALIDATION_ERROR_MESSAGE)
      return
    }

    setIsPending(true)

    const token = tokenRef.current ?? readResetTokenFromLocation()

    if (token === null) {
      setFormError(AUTH_INVALID_RESET_LINK_MESSAGE)
      setIsPending(false)
      return
    }

    tokenRef.current = token
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}`,
    )

    const { error } = await authClient.resetPassword({
      newPassword: parsed.data.password,
      token,
    })

    if (error) {
      const translated = translateAuthError(
        getAuthClientErrorInput(error, 'password_reset'),
      )

      if (translated.category === 'invalid_reset_link') {
        setFormError(translated.message)
      } else if (translated.category === 'password_compromised') {
        setFieldError(translated.message)
        setFormError(
          `${translated.message} This reset link can no longer be used; request a new one.`,
        )
        setRequiresNewLink(true)
      } else if (translated.category === 'validation') {
        setFormError(translated.message)
      } else if (translated.category === 'rate_limited') {
        setFormError(translated.message)
      } else if (translated.category === 'temporary_failure') {
        setFormError(
          'The reset could not be completed, and this link may no longer be usable. Request a new reset link.',
        )
        setRequiresNewLink(true)
      } else {
        setFormError(translated.message)
      }

      setIsPending(false)
      return
    }

    setSuccessMessage(
      'Your password was changed and existing sessions were signed out. Sign in with your new password.',
    )
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

  if (requiresNewLink && formError) {
    return (
      <div className="space-y-4">
        <AuthFormStatus message={formError} ref={statusRef} />
        <p>
          <a className={linkClassName} href="/forgot-password">
            Request a new reset link
          </a>
        </p>
      </div>
    )
  }

  return (
    <form
      aria-busy={isPending}
      className="space-y-4"
      noValidate
      onSubmit={(event) => void handleSubmit(event)}
    >
      {formError ? (
        <AuthFormStatus message={formError} ref={statusRef} />
      ) : null}

      <PasswordField
        autoComplete="new-password"
        describedBy={fieldError ? `${passwordId}-error` : undefined}
        disabled={isPending}
        hint={`${passwordMinimumLength}–${passwordMaximumLength} characters. Spaces are allowed. Passwords that have appeared in known data breaches are rejected.`}
        id={passwordId}
        invalid={Boolean(fieldError)}
        label="New password"
        name="password"
        onChange={setPassword}
        value={password}
      />
      {fieldError ? (
        <p
          className="text-sm text-red-700"
          id={`${passwordId}-error`}
          role="alert"
        >
          {fieldError}
        </p>
      ) : null}

      <button className={buttonClassName} disabled={isPending} type="submit">
        {isPending ? 'Changing password…' : 'Change password'}
      </button>

      <p className="text-sm">
        <a className={linkClassName} href="/forgot-password">
          Request a new reset link
        </a>
      </p>
    </form>
  )
}

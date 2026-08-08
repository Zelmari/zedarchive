'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import {
  authClient,
  getAuthClientErrorInput,
} from '@/features/auth/client/auth-client'
import { AuthFormStatus } from '@/features/auth/components/auth-form-status'
import {
  AuthNoScriptNotice,
  useAuthHydrated,
} from '@/features/auth/components/auth-hydration'
import { PasswordField } from '@/features/auth/components/password-field'
import { signInFormSchema } from '@/features/auth/domain/auth-form-validation'
import {
  AUTH_VALIDATION_ERROR_MESSAGE,
  translateAuthError,
} from '@/features/auth/domain/auth-error-messages'
import {
  passwordMaximumLength,
  passwordMinimumLength,
} from '@/features/auth/domain/password-policy'

const fieldClassName = 'za-field'

const buttonClassName = 'za-button za-button--primary'

const secondaryButtonClassName = 'za-button za-button--secondary'

const linkClassName = 'za-link'

type FieldName = 'email' | 'password'

export function SignInForm() {
  const router = useRouter()
  const hasHydrated = useAuthHydrated()
  const statusRef = useRef<HTMLParagraphElement>(null)
  const emailId = useId()
  const passwordId = useId()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<FieldName, string>>
  >({})
  const [formError, setFormError] = useState<string | null>(null)
  const [verificationRequired, setVerificationRequired] = useState(false)
  const [resendAcknowledgement, setResendAcknowledgement] = useState<
    string | null
  >(null)
  const [isPending, setIsPending] = useState(false)
  const [isResendPending, setIsResendPending] = useState(false)

  useEffect(() => {
    if (formError !== null || resendAcknowledgement !== null) {
      statusRef.current?.focus()
    }
  }, [formError, resendAcknowledgement])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isPending) {
      return
    }

    setFormError(null)
    setFieldErrors({})
    setVerificationRequired(false)
    setResendAcknowledgement(null)

    const parsed = signInFormSchema.safeParse({ email, password })

    if (!parsed.success) {
      const flattened = parsed.error.flatten().fieldErrors
      const nextFieldErrors: Partial<Record<FieldName, string>> = {}

      if (flattened.email?.length) {
        nextFieldErrors.email = 'Enter a valid email address.'
      }
      if (flattened.password?.length) {
        nextFieldErrors.password = `Use a password between ${passwordMinimumLength} and ${passwordMaximumLength} characters.`
      }

      setFieldErrors(nextFieldErrors)
      setFormError(AUTH_VALIDATION_ERROR_MESSAGE)
      return
    }

    setIsPending(true)

    const { error } = await authClient.signIn.email({
      email: parsed.data.email,
      password: parsed.data.password,
    })

    if (error) {
      const translated = translateAuthError(
        getAuthClientErrorInput(error, 'sign_in'),
      )

      if (translated.category === 'verification_required') {
        setVerificationRequired(true)
        setFormError(translated.message)
      } else if (translated.category === 'validation') {
        setFormError(translated.message)
      } else if (translated.category === 'invalid_credentials') {
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

    router.refresh()
    setIsPending(false)
  }

  async function handleResendVerification() {
    if (isResendPending || isPending) {
      return
    }

    const parsedEmail = signInFormSchema.shape.email.safeParse(email)

    if (!parsedEmail.success) {
      setFieldErrors({ email: 'Enter the email address for this account.' })
      setFormError(AUTH_VALIDATION_ERROR_MESSAGE)
      return
    }

    setIsResendPending(true)
    setResendAcknowledgement(null)

    await authClient.sendVerificationEmail({
      email: parsedEmail.data,
    })

    setResendAcknowledgement(
      'If this address can be used, we will send a verification link.',
    )
    setIsResendPending(false)
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
      {resendAcknowledgement ? (
        <AuthFormStatus
          message={resendAcknowledgement}
          ref={statusRef}
          tone="info"
        />
      ) : null}

      <div className="flex flex-col gap-1">
        <label className="za-field-label text-sm font-medium" htmlFor={emailId}>
          Email
        </label>
        <input
          aria-describedby={fieldErrors.email ? `${emailId}-error` : undefined}
          aria-invalid={fieldErrors.email ? true : undefined}
          autoComplete="email"
          className={fieldClassName}
          disabled={!hasHydrated || isPending || isResendPending}
          id={emailId}
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
        {fieldErrors.email ? (
          <p
            className="text-sm text-destructive"
            id={`${emailId}-error`}
            role="alert"
          >
            {fieldErrors.email}
          </p>
        ) : null}
      </div>

      <PasswordField
        autoComplete="current-password"
        describedBy={fieldErrors.password ? `${passwordId}-error` : undefined}
        disabled={!hasHydrated || isPending || isResendPending}
        id={passwordId}
        invalid={Boolean(fieldErrors.password)}
        label="Password"
        name="password"
        onChange={setPassword}
        value={password}
      />
      {fieldErrors.password ? (
        <p
          className="text-sm text-destructive"
          id={`${passwordId}-error`}
          role="alert"
        >
          {fieldErrors.password}
        </p>
      ) : null}

      <button
        className={buttonClassName}
        disabled={!hasHydrated || isPending || isResendPending}
        type="submit"
      >
        {isPending ? 'Signing in…' : 'Sign in'}
      </button>

      {verificationRequired ? (
        <div className="space-y-2">
          <button
            className={secondaryButtonClassName}
            disabled={!hasHydrated || isPending || isResendPending}
            onClick={() => void handleResendVerification()}
            type="button"
          >
            {isResendPending
              ? 'Sending verification email…'
              : 'Resend verification email'}
          </button>
        </div>
      ) : null}

      <p className="text-sm">
        <a className={linkClassName} href="/forgot-password">
          Forgot password
        </a>
      </p>

      <p className="text-sm">
        Need an account?{' '}
        <a className={linkClassName} href="/register">
          Register
        </a>
      </p>
      <AuthNoScriptNotice>
        JavaScript is required to sign in. Enable JavaScript and try again.
      </AuthNoScriptNotice>
    </form>
  )
}

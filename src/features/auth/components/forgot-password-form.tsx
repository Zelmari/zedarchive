'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import {
  authClient,
  getAuthClientErrorInput,
} from '@/features/auth/client/auth-client'
import { AuthFormStatus } from '@/features/auth/components/auth-form-status'
import { forgotPasswordFormSchema } from '@/features/auth/domain/auth-form-validation'
import {
  AUTH_VALIDATION_ERROR_MESSAGE,
  translateAuthError,
} from '@/features/auth/domain/auth-error-messages'

const fieldClassName =
  'w-full rounded border border-gray-300 px-3 py-2 transition-colors aria-invalid:border-red-600 aria-invalid:bg-red-50 aria-invalid:outline-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500'

const buttonClassName =
  'rounded border border-gray-300 bg-white px-3 py-2 transition-colors hover:bg-gray-100 active:bg-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 disabled:opacity-70'

const linkClassName =
  'rounded underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'

export function ForgotPasswordForm() {
  const router = useRouter()
  const statusRef = useRef<HTMLParagraphElement>(null)
  const emailId = useId()

  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  useEffect(() => {
    if (formError !== null) {
      statusRef.current?.focus()
    }
  }, [formError])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isPending) {
      return
    }

    setFormError(null)
    setFieldError(null)

    const parsed = forgotPasswordFormSchema.safeParse({ email })

    if (!parsed.success) {
      setFieldError('Enter a valid email address.')
      setFormError(AUTH_VALIDATION_ERROR_MESSAGE)
      return
    }

    setIsPending(true)

    const { error } = await authClient.requestPasswordReset({
      email: parsed.data.email,
      redirectTo: '/reset-password/continue',
    })

    if (error) {
      const translated = translateAuthError(getAuthClientErrorInput(error))

      if (
        translated.category === 'temporary_failure' ||
        translated.category === 'validation'
      ) {
        setFormError(translated.message)
        setIsPending(false)
        return
      }
    }

    router.push('/forgot-password/sent')
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

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium" htmlFor={emailId}>
          Email
        </label>
        <input
          aria-describedby={fieldError ? `${emailId}-error` : undefined}
          aria-invalid={fieldError ? true : undefined}
          autoComplete="email"
          className={fieldClassName}
          disabled={isPending}
          id={emailId}
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
        {fieldError ? (
          <p
            className="text-sm text-red-700"
            id={`${emailId}-error`}
            role="alert"
          >
            {fieldError}
          </p>
        ) : null}
      </div>

      <button className={buttonClassName} disabled={isPending} type="submit">
        {isPending ? 'Sending reset link…' : 'Send reset link'}
      </button>

      <p className="text-sm">
        <a className={linkClassName} href="/sign-in">
          Back to sign in
        </a>
      </p>
    </form>
  )
}

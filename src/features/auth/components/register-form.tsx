'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import {
  authClient,
  getAuthClientErrorInput,
} from '@/features/auth/client/auth-client'
import { AuthFormStatus } from '@/features/auth/components/auth-form-status'
import { PasswordField } from '@/features/auth/components/password-field'
import {
  passwordMaximumLength,
  passwordMinimumLength,
  registrationFormSchema,
} from '@/features/auth/domain/auth-form-validation'
import {
  AUTH_VALIDATION_ERROR_MESSAGE,
  translateAuthError,
} from '@/features/auth/domain/auth-error-messages'
import {
  usernameMaximumLength,
  usernameMinimumLength,
} from '@/features/identity/domain/username'

const fieldClassName =
  'w-full rounded border border-gray-300 px-3 py-2 transition-colors aria-invalid:border-red-600 aria-invalid:bg-red-50 aria-invalid:outline-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500'

const buttonClassName =
  'rounded border border-gray-300 bg-white px-3 py-2 transition-colors hover:bg-gray-100 active:bg-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 disabled:opacity-70'

const linkClassName =
  'rounded underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'

type FieldName = 'username' | 'email' | 'password'

export function RegisterForm() {
  const router = useRouter()
  const statusRef = useRef<HTMLParagraphElement>(null)
  const usernameId = useId()
  const emailId = useId()
  const passwordId = useId()
  const usernameHintId = useId()
  const emailHintId = useId()

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<FieldName, string>>
  >({})
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
    setFieldErrors({})

    const parsed = registrationFormSchema.safeParse({
      username,
      email,
      password,
    })

    if (!parsed.success) {
      const flattened = parsed.error.flatten().fieldErrors
      const nextFieldErrors: Partial<Record<FieldName, string>> = {}

      if (flattened.username?.length) {
        nextFieldErrors.username =
          'Use a username that matches the guidance below.'
      }
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

    const { error } = await authClient.signUp.email({
      name: parsed.data.username,
      email: parsed.data.email,
      password: parsed.data.password,
    })

    if (error) {
      const translated = translateAuthError(getAuthClientErrorInput(error))

      if (translated.category === 'validation') {
        setFormError(translated.message)
      } else if (translated.category === 'generic_failure') {
        setFormError(translated.message)
      } else if (translated.category === 'password_compromised') {
        setFieldErrors({ password: translated.message })
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

    router.push('/register/check-email')
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
        <label className="text-sm font-medium" htmlFor={usernameId}>
          Username
        </label>
        <input
          aria-describedby={`${usernameHintId}${fieldErrors.username ? ` ${usernameId}-error` : ''}`}
          aria-invalid={fieldErrors.username ? true : undefined}
          autoComplete="username"
          className={fieldClassName}
          disabled={isPending}
          id={usernameId}
          maxLength={usernameMaximumLength}
          minLength={usernameMinimumLength}
          name="username"
          onChange={(event) => setUsername(event.target.value)}
          required
          type="text"
          value={username}
        />
        <p className="text-sm text-gray-700" id={usernameHintId}>
          {usernameMinimumLength}–{usernameMaximumLength} characters. Letters,
          numbers, hyphens, and underscores. Must start and end with a letter or
          number.
        </p>
        {fieldErrors.username ? (
          <p
            className="text-sm text-red-700"
            id={`${usernameId}-error`}
            role="alert"
          >
            {fieldErrors.username}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium" htmlFor={emailId}>
          Email
        </label>
        <input
          aria-describedby={`${emailHintId}${fieldErrors.email ? ` ${emailId}-error` : ''}`}
          aria-invalid={fieldErrors.email ? true : undefined}
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
        <p className="text-sm text-gray-700" id={emailHintId}>
          A verification email is required before you can sign in.
        </p>
        {fieldErrors.email ? (
          <p
            className="text-sm text-red-700"
            id={`${emailId}-error`}
            role="alert"
          >
            {fieldErrors.email}
          </p>
        ) : null}
      </div>

      <PasswordField
        autoComplete="new-password"
        describedBy={fieldErrors.password ? `${passwordId}-error` : undefined}
        disabled={isPending}
        hint={`${passwordMinimumLength}–${passwordMaximumLength} characters. Spaces are allowed. Passwords that have appeared in known data breaches are rejected.`}
        id={passwordId}
        invalid={Boolean(fieldErrors.password)}
        label="Password"
        name="password"
        onChange={setPassword}
        value={password}
      />
      {fieldErrors.password ? (
        <p
          className="text-sm text-red-700"
          id={`${passwordId}-error`}
          role="alert"
        >
          {fieldErrors.password}
        </p>
      ) : null}

      <button className={buttonClassName} disabled={isPending} type="submit">
        {isPending ? 'Creating account…' : 'Create account'}
      </button>

      <p className="text-sm">
        Already have an account?{' '}
        <a className={linkClassName} href="/sign-in">
          Sign in
        </a>
      </p>
    </form>
  )
}

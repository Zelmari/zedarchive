'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import {
  authClient,
  getAuthClientErrorInput,
} from '@/features/auth/client/auth-client'
import { AuthFormStatus } from '@/features/auth/components/auth-form-status'
import { PasswordField } from '@/features/auth/components/password-field'
import { registrationFormSchema } from '@/features/auth/domain/auth-form-validation'
import {
  AUTH_GENERIC_FAILURE_MESSAGE,
  AUTH_VALIDATION_ERROR_MESSAGE,
  translateAuthError,
} from '@/features/auth/domain/auth-error-messages'
import {
  applyAvailabilityCheckResult,
  getLocallyValidUsername,
  isAvailabilityRequestAbort,
  resolveFailedCreateUserRecheck,
  shouldBlockRegistrationSubmit,
  shouldFlushAvailabilityCheckOnBlur,
  shouldRecheckFailedUserCreation,
  transitionAvailabilityForUsernameInput,
  USERNAME_AVAILABILITY_CHECK_DELAY_MS,
  USERNAME_AVAILABILITY_CHECKING_MESSAGE,
  USERNAME_AVAILABILITY_UNAVAILABLE_MESSAGE,
  USERNAME_AVAILABILITY_UNAVAILABLE_SUBMIT_MESSAGE,
  USERNAME_AVAILABILITY_UNKNOWN_MESSAGE,
  type RegistrationUsernameAvailabilityState,
} from '@/features/auth/domain/registration-username-availability'
import {
  passwordMaximumLength,
  passwordMinimumLength,
} from '@/features/auth/domain/password-policy'
import { checkUsernameAvailability } from '@/features/identity/client/check-username-availability'
import { PublicUsername } from '@/features/identity/components/public-username'
import {
  normalizeUsernameForIdentity,
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
  const usernameStatusId = useId()
  const emailHintId = useId()

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<FieldName, string>>
  >({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [availability, setAvailability] =
    useState<RegistrationUsernameAvailabilityState>({ status: 'idle' })

  const usernameRef = useRef(username)
  const availabilityRef = useRef(availability)
  const isMountedRef = useRef(true)
  const latestIdentityKeyRef = useRef<string | null>(null)
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (formError !== null) {
      statusRef.current?.focus()
    }
  }, [formError])

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
      if (debounceTimeoutRef.current !== null) {
        clearTimeout(debounceTimeoutRef.current)
      }
      abortControllerRef.current?.abort()
    }
  }, [])

  function clearDebounceTimeout() {
    if (debounceTimeoutRef.current !== null) {
      clearTimeout(debounceTimeoutRef.current)
      debounceTimeoutRef.current = null
    }
  }

  function abortInFlightAvailabilityCheck() {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
  }

  function commitAvailabilityState(
    next: RegistrationUsernameAvailabilityState,
  ) {
    if (!isMountedRef.current) {
      return
    }

    availabilityRef.current = next
    setAvailability(next)
  }

  async function runAvailabilityCheck(
    displayUsername: string,
    identityKey: string,
  ) {
    abortInFlightAvailabilityCheck()

    const controller = new AbortController()
    abortControllerRef.current = controller
    commitAvailabilityState({ status: 'checking', identityKey })

    try {
      const result = await checkUsernameAvailability(
        displayUsername,
        controller.signal,
      )
      const currentDisplayUsername =
        getLocallyValidUsername(usernameRef.current) ?? displayUsername
      const next = applyAvailabilityCheckResult({
        requestedIdentityKey: identityKey,
        currentIdentityKey: latestIdentityKeyRef.current,
        result,
        displayUsername: currentDisplayUsername,
      })

      if (next === 'ignore') {
        return
      }

      commitAvailabilityState(next)
    } catch (error) {
      if (isAvailabilityRequestAbort(error)) {
        return
      }

      const next = applyAvailabilityCheckResult({
        requestedIdentityKey: identityKey,
        currentIdentityKey: latestIdentityKeyRef.current,
        result: null,
        displayUsername,
      })

      if (next === 'ignore') {
        return
      }

      commitAvailabilityState(next)
    }
  }

  function handleUsernameChange(value: string) {
    usernameRef.current = value
    setUsername(value)
    setFieldErrors((current) => {
      if (current.username === undefined) {
        return current
      }

      const rest: Partial<Record<FieldName, string>> = { ...current }
      delete rest.username
      return rest
    })

    const transition = transitionAvailabilityForUsernameInput(
      availabilityRef.current,
      value,
    )
    latestIdentityKeyRef.current = transition.identityKey
    commitAvailabilityState(transition.state)
    clearDebounceTimeout()

    if (!transition.shouldScheduleCheck) {
      if (transition.identityKey === null) {
        abortInFlightAvailabilityCheck()
      }
      return
    }

    abortInFlightAvailabilityCheck()

    if (
      transition.displayUsername === null ||
      transition.identityKey === null
    ) {
      return
    }

    const nextDisplayUsername = transition.displayUsername
    const nextIdentityKey = transition.identityKey

    debounceTimeoutRef.current = setTimeout(() => {
      debounceTimeoutRef.current = null
      void runAvailabilityCheck(nextDisplayUsername, nextIdentityKey)
    }, USERNAME_AVAILABILITY_CHECK_DELAY_MS)
  }

  function handleUsernameBlur() {
    const flush = shouldFlushAvailabilityCheckOnBlur(
      availabilityRef.current,
      usernameRef.current,
    )
    clearDebounceTimeout()

    if (
      !flush.shouldCheck ||
      flush.displayUsername === null ||
      flush.identityKey === null
    ) {
      return
    }

    latestIdentityKeyRef.current = flush.identityKey
    void runAvailabilityCheck(flush.displayUsername, flush.identityKey)
  }

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

    const submittedIdentityKey = normalizeUsernameForIdentity(
      parsed.data.username,
    )

    if (
      shouldBlockRegistrationSubmit(
        availabilityRef.current,
        submittedIdentityKey,
      )
    ) {
      setFieldErrors({
        username: USERNAME_AVAILABILITY_UNAVAILABLE_MESSAGE,
      })
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
      if (shouldRecheckFailedUserCreation(error.code)) {
        let recheckResult = null

        try {
          recheckResult = await checkUsernameAvailability(parsed.data.username)
        } catch {
          recheckResult = null
        }

        if (resolveFailedCreateUserRecheck(recheckResult) === 'unavailable') {
          commitAvailabilityState({
            status: 'unavailable',
            identityKey: submittedIdentityKey,
          })
          setFieldErrors({
            username: USERNAME_AVAILABILITY_UNAVAILABLE_SUBMIT_MESSAGE,
          })
          setFormError(AUTH_GENERIC_FAILURE_MESSAGE)
          setIsPending(false)
          return
        }
      }

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

  const usernameIsInvalid =
    Boolean(fieldErrors.username) || availability.status === 'unavailable'
  const showAvailabilityStatus =
    fieldErrors.username === undefined && availability.status !== 'idle'
  const usernameDescribedBy = [
    usernameHintId,
    showAvailabilityStatus ? usernameStatusId : null,
    fieldErrors.username ? `${usernameId}-error` : null,
  ]
    .filter((value): value is string => value !== null)
    .join(' ')
  const currentAvailableDisplayUsername =
    availability.status === 'available'
      ? (getLocallyValidUsername(username) ?? availability.displayUsername)
      : null

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
          aria-describedby={usernameDescribedBy}
          aria-invalid={usernameIsInvalid ? true : undefined}
          autoComplete="username"
          className={fieldClassName}
          disabled={isPending}
          id={usernameId}
          maxLength={usernameMaximumLength}
          minLength={usernameMinimumLength}
          name="username"
          onBlur={handleUsernameBlur}
          onChange={(event) => handleUsernameChange(event.target.value)}
          required
          type="text"
          value={username}
        />
        <p className="text-sm text-gray-700" id={usernameHintId}>
          {usernameMinimumLength}–{usernameMaximumLength} characters. Letters,
          numbers, hyphens, and underscores. Must start and end with a letter or
          number.
        </p>
        {showAvailabilityStatus && availability.status === 'checking' ? (
          <p
            aria-live="polite"
            className="text-sm text-gray-700"
            id={usernameStatusId}
            role="status"
          >
            {USERNAME_AVAILABILITY_CHECKING_MESSAGE}
          </p>
        ) : null}
        {showAvailabilityStatus && availability.status === 'available' ? (
          <p
            aria-live={
              currentAvailableDisplayUsername === availability.displayUsername
                ? 'polite'
                : undefined
            }
            className="text-sm text-gray-700"
            id={usernameStatusId}
            role={
              currentAvailableDisplayUsername === availability.displayUsername
                ? 'status'
                : undefined
            }
          >
            <PublicUsername
              username={
                currentAvailableDisplayUsername ?? availability.displayUsername
              }
            />{' '}
            is available.
          </p>
        ) : null}
        {showAvailabilityStatus && availability.status === 'unavailable' ? (
          <p className="text-sm text-red-700" id={usernameStatusId}>
            {USERNAME_AVAILABILITY_UNAVAILABLE_MESSAGE}
          </p>
        ) : null}
        {showAvailabilityStatus && availability.status === 'unknown' ? (
          <p
            aria-live="polite"
            className="text-sm text-gray-700"
            id={usernameStatusId}
            role="status"
          >
            {USERNAME_AVAILABILITY_UNKNOWN_MESSAGE}
          </p>
        ) : null}
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

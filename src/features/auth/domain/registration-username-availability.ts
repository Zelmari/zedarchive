import { authUsernameSchema } from '@/features/auth/domain/auth-form-validation'
import type { UsernameAvailability } from '@/features/identity/domain/username-availability'
import { normalizeUsernameForIdentity } from '@/features/identity/domain/username'

export const USERNAME_AVAILABILITY_CHECK_DELAY_MS = 500

export const USERNAME_AVAILABILITY_CHECKING_MESSAGE = 'Checking username…'

export const USERNAME_AVAILABILITY_UNAVAILABLE_MESSAGE =
  'That username is unavailable.'

export const USERNAME_AVAILABILITY_UNAVAILABLE_SUBMIT_MESSAGE =
  'That username is unavailable. Choose another.'

export const USERNAME_AVAILABILITY_UNKNOWN_MESSAGE =
  'Availability could not be checked. You can still create your account.'

export type RegistrationUsernameAvailabilityState =
  | { status: 'idle' }
  | { status: 'checking'; identityKey: string }
  | {
      status: 'available'
      identityKey: string
      displayUsername: string
    }
  | { status: 'unavailable'; identityKey: string }
  | { status: 'unknown'; identityKey: string }

export type UsernameInputAvailabilityTransition = Readonly<{
  state: RegistrationUsernameAvailabilityState
  shouldScheduleCheck: boolean
  identityKey: string | null
  displayUsername: string | null
}>

export type UsernameBlurAvailabilityFlush = Readonly<{
  shouldCheck: boolean
  identityKey: string | null
  displayUsername: string | null
}>

export function getLocallyValidUsername(rawUsername: string): string | null {
  const parsed = authUsernameSchema.safeParse(rawUsername)
  return parsed.success ? parsed.data : null
}

export function transitionAvailabilityForUsernameInput(
  previous: RegistrationUsernameAvailabilityState,
  rawUsername: string,
): UsernameInputAvailabilityTransition {
  const displayUsername = getLocallyValidUsername(rawUsername)

  if (displayUsername === null) {
    return {
      state: { status: 'idle' },
      shouldScheduleCheck: false,
      identityKey: null,
      displayUsername: null,
    }
  }

  const identityKey = normalizeUsernameForIdentity(displayUsername)

  if (previous.status === 'available' && previous.identityKey === identityKey) {
    return {
      state: previous,
      shouldScheduleCheck: false,
      identityKey,
      displayUsername,
    }
  }

  if (
    previous.status === 'unavailable' &&
    previous.identityKey === identityKey
  ) {
    return {
      state: { status: 'unavailable', identityKey },
      shouldScheduleCheck: false,
      identityKey,
      displayUsername,
    }
  }

  if (previous.status === 'checking' && previous.identityKey === identityKey) {
    return {
      state: previous,
      shouldScheduleCheck: false,
      identityKey,
      displayUsername,
    }
  }

  if (previous.status === 'unknown' && previous.identityKey === identityKey) {
    return {
      state: previous,
      shouldScheduleCheck: false,
      identityKey,
      displayUsername,
    }
  }

  return {
    state: { status: 'idle' },
    shouldScheduleCheck: true,
    identityKey,
    displayUsername,
  }
}

export function shouldFlushAvailabilityCheckOnBlur(
  state: RegistrationUsernameAvailabilityState,
  rawUsername: string,
): UsernameBlurAvailabilityFlush {
  const displayUsername = getLocallyValidUsername(rawUsername)

  if (displayUsername === null) {
    return {
      shouldCheck: false,
      identityKey: null,
      displayUsername: null,
    }
  }

  const identityKey = normalizeUsernameForIdentity(displayUsername)

  if (
    (state.status === 'available' || state.status === 'unavailable') &&
    state.identityKey === identityKey
  ) {
    return {
      shouldCheck: false,
      identityKey,
      displayUsername,
    }
  }

  if (state.status === 'checking' && state.identityKey === identityKey) {
    return {
      shouldCheck: false,
      identityKey,
      displayUsername,
    }
  }

  return {
    shouldCheck: true,
    identityKey,
    displayUsername,
  }
}

export function applyAvailabilityCheckResult(args: {
  requestedIdentityKey: string
  currentIdentityKey: string | null
  result: UsernameAvailability | null
  displayUsername: string
}): RegistrationUsernameAvailabilityState | 'ignore' {
  if (args.currentIdentityKey !== args.requestedIdentityKey) {
    return 'ignore'
  }

  if (args.result?.status === 'available') {
    return {
      status: 'available',
      identityKey: args.requestedIdentityKey,
      displayUsername: args.displayUsername,
    }
  }

  if (args.result?.status === 'unavailable') {
    return {
      status: 'unavailable',
      identityKey: args.requestedIdentityKey,
    }
  }

  return {
    status: 'unknown',
    identityKey: args.requestedIdentityKey,
  }
}

export function shouldBlockRegistrationSubmit(
  state: RegistrationUsernameAvailabilityState,
  submittedIdentityKey: string,
): boolean {
  return (
    state.status === 'unavailable' && state.identityKey === submittedIdentityKey
  )
}

export function resolveFailedCreateUserRecheck(
  result: UsernameAvailability | null,
): 'unavailable' | 'generic' {
  return result?.status === 'unavailable' ? 'unavailable' : 'generic'
}

export function shouldRecheckFailedUserCreation(code: unknown): boolean {
  return code === 'FAILED_TO_CREATE_USER'
}

export function isAvailabilityRequestAbort(error: unknown): boolean {
  return (
    (error instanceof DOMException || error instanceof Error) &&
    error.name === 'AbortError'
  )
}

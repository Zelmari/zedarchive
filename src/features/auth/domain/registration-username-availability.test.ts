import { describe, expect, it } from 'vitest'
import {
  applyAvailabilityCheckResult,
  getLocallyValidUsername,
  isAvailabilityRequestAbort,
  resolveFailedCreateUserRecheck,
  shouldRecheckFailedUserCreation,
  shouldBlockRegistrationSubmit,
  shouldFlushAvailabilityCheckOnBlur,
  transitionAvailabilityForUsernameInput,
  USERNAME_AVAILABILITY_CHECK_DELAY_MS,
  type RegistrationUsernameAvailabilityState,
} from '@/features/auth/domain/registration-username-availability'

describe('registration username availability helpers', () => {
  it('uses a 500 ms delay', () => {
    expect(USERNAME_AVAILABILITY_CHECK_DELAY_MS).toBe(500)
  })

  it('parses only locally valid usernames for availability checks', () => {
    expect(getLocallyValidUsername('ab')).toBeNull()
    expect(getLocallyValidUsername('admin')).toBeNull()
    expect(getLocallyValidUsername('  MediaFan  ')).toBe('MediaFan')
  })

  it('does not schedule checks for locally invalid input', () => {
    expect(
      transitionAvailabilityForUsernameInput({ status: 'idle' }, 'ab'),
    ).toEqual({
      state: { status: 'idle' },
      shouldScheduleCheck: false,
      identityKey: null,
      displayUsername: null,
    })
  })

  it('schedules a check after a normalized-key transition and drops the prior result', () => {
    const previous: RegistrationUsernameAvailabilityState = {
      status: 'available',
      identityKey: 'mediafan',
      displayUsername: 'MediaFan',
    }

    expect(
      transitionAvailabilityForUsernameInput(previous, 'OtherName'),
    ).toEqual({
      state: { status: 'idle' },
      shouldScheduleCheck: true,
      identityKey: 'othername',
      displayUsername: 'OtherName',
    })
  })

  it('reuses a confirmed result only for capitalization-only edits of the current key', () => {
    const available: RegistrationUsernameAvailabilityState = {
      status: 'available',
      identityKey: 'mediafan',
      displayUsername: 'MediaFan',
    }

    expect(
      transitionAvailabilityForUsernameInput(available, 'MEDIAFAN'),
    ).toEqual({
      state: available,
      shouldScheduleCheck: false,
      identityKey: 'mediafan',
      displayUsername: 'MEDIAFAN',
    })

    const unavailable: RegistrationUsernameAvailabilityState = {
      status: 'unavailable',
      identityKey: 'mediafan',
    }

    expect(
      transitionAvailabilityForUsernameInput(unavailable, 'mediaFan'),
    ).toEqual({
      state: { status: 'unavailable', identityKey: 'mediafan' },
      shouldScheduleCheck: false,
      identityKey: 'mediafan',
      displayUsername: 'mediaFan',
    })
  })

  it('requires a fresh check when returning to a previously confirmed key', () => {
    const afterLeaving: RegistrationUsernameAvailabilityState = {
      status: 'available',
      identityKey: 'othername',
      displayUsername: 'OtherName',
    }

    expect(
      transitionAvailabilityForUsernameInput(afterLeaving, 'MediaFan'),
    ).toEqual({
      state: { status: 'idle' },
      shouldScheduleCheck: true,
      identityKey: 'mediafan',
      displayUsername: 'MediaFan',
    })
  })

  it('flushes a pending check on blur but not a confirmed or in-flight same-key result', () => {
    expect(
      shouldFlushAvailabilityCheckOnBlur({ status: 'idle' }, 'MediaFan'),
    ).toEqual({
      shouldCheck: true,
      identityKey: 'mediafan',
      displayUsername: 'MediaFan',
    })

    expect(
      shouldFlushAvailabilityCheckOnBlur(
        {
          status: 'available',
          identityKey: 'mediafan',
          displayUsername: 'MediaFan',
        },
        'MediaFan',
      ).shouldCheck,
    ).toBe(false)

    expect(
      shouldFlushAvailabilityCheckOnBlur(
        { status: 'checking', identityKey: 'mediafan' },
        'MediaFan',
      ).shouldCheck,
    ).toBe(false)

    expect(
      shouldFlushAvailabilityCheckOnBlur({ status: 'idle' }, 'ab').shouldCheck,
    ).toBe(false)
  })

  it('ignores stale check results for a different identity key', () => {
    expect(
      applyAvailabilityCheckResult({
        requestedIdentityKey: 'oldname',
        currentIdentityKey: 'newname',
        result: { status: 'available' },
        displayUsername: 'OldName',
      }),
    ).toBe('ignore')
  })

  it('maps server and transport outcomes to approved UI states', () => {
    expect(
      applyAvailabilityCheckResult({
        requestedIdentityKey: 'mediafan',
        currentIdentityKey: 'mediafan',
        result: { status: 'available' },
        displayUsername: 'MediaFan',
      }),
    ).toEqual({
      status: 'available',
      identityKey: 'mediafan',
      displayUsername: 'MediaFan',
    })

    expect(
      applyAvailabilityCheckResult({
        requestedIdentityKey: 'mediafan',
        currentIdentityKey: 'mediafan',
        result: { status: 'unavailable' },
        displayUsername: 'MediaFan',
      }),
    ).toEqual({
      status: 'unavailable',
      identityKey: 'mediafan',
    })

    expect(
      applyAvailabilityCheckResult({
        requestedIdentityKey: 'mediafan',
        currentIdentityKey: 'mediafan',
        result: { status: 'invalid' },
        displayUsername: 'MediaFan',
      }),
    ).toEqual({
      status: 'unknown',
      identityKey: 'mediafan',
    })

    expect(
      applyAvailabilityCheckResult({
        requestedIdentityKey: 'mediafan',
        currentIdentityKey: 'mediafan',
        result: null,
        displayUsername: 'MediaFan',
      }),
    ).toEqual({
      status: 'unknown',
      identityKey: 'mediafan',
    })
  })

  it('blocks submit only for confirmed unavailable on the submitted identity key', () => {
    expect(
      shouldBlockRegistrationSubmit(
        { status: 'unavailable', identityKey: 'mediafan' },
        'mediafan',
      ),
    ).toBe(true)

    expect(
      shouldBlockRegistrationSubmit(
        { status: 'checking', identityKey: 'mediafan' },
        'mediafan',
      ),
    ).toBe(false)

    expect(
      shouldBlockRegistrationSubmit(
        { status: 'unknown', identityKey: 'mediafan' },
        'mediafan',
      ),
    ).toBe(false)

    expect(
      shouldBlockRegistrationSubmit(
        { status: 'unavailable', identityKey: 'mediafan' },
        'othername',
      ),
    ).toBe(false)
  })

  it('treats only a fresh unavailable recheck as a username collision', () => {
    expect(resolveFailedCreateUserRecheck({ status: 'unavailable' })).toBe(
      'unavailable',
    )
    expect(resolveFailedCreateUserRecheck({ status: 'available' })).toBe(
      'generic',
    )
    expect(resolveFailedCreateUserRecheck({ status: 'invalid' })).toBe(
      'generic',
    )
    expect(resolveFailedCreateUserRecheck(null)).toBe('generic')
  })

  it('rechecks only the raw failed-user-creation provider code', () => {
    expect(shouldRecheckFailedUserCreation('FAILED_TO_CREATE_USER')).toBe(true)
    expect(shouldRecheckFailedUserCreation('FAILED_TO_CREATE_SESSION')).toBe(
      false,
    )
    expect(shouldRecheckFailedUserCreation('USER_ALREADY_EXISTS')).toBe(false)
    expect(
      shouldRecheckFailedUserCreation('USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'),
    ).toBe(false)
    expect(shouldRecheckFailedUserCreation(undefined)).toBe(false)
  })

  it('detects abort errors without treating them as unknown failures', () => {
    expect(
      isAvailabilityRequestAbort(
        new DOMException('The operation was aborted.', 'AbortError'),
      ),
    ).toBe(true)
    expect(isAvailabilityRequestAbort(new TypeError('Failed to fetch'))).toBe(
      false,
    )
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createCompleteUsernameChangeHandler } from '@/features/settings/actions/complete-username-change-handler'
import { createRequestUsernameChangeHandler } from '@/features/settings/actions/request-username-change-handler'
import { createResendUsernameChangeCodeHandler } from '@/features/settings/actions/resend-username-change-code-handler'
import { initialUsernameChangeActionState } from '@/features/settings/domain/username-change'

const session = {
  user: { id: '11111111-1111-4111-8111-111111111111' },
  session: { id: '22222222-2222-4222-8222-222222222222' },
}

function startFormData() {
  const formData = new FormData()
  formData.set('username', 'NewName')
  formData.set('password', 'current password')
  return formData
}

function completeFormData(code = '00000001') {
  const formData = new FormData()
  formData.set('code', code)
  formData.set('confirmation', 'one-time-username-change')
  return formData
}

describe('username change action handlers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not resolve a session, verify a password, or request a challenge for malformed start input', async () => {
    const getSession = vi.fn()
    const verifyPassword = vi.fn()
    const requestUsernameChange = vi.fn()
    const action = createRequestUsernameChangeHandler({
      getHeaders: vi.fn(),
      getSession,
      verifyPassword,
      preflightUsernameChange: vi.fn(),
      requestUsernameChange,
      scheduleEmail: vi.fn(),
      revalidate: vi.fn(),
    })
    const malformed = startFormData()
    malformed.set('userId', 'forged')

    await expect(
      action(initialUsernameChangeActionState, malformed),
    ).resolves.toEqual({ kind: 'invalid_username' })
    expect(getSession).not.toHaveBeenCalled()
    expect(verifyPassword).not.toHaveBeenCalled()
    expect(requestUsernameChange).not.toHaveBeenCalled()
  })

  it('does not create a challenge or schedule email when current-password verification fails', async () => {
    const requestUsernameChange = vi.fn()
    const scheduleEmail = vi.fn()
    const action = createRequestUsernameChangeHandler({
      getHeaders: vi.fn().mockResolvedValue(new Headers()),
      getSession: vi.fn().mockResolvedValue(session),
      verifyPassword: vi.fn().mockResolvedValue({ kind: 'invalid_password' }),
      preflightUsernameChange: vi.fn().mockResolvedValue({
        kind: 'ready',
        username: 'NewName',
      }),
      requestUsernameChange,
      scheduleEmail,
      revalidate: vi.fn(),
    })

    await expect(
      action(initialUsernameChangeActionState, startFormData()),
    ).resolves.toEqual({ kind: 'invalid_password' })
    expect(requestUsernameChange).not.toHaveBeenCalled()
    expect(scheduleEmail).not.toHaveBeenCalled()
  })

  it('schedules a challenge-created email without returning its code to the action state', async () => {
    const scheduleEmail = vi.fn()
    const revalidate = vi.fn()
    const action = createRequestUsernameChangeHandler({
      getHeaders: vi.fn().mockResolvedValue(new Headers()),
      getSession: vi.fn().mockResolvedValue(session),
      verifyPassword: vi.fn().mockResolvedValue({ kind: 'verified' }),
      preflightUsernameChange: vi.fn().mockResolvedValue({
        kind: 'ready',
        username: 'NewName',
      }),
      requestUsernameChange: vi.fn().mockResolvedValue({
        kind: 'challenge_created',
        delivery: {
          code: '00000001',
          challengeId: '33333333-3333-4333-8333-333333333333',
          expiresAt: new Date(),
        },
      }),
      scheduleEmail,
      revalidate,
    })

    const result = await action(
      initialUsernameChangeActionState,
      startFormData(),
    )

    expect(result).toEqual({ kind: 'code_sent' })
    expect(JSON.stringify(result)).not.toContain('00000001')
    expect(scheduleEmail).toHaveBeenCalledWith({
      userId: session.user.id,
      code: '00000001',
      challengeId: '33333333-3333-4333-8333-333333333333',
    })
    expect(revalidate).toHaveBeenCalledOnce()
  })

  it.each([
    ['invalid_username', { kind: 'invalid_username' }],
    ['no_change', { kind: 'no_change' }],
    ['already_changed', { kind: 'already_changed' }],
    ['target_unavailable', { kind: 'target_unavailable' }],
  ] as const)(
    'does not verify the password when preflight returns %s',
    async (_, result) => {
      const verifyPassword = vi.fn()
      const requestUsernameChange = vi.fn()
      const action = createRequestUsernameChangeHandler({
        getHeaders: vi.fn().mockResolvedValue(new Headers()),
        getSession: vi.fn().mockResolvedValue(session),
        verifyPassword,
        preflightUsernameChange: vi.fn().mockResolvedValue(result),
        requestUsernameChange,
        scheduleEmail: vi.fn(),
        revalidate: vi.fn(),
      })

      await expect(
        action(initialUsernameChangeActionState, startFormData()),
      ).resolves.toEqual(result)
      expect(verifyPassword).not.toHaveBeenCalled()
      expect(requestUsernameChange).not.toHaveBeenCalled()
    },
  )

  it.each(['resend_cooldown', 'send_limit'] as const)(
    'preserves the request %s result for honest retry-later feedback',
    async (kind) => {
      const action = createRequestUsernameChangeHandler({
        getHeaders: vi.fn().mockResolvedValue(new Headers()),
        getSession: vi.fn().mockResolvedValue(session),
        verifyPassword: vi.fn().mockResolvedValue({ kind: 'verified' }),
        preflightUsernameChange: vi.fn().mockResolvedValue({
          kind: 'ready',
          username: 'NewName',
        }),
        requestUsernameChange: vi.fn().mockResolvedValue({ kind }),
        scheduleEmail: vi.fn(),
        revalidate: vi.fn(),
      })

      await expect(
        action(initialUsernameChangeActionState, startFormData()),
      ).resolves.toEqual({ kind })
    },
  )

  it.each([
    ['code_expired', { kind: 'code_expired' }],
    ['reauthentication_required', { kind: 'reauthentication_required' }],
    ['attempts_exhausted', { kind: 'attempts_exhausted' }],
    ['restart_required', { kind: 'restart_required' }],
  ] as const)(
    'preserves complete result %s for distinct UI recovery',
    async (_, result) => {
      const action = createCompleteUsernameChangeHandler({
        getSession: vi.fn().mockResolvedValue(session),
        completeUsernameChange: vi.fn().mockResolvedValue(result),
        revalidate: vi.fn(),
      })

      await expect(
        action(initialUsernameChangeActionState, completeFormData()),
      ).resolves.toEqual(result)
    },
  )

  it.each([
    ['resend_cooldown', { kind: 'resend_cooldown' }],
    ['send_limit', { kind: 'send_limit' }],
    ['reauthentication_required', { kind: 'reauthentication_required' }],
    ['attempts_exhausted', { kind: 'attempts_exhausted' }],
    ['restart_required', { kind: 'restart_required' }],
  ] as const)(
    'preserves resend result %s for distinct UI recovery',
    async (_, result) => {
      const action = createResendUsernameChangeCodeHandler({
        getSession: vi.fn().mockResolvedValue(session),
        resendUsernameChangeCode: vi.fn().mockResolvedValue(result),
        scheduleEmail: vi.fn(),
        revalidate: vi.fn(),
      })

      await expect(
        action(initialUsernameChangeActionState, new FormData()),
      ).resolves.toEqual(result)
    },
  )

  it('rejects a missing irreversible confirmation before resolving a session or code', async () => {
    const getSession = vi.fn()
    const completeUsernameChange = vi.fn()
    const action = createCompleteUsernameChangeHandler({
      getSession,
      completeUsernameChange,
      revalidate: vi.fn(),
    })
    const formData = completeFormData()
    formData.delete('confirmation')

    await expect(
      action(initialUsernameChangeActionState, formData),
    ).resolves.toEqual({ kind: 'confirmation_required' })
    expect(getSession).not.toHaveBeenCalled()
    expect(completeUsernameChange).not.toHaveBeenCalled()
  })
})

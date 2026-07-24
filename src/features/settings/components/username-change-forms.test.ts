import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  getPersistentUsernameChangeFeedback,
  getUsernameChangeFeedback,
} from '@/features/settings/components/username-change-form-state'

const { useActionState, useFormStatus } = vi.hoisted(() => ({
  useActionState: vi.fn(),
  useFormStatus: vi.fn(),
}))

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useActionState,
}))
vi.mock('react-dom', () => ({ useFormStatus }))
vi.mock('@/features/settings/actions/request-username-change', () => ({
  requestUsernameChange: vi.fn(),
}))
vi.mock('@/features/settings/actions/resend-username-change-code', () => ({
  resendUsernameChangeCode: vi.fn(),
}))
vi.mock('@/features/settings/actions/cancel-username-change', () => ({
  cancelUsernameChange: vi.fn(),
}))
vi.mock('@/features/settings/actions/complete-username-change', () => ({
  completeUsernameChange: vi.fn(),
}))

import { UsernameChangeForms } from '@/features/settings/components/username-change-forms'
import { UsernameChangeRouteContent } from '@/features/settings/components/username-change-presentation'

describe('username change feedback', () => {
  it.each([
    ['code_expired', 'This verification code has expired. Send another code.'],
    [
      'reauthentication_required',
      'This verification code is no longer valid. Start again.',
    ],
    [
      'attempts_exhausted',
      'This verification code is no longer valid. Start again.',
    ],
    ['resend_cooldown', 'Wait a moment before sending another code.'],
    ['send_limit', 'Too many codes were requested. Start again later.'],
  ] as const)('maps %s to its approved recovery copy', (kind, message) => {
    expect(getUsernameChangeFeedback({ kind })).toMatchObject({ message })
  })

  it.each([
    ['invalid username', { kind: 'invalid_username' }, 'username'],
    ['exact no-op', { kind: 'no_change' }, 'username'],
    ['unavailable username', { kind: 'target_unavailable' }, 'username'],
    ['incorrect password', { kind: 'invalid_password' }, 'password'],
    ['malformed code', { kind: 'invalid_code' }, 'code'],
    ['missing confirmation', { kind: 'confirmation_required' }, 'confirmation'],
  ] as const)(
    'assigns %s feedback to only its owning field',
    (_, state, field) => {
      expect(getUsernameChangeFeedback(state)).toMatchObject({
        tone: 'error',
        field,
      })
    },
  )

  it.each([
    { kind: 'rate_limited' },
    { kind: 'sign_in_required' },
    { kind: 'session_unavailable' },
    { kind: 'retry' },
    { kind: 'code_expired' },
    { kind: 'restart_required' },
  ] as const)('keeps %o as form-level feedback', (state) => {
    expect(getUsernameChangeFeedback(state)).not.toHaveProperty('field')
  })
})

describe('UsernameChangeForms', () => {
  it('renders the available progressive start form without an availability claim', () => {
    useActionState.mockReturnValue([{ kind: 'idle' }, vi.fn(), false])
    useFormStatus.mockReturnValue({ pending: false })

    const markup = renderToStaticMarkup(
      createElement(UsernameChangeForms, {
        model: { kind: 'available', username: 'CurrentName' },
      }),
    )

    expect(markup).toContain('Current username: @CurrentName')
    expect(markup).toContain(
      'Your username is public and can only be changed once.',
    )
    expect(markup).toContain('New username')
    expect(markup).toContain('Current password')
    expect(markup).toContain('Send verification code')
    expect(markup).not.toContain('is available')
    expect(markup).not.toContain('userId')
    expect(markup).not.toContain('aria-invalid="true"')
  })

  it('renders the server-owned confirmation target, leading-zero-capable code input, and irreversible confirmation', () => {
    useActionState.mockReturnValue([{ kind: 'idle' }, vi.fn(), false])
    useFormStatus.mockReturnValue({ pending: false })

    const markup = renderToStaticMarkup(
      createElement(UsernameChangeForms, {
        model: {
          kind: 'pending',
          username: 'CurrentName',
          proposedUsername: 'NewName',
          resend: { kind: 'available' },
        },
      }),
    )

    expect(markup).toContain('You are changing @CurrentName to @NewName.')
    expect(markup).toContain(
      'Check your verified email for an eight-digit code.',
    )
    expect(markup).toMatch(/autoComplete="one-time-code"/)
    expect(markup).toMatch(/inputMode="numeric"/)
    expect(markup).toMatch(/maxLength="8"/)
    expect(markup).toMatch(/pattern="\[0-9\]\{8\}"/)
    expect(markup).toContain(
      'I understand that I can only change my username once.',
    )
    expect(markup).toContain('Send another code')
    expect(markup).toContain('Cancel username change')
    expect(markup).not.toContain('proposedUsername')
    expect(markup).not.toContain('aria-invalid="true"')
  })

  it('keeps resend disabled with honest no-JavaScript guidance during the server-authoritative cooldown', () => {
    useActionState.mockReturnValue([{ kind: 'idle' }, vi.fn(), false])
    useFormStatus.mockReturnValue({ pending: false })

    const markup = renderToStaticMarkup(
      createElement(UsernameChangeForms, {
        model: {
          kind: 'pending',
          username: 'CurrentName',
          proposedUsername: 'NewName',
          resend: { kind: 'cooldown', retryAfterMilliseconds: 60_000 },
        },
      }),
    )

    expect(markup).toMatch(/disabled=""[^>]*>Send another code<\/button>/)
    expect(markup).toContain('You can send another code after a short wait.')
    expect(markup).toContain('Refresh settings if JavaScript is unavailable.')
  })

  it('removes resend when the server says the reauthentication window cannot continue', () => {
    useActionState.mockReturnValue([{ kind: 'idle' }, vi.fn(), false])
    useFormStatus.mockReturnValue({ pending: false })

    const markup = renderToStaticMarkup(
      createElement(UsernameChangeForms, {
        model: {
          kind: 'pending',
          username: 'CurrentName',
          proposedUsername: 'NewName',
          resend: {
            kind: 'restart_required',
            reason: 'reauthentication_expired',
          },
        },
      }),
    )

    expect(markup).not.toContain('>Send another code<')
    expect(markup).toContain(
      'This verification code is no longer valid. Cancel it to start again.',
    )
  })

  it('hides resend at the server send limit without disabling the still-valid code completion form', () => {
    useActionState.mockReturnValue([{ kind: 'idle' }, vi.fn(), false])
    useFormStatus.mockReturnValue({ pending: false })

    const markup = renderToStaticMarkup(
      createElement(UsernameChangeForms, {
        model: {
          kind: 'pending',
          username: 'CurrentName',
          proposedUsername: 'NewName',
          resend: { kind: 'unavailable', reason: 'send_limit' },
        },
      }),
    )

    expect(markup).toContain('Verification code')
    expect(markup).toContain('>Change username<')
    expect(markup).not.toContain('>Send another code<')
    expect(markup).toContain(
      'No more verification codes can be sent right now. Use the newest code.',
    )
  })

  it('renders no mutation controls after the lifetime change is used', () => {
    const markup = renderToStaticMarkup(
      createElement(UsernameChangeForms, {
        model: { kind: 'already_changed', username: 'ChangedName' },
      }),
    )

    expect(markup).toContain('@ChangedName')
    expect(markup).toContain(
      'Your username has already been changed and cannot be changed again.',
    )
    expect(markup).not.toContain('Current password')
    expect(markup).not.toContain('Verification code')
  })

  it('retains success feedback selected by the stable client root after authoritative revalidation changes the model', () => {
    expect(
      getPersistentUsernameChangeFeedback({
        cancelState: { kind: 'idle' },
        completeState: { kind: 'changed', username: 'NewName' },
        confirmationError: false,
        lastOperation: 'complete',
        requestState: { kind: 'idle' },
        resendState: { kind: 'idle' },
      }),
    ).toMatchObject({
      tone: 'status',
      message: 'Your username has been changed to @NewName.',
    })
  })

  it.each([
    [
      'exact no-op',
      {
        requestState: { kind: 'no_change' },
        completeState: { kind: 'idle' },
      },
      'Choose a different username.',
    ],
    [
      'wrong password',
      {
        requestState: { kind: 'invalid_password' },
        completeState: { kind: 'idle' },
      },
      'Your current password is incorrect.',
    ],
    [
      'wrong code',
      {
        requestState: { kind: 'idle' },
        completeState: { kind: 'invalid_code' },
      },
      'Enter the correct eight-digit verification code.',
    ],
    [
      'missing confirmation',
      {
        requestState: { kind: 'idle' },
        completeState: { kind: 'confirmation_required' },
      },
      'Confirm that you understand this username change cannot be undone.',
    ],
    [
      'success',
      {
        requestState: { kind: 'idle' },
        completeState: { kind: 'changed', username: 'NewName' },
      },
      'Your username has been changed to @NewName.',
    ],
  ] as const)(
    'recovers %s feedback from Server Action state when no hydrated submit event selected an operation',
    (_, states, message) => {
      expect(
        getPersistentUsernameChangeFeedback({
          cancelState: { kind: 'idle' },
          completeState: states.completeState,
          confirmationError: false,
          lastOperation: null,
          requestState: states.requestState,
          resendState: { kind: 'idle' },
        }),
      ).toMatchObject({ message })
    },
  )

  it('renders a bounded unavailable state without a form', () => {
    const markup = renderToStaticMarkup(
      createElement(UsernameChangeRouteContent, {
        model: { kind: 'unavailable' },
      }),
    )

    expect(markup).toContain('role="alert"')
    expect(markup).toContain('Username settings are temporarily unavailable.')
    expect(markup).not.toContain('Send verification code')
  })
})

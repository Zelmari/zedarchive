import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  getAccountDeletionFeedback,
  getPersistentAccountDeletionFeedback,
} from '@/features/account-deletion/components/account-deletion-form-state'

const { useActionState, useFormStatus } = vi.hoisted(() => ({
  useActionState: vi.fn(),
  useFormStatus: vi.fn(),
}))

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useActionState,
}))
vi.mock('react-dom', () => ({ useFormStatus }))
vi.mock('@/features/account-deletion/actions/request-account-deletion', () => ({
  requestAccountDeletion: vi.fn(),
}))
vi.mock(
  '@/features/account-deletion/actions/resend-account-deletion-code',
  () => ({ resendDeletionCode: vi.fn() }),
)
vi.mock(
  '@/features/account-deletion/actions/cancel-account-deletion-setup',
  () => ({ cancelAccountDeletionSetup: vi.fn() }),
)
vi.mock(
  '@/features/account-deletion/actions/complete-account-deletion',
  () => ({ completeAccountDeletion: vi.fn() }),
)
vi.mock('@/features/account-deletion/actions/cancel-account-deletion', () => ({
  cancelAccountDeletion: vi.fn(),
}))

import { AccountDeletionForms } from '@/features/account-deletion/components/account-deletion-forms'
import {
  DueAccountDeletion,
  RecoverableAccountDeletion,
} from '@/features/account-deletion/components/account-deletion-recovery'

describe('account deletion feedback', () => {
  it.each([
    ['invalid_password', 'password'],
    ['invalid_code', 'code'],
    ['confirmation_required', 'confirmation'],
  ] as const)('assigns %s to its owning field', (kind, field) => {
    expect(getAccountDeletionFeedback({ kind })).toMatchObject({
      tone: 'error',
      field,
    })
  })

  it.each([
    ['code_expired', 'This deletion code has expired. Send another code.'],
    ['restart_required', 'This deletion code is no longer valid. Start again.'],
    ['resend_cooldown', 'Wait a moment before sending another code.'],
    [
      'send_limit',
      'No more deletion codes can be sent right now. Use the newest code.',
    ],
  ] as const)('maps %s to approved recovery copy', (kind, message) => {
    expect(getAccountDeletionFeedback({ kind })).toMatchObject({
      message,
      tone: 'warning',
    })
  })

  it('reports the unchecked confirmation of a blocked completion attempt', () => {
    expect(
      getPersistentAccountDeletionFeedback({
        cancelSetupState: { kind: 'idle' },
        completeState: { kind: 'idle' },
        confirmationError: true,
        lastOperation: 'complete',
        requestState: { kind: 'code_sent' },
        resendState: { kind: 'idle' },
      }),
    ).toMatchObject({ field: 'confirmation', tone: 'error' })
  })
})

describe('AccountDeletionForms', () => {
  it('renders the approved unavailable retry copy', () => {
    useActionState.mockReturnValue([{ kind: 'idle' }, vi.fn(), false])
    useFormStatus.mockReturnValue({ pending: false })

    const markup = renderToStaticMarkup(
      createElement(AccountDeletionForms, {
        model: { kind: 'unavailable' },
      }),
    )

    expect(markup).toContain(
      'Account deletion is temporarily unavailable. Try again.',
    )
  })

  it('renders the approved progressive start form and warning', () => {
    useActionState.mockReturnValue([{ kind: 'idle' }, vi.fn(), false])
    useFormStatus.mockReturnValue({ pending: false })

    const markup = renderToStaticMarkup(
      createElement(AccountDeletionForms, { model: { kind: 'start' } }),
    )

    expect(markup).toContain('Current password')
    expect(markup).toContain('Send deletion code')
    expect(markup).toContain('14-day recovery period')
    expect(markup).toContain('Encrypted backups may retain copies')
    expect(markup).toContain('za-button za-button--destructive-outline')
    expect(markup).not.toContain('userId')
    expect(markup).not.toContain('sessionId')
    expect(markup.match(/role="status"/g)).toHaveLength(1)
    expect(markup).not.toContain('za-notice')
  })

  it('renders code-delivery feedback as a polite information notice', () => {
    useActionState.mockReturnValue([{ kind: 'code_sent' }, vi.fn(), false])
    useFormStatus.mockReturnValue({ pending: false })

    const markup = renderToStaticMarkup(
      createElement(AccountDeletionForms, { model: { kind: 'start' } }),
    )

    expect(markup).toContain('za-notice--information')
    expect(markup).toContain('aria-live="polite"')
    expect(markup).toContain('role="status"')
  })

  it('renders code then checkbox then the destructive final action', () => {
    useActionState.mockReturnValue([{ kind: 'idle' }, vi.fn(), false])
    useFormStatus.mockReturnValue({ pending: false })

    const markup = renderToStaticMarkup(
      createElement(AccountDeletionForms, {
        model: { kind: 'pending', resend: { kind: 'available' } },
      }),
    )

    expect(markup).toMatch(/autoComplete="one-time-code"/)
    expect(markup).toMatch(/inputMode="numeric"/)
    expect(markup).toMatch(/pattern="\[0-9\]\{8\}"/)
    expect(markup).toMatch(
      /aria-describedby="[^"]+"[^>]*autoComplete="one-time-code"/,
    )
    expect(markup.indexOf('Deletion code')).toBeLessThan(
      markup.indexOf('I understand that this account'),
    )
    expect(markup.indexOf('I understand that this account')).toBeLessThan(
      markup.indexOf('Request account deletion'),
    )
    expect(markup).toContain('za-button za-button--destructive')
    expect(markup).toContain('Send another code')
    expect(markup).toContain('Cancel deletion setup')
  })

  it('keeps cooldown resend disabled with honest no-JavaScript guidance', () => {
    useActionState.mockReturnValue([{ kind: 'idle' }, vi.fn(), false])
    useFormStatus.mockReturnValue({ pending: false })

    const markup = renderToStaticMarkup(
      createElement(AccountDeletionForms, {
        model: {
          kind: 'pending',
          resend: { kind: 'cooldown', retryAfterMilliseconds: 60_000 },
        },
      }),
    )

    expect(markup).toMatch(/disabled=""[^>]*>Send another code<\/button>/)
    expect(markup).toContain(
      'Refresh settings after the cooldown if JavaScript is unavailable.',
    )
    expect(markup).toContain('aria-live="polite"')
    expect(markup).not.toContain('You can request another code now.')
  })
})

describe('account deletion recovery presentation', () => {
  it('transitions a stale recoverable view to accessible due presentation', () => {
    useActionState.mockReturnValue([{ kind: 'deletion_due' }, vi.fn(), false])
    useFormStatus.mockReturnValue({ pending: false })

    const markup = renderToStaticMarkup(
      createElement(RecoverableAccountDeletion, {
        purgeAfter: new Date('2026-08-25T14:30:00.000Z'),
      }),
    )

    expect(markup).toContain(
      '<h1 class="text-2xl font-semibold">Recovery period ended</h1>',
    )
    expect(markup.match(/<h1\b/gu)).toHaveLength(1)
    expect(markup).toContain('role="alert"')
    expect(markup).toContain('za-notice--error')
    expect(markup).toContain('awaiting permanent deletion')
    expect(markup).not.toContain('Cancel account deletion')
  })

  it('renders completed recovery feedback as a success notice', () => {
    useActionState.mockReturnValue([
      { kind: 'deletion_cancelled' },
      vi.fn(),
      false,
    ])
    useFormStatus.mockReturnValue({ pending: false })

    const markup = renderToStaticMarkup(
      createElement(RecoverableAccountDeletion, {
        purgeAfter: new Date('2026-08-25T14:30:00.000Z'),
      }),
    )

    expect(markup).toContain('za-notice--success')
    expect(markup).toContain('role="status"')
  })

  it('renders the exact UTC deadline in a semantic time element', () => {
    useActionState.mockReturnValue([{ kind: 'idle' }, vi.fn(), false])
    useFormStatus.mockReturnValue({ pending: false })

    const markup = renderToStaticMarkup(
      createElement(RecoverableAccountDeletion, {
        purgeAfter: new Date('2026-08-25T14:30:00.000Z'),
      }),
    )

    expect(markup).toContain(
      '<time dateTime="2026-08-25T14:30:00.000Z">25 August 2026 at 14:30 UTC</time>',
    )
    expect(markup).toContain('Cancel account deletion')
    expect(markup).toMatch(/<form[^>]*aria-busy="false"/)
    expect(markup).not.toContain('username=')
    expect(markup).toMatch(
      /<p aria-live="polite" id="[^"]+" role="status" tabindex="-1"><\/p>/,
    )
  })

  it('renders due state without a cancellation control or purge promise', () => {
    const markup = renderToStaticMarkup(createElement(DueAccountDeletion))

    expect(markup).toContain('>Recovery period ended</h1>')
    expect(markup.match(/<h1\b/gu)).toHaveLength(1)
    expect(markup).toContain('awaiting permanent deletion')
    expect(markup).not.toContain('Cancel account deletion')
    expect(markup).not.toMatch(/\b(?:today|hour|minute)\b/iu)
  })
})

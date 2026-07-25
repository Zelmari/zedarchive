import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createCancelAccountDeletionHandler } from '@/features/account-deletion/actions/cancel-account-deletion-handler'
import { createCompleteAccountDeletionHandler } from '@/features/account-deletion/actions/complete-account-deletion-handler'
import { createRequestAccountDeletionHandler } from '@/features/account-deletion/actions/request-account-deletion-handler'
import {
  accountDeletionConfirmationValue,
  accountDeletionHydratedValue,
  initialAccountDeletionActionState,
} from '@/features/account-deletion/domain/account-deletion'

const activeAccess = {
  kind: 'active' as const,
  identity: {
    userId: '11111111-1111-4111-8111-111111111111',
    sessionId: '22222222-2222-4222-8222-222222222222',
  },
}

function startFormData() {
  const data = new FormData()
  data.set('password', 'current password')
  return data
}

function hydratedCancelFormData() {
  const data = new FormData()
  data.set('hydrated', accountDeletionHydratedValue)
  return data
}

function completeFormData() {
  const data = new FormData()
  data.set('code', '00000001')
  data.set('confirmation', accountDeletionConfirmationValue)
  return data
}

describe('account deletion action handlers', () => {
  it('rejects forged start fields before session or password work', async () => {
    const resolveAccess = vi.fn()
    const verifyPassword = vi.fn()
    const data = startFormData()
    data.set('userId', 'forged')
    const handler = createRequestAccountDeletionHandler({
      getHeaders: vi.fn(),
      resolveAccess,
      verifyPassword,
      startChallenge: vi.fn(),
      scheduleCodeEmail: vi.fn(),
      revalidate: vi.fn(),
    })

    await expect(
      handler(initialAccountDeletionActionState, data),
    ).resolves.toEqual({ kind: 'invalid_password' })
    expect(resolveAccess).not.toHaveBeenCalled()
    expect(verifyPassword).not.toHaveBeenCalled()
  })

  it('does not create or email a challenge after invalid password proof', async () => {
    const startChallenge = vi.fn()
    const scheduleCodeEmail = vi.fn()
    const handler = createRequestAccountDeletionHandler({
      getHeaders: vi.fn().mockResolvedValue(new Headers()),
      resolveAccess: vi.fn().mockResolvedValue(activeAccess),
      verifyPassword: vi.fn().mockResolvedValue({ kind: 'invalid_password' }),
      startChallenge,
      scheduleCodeEmail,
      revalidate: vi.fn(),
    })

    await expect(
      handler(initialAccountDeletionActionState, startFormData()),
    ).resolves.toEqual({ kind: 'invalid_password' })
    expect(startChallenge).not.toHaveBeenCalled()
    expect(scheduleCodeEmail).not.toHaveBeenCalled()
  })

  it('schedules a code without returning it in action state', async () => {
    const scheduleCodeEmail = vi.fn()
    const delivery = {
      to: 'fixture@example.test',
      code: '00000001',
      challengeId: '33333333-3333-4333-8333-333333333333',
    }
    const handler = createRequestAccountDeletionHandler({
      getHeaders: vi.fn().mockResolvedValue(new Headers()),
      resolveAccess: vi.fn().mockResolvedValue(activeAccess),
      verifyPassword: vi.fn().mockResolvedValue({ kind: 'verified' }),
      startChallenge: vi.fn().mockResolvedValue({
        kind: 'challenge_created',
        delivery,
      }),
      scheduleCodeEmail,
      revalidate: vi.fn(),
    })

    const result = await handler(
      initialAccountDeletionActionState,
      startFormData(),
    )

    expect(result).toEqual({ kind: 'code_sent' })
    expect(JSON.stringify(result)).not.toContain(delivery.code)
    expect(scheduleCodeEmail).toHaveBeenCalledWith(delivery)
  })

  it('requires confirmation before resolving account access', async () => {
    const resolveAccess = vi.fn()
    const handler = createCompleteAccountDeletionHandler({
      resolveAccess,
      completeRequest: vi.fn(),
      scheduleRequestEmail: vi.fn(),
      revalidate: vi.fn(),
    })
    const data = completeFormData()
    data.delete('confirmation')

    await expect(
      handler(initialAccountDeletionActionState, data),
    ).resolves.toEqual({ kind: 'confirmation_required' })
    expect(resolveAccess).not.toHaveBeenCalled()
  })

  it('keeps a committed deletion successful when notification scheduling fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const handler = createCompleteAccountDeletionHandler({
      resolveAccess: vi.fn().mockResolvedValue(activeAccess),
      completeRequest: vi.fn().mockResolvedValue({
        kind: 'deletion_requested',
        purgeAfter: new Date('2026-08-25T14:30:00.000Z'),
        delivery: {
          to: 'fixture@example.test',
          purgeAfter: new Date('2026-08-25T14:30:00.000Z'),
          idempotencyValue: 'bounded-event',
        },
      }),
      scheduleRequestEmail: vi.fn(() => {
        throw new Error('private delivery error')
      }),
      revalidate: vi.fn(),
    })

    await expect(
      handler(initialAccountDeletionActionState, completeFormData()),
    ).resolves.toEqual({ kind: 'deletion_requested' })
  })

  it('allows only recoverable access to cancel', async () => {
    const cancelDeletion = vi.fn()
    const handler = createCancelAccountDeletionHandler({
      resolveAccess: vi.fn().mockResolvedValue({
        kind: 'deletion_due',
        identity: activeAccess.identity,
      }),
      cancelDeletion,
      scheduleCancellationEmail: vi.fn(),
      redirectToRestoredAccount: vi.fn(() => {
        throw new Error('redirect')
      }),
    })

    await expect(
      handler(initialAccountDeletionActionState, new FormData()),
    ).resolves.toEqual({ kind: 'deletion_due' })
    expect(cancelDeletion).not.toHaveBeenCalled()
  })

  it('answers a hydrated cancellation with focused confirmation state', async () => {
    const redirectToRestoredAccount = vi.fn(() => {
      throw new Error('redirect')
    })
    const handler = createCancelAccountDeletionHandler({
      resolveAccess: vi.fn().mockResolvedValue({
        kind: 'deletion_recoverable',
        identity: activeAccess.identity,
        purgeAfter: new Date('2026-08-08T00:00:00.000Z'),
      }),
      cancelDeletion: vi.fn().mockResolvedValue({
        kind: 'deletion_cancelled',
        recipient: 'owner@example.test',
        purgeAfter: new Date('2026-08-08T00:00:00.000Z'),
      }),
      scheduleCancellationEmail: vi.fn(),
      redirectToRestoredAccount,
    })

    await expect(
      handler(initialAccountDeletionActionState, hydratedCancelFormData()),
    ).resolves.toEqual({ kind: 'deletion_cancelled' })
    expect(redirectToRestoredAccount).not.toHaveBeenCalled()
  })

  it('redirects a cancellation submitted before hydration', async () => {
    const redirectToRestoredAccount = vi.fn(() => {
      throw new Error('redirect')
    })
    const handler = createCancelAccountDeletionHandler({
      resolveAccess: vi.fn().mockResolvedValue({
        kind: 'deletion_recoverable',
        identity: activeAccess.identity,
        purgeAfter: new Date('2026-08-08T00:00:00.000Z'),
      }),
      cancelDeletion: vi.fn().mockResolvedValue({
        kind: 'deletion_cancelled',
        recipient: 'owner@example.test',
        purgeAfter: new Date('2026-08-08T00:00:00.000Z'),
      }),
      scheduleCancellationEmail: vi.fn(),
      redirectToRestoredAccount,
    })

    await expect(
      handler(initialAccountDeletionActionState, new FormData()),
    ).rejects.toThrow('redirect')
    expect(redirectToRestoredAccount).toHaveBeenCalledTimes(1)
  })

  it('rejects a forged cancellation field before any lifecycle work', async () => {
    const resolveAccess = vi.fn()
    const data = hydratedCancelFormData()
    data.set('userId', 'forged')
    const handler = createCancelAccountDeletionHandler({
      resolveAccess,
      cancelDeletion: vi.fn(),
      scheduleCancellationEmail: vi.fn(),
      redirectToRestoredAccount: vi.fn(() => {
        throw new Error('redirect')
      }),
    })

    await expect(
      handler(initialAccountDeletionActionState, data),
    ).resolves.toEqual({ kind: 'retry' })
    expect(resolveAccess).not.toHaveBeenCalled()
  })
})

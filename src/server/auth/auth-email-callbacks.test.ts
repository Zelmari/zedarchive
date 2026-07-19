import { describe, expect, it, vi } from 'vitest'
import { createAuthEmailCallbacks } from '@/server/auth/auth-email-callbacks'
import type {
  AuthEmailDelivery,
  TransactionalEmail,
} from '@/server/email/email-delivery'

const callbackData = {
  user: { id: 'user-id', email: 'fan@example.com' },
  url: 'https://archive.example.com/api/auth/verify-email?token=private-token',
  token: 'private-token',
} as const

describe('createAuthEmailCallbacks', () => {
  it('schedules verification and recovery delivery without awaiting provider latency', async () => {
    const messages: TransactionalEmail[] = []
    const backgroundTasks: Promise<unknown>[] = []
    const releases: Array<() => void> = []
    const delivery: AuthEmailDelivery = {
      async send(message) {
        messages.push(message)
        await new Promise<void>((resolve) => releases.push(resolve))
      },
    }
    const callbacks = createAuthEmailCallbacks(
      delivery,
      vi.fn(async () => undefined),
      (promise) => backgroundTasks.push(promise),
    )

    await callbacks.sendVerificationEmail(callbackData)
    await callbacks.sendResetPassword({
      ...callbackData,
      url: 'https://archive.example.com/api/auth/reset-password/reset-token',
      token: 'reset-token',
    })

    expect(messages).toHaveLength(2)
    expect(messages.map((message) => message.category)).toEqual([
      'email_verification',
      'password_reset',
    ])
    expect(backgroundTasks).toHaveLength(2)

    for (const release of releases) {
      release()
    }

    await Promise.all(backgroundTasks)
  })

  it('awaits outstanding reset-token cleanup after a successful reset', async () => {
    const deleteOutstandingTokens = vi.fn(async () => undefined)
    const callbacks = createAuthEmailCallbacks(
      { send: vi.fn(async () => undefined) },
      deleteOutstandingTokens,
      vi.fn(),
    )

    await callbacks.afterPasswordReset('user-id')

    expect(deleteOutstandingTokens).toHaveBeenCalledOnce()
    expect(deleteOutstandingTokens).toHaveBeenCalledWith('user-id')
  })
})

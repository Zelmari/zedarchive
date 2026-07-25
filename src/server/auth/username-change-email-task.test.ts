import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { deliverCurrentUsernameChangeEmail } from '@/server/auth/username-change-email-task'

const input = {
  userId: '11111111-1111-4111-8111-111111111111',
  challengeId: '22222222-2222-4222-8222-222222222222',
  code: '12345678',
} as const

describe('deliverCurrentUsernameChangeEmail', () => {
  it('suppresses delivery when the active-account challenge lookup has no recipient', async () => {
    const readRecipient = vi.fn(async () => null)
    const send = vi.fn(async () => undefined)

    await deliverCurrentUsernameChangeEmail(
      { readRecipient, delivery: { send } },
      input,
    )

    expect(readRecipient).toHaveBeenCalledWith({
      userId: input.userId,
      challengeId: input.challengeId,
    })
    expect(send).not.toHaveBeenCalled()
  })

  it('delivers only to the recipient resolved for the still-current challenge', async () => {
    const send = vi.fn(async () => undefined)

    await deliverCurrentUsernameChangeEmail(
      {
        readRecipient: vi.fn(async () => 'fan@example.test'),
        delivery: { send },
      },
      input,
    )

    expect(send).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'fan@example.test',
        category: 'username_change',
        subject: 'Your zedarchive username change code',
      }),
    )
  })
})

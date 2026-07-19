import { describe, expect, it, vi } from 'vitest'
import type { CreateEmailResponse } from 'resend'
import type { TransactionalEmail } from '@/server/email/email-delivery'
import {
  AuthEmailDeliveryError,
  createResendEmailDelivery,
  type ResendEmailClient,
} from '@/server/email/resend-email-delivery'

const message: TransactionalEmail = {
  to: 'fan@example.com',
  subject: 'Verify your email for zedarchive',
  text: 'verification text with https://archive.example.com/private-token',
  html: '<p>verification html</p>',
  idempotencyKey: `auth-email/email_verification/${'a'.repeat(64)}`,
  category: 'email_verification',
}

const configuration = {
  fromAddress: 'accounts@auth.example.com',
  replyToAddress: 'reply@example.com',
} as const

function createClient(response: CreateEmailResponse) {
  const send = vi.fn(async () => response)
  const client: ResendEmailClient = { emails: { send } }

  return { client, send }
}

describe('createResendEmailDelivery', () => {
  it('maps one transactional message to the constrained provider request', async () => {
    const { client, send } = createClient({
      data: { id: 'provider-email-id' },
      error: null,
      headers: null,
    })
    const delivery = createResendEmailDelivery(client, configuration)

    await expect(delivery.send(message)).resolves.toBeUndefined()
    expect(send).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledWith(
      {
        from: 'zedarchive <accounts@auth.example.com>',
        replyTo: 'reply@example.com',
        to: 'fan@example.com',
        subject: message.subject,
        text: message.text,
        html: message.html,
        tags: [{ name: 'category', value: 'email_verification' }],
      },
      { idempotencyKey: message.idempotencyKey },
    )
  })

  it('translates provider-declared failures to a bounded diagnostic', async () => {
    const { client, send } = createClient({
      data: null,
      error: {
        name: 'rate_limit_exceeded',
        message: 'private provider response fan@example.com',
        statusCode: 429,
      },
      headers: null,
    })
    const delivery = createResendEmailDelivery(client, configuration)

    const error = await delivery.send(message).catch((caught) => caught)

    expect(error).toEqual(
      expect.objectContaining({
        name: 'AuthEmailDeliveryError',
        message: 'Authentication email delivery failed',
        providerCode: 'rate_limit_exceeded',
      }),
    )
    expect(JSON.stringify(error)).not.toContain('fan@example.com')
    expect(send).toHaveBeenCalledOnce()
  })

  it('sanitizes rejected network or runtime errors and does not retry', async () => {
    const send = vi.fn(async () => {
      throw new Error(
        'request to fan@example.com with private-token and re_private_key failed',
      )
    })
    const client: ResendEmailClient = { emails: { send } }
    const delivery = createResendEmailDelivery(client, configuration)

    const error = await delivery.send(message).catch((caught) => caught)

    expect(error).toBeInstanceOf(AuthEmailDeliveryError)
    expect(error).toEqual(
      expect.objectContaining({
        message: 'Authentication email delivery failed',
      }),
    )
    expect(String(error)).not.toContain('fan@example.com')
    expect(String(error)).not.toContain('private-token')
    expect(String(error)).not.toContain('re_private_key')
    expect(send).toHaveBeenCalledOnce()
  })

  it('drops an unbounded provider error name', async () => {
    const { client } = createClient({
      data: null,
      error: {
        name: 'unsafe provider error containing fan@example.com' as never,
        message: 'private body',
        statusCode: 400,
      },
      headers: null,
    })
    const delivery = createResendEmailDelivery(client, configuration)

    const error = await delivery.send(message).catch((caught) => caught)

    expect(error).toBeInstanceOf(AuthEmailDeliveryError)
    expect(error.providerCode).toBeUndefined()
  })
})

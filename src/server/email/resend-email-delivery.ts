import type {
  CreateEmailOptions,
  CreateEmailRequestOptions,
  CreateEmailResponse,
} from 'resend'
import type { AuthEmailDelivery } from '@/server/email/email-delivery'

export type ResendEmailClient = Readonly<{
  emails: Readonly<{
    send(
      payload: CreateEmailOptions,
      options?: CreateEmailRequestOptions,
    ): Promise<CreateEmailResponse>
  }>
}>

export class AuthEmailDeliveryError extends Error {
  readonly providerCode?: string

  constructor(providerCode?: string) {
    super('Authentication email delivery failed')
    this.name = 'AuthEmailDeliveryError'
    this.providerCode = providerCode
  }
}

function safeProviderCode(value: unknown): string | undefined {
  if (
    typeof value === 'string' &&
    value.length <= 64 &&
    /^[a-z0-9_-]+$/u.test(value)
  ) {
    return value
  }

  return undefined
}

export function createResendEmailDelivery(
  client: ResendEmailClient,
  configuration: Readonly<{
    fromAddress: string
    replyToAddress: string
  }>,
): AuthEmailDelivery {
  return {
    async send(message) {
      let response: CreateEmailResponse

      try {
        response = await client.emails.send(
          {
            from: `z-archive <${configuration.fromAddress}>`,
            replyTo: configuration.replyToAddress,
            to: message.to,
            subject: message.subject,
            text: message.text,
            html: message.html,
            tags: [{ name: 'category', value: message.category }],
          },
          { idempotencyKey: message.idempotencyKey },
        )
      } catch {
        throw new AuthEmailDeliveryError()
      }

      if (response.error !== null) {
        throw new AuthEmailDeliveryError(safeProviderCode(response.error.name))
      }
    },
  }
}

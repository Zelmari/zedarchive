import type { AuthEmailDelivery } from '@/server/email/email-delivery'
import {
  renderEmailVerificationMessage,
  renderPasswordResetMessage,
} from '@/server/email/auth-email-templates'

export type AuthEmailCallbackData = Readonly<{
  user: Readonly<{
    id: string
    email: string
  }>
  url: string
  token: string
}>

export type AuthEmailCallbacks = Readonly<{
  sendVerificationEmail(data: AuthEmailCallbackData): Promise<void>
  sendResetPassword(data: AuthEmailCallbackData): Promise<void>
  afterPasswordReset(userId: string): Promise<void>
}>

export function createAuthEmailCallbacks(
  delivery: AuthEmailDelivery,
  deleteOutstandingPasswordResetTokens: (userId: string) => Promise<void>,
  backgroundTaskHandler: (promise: Promise<unknown>) => void,
): AuthEmailCallbacks {
  function scheduleDelivery(message: Parameters<AuthEmailDelivery['send']>[0]) {
    backgroundTaskHandler(delivery.send(message))
  }

  return {
    async sendVerificationEmail(data) {
      scheduleDelivery({
        to: data.user.email,
        ...renderEmailVerificationMessage(data),
      })
    },
    async sendResetPassword(data) {
      scheduleDelivery({
        to: data.user.email,
        ...renderPasswordResetMessage(data),
      })
    },
    async afterPasswordReset(userId) {
      await deleteOutstandingPasswordResetTokens(userId)
    },
  }
}

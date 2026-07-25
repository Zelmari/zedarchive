import 'server-only'

import type { AuthEmailDelivery } from '@/server/email/email-delivery'
import { renderUsernameChangeCodeMessage } from '@/server/email/auth-email-templates'

export type UsernameChangeEmailTaskInput = Readonly<{
  userId: string
  code: string
  challengeId: string
}>

type UsernameChangeEmailTaskDependencies = Readonly<{
  readRecipient: (request: {
    userId: string
    challengeId: string
  }) => Promise<string | null>
  delivery: AuthEmailDelivery
}>

export async function deliverCurrentUsernameChangeEmail(
  dependencies: UsernameChangeEmailTaskDependencies,
  input: UsernameChangeEmailTaskInput,
): Promise<void> {
  const recipient = await dependencies.readRecipient({
    userId: input.userId,
    challengeId: input.challengeId,
  })
  if (recipient === null) return

  await dependencies.delivery.send({
    to: recipient,
    ...renderUsernameChangeCodeMessage(input),
  })
}

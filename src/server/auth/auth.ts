import 'server-only'

import { after } from 'next/server'
import { Resend } from 'resend'
import { readAuthEnvironment } from '@/config/auth-environment'
import { readEmailEnvironment } from '@/config/email-environment'
import {
  createAccountAccessResolver,
  createAuthoritativeSessionReader,
} from '@/server/account-access/account-access-resolver'
import { readAccountDeletionState } from '@/server/account-lifecycle/account-deletion-state'
import { createAuthEmailCallbacks } from '@/server/auth/auth-email-callbacks'
import { createAuth } from '@/server/auth/create-auth'
import {
  verifyCurrentPassword,
  type CurrentPasswordVerification,
} from '@/server/auth/verify-current-password'
import { deleteOutstandingPasswordResetTokens } from '@/server/auth/password-reset-token-cleanup'
import { deliverCurrentUsernameChangeEmail } from '@/server/auth/username-change-email-task'
import { database } from '@/server/database/client'
import { createResendEmailDelivery } from '@/server/email/resend-email-delivery'
import {
  renderAccountDeletionCancelledMessage,
  renderAccountDeletionCodeMessage,
  renderAccountDeletionRequestedMessage,
} from '@/server/email/auth-email-templates'
import { readUsernameChangeEmailRecipient } from '@/server/identity/username-change-service'

const authEnvironment = readAuthEnvironment()
const emailEnvironment = readEmailEnvironment()
const resend = new Resend(emailEnvironment.resendApiKey)
const emailDelivery = createResendEmailDelivery(resend, {
  fromAddress: emailEnvironment.fromAddress,
  replyToAddress: emailEnvironment.replyToAddress,
})
const emailCallbacks = createAuthEmailCallbacks(
  emailDelivery,
  (userId) => deleteOutstandingPasswordResetTokens(database, userId),
  after,
  authEnvironment.authUrl,
)
const accountDeletionStateReader = (userId: string) =>
  readAccountDeletionState(database, userId)

export const auth = createAuth(
  database,
  authEnvironment,
  {
    accountDeletionStateReader,
    emailCallbacks,
    backgroundTaskHandler: after,
  },
  { registrationMode: 'verified-email-required' },
)

export const resolveAccountAccess = createAccountAccessResolver(
  createAuthoritativeSessionReader((input) => auth.api.getSession(input)),
  accountDeletionStateReader,
)

export type ResolvedAccountAccess = Awaited<
  ReturnType<typeof resolveAccountAccess>
>

export function verifyCurrentAuthPassword(
  requestHeaders: Headers,
  password: string,
): Promise<CurrentPasswordVerification> {
  return verifyCurrentPassword(
    auth,
    authEnvironment.authUrl,
    requestHeaders,
    password,
  )
}

export function scheduleUsernameChangeEmail(
  input: Readonly<{
    userId: string
    code: string
    challengeId: string
  }>,
): void {
  after(
    deliverCurrentUsernameChangeEmail(
      {
        readRecipient: (request) =>
          readUsernameChangeEmailRecipient(database, request),
        delivery: emailDelivery,
      },
      input,
    ).catch(() => {
      console.error('Username change email delivery failed.')
    }),
  )
}

export function scheduleAccountDeletionCodeEmail(
  input: Readonly<{
    recipient: string
    code: string
    challengeId: string
  }>,
): void {
  after(
    emailDelivery.send({
      to: input.recipient,
      ...renderAccountDeletionCodeMessage(input),
    }),
  )
}

export function scheduleAccountDeletionRequestedEmail(
  input: Readonly<{
    recipient: string
    purgeAfter: Date
  }>,
): void {
  after(
    emailDelivery.send({
      to: input.recipient,
      ...renderAccountDeletionRequestedMessage(input),
    }),
  )
}

export function scheduleAccountDeletionCancelledEmail(
  input: Readonly<{
    recipient: string
    purgeAfter: Date
  }>,
): void {
  after(
    emailDelivery.send({
      to: input.recipient,
      ...renderAccountDeletionCancelledMessage(input),
    }),
  )
}

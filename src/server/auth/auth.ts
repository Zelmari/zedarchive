import 'server-only'

import { eq } from 'drizzle-orm'
import { after } from 'next/server'
import { Resend } from 'resend'
import { readAuthEnvironment } from '@/config/auth-environment'
import { readEmailEnvironment } from '@/config/email-environment'
import { createAuthEmailCallbacks } from '@/server/auth/auth-email-callbacks'
import { createAuth } from '@/server/auth/create-auth'
import {
  verifyCurrentPassword,
  type CurrentPasswordVerification,
} from '@/server/auth/verify-current-password'
import { deleteOutstandingPasswordResetTokens } from '@/server/auth/password-reset-token-cleanup'
import { database } from '@/server/database/client'
import { users } from '@/server/database/schema'
import { createResendEmailDelivery } from '@/server/email/resend-email-delivery'
import { renderUsernameChangeCodeMessage } from '@/server/email/auth-email-templates'

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

export const auth = createAuth(
  database,
  authEnvironment,
  {
    emailCallbacks,
    backgroundTaskHandler: after,
  },
  { registrationMode: 'verified-email-required' },
)

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
    (async () => {
      const [user] = await database
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1)
      if (user === undefined) return
      await emailDelivery.send({
        to: user.email,
        ...renderUsernameChangeCodeMessage(input),
      })
    })(),
  )
}

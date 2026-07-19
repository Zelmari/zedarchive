import 'server-only'

import { after } from 'next/server'
import { Resend } from 'resend'
import { readAuthEnvironment } from '@/config/auth-environment'
import { readEmailEnvironment } from '@/config/email-environment'
import { createAuthEmailCallbacks } from '@/server/auth/auth-email-callbacks'
import { createAuth } from '@/server/auth/create-auth'
import { deleteOutstandingPasswordResetTokens } from '@/server/auth/password-reset-token-cleanup'
import { database } from '@/server/database/client'
import { createResendEmailDelivery } from '@/server/email/resend-email-delivery'

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
)

export const auth = createAuth(database, authEnvironment, {
  emailCallbacks,
  backgroundTaskHandler: after,
})

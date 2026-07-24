'use server'

import { headers } from 'next/headers'
import { readAuthEnvironment } from '@/config/auth-environment'
import { createResendUsernameChangeCodeHandler } from '@/features/settings/actions/resend-username-change-code-handler'
import { revalidateUsernameChangePaths } from '@/features/settings/actions/username-change-action-helpers'
import type { UsernameChangeActionState } from '@/features/settings/domain/username-change'
import { auth, scheduleUsernameChangeEmail } from '@/server/auth/auth'
import { database } from '@/server/database/client'
import { resendUsernameChangeCode as resendUsernameChangeCodeService } from '@/server/identity/username-change-service'

const handler = createResendUsernameChangeCodeHandler({
  getSession: async () =>
    auth.api.getSession({
      headers: await headers(),
    }),
  resendUsernameChangeCode: (session) =>
    resendUsernameChangeCodeService(
      database,
      readAuthEnvironment().authSecret,
      session,
    ),
  scheduleEmail: scheduleUsernameChangeEmail,
  revalidate: revalidateUsernameChangePaths,
})

export async function resendUsernameChangeCode(
  previousState: UsernameChangeActionState,
  formData: FormData,
): Promise<UsernameChangeActionState> {
  return handler(previousState, formData)
}

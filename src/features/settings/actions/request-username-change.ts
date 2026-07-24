'use server'

import { headers } from 'next/headers'
import { readAuthEnvironment } from '@/config/auth-environment'
import { createRequestUsernameChangeHandler } from '@/features/settings/actions/request-username-change-handler'
import { revalidateUsernameChangePaths } from '@/features/settings/actions/username-change-action-helpers'
import type { UsernameChangeActionState } from '@/features/settings/domain/username-change'
import {
  auth,
  scheduleUsernameChangeEmail,
  verifyCurrentAuthPassword,
} from '@/server/auth/auth'
import { database } from '@/server/database/client'
import {
  preflightUsernameChange,
  requestUsernameChange as requestUsernameChangeService,
} from '@/server/identity/username-change-service'

const handler = createRequestUsernameChangeHandler({
  getHeaders: headers,
  getSession: async () =>
    auth.api.getSession({
      headers: await headers(),
    }),
  verifyPassword: verifyCurrentAuthPassword,
  preflightUsernameChange: (session, username) =>
    preflightUsernameChange(database, session, username),
  requestUsernameChange: (session, username) =>
    requestUsernameChangeService(
      database,
      readAuthEnvironment().authSecret,
      session,
      username,
    ),
  scheduleEmail: scheduleUsernameChangeEmail,
  revalidate: revalidateUsernameChangePaths,
})

export async function requestUsernameChange(
  previousState: UsernameChangeActionState,
  formData: FormData,
): Promise<UsernameChangeActionState> {
  return handler(previousState, formData)
}

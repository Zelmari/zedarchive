'use server'

import { headers } from 'next/headers'
import { readAuthEnvironment } from '@/config/auth-environment'
import { createCompleteUsernameChangeHandler } from '@/features/settings/actions/complete-username-change-handler'
import { revalidateUsernameChangePaths } from '@/features/settings/actions/username-change-action-helpers'
import type { UsernameChangeActionState } from '@/features/settings/domain/username-change'
import { resolveActiveAccountSession } from '@/features/auth/server/account-access-composition'
import { database } from '@/server/database/client'
import { completeUsernameChange as completeUsernameChangeService } from '@/server/identity/username-change-service'

const handler = createCompleteUsernameChangeHandler({
  getSession: async () => resolveActiveAccountSession(await headers()),
  completeUsernameChange: (session, code) =>
    completeUsernameChangeService(
      database,
      readAuthEnvironment().authSecret,
      session,
      code,
    ),
  revalidate: revalidateUsernameChangePaths,
})

export async function completeUsernameChange(
  previousState: UsernameChangeActionState,
  formData: FormData,
): Promise<UsernameChangeActionState> {
  return handler(previousState, formData)
}

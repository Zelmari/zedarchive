'use server'

import { headers } from 'next/headers'
import { createCancelUsernameChangeHandler } from '@/features/settings/actions/cancel-username-change-handler'
import { revalidateUsernameChangePaths } from '@/features/settings/actions/username-change-action-helpers'
import type { UsernameChangeActionState } from '@/features/settings/domain/username-change'
import { auth } from '@/server/auth/auth'
import { database } from '@/server/database/client'
import { cancelUsernameChange as cancelUsernameChangeService } from '@/server/identity/username-change-service'

const handler = createCancelUsernameChangeHandler({
  getSession: async () =>
    auth.api.getSession({
      headers: await headers(),
    }),
  cancelUsernameChange: (session) =>
    cancelUsernameChangeService(database, session),
  revalidate: revalidateUsernameChangePaths,
})

export async function cancelUsernameChange(
  previousState: UsernameChangeActionState,
  formData: FormData,
): Promise<UsernameChangeActionState> {
  return handler(previousState, formData)
}

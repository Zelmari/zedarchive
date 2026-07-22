'use server'

import { headers } from 'next/headers'
import { createUpdateAnimeEntryStatusHandler } from '@/features/archive/actions/update-anime-entry-status-handler'
import type { UpdateAnimeEntryStatusActionState } from '@/features/archive/domain/update-anime-entry-status'
import { auth } from '@/server/auth/auth'
import { database } from '@/server/database/client'
import { updateAnimeEntryStatus as updateStoredAnimeEntryStatus } from '@/server/database/anime-entry-service'

const updateAnimeEntryStatusHandler = createUpdateAnimeEntryStatusHandler({
  getSession: async () =>
    auth.api.getSession({
      headers: await headers(),
    }),
  updateEntryStatus: (request) =>
    updateStoredAnimeEntryStatus(database, request),
})

export async function updateAnimeEntryStatus(
  previousState: UpdateAnimeEntryStatusActionState,
  formData: FormData,
): Promise<UpdateAnimeEntryStatusActionState> {
  return updateAnimeEntryStatusHandler(previousState, formData)
}

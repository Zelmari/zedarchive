'use server'

import { headers } from 'next/headers'
import { createUpdateAnimeEntryStatusHandler } from '@/features/archive/actions/update-anime-entry-status-handler'
import type { UpdateAnimeEntryStatusActionState } from '@/features/archive/domain/update-anime-entry-status'
import { resolveActiveAccountSession } from '@/features/auth/server/account-access-composition'
import { database } from '@/server/database/client'
import { updateAnimeEntryStatus as updateStoredAnimeEntryStatus } from '@/server/database/anime-entry-service'

const updateAnimeEntryStatusHandler = createUpdateAnimeEntryStatusHandler({
  getSession: async () => resolveActiveAccountSession(await headers()),
  updateEntryStatus: (request) =>
    updateStoredAnimeEntryStatus(database, request),
})

export async function updateAnimeEntryStatus(
  previousState: UpdateAnimeEntryStatusActionState,
  formData: FormData,
): Promise<UpdateAnimeEntryStatusActionState> {
  return updateAnimeEntryStatusHandler(previousState, formData)
}

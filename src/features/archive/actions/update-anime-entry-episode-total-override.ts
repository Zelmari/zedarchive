'use server'

import { headers } from 'next/headers'
import { createUpdateAnimeEntryEpisodeTotalOverrideHandler } from '@/features/archive/actions/update-anime-entry-episode-total-override-handler'
import type { UpdateAnimeEntryEpisodeTotalActionState } from '@/features/archive/domain/update-anime-entry-episode-total'
import { resolveActiveAccountSession } from '@/features/auth/server/account-access-composition'
import { database } from '@/server/database/client'
import { updateAnimeEntryEpisodeTotalOverride as updateStoredEpisodeTotalOverride } from '@/server/database/anime-entry-episode-progress-service'

const handler = createUpdateAnimeEntryEpisodeTotalOverrideHandler({
  getSession: async () => resolveActiveAccountSession(await headers()),
  updateEpisodeTotalOverride: (request) =>
    updateStoredEpisodeTotalOverride(database, request),
})
export async function updateAnimeEntryEpisodeTotalOverride(
  previousState: UpdateAnimeEntryEpisodeTotalActionState,
  formData: FormData,
) {
  return handler(previousState, formData)
}

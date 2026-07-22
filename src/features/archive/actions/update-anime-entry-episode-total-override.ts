'use server'

import { headers } from 'next/headers'
import { createUpdateAnimeEntryEpisodeTotalOverrideHandler } from '@/features/archive/actions/update-anime-entry-episode-total-override-handler'
import type { UpdateAnimeEntryEpisodeTotalActionState } from '@/features/archive/domain/update-anime-entry-episode-total'
import { auth } from '@/server/auth/auth'
import { database } from '@/server/database/client'
import { updateAnimeEntryEpisodeTotalOverride as updateStoredEpisodeTotalOverride } from '@/server/database/anime-entry-episode-progress-service'

const handler = createUpdateAnimeEntryEpisodeTotalOverrideHandler({
  getSession: async () => auth.api.getSession({ headers: await headers() }),
  updateEpisodeTotalOverride: (request) =>
    updateStoredEpisodeTotalOverride(database, request),
})
export async function updateAnimeEntryEpisodeTotalOverride(
  previousState: UpdateAnimeEntryEpisodeTotalActionState,
  formData: FormData,
) {
  return handler(previousState, formData)
}

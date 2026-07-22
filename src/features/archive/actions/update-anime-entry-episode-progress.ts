'use server'

import { headers } from 'next/headers'
import { createUpdateAnimeEntryEpisodeProgressHandler } from '@/features/archive/actions/update-anime-entry-episode-progress-handler'
import type { UpdateAnimeEntryEpisodeProgressActionState } from '@/features/archive/domain/update-anime-entry-episode-progress'
import { auth } from '@/server/auth/auth'
import { database } from '@/server/database/client'
import { updateAnimeEntryEpisodeProgress as updateStoredEpisodeProgress } from '@/server/database/anime-entry-episode-progress-service'

const handler = createUpdateAnimeEntryEpisodeProgressHandler({
  getSession: async () => auth.api.getSession({ headers: await headers() }),
  updateEpisodeProgress: (request) =>
    updateStoredEpisodeProgress(database, request),
})
export async function updateAnimeEntryEpisodeProgress(
  previousState: UpdateAnimeEntryEpisodeProgressActionState,
  formData: FormData,
) {
  return handler(previousState, formData)
}

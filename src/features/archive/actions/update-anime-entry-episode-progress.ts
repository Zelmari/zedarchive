'use server'

import { headers } from 'next/headers'
import { createUpdateAnimeEntryEpisodeProgressHandler } from '@/features/archive/actions/update-anime-entry-episode-progress-handler'
import type { UpdateAnimeEntryEpisodeProgressActionState } from '@/features/archive/domain/update-anime-entry-episode-progress'
import { resolveActiveAccountSession } from '@/features/auth/server/account-access-composition'
import { database } from '@/server/database/client'
import { updateAnimeEntryEpisodeProgress as updateStoredEpisodeProgress } from '@/server/database/anime-entry-episode-progress-service'

const handler = createUpdateAnimeEntryEpisodeProgressHandler({
  getSession: async () => resolveActiveAccountSession(await headers()),
  updateEpisodeProgress: (request) =>
    updateStoredEpisodeProgress(database, request),
})
export async function updateAnimeEntryEpisodeProgress(
  previousState: UpdateAnimeEntryEpisodeProgressActionState,
  formData: FormData,
) {
  return handler(previousState, formData)
}

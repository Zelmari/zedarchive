'use server'

import { headers } from 'next/headers'
import { createUpdateAnimeEntryRatingHandler } from '@/features/archive/actions/update-anime-entry-rating-handler'
import type { UpdateAnimeEntryRatingActionState } from '@/features/archive/domain/update-anime-entry-rating'
import { resolveActiveAccountSession } from '@/features/auth/server/account-access-composition'
import { database } from '@/server/database/client'
import { updateAnimeEntryRating as updateStoredAnimeEntryRating } from '@/server/database/anime-entry-rating-service'

const handler = createUpdateAnimeEntryRatingHandler({
  getSession: async () => resolveActiveAccountSession(await headers()),
  updateRating: (request) => updateStoredAnimeEntryRating(database, request),
})

export async function updateAnimeEntryRating(
  previousState: UpdateAnimeEntryRatingActionState,
  formData: FormData,
): Promise<UpdateAnimeEntryRatingActionState> {
  return handler(previousState, formData)
}

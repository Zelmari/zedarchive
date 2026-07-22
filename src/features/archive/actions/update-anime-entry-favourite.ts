'use server'

import { headers } from 'next/headers'
import { createUpdateAnimeEntryFavouriteHandler } from '@/features/archive/actions/update-anime-entry-favourite-handler'
import type { UpdateAnimeEntryFavouriteActionState } from '@/features/archive/domain/update-anime-entry-favourite'
import { auth } from '@/server/auth/auth'
import { database } from '@/server/database/client'
import { updateAnimeEntryFavourite as updateStoredFavourite } from '@/server/database/anime-entry-favourite-service'

const handler = createUpdateAnimeEntryFavouriteHandler({
  getSession: async () => auth.api.getSession({ headers: await headers() }),
  updateFavourite: (request) => updateStoredFavourite(database, request),
})

export async function updateAnimeEntryFavourite(
  previousState: UpdateAnimeEntryFavouriteActionState,
  formData: FormData,
): Promise<UpdateAnimeEntryFavouriteActionState> {
  return handler(previousState, formData)
}

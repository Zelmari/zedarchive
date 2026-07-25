'use server'

import { headers } from 'next/headers'
import { createUpdateAnimeEntryFavouriteHandler } from '@/features/archive/actions/update-anime-entry-favourite-handler'
import type { UpdateAnimeEntryFavouriteActionState } from '@/features/archive/domain/update-anime-entry-favourite'
import { resolveActiveAccountSession } from '@/features/auth/server/account-access-composition'
import { database } from '@/server/database/client'
import { updateAnimeEntryFavourite as updateStoredFavourite } from '@/server/database/anime-entry-favourite-service'

const handler = createUpdateAnimeEntryFavouriteHandler({
  getSession: async () => resolveActiveAccountSession(await headers()),
  updateFavourite: (request) => updateStoredFavourite(database, request),
})

export async function updateAnimeEntryFavourite(
  previousState: UpdateAnimeEntryFavouriteActionState,
  formData: FormData,
): Promise<UpdateAnimeEntryFavouriteActionState> {
  return handler(previousState, formData)
}

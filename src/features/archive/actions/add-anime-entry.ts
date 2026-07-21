'use server'

import { headers } from 'next/headers'
import { type AddAnimeEntryActionState } from '@/features/archive/domain/add-anime-entry'
import { createAddAnimeEntryHandler } from '@/features/archive/actions/add-anime-entry-handler'
import { auth } from '@/server/auth/auth'
import { database } from '@/server/database/client'
import { createAnimeEntry } from '@/server/database/anime-entry-service'

const addAnimeEntryHandler = createAddAnimeEntryHandler({
  getSession: async () =>
    auth.api.getSession({
      headers: await headers(),
    }),
  createEntry: (request) => createAnimeEntry(database, request),
})

export async function addAnimeEntry(
  previousState: AddAnimeEntryActionState,
  formData: FormData,
): Promise<AddAnimeEntryActionState> {
  return addAnimeEntryHandler(previousState, formData)
}

'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createRemoveAnimeEntryHandler } from '@/features/archive/actions/remove-anime-entry-handler'
import type { RemoveAnimeEntryActionState } from '@/features/archive/domain/remove-anime-entry'
import { resolveActiveAccountSession } from '@/features/auth/server/account-access-composition'
import { database } from '@/server/database/client'
import { removeAnimeEntry as removeStoredAnimeEntry } from '@/server/database/anime-entry-removal-service'

const handler = createRemoveAnimeEntryHandler({
  getSession: async () => resolveActiveAccountSession(await headers()),
  removeEntry: (request) => removeStoredAnimeEntry(database, request),
})

export async function removeAnimeEntry(
  previousState: RemoveAnimeEntryActionState,
  formData: FormData,
): Promise<RemoveAnimeEntryActionState> {
  const result = await handler(previousState, formData)
  if (result.kind === 'removed') {
    revalidatePath('/archive/anime')
  }
  return result
}

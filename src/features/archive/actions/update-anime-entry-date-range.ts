'use server'

import { headers } from 'next/headers'
import { createUpdateAnimeEntryDateRangeHandler } from '@/features/archive/actions/update-anime-entry-date-range-handler'
import type { UpdateAnimeEntryDateRangeActionState } from '@/features/archive/domain/update-anime-entry-date-range'
import { resolveActiveAccountSession } from '@/features/auth/server/account-access-composition'
import { database } from '@/server/database/client'
import { updateAnimeEntryDateRange as updateStoredDateRange } from '@/server/database/anime-entry-date-range-service'

const handler = createUpdateAnimeEntryDateRangeHandler({
  getSession: async () => resolveActiveAccountSession(await headers()),
  updateDateRange: (request) => updateStoredDateRange(database, request),
})

export async function updateAnimeEntryDateRange(
  previousState: UpdateAnimeEntryDateRangeActionState,
  formData: FormData,
): Promise<UpdateAnimeEntryDateRangeActionState> {
  return handler(previousState, formData)
}

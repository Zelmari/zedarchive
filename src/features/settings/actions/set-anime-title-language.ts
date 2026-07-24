'use server'

import { headers } from 'next/headers'
import { createSetAnimeTitleLanguageHandler } from '@/features/settings/actions/set-anime-title-language-handler'
import { revalidateCataloguePreferencePaths } from '@/features/settings/actions/catalogue-preference-action-helpers'
import type { CataloguePreferenceActionState } from '@/features/settings/domain/catalogue-preferences'
import { auth } from '@/server/auth/auth'
import { database } from '@/server/database/client'
import { setUserAnimeTitleLanguage } from '@/server/database/user-catalogue-preferences-service'

const handler = createSetAnimeTitleLanguageHandler({
  getSession: async () =>
    auth.api.getSession({
      headers: await headers(),
    }),
  setTitleLanguage: (request) => setUserAnimeTitleLanguage(database, request),
  revalidate: revalidateCataloguePreferencePaths,
})

export async function setAnimeTitleLanguage(
  previousState: CataloguePreferenceActionState,
  formData: FormData,
): Promise<CataloguePreferenceActionState> {
  return handler(previousState, formData)
}

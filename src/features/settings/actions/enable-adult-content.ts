'use server'

import { headers } from 'next/headers'
import { createEnableAdultContentHandler } from '@/features/settings/actions/enable-adult-content-handler'
import { revalidateCataloguePreferencePaths } from '@/features/settings/actions/catalogue-preference-action-helpers'
import type { CataloguePreferenceActionState } from '@/features/settings/domain/catalogue-preferences'
import { auth } from '@/server/auth/auth'
import { database } from '@/server/database/client'
import { enableUserAdultContent } from '@/server/database/user-catalogue-preferences-service'

const handler = createEnableAdultContentHandler({
  getSession: async () =>
    auth.api.getSession({
      headers: await headers(),
    }),
  enableAdultContent: (request) => enableUserAdultContent(database, request),
  revalidate: revalidateCataloguePreferencePaths,
})

export async function enableAdultContent(
  previousState: CataloguePreferenceActionState,
  formData: FormData,
): Promise<CataloguePreferenceActionState> {
  return handler(previousState, formData)
}

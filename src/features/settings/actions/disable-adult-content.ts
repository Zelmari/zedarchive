'use server'

import { headers } from 'next/headers'
import { createDisableAdultContentHandler } from '@/features/settings/actions/disable-adult-content-handler'
import { revalidateCataloguePreferencePaths } from '@/features/settings/actions/catalogue-preference-action-helpers'
import type { CataloguePreferenceActionState } from '@/features/settings/domain/catalogue-preferences'
import { auth } from '@/server/auth/auth'
import { database } from '@/server/database/client'
import { disableUserAdultContent } from '@/server/database/user-catalogue-preferences-service'

const handler = createDisableAdultContentHandler({
  getSession: async () =>
    auth.api.getSession({
      headers: await headers(),
    }),
  disableAdultContent: (request) => disableUserAdultContent(database, request),
  revalidate: revalidateCataloguePreferencePaths,
})

export async function disableAdultContent(
  previousState: CataloguePreferenceActionState,
  formData: FormData,
): Promise<CataloguePreferenceActionState> {
  return handler(previousState, formData)
}

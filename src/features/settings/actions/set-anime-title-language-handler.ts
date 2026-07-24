import 'server-only'

import {
  parseSetAnimeTitleLanguageFormData,
  type AnimeTitleLanguage,
  type CataloguePreferenceActionState,
  type CataloguePreferenceMutationResult,
} from '@/features/settings/domain/catalogue-preferences'
import type { CataloguePreferenceSession } from '@/features/settings/actions/catalogue-preference-action-helpers'

type Dependencies = {
  getSession: () => Promise<CataloguePreferenceSession>
  setTitleLanguage: (request: {
    userId: string
    titleLanguage: AnimeTitleLanguage
  }) => Promise<CataloguePreferenceMutationResult>
  revalidate: () => void
}

export function createSetAnimeTitleLanguageHandler({
  getSession,
  setTitleLanguage,
  revalidate,
}: Dependencies) {
  return async function setAnimeTitleLanguageHandler(
    _previousState: CataloguePreferenceActionState,
    formData: FormData,
  ): Promise<CataloguePreferenceActionState> {
    const parsedInput = parseSetAnimeTitleLanguageFormData(formData)

    if (parsedInput.kind !== 'valid') return parsedInput

    let session: CataloguePreferenceSession

    try {
      session = await getSession()
    } catch {
      console.error('Catalogue title preference session lookup failed.')
      return { kind: 'session_unavailable' }
    }

    const userId = session?.user?.id

    if (typeof userId !== 'string' || userId.length === 0) {
      return { kind: 'sign_in_required' }
    }

    let result: CataloguePreferenceMutationResult

    try {
      result = await setTitleLanguage({
        userId,
        titleLanguage: parsedInput.titleLanguage,
      })
    } catch {
      console.error('Catalogue title preference update failed.')
      return { kind: 'retry' }
    }

    try {
      revalidate()
    } catch {
      console.error('Catalogue preference revalidation failed.')
    }

    return result
  }
}

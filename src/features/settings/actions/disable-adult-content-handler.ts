import 'server-only'

import type { CataloguePreferenceSession } from '@/features/settings/actions/catalogue-preference-action-helpers'
import {
  parseDisableAdultContentFormData,
  type CataloguePreferenceActionState,
  type CataloguePreferenceMutationResult,
} from '@/features/settings/domain/catalogue-preferences'

type Dependencies = {
  getSession: () => Promise<CataloguePreferenceSession>
  disableAdultContent: (request: {
    userId: string
  }) => Promise<CataloguePreferenceMutationResult>
  revalidate: () => void
}

export function createDisableAdultContentHandler({
  getSession,
  disableAdultContent,
  revalidate,
}: Dependencies) {
  return async function disableAdultContentHandler(
    _previousState: CataloguePreferenceActionState,
    formData: FormData,
  ): Promise<CataloguePreferenceActionState> {
    const parsedInput = parseDisableAdultContentFormData(formData)

    if (parsedInput.kind !== 'valid') return parsedInput

    let session: CataloguePreferenceSession

    try {
      session = await getSession()
    } catch {
      console.error('Adult content preference session lookup failed.')
      return { kind: 'session_unavailable' }
    }

    const userId = session?.user?.id

    if (typeof userId !== 'string' || userId.length === 0) {
      return { kind: 'sign_in_required' }
    }

    let result: CataloguePreferenceMutationResult

    try {
      result = await disableAdultContent({ userId })
    } catch {
      console.error('Adult content preference disable failed.')
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

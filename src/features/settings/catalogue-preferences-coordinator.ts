import type { UserCataloguePreferences } from '@/features/settings/domain/catalogue-preferences'

type Session = { user?: { id?: string } } | null

type Dependencies = {
  getSession: () => Promise<Session>
  readPreferences: (request: {
    userId: string
  }) => Promise<UserCataloguePreferences>
}

export type CataloguePreferencesPageModel =
  | { kind: 'signed_out' }
  | { kind: 'unavailable' }
  | { kind: 'available'; preferences: UserCataloguePreferences }

export function createCataloguePreferencesCoordinator({
  getSession,
  readPreferences,
}: Dependencies) {
  return async function coordinateCataloguePreferences(): Promise<CataloguePreferencesPageModel> {
    let session: Session

    try {
      session = await getSession()
    } catch {
      console.error('Settings session lookup failed.')
      return { kind: 'unavailable' }
    }

    const userId = session?.user?.id

    if (typeof userId !== 'string' || userId.length === 0) {
      return { kind: 'signed_out' }
    }

    try {
      return {
        kind: 'available',
        preferences: await readPreferences({ userId }),
      }
    } catch {
      console.error('Catalogue preferences read failed.')
      return { kind: 'unavailable' }
    }
  }
}

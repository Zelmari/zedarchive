import type { UserCataloguePreferences } from '@/features/settings/domain/catalogue-preferences'
import type { UsernameChangePageState } from '@/features/settings/domain/username-change'

type Session = {
  user?: { id?: string }
  session?: { id?: string }
} | null

type Dependencies = {
  getSession: () => Promise<Session>
  readPreferences: (request: {
    userId: string
  }) => Promise<UserCataloguePreferences>
  readUsernameChangeState: (request: {
    userId: string
    sessionId: string
  }) => Promise<
    | Exclude<UsernameChangePageState, { kind: 'unavailable' }>
    | { kind: 'session_invalid' }
  >
}

export type SettingsPageModel =
  | { kind: 'signed_out' }
  | { kind: 'unavailable' }
  | {
      kind: 'available'
      catalogue:
        | { kind: 'available'; preferences: UserCataloguePreferences }
        | { kind: 'unavailable' }
      username: UsernameChangePageState
    }

export function createSettingsPageCoordinator({
  getSession,
  readPreferences,
  readUsernameChangeState,
}: Dependencies) {
  return async function coordinateSettingsPage(): Promise<SettingsPageModel> {
    let session: Session
    try {
      session = await getSession()
    } catch {
      console.error('Settings session lookup failed.')
      return { kind: 'unavailable' }
    }

    const userId = session?.user?.id
    const sessionId = session?.session?.id
    if (typeof userId !== 'string' || userId.length === 0) {
      return { kind: 'signed_out' }
    }
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      console.error('Settings session identity was unavailable.')
      return { kind: 'unavailable' }
    }

    const [preferencesResult, usernameResult] = await Promise.allSettled([
      readPreferences({ userId }),
      readUsernameChangeState({ userId, sessionId }),
    ])

    const catalogue =
      preferencesResult.status === 'fulfilled'
        ? { kind: 'available' as const, preferences: preferencesResult.value }
        : { kind: 'unavailable' as const }
    if (preferencesResult.status === 'rejected') {
      console.error('Catalogue preferences read failed.')
    }

    const username =
      usernameResult.status === 'fulfilled' &&
      usernameResult.value.kind !== 'session_invalid'
        ? usernameResult.value
        : { kind: 'unavailable' as const }
    if (usernameResult.status === 'rejected') {
      console.error('Username change settings read failed.')
    }
    if (
      usernameResult.status === 'fulfilled' &&
      usernameResult.value.kind === 'session_invalid'
    ) {
      console.error('Username change session identity was invalid.')
    }

    return { kind: 'available', catalogue, username }
  }
}

import 'server-only'

import {
  parseRemoveAnimeEntryFormData,
  type RemoveAnimeEntryActionState,
  type RemoveAnimeEntryInput,
  type RemoveAnimeEntryResult,
} from '@/features/archive/domain/remove-anime-entry'

type Session = { user?: { id?: string } } | null
type Request = RemoveAnimeEntryInput & { userId: string }
type Dependencies = {
  getSession: () => Promise<Session>
  removeEntry: (request: Request) => Promise<RemoveAnimeEntryResult>
}

export function createRemoveAnimeEntryHandler({
  getSession,
  removeEntry,
}: Dependencies) {
  return async function removeAnimeEntryHandler(
    _previousState: RemoveAnimeEntryActionState,
    formData: FormData,
  ): Promise<RemoveAnimeEntryActionState> {
    const parsed = parseRemoveAnimeEntryFormData(formData)
    if (parsed.kind !== 'valid') return parsed

    let session: Session
    try {
      session = await getSession()
    } catch {
      console.error('Anime entry removal session lookup failed.')
      return { kind: 'session_unavailable' }
    }

    const userId = session?.user?.id
    if (typeof userId !== 'string' || userId.length === 0) {
      return { kind: 'sign_in_required' }
    }

    try {
      return await removeEntry({ ...parsed.input, userId })
    } catch {
      console.error('Anime entry removal failed.')
      return { kind: 'retry' }
    }
  }
}

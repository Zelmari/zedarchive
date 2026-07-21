import 'server-only'

import {
  parseAddAnimeEntryFormData,
  type AddAnimeEntryActionState,
} from '@/features/archive/domain/add-anime-entry'
import type {
  CreateAnimeEntryRequest,
  CreateAnimeEntryResult,
} from '@/server/database/anime-entry-service'

type Session = { user?: { id?: string } } | null

type AddAnimeEntryActionDependencies = {
  getSession: () => Promise<Session>
  createEntry: (
    request: CreateAnimeEntryRequest,
  ) => Promise<CreateAnimeEntryResult>
}

export function createAddAnimeEntryHandler({
  getSession,
  createEntry,
}: AddAnimeEntryActionDependencies) {
  return async function addAnimeEntryHandler(
    _previousState: AddAnimeEntryActionState,
    formData: FormData,
  ): Promise<AddAnimeEntryActionState> {
    const parsedInput = parseAddAnimeEntryFormData(formData)

    if (parsedInput.kind === 'invalid_status') {
      return { kind: 'invalid_status' }
    }

    if (parsedInput.kind === 'unavailable') {
      return { kind: 'unavailable' }
    }

    let session: Session

    try {
      session = await getSession()
    } catch {
      console.error('Add anime entry session lookup failed.')
      return { kind: 'session_unavailable' }
    }

    const userId = session?.user?.id

    if (typeof userId !== 'string' || userId.length === 0) {
      return { kind: 'sign_in_required' }
    }

    try {
      return await createEntry({ ...parsedInput.input, userId })
    } catch {
      console.error('Add anime entry creation failed.')
      return { kind: 'retry' }
    }
  }
}

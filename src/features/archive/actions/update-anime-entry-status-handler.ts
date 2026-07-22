import 'server-only'

import {
  parseUpdateAnimeEntryStatusFormData,
  type UpdateAnimeEntryStatusActionState,
} from '@/features/archive/domain/update-anime-entry-status'
import type {
  UpdateAnimeEntryStatusRequest,
  UpdateAnimeEntryStatusResult,
} from '@/server/database/anime-entry-service'

type Session = { user?: { id?: string } } | null

type UpdateAnimeEntryStatusActionDependencies = {
  getSession: () => Promise<Session>
  updateEntryStatus: (
    request: UpdateAnimeEntryStatusRequest,
  ) => Promise<UpdateAnimeEntryStatusResult>
}

export function createUpdateAnimeEntryStatusHandler({
  getSession,
  updateEntryStatus,
}: UpdateAnimeEntryStatusActionDependencies) {
  return async function updateAnimeEntryStatusHandler(
    _previousState: UpdateAnimeEntryStatusActionState,
    formData: FormData,
  ): Promise<UpdateAnimeEntryStatusActionState> {
    const parsedInput = parseUpdateAnimeEntryStatusFormData(formData)

    if (parsedInput.kind !== 'valid') {
      return parsedInput
    }

    let session: Session

    try {
      session = await getSession()
    } catch {
      console.error('Anime entry status session lookup failed.')
      return { kind: 'session_unavailable' }
    }

    const userId = session?.user?.id

    if (typeof userId !== 'string' || userId.length === 0) {
      return { kind: 'sign_in_required' }
    }

    try {
      return await updateEntryStatus({
        ...parsedInput.input,
        userId,
      })
    } catch {
      console.error('Anime entry status update failed.')
      return { kind: 'retry' }
    }
  }
}

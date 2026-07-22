import 'server-only'

import {
  parseUpdateAnimeEntryDateRangeFormData,
  type DateRangeMutationResult,
  type UpdateAnimeEntryDateRangeActionState,
  type UpdateAnimeEntryDateRangeInput,
} from '@/features/archive/domain/update-anime-entry-date-range'

type Session = { user?: { id?: string } } | null
type Request = UpdateAnimeEntryDateRangeInput & { userId: string }
type Dependencies = {
  getSession: () => Promise<Session>
  updateDateRange: (request: Request) => Promise<DateRangeMutationResult>
}

export function createUpdateAnimeEntryDateRangeHandler({
  getSession,
  updateDateRange,
}: Dependencies) {
  return async function updateAnimeEntryDateRangeHandler(
    _previousState: UpdateAnimeEntryDateRangeActionState,
    formData: FormData,
  ): Promise<UpdateAnimeEntryDateRangeActionState> {
    const parsed = parseUpdateAnimeEntryDateRangeFormData(formData)
    if (parsed.kind !== 'valid') return parsed

    let session: Session
    try {
      session = await getSession()
    } catch {
      console.error('Anime entry date range session lookup failed.')
      return { kind: 'session_unavailable' }
    }

    const userId = session?.user?.id
    if (typeof userId !== 'string' || userId.length === 0)
      return { kind: 'sign_in_required' }

    try {
      return await updateDateRange({ ...parsed.input, userId })
    } catch {
      console.error('Anime entry date range update failed.')
      return { kind: 'retry' }
    }
  }
}

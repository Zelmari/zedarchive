import 'server-only'

import {
  parseUpdateAnimeEntryRatingFormData,
  type RatingMutationResult,
  type UpdateAnimeEntryRatingActionState,
  type UpdateAnimeEntryRatingInput,
} from '@/features/archive/domain/update-anime-entry-rating'

type Session = { user?: { id?: string } } | null
type Request = UpdateAnimeEntryRatingInput & { userId: string }
type Dependencies = {
  getSession: () => Promise<Session>
  updateRating: (request: Request) => Promise<RatingMutationResult>
}

export function createUpdateAnimeEntryRatingHandler({
  getSession,
  updateRating,
}: Dependencies) {
  return async function updateAnimeEntryRatingHandler(
    _previousState: UpdateAnimeEntryRatingActionState,
    formData: FormData,
  ): Promise<UpdateAnimeEntryRatingActionState> {
    const parsed = parseUpdateAnimeEntryRatingFormData(formData)
    if (parsed.kind !== 'valid') return parsed

    let session: Session
    try {
      session = await getSession()
    } catch {
      console.error('Anime entry rating session lookup failed.')
      return { kind: 'session_unavailable' }
    }

    const userId = session?.user?.id
    if (typeof userId !== 'string' || userId.length === 0)
      return { kind: 'sign_in_required' }

    try {
      return await updateRating({ ...parsed.input, userId })
    } catch {
      console.error('Anime entry rating update failed.')
      return { kind: 'retry' }
    }
  }
}

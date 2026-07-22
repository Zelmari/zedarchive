import 'server-only'

import {
  parseUpdateAnimeEntryFavouriteFormData,
  type FavouriteMutationResult,
  type UpdateAnimeEntryFavouriteActionState,
  type UpdateAnimeEntryFavouriteInput,
} from '@/features/archive/domain/update-anime-entry-favourite'

type Session = { user?: { id?: string } } | null
type Request = UpdateAnimeEntryFavouriteInput & { userId: string }
type Dependencies = {
  getSession: () => Promise<Session>
  updateFavourite: (request: Request) => Promise<FavouriteMutationResult>
}

export function createUpdateAnimeEntryFavouriteHandler({
  getSession,
  updateFavourite,
}: Dependencies) {
  return async function updateAnimeEntryFavouriteHandler(
    _previousState: UpdateAnimeEntryFavouriteActionState,
    formData: FormData,
  ): Promise<UpdateAnimeEntryFavouriteActionState> {
    const parsed = parseUpdateAnimeEntryFavouriteFormData(formData)
    if (parsed.kind !== 'valid') return parsed

    let session: Session
    try {
      session = await getSession()
    } catch {
      console.error('Anime entry favourite session lookup failed.')
      return { kind: 'session_unavailable' }
    }

    const userId = session?.user?.id
    if (typeof userId !== 'string' || userId.length === 0)
      return { kind: 'sign_in_required' }

    try {
      return await updateFavourite({ ...parsed.input, userId })
    } catch {
      console.error('Anime entry favourite update failed.')
      return { kind: 'retry' }
    }
  }
}

import 'server-only'
import {
  parseUpdateAnimeEntryEpisodeProgressFormData,
  type EpisodeProgressMutationResult,
  type UpdateAnimeEntryEpisodeProgressActionState,
  type UpdateAnimeEntryEpisodeProgressInput,
} from '@/features/archive/domain/update-anime-entry-episode-progress'

type Session = { user?: { id?: string } } | null
type Request = UpdateAnimeEntryEpisodeProgressInput & { userId: string }
type Dependencies = {
  getSession: () => Promise<Session>
  updateEpisodeProgress: (
    request: Request,
  ) => Promise<EpisodeProgressMutationResult>
}

export function createUpdateAnimeEntryEpisodeProgressHandler({
  getSession,
  updateEpisodeProgress,
}: Dependencies) {
  return async function updateAnimeEntryEpisodeProgressHandler(
    _previousState: UpdateAnimeEntryEpisodeProgressActionState,
    formData: FormData,
  ): Promise<UpdateAnimeEntryEpisodeProgressActionState> {
    const parsed = parseUpdateAnimeEntryEpisodeProgressFormData(formData)
    if (parsed.kind !== 'valid') return parsed
    let session: Session
    try {
      session = await getSession()
    } catch {
      console.error('Anime entry episode progress session lookup failed.')
      return { kind: 'session_unavailable' }
    }
    const userId = session?.user?.id
    if (typeof userId !== 'string' || userId.length === 0)
      return { kind: 'sign_in_required' }
    try {
      return await updateEpisodeProgress({ ...parsed.input, userId })
    } catch {
      console.error('Anime entry episode progress update failed.')
      return { kind: 'retry' }
    }
  }
}

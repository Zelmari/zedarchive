import 'server-only'
import {
  parseUpdateAnimeEntryEpisodeTotalFormData,
  type EpisodeTotalMutationResult,
  type UpdateAnimeEntryEpisodeTotalActionState,
  type UpdateAnimeEntryEpisodeTotalInput,
} from '@/features/archive/domain/update-anime-entry-episode-total'

type Session = { user?: { id?: string } } | null
type Request = UpdateAnimeEntryEpisodeTotalInput & { userId: string }
type Dependencies = {
  getSession: () => Promise<Session>
  updateEpisodeTotalOverride: (
    request: Request,
  ) => Promise<EpisodeTotalMutationResult>
}
export function createUpdateAnimeEntryEpisodeTotalOverrideHandler({
  getSession,
  updateEpisodeTotalOverride,
}: Dependencies) {
  return async function updateAnimeEntryEpisodeTotalOverrideHandler(
    _previousState: UpdateAnimeEntryEpisodeTotalActionState,
    formData: FormData,
  ): Promise<UpdateAnimeEntryEpisodeTotalActionState> {
    const parsed = parseUpdateAnimeEntryEpisodeTotalFormData(formData)
    if (parsed.kind !== 'valid') return parsed
    let session: Session
    try {
      session = await getSession()
    } catch {
      console.error('Anime entry episode total session lookup failed.')
      return { kind: 'session_unavailable' }
    }
    const userId = session?.user?.id
    if (typeof userId !== 'string' || userId.length === 0)
      return { kind: 'sign_in_required' }
    try {
      return await updateEpisodeTotalOverride({ ...parsed.input, userId })
    } catch {
      console.error('Anime entry episode total update failed.')
      return { kind: 'retry' }
    }
  }
}

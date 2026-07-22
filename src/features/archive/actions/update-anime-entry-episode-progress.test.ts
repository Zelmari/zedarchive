import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { createUpdateAnimeEntryEpisodeProgressHandler } from '@/features/archive/actions/update-anime-entry-episode-progress-handler'
import { initialUpdateAnimeEntryEpisodeProgressActionState } from '@/features/archive/domain/update-anime-entry-episode-progress'
const entryId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'
const form = () => {
  const value = new FormData()
  value.set('entryId', entryId)
  value.set('expectedEpisodeProgress', '0')
  value.set('requestedEpisodeProgress', '12')
  return value
}
describe('episode progress action', () => {
  it('parses before session work', async () => {
    const getSession = vi.fn()
    const updateEpisodeProgress = vi.fn()
    const action = createUpdateAnimeEntryEpisodeProgressHandler({
      getSession,
      updateEpisodeProgress,
    })
    const invalid = form()
    invalid.set('requestedEpisodeProgress', '1e2')
    await expect(
      action(initialUpdateAnimeEntryEpisodeProgressActionState, invalid),
    ).resolves.toEqual({ kind: 'invalid_progress' })
    expect(getSession).not.toHaveBeenCalled()
  })
  it('derives the owner from the session', async () => {
    const updateEpisodeProgress = vi.fn().mockResolvedValue({
      kind: 'updated',
      progress: 12,
      personalTotal: null,
      catalogueTotal: 12,
      status: 'in_progress',
    })
    const action = createUpdateAnimeEntryEpisodeProgressHandler({
      getSession: vi.fn().mockResolvedValue({ user: { id: userId } }),
      updateEpisodeProgress,
    })
    await action(initialUpdateAnimeEntryEpisodeProgressActionState, form())
    expect(updateEpisodeProgress).toHaveBeenCalledWith({
      entryId,
      expectedEpisodeProgress: 0,
      requestedEpisodeProgress: 12,
      userId,
    })
  })
  it('fails closed for no session', async () => {
    const updateEpisodeProgress = vi.fn()
    const action = createUpdateAnimeEntryEpisodeProgressHandler({
      getSession: vi.fn().mockResolvedValue(null),
      updateEpisodeProgress,
    })
    await expect(
      action(initialUpdateAnimeEntryEpisodeProgressActionState, form()),
    ).resolves.toEqual({ kind: 'sign_in_required' })
    expect(updateEpisodeProgress).not.toHaveBeenCalled()
  })
})

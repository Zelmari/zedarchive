import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { createUpdateAnimeEntryEpisodeTotalOverrideHandler } from '@/features/archive/actions/update-anime-entry-episode-total-override-handler'
import { initialUpdateAnimeEntryEpisodeTotalActionState } from '@/features/archive/domain/update-anime-entry-episode-total'
const form = () => {
  const value = new FormData()
  value.set('entryId', '11111111-1111-4111-8111-111111111111')
  value.set('expectedEpisodeTotalOverride', 'none')
  value.set('requestedEpisodeTotalOverride', '12')
  return value
}
describe('episode total override action', () => {
  it('does not query a session for malformed input', async () => {
    const getSession = vi.fn()
    const updateEpisodeTotalOverride = vi.fn()
    const action = createUpdateAnimeEntryEpisodeTotalOverrideHandler({
      getSession,
      updateEpisodeTotalOverride,
    })
    const invalid = form()
    invalid.set('requestedEpisodeTotalOverride', '')
    await expect(
      action(initialUpdateAnimeEntryEpisodeTotalActionState, invalid),
    ).resolves.toEqual({ kind: 'invalid_total' })
    expect(getSession).not.toHaveBeenCalled()
  })
  it('maps a service failure to a bounded retry', async () => {
    const action = createUpdateAnimeEntryEpisodeTotalOverrideHandler({
      getSession: vi.fn().mockResolvedValue({ user: { id: 'user' } }),
      updateEpisodeTotalOverride: vi
        .fn()
        .mockRejectedValue(new Error('private')),
    })
    await expect(
      action(initialUpdateAnimeEntryEpisodeTotalActionState, form()),
    ).resolves.toEqual({ kind: 'retry' })
  })
})

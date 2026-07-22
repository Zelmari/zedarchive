import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createUpdateAnimeEntryFavouriteHandler } from '@/features/archive/actions/update-anime-entry-favourite-handler'
import { initialUpdateAnimeEntryFavouriteActionState } from '@/features/archive/domain/update-anime-entry-favourite'

const entryId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'

function form(): FormData {
  const data = new FormData()
  data.set('entryId', entryId)
  data.set('expectedFavourite', 'false')
  data.set('requestedFavourite', 'true')
  return data
}

describe('favourite action', () => {
  it('rejects malformed input before session work', async () => {
    const getSession = vi.fn()
    const updateFavourite = vi.fn()
    const data = form()
    data.set('requestedFavourite', 'TRUE')
    await expect(
      createUpdateAnimeEntryFavouriteHandler({ getSession, updateFavourite })(
        initialUpdateAnimeEntryFavouriteActionState,
        data,
      ),
    ).resolves.toEqual({ kind: 'unavailable' })
    expect(getSession).not.toHaveBeenCalled()
    expect(updateFavourite).not.toHaveBeenCalled()
  })

  it('uses the authoritative session owner and returns bounded outcomes', async () => {
    const updateFavourite = vi.fn().mockResolvedValue({
      kind: 'updated',
      isFavourite: true,
    })
    const action = createUpdateAnimeEntryFavouriteHandler({
      getSession: vi.fn().mockResolvedValue({ user: { id: userId } }),
      updateFavourite,
    })
    await expect(
      action(initialUpdateAnimeEntryFavouriteActionState, form()),
    ).resolves.toEqual({ kind: 'updated', isFavourite: true })
    expect(updateFavourite).toHaveBeenCalledWith({
      entryId,
      expectedFavourite: false,
      requestedFavourite: true,
      userId,
    })
  })

  it.each([null, {}, { user: {} }, { user: { id: '' } }])(
    'fails closed without a usable session %#',
    async (session) => {
      const updateFavourite = vi.fn()
      await expect(
        createUpdateAnimeEntryFavouriteHandler({
          getSession: vi.fn().mockResolvedValue(session),
          updateFavourite,
        })(initialUpdateAnimeEntryFavouriteActionState, form()),
      ).resolves.toEqual({ kind: 'sign_in_required' })
      expect(updateFavourite).not.toHaveBeenCalled()
    },
  )

  it('uses fixed private-safe failure logs', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const privateDetail = 'PRIVATE_FAVOURITE_DETAIL'
    const sessionFailure = createUpdateAnimeEntryFavouriteHandler({
      getSession: vi.fn().mockRejectedValue(new Error(privateDetail)),
      updateFavourite: vi.fn(),
    })
    const mutationFailure = createUpdateAnimeEntryFavouriteHandler({
      getSession: vi.fn().mockResolvedValue({ user: { id: userId } }),
      updateFavourite: vi.fn().mockRejectedValue(new Error(privateDetail)),
    })
    await expect(
      sessionFailure(initialUpdateAnimeEntryFavouriteActionState, form()),
    ).resolves.toEqual({ kind: 'session_unavailable' })
    await expect(
      mutationFailure(initialUpdateAnimeEntryFavouriteActionState, form()),
    ).resolves.toEqual({ kind: 'retry' })
    expect(error).toHaveBeenNthCalledWith(
      1,
      'Anime entry favourite session lookup failed.',
    )
    expect(error).toHaveBeenNthCalledWith(
      2,
      'Anime entry favourite update failed.',
    )
    expect(JSON.stringify(error.mock.calls)).not.toContain(privateDetail)
    error.mockRestore()
  })
})

import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createUpdateAnimeEntryRatingHandler } from '@/features/archive/actions/update-anime-entry-rating-handler'
import {
  initialUpdateAnimeEntryRatingActionState,
  type RatingMutationResult,
} from '@/features/archive/domain/update-anime-entry-rating'

const entryId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'

function form() {
  const data = new FormData()
  data.set('entryId', entryId)
  data.set('ratingOperation', 'save')
  data.set('expectedRating', 'none')
  data.set('requestedRating', '7.5')
  return data
}

describe('rating action', () => {
  it('parses before session work', async () => {
    const getSession = vi.fn()
    const updateRating = vi.fn()
    const action = createUpdateAnimeEntryRatingHandler({
      getSession,
      updateRating,
    })
    const invalid = form()
    invalid.set('requestedRating', '7.50')

    await expect(
      action(initialUpdateAnimeEntryRatingActionState, invalid),
    ).resolves.toEqual({ kind: 'invalid_rating' })
    expect(getSession).not.toHaveBeenCalled()
    expect(updateRating).not.toHaveBeenCalled()
  })

  it('derives the owner from the session', async () => {
    const result: RatingMutationResult = { kind: 'updated', rating: 7.5 }
    const updateRating = vi.fn().mockResolvedValue(result)
    const action = createUpdateAnimeEntryRatingHandler({
      getSession: vi.fn().mockResolvedValue({ user: { id: userId } }),
      updateRating,
    })

    await expect(
      action(initialUpdateAnimeEntryRatingActionState, form()),
    ).resolves.toEqual(result)
    expect(updateRating).toHaveBeenCalledWith({
      entryId,
      ratingOperation: 'save',
      expectedRating: null,
      requestedRating: 7.5,
      userId,
    })
  })

  it('fails closed when no authenticated user is available', async () => {
    const updateRating = vi.fn()
    const action = createUpdateAnimeEntryRatingHandler({
      getSession: vi.fn().mockResolvedValue(null),
      updateRating,
    })

    await expect(
      action(initialUpdateAnimeEntryRatingActionState, form()),
    ).resolves.toEqual({ kind: 'sign_in_required' })
    expect(updateRating).not.toHaveBeenCalled()
  })

  it('uses fixed context when session lookup fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const action = createUpdateAnimeEntryRatingHandler({
      getSession: vi.fn().mockRejectedValue(new Error(entryId)),
      updateRating: vi.fn(),
    })

    await expect(
      action(initialUpdateAnimeEntryRatingActionState, form()),
    ).resolves.toEqual({ kind: 'session_unavailable' })
    expect(error).toHaveBeenCalledWith(
      'Anime entry rating session lookup failed.',
    )
    error.mockRestore()
  })

  it('uses fixed context when the mutation fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const action = createUpdateAnimeEntryRatingHandler({
      getSession: vi.fn().mockResolvedValue({ user: { id: userId } }),
      updateRating: vi.fn().mockRejectedValue(new Error('7.5')),
    })

    await expect(
      action(initialUpdateAnimeEntryRatingActionState, form()),
    ).resolves.toEqual({ kind: 'retry' })
    expect(error).toHaveBeenCalledWith('Anime entry rating update failed.')
    error.mockRestore()
  })
})

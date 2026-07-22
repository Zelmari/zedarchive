import { describe, expect, it } from 'vitest'
import {
  animeEntryFavouriteControlReducer,
  createInitialAnimeEntryFavouriteControlState,
} from '@/features/archive/components/anime-entry-favourite-control-state'

describe('animeEntryFavouriteControlReducer', () => {
  it('uses the returned favourite value and focused success feedback', () => {
    const updated = animeEntryFavouriteControlReducer(
      createInitialAnimeEntryFavouriteControlState(false),
      { kind: 'action_result', result: { kind: 'updated', isFavourite: true } },
    )

    expect(updated).toMatchObject({
      authoritativeFavourite: true,
      feedback: { tone: 'status', message: 'Added to favourites.' },
      focusTarget: 'feedback',
      focusVersion: 1,
    })
  })

  it('reconciles a conflict to the bounded returned state without hiding feedback', () => {
    const conflicted = animeEntryFavouriteControlReducer(
      createInitialAnimeEntryFavouriteControlState(false),
      {
        kind: 'action_result',
        result: { kind: 'conflict', currentFavourite: true },
      },
    )

    expect(conflicted).toMatchObject({
      authoritativeFavourite: true,
      feedback: {
        tone: 'error',
        message:
          'This favourite changed elsewhere. Review the current state and try again.',
      },
      focusTarget: 'feedback',
    })
  })

  it('uses exact no-op and unavailable copy', () => {
    const unchanged = animeEntryFavouriteControlReducer(
      createInitialAnimeEntryFavouriteControlState(false),
      {
        kind: 'action_result',
        result: { kind: 'unchanged', isFavourite: false },
      },
    )
    const unavailable = animeEntryFavouriteControlReducer(unchanged, {
      kind: 'action_result',
      result: { kind: 'unavailable' },
    })

    expect(unchanged.feedback?.message).toBe('This anime is not a favourite.')
    expect(unavailable.feedback).toEqual({
      tone: 'error',
      message:
        'This archive entry is no longer available. Refresh your archive.',
    })
  })
})

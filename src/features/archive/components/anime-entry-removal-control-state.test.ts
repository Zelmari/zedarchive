import { describe, expect, it } from 'vitest'
import {
  animeEntryRemovalControlReducer,
  createInitialAnimeEntryRemovalControlState,
} from '@/features/archive/components/anime-entry-removal-control-state'

describe('anime entry removal control state', () => {
  it('opens on the safe action and cancellation restores the launcher', () => {
    const opened = animeEntryRemovalControlReducer(
      createInitialAnimeEntryRemovalControlState(),
      { kind: 'open' },
    )
    const cancelled = animeEntryRemovalControlReducer(opened, {
      kind: 'cancel',
    })

    expect(opened).toMatchObject({
      mode: 'open',
      feedback: null,
      focusTarget: 'cancel',
      focusVersion: 1,
    })
    expect(cancelled).toMatchObject({
      mode: 'closed',
      feedback: null,
      focusTarget: 'launcher',
      focusVersion: 2,
    })
  })

  it.each([
    ['sign_in_required', 'Your session has expired. Sign in and try again.'],
    [
      'unavailable',
      'This archive entry is no longer available. Refresh your archive.',
    ],
    [
      'session_unavailable',
      'We couldn’t remove this entry right now. Try again.',
    ],
    ['retry', 'We couldn’t remove this entry right now. Try again.'],
  ] as const)(
    'keeps %s failures open and focuses fixed feedback',
    (kind, message) => {
      const failed = animeEntryRemovalControlReducer(
        animeEntryRemovalControlReducer(
          createInitialAnimeEntryRemovalControlState(),
          { kind: 'open' },
        ),
        { kind: 'action_result', result: { kind } },
      )

      expect(failed).toMatchObject({
        mode: 'open',
        feedback: { tone: 'error', message },
        focusTarget: 'feedback',
        focusVersion: 2,
      })
    },
  )

  it('closes without launcher focus when the list owns successful removal focus', () => {
    const removed = animeEntryRemovalControlReducer(
      animeEntryRemovalControlReducer(
        createInitialAnimeEntryRemovalControlState(),
        { kind: 'open' },
      ),
      { kind: 'removed' },
    )

    expect(removed).toMatchObject({
      mode: 'closed',
      feedback: null,
      focusTarget: null,
      focusVersion: 2,
    })
  })
})

import { describe, expect, it } from 'vitest'
import {
  animeEntryRatingFormReducer,
  createInitialAnimeEntryRatingFormState,
  shouldEnableRatingSave,
} from '@/features/archive/components/anime-entry-rating-form-state'

describe('animeEntryRatingFormReducer', () => {
  it('opens with a canonical value and treats equivalent numeric input as unchanged', () => {
    const opened = animeEntryRatingFormReducer(
      createInitialAnimeEntryRatingFormState(7),
      { kind: 'open' },
    )

    expect(opened).toMatchObject({
      mode: 'edit',
      value: '7.0',
      focusTarget: 'input',
    })
    expect(shouldEnableRatingSave('7', opened.authoritativeRating)).toBe(false)
    expect(shouldEnableRatingSave('7.5', opened.authoritativeRating)).toBe(true)
    expect(shouldEnableRatingSave('7.55', opened.authoritativeRating)).toBe(
      true,
    )
  })

  it('keeps the attempted value while adopting a conflicting expected rating', () => {
    const editing = animeEntryRatingFormReducer(
      animeEntryRatingFormReducer(createInitialAnimeEntryRatingFormState(7), {
        kind: 'open',
      }),
      { kind: 'change', value: '8.5' },
    )
    const conflicted = animeEntryRatingFormReducer(editing, {
      kind: 'action_result',
      result: { kind: 'conflict', currentRating: 7.5 },
    })

    expect(conflicted).toMatchObject({
      mode: 'edit',
      authoritativeRating: 7.5,
      value: '8.5',
      feedback: {
        tone: 'error',
        message:
          'This rating changed elsewhere. It is now 7.5/10. Review your entry and try again.',
      },
      focusTarget: 'feedback',
    })
  })

  it('keeps blank and invalid nonblank attempts editable but reports an inline error', () => {
    const editing = animeEntryRatingFormReducer(
      createInitialAnimeEntryRatingFormState(null),
      { kind: 'open' },
    )
    const invalid = animeEntryRatingFormReducer(editing, {
      kind: 'action_result',
      result: { kind: 'invalid_rating' },
    })

    expect(shouldEnableRatingSave('', null)).toBe(false)
    expect(shouldEnableRatingSave('1e1', null)).toBe(true)
    expect(invalid.feedback).toEqual({
      tone: 'error',
      message: 'Enter a rating from 1.0 to 10.0 in steps of 0.1.',
      inputError: true,
    })
  })

  it('focuses bounded status feedback after a successful set and exact no-op', () => {
    const set = animeEntryRatingFormReducer(
      createInitialAnimeEntryRatingFormState(null),
      { kind: 'action_result', result: { kind: 'updated', rating: 7 } },
    )
    const unchanged = animeEntryRatingFormReducer(
      createInitialAnimeEntryRatingFormState(7),
      { kind: 'action_result', result: { kind: 'unchanged', rating: 7 } },
    )

    expect(set).toMatchObject({
      mode: 'read',
      authoritativeRating: 7,
      feedback: { tone: 'status', message: 'Rating updated to 7.0/10.' },
      focusTarget: 'feedback',
      focusVersion: 1,
    })
    expect(unchanged).toMatchObject({
      mode: 'read',
      feedback: { tone: 'status', message: 'Rating is already 7.0/10.' },
      focusTarget: 'feedback',
      focusVersion: 1,
    })
  })

  it('returns read state with bounded status feedback after removal and returns focus on cancel', () => {
    const removed = animeEntryRatingFormReducer(
      createInitialAnimeEntryRatingFormState(7.5),
      { kind: 'action_result', result: { kind: 'updated', rating: null } },
    )
    const cancelled = animeEntryRatingFormReducer(
      animeEntryRatingFormReducer(removed, { kind: 'open' }),
      { kind: 'cancel' },
    )

    expect(removed).toMatchObject({
      mode: 'read',
      authoritativeRating: null,
      value: '',
      feedback: { tone: 'status', message: 'Rating removed.' },
      focusTarget: 'feedback',
      focusVersion: 1,
    })
    expect(cancelled).toMatchObject({
      mode: 'read',
      focusTarget: 'launcher',
      feedback: null,
      focusVersion: 3,
    })
  })
})

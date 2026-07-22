import { describe, expect, it } from 'vitest'
import {
  getProgressSaveInput,
  getPersonalTotalEditorInitialValue,
  getTotalSaveInput,
  parseEpisodeProgressControlInput,
  parseEpisodeTotalControlInput,
  reconcileProgressEditorValue,
  reconcileTotalEditorValue,
  shouldOfferCompletionFromMutation,
} from '@/features/archive/components/anime-entry-episode-progress-controls-state'

describe('anime entry episode progress control state', () => {
  it.each([
    ['', null],
    ['00', 0],
    ['12', 12],
    [' 12', null],
    ['+12', null],
    ['-1', null],
    ['1.2', null],
    ['1e2', null],
    ['9007199254740992', null],
  ])('parses strict progress input %s', (value, expected) => {
    expect(parseEpisodeProgressControlInput(value)).toBe(expected)
  })

  it.each([
    ['', null],
    ['00', null],
    ['12', 12],
    [' 12', null],
    ['+12', null],
    ['-1', null],
    ['1.2', null],
    ['1e2', null],
    ['9007199254740992', null],
  ])('parses strict personal-total input %s', (value, expected) => {
    expect(parseEpisodeTotalControlInput(value)).toBe(expected)
  })

  it('enables saves only for valid values numerically distinct from authority', () => {
    expect(getProgressSaveInput('00', 0)).toBeNull()
    expect(getProgressSaveInput('0012', 7)).toBe(12)
    expect(getProgressSaveInput('1e2', 7)).toBeNull()
    expect(getTotalSaveInput('012', 12)).toBeNull()
    expect(getTotalSaveInput('12', null)).toBe(12)
    expect(getTotalSaveInput('0', null)).toBeNull()
  })

  it('prefills a new personal-total editor from a known catalogue total', () => {
    expect(getPersonalTotalEditorInitialValue(null, 12)).toBe('12')
    expect(getPersonalTotalEditorInitialValue(null, null)).toBe('')
    expect(getPersonalTotalEditorInitialValue(9, 12)).toBe('9')
  })

  it('uses the mutation result status for completion eligibility', () => {
    expect(shouldOfferCompletionFromMutation('completed', 12, null, 12)).toBe(
      false,
    )
    expect(shouldOfferCompletionFromMutation('on_hold', 12, null, 12)).toBe(
      true,
    )
  })

  it('preserves attempted values after conflicts while authority is reconciled elsewhere', () => {
    expect(
      reconcileProgressEditorValue('0012', {
        kind: 'conflict',
        currentProgress: 7,
      }),
    ).toBe('0012')
    expect(
      reconcileTotalEditorValue('0012', {
        kind: 'conflict',
        currentPersonalTotal: 7,
      }),
    ).toBe('0012')
    expect(
      reconcileProgressEditorValue('0012', {
        kind: 'updated',
        progress: 12,
        personalTotal: null,
        catalogueTotal: 12,
        status: 'in_progress',
      }),
    ).toBe('12')
  })
})

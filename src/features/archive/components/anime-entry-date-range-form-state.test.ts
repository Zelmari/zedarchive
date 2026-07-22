import { describe, expect, it } from 'vitest'
import {
  animeEntryDateRangeFormReducer,
  createInitialAnimeEntryDateRangeFormState,
  shouldEnableDateRangeSave,
} from '@/features/archive/components/anime-entry-date-range-form-state'

describe('animeEntryDateRangeFormReducer', () => {
  it('keeps both independent optional dates and disables only equivalent valid saves', () => {
    const opened = animeEntryDateRangeFormReducer(
      createInitialAnimeEntryDateRangeFormState('2024-01-02', null),
      { kind: 'open' },
    )

    expect(opened).toMatchObject({
      mode: 'edit',
      startDateValue: '2024-01-02',
      finishDateValue: '',
      focusTarget: 'input',
    })
    expect(
      shouldEnableDateRangeSave(
        '2024-01-02',
        '',
        opened.authoritativeStartDate,
        opened.authoritativeFinishDate,
      ),
    ).toBe(false)
    expect(
      shouldEnableDateRangeSave(
        '',
        '2024-01-03',
        opened.authoritativeStartDate,
        opened.authoritativeFinishDate,
      ),
    ).toBe(true)
    expect(
      shouldEnableDateRangeSave(
        'not-a-date',
        '',
        opened.authoritativeStartDate,
        opened.authoritativeFinishDate,
      ),
    ).toBe(true)
  })

  it('keeps an attempted pair while adopting the conflict pair for deliberate retry', () => {
    const editing = animeEntryDateRangeFormReducer(
      animeEntryDateRangeFormReducer(
        createInitialAnimeEntryDateRangeFormState('2024-01-01', null),
        { kind: 'open' },
      ),
      { kind: 'change_finish_date', value: '2024-01-10' },
    )
    const conflicted = animeEntryDateRangeFormReducer(editing, {
      kind: 'action_result',
      result: {
        kind: 'conflict',
        currentStartDate: '2024-01-02',
        currentFinishDate: '2024-01-04',
      },
    })

    expect(conflicted).toMatchObject({
      mode: 'edit',
      authoritativeStartDate: '2024-01-02',
      authoritativeFinishDate: '2024-01-04',
      startDateValue: '2024-01-01',
      finishDateValue: '2024-01-10',
      feedback: {
        tone: 'error',
        message:
          'These dates changed elsewhere. Review the saved dates and try again.',
        currentDates: {
          startDate: '2024-01-02',
          finishDate: '2024-01-04',
        },
      },
    })
  })

  it('reports a finish-associated range error and preserves the draft', () => {
    const invalid = animeEntryDateRangeFormReducer(
      {
        ...createInitialAnimeEntryDateRangeFormState(null, null),
        mode: 'edit',
        startDateValue: '2024-01-03',
        finishDateValue: '2024-01-02',
      },
      { kind: 'action_result', result: { kind: 'invalid_dates' } },
    )

    expect(invalid).toMatchObject({
      mode: 'edit',
      startDateValue: '2024-01-03',
      finishDateValue: '2024-01-02',
      feedback: {
        tone: 'error',
        message: 'Finish date cannot be earlier than start date.',
        inputError: 'finish',
      },
      focusTarget: 'feedback',
    })
  })

  it('reports malformed finish syntax as a generic validation error, not an ordering error', () => {
    const invalid = animeEntryDateRangeFormReducer(
      {
        ...createInitialAnimeEntryDateRangeFormState(null, null),
        mode: 'edit',
        startDateValue: '2024-01-03',
        finishDateValue: 'not-a-date',
      },
      { kind: 'action_result', result: { kind: 'invalid_dates' } },
    )

    expect(invalid).toMatchObject({
      mode: 'edit',
      startDateValue: '2024-01-03',
      finishDateValue: 'not-a-date',
      feedback: {
        tone: 'error',
        message: 'Enter valid start and finish dates.',
        inputError: 'both',
      },
    })
  })

  it('reports an impossible finish date as a generic validation error', () => {
    const invalid = animeEntryDateRangeFormReducer(
      {
        ...createInitialAnimeEntryDateRangeFormState(null, null),
        mode: 'edit',
        startDateValue: '2024-01-03',
        finishDateValue: '2024-02-30',
      },
      { kind: 'action_result', result: { kind: 'invalid_dates' } },
    )

    expect(invalid.feedback).toMatchObject({
      message: 'Enter valid start and finish dates.',
      inputError: 'both',
    })
  })

  it('clears drafts and returns focus to the launcher on cancel', () => {
    const cancelled = animeEntryDateRangeFormReducer(
      {
        ...createInitialAnimeEntryDateRangeFormState('2024-01-01', null),
        mode: 'edit',
        startDateValue: '',
        finishDateValue: '2024-01-04',
      },
      { kind: 'cancel' },
    )

    expect(cancelled).toMatchObject({
      mode: 'read',
      startDateValue: '2024-01-01',
      finishDateValue: '',
      feedback: null,
      focusTarget: 'launcher',
    })
  })
})

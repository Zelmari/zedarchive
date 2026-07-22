import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { useReducer, useSyncExternalStore } = vi.hoisted(() => ({
  useReducer: vi.fn(),
  useSyncExternalStore: vi.fn(),
}))

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useReducer,
  useSyncExternalStore,
}))

import { AnimeEntryDateRangeForm } from '@/features/archive/components/anime-entry-date-range-form'

const props = {
  entryId: '550e8400-e29b-41d4-a716-446655440000',
  animeTitle: 'Date fixture',
  startDate: null,
  finishDate: null,
  isPending: false,
  isOwnOperationPending: false,
  onSubmit: async () => null,
}

function mockState(state: object, hasHydrated = true) {
  useReducer.mockReturnValue([state, vi.fn()])
  useSyncExternalStore.mockReturnValue(hasHydrated)
}

describe('AnimeEntryDateRangeForm', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders server-safe date values and no editor controls before hydration', () => {
    mockState(
      {
        mode: 'read',
        authoritativeStartDate: null,
        authoritativeFinishDate: '2024-01-03',
        startDateValue: '',
        finishDateValue: '2024-01-03',
        feedback: null,
        focusTarget: null,
        focusVersion: 0,
      },
      false,
    )

    const markup = renderToStaticMarkup(
      createElement(AnimeEntryDateRangeForm, props),
    )

    expect(markup).toContain('Start date — Not set')
    expect(markup).toContain('Finish date — 2024-01-03')
    expect(markup).not.toContain('Set dates')
    expect(markup).not.toContain('<form')
  })

  it('renders native controls, exact clear help, and finish-associated validation', () => {
    mockState({
      mode: 'edit',
      authoritativeStartDate: '2024-01-01',
      authoritativeFinishDate: null,
      startDateValue: '2024-01-03',
      finishDateValue: '2024-01-02',
      feedback: {
        tone: 'error',
        message: 'Finish date cannot be earlier than start date.',
        inputError: 'finish',
      },
      focusTarget: 'feedback',
      focusVersion: 1,
    })

    const markup = renderToStaticMarkup(
      createElement(AnimeEntryDateRangeForm, {
        ...props,
        startDate: '2024-01-01',
      }),
    )

    expect(markup).toContain('<form aria-busy="false"')
    expect(markup).toContain('noValidate=""')
    expect(markup).toContain('name="expectedStartDate"')
    expect(markup).toContain('name="expectedFinishDate"')
    expect(markup).toContain('name="requestedStartDate"')
    expect(markup).toContain('name="requestedFinishDate"')
    expect(markup).toContain('type="date"')
    expect(markup).toContain('Leave a date blank to clear it.')
    expect(markup).toContain('aria-invalid="true"')
    expect(markup).toMatch(/aria-describedby="[^"]+"/)
    expect(markup).toContain('role="alert" tabindex="-1"')
    expect(markup).toContain('type="submit">Save dates</button>')
    expect(markup).toContain('type="button">Cancel</button>')
  })

  it('uses read labels and focused success feedback after a saved date pair', () => {
    mockState({
      mode: 'read',
      authoritativeStartDate: '2024-01-01',
      authoritativeFinishDate: '2024-01-02',
      startDateValue: '2024-01-01',
      finishDateValue: '2024-01-02',
      feedback: {
        tone: 'status',
        message: 'Viewing dates updated.',
        inputError: null,
      },
      focusTarget: 'feedback',
      focusVersion: 1,
    })

    const markup = renderToStaticMarkup(
      createElement(AnimeEntryDateRangeForm, {
        ...props,
        startDate: '2024-01-01',
        finishDate: '2024-01-02',
      }),
    )

    expect(markup).toContain('Edit dates')
    expect(markup).toContain('role="status" tabindex="-1"')
    expect(markup).toContain('aria-live="polite"')
  })

  it('keeps attempted editor values while exposing the bounded saved pair on conflict', () => {
    mockState({
      mode: 'edit',
      authoritativeStartDate: '2024-01-02',
      authoritativeFinishDate: null,
      startDateValue: '2024-01-01',
      finishDateValue: '2024-01-10',
      feedback: {
        tone: 'error',
        message:
          'These dates changed elsewhere. Review the saved dates and try again.',
        inputError: null,
        currentDates: {
          startDate: '2024-01-02',
          finishDate: null,
        },
      },
      focusTarget: 'feedback',
      focusVersion: 1,
    })

    const markup = renderToStaticMarkup(
      createElement(AnimeEntryDateRangeForm, props),
    )

    expect(markup).toContain('value="2024-01-01"')
    expect(markup).toContain('value="2024-01-10"')
    expect(markup).toContain('Saved start date — 2024-01-02')
    expect(markup).toContain('saved finish date — Not set.')
  })

  it('stays disabled but keeps Save dates copy while a favourite operation is pending', () => {
    mockState({
      mode: 'edit',
      authoritativeStartDate: null,
      authoritativeFinishDate: null,
      startDateValue: '2024-01-01',
      finishDateValue: '',
      feedback: null,
      focusTarget: null,
      focusVersion: 0,
    })

    const markup = renderToStaticMarkup(
      createElement(AnimeEntryDateRangeForm, {
        ...props,
        isPending: true,
        isOwnOperationPending: false,
      }),
    )

    expect(markup).toContain('disabled="" type="submit">Save dates</button>')
    expect(markup).not.toContain('Saving dates…')
  })

  it('uses saving copy only while the date operation is pending', () => {
    mockState({
      mode: 'edit',
      authoritativeStartDate: null,
      authoritativeFinishDate: null,
      startDateValue: '2024-01-01',
      finishDateValue: '',
      feedback: null,
      focusTarget: null,
      focusVersion: 0,
    })

    const markup = renderToStaticMarkup(
      createElement(AnimeEntryDateRangeForm, {
        ...props,
        isPending: true,
        isOwnOperationPending: true,
      }),
    )

    expect(markup).toContain('Saving dates…')
  })
})

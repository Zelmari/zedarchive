import {
  calendarDateSchema,
  entryDateRangeSchema,
  type CalendarDate,
} from '@/features/archive/domain/entry-date-range'
import type { UpdateAnimeEntryDateRangeActionState } from '@/features/archive/domain/update-anime-entry-date-range'

type DateRangeFeedback = {
  tone: 'error' | 'status'
  message: string
  inputError: 'start' | 'finish' | 'both' | null
  currentDates?: {
    startDate: CalendarDate | null
    finishDate: CalendarDate | null
  }
}

export type AnimeEntryDateRangeFormState = {
  mode: 'read' | 'edit'
  authoritativeStartDate: CalendarDate | null
  authoritativeFinishDate: CalendarDate | null
  startDateValue: string
  finishDateValue: string
  feedback: DateRangeFeedback | null
  focusTarget: 'launcher' | 'input' | 'feedback' | null
  focusVersion: number
}

export type AnimeEntryDateRangeFormEvent =
  | { kind: 'open' }
  | { kind: 'change_start_date'; value: string }
  | { kind: 'change_finish_date'; value: string }
  | { kind: 'cancel' }
  | {
      kind: 'authoritative_dates'
      startDate: CalendarDate | null
      finishDate: CalendarDate | null
    }
  | { kind: 'action_result'; result: UpdateAnimeEntryDateRangeActionState }

function formatEditorValue(date: CalendarDate | null): string {
  return date ?? ''
}

function withFeedback(
  state: AnimeEntryDateRangeFormState,
  feedback: DateRangeFeedback,
): AnimeEntryDateRangeFormState {
  return {
    ...state,
    feedback,
    focusTarget: 'feedback',
    focusVersion: state.focusVersion + 1,
  }
}

export function createInitialAnimeEntryDateRangeFormState(
  startDate: CalendarDate | null,
  finishDate: CalendarDate | null,
): AnimeEntryDateRangeFormState {
  return {
    mode: 'read',
    authoritativeStartDate: startDate,
    authoritativeFinishDate: finishDate,
    startDateValue: formatEditorValue(startDate),
    finishDateValue: formatEditorValue(finishDate),
    feedback: null,
    focusTarget: null,
    focusVersion: 0,
  }
}

function parseEditorDates(startDateValue: string, finishDateValue: string) {
  return entryDateRangeSchema.safeParse({
    startDate: startDateValue === '' ? undefined : startDateValue,
    finishDate: finishDateValue === '' ? undefined : finishDateValue,
  })
}

function isDateRangeOrderingError(
  startDateValue: string,
  finishDateValue: string,
): boolean {
  if (startDateValue === '' || finishDateValue === '') return false

  const startDate = calendarDateSchema.safeParse(startDateValue)
  const finishDate = calendarDateSchema.safeParse(finishDateValue)

  return (
    startDate.success && finishDate.success && finishDate.data < startDate.data
  )
}

export function shouldEnableDateRangeSave(
  startDateValue: string,
  finishDateValue: string,
  authoritativeStartDate: CalendarDate | null,
  authoritativeFinishDate: CalendarDate | null,
): boolean {
  const requested = parseEditorDates(startDateValue, finishDateValue)
  if (!requested.success) return true

  return (
    (requested.data.startDate ?? null) !== authoritativeStartDate ||
    (requested.data.finishDate ?? null) !== authoritativeFinishDate
  )
}

export function animeEntryDateRangeFormReducer(
  state: AnimeEntryDateRangeFormState,
  event: AnimeEntryDateRangeFormEvent,
): AnimeEntryDateRangeFormState {
  switch (event.kind) {
    case 'open':
      return {
        ...state,
        mode: 'edit',
        startDateValue: formatEditorValue(state.authoritativeStartDate),
        finishDateValue: formatEditorValue(state.authoritativeFinishDate),
        feedback: null,
        focusTarget: 'input',
        focusVersion: state.focusVersion + 1,
      }
    case 'change_start_date':
      return { ...state, startDateValue: event.value }
    case 'change_finish_date':
      return { ...state, finishDateValue: event.value }
    case 'cancel':
      return {
        ...state,
        mode: 'read',
        startDateValue: formatEditorValue(state.authoritativeStartDate),
        finishDateValue: formatEditorValue(state.authoritativeFinishDate),
        feedback: null,
        focusTarget: 'launcher',
        focusVersion: state.focusVersion + 1,
      }
    case 'authoritative_dates':
      return {
        ...state,
        authoritativeStartDate: event.startDate,
        authoritativeFinishDate: event.finishDate,
        startDateValue:
          state.mode === 'read'
            ? formatEditorValue(event.startDate)
            : state.startDateValue,
        finishDateValue:
          state.mode === 'read'
            ? formatEditorValue(event.finishDate)
            : state.finishDateValue,
      }
    case 'action_result': {
      const { result } = event

      switch (result.kind) {
        case 'idle':
          return state
        case 'updated':
          return withFeedback(
            {
              ...state,
              mode: 'read',
              authoritativeStartDate: result.startDate,
              authoritativeFinishDate: result.finishDate,
              startDateValue: formatEditorValue(result.startDate),
              finishDateValue: formatEditorValue(result.finishDate),
            },
            {
              tone: 'status',
              message: 'Viewing dates updated.',
              inputError: null,
            },
          )
        case 'unchanged':
          return withFeedback(
            {
              ...state,
              mode: 'read',
              authoritativeStartDate: result.startDate,
              authoritativeFinishDate: result.finishDate,
              startDateValue: formatEditorValue(result.startDate),
              finishDateValue: formatEditorValue(result.finishDate),
            },
            {
              tone: 'status',
              message: 'Viewing dates are already up to date.',
              inputError: null,
            },
          )
        case 'conflict':
          return withFeedback(
            {
              ...state,
              authoritativeStartDate: result.currentStartDate,
              authoritativeFinishDate: result.currentFinishDate,
            },
            {
              tone: 'error',
              message:
                'These dates changed elsewhere. Review the saved dates and try again.',
              inputError: null,
              currentDates: {
                startDate: result.currentStartDate,
                finishDate: result.currentFinishDate,
              },
            },
          )
        case 'invalid_dates': {
          const isOrderingError = isDateRangeOrderingError(
            state.startDateValue,
            state.finishDateValue,
          )
          return withFeedback(state, {
            tone: 'error',
            message: isOrderingError
              ? 'Finish date cannot be earlier than start date.'
              : 'Enter valid start and finish dates.',
            inputError: isOrderingError ? 'finish' : 'both',
          })
        }
        case 'sign_in_required':
          return withFeedback(state, {
            tone: 'error',
            message: 'Your session has expired. Sign in and try again.',
            inputError: null,
          })
        case 'unavailable':
          return withFeedback(state, {
            tone: 'error',
            message:
              'This archive entry is no longer available. Refresh your archive.',
            inputError: null,
          })
        case 'session_unavailable':
        case 'retry':
          return withFeedback(state, {
            tone: 'error',
            message:
              'We couldn’t update these viewing dates right now. Try again.',
            inputError: null,
          })
      }
    }
  }
}

import { z } from 'zod'
import {
  calendarDateSchema,
  entryDateRangeSchema,
  type CalendarDate,
} from '@/features/archive/domain/entry-date-range'

export const entryDateNoneSentinel = 'none'

export const updateAnimeEntryDateRangeInputSchema = z.strictObject({
  entryId: z.uuidv4(),
  expectedStartDate: calendarDateSchema.nullable(),
  expectedFinishDate: calendarDateSchema.nullable(),
  requestedStartDate: calendarDateSchema.nullable(),
  requestedFinishDate: calendarDateSchema.nullable(),
})

export type UpdateAnimeEntryDateRangeInput = z.infer<
  typeof updateAnimeEntryDateRangeInputSchema
>

export type DateRangeMutationResult =
  | {
      kind: 'updated' | 'unchanged'
      startDate: CalendarDate | null
      finishDate: CalendarDate | null
    }
  | {
      kind: 'conflict'
      currentStartDate: CalendarDate | null
      currentFinishDate: CalendarDate | null
    }
  | { kind: 'unavailable' }

export type UpdateAnimeEntryDateRangeActionState =
  | {
      kind:
        | 'idle'
        | 'invalid_dates'
        | 'sign_in_required'
        | 'session_unavailable'
        | 'retry'
    }
  | DateRangeMutationResult

export const initialUpdateAnimeEntryDateRangeActionState: UpdateAnimeEntryDateRangeActionState =
  { kind: 'idle' }

const acceptedFieldNames = new Set([
  'entryId',
  'expectedStartDate',
  'expectedFinishDate',
  'requestedStartDate',
  'requestedFinishDate',
])

function getExactlyOneStringValue(
  formData: FormData,
  fieldName: string,
): string | null {
  const values = formData.getAll(fieldName)
  return values.length === 1 && typeof values[0] === 'string' ? values[0] : null
}

function hasExactlyOneStringValueForEveryField(formData: FormData): boolean {
  return Array.from(acceptedFieldNames).every(
    (fieldName) => getExactlyOneStringValue(formData, fieldName) !== null,
  )
}

function toOptionalDate(value: CalendarDate | null): CalendarDate | undefined {
  return value ?? undefined
}

function parsesDateRange(
  startDate: CalendarDate | null,
  finishDate: CalendarDate | null,
): boolean {
  return entryDateRangeSchema.safeParse({
    startDate: toOptionalDate(startDate),
    finishDate: toOptionalDate(finishDate),
  }).success
}

function parseExpectedDate(
  value: string | null,
): CalendarDate | null | undefined {
  if (value === entryDateNoneSentinel) return null
  if (value === null) return undefined
  const parsed = calendarDateSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function parseRequestedDate(
  value: string | null,
): CalendarDate | null | undefined {
  if (value === '') return null
  if (value === null) return undefined
  const parsed = calendarDateSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function parseUpdateAnimeEntryDateRangeFormData(
  formData: FormData,
):
  | { kind: 'valid'; input: UpdateAnimeEntryDateRangeInput }
  | { kind: 'invalid_dates' }
  | { kind: 'unavailable' } {
  if (
    Array.from(formData.keys()).some(
      (fieldName) => !acceptedFieldNames.has(fieldName),
    ) ||
    !hasExactlyOneStringValueForEveryField(formData)
  ) {
    return { kind: 'unavailable' }
  }

  const entryId = getExactlyOneStringValue(formData, 'entryId')
  const expectedStartDate = parseExpectedDate(
    getExactlyOneStringValue(formData, 'expectedStartDate'),
  )
  const expectedFinishDate = parseExpectedDate(
    getExactlyOneStringValue(formData, 'expectedFinishDate'),
  )

  if (
    !z.uuidv4().safeParse(entryId).success ||
    expectedStartDate === undefined ||
    expectedFinishDate === undefined ||
    !parsesDateRange(expectedStartDate, expectedFinishDate)
  ) {
    return { kind: 'unavailable' }
  }

  const requestedStartDate = parseRequestedDate(
    getExactlyOneStringValue(formData, 'requestedStartDate'),
  )
  const requestedFinishDate = parseRequestedDate(
    getExactlyOneStringValue(formData, 'requestedFinishDate'),
  )

  if (
    requestedStartDate === undefined ||
    requestedFinishDate === undefined ||
    !parsesDateRange(requestedStartDate, requestedFinishDate)
  ) {
    return { kind: 'invalid_dates' }
  }

  const parsed = updateAnimeEntryDateRangeInputSchema.safeParse({
    entryId,
    expectedStartDate,
    expectedFinishDate,
    requestedStartDate,
    requestedFinishDate,
  })

  return parsed.success
    ? { kind: 'valid', input: parsed.data }
    : { kind: 'unavailable' }
}

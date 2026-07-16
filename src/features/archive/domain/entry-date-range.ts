import { z } from 'zod'

export const calendarDateSchema = z.iso.date()

export const entryDateRangeSchema = z
  .object({
    startDate: calendarDateSchema.optional(),
    finishDate: calendarDateSchema.optional(),
  })
  .refine(
    ({ startDate, finishDate }) =>
      startDate === undefined ||
      finishDate === undefined ||
      finishDate >= startDate,
    { path: ['finishDate'] },
  )

export type CalendarDate = z.infer<typeof calendarDateSchema>
export type EntryDateRange = z.infer<typeof entryDateRangeSchema>

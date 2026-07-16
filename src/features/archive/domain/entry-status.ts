import { z } from 'zod'

export const entryStatusValues = [
  'planned',
  'in_progress',
  'on_hold',
  'dropped',
  'completed',
] as const

export const entryStatusSchema = z.enum(entryStatusValues)

export type EntryStatus = z.infer<typeof entryStatusSchema>

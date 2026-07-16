import { z } from 'zod'

export const ratingMinimum = 1
export const ratingMaximum = 10
export const ratingIncrement = 0.1

export const ratingSchema = z
  .number()
  .min(ratingMinimum)
  .max(ratingMaximum)
  .multipleOf(ratingIncrement)

export type Rating = z.infer<typeof ratingSchema>

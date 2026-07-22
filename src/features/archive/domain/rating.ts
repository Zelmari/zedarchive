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

export const ratingNoneSentinel = 'none'

const ratingFormValuePattern = /^(?:10(?:\.0)?|[1-9](?:\.[0-9])?)$/

/** Formats a validated rating for display and hidden compare-and-set fields. */
export function formatRating(rating: Rating): string {
  return ratingSchema.parse(rating).toFixed(1)
}

/**
 * Parses only the deliberately narrow rating form grammar. The domain schema
 * remains numeric so persistence and other callers cannot accidentally depend
 * on a text representation.
 */
export function parseRatingFormValue(value: string): Rating | null {
  if (!ratingFormValuePattern.test(value)) return null

  const parsed = ratingSchema.safeParse(Number(value))
  return parsed.success ? parsed.data : null
}

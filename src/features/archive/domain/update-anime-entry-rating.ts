import { z } from 'zod'
import {
  parseRatingFormValue,
  ratingNoneSentinel,
  ratingSchema,
  type Rating,
} from '@/features/archive/domain/rating'

export const ratingOperationValues = ['save', 'remove'] as const
export type RatingOperation = (typeof ratingOperationValues)[number]

export const updateAnimeEntryRatingInputSchema = z
  .strictObject({
    entryId: z.uuidv4(),
    ratingOperation: z.enum(ratingOperationValues),
    expectedRating: ratingSchema.nullable(),
    requestedRating: ratingSchema.nullable(),
  })
  .refine(({ expectedRating, ratingOperation, requestedRating }) =>
    ratingOperation === 'save'
      ? requestedRating !== null
      : expectedRating !== null && requestedRating === null,
  )

export type UpdateAnimeEntryRatingInput = z.infer<
  typeof updateAnimeEntryRatingInputSchema
>

export type RatingMutationResult =
  | { kind: 'updated' | 'unchanged'; rating: Rating | null }
  | { kind: 'conflict'; currentRating: Rating | null }
  | { kind: 'unavailable' }

export type UpdateAnimeEntryRatingActionState =
  | {
      kind:
        | 'idle'
        | 'invalid_rating'
        | 'sign_in_required'
        | 'session_unavailable'
        | 'retry'
    }
  | RatingMutationResult

export const initialUpdateAnimeEntryRatingActionState: UpdateAnimeEntryRatingActionState =
  { kind: 'idle' }

const acceptedFormFieldNames = new Set([
  'entryId',
  'ratingOperation',
  'expectedRating',
  'requestedRating',
])

function hasOnlyAcceptedFormFields(formData: FormData): boolean {
  return Array.from(formData.keys()).every((name) =>
    acceptedFormFieldNames.has(name),
  )
}

function getExactlyOneStringValue(
  formData: FormData,
  fieldName: string,
): string | null {
  const values = formData.getAll(fieldName)
  return values.length === 1 && typeof values[0] === 'string' ? values[0] : null
}

function parseExpectedRating(value: string | null): Rating | null | undefined {
  if (value === ratingNoneSentinel) return null
  if (value === null) return undefined
  return parseRatingFormValue(value) ?? undefined
}

export function parseUpdateAnimeEntryRatingFormData(
  formData: FormData,
):
  | { kind: 'valid'; input: UpdateAnimeEntryRatingInput }
  | { kind: 'invalid_rating' }
  | { kind: 'unavailable' } {
  if (!hasOnlyAcceptedFormFields(formData)) return { kind: 'unavailable' }

  const entryId = getExactlyOneStringValue(formData, 'entryId')
  const ratingOperation = getExactlyOneStringValue(formData, 'ratingOperation')
  const expectedRating = parseExpectedRating(
    getExactlyOneStringValue(formData, 'expectedRating'),
  )

  if (
    entryId === null ||
    !z.uuidv4().safeParse(entryId).success ||
    (ratingOperation !== 'save' && ratingOperation !== 'remove') ||
    expectedRating === undefined
  ) {
    return { kind: 'unavailable' }
  }

  const requestedRatingValue = getExactlyOneStringValue(
    formData,
    'requestedRating',
  )

  if (ratingOperation === 'save') {
    const requestedRating =
      requestedRatingValue === null
        ? null
        : parseRatingFormValue(requestedRatingValue)
    if (requestedRating === null) return { kind: 'invalid_rating' }

    const parsed = updateAnimeEntryRatingInputSchema.safeParse({
      entryId,
      ratingOperation,
      expectedRating,
      requestedRating,
    })
    return parsed.success
      ? { kind: 'valid', input: parsed.data }
      : { kind: 'unavailable' }
  }

  if (expectedRating === null || requestedRatingValue !== ratingNoneSentinel) {
    return { kind: 'unavailable' }
  }

  const parsed = updateAnimeEntryRatingInputSchema.safeParse({
    entryId,
    ratingOperation,
    expectedRating,
    requestedRating: null,
  })
  return parsed.success
    ? { kind: 'valid', input: parsed.data }
    : { kind: 'unavailable' }
}

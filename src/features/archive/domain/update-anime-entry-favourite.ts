import { z } from 'zod'

export const updateAnimeEntryFavouriteInputSchema = z.strictObject({
  entryId: z.uuidv4(),
  expectedFavourite: z.boolean(),
  requestedFavourite: z.boolean(),
})

export type UpdateAnimeEntryFavouriteInput = z.infer<
  typeof updateAnimeEntryFavouriteInputSchema
>

export type FavouriteMutationResult =
  | { kind: 'updated' | 'unchanged'; isFavourite: boolean }
  | { kind: 'conflict'; currentFavourite: boolean }
  | { kind: 'unavailable' }

export type UpdateAnimeEntryFavouriteActionState =
  | { kind: 'idle' | 'sign_in_required' | 'session_unavailable' | 'retry' }
  | FavouriteMutationResult

export const initialUpdateAnimeEntryFavouriteActionState: UpdateAnimeEntryFavouriteActionState =
  { kind: 'idle' }

const acceptedFieldNames = new Set([
  'entryId',
  'expectedFavourite',
  'requestedFavourite',
])

function getExactlyOneStringValue(
  formData: FormData,
  fieldName: string,
): string | null {
  const values = formData.getAll(fieldName)
  return values.length === 1 && typeof values[0] === 'string' ? values[0] : null
}

function parseBoolean(value: string | null): boolean | undefined {
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

export function parseUpdateAnimeEntryFavouriteFormData(
  formData: FormData,
):
  | { kind: 'valid'; input: UpdateAnimeEntryFavouriteInput }
  | { kind: 'unavailable' } {
  if (
    Array.from(formData.keys()).some(
      (fieldName) => !acceptedFieldNames.has(fieldName),
    )
  ) {
    return { kind: 'unavailable' }
  }

  const parsed = updateAnimeEntryFavouriteInputSchema.safeParse({
    entryId: getExactlyOneStringValue(formData, 'entryId'),
    expectedFavourite: parseBoolean(
      getExactlyOneStringValue(formData, 'expectedFavourite'),
    ),
    requestedFavourite: parseBoolean(
      getExactlyOneStringValue(formData, 'requestedFavourite'),
    ),
  })

  return parsed.success
    ? { kind: 'valid', input: parsed.data }
    : { kind: 'unavailable' }
}

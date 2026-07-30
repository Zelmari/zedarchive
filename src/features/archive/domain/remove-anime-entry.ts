import { z } from '@/config/zod'

export const removeAnimeEntryInputSchema = z.strictObject({
  entryId: z.uuidv4(),
})

export type RemoveAnimeEntryInput = z.infer<typeof removeAnimeEntryInputSchema>

export type RemoveAnimeEntryResult =
  { kind: 'removed' } | { kind: 'unavailable' }

export type RemoveAnimeEntryFormInputResult =
  { kind: 'valid'; input: RemoveAnimeEntryInput } | { kind: 'unavailable' }

export type RemoveAnimeEntryActionState = {
  kind:
    | 'idle'
    | 'removed'
    | 'sign_in_required'
    | 'session_unavailable'
    | 'unavailable'
    | 'retry'
}

export const initialRemoveAnimeEntryActionState: RemoveAnimeEntryActionState = {
  kind: 'idle',
}

const acceptedFieldNames = new Set(['entryId'])

function getExactlyOneStringValue(
  formData: FormData,
  fieldName: string,
): string | null {
  const values = formData.getAll(fieldName)
  return values.length === 1 && typeof values[0] === 'string' ? values[0] : null
}

export function parseRemoveAnimeEntryFormData(
  formData: FormData,
): RemoveAnimeEntryFormInputResult {
  if (
    Array.from(formData.keys()).some(
      (fieldName) => !acceptedFieldNames.has(fieldName),
    )
  ) {
    return { kind: 'unavailable' }
  }

  const parsed = removeAnimeEntryInputSchema.safeParse({
    entryId: getExactlyOneStringValue(formData, 'entryId'),
  })

  return parsed.success
    ? { kind: 'valid', input: parsed.data }
    : { kind: 'unavailable' }
}

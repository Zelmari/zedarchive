import { z } from 'zod'
import { animeCatalogueItemIdSchema } from '@/features/anime/domain/anime-catalogue-item'
import {
  entryStatusSchema,
  type EntryStatus,
} from '@/features/archive/domain/entry-status'

export const addAnimeEntryInputSchema = z
  .object({
    catalogueItemId: animeCatalogueItemIdSchema,
    status: entryStatusSchema,
  })
  .strict()

export type AddAnimeEntryInput = z.infer<typeof addAnimeEntryInputSchema>

export type AddAnimeEntryFormInputResult =
  | { kind: 'valid'; input: AddAnimeEntryInput }
  | { kind: 'invalid_status' }
  | { kind: 'unavailable' }

export type AddAnimeEntryActionState =
  | { kind: 'idle' }
  | { kind: 'invalid_status' }
  | { kind: 'created'; status: EntryStatus }
  | { kind: 'already_exists'; status: EntryStatus }
  | { kind: 'sign_in_required' }
  | { kind: 'session_unavailable' }
  | { kind: 'unavailable' }
  | { kind: 'retry' }

export const initialAddAnimeEntryActionState: AddAnimeEntryActionState = {
  kind: 'idle',
}

function getExactlyOneStringValue(
  formData: FormData,
  fieldName: string,
): string | null {
  const values = formData.getAll(fieldName)

  if (values.length !== 1 || typeof values[0] !== 'string') {
    return null
  }

  return values[0]
}

export function parseAddAnimeEntryFormData(
  formData: FormData,
): AddAnimeEntryFormInputResult {
  const status = getExactlyOneStringValue(formData, 'status')

  if (!entryStatusSchema.safeParse(status).success) {
    return { kind: 'invalid_status' }
  }

  const catalogueItemId = getExactlyOneStringValue(formData, 'catalogueItemId')
  const parsedInput = addAnimeEntryInputSchema.safeParse({
    catalogueItemId,
    status,
  })

  if (!parsedInput.success) {
    return { kind: 'unavailable' }
  }

  return { kind: 'valid', input: parsedInput.data }
}

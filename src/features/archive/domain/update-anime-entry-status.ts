import { z } from 'zod'
import {
  entryStatusSchema,
  type EntryStatus,
} from '@/features/archive/domain/entry-status'

export const updateAnimeEntryStatusInputSchema = z.strictObject({
  entryId: z.uuidv4(),
  expectedStatus: entryStatusSchema,
  requestedStatus: entryStatusSchema,
})

export type UpdateAnimeEntryStatusInput = z.infer<
  typeof updateAnimeEntryStatusInputSchema
>

export type UpdateAnimeEntryStatusFormInputResult =
  | { kind: 'valid'; input: UpdateAnimeEntryStatusInput }
  | { kind: 'invalid_status' }
  | { kind: 'unavailable' }

export type UpdateAnimeEntryStatusActionState =
  | { kind: 'idle' }
  | { kind: 'invalid_status' }
  | { kind: 'updated'; status: EntryStatus }
  | { kind: 'unchanged'; status: EntryStatus }
  | { kind: 'conflict'; currentStatus: EntryStatus }
  | { kind: 'sign_in_required' }
  | { kind: 'session_unavailable' }
  | { kind: 'unavailable' }
  | { kind: 'retry' }

export const initialUpdateAnimeEntryStatusActionState: UpdateAnimeEntryStatusActionState =
  { kind: 'idle' }

const acceptedFormFieldNames = new Set([
  'entryId',
  'expectedStatus',
  'requestedStatus',
])

function hasOnlyAcceptedFormFields(formData: FormData): boolean {
  for (const fieldName of formData.keys()) {
    if (!acceptedFormFieldNames.has(fieldName)) {
      return false
    }
  }

  return true
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

export function parseUpdateAnimeEntryStatusFormData(
  formData: FormData,
): UpdateAnimeEntryStatusFormInputResult {
  if (!hasOnlyAcceptedFormFields(formData)) {
    return { kind: 'unavailable' }
  }

  const expectedStatus = getExactlyOneStringValue(formData, 'expectedStatus')
  const requestedStatus = getExactlyOneStringValue(formData, 'requestedStatus')

  if (
    !entryStatusSchema.safeParse(expectedStatus).success ||
    !entryStatusSchema.safeParse(requestedStatus).success
  ) {
    return { kind: 'invalid_status' }
  }

  const entryId = getExactlyOneStringValue(formData, 'entryId')
  const parsedInput = updateAnimeEntryStatusInputSchema.safeParse({
    entryId,
    expectedStatus,
    requestedStatus,
  })

  if (!parsedInput.success) {
    return { kind: 'unavailable' }
  }

  return { kind: 'valid', input: parsedInput.data }
}

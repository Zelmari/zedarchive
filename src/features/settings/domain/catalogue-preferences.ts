import { z } from '@/config/zod'

export const animeTitleLanguageValues = [
  'english',
  'romaji',
  'original',
] as const

export const animeTitleLanguageSchema = z.enum(animeTitleLanguageValues)

export type AnimeTitleLanguage = z.infer<typeof animeTitleLanguageSchema>

export type UserCataloguePreferences = {
  titleLanguage: AnimeTitleLanguage
  adultContentEnabled: boolean
}

export const defaultUserCataloguePreferences = {
  titleLanguage: 'english',
  adultContentEnabled: false,
} as const satisfies UserCataloguePreferences

export type CataloguePreferenceMutationResult =
  { kind: 'updated' } | { kind: 'unchanged' }

export type CataloguePreferenceActionState =
  | { kind: 'idle' }
  | CataloguePreferenceMutationResult
  | { kind: 'invalid' }
  | { kind: 'sign_in_required' }
  | { kind: 'session_unavailable' }
  | { kind: 'retry' }

export const initialCataloguePreferenceActionState: CataloguePreferenceActionState =
  {
    kind: 'idle',
  }

export type SetAnimeTitleLanguageFormDataResult =
  { kind: 'valid'; titleLanguage: AnimeTitleLanguage } | { kind: 'invalid' }

export type EnableAdultContentFormDataResult =
  { kind: 'valid' } | { kind: 'invalid' }

function hasExactFields(formData: FormData, expectedFields: string[]): boolean {
  const actualFields = Array.from(formData.keys()).filter(
    (field) => !field.startsWith('$ACTION_'),
  )

  return (
    actualFields.length === expectedFields.length &&
    actualFields.every((field, index) => field === expectedFields[index])
  )
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

export function parseSetAnimeTitleLanguageFormData(
  formData: FormData,
): SetAnimeTitleLanguageFormDataResult {
  if (!hasExactFields(formData, ['titleLanguage'])) {
    return { kind: 'invalid' }
  }

  const parsedLanguage = animeTitleLanguageSchema.safeParse(
    getExactlyOneStringValue(formData, 'titleLanguage'),
  )

  return parsedLanguage.success
    ? { kind: 'valid', titleLanguage: parsedLanguage.data }
    : { kind: 'invalid' }
}

export function parseEnableAdultContentFormData(
  formData: FormData,
): EnableAdultContentFormDataResult {
  if (!hasExactFields(formData, ['confirmation'])) {
    return { kind: 'invalid' }
  }

  return getExactlyOneStringValue(formData, 'confirmation') === 'at-least-18'
    ? { kind: 'valid' }
    : { kind: 'invalid' }
}

export function parseDisableAdultContentFormData(
  formData: FormData,
): EnableAdultContentFormDataResult {
  return hasExactFields(formData, []) ? { kind: 'valid' } : { kind: 'invalid' }
}

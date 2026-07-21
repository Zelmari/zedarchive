export const missingAddAnimeEntryStatusMessage =
  'Select a status before adding this anime to your archive.'

export function getAddAnimeEntryStatusValidationError(
  status: string,
): string | null {
  return status === '' ? missingAddAnimeEntryStatusMessage : null
}

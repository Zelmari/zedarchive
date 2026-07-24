import 'server-only'

import { revalidatePath } from 'next/cache'

export type CataloguePreferenceSession = {
  user?: { id?: string }
} | null

export const cataloguePreferenceRevalidationPaths = [
  '/settings',
  '/',
  '/archive/anime',
] as const

export function revalidateCataloguePreferencePaths(): void {
  for (const path of cataloguePreferenceRevalidationPaths) revalidatePath(path)
}

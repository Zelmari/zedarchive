import { z } from 'zod'

export const animeCatalogueStateValues = [
  'draft',
  'published',
  'hidden',
] as const

export const animeCatalogueStateSchema = z.enum(animeCatalogueStateValues)

export type AnimeCatalogueState = z.infer<typeof animeCatalogueStateSchema>

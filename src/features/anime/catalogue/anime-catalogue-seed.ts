import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { animeCatalogueStateSchema } from '@/features/anime/catalogue/anime-catalogue-state'
import { animeCatalogueItemSchema } from '@/features/anime/domain/anime-catalogue-item'

const sourceKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_-]{0,49}$/, 'Invalid catalogue source key')

export const animeCatalogueSeedSourceSchema = z.strictObject({
  sourceKey: sourceKeySchema,
  sourceItemId: z.string().trim().min(1),
})

export type AnimeCatalogueSeedSource = z.infer<
  typeof animeCatalogueSeedSourceSchema
>

export const animeCatalogueSeedItemSchema = animeCatalogueItemSchema.extend({
  catalogueState: animeCatalogueStateSchema,
  sources: z.array(animeCatalogueSeedSourceSchema).min(1),
})

export type AnimeCatalogueSeedItem = z.infer<
  typeof animeCatalogueSeedItemSchema
>

export const animeCatalogueSeedSchema = z
  .strictObject({
    version: z.literal(1),
    items: z.array(animeCatalogueSeedItemSchema).min(1),
  })
  .superRefine(({ items }, context) => {
    const itemIds = new Set<string>()
    const sourcePairs = new Set<string>()

    items.forEach((item, itemIndex) => {
      const canonicalItemId = item.id.toLowerCase()

      if (itemIds.has(canonicalItemId)) {
        context.addIssue({
          code: 'custom',
          path: ['items', itemIndex, 'id'],
          message: 'Catalogue item IDs must be unique within a seed',
        })
      }

      itemIds.add(canonicalItemId)

      item.sources.forEach(({ sourceKey, sourceItemId }, sourceIndex) => {
        const sourcePair = JSON.stringify([sourceKey, sourceItemId])

        if (sourcePairs.has(sourcePair)) {
          context.addIssue({
            code: 'custom',
            path: ['items', itemIndex, 'sources', sourceIndex],
            message:
              'Catalogue source key and item ID pairs must be unique within a seed',
          })
        }

        sourcePairs.add(sourcePair)
      })
    })
  })

export type AnimeCatalogueSeed = z.infer<typeof animeCatalogueSeedSchema>

export function parseAnimeCatalogueSeed(input: unknown): AnimeCatalogueSeed {
  return animeCatalogueSeedSchema.parse(input)
}

export async function loadAnimeCatalogueSeed(
  filePath: string,
): Promise<AnimeCatalogueSeed> {
  let contents: string

  try {
    contents = await readFile(filePath, 'utf8')
  } catch (error) {
    throw new Error(`Unable to read anime catalogue seed at "${filePath}"`, {
      cause: error,
    })
  }

  let input: unknown

  try {
    input = JSON.parse(contents)
  } catch (error) {
    throw new Error(`Malformed JSON in anime catalogue seed at "${filePath}"`, {
      cause: error,
    })
  }

  return parseAnimeCatalogueSeed(input)
}

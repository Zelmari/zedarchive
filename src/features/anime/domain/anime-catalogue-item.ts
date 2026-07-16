import { z } from 'zod'

const animeProviderKeyPattern = /^[a-z][a-z0-9_]*$/
const animeProviderKeySchema = z.string().trim().regex(animeProviderKeyPattern)
const animeProviderItemIdSchema = z.string().trim().min(1)
const animeTitleSchema = z.string().trim().min(1)
const animeReleaseYearSchema = z.number().int().min(1).max(9999)
const animeEpisodeCountSchema = z.number().int().positive()
const animePosterImageUrlSchema = z.url({ protocol: /^https$/ })

export const animeFormatValues = [
  'tv',
  'movie',
  'ova',
  'ona',
  'special',
  'unknown',
] as const

export const animeFormatSchema = z.enum(animeFormatValues)

export type AnimeFormat = z.infer<typeof animeFormatSchema>

export const animeReleaseStatusValues = [
  'upcoming',
  'airing',
  'finished',
  'unknown',
] as const

export const animeReleaseStatusSchema = z.enum(animeReleaseStatusValues)

export type AnimeReleaseStatus = z.infer<typeof animeReleaseStatusSchema>

export const animeMaturityValues = [
  'safe',
  'sensitive',
  'adult',
  'unknown',
] as const

export const animeMaturitySchema = z.enum(animeMaturityValues)

export type AnimeMaturity = z.infer<typeof animeMaturitySchema>

export const animeCatalogueSourceSchema = z.strictObject({
  provider: animeProviderKeySchema,
  itemId: animeProviderItemIdSchema,
})

export type AnimeCatalogueSource = z.infer<typeof animeCatalogueSourceSchema>

export const animeTitlesSchema = z
  .strictObject({
    english: animeTitleSchema.nullable(),
    romaji: animeTitleSchema.nullable(),
    original: animeTitleSchema.nullable(),
    alternatives: z.array(animeTitleSchema),
  })
  .superRefine(({ english, romaji, original, alternatives }, context) => {
    const primaryTitles = [english, romaji, original].filter(
      (title): title is string => title !== null,
    )

    if (primaryTitles.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['english'],
        message: 'At least one primary title is required',
      })
    }

    const primaryTitleSet = new Set(primaryTitles)
    const alternativeTitleSet = new Set<string>()

    alternatives.forEach((title, index) => {
      if (primaryTitleSet.has(title) || alternativeTitleSet.has(title)) {
        context.addIssue({
          code: 'custom',
          path: ['alternatives', index],
          message: 'Alternative titles must be unique',
        })
      }

      alternativeTitleSet.add(title)
    })
  })

export type AnimeTitles = z.infer<typeof animeTitlesSchema>

export const animeCatalogueItemSchema = z.strictObject({
  source: animeCatalogueSourceSchema,
  titles: animeTitlesSchema,
  format: animeFormatSchema,
  releaseStatus: animeReleaseStatusSchema,
  releaseYear: animeReleaseYearSchema.nullable(),
  episodeCount: animeEpisodeCountSchema.nullable(),
  posterImageUrl: animePosterImageUrlSchema.nullable(),
  maturity: animeMaturitySchema,
})

export type AnimeCatalogueItem = z.infer<typeof animeCatalogueItemSchema>

import { z } from 'zod'

export const episodeProgressMinimum = 0
export const episodeProgressMaximum = Number.MAX_SAFE_INTEGER

export const episodeProgressSchema = z
  .number()
  .int()
  .min(episodeProgressMinimum)
  .max(episodeProgressMaximum)

export type EpisodeProgress = z.infer<typeof episodeProgressSchema>

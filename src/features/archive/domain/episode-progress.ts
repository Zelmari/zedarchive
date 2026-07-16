import { z } from 'zod'

export const episodeProgressMinimum = 0

export const episodeProgressSchema = z
  .number()
  .int()
  .min(episodeProgressMinimum)

export type EpisodeProgress = z.infer<typeof episodeProgressSchema>

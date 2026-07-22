import { z } from 'zod'
import { episodeProgressMaximum } from '@/features/archive/domain/episode-progress'

export const episodeTotalMinimum = 1

export const episodeTotalSchema = z
  .number()
  .int()
  .min(episodeTotalMinimum)
  .max(episodeProgressMaximum)

export type EpisodeTotal = z.infer<typeof episodeTotalSchema>

export function getEffectiveEpisodeTotal(
  catalogueTotal: EpisodeTotal | null,
  personalTotal: EpisodeTotal | null,
): EpisodeTotal | null {
  return personalTotal ?? catalogueTotal
}

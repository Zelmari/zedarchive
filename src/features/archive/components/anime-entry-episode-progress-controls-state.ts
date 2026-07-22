import {
  episodeProgressSchema,
  type EpisodeProgress,
} from '@/features/archive/domain/episode-progress'
import { shouldOfferCompletion } from '@/features/archive/components/anime-entry-tracking-coordinator-state'
import {
  episodeTotalSchema,
  type EpisodeTotal,
} from '@/features/archive/domain/episode-total'
import type { UpdateAnimeEntryEpisodeProgressActionState } from '@/features/archive/domain/update-anime-entry-episode-progress'
import type { UpdateAnimeEntryEpisodeTotalActionState } from '@/features/archive/domain/update-anime-entry-episode-total'
import type { EntryStatus } from '@/features/archive/domain/entry-status'

function parseStrictWholeNumber(value: string): number | null {
  if (!/^[0-9]+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function parseEpisodeProgressControlInput(
  value: string,
): EpisodeProgress | null {
  const parsed = parseStrictWholeNumber(value)
  const validated = episodeProgressSchema.safeParse(parsed)
  return validated.success ? validated.data : null
}

export function parseEpisodeTotalControlInput(
  value: string,
): EpisodeTotal | null {
  const parsed = parseStrictWholeNumber(value)
  const validated = episodeTotalSchema.safeParse(parsed)
  return validated.success ? validated.data : null
}

export function getProgressSaveInput(
  value: string,
  authoritativeProgress: EpisodeProgress,
): EpisodeProgress | null {
  const requested = parseEpisodeProgressControlInput(value)
  return requested === null || requested === authoritativeProgress
    ? null
    : requested
}

export function shouldEnableProgressSave(
  value: string,
  authoritativeProgress: EpisodeProgress,
): boolean {
  const requested = parseEpisodeProgressControlInput(value)
  return requested === null ? value !== '' : requested !== authoritativeProgress
}

export function getTotalSaveInput(
  value: string,
  authoritativePersonalTotal: EpisodeTotal | null,
): EpisodeTotal | null {
  const requested = parseEpisodeTotalControlInput(value)
  return requested === null || requested === authoritativePersonalTotal
    ? null
    : requested
}

export function shouldEnableTotalSave(
  value: string,
  authoritativePersonalTotal: EpisodeTotal | null,
): boolean {
  const requested = parseEpisodeTotalControlInput(value)
  return requested === null
    ? value !== ''
    : requested !== authoritativePersonalTotal
}

export function getPersonalTotalEditorInitialValue(
  personalTotal: EpisodeTotal | null,
  catalogueTotal: EpisodeTotal | null,
): string {
  return personalTotal === null
    ? catalogueTotal === null
      ? ''
      : String(catalogueTotal)
    : String(personalTotal)
}

export function shouldOfferCompletionFromMutation(
  status: EntryStatus,
  progress: EpisodeProgress,
  personalTotal: EpisodeTotal | null,
  catalogueTotal: EpisodeTotal | null,
): boolean {
  return shouldOfferCompletion({
    status,
    progress,
    personalTotal,
    catalogueTotal,
  })
}

export function reconcileProgressEditorValue(
  attemptedValue: string,
  result: UpdateAnimeEntryEpisodeProgressActionState,
): string {
  return result.kind === 'updated' || result.kind === 'unchanged'
    ? String(result.progress)
    : attemptedValue
}

export function reconcileTotalEditorValue(
  attemptedValue: string,
  result: UpdateAnimeEntryEpisodeTotalActionState,
): string {
  return result.kind === 'updated' || result.kind === 'unchanged'
    ? result.personalTotal === null
      ? ''
      : String(result.personalTotal)
    : attemptedValue
}

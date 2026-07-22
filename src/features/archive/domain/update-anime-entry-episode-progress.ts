import { z } from 'zod'
import {
  episodeProgressSchema,
  type EpisodeProgress,
} from '@/features/archive/domain/episode-progress'
import type { EpisodeTotal } from '@/features/archive/domain/episode-total'
import type { EntryStatus } from '@/features/archive/domain/entry-status'

export const updateAnimeEntryEpisodeProgressInputSchema = z.strictObject({
  entryId: z.uuidv4(),
  expectedEpisodeProgress: episodeProgressSchema,
  requestedEpisodeProgress: episodeProgressSchema,
})
export type UpdateAnimeEntryEpisodeProgressInput = z.infer<
  typeof updateAnimeEntryEpisodeProgressInputSchema
>
export type EpisodeProgressMutationResult =
  | {
      kind: 'updated' | 'unchanged'
      progress: EpisodeProgress
      personalTotal: EpisodeTotal | null
      catalogueTotal: EpisodeTotal | null
      status: EntryStatus
    }
  | { kind: 'conflict'; currentProgress: EpisodeProgress }
  | { kind: 'unavailable' }
export type UpdateAnimeEntryEpisodeProgressActionState =
  | {
      kind:
        | 'idle'
        | 'invalid_progress'
        | 'sign_in_required'
        | 'session_unavailable'
        | 'unavailable'
        | 'retry'
    }
  | EpisodeProgressMutationResult
export const initialUpdateAnimeEntryEpisodeProgressActionState: UpdateAnimeEntryEpisodeProgressActionState =
  { kind: 'idle' }

const fields = new Set([
  'entryId',
  'expectedEpisodeProgress',
  'requestedEpisodeProgress',
])
function getOne(formData: FormData, name: string): string | null {
  const values = formData.getAll(name)
  return values.length === 1 && typeof values[0] === 'string' ? values[0] : null
}
function parseEpisodeProgress(value: string | null): EpisodeProgress | null {
  if (value === null || !/^[0-9]+$/.test(value)) return null
  const parsed = episodeProgressSchema.safeParse(Number(value))
  return parsed.success ? parsed.data : null
}
export function parseUpdateAnimeEntryEpisodeProgressFormData(
  formData: FormData,
):
  | { kind: 'valid'; input: UpdateAnimeEntryEpisodeProgressInput }
  | { kind: 'invalid_progress' }
  | { kind: 'unavailable' } {
  if (Array.from(formData.keys()).some((key) => !fields.has(key)))
    return { kind: 'unavailable' }
  const expected = parseEpisodeProgress(
    getOne(formData, 'expectedEpisodeProgress'),
  )
  if (expected === null) return { kind: 'unavailable' }

  const requested = parseEpisodeProgress(
    getOne(formData, 'requestedEpisodeProgress'),
  )
  if (requested === null) return { kind: 'invalid_progress' }

  const parsed = updateAnimeEntryEpisodeProgressInputSchema.safeParse({
    entryId: getOne(formData, 'entryId'),
    expectedEpisodeProgress: expected,
    requestedEpisodeProgress: requested,
  })
  return parsed.success
    ? { kind: 'valid', input: parsed.data }
    : { kind: 'unavailable' }
}

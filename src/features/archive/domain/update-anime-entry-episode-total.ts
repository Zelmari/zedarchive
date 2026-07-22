import { z } from 'zod'
import {
  episodeTotalSchema,
  type EpisodeTotal,
} from '@/features/archive/domain/episode-total'
import type { EpisodeProgress } from '@/features/archive/domain/episode-progress'
import type { EntryStatus } from '@/features/archive/domain/entry-status'

export const episodeTotalNoneSentinel = 'none'
export const updateAnimeEntryEpisodeTotalInputSchema = z.strictObject({
  entryId: z.uuidv4(),
  expectedEpisodeTotalOverride: episodeTotalSchema.nullable(),
  requestedEpisodeTotalOverride: episodeTotalSchema.nullable(),
})
export type UpdateAnimeEntryEpisodeTotalInput = z.infer<
  typeof updateAnimeEntryEpisodeTotalInputSchema
>
export type EpisodeTotalMutationResult =
  | {
      kind: 'updated' | 'unchanged'
      personalTotal: EpisodeTotal | null
      progress: EpisodeProgress
      catalogueTotal: EpisodeTotal | null
      status: EntryStatus
    }
  | { kind: 'conflict'; currentPersonalTotal: EpisodeTotal | null }
  | { kind: 'unavailable' }
export type UpdateAnimeEntryEpisodeTotalActionState =
  | {
      kind:
        | 'idle'
        | 'invalid_total'
        | 'sign_in_required'
        | 'session_unavailable'
        | 'unavailable'
        | 'retry'
    }
  | EpisodeTotalMutationResult
export const initialUpdateAnimeEntryEpisodeTotalActionState: UpdateAnimeEntryEpisodeTotalActionState =
  { kind: 'idle' }
const fields = new Set([
  'entryId',
  'expectedEpisodeTotalOverride',
  'requestedEpisodeTotalOverride',
])
function getOne(formData: FormData, name: string): string | null {
  const values = formData.getAll(name)
  return values.length === 1 && typeof values[0] === 'string' ? values[0] : null
}
function parseTotal(value: string | null): EpisodeTotal | null | undefined {
  if (value === episodeTotalNoneSentinel) return null
  if (value === null || !/^[0-9]+$/.test(value)) return undefined
  const parsed = Number(value)
  return episodeTotalSchema.safeParse(parsed).success ? parsed : undefined
}
export function parseUpdateAnimeEntryEpisodeTotalFormData(
  formData: FormData,
):
  | { kind: 'valid'; input: UpdateAnimeEntryEpisodeTotalInput }
  | { kind: 'invalid_total' }
  | { kind: 'unavailable' } {
  if (Array.from(formData.keys()).some((key) => !fields.has(key)))
    return { kind: 'unavailable' }
  const expected = parseTotal(getOne(formData, 'expectedEpisodeTotalOverride'))
  if (expected === undefined) return { kind: 'unavailable' }

  const requested = parseTotal(
    getOne(formData, 'requestedEpisodeTotalOverride'),
  )
  if (requested === undefined) return { kind: 'invalid_total' }
  const parsed = updateAnimeEntryEpisodeTotalInputSchema.safeParse({
    entryId: getOne(formData, 'entryId'),
    expectedEpisodeTotalOverride: expected,
    requestedEpisodeTotalOverride: requested,
  })
  return parsed.success
    ? { kind: 'valid', input: parsed.data }
    : { kind: 'unavailable' }
}

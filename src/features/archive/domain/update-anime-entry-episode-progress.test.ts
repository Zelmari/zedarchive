import { describe, expect, it } from 'vitest'
import { parseUpdateAnimeEntryEpisodeProgressFormData } from '@/features/archive/domain/update-anime-entry-episode-progress'
const data = () => {
  const form = new FormData()
  form.set('entryId', '11111111-1111-4111-8111-111111111111')
  form.set('expectedEpisodeProgress', '0')
  form.set('requestedEpisodeProgress', '12')
  return form
}
describe('episode progress command parser', () => {
  it('parses exact ASCII-digit fields', () =>
    expect(parseUpdateAnimeEntryEpisodeProgressFormData(data())).toMatchObject({
      kind: 'valid',
      input: { requestedEpisodeProgress: 12 },
    }))
  it.each(['', ' 1', '+1', '1.2', '1e2', '-1', '9007199254740992'])(
    'reports malformed requested progress %s as invalid progress',
    (value) => {
      const form = data()
      form.set('requestedEpisodeProgress', value)
      expect(parseUpdateAnimeEntryEpisodeProgressFormData(form)).toEqual({
        kind: 'invalid_progress',
      })
    },
  )
  it.each([
    [
      'missing requested progress',
      (form: FormData) => form.delete('requestedEpisodeProgress'),
    ],
    [
      'repeated requested progress',
      (form: FormData) => form.append('requestedEpisodeProgress', '12'),
    ],
    [
      'File requested progress',
      (form: FormData) =>
        form.set('requestedEpisodeProgress', new File(['12'], 'progress.txt')),
    ],
  ])('reports %s as invalid progress', (_, alter) => {
    const form = data()
    alter(form)
    expect(parseUpdateAnimeEntryEpisodeProgressFormData(form)).toEqual({
      kind: 'invalid_progress',
    })
  })
  it.each([
    ['unknown extra field', (form: FormData) => form.set('userId', 'x')],
    ['missing entry ID', (form: FormData) => form.delete('entryId')],
    [
      'malformed entry ID',
      (form: FormData) => form.set('entryId', 'not-a-uuid'),
    ],
    [
      'repeated entry ID',
      (form: FormData) =>
        form.append('entryId', '11111111-1111-4111-8111-111111111111'),
    ],
    [
      'File entry ID',
      (form: FormData) => form.set('entryId', new File(['id'], 'entry.txt')),
    ],
    [
      'missing expected progress',
      (form: FormData) => form.delete('expectedEpisodeProgress'),
    ],
    [
      'malformed expected progress',
      (form: FormData) => form.set('expectedEpisodeProgress', '1e2'),
    ],
    [
      'repeated expected progress',
      (form: FormData) => form.append('expectedEpisodeProgress', '0'),
    ],
    [
      'File expected progress',
      (form: FormData) =>
        form.set('expectedEpisodeProgress', new File(['0'], 'expected.txt')),
    ],
  ])('collapses %s to unavailable', (_, alter) => {
    const form = data()
    alter(form)
    expect(parseUpdateAnimeEntryEpisodeProgressFormData(form)).toEqual({
      kind: 'unavailable',
    })
  })
})

import { describe, expect, it } from 'vitest'
import {
  episodeTotalNoneSentinel,
  parseUpdateAnimeEntryEpisodeTotalFormData,
} from '@/features/archive/domain/update-anime-entry-episode-total'
const data = () => {
  const form = new FormData()
  form.set('entryId', '11111111-1111-4111-8111-111111111111')
  form.set('expectedEpisodeTotalOverride', episodeTotalNoneSentinel)
  form.set('requestedEpisodeTotalOverride', '12')
  return form
}
describe('episode total command parser', () => {
  it('uses the exact none sentinel only for explicit nullable values', () => {
    expect(parseUpdateAnimeEntryEpisodeTotalFormData(data())).toMatchObject({
      kind: 'valid',
      input: {
        expectedEpisodeTotalOverride: null,
        requestedEpisodeTotalOverride: 12,
      },
    })
    const clear = data()
    clear.set('requestedEpisodeTotalOverride', episodeTotalNoneSentinel)
    expect(parseUpdateAnimeEntryEpisodeTotalFormData(clear)).toMatchObject({
      kind: 'valid',
      input: { requestedEpisodeTotalOverride: null },
    })
  })
  it.each(['', '0', '+1', '1e2', ' 1', 'NONE'])(
    'reports malformed requested total %s as invalid total',
    (value) => {
      const form = data()
      form.set('requestedEpisodeTotalOverride', value)
      expect(parseUpdateAnimeEntryEpisodeTotalFormData(form)).toEqual({
        kind: 'invalid_total',
      })
    },
  )
  it.each([
    [
      'missing requested total',
      (form: FormData) => form.delete('requestedEpisodeTotalOverride'),
    ],
    [
      'repeated requested total',
      (form: FormData) => form.append('requestedEpisodeTotalOverride', '12'),
    ],
    [
      'File requested total',
      (form: FormData) =>
        form.set(
          'requestedEpisodeTotalOverride',
          new File(['12'], 'total.txt'),
        ),
    ],
  ])('reports %s as invalid total', (_, alter) => {
    const form = data()
    alter(form)
    expect(parseUpdateAnimeEntryEpisodeTotalFormData(form)).toEqual({
      kind: 'invalid_total',
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
      'missing expected total',
      (form: FormData) => form.delete('expectedEpisodeTotalOverride'),
    ],
    [
      'malformed expected total',
      (form: FormData) => form.set('expectedEpisodeTotalOverride', 'NONE'),
    ],
    [
      'repeated expected total',
      (form: FormData) =>
        form.append('expectedEpisodeTotalOverride', episodeTotalNoneSentinel),
    ],
    [
      'File expected total',
      (form: FormData) =>
        form.set(
          'expectedEpisodeTotalOverride',
          new File(['none'], 'expected.txt'),
        ),
    ],
  ])('collapses %s to unavailable', (_, alter) => {
    const form = data()
    alter(form)
    expect(parseUpdateAnimeEntryEpisodeTotalFormData(form)).toEqual({
      kind: 'unavailable',
    })
  })
})

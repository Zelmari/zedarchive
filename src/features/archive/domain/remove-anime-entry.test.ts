import { describe, expect, it } from 'vitest'
import { parseRemoveAnimeEntryFormData } from '@/features/archive/domain/remove-anime-entry'

const entryId = '11111111-1111-4111-8111-111111111111'

function validFormData(): FormData {
  const formData = new FormData()
  formData.set('entryId', entryId)
  return formData
}

describe('remove anime entry command parser', () => {
  it('accepts exactly one UUID-v4 entry identity without normalization', () => {
    const formData = validFormData()

    expect(parseRemoveAnimeEntryFormData(formData)).toEqual({
      kind: 'valid',
      input: { entryId },
    })
    expect(formData.getAll('entryId')).toEqual([entryId])
  })

  it.each([
    ['missing entry ID', (formData: FormData) => formData.delete('entryId')],
    ['blank entry ID', (formData: FormData) => formData.set('entryId', '')],
    [
      'whitespace entry ID',
      (formData: FormData) => formData.set('entryId', ` ${entryId}`),
    ],
    [
      'malformed entry ID',
      (formData: FormData) => formData.set('entryId', 'not-a-uuid'),
    ],
    [
      'non-v4 entry ID',
      (formData: FormData) =>
        formData.set('entryId', '11111111-1111-1111-8111-111111111111'),
    ],
    [
      'repeated entry ID',
      (formData: FormData) => formData.append('entryId', entryId),
    ],
    [
      'File entry ID',
      (formData: FormData) =>
        formData.set('entryId', new File(['entry'], 'entry.txt')),
    ],
    [
      'supplied owner ID',
      (formData: FormData) => formData.set('userId', entryId),
    ],
    [
      'supplied catalogue ID',
      (formData: FormData) => formData.set('catalogueItemId', entryId),
    ],
    [
      'supplied title',
      (formData: FormData) => formData.set('title', 'Private title'),
    ],
    ['supplied page', (formData: FormData) => formData.set('page', '2')],
    [
      'supplied sort',
      (formData: FormData) => formData.set('sort', 'alphabetical'),
    ],
  ])('fails closed for %s', (_, alter) => {
    const formData = validFormData()
    alter(formData)

    expect(parseRemoveAnimeEntryFormData(formData)).toEqual({
      kind: 'unavailable',
    })
  })
})

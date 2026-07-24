import { describe, expect, it } from 'vitest'
import {
  animeTitleLanguageSchema,
  defaultUserCataloguePreferences,
  parseDisableAdultContentFormData,
  parseEnableAdultContentFormData,
  parseSetAnimeTitleLanguageFormData,
} from '@/features/settings/domain/catalogue-preferences'

describe('catalogue preference domain', () => {
  it('defines the safe missing-row default', () => {
    expect(defaultUserCataloguePreferences).toEqual({
      titleLanguage: 'english',
      adultContentEnabled: false,
    })
  })

  it.each(['english', 'romaji', 'original'])(
    'accepts the title language %s',
    (language) => {
      expect(animeTitleLanguageSchema.parse(language)).toBe(language)
    },
  )

  it.each(['', 'English', 'japanese', 'original '])(
    'rejects the title language %j',
    (language) => {
      expect(animeTitleLanguageSchema.safeParse(language).success).toBe(false)
    },
  )

  it('parses one exact title-language field', () => {
    const formData = new FormData()
    formData.set('titleLanguage', 'romaji')

    expect(parseSetAnimeTitleLanguageFormData(formData)).toEqual({
      kind: 'valid',
      titleLanguage: 'romaji',
    })
  })

  it('ignores only framework-owned action metadata for hydrated commands', () => {
    expect(
      parseSetAnimeTitleLanguageFormData(
        formData([
          ['$ACTION_REF_1', 'framework-metadata'],
          ['titleLanguage', 'original'],
        ]),
      ),
    ).toEqual({
      kind: 'valid',
      titleLanguage: 'original',
    })
    expect(
      parseEnableAdultContentFormData(
        formData([
          ['$ACTION_KEY', 'framework-metadata'],
          ['confirmation', 'at-least-18'],
        ]),
      ),
    ).toEqual({ kind: 'valid' })
    expect(
      parseDisableAdultContentFormData(
        formData([['$ACTION_ID_example', 'framework-metadata']]),
      ),
    ).toEqual({ kind: 'valid' })
  })

  it.each([
    new FormData(),
    formData([['titleLanguage', 'unknown']]),
    formData([
      ['titleLanguage', 'english'],
      ['titleLanguage', 'romaji'],
    ]),
    formData([
      ['titleLanguage', 'english'],
      ['userId', 'untrusted'],
    ]),
    formData([['titleLanguage', new File(['x'], 'x.txt')]]),
  ])('rejects malformed title commands before action work', (input) => {
    expect(parseSetAnimeTitleLanguageFormData(input)).toEqual({
      kind: 'invalid',
    })
  })

  it('requires the exact one-use adult confirmation literal', () => {
    expect(
      parseEnableAdultContentFormData(
        formData([['confirmation', 'at-least-18']]),
      ),
    ).toEqual({ kind: 'valid' })
  })

  it.each([
    new FormData(),
    formData([['confirmation', 'on']]),
    formData([
      ['confirmation', 'at-least-18'],
      ['confirmation', 'at-least-18'],
    ]),
    formData([
      ['confirmation', 'at-least-18'],
      ['userId', 'untrusted'],
    ]),
    formData([['confirmation', new File(['x'], 'x.txt')]]),
  ])('rejects malformed adult-enable commands', (input) => {
    expect(parseEnableAdultContentFormData(input)).toEqual({ kind: 'invalid' })
  })

  it('accepts only an empty adult-disable command', () => {
    expect(parseDisableAdultContentFormData(new FormData())).toEqual({
      kind: 'valid',
    })
    expect(
      parseDisableAdultContentFormData(formData([['enabled', 'false']])),
    ).toEqual({ kind: 'invalid' })
  })
})

function formData(entries: [string, string | File][]) {
  const value = new FormData()

  for (const [name, entry] of entries) value.append(name, entry)

  return value
}

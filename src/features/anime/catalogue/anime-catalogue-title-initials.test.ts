import { describe, expect, it } from 'vitest'
import { getAnimeCatalogueTitleInitials } from '@/features/anime/catalogue/anime-catalogue-title-initials'

describe('getAnimeCatalogueTitleInitials', () => {
  it.each([
    ['a two-word English title', 'Cowboy Bebop', 'CB'],
    ['a single-token title', 'FLCL', 'F'],
    ['collapsed surrounding whitespace', '  Cowboy   Bebop  ', 'CB'],
    ['punctuation-only tokens before usable words', '... Cowboy Bebop', 'CB'],
    ['a title beginning with digits', '86 Eighty-Six', '8E'],
    ['lowercase accented Latin', 'élan vital', 'ÉV'],
    ['Japanese tokens', 'カウボーイ ビバップ', 'カビ'],
    ['German sharp-s uppercase expansion', 'ß', 'S'],
    ['ligature uppercase expansion', 'ﬃ', 'F'],
    ['a punctuation-only title', '!!!', '!'],
    ['an emoji-only title', '✨✨', '✨'],
  ])('derives initials for %s', (_name, title, expected) => {
    expect(getAnimeCatalogueTitleInitials(title)).toBe(expected)
  })

  it.each([
    ['an empty string', ''],
    ['whitespace only', ' \t\n '],
  ])('rejects %s', (_name, title) => {
    expect(() => getAnimeCatalogueTitleInitials(title)).toThrow(
      'Anime catalogue title must not be empty',
    )
  })
})

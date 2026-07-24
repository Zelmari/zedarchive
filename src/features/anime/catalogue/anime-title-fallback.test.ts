import { describe, expect, it } from 'vitest'
import {
  getDefaultAnimeTitle,
  getPreferredAnimeTitle,
} from '@/features/anime/catalogue/anime-title-fallback'
import type { AnimeTitles } from '@/features/anime/domain/anime-catalogue-item'
import type { AnimeTitleLanguage } from '@/features/settings/domain/catalogue-preferences'

function createTitles(overrides: Partial<AnimeTitles> = {}): AnimeTitles {
  return {
    english: 'Cowboy Bebop',
    romaji: 'Cowboy Bebop',
    original: 'カウボーイビバップ',
    alternatives: ['COWBOY BEBOP'],
    ...overrides,
  }
}

describe('getDefaultAnimeTitle', () => {
  it('returns the English title when it is present', () => {
    expect(getDefaultAnimeTitle(createTitles())).toBe('Cowboy Bebop')
  })

  it('falls back to Romaji when English is missing', () => {
    expect(
      getDefaultAnimeTitle(
        createTitles({
          english: null,
        }),
      ),
    ).toBe('Cowboy Bebop')
  })

  it('falls back to the original title when English and Romaji are missing', () => {
    expect(
      getDefaultAnimeTitle(
        createTitles({
          english: null,
          romaji: null,
        }),
      ),
    ).toBe('カウボーイビバップ')
  })

  it('does not use alternative titles as display fallback', () => {
    expect(
      getDefaultAnimeTitle(
        createTitles({
          english: null,
          romaji: null,
          original: 'カウボーイビバップ',
          alternatives: ['COWBOY BEBOP', 'Space Adventure'],
        }),
      ),
    ).toBe('カウボーイビバップ')
  })

  it('prefers English over Romaji and original even when alternatives exist', () => {
    expect(
      getDefaultAnimeTitle(
        createTitles({
          english: 'FLCL',
          romaji: 'Furi Kuri',
          original: 'フリクリ',
          alternatives: ['Fooly Cooly'],
        }),
      ),
    ).toBe('FLCL')
  })

  it('rejects an object that violates the primary-title domain invariant', () => {
    expect(() =>
      getDefaultAnimeTitle(
        createTitles({
          english: null,
          romaji: null,
          original: null,
        }),
      ),
    ).toThrow('Anime catalogue item requires at least one primary title')
  })
})

describe('getPreferredAnimeTitle', () => {
  const titleCombinations = [
    {
      english: 'English',
      romaji: 'Romaji',
      original: 'Original',
      expected: {
        english: 'English',
        romaji: 'Romaji',
        original: 'Original',
      },
    },
    {
      english: 'English',
      romaji: 'Romaji',
      original: null,
      expected: { english: 'English', romaji: 'Romaji', original: 'Romaji' },
    },
    {
      english: 'English',
      romaji: null,
      original: 'Original',
      expected: {
        english: 'English',
        romaji: 'English',
        original: 'Original',
      },
    },
    {
      english: null,
      romaji: 'Romaji',
      original: 'Original',
      expected: {
        english: 'Romaji',
        romaji: 'Romaji',
        original: 'Original',
      },
    },
    {
      english: 'English',
      romaji: null,
      original: null,
      expected: { english: 'English', romaji: 'English', original: 'English' },
    },
    {
      english: null,
      romaji: 'Romaji',
      original: null,
      expected: { english: 'Romaji', romaji: 'Romaji', original: 'Romaji' },
    },
    {
      english: null,
      romaji: null,
      original: 'Original',
      expected: {
        english: 'Original',
        romaji: 'Original',
        original: 'Original',
      },
    },
  ] satisfies {
    english: string | null
    romaji: string | null
    original: string | null
    expected: Record<AnimeTitleLanguage, string>
  }[]

  it.each(
    titleCombinations.flatMap((titles) =>
      (['english', 'romaji', 'original'] as const).map((titleLanguage) => ({
        ...titles,
        titleLanguage,
        expectedTitle: titles.expected[titleLanguage],
      })),
    ),
  )(
    'resolves $titleLanguage from English=$english Romaji=$romaji Original=$original',
    ({ english, romaji, original, titleLanguage, expectedTitle }) => {
      expect(
        getPreferredAnimeTitle(
          createTitles({ english, romaji, original }),
          titleLanguage,
        ),
      ).toBe(expectedTitle)
    },
  )

  it.each(['english', 'romaji', 'original'] as const)(
    'never uses alternatives for %s display',
    (titleLanguage) => {
      expect(
        getPreferredAnimeTitle(
          createTitles({
            english: titleLanguage === 'english' ? 'English' : null,
            romaji: titleLanguage === 'romaji' ? 'Romaji' : null,
            original: titleLanguage === 'original' ? 'Original' : null,
            alternatives: ['Alternative'],
          }),
          titleLanguage,
        ),
      ).toBe(
        {
          english: 'English',
          romaji: 'Romaji',
          original: 'Original',
        }[titleLanguage],
      )
    },
  )
})

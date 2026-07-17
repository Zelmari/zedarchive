import { describe, expect, it } from 'vitest'
import { getDefaultAnimeTitle } from '@/features/anime/catalogue/anime-title-fallback'
import type { AnimeTitles } from '@/features/anime/domain/anime-catalogue-item'

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

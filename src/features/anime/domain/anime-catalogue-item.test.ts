import { describe, expect, it } from 'vitest'
import {
  animeCatalogueItemSchema,
  animeCatalogueSourceSchema,
  animeFormatSchema,
  animeFormatValues,
  animeMaturitySchema,
  animeMaturityValues,
  animeReleaseStatusSchema,
  animeReleaseStatusValues,
  animeTitlesSchema,
} from '@/features/anime/domain/anime-catalogue-item'

function createCompleteAnimeCatalogueItem() {
  return {
    source: {
      provider: 'example_provider',
      itemId: '1',
    },
    titles: {
      english: 'Cowboy Bebop',
      romaji: 'Cowboy Bebop',
      original: 'カウボーイビバップ',
      alternatives: ['COWBOY BEBOP'],
    },
    format: 'tv',
    releaseStatus: 'finished',
    releaseYear: 1998,
    episodeCount: 26,
    posterImageUrl: 'https://images.example.test/cowboy-bebop.jpg',
    maturity: 'safe',
  }
}

describe('animeFormatSchema', () => {
  it.each(animeFormatValues)('accepts the canonical "%s" format', (format) => {
    expect(animeFormatSchema.parse(format)).toBe(format)
  })

  it.each([
    '',
    'TV',
    ' tv',
    'tv ',
    'series',
    'tv_series',
    'music',
    'web-anime',
  ])('rejects the noncanonical string "%s"', (format) => {
    expect(animeFormatSchema.safeParse(format).success).toBe(false)
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['number', 1],
    ['boolean', true],
    ['array', ['tv']],
    ['object', { format: 'tv' }],
  ])('rejects a %s value', (_, format) => {
    expect(animeFormatSchema.safeParse(format).success).toBe(false)
  })
})

describe('animeReleaseStatusSchema', () => {
  it.each(animeReleaseStatusValues)(
    'accepts the canonical "%s" release status',
    (releaseStatus) => {
      expect(animeReleaseStatusSchema.parse(releaseStatus)).toBe(releaseStatus)
    },
  )

  it.each([
    '',
    'AIRING',
    ' airing',
    'airing ',
    'currently_airing',
    'finished_airing',
    'completed',
    'not-yet-aired',
  ])('rejects the noncanonical string "%s"', (releaseStatus) => {
    expect(animeReleaseStatusSchema.safeParse(releaseStatus).success).toBe(
      false,
    )
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['number', 1],
    ['boolean', true],
    ['array', ['airing']],
    ['object', { releaseStatus: 'airing' }],
  ])('rejects a %s value', (_, releaseStatus) => {
    expect(animeReleaseStatusSchema.safeParse(releaseStatus).success).toBe(
      false,
    )
  })
})

describe('animeMaturitySchema', () => {
  it.each(animeMaturityValues)(
    'accepts the canonical "%s" maturity',
    (maturity) => {
      expect(animeMaturitySchema.parse(maturity)).toBe(maturity)
    },
  )

  it.each([
    '',
    'SAFE',
    ' safe',
    'safe ',
    'not-safe',
    'white',
    'gray',
    'black',
    'rx',
  ])('rejects the noncanonical string "%s"', (maturity) => {
    expect(animeMaturitySchema.safeParse(maturity).success).toBe(false)
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['number', 18],
    ['boolean', true],
    ['array', ['adult']],
    ['object', { maturity: 'adult' }],
  ])('rejects a %s value', (_, maturity) => {
    expect(animeMaturitySchema.safeParse(maturity).success).toBe(false)
  })
})

describe('animeCatalogueSourceSchema', () => {
  it('accepts and trims a provider key and opaque item ID', () => {
    expect(
      animeCatalogueSourceSchema.parse({
        provider: ' example_provider ',
        itemId: ' 1 ',
      }),
    ).toEqual({
      provider: 'example_provider',
      itemId: '1',
    })
  })

  it.each([
    '550e8400-e29b-41d4-a716-446655440000',
    'cowboy-bebop',
    'anime_1:season_2',
  ])('accepts the opaque item ID "%s"', (itemId) => {
    expect(
      animeCatalogueSourceSchema.parse({
        provider: 'example_provider',
        itemId,
      }).itemId,
    ).toBe(itemId)
  })

  it.each([
    '',
    '_provider',
    '1provider',
    'Example',
    'example-provider',
    'example provider',
    'example.provider',
  ])('rejects the invalid provider key "%s"', (provider) => {
    expect(
      animeCatalogueSourceSchema.safeParse({ provider, itemId: '1' }).success,
    ).toBe(false)
  })

  it.each(['', ' ', ' \n '])('rejects the empty item ID "%s"', (itemId) => {
    expect(
      animeCatalogueSourceSchema.safeParse({
        provider: 'example_provider',
        itemId,
      }).success,
    ).toBe(false)
  })

  it('rejects a numeric item ID', () => {
    expect(
      animeCatalogueSourceSchema.safeParse({
        provider: 'example_provider',
        itemId: 1,
      }).success,
    ).toBe(false)
  })

  it.each(['provider', 'itemId'])(
    'rejects a source missing the required "%s" key',
    (missingKey) => {
      const source: Record<string, unknown> = {
        provider: 'example_provider',
        itemId: '1',
      }

      delete source[missingKey]

      expect(animeCatalogueSourceSchema.safeParse(source).success).toBe(false)
    },
  )

  it('rejects unexpected source fields', () => {
    expect(
      animeCatalogueSourceSchema.safeParse({
        provider: 'example_provider',
        itemId: '1',
        numericId: 1,
      }).success,
    ).toBe(false)
  })
})

describe('animeTitlesSchema', () => {
  it.each([
    {
      english: 'Cowboy Bebop',
      romaji: null,
      original: null,
      alternatives: [],
    },
    {
      english: null,
      romaji: 'Cowboy Bebop',
      original: null,
      alternatives: [],
    },
    {
      english: null,
      romaji: null,
      original: 'カウボーイビバップ',
      alternatives: [],
    },
  ])('accepts a title set with one available primary title', (titles) => {
    expect(animeTitlesSchema.parse(titles)).toEqual(titles)
  })

  it('accepts equal primary title variants', () => {
    const titles = {
      english: 'Cowboy Bebop',
      romaji: 'Cowboy Bebop',
      original: 'カウボーイビバップ',
      alternatives: [],
    }

    expect(animeTitlesSchema.parse(titles)).toEqual(titles)
  })

  it('trims titles while preserving internal spacing and capitalisation', () => {
    expect(
      animeTitlesSchema.parse({
        english: '  Cowboy  BEBOP  ',
        romaji: null,
        original: null,
        alternatives: ['  COWBOY BEBOP  '],
      }),
    ).toEqual({
      english: 'Cowboy  BEBOP',
      romaji: null,
      original: null,
      alternatives: ['COWBOY BEBOP'],
    })
  })

  it('rejects a title set without a primary title', () => {
    expect(
      animeTitlesSchema.safeParse({
        english: null,
        romaji: null,
        original: null,
        alternatives: ['Space Cowboy'],
      }).success,
    ).toBe(false)
  })

  it.each(['english', 'romaji', 'original', 'alternatives'])(
    'rejects a title set missing the required "%s" key',
    (missingKey) => {
      const titles: Record<string, unknown> = {
        english: 'Cowboy Bebop',
        romaji: null,
        original: null,
        alternatives: [],
      }

      delete titles[missingKey]

      expect(animeTitlesSchema.safeParse(titles).success).toBe(false)
    },
  )

  it.each(['', ' ', ' \n '])(
    'rejects the empty primary title "%s"',
    (english) => {
      expect(
        animeTitlesSchema.safeParse({
          english,
          romaji: null,
          original: null,
          alternatives: [],
        }).success,
      ).toBe(false)
    },
  )

  it.each(['', ' ', ' \n '])(
    'rejects the empty alternative title "%s"',
    (alternative) => {
      expect(
        animeTitlesSchema.safeParse({
          english: 'Cowboy Bebop',
          romaji: null,
          original: null,
          alternatives: [alternative],
        }).success,
      ).toBe(false)
    },
  )

  it.each([
    ['exact duplicates', ['Space Cowboy', 'Space Cowboy']],
    ['trim-equivalent duplicates', ['Space Cowboy', ' Space Cowboy ']],
  ])('rejects %s in alternative titles', (_, alternatives) => {
    expect(
      animeTitlesSchema.safeParse({
        english: 'Cowboy Bebop',
        romaji: null,
        original: null,
        alternatives,
      }).success,
    ).toBe(false)
  })

  it('rejects an alternative title equal to a primary title', () => {
    expect(
      animeTitlesSchema.safeParse({
        english: 'Cowboy Bebop',
        romaji: null,
        original: null,
        alternatives: [' Cowboy Bebop '],
      }).success,
    ).toBe(false)
  })

  it('rejects unexpected title fields', () => {
    expect(
      animeTitlesSchema.safeParse({
        english: 'Cowboy Bebop',
        romaji: null,
        original: null,
        alternatives: [],
        japanese: 'カウボーイビバップ',
      }).success,
    ).toBe(false)
  })
})

describe('animeCatalogueItemSchema', () => {
  it('accepts a complete provider-neutral anime catalogue item', () => {
    const item = createCompleteAnimeCatalogueItem()

    expect(animeCatalogueItemSchema.parse(item)).toEqual(item)
  })

  it('accepts a minimal item with explicit unknown and null metadata', () => {
    const item = {
      source: {
        provider: 'example_provider',
        itemId: 'unknown-item',
      },
      titles: {
        english: null,
        romaji: 'Unknown Anime',
        original: null,
        alternatives: [],
      },
      format: 'unknown',
      releaseStatus: 'unknown',
      releaseYear: null,
      episodeCount: null,
      posterImageUrl: null,
      maturity: 'unknown',
    }

    expect(animeCatalogueItemSchema.parse(item)).toEqual(item)
  })

  it.each([1, 1917, 1998, 2026, 9999])(
    'accepts the calendar release year %s',
    (releaseYear) => {
      expect(
        animeCatalogueItemSchema.safeParse({
          ...createCompleteAnimeCatalogueItem(),
          releaseYear,
        }).success,
      ).toBe(true)
    },
  )

  it.each([
    0,
    -1,
    1.5,
    10000,
    Number.MAX_SAFE_INTEGER,
    NaN,
    Infinity,
    -Infinity,
    '1998',
  ])('rejects the invalid release year %s', (releaseYear) => {
    expect(
      animeCatalogueItemSchema.safeParse({
        ...createCompleteAnimeCatalogueItem(),
        releaseYear,
      }).success,
    ).toBe(false)
  })

  it.each([1, 12, 26, 1000, Number.MAX_SAFE_INTEGER])(
    'accepts the positive safe episode count %s',
    (episodeCount) => {
      expect(
        animeCatalogueItemSchema.safeParse({
          ...createCompleteAnimeCatalogueItem(),
          episodeCount,
        }).success,
      ).toBe(true)
    },
  )

  it.each([
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    NaN,
    Infinity,
    -Infinity,
    '26',
  ])('rejects the invalid episode count %s', (episodeCount) => {
    expect(
      animeCatalogueItemSchema.safeParse({
        ...createCompleteAnimeCatalogueItem(),
        episodeCount,
      }).success,
    ).toBe(false)
  })

  it.each([
    'https://images.example.test/poster.jpg',
    'https://cdn.example.test/poster.webp?size=large',
  ])('accepts the HTTPS poster URL "%s"', (posterImageUrl) => {
    expect(
      animeCatalogueItemSchema.safeParse({
        ...createCompleteAnimeCatalogueItem(),
        posterImageUrl,
      }).success,
    ).toBe(true)
  })

  it.each([
    '',
    'poster.jpg',
    '/poster.jpg',
    'http://images.example.test/poster.jpg',
    'ftp://images.example.test/poster.jpg',
    'data:image/png;base64,abc',
    'javascript:alert(1)',
  ])('rejects the invalid poster URL "%s"', (posterImageUrl) => {
    expect(
      animeCatalogueItemSchema.safeParse({
        ...createCompleteAnimeCatalogueItem(),
        posterImageUrl,
      }).success,
    ).toBe(false)
  })

  it.each([
    'source',
    'titles',
    'format',
    'releaseStatus',
    'releaseYear',
    'episodeCount',
    'posterImageUrl',
    'maturity',
  ])('rejects an item missing the required "%s" key', (missingKey) => {
    const item: Record<string, unknown> = createCompleteAnimeCatalogueItem()

    delete item[missingKey]

    expect(animeCatalogueItemSchema.safeParse(item).success).toBe(false)
  })

  it.each(['releaseYear', 'episodeCount', 'posterImageUrl'])(
    'rejects undefined instead of explicit null for "%s"',
    (key) => {
      expect(
        animeCatalogueItemSchema.safeParse({
          ...createCompleteAnimeCatalogueItem(),
          [key]: undefined,
        }).success,
      ).toBe(false)
    },
  )

  it('rejects unexpected top-level fields', () => {
    expect(
      animeCatalogueItemSchema.safeParse({
        ...createCompleteAnimeCatalogueItem(),
        synopsis: 'A space western.',
      }).success,
    ).toBe(false)
  })

  it('rejects a raw provider-shaped object', () => {
    expect(
      animeCatalogueItemSchema.safeParse({
        id: 1,
        title: 'Cowboy Bebop',
        alternative_titles: {
          en: 'Cowboy Bebop',
          ja: 'カウボーイビバップ',
        },
        media_type: 'tv',
        status: 'finished_airing',
        num_episodes: 26,
      }).success,
    ).toBe(false)
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['string', 'Cowboy Bebop'],
    ['number', 1],
    ['boolean', true],
    ['array', [createCompleteAnimeCatalogueItem()]],
  ])('rejects a %s value', (_, item) => {
    expect(animeCatalogueItemSchema.safeParse(item).success).toBe(false)
  })
})

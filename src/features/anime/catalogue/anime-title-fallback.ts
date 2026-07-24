import type { AnimeTitles } from '@/features/anime/domain/anime-catalogue-item'
import type { AnimeTitleLanguage } from '@/features/settings/domain/catalogue-preferences'

const titleLanguageFallbackOrder = {
  english: ['english', 'romaji', 'original'],
  romaji: ['romaji', 'english', 'original'],
  original: ['original', 'romaji', 'english'],
} as const satisfies Record<
  AnimeTitleLanguage,
  readonly (keyof Pick<AnimeTitles, 'english' | 'romaji' | 'original'>)[]
>

export function getPreferredAnimeTitle(
  titles: AnimeTitles,
  titleLanguage: AnimeTitleLanguage,
): string {
  for (const titleKey of titleLanguageFallbackOrder[titleLanguage]) {
    const title = titles[titleKey]

    if (title !== null) {
      return title
    }
  }

  throw new Error('Anime catalogue item requires at least one primary title')
}

export function getDefaultAnimeTitle(titles: AnimeTitles): string {
  return getPreferredAnimeTitle(titles, 'english')
}

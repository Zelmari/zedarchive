import type { AnimeTitles } from '@/features/anime/domain/anime-catalogue-item'

export function getDefaultAnimeTitle(titles: AnimeTitles): string {
  if (titles.english !== null) {
    return titles.english
  }

  if (titles.romaji !== null) {
    return titles.romaji
  }

  if (titles.original !== null) {
    return titles.original
  }

  throw new Error('Anime catalogue item requires at least one primary title')
}

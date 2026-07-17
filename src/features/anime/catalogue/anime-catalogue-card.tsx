import {
  formatAnimeEpisodeTotal,
  formatAnimeReleaseStatus,
  formatAnimeReleaseYear,
} from '@/features/anime/catalogue/anime-catalogue-display'
import { getDefaultAnimeTitle } from '@/features/anime/catalogue/anime-title-fallback'
import type { AnimeCatalogueItem } from '@/features/anime/domain/anime-catalogue-item'

type AnimeCatalogueCardProps = {
  item: AnimeCatalogueItem
}

export function AnimeCatalogueCard({ item }: AnimeCatalogueCardProps) {
  const episodeTotal = formatAnimeEpisodeTotal(item.episodeCount)

  return (
    <article className="space-y-2 rounded border border-gray-300 p-4">
      <h2 className="text-lg font-medium">
        {getDefaultAnimeTitle(item.titles)}
      </h2>
      <div className="space-y-1 text-sm">
        <p>{formatAnimeReleaseYear(item.releaseYear)}</p>
        {episodeTotal !== null ? <p>{episodeTotal}</p> : null}
        <p>{formatAnimeReleaseStatus(item.releaseStatus)}</p>
      </div>
    </article>
  )
}

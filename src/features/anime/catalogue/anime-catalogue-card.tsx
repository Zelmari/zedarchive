import {
  formatAnimeEpisodeTotal,
  formatAnimeReleaseStatus,
  formatAnimeReleaseYear,
} from '@/features/anime/catalogue/anime-catalogue-display'
import { getDefaultAnimeTitle } from '@/features/anime/catalogue/anime-title-fallback'
import { getAnimeCatalogueTitleInitials } from '@/features/anime/catalogue/anime-catalogue-title-initials'
import type { AnimeCatalogueItem } from '@/features/anime/domain/anime-catalogue-item'

type AnimeCatalogueCardProps = {
  item: AnimeCatalogueItem
}

export function AnimeCatalogueCard({ item }: AnimeCatalogueCardProps) {
  const title = getDefaultAnimeTitle(item.titles)
  const titleInitials = getAnimeCatalogueTitleInitials(title)
  const episodeTotal = formatAnimeEpisodeTotal(item.episodeCount)

  return (
    <article className="overflow-hidden rounded border border-gray-300">
      <div
        aria-hidden="true"
        className="flex aspect-[2/3] items-center justify-center border-b border-gray-300 bg-gray-100 px-4 text-4xl font-semibold text-gray-700"
      >
        {titleInitials}
      </div>
      <div className="space-y-2 p-4">
        <h2 className="text-lg font-medium">{title}</h2>
        <div className="space-y-1 text-sm">
          <p>{formatAnimeReleaseYear(item.releaseYear)}</p>
          {episodeTotal !== null ? <p>{episodeTotal}</p> : null}
          <p>{formatAnimeReleaseStatus(item.releaseStatus)}</p>
        </div>
      </div>
    </article>
  )
}

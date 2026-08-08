import {
  formatAnimeEpisodeTotal,
  formatAnimeReleaseStatus,
  formatAnimeReleaseYear,
} from '@/features/anime/catalogue/anime-catalogue-display'
import { getAnimeCatalogueTitleInitials } from '@/features/anime/catalogue/anime-catalogue-title-initials'
import type { AnimeCatalogueCardArchiveState } from '@/features/anime/catalogue/anime-catalogue-archive-presentation'
import type { AnimeCataloguePageItem } from '@/features/anime/catalogue/anime-catalogue-query'
import { AddAnimeEntryForm } from '@/features/archive/components/add-anime-entry-form'
import { getEntryStatusDisplayLabel } from '@/features/archive/domain/entry-status-display'

type AnimeCatalogueCardProps = {
  item: AnimeCataloguePageItem
  archiveState: AnimeCatalogueCardArchiveState
}

export function AnimeCatalogueCard({
  item,
  archiveState,
}: AnimeCatalogueCardProps) {
  const title = item.displayTitle
  const titleInitials = getAnimeCatalogueTitleInitials(title)
  const episodeTotal = formatAnimeEpisodeTotal(item.episodeCount)

  return (
    <article className="za-card za-card--raised za-press-card za-catalogue-card">
      <div className="za-catalogue-card__summary">
        <div
          aria-hidden="true"
          className="za-title-tile za-title-tile--halftone za-catalogue-card__tile"
        >
          {titleInitials}
        </div>
        <div className="za-catalogue-card__details">
          <h2 className="za-card-title">{title}</h2>
          <div className="za-card-metadata space-y-1 text-sm text-ink-muted">
            <p>{formatAnimeReleaseYear(item.releaseYear)}</p>
            {episodeTotal !== null ? <p>{episodeTotal}</p> : null}
            <p>{formatAnimeReleaseStatus(item.releaseStatus)}</p>
          </div>
          {item.maturity === 'adult' ? (
            <p className="za-card-metadata text-sm font-medium text-ink-muted">
              Adult content
            </p>
          ) : null}
        </div>
      </div>
      {archiveState.kind === 'can-add' ? (
        <div className="za-catalogue-card__action">
          <AddAnimeEntryForm catalogueItemId={item.id} animeTitle={title} />
        </div>
      ) : null}
      {archiveState.kind === 'saved' ? (
        <div className="za-catalogue-card__action">
          <p className="za-catalogue-card__saved">
            In your archive — {getEntryStatusDisplayLabel(archiveState.status)}
          </p>
        </div>
      ) : null}
    </article>
  )
}

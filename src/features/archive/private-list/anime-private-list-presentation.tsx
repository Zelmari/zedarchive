import Link from 'next/link'
import {
  formatAnimeEpisodeTotal,
  formatAnimeReleaseStatus,
  formatAnimeReleaseYear,
} from '@/features/anime/catalogue/anime-catalogue-display'
import { getAnimeCatalogueTitleInitials } from '@/features/anime/catalogue/anime-catalogue-title-initials'
import { AnimeEntryTrackingCoordinator } from '@/features/archive/components/anime-entry-tracking-coordinator'
import { getEntryStatusDisplayLabel } from '@/features/archive/domain/entry-status-display'
import {
  buildAnimePrivateListPageHref,
  type AnimePrivateListPageQuery,
} from '@/features/archive/private-list/anime-private-list-query'
import { AnimePrivateListSortControl } from '@/features/archive/private-list/anime-private-list-sort-control'
import { AnimePrivateListRemovalBoundary } from '@/features/archive/private-list/anime-private-list-removal-boundary'
import type { AnimePrivateListSort } from '@/features/archive/private-list/anime-private-list-sort'
import type {
  AnimePrivateListEntry,
  AnimePrivateListPage,
} from '@/features/archive/private-list/anime-private-list-model'

const linkClassName = 'za-link'

export function formatAnimePrivateListSummary(totalItems: number): string {
  return totalItems === 1
    ? '1 anime in your archive'
    : `${totalItems} anime in your archive`
}

export function AnimePrivateListMasthead({
  totalItems,
}: {
  totalItems: number | null
}) {
  return (
    <header className="za-page-masthead za-card za-card--raised space-y-2">
      <p className="za-eyebrow">Personal archive</p>
      <h1 className="za-display-heading">Your anime archive.</h1>
      {totalItems !== null && totalItems > 0 ? (
        <p className="za-masthead__copy">
          {totalItems} entries on the shelf. Rate them, nudge your progress, and
          mark the ones you’ll defend at parties.
        </p>
      ) : null}
    </header>
  )
}

export function getAnimePrivateListSortControlViewKey({
  sort,
  isSortExplicit,
  page,
}: {
  sort: AnimePrivateListSort
  isSortExplicit: boolean
  page: number
}): string {
  return `${sort}:${isSortExplicit ? 'explicit' : 'bootstrap'}:${page}`
}

export function getAnimePrivateListEntryKey(
  entry: AnimePrivateListEntry,
  index: number,
): string {
  return entry.kind === 'restricted' ? `restricted-${index}` : entry.entryId
}

function AnimePrivateListCard({ entry }: { entry: AnimePrivateListEntry }) {
  const archiveStatus = `In your archive — ${getEntryStatusDisplayLabel(entry.archiveStatus)}`

  if (entry.kind === 'restricted') {
    return (
      <article className="za-card za-card--restricted za-press-card">
        <div className="space-y-2">
          <h2 className="za-card-title">Restricted anime</h2>
          <p>{archiveStatus}</p>
          <p>Tracking controls aren’t available for restricted anime yet.</p>
        </div>
      </article>
    )
  }

  const titleInitials = getAnimeCatalogueTitleInitials(entry.title)
  const episodeTotal = formatAnimeEpisodeTotal(entry.episodeCount)
  return (
    <article className="za-archive-card za-card za-card--raised za-press-card">
      <div className="za-archive-card__summary">
        <div
          aria-hidden="true"
          className="za-archive-card__tile za-title-tile za-title-tile--halftone"
        >
          {titleInitials}
        </div>
        <div className="za-archive-card__details">
          <h2 className="za-card-title">{entry.title}</h2>
          <div className="za-card-metadata space-y-1 text-sm text-ink-muted">
            {entry.isAdult ? <p>Adult content</p> : null}
            <p>{formatAnimeReleaseYear(entry.releaseYear)}</p>
            {episodeTotal === null ? null : <p>{episodeTotal}</p>}
            <p>{formatAnimeReleaseStatus(entry.releaseStatus)}</p>
            {entry.kind === 'unavailable_in_catalogue' ? (
              <p>Not currently available in the catalogue</p>
            ) : null}
          </div>
        </div>
      </div>
      <div className="za-archive-card__tracking">
        <AnimeEntryTrackingCoordinator
          animeTitle={entry.title}
          entryId={entry.entryId}
          initialFavourite={entry.isFavourite}
          initialFinishDate={entry.finishDate}
          initialRating={entry.rating}
          initialStartDate={entry.startDate}
          initialStatus={entry.archiveStatus}
          progressState={entry.progressState}
        />
      </div>
    </article>
  )
}

function AnimePrivateListPagination({
  page,
  sort,
}: {
  page: AnimePrivateListPage['pagination']
  sort: AnimePrivateListSort
}) {
  if (page.totalPages <= 1) {
    return null
  }

  return (
    <nav
      aria-label="Anime archive pagination"
      className="za-card za-card--raised za-pagination flex flex-wrap items-center gap-4 text-sm"
    >
      {page.hasPreviousPage ? (
        <Link
          className={linkClassName}
          href={buildAnimePrivateListPageHref({
            page: page.page - 1,
            sort,
          })}
        >
          Previous
        </Link>
      ) : null}
      <p>
        Page {page.page} of {page.totalPages}
      </p>
      {page.hasNextPage ? (
        <Link
          className={linkClassName}
          href={buildAnimePrivateListPageHref({
            page: page.page + 1,
            sort,
          })}
        >
          Next
        </Link>
      ) : null}
    </nav>
  )
}

export function AnimePrivateListValidationError({
  message,
}: {
  message: string
}) {
  return (
    <p className="za-notice za-notice--error" role="alert">
      {message}
    </p>
  )
}

export function AnimePrivateListSignedOutGate() {
  return (
    <p className="za-notice za-notice--information">
      <Link className={linkClassName} href="/sign-in">
        Sign in
      </Link>{' '}
      to view your anime archive.
    </p>
  )
}

export function AnimePrivateListResults({
  page,
  sort,
  isSortExplicit,
  renderRevision,
}: {
  page: AnimePrivateListPage
  sort: AnimePrivateListSort
  isSortExplicit: boolean
  renderRevision: string
}) {
  return (
    <AnimePrivateListRemovalBoundary renderRevision={renderRevision}>
      <AnimePrivateListResultsContent
        isSortExplicit={isSortExplicit}
        page={page}
        sort={sort}
      />
    </AnimePrivateListRemovalBoundary>
  )
}

function AnimePrivateListResultsContent({
  page,
  sort,
  isSortExplicit,
}: {
  page: AnimePrivateListPage
  sort: AnimePrivateListSort
  isSortExplicit: boolean
}) {
  const { entries, pagination } = page
  const sortControlViewKey = getAnimePrivateListSortControlViewKey({
    isSortExplicit,
    page: pagination.page,
    sort,
  })

  if (pagination.totalItems === 0) {
    return (
      <section className="za-card za-card--raised za-empty-state space-y-2">
        <h2 className="za-card-title">Your anime archive is empty</h2>
        <p>Your shelf is waiting. Add anime from the catalogue to begin.</p>
        <Link className={linkClassName} href="/">
          Browse anime catalogue
        </Link>
      </section>
    )
  }

  if (entries.length === 0) {
    return (
      <section className="za-card za-card--raised za-empty-state space-y-4">
        <h2 className="za-card-title">There are no anime on this page</h2>
        <p>Your archive has saved anime on another page.</p>
        <AnimePrivateListSortControl
          isEmbedded
          isSortExplicit={isSortExplicit}
          sort={sort}
          viewKey={sortControlViewKey}
        />
        <noscript>
          <p className="za-notice za-notice--information">
            Archive editing requires JavaScript. Sorting works without it, but
            your sort preference cannot be saved on this device.
          </p>
        </noscript>
        <div className="flex flex-wrap gap-4">
          <Link
            className={linkClassName}
            href={buildAnimePrivateListPageHref({ page: 1, sort })}
          >
            Go to the first page
          </Link>
          <Link className={linkClassName} href="/">
            Browse anime catalogue
          </Link>
        </div>
      </section>
    )
  }

  return (
    <>
      <AnimePrivateListSortControl
        isSortExplicit={isSortExplicit}
        sort={sort}
        viewKey={sortControlViewKey}
      />
      <noscript>
        <p className="za-notice za-notice--information">
          Archive editing requires JavaScript. Sorting works without it, but
          your sort preference cannot be saved on this device.
        </p>
      </noscript>
      <ul className="za-card-grid grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((entry, index) => (
          <li key={getAnimePrivateListEntryKey(entry, index)}>
            <AnimePrivateListCard entry={entry} />
          </li>
        ))}
      </ul>
      <AnimePrivateListPagination page={pagination} sort={sort} />
    </>
  )
}

export function AnimePrivateListRouteContent({
  model,
  renderRevision,
}: {
  model:
    | Extract<AnimePrivateListPageQuery, { kind: 'validation-error' }>
    | { kind: 'signed-out' }
    | {
        kind: 'archive'
        page: AnimePrivateListPage
        sort: AnimePrivateListSort
        isSortExplicit: boolean
      }
  renderRevision: string
}) {
  if (model.kind === 'validation-error') {
    return <AnimePrivateListValidationError message={model.message} />
  }

  if (model.kind === 'signed-out') {
    return <AnimePrivateListSignedOutGate />
  }

  return (
    <AnimePrivateListResults
      isSortExplicit={model.isSortExplicit}
      page={model.page}
      renderRevision={renderRevision}
      sort={model.sort}
    />
  )
}

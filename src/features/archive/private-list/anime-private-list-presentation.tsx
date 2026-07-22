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
import type {
  AnimePrivateListEntry,
  AnimePrivateListPage,
} from '@/features/archive/private-list/anime-private-list-model'

const linkClassName =
  'rounded underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'

function formatArchiveSummary(totalItems: number): string {
  return totalItems === 1
    ? '1 anime in your archive'
    : `${totalItems} anime in your archive`
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
      <article className="rounded border border-gray-300 p-4">
        <div className="space-y-2">
          <h2 className="text-lg font-medium">Restricted anime</h2>
          <p>{archiveStatus}</p>
          <p>Status editing isn’t available for restricted anime yet.</p>
        </div>
      </article>
    )
  }

  const titleInitials = getAnimeCatalogueTitleInitials(entry.title)
  const episodeTotal = formatAnimeEpisodeTotal(entry.episodeCount)
  return (
    <article className="overflow-hidden rounded border border-gray-300">
      <div
        aria-hidden="true"
        className="flex aspect-[2/3] items-center justify-center border-b border-gray-300 bg-gray-100 px-4 text-4xl font-semibold text-gray-700"
      >
        {titleInitials}
      </div>
      <div className="space-y-2 p-4">
        <h2 className="text-lg font-medium">{entry.title}</h2>
        <div className="space-y-1 text-sm">
          <p>{formatAnimeReleaseYear(entry.releaseYear)}</p>
          {episodeTotal === null ? null : <p>{episodeTotal}</p>}
          <p>{formatAnimeReleaseStatus(entry.releaseStatus)}</p>
          {entry.kind === 'unavailable_in_catalogue' ? (
            <p>Not currently available in the catalogue</p>
          ) : null}
        </div>
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
}: {
  page: AnimePrivateListPage['pagination']
}) {
  if (page.totalPages <= 1) {
    return null
  }

  return (
    <nav
      aria-label="Anime archive pagination"
      className="flex flex-wrap items-center gap-4 text-sm"
    >
      {page.hasPreviousPage ? (
        <Link
          className={linkClassName}
          href={buildAnimePrivateListPageHref(page.page - 1)}
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
          href={buildAnimePrivateListPageHref(page.page + 1)}
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
  return <p role="alert">{message}</p>
}

export function AnimePrivateListSignedOutGate() {
  return (
    <p>
      <Link className={linkClassName} href="/sign-in">
        Sign in
      </Link>{' '}
      to view your anime archive.
    </p>
  )
}

export function AnimePrivateListResults({
  page,
}: {
  page: AnimePrivateListPage
}) {
  const { entries, pagination } = page

  if (pagination.totalItems === 0) {
    return (
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Your anime archive is empty</h2>
        <p>Save anime from the catalogue to see it here.</p>
        <Link className={linkClassName} href="/">
          Browse anime catalogue
        </Link>
      </section>
    )
  }

  if (entries.length === 0) {
    return (
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">
          There are no anime on this page
        </h2>
        <p>Your archive has saved anime on another page.</p>
        <div className="flex flex-wrap gap-4">
          <Link
            className={linkClassName}
            href={buildAnimePrivateListPageHref(1)}
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
      <p>{formatArchiveSummary(pagination.totalItems)}</p>
      <noscript>
        <p>Archive editing requires JavaScript.</p>
      </noscript>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((entry, index) => (
          <li key={getAnimePrivateListEntryKey(entry, index)}>
            <AnimePrivateListCard entry={entry} />
          </li>
        ))}
      </ul>
      <AnimePrivateListPagination page={pagination} />
    </>
  )
}

export function AnimePrivateListRouteContent({
  model,
}: {
  model:
    | Extract<AnimePrivateListPageQuery, { kind: 'validation-error' }>
    | { kind: 'signed-out' }
    | { kind: 'archive'; page: AnimePrivateListPage }
}) {
  if (model.kind === 'validation-error') {
    return <AnimePrivateListValidationError message={model.message} />
  }

  if (model.kind === 'signed-out') {
    return <AnimePrivateListSignedOutGate />
  }

  return <AnimePrivateListResults page={model.page} />
}

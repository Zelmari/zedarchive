import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/features/archive/actions/update-anime-entry-status', () => ({
  updateAnimeEntryStatus: vi.fn(),
}))
vi.mock(
  '@/features/archive/actions/update-anime-entry-episode-progress',
  () => ({
    updateAnimeEntryEpisodeProgress: vi.fn(),
  }),
)
vi.mock(
  '@/features/archive/actions/update-anime-entry-episode-total-override',
  () => ({ updateAnimeEntryEpisodeTotalOverride: vi.fn() }),
)
vi.mock('@/features/archive/actions/update-anime-entry-rating', () => ({
  updateAnimeEntryRating: vi.fn(),
}))
vi.mock('@/features/archive/actions/update-anime-entry-favourite', () => ({
  updateAnimeEntryFavourite: vi.fn(),
}))
vi.mock('@/features/archive/actions/update-anime-entry-date-range', () => ({
  updateAnimeEntryDateRange: vi.fn(),
}))
import AnimeArchiveError from '@/app/archive/anime/error'
import {
  AnimePrivateListResults,
  AnimePrivateListRouteContent,
  getAnimePrivateListEntryKey,
} from '@/features/archive/private-list/anime-private-list-presentation'
import type { AnimePrivateListPage } from '@/features/archive/private-list/anime-private-list-model'

function pageWith(
  entries: AnimePrivateListPage['entries'],
): AnimePrivateListPage {
  return {
    entries,
    pagination: {
      page: 2,
      pageSize: 24,
      totalItems: 49,
      totalPages: 3,
      hasPreviousPage: true,
      hasNextPage: true,
    },
  }
}

function renderResults(page: AnimePrivateListPage): string {
  return renderToStaticMarkup(createElement(AnimePrivateListResults, { page }))
}

describe('AnimePrivateListResults', () => {
  it('uses stable entry identity for ordinary editor state boundaries only', () => {
    const firstEntry: AnimePrivateListPage['entries'][number] = {
      kind: 'displayable',
      entryId: '550e8400-e29b-41d4-a716-446655440000',
      title: 'First anime',
      releaseYear: 2001,
      episodeCount: 12,
      releaseStatus: 'finished',
      archiveStatus: 'planned',
      rating: null,
      isFavourite: false,
      startDate: null,
      finishDate: null,
      progressState: {
        kind: 'trackable',
        progress: 0,
        catalogueTotal: 12,
        personalTotal: null,
      },
    }
    const secondEntry: AnimePrivateListPage['entries'][number] = {
      ...firstEntry,
      entryId: '550e8400-e29b-41d4-a716-446655440001',
      title: 'Second anime',
    }

    expect(getAnimePrivateListEntryKey(firstEntry, 0)).toBe(firstEntry.entryId)
    expect(getAnimePrivateListEntryKey(secondEntry, 0)).toBe(
      secondEntry.entryId,
    )
    expect(getAnimePrivateListEntryKey(firstEntry, 0)).not.toBe(
      getAnimePrivateListEntryKey(secondEntry, 0),
    )
    expect(
      getAnimePrivateListEntryKey(
        { kind: 'restricted', archiveStatus: 'planned' },
        4,
      ),
    ).toBe('restricted-4')
  })

  it('renders each approved card treatment without archive controls', () => {
    const markup = renderResults(
      pageWith([
        {
          kind: 'displayable',
          entryId: '550e8400-e29b-41d4-a716-446655440000',
          title: 'Cowboy Bebop',
          releaseYear: 1998,
          episodeCount: 26,
          releaseStatus: 'finished',
          archiveStatus: 'completed',
          rating: 7.5,
          isFavourite: true,
          startDate: '2024-01-02',
          finishDate: '2024-01-03',
          progressState: {
            kind: 'trackable',
            progress: 26,
            catalogueTotal: 26,
            personalTotal: null,
          },
        },
        {
          kind: 'unavailable_in_catalogue',
          entryId: '550e8400-e29b-41d4-a716-446655440001',
          title: 'Hidden archive anime',
          releaseYear: null,
          episodeCount: null,
          releaseStatus: 'unknown',
          archiveStatus: 'on_hold',
          rating: null,
          isFavourite: false,
          startDate: null,
          finishDate: null,
          progressState: { kind: 'format_unknown' },
        },
        { kind: 'restricted', archiveStatus: 'planned' },
      ]),
    )

    expect(markup).toContain('CB')
    expect(markup).toContain('Cowboy Bebop')
    expect(markup).toContain('1998')
    expect(markup).toContain('26 episodes')
    expect(markup).toContain('Finished')
    expect(markup).toContain('Completed')
    expect(markup).toContain('Hidden archive anime')
    expect(markup).toContain('Year unknown')
    expect(markup).toContain('Status unknown')
    expect(markup).toContain('Not currently available in the catalogue')
    expect(markup).toContain('Restricted anime')
    expect(markup).toContain('Plan to watch')
    expect(markup).toContain(
      'Status editing isn’t available for restricted anime yet.',
    )
    expect(markup).toContain(
      '<noscript><p>Archive editing requires JavaScript.</p></noscript>',
    )
    expect(markup).toContain('Anime archive pagination')
    expect(markup).toContain('href="/archive/anime"')
    expect(markup).toContain('href="/archive/anime?page=3"')
    expect(markup).toContain('Progress — 26 episodes')
    expect(markup).toContain('Total — 26 episodes')
    expect(markup).toContain('Rating — 7.5/10')
    expect(markup).toContain('Rating — Not rated')
    expect(markup).toContain('Favourite — Yes')
    expect(markup).toContain('Favourite — No')
    expect(markup).toContain('Start date — 2024-01-02')
    expect(markup).toContain('Finish date — 2024-01-03')
    expect(markup).toContain('Start date — Not set')
    expect(markup).toContain('Finish date — Not set')
    expect(markup).not.toContain('Edit progress')
    expect(markup).not.toContain('Edit status')
    expect(markup).not.toContain('Edit rating')
    expect(markup).not.toContain('Set rating')
    expect(markup).not.toContain('Add to favourites')
    expect(markup).not.toContain('Remove from favourites')
    expect(markup).not.toContain('Set dates')
    expect(markup).not.toContain('Edit dates')
    expect(markup).not.toContain('<form')
    expect(markup).toContain(
      'Episode tracking isn’t available until this anime’s format is known.',
    )
    expect(markup).not.toContain('550e8400-e29b-41d4-a716-446655440000')
    expect(markup).not.toContain('550e8400-e29b-41d4-a716-446655440001')
  })

  it('distinguishes a true empty archive from a valid page beyond the final page', () => {
    const emptyMarkup = renderResults({
      entries: [],
      pagination: {
        page: 1,
        pageSize: 24,
        totalItems: 0,
        totalPages: 0,
        hasPreviousPage: false,
        hasNextPage: false,
      },
    })
    const beyondFinalMarkup = renderResults({
      entries: [],
      pagination: {
        page: 4,
        pageSize: 24,
        totalItems: 25,
        totalPages: 2,
        hasPreviousPage: true,
        hasNextPage: false,
      },
    })

    expect(emptyMarkup).toContain('Your anime archive is empty')
    expect(emptyMarkup).toContain('Browse anime catalogue')
    expect(beyondFinalMarkup).not.toContain('Your anime archive is empty')
    expect(beyondFinalMarkup).toContain('There are no anime on this page')
    expect(beyondFinalMarkup).toContain('Go to the first page')
    expect(beyondFinalMarkup).toContain('href="/archive/anime"')
  })
})

describe('AnimePrivateListRouteContent', () => {
  it('renders a local validation alert without archive content', () => {
    const markup = renderToStaticMarkup(
      createElement(AnimePrivateListRouteContent, {
        model: {
          kind: 'validation-error',
          message: 'Page must be a whole number from 1 to 10000',
        },
      }),
    )

    expect(markup).toContain('role="alert"')
    expect(markup).toContain('Page must be a whole number from 1 to 10000')
    expect(markup).not.toContain('Restricted anime')
    expect(markup).not.toContain('Browse anime catalogue')
  })

  it('renders the contextual signed-out gate without a return URL or archive content', () => {
    const markup = renderToStaticMarkup(
      createElement(AnimePrivateListRouteContent, {
        model: { kind: 'signed-out' },
      }),
    )

    expect(markup.match(/href="\/sign-in"/g)).toHaveLength(1)
    expect(markup).toContain('Sign in</a> to view your anime archive.')
    expect(markup).not.toContain('returnTo')
    expect(markup).not.toContain('Restricted anime')
    expect(markup).not.toContain('Browse anime catalogue')
  })
})

describe('AnimeArchiveError', () => {
  it('renders a local generic retry state', () => {
    const markup = renderToStaticMarkup(
      createElement(AnimeArchiveError, {
        error: new Error('private service failure'),
        unstable_retry: () => undefined,
      }),
    )

    expect(markup).toContain('Your anime archive is temporarily unavailable')
    expect(markup).toContain('Try again in a moment.')
    expect(markup).toContain('<button')
    expect(markup).toContain('Try again')
    expect(markup).not.toContain('private service failure')
  })
})

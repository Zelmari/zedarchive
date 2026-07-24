import 'server-only'

import type { AnimeCatalogueArchiveAccess } from '@/features/anime/catalogue/anime-catalogue-archive-presentation'
import type {
  AnimeCatalogueBrowsePageQuery,
  AnimeCatalogueSearchPageQuery,
} from '@/features/anime/catalogue/anime-catalogue-page-query'
import type { AnimeCataloguePage } from '@/features/anime/catalogue/anime-catalogue-query'
import type {
  AnimeCatalogueViewerPage,
  ReadAnimeCatalogueForViewerRequest,
} from '@/server/database/anime-catalogue-service'

type CatalogueSession = { user?: { id?: string } } | null

type AnimeCatalogueCoordinatorDependencies = {
  getSession: () => Promise<CatalogueSession>
  readCatalogue: (
    request: ReadAnimeCatalogueForViewerRequest,
  ) => Promise<AnimeCatalogueViewerPage>
}

export type AnimeCatalogueCoordinatedPage = {
  cataloguePage: AnimeCataloguePage
  archiveAccess: AnimeCatalogueArchiveAccess
}

function buildReadRequest(
  pageQuery: AnimeCatalogueBrowsePageQuery | AnimeCatalogueSearchPageQuery,
  userId: string | null,
): ReadAnimeCatalogueForViewerRequest {
  return pageQuery.kind === 'browse'
    ? {
        kind: 'browse',
        userId,
        page: pageQuery.page,
        pageSize: pageQuery.pageSize,
      }
    : {
        kind: 'search',
        userId,
        query: pageQuery.query,
        page: pageQuery.page,
        pageSize: pageQuery.pageSize,
      }
}

export function createAnimeCatalogueCoordinator({
  getSession,
  readCatalogue,
}: AnimeCatalogueCoordinatorDependencies) {
  async function readFailClosedPage(
    pageQuery: AnimeCatalogueBrowsePageQuery | AnimeCatalogueSearchPageQuery,
  ): Promise<AnimeCatalogueCoordinatedPage> {
    const { cataloguePage } = await readCatalogue(
      buildReadRequest(pageQuery, null),
    )

    return {
      cataloguePage,
      archiveAccess: { kind: 'controls-unavailable' },
    }
  }

  return async function coordinateAnimeCatalogue(
    pageQuery: AnimeCatalogueBrowsePageQuery | AnimeCatalogueSearchPageQuery,
  ): Promise<AnimeCatalogueCoordinatedPage> {
    let session: CatalogueSession

    try {
      session = await getSession()
    } catch {
      console.error('Anime catalogue session lookup failed.')
      return readFailClosedPage(pageQuery)
    }

    const userId = session?.user?.id

    if (typeof userId !== 'string' || userId.length === 0) {
      const { cataloguePage } = await readCatalogue(
        buildReadRequest(pageQuery, null),
      )

      return {
        cataloguePage,
        archiveAccess: { kind: 'signed-out' },
      }
    }

    try {
      const { cataloguePage, memberships } = await readCatalogue(
        buildReadRequest(pageQuery, userId),
      )

      if (memberships === null) {
        throw new Error('Authenticated catalogue read omitted memberships')
      }

      return {
        cataloguePage,
        archiveAccess: { kind: 'memberships', memberships },
      }
    } catch {
      console.error('Anime catalogue personalization lookup failed.')
      return readFailClosedPage(pageQuery)
    }
  }
}

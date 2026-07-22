import 'server-only'

import type { AnimePrivateListPage } from '@/features/archive/private-list/anime-private-list-model'
import {
  parseAnimePrivateListPageQuery,
  type AnimePrivateListPageQueryInput,
} from '@/features/archive/private-list/anime-private-list-query'

type Session = { user?: { id?: string } } | null

export type AnimePrivateListRouteModel =
  | { kind: 'validation-error'; message: string }
  | { kind: 'signed-out' }
  | { kind: 'archive'; page: AnimePrivateListPage }

type AnimePrivateListCoordinatorDependencies = {
  getSession: () => Promise<Session>
  readArchivePage: (request: {
    userId: string
    page: number
    pageSize: 24
  }) => Promise<AnimePrivateListPage>
}

export class AnimePrivateListUnavailableError extends Error {
  constructor() {
    super('The private anime archive is temporarily unavailable')
    this.name = 'AnimePrivateListUnavailableError'
  }
}

export function createAnimePrivateListCoordinator({
  getSession,
  readArchivePage,
}: AnimePrivateListCoordinatorDependencies) {
  return async function coordinateAnimePrivateListRoute(
    query: AnimePrivateListPageQueryInput,
  ): Promise<AnimePrivateListRouteModel> {
    const parsedQuery = parseAnimePrivateListPageQuery(query)

    if (parsedQuery.kind === 'validation-error') {
      return parsedQuery
    }

    let session: Session

    try {
      session = await getSession()
    } catch {
      console.error('Private anime archive session lookup failed.')
      throw new AnimePrivateListUnavailableError()
    }

    const userId = session?.user?.id

    if (typeof userId !== 'string' || userId.length === 0) {
      return { kind: 'signed-out' }
    }

    try {
      const page = await readArchivePage({
        userId,
        page: parsedQuery.page,
        pageSize: parsedQuery.pageSize,
      })

      return { kind: 'archive', page }
    } catch {
      console.error('Private anime archive read failed.')
      throw new AnimePrivateListUnavailableError()
    }
  }
}

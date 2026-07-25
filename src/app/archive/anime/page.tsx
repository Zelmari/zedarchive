import { randomUUID } from 'node:crypto'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { AnimePrivateListRouteContent } from '@/features/archive/private-list/anime-private-list-presentation'
import { createAnimePrivateListCoordinator } from '@/features/archive/private-list/anime-private-list-coordinator'
import type { AnimePrivateListPageQueryInput } from '@/features/archive/private-list/anime-private-list-query'
import { resolveAccountAccess } from '@/server/auth/auth'
import { database } from '@/server/database/client'
import { readAnimeArchivePage } from '@/server/database/anime-entry-service'

export const dynamic = 'force-dynamic'

type AnimeArchivePageProps = {
  searchParams: Promise<AnimePrivateListPageQueryInput>
}

export default async function AnimeArchivePage({
  searchParams,
}: AnimeArchivePageProps) {
  const access = await resolveAccountAccess(await headers())
  if (
    access.status === 'deletion_recoverable' ||
    access.status === 'deletion_due'
  ) {
    redirect('/account/deletion')
  }
  const model = await createAnimePrivateListCoordinator({
    getSession: async () => {
      if (access.status === 'active') return access.session
      if (access.status === 'signed_out') return null
      throw new Error('Account access is unavailable')
    },
    readArchivePage: (request) => readAnimeArchivePage(database, request),
  })(await searchParams)

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6"
    >
      <h1 className="text-2xl font-semibold">Your anime archive</h1>
      <AnimePrivateListRouteContent
        model={model}
        renderRevision={randomUUID()}
      />
    </main>
  )
}

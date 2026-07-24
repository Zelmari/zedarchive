import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { createCataloguePreferencesCoordinator } from '@/features/settings/catalogue-preferences-coordinator'
import { CataloguePreferencesRouteContent } from '@/features/settings/components/catalogue-preferences-presentation'
import { auth } from '@/server/auth/auth'
import { database } from '@/server/database/client'
import { readUserCataloguePreferences } from '@/server/database/user-catalogue-preferences-service'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Manage your zedarchive catalogue preferences.',
}

export default async function SettingsPage() {
  const coordinate = createCataloguePreferencesCoordinator({
    getSession: async () =>
      auth.api.getSession({
        headers: await headers(),
      }),
    readPreferences: (request) =>
      readUserCataloguePreferences(database, request),
  })
  const model = await coordinate()

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6"
    >
      <h1 className="text-2xl font-semibold">Settings</h1>
      <section
        aria-labelledby="catalogue-preferences-heading"
        className="space-y-6"
      >
        <h2
          className="text-xl font-semibold"
          id="catalogue-preferences-heading"
        >
          Catalogue preferences
        </h2>
        <CataloguePreferencesRouteContent model={model} />
      </section>
    </main>
  )
}

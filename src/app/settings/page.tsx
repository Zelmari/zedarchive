import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { CataloguePreferencesRouteContent } from '@/features/settings/components/catalogue-preferences-presentation'
import { UsernameChangeRouteContent } from '@/features/settings/components/username-change-presentation'
import { createSettingsPageCoordinator } from '@/features/settings/settings-page-coordinator'
import { auth } from '@/server/auth/auth'
import { database } from '@/server/database/client'
import { readUserCataloguePreferences } from '@/server/database/user-catalogue-preferences-service'
import { readUsernameChangeState } from '@/server/identity/username-change-service'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Manage your zedarchive catalogue and account settings.',
}

export default async function SettingsPage() {
  const coordinate = createSettingsPageCoordinator({
    getSession: async () =>
      auth.api.getSession({
        headers: await headers(),
      }),
    readPreferences: (request) =>
      readUserCataloguePreferences(database, request),
    readUsernameChangeState: (request) =>
      readUsernameChangeState(database, request),
  })
  const model = await coordinate()

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6"
    >
      <h1 className="text-2xl font-semibold">Settings</h1>
      {model.kind === 'signed_out' ? (
        <p>
          <a
            className="rounded underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            href="/sign-in"
          >
            Sign in
          </a>{' '}
          to manage settings.
        </p>
      ) : null}
      {model.kind === 'unavailable' ? (
        <div className="space-y-2" role="alert">
          <p>Settings are temporarily unavailable.</p>
          <p>Try again in a moment.</p>
        </div>
      ) : null}
      {model.kind === 'available' ? (
        <>
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
            <CataloguePreferencesRouteContent model={model.catalogue} />
          </section>
          <section aria-labelledby="account-heading" className="space-y-6">
            <h2 className="text-xl font-semibold" id="account-heading">
              Account
            </h2>
            <section aria-labelledby="username-heading" className="space-y-4">
              <h3 className="font-semibold" id="username-heading">
                Username
              </h3>
              <UsernameChangeRouteContent model={model.username} />
            </section>
          </section>
        </>
      ) : null}
    </main>
  )
}

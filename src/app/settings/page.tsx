import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { AccountDeletionForms } from '@/features/account-deletion/components/account-deletion-forms'
import { CataloguePreferencesRouteContent } from '@/features/settings/components/catalogue-preferences-presentation'
import { UsernameChangeRouteContent } from '@/features/settings/components/username-change-presentation'
import { createSettingsPageCoordinator } from '@/features/settings/settings-page-coordinator'
import { resolveAccountAccess } from '@/server/auth/auth'
import { readAccountDeletionSetupState } from '@/server/account-lifecycle/account-deletion-service'
import { database } from '@/server/database/client'
import { readUserCataloguePreferences } from '@/server/database/user-catalogue-preferences-service'
import { readUsernameChangeState } from '@/server/identity/username-change-service'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Manage your zedarchive catalogue and account settings.',
}

export default async function SettingsPage() {
  const access = await resolveAccountAccess(await headers())
  if (
    access.status === 'deletion_recoverable' ||
    access.status === 'deletion_due'
  ) {
    redirect('/account/deletion')
  }

  const coordinate = createSettingsPageCoordinator({
    getSession: async () => {
      if (access.status === 'signed_out') return null
      if (access.status === 'unavailable') {
        throw new Error('Account access is unavailable')
      }
      return access.session
    },
    readPreferences: (request) =>
      readUserCataloguePreferences(database, request),
    readUsernameChangeState: (request) =>
      readUsernameChangeState(database, request),
  })
  const model = await coordinate()
  const deletionSetup =
    model.kind === 'available' && access.status === 'active'
      ? await readAccountDeletionSetupState(database, {
          userId: access.session.user.id,
          sessionId: access.session.session.id,
        })
          .then((state) =>
            state.kind === 'account_unavailable' ||
            state.kind === 'session_invalid'
              ? ({ kind: 'unavailable' } as const)
              : state,
          )
          .catch(() => ({ kind: 'unavailable' as const }))
      : null

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="za-container za-container--medium space-y-8 py-6 sm:py-8"
    >
      <h1 className="text-2xl font-semibold">Settings</h1>
      {model.kind === 'signed_out' ? (
        <p className="za-card za-card--raised">
          <a className="za-link" href="/sign-in">
            Sign in
          </a>{' '}
          to manage settings.
        </p>
      ) : null}
      {model.kind === 'unavailable' ? (
        <div className="za-notice za-notice--error space-y-2" role="alert">
          <p>Settings are temporarily unavailable.</p>
          <p>Try again in a moment.</p>
        </div>
      ) : null}
      {model.kind === 'available' ? (
        <>
          <section
            aria-labelledby="catalogue-preferences-heading"
            className="za-card za-card--raised space-y-6"
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
            <section
              aria-labelledby="username-heading"
              className="za-card za-card--raised space-y-4"
            >
              <h3 className="font-semibold" id="username-heading">
                Username
              </h3>
              <UsernameChangeRouteContent model={model.username} />
            </section>
            <section
              aria-labelledby="archive-data-heading"
              className="za-card za-card--raised space-y-4"
            >
              <h3 className="font-semibold" id="archive-data-heading">
                Archive data
              </h3>
              <p>
                Download a JSON copy of your saved anime tracking data and
                catalogue preferences. It excludes your account identity,
                sign-in information, and images.
              </p>
              <p className="za-notice za-notice--information">
                The JSON file contains your complete saved anime data, including
                entries currently hidden by your adult-content setting. Store it
                somewhere private.
              </p>
              <a
                className="za-button za-button--secondary"
                href="/api/account/archive-backup"
              >
                Download archive backup (JSON)
              </a>
            </section>
            <section
              aria-labelledby="delete-account-heading"
              className="za-card za-card--raised space-y-4 border-destructive"
            >
              <h3
                className="font-semibold text-destructive"
                id="delete-account-heading"
              >
                Delete account
              </h3>
              <AccountDeletionForms
                model={deletionSetup ?? { kind: 'unavailable' }}
              />
            </section>
          </section>
        </>
      ) : null}
    </main>
  )
}

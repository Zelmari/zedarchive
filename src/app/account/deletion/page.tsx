import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  DueAccountDeletion,
  RecoverableAccountDeletion,
} from '@/features/account-deletion/components/account-deletion-recovery'
import { resolveAccountAccess } from '@/server/auth/auth'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Account deletion',
  description: 'View or cancel a zedarchive account deletion request.',
}

const linkClassName = 'za-link'

export default async function AccountDeletionPage() {
  const access = await resolveAccountAccess(await headers())

  if (access.status === 'active') redirect('/settings')

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="za-container za-container--medium py-6 sm:py-8"
    >
      <section className="za-card za-card--raised za-settings-section space-y-6">
        <header className="za-page-header space-y-2">
          <p className="za-page-eyebrow">Account record</p>
          <h1 className="za-page-heading">Account deletion.</h1>
        </header>
        {access.status === 'signed_out' ? (
          <div className="space-y-4">
            <p>Sign in to view or cancel an account deletion request.</p>
            <Link className={linkClassName} href="/sign-in">
              Sign in
            </Link>
          </div>
        ) : null}
        {access.status === 'unavailable' ? (
          <p className="za-notice za-notice--error" role="alert">
            Account deletion status is temporarily unavailable. Normal account
            access remains unavailable. Try again later or sign out.
          </p>
        ) : null}
        {access.status === 'deletion_recoverable' ? (
          <RecoverableAccountDeletion purgeAfter={access.purgeAfter} />
        ) : null}
        {access.status === 'deletion_due' ? <DueAccountDeletion /> : null}
      </section>
    </main>
  )
}

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

const linkClassName =
  'rounded underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'

export default async function AccountDeletionPage() {
  const access = await resolveAccountAccess(await headers())

  if (access.status === 'active') redirect('/settings')

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6"
    >
      {access.status === 'signed_out' || access.status === 'unavailable' ? (
        <h1 className="text-2xl font-semibold">Account deletion</h1>
      ) : null}
      {access.status === 'signed_out' ? (
        <div className="space-y-4">
          <p>Sign in to view or cancel an account deletion request.</p>
          <Link className={linkClassName} href="/sign-in">
            Sign in
          </Link>
        </div>
      ) : null}
      {access.status === 'unavailable' ? (
        <p role="alert">
          Account deletion status is temporarily unavailable. Normal account
          access remains unavailable. Try again later or sign out.
        </p>
      ) : null}
      {access.status === 'deletion_recoverable' ? (
        <RecoverableAccountDeletion purgeAfter={access.purgeAfter} />
      ) : null}
      {access.status === 'deletion_due' ? <DueAccountDeletion /> : null}
    </main>
  )
}

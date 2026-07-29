import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SignInForm } from '@/features/auth/components/sign-in-form'
import { PublicUsername } from '@/features/identity/components/public-username'
import { resolveAccountAccess } from '@/server/auth/auth'

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your zedarchive account.',
}

const linkClassName = 'za-link'

export default async function SignInPage() {
  const access = await resolveAccountAccess(await headers())
  if (
    access.status === 'deletion_recoverable' ||
    access.status === 'deletion_due'
  ) {
    redirect('/account/deletion')
  }
  const session = access.status === 'active' ? access.session : null

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="za-container za-container--narrow py-6 sm:py-8"
    >
      <section className="za-card za-card--raised space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="text-sm text-ink-muted">
            Sign in with the email and password for your account.
          </p>
        </header>

        {access.status === 'unavailable' ? (
          <p className="za-notice za-notice--error" role="alert">
            Account access is temporarily unavailable. Try again later or sign
            out.
          </p>
        ) : session?.user ? (
          <section className="space-y-4">
            <p>
              Signed in as{' '}
              <strong>
                <PublicUsername username={session.user.name} />
              </strong>
              .
            </p>
            <p className="text-sm">
              <Link className={linkClassName} href="/">
                Back to catalogue
              </Link>
            </p>
          </section>
        ) : (
          <SignInForm />
        )}
      </section>
    </main>
  )
}

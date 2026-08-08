import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { RegisterForm } from '@/features/auth/components/register-form'
import { PublicUsername } from '@/features/identity/components/public-username'
import { resolveAccountAccess } from '@/server/auth/auth'

export const metadata: Metadata = {
  title: 'Register',
  description: 'Create a zedarchive account.',
}

const linkClassName = 'za-link'

export default async function RegisterPage() {
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
      <section className="za-card za-card--raised za-auth-sheet space-y-6">
        <header className="za-page-header space-y-2">
          <p className="za-page-eyebrow">New archive</p>
          <h1 className="za-page-heading">Make the shelves yours.</h1>
          <p className="za-page-lede">
            Create an account to start filing the anime you watch.
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
              You are already signed in as{' '}
              <strong>
                <PublicUsername username={session.user.name} />
              </strong>
              .
            </p>
            <p className="text-sm">
              <a className={linkClassName} href="/sign-in">
                Go to sign in
              </a>
            </p>
          </section>
        ) : (
          <RegisterForm />
        )}
      </section>
    </main>
  )
}

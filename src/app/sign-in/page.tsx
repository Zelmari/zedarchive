import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { SignInForm } from '@/features/auth/components/sign-in-form'
import { SignOutButton } from '@/features/auth/components/sign-out-button'
import { PublicUsername } from '@/features/identity/components/public-username'
import { auth } from '@/server/auth/auth'

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your zedarchive account.',
}

const linkClassName =
  'rounded underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'

export default async function SignInPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  return (
    <main className="mx-auto max-w-md space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-gray-700">
          Sign in with the email and password for your account.
        </p>
      </header>

      {session?.user ? (
        <section className="space-y-4">
          <p>
            Signed in as{' '}
            <strong>
              <PublicUsername username={session.user.name} />
            </strong>
            .
          </p>
          <SignOutButton />
          <p className="text-sm">
            <Link className={linkClassName} href="/">
              Back to catalogue
            </Link>
          </p>
        </section>
      ) : (
        <SignInForm />
      )}
    </main>
  )
}

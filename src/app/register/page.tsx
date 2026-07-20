import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { RegisterForm } from '@/features/auth/components/register-form'
import { SignOutButton } from '@/features/auth/components/sign-out-button'
import { auth } from '@/server/auth/auth'

export const metadata: Metadata = {
  title: 'Register',
  description: 'Create a zedarchive account.',
}

const linkClassName =
  'rounded underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'

export default async function RegisterPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  return (
    <main className="mx-auto max-w-md space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Register</h1>
        <p className="text-sm text-gray-700">
          Create an account with a username, email address, and password.
        </p>
      </header>

      {session?.user ? (
        <section className="space-y-4">
          <p>
            You are already signed in as <strong>{session.user.name}</strong>.
          </p>
          <SignOutButton />
          <p className="text-sm">
            <a className={linkClassName} href="/sign-in">
              Go to sign in
            </a>
          </p>
        </section>
      ) : (
        <RegisterForm />
      )}
    </main>
  )
}

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Check your email',
  description: 'Finish creating your zedarchive account.',
}

const linkClassName =
  'rounded underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'

export default function RegisterCheckEmailPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-md space-y-6 p-4 sm:p-6"
    >
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Check your email</h1>
        <p>If this address can be used, we will send a verification link.</p>
      </header>

      <p className="text-sm text-gray-700">
        Check your inbox and spam folder. The link expires after 24 hours.
      </p>

      <p className="text-sm">
        <a className={linkClassName} href="/sign-in">
          Back to sign in
        </a>
      </p>
    </main>
  )
}

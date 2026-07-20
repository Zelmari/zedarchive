import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Check your email',
  description: 'Password reset request received.',
}

const linkClassName =
  'rounded underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'

export default function ForgotPasswordSentPage() {
  return (
    <main className="mx-auto max-w-md space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Check your email</h1>
        <p>If this address can be used, we will send a password reset link.</p>
      </header>

      <p className="text-sm text-gray-700">
        Check your inbox and spam folder. If nothing arrives, wait a moment and
        try again later.
      </p>

      <p className="text-sm">
        <a className={linkClassName} href="/sign-in">
          Back to sign in
        </a>
      </p>
    </main>
  )
}

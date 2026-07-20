import type { Metadata } from 'next'
import { VerifyEmailForm } from '@/features/auth/components/verify-email-form'

export const metadata: Metadata = {
  title: 'Verify email',
  description: 'Confirm your zedarchive email address.',
}

export default function VerifyEmailPage() {
  return (
    <main className="mx-auto max-w-md space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Verify email</h1>
        <p className="text-sm text-gray-700">
          Confirm your email address to finish setting up your account.
        </p>
      </header>
      <VerifyEmailForm />
    </main>
  )
}

import type { Metadata } from 'next'
import { ResetPasswordForm } from '@/features/auth/components/reset-password-form'

export const metadata: Metadata = {
  title: 'Reset password',
  description: 'Choose a new password for your zedarchive account.',
}

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto max-w-md space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Reset password</h1>
        <p className="text-sm text-gray-700">
          Choose a new password for your account.
        </p>
      </header>
      <ResetPasswordForm />
    </main>
  )
}

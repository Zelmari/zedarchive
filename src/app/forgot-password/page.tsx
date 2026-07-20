import type { Metadata } from 'next'
import { ForgotPasswordForm } from '@/features/auth/components/forgot-password-form'

export const metadata: Metadata = {
  title: 'Forgot password',
  description: 'Request a password reset link for your zedarchive account.',
}

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto max-w-md space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Forgot password</h1>
        <p className="text-sm text-gray-700">
          Enter the email address for your account. If it can be used, we will
          send a reset link.
        </p>
      </header>

      <ForgotPasswordForm />
    </main>
  )
}

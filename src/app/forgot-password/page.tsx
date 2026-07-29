import type { Metadata } from 'next'
import { ForgotPasswordForm } from '@/features/auth/components/forgot-password-form'

export const metadata: Metadata = {
  title: 'Forgot password',
  description: 'Request a password reset link for your zedarchive account.',
}

export default function ForgotPasswordPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="za-container za-container--narrow py-6 sm:py-8"
    >
      <section className="za-card za-card--raised space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">Forgot password</h1>
          <p className="text-sm text-ink-muted">
            Enter the email address for your account. If it can be used, we will
            send a reset link.
          </p>
        </header>

        <ForgotPasswordForm />
      </section>
    </main>
  )
}

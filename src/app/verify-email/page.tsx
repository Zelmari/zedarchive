import type { Metadata } from 'next'
import { VerifyEmailForm } from '@/features/auth/components/verify-email-form'

export const metadata: Metadata = {
  title: 'Verify email',
  description: 'Confirm your zedarchive email address.',
}

export default function VerifyEmailPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="za-container za-container--narrow py-6 sm:py-8"
    >
      <section className="za-card za-card--raised space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">Verify email</h1>
          <p className="text-sm text-ink-muted">
            Confirm your email address to finish setting up your account.
          </p>
        </header>
        <VerifyEmailForm />
      </section>
    </main>
  )
}

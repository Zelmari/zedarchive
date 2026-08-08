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
      <section className="za-card za-card--raised za-auth-sheet space-y-6">
        <header className="za-page-header space-y-2">
          <p className="za-page-eyebrow">Account setup</p>
          <h1 className="za-page-heading">Verify your email.</h1>
          <p className="za-page-lede">
            Confirm your email address to finish setting up your account.
          </p>
        </header>
        <VerifyEmailForm />
      </section>
    </main>
  )
}

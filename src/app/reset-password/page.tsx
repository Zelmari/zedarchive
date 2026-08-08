import type { Metadata } from 'next'
import { ResetPasswordForm } from '@/features/auth/components/reset-password-form'

export const metadata: Metadata = {
  title: 'Reset password',
  description: 'Choose a new password for your zedarchive account.',
}

export default function ResetPasswordPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="za-container za-container--narrow py-6 sm:py-8"
    >
      <section className="za-card za-card--raised za-auth-sheet space-y-6">
        <header className="za-page-header space-y-2">
          <p className="za-page-eyebrow">Archive entrance</p>
          <h1 className="za-page-heading">Choose a new key.</h1>
          <p className="za-page-lede">
            Choose a new password for your account.
          </p>
        </header>
        <ResetPasswordForm />
      </section>
    </main>
  )
}

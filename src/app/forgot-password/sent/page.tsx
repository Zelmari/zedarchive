import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Check your email',
  description: 'Password reset request received.',
}

const linkClassName = 'za-link'

export default function ForgotPasswordSentPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="za-container za-container--narrow py-6 sm:py-8"
    >
      <section className="za-card za-card--raised space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">Check your email</h1>
          <p>
            If this address can be used, we will send a password reset link.
          </p>
        </header>

        <p className="text-sm text-ink-muted">
          Check your inbox and spam folder. If nothing arrives, wait a moment
          and try again later.
        </p>

        <p className="text-sm">
          <a className={linkClassName} href="/sign-in">
            Back to sign in
          </a>
        </p>
      </section>
    </main>
  )
}

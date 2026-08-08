import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Check your email',
  description: 'Finish creating your zedarchive account.',
}

const linkClassName = 'za-link'

export default function RegisterCheckEmailPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="za-container za-container--narrow py-6 sm:py-8"
    >
      <section className="za-card za-card--raised za-auth-sheet space-y-6">
        <header className="za-page-header space-y-2">
          <p className="za-page-eyebrow">Archive post</p>
          <h1 className="za-page-heading">Check your email.</h1>
          <p>If this address can be used, we will send a verification link.</p>
        </header>

        <p className="text-sm text-ink-muted">
          Check your inbox and spam folder. The link expires after 24 hours.
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

'use client'

type SettingsErrorProps = {
  error: Error & { digest?: string }
  unstable_retry: () => void
}

export default function SettingsError({ unstable_retry }: SettingsErrorProps) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="za-container za-container--medium py-6 sm:py-8"
    >
      <section className="za-card za-card--raised space-y-4">
        <h1 className="text-2xl font-semibold">
          Settings are temporarily unavailable
        </h1>
        <p>Try again in a moment.</p>
        <button
          className="za-button za-button--primary"
          onClick={() => unstable_retry()}
          type="button"
        >
          Try again
        </button>
      </section>
    </main>
  )
}

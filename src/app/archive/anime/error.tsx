'use client'

type AnimeArchiveErrorProps = {
  error: Error & { digest?: string }
  unstable_retry: () => void
}

export default function AnimeArchiveError({
  unstable_retry,
}: AnimeArchiveErrorProps) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="za-container za-container--wide py-6 sm:py-8"
    >
      <section className="za-notice za-notice--error space-y-4">
        <h1 className="text-2xl font-semibold">
          Your anime archive is temporarily unavailable
        </h1>
        <p>Try again in a moment.</p>
        <button
          className="za-button za-button--secondary"
          onClick={() => unstable_retry()}
          type="button"
        >
          Try again
        </button>
      </section>
    </main>
  )
}

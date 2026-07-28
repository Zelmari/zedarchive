'use client'

type CatalogueErrorProps = {
  error: Error & { digest?: string }
  unstable_retry: () => void
}

export default function CatalogueError({
  unstable_retry,
}: CatalogueErrorProps) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="za-container za-container--wide space-y-6 py-6 sm:py-8"
    >
      <section className="za-notice za-notice--error space-y-4">
        <h1 className="text-[length:var(--za-text-heading-xl)] leading-[var(--za-leading-compact)] font-semibold">
          The anime catalogue is temporarily unavailable
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

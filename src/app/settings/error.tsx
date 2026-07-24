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
      className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6"
    >
      <h1 className="text-2xl font-semibold">
        Settings are temporarily unavailable
      </h1>
      <p>Try again in a moment.</p>
      <button
        className="rounded border border-gray-300 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        onClick={() => unstable_retry()}
        type="button"
      >
        Try again
      </button>
    </main>
  )
}

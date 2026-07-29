export default function AnimeArchiveLoading() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="za-container za-container--wide space-y-4 py-6 sm:py-8"
    >
      <header className="za-card za-card--raised space-y-2">
        <h1 className="text-2xl font-semibold">Your anime archive</h1>
      </header>
      <p className="za-notice za-notice--information" role="status">
        Loading your anime archive…
      </p>
    </main>
  )
}

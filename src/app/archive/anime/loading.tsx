export default function AnimeArchiveLoading() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="za-container za-container--wide za-page-rhythm space-y-4 py-6 sm:py-8"
    >
      <header className="za-page-masthead za-card za-card--raised space-y-2">
        <p className="za-eyebrow">Archive notice</p>
        <h1 className="za-display-heading">Your anime archive</h1>
      </header>
      <p
        className="za-notice za-notice--information za-archive-notice"
        role="status"
      >
        Loading your anime archive…
      </p>
    </main>
  )
}

export default function PublicProfileLoading() {
  return (
    <div
      className="min-h-screen bg-canvas text-ink animate-pulse"
      aria-busy="true"
      aria-label="Loading profile"
    >
      {/* Header skeleton */}
      <header className="za-site-header">
        <div className="za-container za-container--wide za-site-header__inner">
          <div className="h-8 w-32 rounded-small bg-surface-subtle" />
          <div className="h-8 w-24 rounded-control bg-surface-subtle" />
        </div>
      </header>

      {/* Main profile skeleton */}
      <main className="za-container max-w-4xl py-[var(--za-space-8)]">
        <div className="mb-8 flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-surface-subtle" />
          <div className="space-y-2">
            <div className="h-6 w-40 rounded-small bg-surface-subtle" />
            <div className="h-4 w-28 rounded-small bg-surface-subtle" />
          </div>
        </div>

        {/* Media grid skeleton */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 rounded-base border border-required bg-surface p-3 shadow-surface"
            >
              <div className="aspect-[2/3] w-full rounded-small bg-surface-subtle" />
              <div className="h-4 w-3/4 rounded-small bg-surface-subtle" />
              <div className="h-3 w-1/2 rounded-small bg-surface-subtle" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default function DashboardLoading() {
  return (
    <div
      className="min-h-screen bg-canvas text-ink animate-pulse"
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      {/* Header skeleton */}
      <header className="sticky top-0 z-30 border-b border-required bg-surface shadow-raised">
        <div className="za-container flex h-14 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-small bg-surface-subtle" />
            <div className="h-5 w-24 rounded-small bg-surface-subtle" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-28 rounded-control bg-surface-subtle" />
            <div className="h-8 w-8 rounded-full bg-surface-subtle" />
          </div>
        </div>
      </header>

      {/* Main content skeleton */}
      <main className="za-container py-[var(--za-space-6)]">
        {/* Filter bar skeleton */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-2">
            <div className="h-9 w-20 rounded-control bg-surface-subtle" />
            <div className="h-9 w-20 rounded-control bg-surface-subtle" />
            <div className="h-9 w-20 rounded-control bg-surface-subtle" />
          </div>
          <div className="h-9 w-48 rounded-control bg-surface-subtle" />
        </div>

        {/* Media grid skeleton */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
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

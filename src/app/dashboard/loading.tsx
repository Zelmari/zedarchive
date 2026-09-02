export default function DashboardLoading() {
  return (
    <div
      className="min-h-screen bg-canvas text-ink"
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      {/* Header skeleton */}
      <header className="za-site-header">
        <div className="za-container za-container--wide za-site-header__inner">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 animate-pulse rounded-small bg-surface-subtle" />
            <div className="h-6 w-32 animate-pulse rounded-small bg-surface-subtle" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-9 w-20 animate-pulse rounded-small bg-surface-subtle" />
            ))}
          </div>
        </div>
      </header>

      {/* Main content skeleton */}
      <main className="za-container py-[var(--za-space-6)]">
        {/* Filter bar skeleton */}
        <div className="za-bookplate mb-6 flex animate-pulse flex-wrap items-center justify-between gap-4 p-4">
          <div className="flex gap-2">
            <div className="h-9 w-20 rounded-small bg-surface-sunken" />
            <div className="h-9 w-20 rounded-small bg-surface-sunken" />
            <div className="h-9 w-20 rounded-small bg-surface-sunken" />
          </div>
          <div className="h-9 w-48 rounded-small bg-surface-sunken" />
        </div>

        {/* Media grid skeleton */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="za-bookplate flex animate-pulse flex-col gap-2 p-3">
              <div className="aspect-[2/3] w-full rounded-small bg-surface-sunken" />
              <div className="h-4 w-3/4 rounded-small bg-surface-subtle" />
              <div className="h-3 w-1/2 rounded-small bg-surface-subtle" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

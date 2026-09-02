export default function PublicProfileLoading() {
  return (
    <div className="min-h-screen bg-canvas text-ink" aria-busy="true" aria-label="Loading profile">
      {/* Header skeleton */}
      <header className="za-site-header">
        <div className="za-container za-container--wide za-site-header__inner">
          <div className="h-9 w-32 animate-pulse rounded-small bg-surface-subtle" />
          <div className="h-9 w-24 animate-pulse rounded-small bg-surface-subtle" />
        </div>
      </header>

      {/* Main profile skeleton */}
      <main className="za-container max-w-4xl py-[var(--za-space-8)]">
        <div className="za-bookplate mb-8 flex animate-pulse items-center gap-4 p-6">
          <div className="h-16 w-16 rounded-full bg-surface-sunken" />
          <div className="space-y-2">
            <div className="h-6 w-40 rounded-small bg-surface-sunken" />
            <div className="h-4 w-28 rounded-small bg-surface-sunken" />
          </div>
        </div>

        {/* Media grid skeleton */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
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

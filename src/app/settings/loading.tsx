export default function SettingsLoading() {
  return (
    <div className="min-h-screen bg-canvas text-ink" aria-busy="true" aria-label="Loading settings">
      {/* Header skeleton */}
      <header className="za-site-header za-site-header--sticky">
        <div className="za-container za-container--wide flex min-h-14 items-center justify-between gap-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-32 animate-pulse rounded-small bg-surface-subtle" />
            <div className="h-9 w-20 animate-pulse rounded-small bg-surface-subtle" />
            <div className="h-5 w-32 animate-pulse rounded-small bg-surface-subtle" />
          </div>
        </div>
      </header>

      {/* Settings form skeleton */}
      <main className="za-container max-w-2xl py-[var(--za-space-8)]">
        <div className="za-bookplate mb-8 animate-pulse p-6">
          <div className="h-7 w-48 rounded-small bg-surface-sunken" />
          <div className="mt-2 h-4 w-72 rounded-small bg-surface-sunken" />
        </div>

        <div className="space-y-6">
          <div className="za-bookplate animate-pulse space-y-4 p-6">
            <div className="h-5 w-32 rounded-small bg-surface-sunken" />
            <div className="h-10 w-full rounded-small bg-surface-subtle" />
            <div className="h-10 w-full rounded-small bg-surface-subtle" />
          </div>

          <div className="za-bookplate animate-pulse space-y-4 p-6">
            <div className="h-5 w-32 rounded-small bg-surface-sunken" />
            <div className="h-20 w-full rounded-small bg-surface-subtle" />
          </div>
        </div>
      </main>
    </div>
  );
}

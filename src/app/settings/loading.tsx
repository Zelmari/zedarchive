export default function SettingsLoading() {
  return (
    <div
      className="min-h-screen bg-canvas text-ink animate-pulse"
      aria-busy="true"
      aria-label="Loading settings"
    >
      {/* Header skeleton */}
      <header className="sticky top-0 z-30 border-b border-required bg-surface shadow-raised">
        <div className="za-container za-container--wide flex h-14 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-28 rounded-small bg-surface-subtle" />
            <div className="h-8 w-20 rounded-small bg-surface-subtle" />
            <div className="h-5 w-32 rounded-small bg-surface-subtle" />
          </div>
        </div>
      </header>

      {/* Settings form skeleton */}
      <main className="za-container max-w-2xl py-[var(--za-space-8)]">
        <div className="mb-8">
          <div className="h-7 w-48 rounded-small bg-surface-subtle" />
          <div className="mt-2 h-4 w-72 rounded-small bg-surface-subtle" />
        </div>

        <div className="space-y-6">
          <div className="rounded-control border border-required bg-surface p-6 shadow-raised space-y-4">
            <div className="h-5 w-32 rounded-small bg-surface-subtle" />
            <div className="h-10 w-full rounded-control bg-surface-subtle" />
            <div className="h-10 w-full rounded-control bg-surface-subtle" />
          </div>

          <div className="rounded-control border border-required bg-surface p-6 shadow-raised space-y-4">
            <div className="h-5 w-32 rounded-small bg-surface-subtle" />
            <div className="h-20 w-full rounded-control bg-surface-subtle" />
          </div>
        </div>
      </main>
    </div>
  );
}

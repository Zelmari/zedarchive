interface ChromeSkeletonProps {
  label: string;
  sticky?: boolean;
}

export default function ChromeSkeleton({ label, sticky = false }: ChromeSkeletonProps) {
  return (
    <div
      className="min-h-screen bg-canvas text-ink"
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <header className={sticky ? 'za-site-header za-site-header--sticky' : 'za-site-header'}>
        <div className="za-container za-container--wide za-site-header__inner">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 animate-pulse rounded-small bg-surface-subtle" />
            <div className="h-6 w-32 animate-pulse rounded-small bg-surface-subtle" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-9 w-20 animate-pulse rounded-small bg-surface-subtle" />
            ))}
          </div>
        </div>
      </header>
      <main className="za-container max-w-5xl py-[var(--za-space-8)]">
        <div className="za-bookplate mb-8 animate-pulse p-6">
          <div className="h-3 w-40 rounded-small bg-surface-sunken" />
          <div className="mt-3 h-7 w-56 rounded-small bg-surface-sunken" />
          <div className="mt-2 h-4 w-72 max-w-full rounded-small bg-surface-subtle" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="za-bookplate animate-pulse p-5">
              <div className="h-4 w-24 rounded-small bg-surface-sunken" />
              <div className="mt-3 h-6 w-3/4 rounded-small bg-surface-subtle" />
              <div className="mt-2 h-16 w-full rounded-small bg-surface-sunken" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

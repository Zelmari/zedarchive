import { WifiOff } from 'lucide-react';
import Link from 'next/link';

export const metadata = {
  title: 'Offline',
  description: 'You are currently offline.',
};

export default function OfflinePage() {
  return (
    <main id="main-content" tabIndex={-1} className="py-12">
      <div className="za-container za-container--narrow">
        <section className="za-card za-card--raised grid gap-6 text-center">
          <div className="flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-subtle text-ink-muted">
              <WifiOff size={28} />
            </div>
          </div>

          <header className="grid gap-2">
            <h1 className="text-[length:var(--za-text-heading-lg)] font-[var(--za-weight-heading)] leading-[var(--za-leading-compact)]">
              You’re Currently Offline
            </h1>
            <p className="mx-auto max-w-[var(--za-measure-readable)] text-[length:var(--za-text-supporting)] text-ink-muted">
              ZedArchive requires an active internet connection to load and sync your collection.
              Check your network connection and reload the page.
            </p>
          </header>

          <div className="flex justify-center gap-3">
            <Link href="/dashboard" className="za-button za-button--primary">
              Retry Connection
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

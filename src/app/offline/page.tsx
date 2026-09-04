import { WifiOff } from 'lucide-react';
import Link from 'next/link';

export const metadata = {
  title: 'Offline',
  description: 'You are currently offline.',
};

export default function OfflinePage() {
  return (
    <main id="main-content" tabIndex={-1} className="flex min-h-screen items-center py-12">
      <div className="za-container za-container--narrow">
        <section
          aria-labelledby="offline-title"
          className="za-bookplate relative grid gap-6 p-8 text-center"
        >
          <span className="za-ribbon-bookmark" aria-hidden="true" />
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-accent bg-accent-soft text-accent shadow-gold">
              <WifiOff aria-hidden="true" size={30} strokeWidth={1.6} />
            </div>
          </div>

          <header className="grid gap-2">
            <h1
              id="offline-title"
              className="font-[var(--za-font-display)] text-[length:var(--za-text-heading-lg)] font-[var(--za-weight-heading)] uppercase tracking-[0.04em] leading-[var(--za-leading-compact)]"
            >
              You’re currently offline
            </h1>
            <p className="mx-auto max-w-[var(--za-measure-readable)] font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] leading-[var(--za-leading-body)] text-ink-muted">
              ZedArchive requires an active internet connection to load and sync your collection.
              Check your network connection and reload the page.
            </p>
          </header>

          <div className="flex w-full justify-center">
            <Link href="/dashboard" className="za-button za-button--primary w-full">
              Retry connection
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

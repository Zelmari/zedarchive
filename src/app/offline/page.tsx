import { WifiOff } from 'lucide-react';
import Link from 'next/link';

export const metadata = {
  title: 'Offline — zedarchive',
  description: 'You are currently offline.',
};

export default function OfflinePage() {
  return (
    <main id="main-content" tabIndex={-1} style={{ paddingBlock: 'var(--za-space-12)' }}>
      <div className="za-container za-container--narrow">
        <section
          className="za-card za-card--raised"
          style={{ display: 'grid', gap: 'var(--za-space-6)', textAlign: 'center' }}
        >
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div
              style={{
                width: '3.5rem',
                height: '3.5rem',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--za-color-surface-subtle)',
                color: 'var(--za-color-text-muted)',
              }}
            >
              <WifiOff size={28} />
            </div>
          </div>

          <header style={{ display: 'grid', gap: 'var(--za-space-2)' }}>
            <h1
              style={{
                fontSize: 'var(--za-text-heading-lg)',
                fontWeight: 'var(--za-weight-heading)',
                lineHeight: 'var(--za-leading-compact)',
              }}
            >
              You’re Currently Offline
            </h1>
            <p
              style={{
                fontSize: 'var(--za-text-supporting)',
                color: 'var(--za-color-text-muted)',
                maxWidth: 'var(--za-measure-readable)',
                margin: '0 auto',
              }}
            >
              ZedArchive requires an active internet connection to load and sync your collection.
              Check your network connection and reload the page.
            </p>
          </header>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--za-space-3)' }}>
            <Link href="/dashboard" className="za-button za-button--primary">
              Retry Connection
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

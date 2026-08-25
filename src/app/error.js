'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error('Unhandled app error:', error);
  }, [error]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--za-color-canvas)', padding: '1rem' }}>
      <div className="za-card za-card--raised" style={{ maxWidth: '28rem', textAlign: 'center', padding: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--za-color-text)' }}>
          Something went wrong
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--za-color-text-muted)', marginBottom: '1.5rem' }}>
          An unexpected error occurred while loading this page.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
          <button type="button" className="za-button za-button--primary" onClick={() => reset()}>
            Try Again
          </button>
          <Link href="/" className="za-button za-button--secondary">
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}

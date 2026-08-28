'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4 text-ink">
      <div className="za-card za-card--raised max-w-md p-8 text-center">
        <h1 className="mb-2 text-xl font-bold text-ink">Failed to load dashboard</h1>
        <p className="mb-6 text-sm text-ink-muted">
          An error occurred while loading your archive. You can retry or return home.
        </p>
        <div className="flex justify-center gap-3">
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

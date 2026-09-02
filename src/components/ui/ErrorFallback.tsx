'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

interface ErrorFallbackProps {
  title: string;
  message: string;
  error: Error & { digest?: string };
  reset: () => void;
  homeLabel?: string;
  buttonGapClass?: string;
}

export default function ErrorFallback({
  title,
  message,
  error,
  reset,
  homeLabel = 'Return to archive',
  buttonGapClass = 'gap-2',
}: ErrorFallbackProps) {
  useEffect(() => {
    console.error(`${title}:`, error);
  }, [error, title]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4 text-ink">
      <section
        aria-labelledby="error-fallback-title"
        className="za-bookplate relative max-w-md p-8 text-center"
      >
        <span className="za-ribbon-bookmark" aria-hidden="true" />
        <AlertTriangle
          aria-hidden="true"
          className="mx-auto mb-4 text-danger"
          size={34}
          strokeWidth={1.6}
        />
        <h1
          id="error-fallback-title"
          className="mb-2 font-[var(--za-font-display)] text-[length:var(--za-text-heading-lg)] font-[var(--za-weight-heading)] uppercase tracking-[0.04em] text-ink"
        >
          {title}
        </h1>
        <p className="mb-6 font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] leading-[var(--za-leading-body)] text-ink-muted">
          {message}
        </p>
        <div className={`flex justify-center ${buttonGapClass}`}>
          <button type="button" className="za-button za-button--primary" onClick={() => reset()}>
            Try Again
          </button>
          <Link href="/" className="za-button za-button--secondary">
            {homeLabel}
          </Link>
        </div>
      </section>
    </div>
  );
}

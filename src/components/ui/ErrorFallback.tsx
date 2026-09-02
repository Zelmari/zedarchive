'use client';

import { useEffect } from 'react';
import Link from 'next/link';

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
  homeLabel = 'Go Home',
  buttonGapClass = 'gap-2',
}: ErrorFallbackProps) {
  useEffect(() => {
    console.error(`${title}:`, error);
  }, [error, title]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4 text-ink">
      <div className="za-card za-card--raised max-w-md p-8 text-center">
        <h1 className="mb-2 text-xl font-bold text-ink">{title}</h1>
        <p className="mb-6 text-sm text-ink-muted">{message}</p>
        <div className={`flex justify-center ${buttonGapClass}`}>
          <button type="button" className="za-button za-button--primary" onClick={() => reset()}>
            Try Again
          </button>
          <Link href="/" className="za-button za-button--secondary">
            {homeLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}

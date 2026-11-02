'use client';

import { useEffect, useRef } from 'react';
import ErrorFallback from '@/components/ui/ErrorFallback';
import { isNavigationAbortError } from '@/components/navigation/AuthNavLink';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const retriedRef = useRef(false);

  useEffect(() => {
    if (!retriedRef.current && isNavigationAbortError(error)) {
      retriedRef.current = true;
      reset();
    }
  }, [error, reset]);

  return (
    <ErrorFallback
      title="The archive was interrupted"
      message="The catalogue could not complete this request. Try again or return to the archive."
      error={error}
      reset={reset}
    />
  );
}

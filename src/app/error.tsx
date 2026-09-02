'use client';

import ErrorFallback from '@/components/ui/ErrorFallback';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorFallback
      title="The archive was interrupted"
      message="The catalogue could not complete this request. Try again or return to the archive."
      error={error}
      reset={reset}
    />
  );
}

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
      title="Something went wrong"
      message="An unexpected error occurred while loading this page."
      error={error}
      reset={reset}
    />
  );
}

'use client';

import ErrorFallback from '@/components/ui/ErrorFallback';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorFallback
      title="The catalogue desk is unavailable"
      message="Your archive could not be loaded. Try again or return to the archive."
      error={error}
      reset={reset}
      buttonGapClass="gap-3"
    />
  );
}

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
      title="Failed to load dashboard"
      message="An error occurred while loading your archive. You can retry or return home."
      error={error}
      reset={reset}
      buttonGapClass="gap-3"
    />
  );
}

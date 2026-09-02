'use client';

import ErrorFallback from '@/components/ui/ErrorFallback';

export default function ProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorFallback
      title="Failed to load profile"
      message="An error occurred while loading this archive profile."
      error={error}
      reset={reset}
      homeLabel="Return Home"
      buttonGapClass="gap-3"
    />
  );
}

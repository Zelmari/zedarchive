interface AuthCardSkeletonProps {
  label?: string;
}

export function AuthCardSkeleton({ label = 'Loading sign in' }: AuthCardSkeletonProps) {
  return (
    <section
      role="status"
      aria-busy="true"
      aria-label={label}
      className="za-bookplate relative grid gap-6 p-6 sm:p-8"
    >
      <span className="za-ribbon-bookmark" aria-hidden="true" />

      {/* Header skeleton */}
      <div className="grid gap-2">
        <div className="h-7 w-36 animate-pulse rounded-small bg-surface-subtle" />
        <div className="h-4 w-64 max-w-full animate-pulse rounded-small bg-surface-sunken" />
      </div>

      {/* Form fields skeleton */}
      <div className="grid gap-5">
        <div className="grid gap-1">
          <div className="h-4 w-16 animate-pulse rounded-small bg-surface-subtle" />
          <div className="h-10 w-full animate-pulse rounded-control bg-surface-sunken" />
        </div>

        <div className="grid gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <div className="h-4 w-20 animate-pulse rounded-small bg-surface-subtle" />
            <div className="h-4 w-28 animate-pulse rounded-small bg-surface-sunken" />
          </div>
          <div className="h-10 w-full animate-pulse rounded-control bg-surface-sunken" />
        </div>

        <div className="h-10 w-full animate-pulse rounded-control bg-surface-subtle" />
      </div>

      {/* Footer skeleton */}
      <div className="border-t border-decorative pt-4">
        <div className="h-4 w-48 animate-pulse rounded-small bg-surface-subtle" />
      </div>
    </section>
  );
}

export default AuthCardSkeleton;

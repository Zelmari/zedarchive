import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

interface ArchiveUnavailableProps {
  ctaLabel: string;
  ctaClassName?: string;
}

export default function ArchiveUnavailable({
  ctaLabel,
  ctaClassName = '',
}: ArchiveUnavailableProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas text-ink">
      <div
        aria-labelledby="archive-unavailable-title"
        className="za-bookplate relative col-span-full flex w-full max-w-[28rem] flex-col items-center justify-center px-[var(--za-space-6)] py-[var(--za-space-12)] text-center"
      >
        <span className="za-ribbon-bookmark" aria-hidden="true" />
        <ShieldAlert
          aria-hidden="true"
          className="mb-[var(--za-space-3)] text-danger"
          size={36}
          strokeWidth={1.6}
        />
        <h1
          id="archive-unavailable-title"
          className="mb-[var(--za-space-1)] font-[var(--za-font-display)] text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] uppercase tracking-[0.04em] text-ink"
        >
          Archive Unavailable
        </h1>
        <p className="mb-[var(--za-space-6)] max-w-[var(--za-measure-readable)] font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] leading-[var(--za-leading-body)] text-ink-muted">
          This archive is private, missing from the catalogue, or no longer available.
        </p>
        <Link href="/" className={`za-button za-button--primary ${ctaClassName}`.trim()}>
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}

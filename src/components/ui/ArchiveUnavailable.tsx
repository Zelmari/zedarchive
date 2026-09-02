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
        className="za-card col-span-full flex flex-col items-center justify-center rounded-control border border-dashed border-required px-[var(--za-space-6)] py-[var(--za-space-12)] text-center [box-shadow:none]"
        style={{ maxWidth: '28rem', textAlign: 'center' }}
      >
        <ShieldAlert
          size={36}
          style={{ margin: '0 auto var(--za-space-3)', color: 'var(--za-color-text-muted)' }}
        />
        <h1 className="mb-[var(--za-space-1)] text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] text-ink">
          Archive Unavailable
        </h1>
        <p className="mb-[var(--za-space-6)] max-w-[var(--za-measure-readable)] text-[length:var(--za-text-supporting)] leading-[var(--za-leading-body)] text-ink-muted">
          This archive is either private or does not exist.
        </p>
        <Link href="/" className={`za-button za-button--primary ${ctaClassName}`.trim()}>
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}

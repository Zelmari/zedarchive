import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface EmptyLedgerProps {
  icon?: ReactNode;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  className?: string;
}

export default function EmptyLedger({
  icon,
  title,
  description,
  action,
  className,
}: EmptyLedgerProps) {
  return (
    <div
      className={cn(
        'za-bookplate relative flex flex-col items-center justify-center px-[var(--za-space-6)] py-[var(--za-space-12)] text-center',
        className,
      )}
    >
      <span className="za-ribbon-bookmark" aria-hidden="true" />
      {icon && <div className="mb-[var(--za-space-3)] text-accent">{icon}</div>}
      <h2 className="mb-[var(--za-space-1)] font-[var(--za-font-display)] text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] uppercase tracking-[0.04em] text-ink">
        {title}
      </h2>
      <p className="max-w-[var(--za-measure-readable)] font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] leading-[var(--za-leading-body)] text-ink-muted">
        {description}
      </p>
      {action && <div className="mt-[var(--za-space-6)]">{action}</div>}
    </div>
  );
}

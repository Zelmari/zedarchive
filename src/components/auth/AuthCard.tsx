import type { ReactNode } from 'react';

interface AuthCardProps {
  title: string;
  subtitle: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

export function AuthCard({ title, subtitle, footer, children }: AuthCardProps) {
  return (
    <section className="za-card za-card--raised grid gap-6">
      <header className="grid gap-2">
        <h1 className="text-[length:var(--za-text-heading-lg)] font-[var(--za-weight-heading)] leading-[var(--za-leading-compact)] text-ink">
          {title}
        </h1>
        <p className="text-[length:var(--za-text-supporting)] text-ink-muted">{subtitle}</p>
      </header>

      {children}

      {footer && (
        <div className="border-t border-decorative pt-4 text-[length:var(--za-text-supporting)] text-ink-muted">
          {footer}
        </div>
      )}
    </section>
  );
}

interface AuthFieldProps {
  label: string;
  htmlFor: string;
  labelAction?: ReactNode;
  children: ReactNode;
}

export function AuthField({ label, htmlFor, labelAction, children }: AuthFieldProps) {
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <label
          htmlFor={htmlFor}
          className="text-[length:var(--za-text-supporting)] font-[var(--za-weight-emphasis)] text-ink"
        >
          {label}
        </label>
        {labelAction}
      </div>
      {children}
    </div>
  );
}

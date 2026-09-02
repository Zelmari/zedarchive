import type { ReactNode } from 'react';

interface AuthCardProps {
  title: string;
  subtitle: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

export function AuthCard({ title, subtitle, footer, children }: AuthCardProps) {
  return (
    <section
      aria-labelledby="auth-card-title"
      className="za-bookplate relative grid gap-6 p-6 sm:p-8"
    >
      <span className="za-ribbon-bookmark" aria-hidden="true" />
      <header className="grid gap-2">
        <h1
          id="auth-card-title"
          className="font-[var(--za-font-display)] text-[length:var(--za-text-heading-lg)] font-[var(--za-weight-heading)] uppercase leading-[var(--za-leading-compact)] tracking-[0.04em] text-ink"
        >
          {title}
        </h1>
        <p className="font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] italic leading-[var(--za-leading-body)] text-ink-muted">
          {subtitle}
        </p>
      </header>

      {children}

      {footer && (
        <div className="border-t border-decorative pt-4 font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] text-ink-muted">
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

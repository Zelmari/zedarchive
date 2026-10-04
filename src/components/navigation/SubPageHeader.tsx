import React from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import BackButton from './BackButton';
import BrandWordmark from './BrandWordmark';

interface NavActionItem {
  label: string;
  href: string;
  icon?: LucideIcon;
  variant?: 'primary' | 'secondary' | 'tertiary';
  active?: boolean;
  title?: string;
}

interface SubPageHeaderProps {
  backLink?: {
    href: string;
    label: string;
  };
  navItems?: NavActionItem[];
  actions?: React.ReactNode;
  variant?: 'standard' | 'sticky';
  children?: React.ReactNode;
}

export default function SubPageHeader({
  backLink,
  navItems,
  actions,
  variant = 'standard',
  children,
}: SubPageHeaderProps) {
  const isSticky = variant === 'sticky';
  const headerClass = isSticky ? 'za-site-header za-site-header--sticky' : 'za-site-header';
  const innerClass = 'za-container za-container--wide za-site-header__inner';
  const leadingClass = 'flex min-w-0 flex-1 flex-wrap items-center gap-3';
  const navigationClass = 'za-site-header__nav';

  return (
    <header className={headerClass}>
      <div className={innerClass}>
        <div className={leadingClass}>
          <BrandWordmark href="/" className={isSticky ? 'max-sm:hidden' : ''} />

          {backLink && <BackButton href={backLink.href} label={backLink.label} />}

          {children ? (
            <div className="min-w-0 flex-1 basis-full sm:basis-auto">{children}</div>
          ) : null}
        </div>

        <nav aria-label={isSticky ? 'Secondary' : 'Navigation'} className={navigationClass}>
          {navItems && navItems.length > 0 && (
            <>
              {navItems.map((item) => {
                const Icon = item.icon;
                const buttonVariantClass =
                  item.variant === 'primary'
                    ? 'za-button--primary'
                    : item.variant === 'secondary'
                      ? 'za-button--secondary'
                      : 'za-button--tertiary';

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`za-button ${buttonVariantClass} ${item.active ? 'za-button--selected za-current-page' : ''}`}
                    title={item.title || item.label}
                    aria-label={item.label}
                  >
                    {Icon && <Icon size={16} strokeWidth={1.75} />}
                    <span className="hidden sm:inline">{item.label}</span>
                  </Link>
                );
              })}
            </>
          )}

          {actions}
        </nav>
      </div>
    </header>
  );
}

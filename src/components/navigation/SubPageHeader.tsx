import React from 'react';
import Link from 'next/link';
import { ArrowLeft, LucideIcon } from 'lucide-react';
import BrandWordmark from './BrandWordmark';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface NavActionItem {
  label: string;
  href: string;
  icon?: LucideIcon;
  variant?: 'primary' | 'secondary' | 'tertiary';
  active?: boolean;
  title?: string;
}

export interface SubPageHeaderProps {
  brandHref?: string;
  breadcrumbs?: BreadcrumbItem[];
  backLink?: {
    href: string;
    label: string;
  };
  navItems?: NavActionItem[];
  actions?: React.ReactNode;
  variant?: 'standard' | 'sticky';
  containerWidth?: 'narrow' | 'wide' | '4xl' | '5xl' | 'full';
  children?: React.ReactNode;
}

export default function SubPageHeader({
  brandHref = '/',
  breadcrumbs,
  backLink,
  navItems,
  actions,
  variant = 'standard',
  containerWidth = 'wide',
  children,
}: SubPageHeaderProps) {
  const getContainerClass = () => {
    switch (containerWidth) {
      case 'narrow':
        return 'za-container za-container--narrow';
      case '4xl':
        return 'za-container max-w-4xl';
      case '5xl':
        return 'za-container max-w-5xl';
      case 'full':
        return 'za-container w-full';
      case 'wide':
      default:
        return 'za-container za-container--wide';
    }
  };

  const isSticky = variant === 'sticky';
  const headerClass = isSticky
    ? 'sticky top-0 z-30 border-b border-required bg-surface shadow-raised'
    : 'za-site-header';
  const innerClass = isSticky
    ? `${getContainerClass()} flex h-14 items-center justify-between gap-4`
    : `${getContainerClass()} za-site-header__inner`;
  const leadingClass = isSticky
    ? 'flex items-center gap-3 min-w-0'
    : 'flex flex-wrap items-center gap-3 min-w-0';
  const backClass = `za-button za-button--secondary p-2 text-xs font-[var(--za-weight-heading)]${
    isSticky ? ' shrink-0' : ''
  }`;
  const breadcrumbClass = `flex items-center gap-1.5 text-xs text-ink-muted min-w-0 overflow-hidden${
    isSticky ? ' shrink' : ''
  }`;
  const navigationClass = isSticky ? 'flex items-center gap-2 shrink-0' : 'za-site-header__nav';

  return (
    <header className={headerClass}>
      <div className={innerClass}>
        <div className={leadingClass}>
          <BrandWordmark href={brandHref} />

          {backLink && (
            <Link href={backLink.href} className={backClass} title={backLink.label}>
              <ArrowLeft size={14} className="mr-1" />
              <span>{backLink.label}</span>
            </Link>
          )}

          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav aria-label="Breadcrumb" className={breadcrumbClass}>
              {breadcrumbs.map((item, index) => (
                <React.Fragment key={index}>
                  <span className="text-decorative select-none">/</span>
                  {item.href ? (
                    <Link href={item.href} className="truncate hover:text-ink transition-colors">
                      {item.label}
                    </Link>
                  ) : (
                    <span className="truncate text-ink font-medium" aria-current="page">
                      {item.label}
                    </span>
                  )}
                </React.Fragment>
              ))}
            </nav>
          )}

          {children}
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

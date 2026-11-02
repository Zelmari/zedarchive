'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useTransition } from 'react';
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export function isPlainLeftClick(event: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented?: boolean;
}): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

export function isNavigationAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const candidate = error as { name?: unknown; message?: unknown };
  if (candidate.name === 'AbortError') {
    return true;
  }
  if (typeof candidate.message === 'string') {
    return /\b(?:aborted|AbortError|fetchServerResponse)\b|The operation was aborted/i.test(
      candidate.message,
    );
  }
  return false;
}

export interface AuthNavLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string;
  children: ReactNode;
  className?: string;
}

export function AuthNavLink({
  href,
  children,
  className = '',
  onClick,
  ...rest
}: AuthNavLinkProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    try {
      router.prefetch(href);
    } catch {
      // Router prefetch can fail in test or unsupported environments
    }
  }, [router, href]);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (onClick) {
      onClick(event);
    }

    if (!isPlainLeftClick(event)) {
      return;
    }

    event.preventDefault();

    if (isPending) {
      return;
    }

    startTransition(() => {
      router.push(href);
    });
  };

  const combinedClassName = isPending
    ? className
      ? `${className} opacity-75`
      : 'opacity-75'
    : className;

  return (
    <Link
      href={href}
      prefetch={true}
      onClick={handleClick}
      aria-busy={isPending ? 'true' : undefined}
      data-pending={isPending ? 'true' : undefined}
      className={combinedClassName}
      {...rest}
    >
      {isPending && <Loader2 size={14} aria-hidden="true" className="za-spin shrink-0" />}
      {children}
    </Link>
  );
}

export default AuthNavLink;

'use client'

import Link, { type LinkProps } from 'next/link'
import { usePathname } from 'next/navigation'
import type { AnchorHTMLAttributes } from 'react'

type CurrentPageLinkProps = LinkProps &
  Omit<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    'aria-current' | 'className' | 'href'
  > & {
    className?: string
  }

export function isExactCurrentPage(pathname: string, href: string) {
  return pathname === href
}

export function CurrentPageLink({
  className,
  href,
  ...props
}: CurrentPageLinkProps) {
  const pathname = usePathname()
  const stringHref = typeof href === 'string' ? href : href.pathname
  const isCurrent =
    typeof stringHref === 'string' && isExactCurrentPage(pathname, stringHref)

  return (
    <Link
      {...props}
      aria-current={isCurrent ? 'page' : undefined}
      className={[className, isCurrent ? 'za-current-page' : undefined]
        .filter(Boolean)
        .join(' ')}
      href={href}
    />
  )
}

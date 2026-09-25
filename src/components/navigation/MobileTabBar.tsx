'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Layers, Users, MessageSquare, Library, Sparkles } from 'lucide-react';

const TABS = [
  { href: '/dashboard', label: 'Archive', icon: Layers },
  { href: '/friends', label: 'Friends', icon: Users },
  { href: '/groups', label: 'Groups', icon: MessageSquare },
  { href: '/stacks', label: 'Stacks', icon: Library },
  { href: '/wrapped', label: 'Wrapped', icon: Sparkles },
] as const;

const HIDDEN_ON = ['/login', '/signup', '/reset-password', '/verified', '/offline'];

export default function MobileTabBar() {
  const pathname = usePathname() || '/';
  if (pathname === '/' || HIDDEN_ON.some((p) => pathname.startsWith(p))) return null;

  return (
    <>
      <div aria-hidden="true" className="za-tab-bar-spacer" />
      <nav aria-label="Sections" className="za-tab-bar">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`za-tab-bar__item${active ? ' za-tab-bar__item--active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

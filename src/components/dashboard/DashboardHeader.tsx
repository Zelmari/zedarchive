'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Layers, Tv, BookOpen, Keyboard, LogOut, Palette, Settings } from 'lucide-react';
import type { DashboardTab } from './hooks';

interface DashboardHeaderProps {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  total: number;
  shows: number;
  books: number;
  userName: string;
  onOpenTheme: () => void;
  onOpenShortcuts: () => void;
  onSignOut: () => void;
  isSigningOut: boolean;
}

const TABS: Array<{ id: DashboardTab; icon: typeof Layers; label: string; title: string }> = [
  { id: 'total', icon: Layers, label: 'Total', title: 'Total Archive View (Press 1)' },
  { id: 'shows', icon: Tv, label: 'Shows', title: 'Shows & Anime View (Press 2)' },
  { id: 'books', icon: BookOpen, label: 'Books', title: 'Books & Manga View (Press 3)' },
];

export default function DashboardHeader({
  activeTab,
  onTabChange,
  total,
  shows,
  books,
  userName,
  onOpenTheme,
  onOpenShortcuts,
  onSignOut,
  isSigningOut,
}: DashboardHeaderProps) {
  const counts: Record<DashboardTab, number> = { total, shows, books };

  return (
    <header className="za-site-header">
      <div className="za-container za-container--wide za-site-header__inner">
        <Link href="/dashboard" className="za-wordmark za-link za-site-header__brand">
          <Image
            alt=""
            aria-hidden="true"
            className="za-wordmark__mark"
            height={34}
            src="/biglogo.png"
            width={34}
            unoptimized
          />
          <span className="za-wordmark__text">zedarchive</span>
        </Link>

        <nav aria-label="Primary" className="za-site-header__nav">
          {TABS.map(({ id, icon: Icon, label, title }) => (
            <button
              key={id}
              type="button"
              className={`za-button ${activeTab === id ? 'za-button--selected za-current-page' : 'za-button--secondary'}`}
              onClick={() => onTabChange(id)}
              title={title}
            >
              <Icon size={16} strokeWidth={1.75} />
              <span>
                {label} ({counts[id]})
              </span>
            </button>
          ))}
        </nav>

        <nav aria-label="Account" className="za-site-header__nav">
          <button
            type="button"
            className="za-button za-button--tertiary"
            onClick={onOpenTheme}
            title="Change Theme (Press T)"
            aria-label="Change Theme"
          >
            <Palette size={16} strokeWidth={1.75} />
            <span className="hidden sm:inline">Theme</span>
          </button>

          <button
            type="button"
            className="za-button za-button--tertiary"
            onClick={onOpenShortcuts}
            title="Keyboard shortcuts (Press ?)"
            aria-label="Keyboard shortcuts"
          >
            <Keyboard size={16} strokeWidth={1.75} />
            <span className="hidden sm:inline">Shortcuts</span>
          </button>

          <Link
            href="/settings"
            className="za-button za-button--tertiary"
            title="Account & Settings"
            aria-label="Settings"
          >
            <Settings size={16} strokeWidth={1.75} />
            <span className="hidden sm:inline">Settings</span>
          </Link>

          <span
            className="za-site-header__identity"
            style={{
              fontSize: 'var(--za-text-supporting)',
              fontWeight: 'var(--za-weight-heading)',
            }}
          >
            @{userName.toLowerCase().replace(/\s+/g, '') || 'user'}
          </span>

          <button
            type="button"
            className="za-button za-button--secondary"
            onClick={onSignOut}
            disabled={isSigningOut}
            title="Sign Out"
            aria-label="Sign Out"
          >
            <LogOut size={15} strokeWidth={1.75} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </nav>
      </div>
    </header>
  );
}

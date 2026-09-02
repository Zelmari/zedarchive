'use client';

import Link from 'next/link';
import {
  Layers,
  Tv,
  Film,
  BookOpen,
  LogOut,
  Palette,
  Settings,
  Users,
  MessageSquare,
} from 'lucide-react';
import SyncIndicator from '@/components/ui/SyncIndicator';
import BrandWordmark from '@/components/navigation/BrandWordmark';
import type { DashboardTab } from '@/hooks/use-media-filters';

interface DashboardHeaderProps {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  total: number;
  shows: number;
  movies: number;
  books: number;
  userName: string;
  username?: string | null;
  onOpenTheme: () => void;
  onSignOut: () => void;
  isSigningOut: boolean;
}

const TABS: Array<{ id: DashboardTab; icon: typeof Layers; label: string; title: string }> = [
  { id: 'total', icon: Layers, label: 'Total', title: 'Total Archive View' },
  { id: 'shows', icon: Tv, label: 'Shows', title: 'Shows & Anime View' },
  { id: 'movies', icon: Film, label: 'Movies', title: 'Movies & Films View' },
  { id: 'books', icon: BookOpen, label: 'Books', title: 'Books & Manga View' },
];

export default function DashboardHeader({
  activeTab,
  onTabChange,
  total,
  shows,
  movies,
  books,
  userName,
  username,
  onOpenTheme,
  onSignOut,
  isSigningOut,
}: DashboardHeaderProps) {
  const counts: Record<DashboardTab, number> = { total, shows, movies, books };

  return (
    <header className="za-site-header">
      <div className="za-container za-container--wide za-site-header__inner">
        <BrandWordmark />

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
          <Link href="/friends" className="za-button za-button--tertiary" title="Friends">
            <Users size={16} strokeWidth={1.75} />
            <span className="hidden sm:inline">Friends</span>
          </Link>
          <Link href="/groups" className="za-button za-button--tertiary" title="Groups">
            <MessageSquare size={16} strokeWidth={1.75} />
            <span className="hidden sm:inline">Groups</span>
          </Link>
        </nav>

        <nav aria-label="Account" className="za-site-header__nav">
          <SyncIndicator />
          <button
            type="button"
            className="za-button za-button--tertiary"
            onClick={onOpenTheme}
            title="Change Theme"
            aria-label="Change Theme"
          >
            <Palette size={16} strokeWidth={1.75} />
            <span className="hidden sm:inline">Theme</span>
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
            {username ? `@${username}` : userName || 'user'}
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

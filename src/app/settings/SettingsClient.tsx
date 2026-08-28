'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { UserProfile } from '@/types/user';
import ProfileSection from './components/ProfileSection';
import ThemeSection from './components/ThemeSection';
import SecuritySection from './components/SecuritySection';
import DangerSection from './components/DangerSection';

interface SettingsClientProps {
  profile: UserProfile;
}

export default function SettingsClient({ profile }: SettingsClientProps) {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-required bg-surface shadow-raised">
        <div className="za-container flex h-14 items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="za-button za-button--secondary p-2 text-xs font-[var(--za-weight-heading)]"
            >
              <ArrowLeft size={14} className="mr-1" />
              <span>Dashboard</span>
            </Link>
            <h1 className="text-base font-[var(--za-weight-heading)] tracking-[-0.02em] text-ink">
              Settings & Account
            </h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" className="pb-16 pt-8">
        <div className="za-container max-w-[42rem] space-y-8">
          <ProfileSection profile={profile} />
          <ThemeSection initialTheme={profile.theme} />
          <SecuritySection profile={profile} />
          <DangerSection email={profile.email} />
        </div>
      </main>
    </div>
  );
}

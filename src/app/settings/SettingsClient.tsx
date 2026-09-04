'use client';

import type { UserProfile } from '@/types/user';
import SubPageHeader from '@/components/navigation/SubPageHeader';
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
      <SubPageHeader variant="sticky" backLink={{ href: '/dashboard', label: 'Dashboard' }}>
        <h1 className="min-w-0 font-[var(--za-font-display)] text-base font-[var(--za-weight-heading)] uppercase leading-[var(--za-leading-compact)] tracking-[0.06em] text-ink [overflow-wrap:anywhere]">
          Settings & Account
        </h1>
      </SubPageHeader>

      {/* Main Content */}
      <main id="main-content" className="pb-16 pt-8 sm:pt-10">
        <div className="za-container max-w-[var(--za-content-medium)] space-y-6 sm:space-y-8">
          <ProfileSection profile={profile} />
          <ThemeSection initialTheme={profile.theme} customTheme={profile.customTheme} />
          <SecuritySection profile={profile} />
          <DangerSection email={profile.email} />
        </div>
      </main>
    </div>
  );
}

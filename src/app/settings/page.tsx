import { redirect } from 'next/navigation';
import { getUserProfileById } from '@/server/queries/user';
import { requireSession } from '@/server/internal';
import SettingsClient from './SettingsClient';
import type { UserProfile } from '@/types/user';

export const metadata = {
  title: 'Settings & Account',
  description: 'Manage your ZedArchive account, preferences, profile, and security.',
};

export default async function SettingsPage() {
  const session = await requireSession();

  const profile = await getUserProfileById(session.id);

  if (!profile) {
    redirect('/login');
  }

  const userProfile: UserProfile = {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    image: profile.image || null,
    theme: profile.theme,
    username: profile.username,
    isPublic: profile.isPublic,
    bio: profile.bio,
    countryCode: profile.countryCode || 'US',
    emailVerified: profile.emailVerified,
    verificationDismissedAt: profile.verificationDismissedAt || null,
  };

  return <SettingsClient profile={userProfile} />;
}

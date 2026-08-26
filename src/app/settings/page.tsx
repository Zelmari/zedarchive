import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getUserProfile } from '@/server/profile';
import { getAccountAuthType } from '@/server/account';
import SettingsClient from './SettingsClient';
import type { UserProfile } from '@/types/user';

export const metadata = {
  title: 'Settings & Account — zedarchive',
  description: 'Manage your ZedArchive account, preferences, profile, and security.',
};

export default async function SettingsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    redirect('/login');
  }

  const profile = await getUserProfile();
  const authInfo = await getAccountAuthType();

  if (!profile) {
    redirect('/login');
  }

  const userProfile: UserProfile = {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    image: null,
    theme: profile.theme,
    username: profile.username,
    isPublic: profile.isPublic,
    bio: profile.bio,
    emailVerified: profile.emailVerified,
    verificationDismissedAt: profile.verificationDismissedAt
      ? profile.verificationDismissedAt.toISOString()
      : null,
  };

  return <SettingsClient profile={userProfile} authInfo={authInfo} />;
}

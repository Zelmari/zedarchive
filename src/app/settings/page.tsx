import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getUserProfileById } from '@/server/queries/user';
import SettingsClient from './SettingsClient';
import type { UserProfile } from '@/types/user';

export const metadata = {
  title: 'Settings & Account',
  description: 'Manage your ZedArchive account, preferences, profile, and security.',
};

export default async function SettingsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    redirect('/login');
  }

  const profile = await getUserProfileById(session.user.id);

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
    verificationDismissedAt: profile.verificationDismissedAt || null,
  };

  return <SettingsClient profile={userProfile} />;
}

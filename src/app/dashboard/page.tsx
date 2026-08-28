import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { getUserProfileById } from '@/server/queries/user';
import { getMediaEntriesByUserId } from '@/server/queries/media';
import DashboardClient from './DashboardClient';

export const metadata = {
  title: 'Dashboard',
  description: 'Your quiet media collection.',
};

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect('/login');
  }

  // Fetch user profile and initial media entries via DAL queries
  const dbUser = await getUserProfileById(session.user.id);
  const initialEntries = await getMediaEntriesByUserId(session.user.id);

  return (
    <DashboardClient
      user={{
        id: session.user.id,
        name: dbUser?.name || session.user.name,
        email: dbUser?.email || session.user.email,
        image: dbUser?.image || session.user.image,
        theme: dbUser?.theme || 'parchment',
        username: dbUser?.username || null,
        isPublic: Boolean(dbUser?.isPublic),
        bio: dbUser?.bio || null,
        emailVerified:
          dbUser?.emailVerified ??
          ('emailVerified' in session.user ? Boolean(session.user.emailVerified) : false),
        verificationDismissedAt: dbUser?.verificationDismissedAt || null,
      }}
      initialEntries={initialEntries}
    />
  );
}

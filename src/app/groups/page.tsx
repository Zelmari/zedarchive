import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { getUserGroups } from '@/server/queries/groups';
import { getAcceptedFriends } from '@/server/queries/friends';
import { Layers, Users } from 'lucide-react';
import SubPageHeader from '@/components/navigation/SubPageHeader';
import GroupsClient from './GroupsClient';

export const metadata = {
  title: 'Groups — zedarchive',
  description: 'Collaborate in group chats and shared archives.',
};

export default async function GroupsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) redirect('/login');

  const [groups, friends] = await Promise.all([
    getUserGroups(session.user.id),
    getAcceptedFriends(session.user.id),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <SubPageHeader
        navItems={[
          { label: 'Dashboard', href: '/dashboard', icon: Layers },
          { label: 'Friends', href: '/friends', icon: Users },
        ]}
      />
      <main id="main-content" className="flex-1 py-8">
        <div className="za-container max-w-5xl">
          <div className="mb-6">
            <h1 className="text-2xl font-[var(--za-weight-heading)] text-ink">Groups</h1>
            <p className="mt-1 text-sm text-ink-muted">
              Create group chats with 7-day ephemeral messages and shared archives.
            </p>
          </div>
          <GroupsClient initialGroups={groups} friends={friends.map((f) => f.friend)} />
        </div>
      </main>
    </div>
  );
}

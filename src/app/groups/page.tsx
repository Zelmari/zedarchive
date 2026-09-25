import { getUserGroups } from '@/server/queries/groups';
import { getAcceptedFriends } from '@/server/queries/friends';
import { requireSession } from '@/server/internal';
import { Layers, Users } from 'lucide-react';
import SubPageHeader from '@/components/navigation/SubPageHeader';
import PageIntro from '@/components/ui/PageIntro';
import GroupsClient from './GroupsClient';

export const metadata = {
  title: 'Groups — zedarchive',
  description: 'Collaborate in group chats and shared archives.',
};

export default async function GroupsPage() {
  const session = await requireSession();

  const [groups, friends] = await Promise.all([
    getUserGroups(session.id),
    getAcceptedFriends(session.id),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <SubPageHeader
        backLink={{ href: '/dashboard', label: 'Dashboard' }}
        navItems={[
          { label: 'Dashboard', href: '/dashboard', icon: Layers },
          { label: 'Friends', href: '/friends', icon: Users },
        ]}
      />
      <main id="main-content" className="flex-1 py-[var(--za-space-8)]">
        <div className="za-container max-w-5xl">
          <PageIntro
            kicker="Shared shelves"
            title="Groups"
            description="Assemble a small reading room for shared archives, brief notes, and conversations that know when to disappear."
            meta={`${groups.length} groups · ${friends.length} eligible companions`}
          />
          <GroupsClient initialGroups={groups} friends={friends.map((f) => f.friend)} />
        </div>
      </main>
    </div>
  );
}
